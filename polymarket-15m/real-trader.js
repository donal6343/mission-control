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

// (Proxy interceptor removed — using direct CLOB URL now)

// ========== CONFIG ==========
const REAL_CONFIG = {
  // Mode: 'paper' | 'real' | 'disabled'
  // Read from config file so dashboard can toggle
  get mode() {
    return readTradingMode();
  },
  
  // Safety limits
  maxStakePerTrade: 10,       // $10 max per trade
  maxDailyLoss: 50,           // Stop trading if down $50 in a day
  maxDailyTrades: 30,         // Max trades per day
  maxConcurrentPositions: 20, // Max open positions at once (15-min markets resolve fast)
  
  // Polymarket CLOB (via EU proxy to bypass US geo-block)
  clobUrl: 'https://clob.polymarket.com',  // Direct — server not geo-blocked
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
let _cachedApiCreds = null;
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
    
    // Use exact same approach as working test-order.js:
    // Limit order at entry odds — fills immediately as taker at market price
    const rawPrice = trade.entryOdds || 0.5;
    const price = Math.min(0.99, Math.max(0.01, Math.round(rawPrice * 100) / 100)); // Clamp to valid range & round to tick
    const size = Math.round(stake / price * 100) / 100; // Shares
    
    if (size <= 0) return { success: false, reason: `Invalid size: ${size} (stake=$${stake}, price=${price})` };
    
    console.log(`   💰 ORDER: ${trade.asset} ${trade.direction} | $${stake} @ ${price} | ${size} shares | Token: ${tokenId.slice(0, 12)}...`);
    
    const order = await client.createAndPostOrder({
      tokenID: tokenId,
      price: price,
      side: 'BUY',
      size: size,
      feeRateBps: 1000,
      tickSize: '0.01',
      negRisk: false,
    });
    
    state.tradesPlaced++;
    state.openPositions++;
    state.trades.push({
      timestamp: new Date().toISOString(),
      asset: trade.asset,
      direction: trade.direction,
      stake, tokenId,
      orderId: order?.orderID || order?.id || 'unknown',
      entryOdds: trade.entryOdds,
      slug: trade.slug,
      orderType: 'taker',
    });
    saveDailyState(state);
    
    return { success: true, orderId: order?.orderID || order?.id, stake, tokenId, orderType: 'taker' };
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
