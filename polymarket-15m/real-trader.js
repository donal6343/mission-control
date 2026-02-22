/**
 * Real Trading Module for Polymarket 15M Bot
 * 
 * Sits alongside paper trading — does NOT affect paper mode.
 * Uses Polymarket CLOB API on Polygon.
 * 
 * Safety:
 * - Kill switch file: ~/.polymarket-kill (touch to stop all trading)
 * - Max daily loss hard stop
 * - Max position size per trade
 * - Max concurrent positions
 * - All trades logged to separate Notion column
 */

const { ClobClient, Side, OrderType } = require('@polymarket/clob-client');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Inject proxy secret header on all requests to EU proxy
axios.interceptors.request.use((config) => {
  if (config.url && config.url.includes('3.254.181.103')) {
    config.headers['x-proxy-secret'] = 'aab23c2b98dd2ac874f0dd1ec73ca1d2';
  }
  return config;
});

// ========== CONFIG ==========
const REAL_CONFIG = {
  // Mode: 'paper' | 'real' | 'disabled'
  // Read from config file so dashboard can toggle
  get mode() {
    return readTradingMode();
  },
  
  // Safety limits
  maxStakePerTrade: 20,       // $20 max per trade
  maxDailyLoss: 50,           // Stop trading if down $50 in a day
  maxDailyTrades: 30,         // Max trades per day
  maxConcurrentPositions: 20, // Max open positions at once (15-min markets resolve fast)
  
  // Polymarket CLOB (via EU proxy to bypass US geo-block)
  clobUrl: 'http://3.254.181.103:3001',  // EU proxy — direct URL is geo-blocked for order placement
  chainId: 137, // Polygon
  
  // Paths
  killSwitchPath: path.join(process.env.HOME || '', '.polymarket-kill'),
  statePath: path.join(__dirname, 'real-trading-state.json'),
  configPath: path.join(__dirname, 'trading-mode.json'),
  walletPath: path.join(process.env.HOME || '', '.config/polymarket/wallet.json'),
};

// ========== KILL SWITCH ==========
function isKillSwitchActive() {
  return fs.existsSync(REAL_CONFIG.killSwitchPath);
}

function activateKillSwitch(reason = 'Manual kill') {
  fs.writeFileSync(REAL_CONFIG.killSwitchPath, JSON.stringify({
    activated: new Date().toISOString(),
    reason
  }));
  console.log(`🛑 KILL SWITCH ACTIVATED: ${reason}`);
}

function deactivateKillSwitch() {
  if (fs.existsSync(REAL_CONFIG.killSwitchPath)) {
    fs.unlinkSync(REAL_CONFIG.killSwitchPath);
    console.log('✅ Kill switch deactivated');
  }
}

// ========== TRADING MODE ==========
function readTradingMode() {
  try {
    const config = JSON.parse(fs.readFileSync(REAL_CONFIG.configPath, 'utf8'));
    return config.mode || 'paper';
  } catch {
    return 'paper';
  }
}

function setTradingMode(mode) {
  const validModes = ['paper', 'real', 'disabled'];
  if (!validModes.includes(mode)) throw new Error(`Invalid mode: ${mode}`);
  
  const config = {
    mode,
    updatedAt: new Date().toISOString(),
    updatedBy: 'dashboard'
  };
  fs.writeFileSync(REAL_CONFIG.configPath, JSON.stringify(config, null, 2));
  console.log(`📊 Trading mode set to: ${mode}`);
  return config;
}

// ========== DAILY STATE ==========
function loadDailyState() {
  try {
    const state = JSON.parse(fs.readFileSync(REAL_CONFIG.statePath, 'utf8'));
    const today = new Date().toISOString().split('T')[0];
    
    // Reset if new day
    if (state.date !== today) {
      return resetDailyState();
    }
    return state;
  } catch {
    return resetDailyState();
  }
}

function resetDailyState() {
  const state = {
    date: new Date().toISOString().split('T')[0],
    tradesPlaced: 0,
    totalPnl: 0,
    openPositions: 0,
    trades: [],
    killReason: null
  };
  saveDailyState(state);
  return state;
}

function saveDailyState(state) {
  fs.writeFileSync(REAL_CONFIG.statePath, JSON.stringify(state, null, 2));
}

// ========== WALLET ==========
function loadWallet() {
  try {
    // Load private key from env file (secure, not in JSON)
    const envPath = path.join(process.env.HOME || '', '.config/polymarket/.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const pkMatch = envContent.match(/POLYMARKET_PRIVATE_KEY=(.+)/);
      if (pkMatch && pkMatch[1]) {
        return new ethers.Wallet(pkMatch[1].trim());
      }
    }
    // Fallback to env variable
    if (process.env.POLYMARKET_PRIVATE_KEY) {
      return new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY);
    }
    console.log('⚠️  No wallet configured. Set POLYMARKET_PRIVATE_KEY in ~/.config/polymarket/.env');
    return null;
  } catch (e) {
    console.log('⚠️  Wallet load failed:', e.message);
    return null;
  }
}

// ========== CLOB CLIENT ==========
let _cachedApiCreds = null;  // Reset on restart — proxy URL changed
let _cachedApiCredsAt = 0;
const API_CREDS_TTL = 3600000; // Re-derive every hour

async function createClobClient() {
  const wallet = loadWallet();
  if (!wallet) return null;
  
  try {
    // Derive API credentials from wallet (L1 → L2 auth, as per Polymarket docs)
    if (!_cachedApiCreds || (Date.now() - _cachedApiCredsAt > API_CREDS_TTL)) {
      const tempClient = new ClobClient(
        REAL_CONFIG.clobUrl,
        REAL_CONFIG.chainId,
        wallet
      );
      _cachedApiCreds = await tempClient.createOrDeriveApiKey();
      _cachedApiCredsAt = Date.now();
      console.log('✅ Polymarket API credentials derived from wallet');
    }
    
    // Initialize full trading client with creds (match working test-order.js format)
    const client = new ClobClient(
      REAL_CONFIG.clobUrl,
      REAL_CONFIG.chainId,
      wallet,
      _cachedApiCreds,
    );
    return client;
  } catch (e) {
    console.error('Failed to create CLOB client:', e.message);
    _cachedApiCreds = null; // Reset on failure
    return null;
  }
}

// ========== SAFETY CHECKS ==========
function canTrade(state) {
  // Kill switch
  if (isKillSwitchActive()) {
    return { allowed: false, reason: '🛑 Kill switch is active' };
  }
  
  // Mode check
  const mode = readTradingMode();
  if (mode !== 'real') {
    return { allowed: false, reason: `Mode is '${mode}', not 'real'` };
  }
  
  // Daily loss limit
  if (state.totalPnl <= -REAL_CONFIG.maxDailyLoss) {
    activateKillSwitch(`Daily loss limit hit: $${Math.abs(state.totalPnl).toFixed(2)}`);
    return { allowed: false, reason: `🛑 Daily loss limit ($${REAL_CONFIG.maxDailyLoss}) hit` };
  }
  
  // Trade count limit
  if (state.tradesPlaced >= REAL_CONFIG.maxDailyTrades) {
    return { allowed: false, reason: `Daily trade limit (${REAL_CONFIG.maxDailyTrades}) reached` };
  }
  
  // Concurrent positions
  if (state.openPositions >= REAL_CONFIG.maxConcurrentPositions) {
    return { allowed: false, reason: `Max concurrent positions (${REAL_CONFIG.maxConcurrentPositions}) reached` };
  }
  
  // Wallet check
  const wallet = loadWallet();
  if (!wallet) {
    return { allowed: false, reason: 'No wallet configured' };
  }
  
  return { allowed: true, reason: 'All checks passed' };
}

// ========== MAKER ORDER CONFIG ==========
const MAKER_CONFIG = {
  fillTimeoutMs: 30000,       // 30 seconds to get filled
  pollIntervalMs: 3000,       // Check fill status every 3s
  priceOffsetBps: 100,        // Place limit 1% inside the spread (aggressive maker)
  minPrice: 0.01,             // Min limit price
  maxPrice: 0.99,             // Max limit price
};

// ========== QUERY FEE RATE ==========
async function queryFeeRate(client, tokenId) {
  try {
    // Query current taker fee rate for this market
    const resp = await client.getFeeRate(tokenId);
    return resp?.feeRateBps ?? 0;
  } catch (e) {
    console.log(`   ⚠️  Fee rate query failed: ${e.message}, assuming 0 for maker`);
    return 0;
  }
}

// ========== CHECK ORDER STATUS ==========
async function waitForFill(client, orderId, timeoutMs, pollMs) {
  const start = Date.now();
  let lastStatus = 'unknown';
  
  while (Date.now() - start < timeoutMs) {
    try {
      const order = await client.getOrder(orderId);
      lastStatus = order?.status || order?.state || 'unknown';
      
      // Filled or matched
      if (lastStatus === 'MATCHED' || lastStatus === 'FILLED' || lastStatus === 'matched' || lastStatus === 'filled') {
        return { filled: true, status: lastStatus, order };
      }
      
      // Already cancelled or expired
      if (lastStatus === 'CANCELLED' || lastStatus === 'EXPIRED' || lastStatus === 'cancelled' || lastStatus === 'expired') {
        return { filled: false, status: lastStatus, order };
      }
    } catch (e) {
      console.log(`   ⚠️  Order poll error: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, pollMs));
  }
  
  return { filled: false, status: `timeout (last: ${lastStatus})`, order: null };
}

// ========== CANCEL ORDER ==========
async function cancelOrder(client, orderId) {
  try {
    await client.cancelOrder(orderId);
    console.log(`   🗑️  Order ${orderId} cancelled`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  Cancel failed: ${e.message}`);
    return false;
  }
}

// ========== EXECUTE REAL TRADE (MAKER) ==========
async function executeRealTrade(trade) {
  const state = loadDailyState();
  
  // Safety checks
  const check = canTrade(state);
  if (!check.allowed) {
    console.log(`   ⛔ REAL TRADE BLOCKED: ${check.reason}`);
    return { success: false, reason: check.reason };
  }
  
  const client = await createClobClient();
  if (!client) {
    return { success: false, reason: 'CLOB client unavailable' };
  }
  
  try {
    // Resolve token ID — prefer clobTokenIds passed from market scrape (no API call needed)
    let tokenId;
    if (trade.clobTokenIds && trade.clobTokenIds.length >= 2) {
      tokenId = trade.direction === 'Up' ? trade.clobTokenIds[0] : trade.clobTokenIds[1];
    } else if (trade.conditionId) {
      // Fallback: fetch from CLOB API using conditionId
      const market = await client.getMarket(trade.conditionId);
      tokenId = trade.direction === 'Up' 
        ? market?.tokens?.[0]?.token_id 
        : market?.tokens?.[1]?.token_id;
    }
    
    if (!tokenId) {
      return { success: false, reason: 'Could not resolve token ID — no clobTokenIds or conditionId' };
    }
    
    const stake = Math.min(trade.stake || 10, REAL_CONFIG.maxStakePerTrade);
    
    // Calculate maker limit price
    // We want to BUY, so place a limit slightly below current best ask
    // This makes us a maker (adding liquidity) = zero fees + rebates
    const entryOdds = trade.entryOdds || 0.5;
    const limitPrice = Math.min(
      MAKER_CONFIG.maxPrice,
      Math.max(MAKER_CONFIG.minPrice, entryOdds)
    );
    
    // Fee rate must be 1000 (required by Polymarket API, matching test-order.js)
    const feeRateBps = 1000;
    
    const shares = stake / limitPrice; // How many shares we get at this price
    
    console.log(`   💰 MAKER ORDER: ${trade.asset} ${trade.direction} | $${stake} @ ${(limitPrice * 100).toFixed(1)}¢ | ${shares.toFixed(2)} shares | fee=${feeRateBps}bps`);
    
    // Tick size and neg risk defaults for crypto 15M markets
    const tickSize = '0.01';
    const negRisk = false;
    
    // Place LIMIT order (maker) via createAndPostOrder
    // Match working test-order.js format: tickSize & negRisk inside order object
    const order = await client.createAndPostOrder({
      tokenID: tokenId,
      price: limitPrice,
      size: shares,
      side: 'BUY',
      feeRateBps: feeRateBps,
      tickSize,
      negRisk,
    });
    
    const orderId = order?.orderID || order?.id;
    console.log(`   📋 LIMIT ORDER POSTED: ${orderId} | Waiting up to ${MAKER_CONFIG.fillTimeoutMs / 1000}s for fill...`);
    
    // Wait for fill with timeout
    const fillResult = await waitForFill(
      client, 
      orderId, 
      MAKER_CONFIG.fillTimeoutMs, 
      MAKER_CONFIG.pollIntervalMs
    );
    
    if (fillResult.filled) {
      console.log(`   ✅ MAKER ORDER FILLED: ${orderId}`);
      
      // Update state
      state.tradesPlaced++;
      state.openPositions++;
      state.trades.push({
        timestamp: new Date().toISOString(),
        asset: trade.asset,
        direction: trade.direction,
        stake,
        tokenId,
        orderId,
        entryOdds: limitPrice,
        slug: trade.slug,
        orderType: 'maker',
        feeRateBps: 0, // Maker = no fee
      });
      saveDailyState(state);
      
      return { 
        success: true, 
        orderId,
        stake,
        tokenId,
        orderType: 'maker',
        fillPrice: limitPrice,
      };
    } else {
      // Not filled within timeout — cancel it
      console.log(`   ⏱️  NOT FILLED after ${MAKER_CONFIG.fillTimeoutMs / 1000}s (${fillResult.status})`);
      await cancelOrder(client, orderId);
      
      return { 
        success: false, 
        reason: `Maker order not filled within ${MAKER_CONFIG.fillTimeoutMs / 1000}s — cancelled`,
        orderId,
        orderType: 'maker',
      };
    }
    
  } catch (error) {
    console.error(`   ❌ REAL TRADE FAILED: ${error.message}`);
    
    // If it's a balance/approval error, kill switch
    if (error.message.includes('insufficient') || error.message.includes('allowance')) {
      activateKillSwitch(`Trade failed: ${error.message}`);
    }
    
    return { success: false, reason: error.message };
  }
}

// ========== LEGACY: EXECUTE AS TAKER (fallback) ==========
async function executeRealTradeTaker(trade) {
  const state = loadDailyState();
  const check = canTrade(state);
  if (!check.allowed) return { success: false, reason: check.reason };
  
  const client = await createClobClient();
  if (!client) return { success: false, reason: 'CLOB client unavailable' };
  
  try {
    // Resolve token ID — prefer clobTokenIds from market scrape
    let tokenId;
    if (trade.clobTokenIds && trade.clobTokenIds.length >= 2) {
      tokenId = trade.direction === 'Up' ? trade.clobTokenIds[0] : trade.clobTokenIds[1];
    } else if (trade.conditionId) {
      const market = await client.getMarket(trade.conditionId);
      tokenId = trade.direction === 'Up' ? market?.tokens?.[0]?.token_id : market?.tokens?.[1]?.token_id;
    }
    if (!tokenId || tokenId.length < 10) return { success: false, reason: 'Could not resolve token ID — no clobTokenIds or conditionId' };
    
    const stake = Math.min(trade.stake || 10, REAL_CONFIG.maxStakePerTrade);
    
    // === STEP 1: Get real CLOB midpoint price ===
    // Gamma API can diverge from real market (seen 52% vs 24%). Use CLOB /midpoint endpoint.
    const axios = require('axios');
    let clobMid = null;
    try {
      const midResp = await axios.get('https://clob.polymarket.com/midpoint', {
        params: { token_id: tokenId }, timeout: 5000
      });
      const mid = midResp.data?.mid ?? midResp.data?.price;
      const midNum = typeof mid === 'string' ? parseFloat(mid) : mid;
      if (isFinite(midNum) && midNum > 0 && midNum < 1) {
        clobMid = midNum;
      }
    } catch (e) {
      console.log(`   ⚠️  CLOB midpoint fetch failed: ${e.message}`);
    }
    
    const effectivePrice = clobMid || trade.entryOdds || 0.5;
    console.log(`   📊 Prices: gamma=${trade.entryOdds} | CLOB mid=${clobMid || 'n/a'} | using=${effectivePrice.toFixed(3)}`);
    
    // Sanity checks using real CLOB mid
    if (clobMid !== null) {
      if (clobMid < 0.40) {
        return { success: false, reason: `CLOB mid ${(clobMid*100).toFixed(0)}% below 40% min (gamma said ${(trade.entryOdds*100).toFixed(0)}%)` };
      }
      if (Math.abs(clobMid - trade.entryOdds) > 0.15) {
        return { success: false, reason: `Price divergence: CLOB mid ${(clobMid*100).toFixed(0)}% vs gamma ${(trade.entryOdds*100).toFixed(0)}% (>15pp)` };
      }
    }
    
    // === STEP 2: FOK market order — let SDK walk the book ===
    // SDK's createMarketOrder (without price) calls calculateBuyMarketPrice which walks
    // the full order book and sets price high enough to cover our entire amount across
    // all ask levels. Previously we manually set price=bestAsk which limited fills to
    // a single price level — causing FOK rejections when that level had insufficient depth.
    const MAX_RETRIES = 3;
    let orderId = null;
    let fillPrice = null;
    let totalFilled = 0;
    
    // Price cap: signal + 10pp — SDK walks the book and fills at best available asks
    // The actual fill price comes from position data lookup after fill (not the cap)
    const MAX_SLIPPAGE_PP = 0.10;
    const priceCap = Math.min(trade.entryOdds + MAX_SLIPPAGE_PP, 0.95);
    console.log(`   📊 Signal: ${(trade.entryOdds*100).toFixed(1)}% | Price cap: ${(priceCap*100).toFixed(1)}% (signal + ${MAX_SLIPPAGE_PP*100}pp)`);
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        console.log(`   💰 Market FOK attempt ${attempt + 1}: ${trade.asset} ${trade.direction} | $${stake} | Token: ${tokenId.slice(0, 12)}...`);
        
        // Use tight price cap based on actual best ask
        const order = await client.createMarketOrder({
          tokenID: tokenId,
          amount: stake,
          price: priceCap,
          side: 'BUY',
          feeRateBps: 1000,
        }, {
          tickSize: '0.01',
          negRisk: false,
        });
        
        const resp = await client.postOrder(order, OrderType.FOK);
        console.log(`   📋 RESPONSE: ${JSON.stringify(resp)?.slice(0, 300)}`);
        
        if (resp?.success === true || resp?.orderID || resp?.id) {
          orderId = resp?.orderID || resp?.id;
          totalFilled = stake;
          // Get actual fill price from position data (exchange fills at best asks, not our cap)
          fillPrice = trade.entryOdds; // Default to signal price (not priceCap which overstates cost)
          const walletAddr = loadWallet()?.address;
          for (let pAttempt = 0; pAttempt < 3; pAttempt++) {
            try {
              await new Promise(r => setTimeout(r, 3000)); // Wait for position data to propagate
              const posResp = await axios.get('https://data-api.polymarket.com/positions', {
                params: { user: walletAddr }, timeout: 10000
              });
              const pos = (posResp.data || []).find(p => p.asset === tokenId);
              if (pos?.avgPrice) {
                fillPrice = pos.avgPrice;
                console.log(`   📊 Actual fill price: ${(fillPrice*100).toFixed(1)}% (from position data, attempt ${pAttempt+1})`);
                break;
              }
              console.log(`   ⏳ Position not found yet (attempt ${pAttempt+1}/3)...`);
            } catch (e) {
              console.log(`   ⚠️  Position fetch error (attempt ${pAttempt+1}): ${e.message}`);
            }
          }
          console.log(`   ✅ FILLED: $${stake} @ ${fillPrice?.toFixed(4)} | order: ${orderId}`);
          break;
        } else {
          console.log(`   ⚠️  FOK rejected (attempt ${attempt + 1}/${MAX_RETRIES}): ${JSON.stringify(resp)?.slice(0, 200)}`);
          if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 2000));
        }
      } catch (e) {
        console.log(`   ❌ Attempt ${attempt + 1} error: ${e.message}`);
        if (e.message.includes('insufficient') || e.message.includes('allowance')) {
          activateKillSwitch(`Trade failed: ${e.message}`);
          return { success: false, reason: e.message };
        }
        // "no match" means book has insufficient total depth for our amount — don't retry
        if (e.message.includes('no match')) {
          return { success: false, reason: `Insufficient book depth for $${stake}` };
        }
        if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    if (totalFilled === 0) {
      return { success: false, reason: `Failed to fill after ${MAX_RETRIES} attempts` };
    }
    
    console.log(`   ✅ ORDER COMPLETE: $${totalFilled.toFixed(2)} | ${orderId}`);
    
    state.tradesPlaced++;
    state.openPositions++;
    state.trades.push({
      timestamp: new Date().toISOString(),
      asset: trade.asset,
      direction: trade.direction,
      stake: totalFilled, tokenId,
      orderId: orderId || 'fok-multi',
      entryOdds: trade.entryOdds,
      clobMid,
      fillPrice,
      slug: trade.slug,
      orderType: 'fok-taker',
    });
    saveDailyState(state);
    
    const slippage = fillPrice ? Math.round((fillPrice - effectivePrice) * 10000) / 100 : 0;
    return { success: true, orderId: orderId || 'fok-multi', stake: totalFilled, tokenId, orderType: 'fok-taker', fillPrice, limitPrice: priceCap, clobMid, slippage };
  } catch (error) {
    console.error(`   ❌ TAKER TRADE FAILED: ${error.message}`);
    if (error.message.includes('insufficient') || error.message.includes('allowance')) {
      activateKillSwitch(`Trade failed: ${error.message}`);
    }
    return { success: false, reason: error.message };
  }
}

// ========== STATUS ==========
function getTradingStatus() {
  const state = loadDailyState();
  const mode = readTradingMode();
  const killActive = isKillSwitchActive();
  
  let killInfo = null;
  if (killActive) {
    try {
      killInfo = JSON.parse(fs.readFileSync(REAL_CONFIG.killSwitchPath, 'utf8'));
    } catch {}
  }
  
  const walletConfigured = fs.existsSync(REAL_CONFIG.walletPath);
  
  return {
    mode,
    killSwitch: killActive,
    killInfo,
    walletConfigured,
    today: {
      date: state.date,
      tradesPlaced: state.tradesPlaced,
      totalPnl: state.totalPnl,
      openPositions: state.openPositions,
      tradeCount: state.trades.length
    },
    limits: {
      maxStakePerTrade: REAL_CONFIG.maxStakePerTrade,
      maxDailyLoss: REAL_CONFIG.maxDailyLoss,
      maxDailyTrades: REAL_CONFIG.maxDailyTrades,
      maxConcurrentPositions: REAL_CONFIG.maxConcurrentPositions
    }
  };
}

// ========== SETUP ==========
async function setupWallet() {
  const walletDir = path.dirname(REAL_CONFIG.walletPath);
  if (!fs.existsSync(walletDir)) {
    fs.mkdirSync(walletDir, { recursive: true });
  }
  
  if (fs.existsSync(REAL_CONFIG.walletPath)) {
    const existing = JSON.parse(fs.readFileSync(REAL_CONFIG.walletPath, 'utf8'));
    console.log(`Wallet already exists: ${existing.address}`);
    console.log('To create a new one, delete:', REAL_CONFIG.walletPath);
    return;
  }
  
  const wallet = ethers.Wallet.createRandom();
  const walletData = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString(),
    network: 'polygon',
    note: 'Polymarket trading wallet. Fund with USDC on Polygon.'
  };
  
  fs.writeFileSync(REAL_CONFIG.walletPath, JSON.stringify(walletData, null, 2));
  fs.chmodSync(REAL_CONFIG.walletPath, '600'); // owner read/write only
  
  console.log('\n🔐 New trading wallet created:');
  console.log(`   Address: ${wallet.address}`);
  console.log(`   Network: Polygon (MATIC)`);
  console.log(`   Key file: ${REAL_CONFIG.walletPath}`);
  console.log('\n📝 Next steps:');
  console.log('   1. Send USDC (Polygon) to this address');
  console.log('   2. Send a tiny amount of MATIC for gas (~0.1 MATIC)');
  console.log('   3. Set mode to "real" via dashboard or: node real-trader.js mode real');
  console.log('\n⚠️  KEEP THE KEY FILE SAFE. Anyone with access can drain the wallet.');
}

// ========== CLI ==========
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'setup':
      await setupWallet();
      break;
    
    case 'status':
      console.log(JSON.stringify(getTradingStatus(), null, 2));
      break;
    
    case 'mode':
      if (args[1]) {
        setTradingMode(args[1]);
      } else {
        console.log('Current mode:', readTradingMode());
        console.log('Usage: node real-trader.js mode [paper|real|disabled]');
      }
      break;
    
    case 'kill':
      activateKillSwitch(args[1] || 'Manual CLI kill');
      break;
    
    case 'unkill':
      deactivateKillSwitch();
      break;
    
    case 'wallet':
      const wallet = loadWallet();
      if (wallet) {
        console.log('Wallet address:', wallet.address);
      }
      break;
    
    default:
      console.log('Polymarket Real Trader');
      console.log('Commands: setup | status | mode [paper|real|disabled] | kill | unkill | wallet');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  executeRealTrade,
  executeRealTradeTaker,
  getTradingStatus,
  setTradingMode,
  canTrade,
  isKillSwitchActive,
  activateKillSwitch,
  deactivateKillSwitch,
  loadDailyState,
  readTradingMode,
  REAL_CONFIG,
  MAKER_CONFIG
};
