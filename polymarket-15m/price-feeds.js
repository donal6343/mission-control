/**
 * Real-Time Price Feeds via Binance & Coinbase WebSockets
 * Replaces Chainlink/CoinGecko polling with persistent WS connections
 * Falls back to CoinGecko REST if both WS sources are down
 */

const WebSocket = require('ws');
const fetch = require('node-fetch');

// === State ===
const prices = {
  BTC: { binance: null, coinbase: null, updatedAt: {} },
  ETH: { binance: null, coinbase: null, updatedAt: {} },
  SOL: { binance: null, coinbase: null, updatedAt: {} },
  XRP: { binance: null, coinbase: null, updatedAt: {} },
};

// VWAP tracking (cumulative price*volume / cumulative volume)
const vwap = {
  BTC: { cumPV: 0, cumV: 0, value: null },
  ETH: { cumPV: 0, cumV: 0, value: null },
  SOL: { cumPV: 0, cumV: 0, value: null },
  XRP: { cumPV: 0, cumV: 0, value: null },
};

// Funding rates cache
const fundingRates = {};
let lastFundingFetch = 0;

let binanceWs = null;
let coinbaseWs = null;
let binanceReconnectTimer = null;
let coinbaseReconnectTimer = null;
let initialized = false;

// === Binance WebSocket ===
function connectBinance() {
  try {
    const streams = ['btcusdt@trade', 'ethusdt@trade', 'solusdt@trade', 'xrpusdt@trade'].join('/');
    // Use Binance.US if main Binance blocks (451), also try global as fallback
    const url = `wss://stream.binance.us:9443/ws/${streams}`;
    
    binanceWs = new WebSocket(url);
    
    binanceWs.on('open', () => {
      console.log('🟢 Binance WS connected');
    });
    
    binanceWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.e === 'trade') {
          const symbol = msg.s; // e.g. BTCUSDT
          const price = parseFloat(msg.p);
          const volume = parseFloat(msg.q);
          let asset = null;
          if (symbol === 'BTCUSDT') asset = 'BTC';
          else if (symbol === 'ETHUSDT') asset = 'ETH';
          else if (symbol === 'SOLUSDT') asset = 'SOL';
          else if (symbol === 'XRPUSDT') asset = 'XRP';
          
          if (asset) {
            prices[asset].binance = price;
            prices[asset].updatedAt.binance = Date.now();
            // Update VWAP
            vwap[asset].cumPV += price * volume;
            vwap[asset].cumV += volume;
            vwap[asset].value = vwap[asset].cumV > 0 ? vwap[asset].cumPV / vwap[asset].cumV : null;
          }
        }
      } catch (e) { /* ignore parse errors */ }
    });
    
    binanceWs.on('close', () => {
      console.log('🔴 Binance WS disconnected, reconnecting in 5s...');
      clearTimeout(binanceReconnectTimer);
      binanceReconnectTimer = setTimeout(connectBinance, 5000);
    });
    
    binanceWs.on('error', (err) => {
      console.log('⚠️ Binance WS error:', err.message);
      try { binanceWs.close(); } catch(e) {}
    });
  } catch (e) {
    console.log('⚠️ Binance WS connect failed:', e.message);
    clearTimeout(binanceReconnectTimer);
    binanceReconnectTimer = setTimeout(connectBinance, 10000);
  }
}

// === Coinbase WebSocket ===
function connectCoinbase() {
  try {
    coinbaseWs = new WebSocket('wss://ws-feed.exchange.coinbase.com');
    
    coinbaseWs.on('open', () => {
      console.log('🟢 Coinbase WS connected');
      coinbaseWs.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD'],
        channels: ['ticker']
      }));
    });
    
    coinbaseWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'ticker') {
          const price = parseFloat(msg.price);
          if (msg.product_id === 'BTC-USD') {
            prices.BTC.coinbase = price;
            prices.BTC.updatedAt.coinbase = Date.now();
          } else if (msg.product_id === 'ETH-USD') {
            prices.ETH.coinbase = price;
            prices.ETH.updatedAt.coinbase = Date.now();
          } else if (msg.product_id === 'SOL-USD') {
            prices.SOL.coinbase = price;
            prices.SOL.updatedAt.coinbase = Date.now();
          } else if (msg.product_id === 'XRP-USD') {
            if (!prices.XRP) prices.XRP = { binance: null, coinbase: null, updatedAt: {} };
            prices.XRP.coinbase = price;
            prices.XRP.updatedAt.coinbase = Date.now();
          }
        }
      } catch (e) { /* ignore */ }
    });
    
    coinbaseWs.on('close', () => {
      console.log('🔴 Coinbase WS disconnected, reconnecting in 5s...');
      clearTimeout(coinbaseReconnectTimer);
      coinbaseReconnectTimer = setTimeout(connectCoinbase, 5000);
    });
    
    coinbaseWs.on('error', (err) => {
      console.log('⚠️ Coinbase WS error:', err.message);
      try { coinbaseWs.close(); } catch(e) {}
    });
  } catch (e) {
    console.log('⚠️ Coinbase WS connect failed:', e.message);
    clearTimeout(coinbaseReconnectTimer);
    coinbaseReconnectTimer = setTimeout(connectCoinbase, 10000);
  }
}

// === CoinGecko Fallback ===
async function fetchCoinGeckoFallback() {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple&vs_currencies=usd');
    const data = await res.json();
    const map = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', ripple: 'XRP' };
    const result = {};
    for (const [id, asset] of Object.entries(map)) {
      if (data[id]?.usd) {
        result[asset] = data[id].usd;
      }
    }
    return result;
  } catch (e) {
    console.log('⚠️ CoinGecko fallback failed:', e.message);
    return {};
  }
}

// === Funding Rate Check ===
async function fetchFundingRates() {
  if (Date.now() - lastFundingFetch < 300000) return; // Cache 5 min
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    for (const symbol of symbols) {
      const res = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`, { timeout: 10000 });
      const data = await res.json();
      if (data[0]) {
        const asset = symbol.replace('USDT', '');
        fundingRates[asset] = parseFloat(data[0].fundingRate);
      }
    }
    lastFundingFetch = Date.now();
  } catch (e) {
    console.log('⚠️ Funding rate fetch failed:', e.message);
  }
}

// === Public API ===

function initialize() {
  if (initialized) return;
  initialized = true;
  connectBinance();
  connectCoinbase();
  console.log('📡 Price feeds initializing...');
}

/**
 * Get latest price for an asset, averaged across sources
 */
async function getLatestPrice(asset) {
  const p = prices[asset];
  if (!p) return null;
  
  const sources = [];
  const staleMs = 30000; // 30s staleness threshold
  const now = Date.now();
  
  if (p.binance && (now - (p.updatedAt.binance || 0)) < staleMs) {
    sources.push({ source: 'binance', price: p.binance });
  }
  if (p.coinbase && (now - (p.updatedAt.coinbase || 0)) < staleMs) {
    sources.push({ source: 'coinbase', price: p.coinbase });
  }
  
  // Fallback to CoinGecko if no WS data
  if (sources.length === 0) {
    const fallback = await fetchCoinGeckoFallback();
    if (fallback[asset]) {
      sources.push({ source: 'coingecko', price: fallback[asset] });
    }
  }
  
  if (sources.length === 0) return null;
  
  const avg = sources.reduce((s, x) => s + x.price, 0) / sources.length;
  return {
    price: avg,
    sources,
    source: sources.length > 1 ? 'multi' : sources[0].source,
    timestamp: now
  };
}

/**
 * Get all prices (replaces getHybridPrices)
 */
async function getHybridPrices() {
  await fetchFundingRates();
  const result = {};
  for (const asset of ['BTC', 'ETH', 'SOL', 'XRP']) {
    const data = await getLatestPrice(asset);
    if (data) {
      result[asset] = data;
    }
  }
  return result;
}

/**
 * Compare real price movement to Polymarket odds for lag detection
 */
function getPriceLag(asset, polymarketUpOdds) {
  const p = prices[asset];
  if (!p || !p.binance) return { lagSeconds: 0, discrepancy: 0 };
  
  // If price is clearly up but odds are < 50% for Up, there's lag
  // This is a simplified heuristic
  const priceDirection = p.binance > (p._prevPrice || p.binance) ? 'Up' : 'Down';
  p._prevPrice = p.binance;
  
  const oddsDirection = polymarketUpOdds > 0.5 ? 'Up' : 'Down';
  const discrepancy = Math.abs(polymarketUpOdds - 0.5) < 0.05 ? 0 : 
    (priceDirection !== oddsDirection ? Math.abs(polymarketUpOdds - 0.5) : 0);
  
  return { lagSeconds: discrepancy > 0 ? 5 : 0, discrepancy };
}

/**
 * Get VWAP for an asset
 */
function getVWAP(asset) {
  return vwap[asset]?.value || null;
}

/**
 * Get funding rate for an asset
 */
function getFundingRate(asset) {
  return fundingRates[asset] || null;
}

/**
 * Shutdown WebSocket connections
 */
function shutdown() {
  clearTimeout(binanceReconnectTimer);
  clearTimeout(coinbaseReconnectTimer);
  try { if (binanceWs) binanceWs.close(); } catch(e) {}
  try { if (coinbaseWs) coinbaseWs.close(); } catch(e) {}
  initialized = false;
}

module.exports = {
  initialize,
  getLatestPrice,
  getHybridPrices,
  getPriceLag,
  getVWAP,
  getFundingRate,
  shutdown
};

// Test if run directly
if (require.main === module) {
  initialize();
  setTimeout(async () => {
    console.log('\n--- Prices after 3s ---');
    for (const asset of ['BTC', 'ETH', 'SOL', 'XRP']) {
      const p = await getLatestPrice(asset);
      console.log(`${asset}: ${p ? `$${p.price.toLocaleString()} (${p.source})` : 'no data'}`);
    }
    console.log('\nVWAP:', Object.entries(vwap).map(([k,v]) => `${k}:${v.value ? '$'+v.value.toFixed(2) : 'n/a'}`).join(', '));
    shutdown();
    process.exit(0);
  }, 3000);
}
