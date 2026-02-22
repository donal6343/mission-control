/**
 * Coinbase Order Book Signal
 * Tracks bid/ask depth via level2 WebSocket channel
 * Detects: imbalance, large sweeps, market maker pulls
 */

const WebSocket = require('ws');

// State per asset
const books = {
  'BTC-USD': { bids: {}, asks: {}, lastSnapshot: 0 },
};

// Signal state
const signals = {
  BTC: { imbalance: 1.0, direction: null, largeSweep: false, mmPull: false, lastUpdate: 0 }
};

// History for detecting rapid changes (bid pulls)
const depthHistory = {
  BTC: [] // [{timestamp, bidTotal, askTotal}]
};

let ws = null;
let reconnectTimer = null;
let initialized = false;

function connect() {
  try {
    ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
    
    ws.on('open', () => {
      console.log('🟢 Coinbase L2 OrderBook connected');
      ws.send(JSON.stringify({
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channels: ['level2_batch']
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'snapshot') {
          handleSnapshot(msg);
        } else if (msg.type === 'l2update') {
          handleUpdate(msg);
        }
      } catch (e) { /* ignore */ }
    });
    
    ws.on('close', () => {
      console.log('🔴 Coinbase L2 disconnected, reconnecting in 5s...');
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 5000);
    });
    
    ws.on('error', (err) => {
      console.log('⚠️ Coinbase L2 error:', err.message);
      try { ws.close(); } catch(e) {}
    });
  } catch (e) {
    console.log('⚠️ Coinbase L2 connect failed:', e.message);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 10000);
  }
}

function handleSnapshot(msg) {
  const book = books[msg.product_id];
  if (!book) return;
  
  book.bids = {};
  book.asks = {};
  
  // Only keep top 50 levels to save memory
  const bids = (msg.bids || []).slice(0, 50);
  const asks = (msg.asks || []).slice(0, 50);
  
  for (const [price, size] of bids) {
    book.bids[price] = parseFloat(size);
  }
  for (const [price, size] of asks) {
    book.asks[price] = parseFloat(size);
  }
  book.lastSnapshot = Date.now();
  computeSignals('BTC', msg.product_id);
}

function handleUpdate(msg) {
  const book = books[msg.product_id];
  if (!book) return;
  
  for (const [side, price, size] of (msg.changes || [])) {
    const sizeF = parseFloat(size);
    const target = side === 'buy' ? book.bids : book.asks;
    if (sizeF === 0) {
      delete target[price];
    } else {
      target[price] = sizeF;
    }
    // Cap entries to 50 per side
    const keys = Object.keys(target);
    if (keys.length > 60) {
      const sorted = keys.map(Number).sort((a, b) => side === 'buy' ? b - a : a - b);
      for (let i = 50; i < sorted.length; i++) {
        delete target[String(sorted[i])];
      }
    }
  }
  
  computeSignals('BTC', msg.product_id);
}

function computeSignals(asset, productId) {
  const book = books[productId];
  if (!book) return;
  
  const now = Date.now();
  
  // Calculate total bid/ask volume in USD
  let bidTotal = 0, askTotal = 0;
  for (const [price, size] of Object.entries(book.bids)) {
    bidTotal += parseFloat(price) * size;
  }
  for (const [price, size] of Object.entries(book.asks)) {
    askTotal += parseFloat(price) * size;
  }
  
  const imbalance = askTotal > 0 ? bidTotal / askTotal : 1.0;
  
  // Direction based on imbalance
  let direction = null;
  if (imbalance > 3.0) direction = 'Up';    // 3:1 bid skew = bullish
  else if (imbalance < 0.33) direction = 'Down'; // 1:3 ask skew = bearish
  
  // Detect large orders (>$500K on single level)
  let largeSweep = false;
  for (const [price, size] of Object.entries(book.bids)) {
    if (parseFloat(price) * size > 500000) { largeSweep = true; break; }
  }
  if (!largeSweep) {
    for (const [price, size] of Object.entries(book.asks)) {
      if (parseFloat(price) * size > 500000) { largeSweep = true; break; }
    }
  }
  
  // Detect bid pulls (depth drops >50% in 2 seconds)
  let mmPull = false;
  const hist = depthHistory[asset];
  hist.push({ timestamp: now, bidTotal, askTotal });
  // Keep last 10 entries
  while (hist.length > 10) hist.shift();
  
  if (hist.length >= 2) {
    const twoSecsAgo = hist.find(h => (now - h.timestamp) >= 1500 && (now - h.timestamp) <= 3000);
    if (twoSecsAgo) {
      if (bidTotal < twoSecsAgo.bidTotal * 0.5) {
        mmPull = true;
        direction = direction || 'Down'; // Bid pull = bearish
      }
      if (askTotal < twoSecsAgo.askTotal * 0.5) {
        mmPull = true;
        direction = direction || 'Up'; // Ask pull = bullish
      }
    }
  }
  
  signals[asset] = { imbalance, direction, largeSweep, mmPull, lastUpdate: now };
}

// === Public API ===

function initialize() {
  if (initialized) return;
  initialized = true;
  connect();
}

/**
 * Get order book signal for an asset
 * @returns {{ imbalance: number, direction: 'Up'|'Down'|null, largeSweep: boolean, mmPull: boolean }}
 */
function getOrderBookSignal(asset) {
  const sig = signals[asset || 'BTC'];
  if (!sig || (Date.now() - sig.lastUpdate > 60000)) {
    return { imbalance: 1.0, direction: null, largeSweep: false, mmPull: false };
  }
  return { ...sig };
}

function shutdown() {
  clearTimeout(reconnectTimer);
  try { if (ws) ws.close(); } catch(e) {}
  initialized = false;
}

module.exports = { initialize, getOrderBookSignal, shutdown };

if (require.main === module) {
  initialize();
  setInterval(() => {
    const sig = getOrderBookSignal('BTC');
    console.log(`BTC OrderBook: imbalance=${sig.imbalance.toFixed(2)}, dir=${sig.direction}, sweep=${sig.largeSweep}, pull=${sig.mmPull}`);
  }, 2000);
}
