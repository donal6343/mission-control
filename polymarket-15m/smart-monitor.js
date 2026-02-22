#!/usr/bin/env node
/**
 * Smart Polymarket 15M Monitor V2
 * Features:
 * - Correlation plays (BTC leads, alts follow)
 * - Breaking news priority
 * - Tiered thresholds
 * - Value betting (our odds vs market odds)
 */

const { Client } = require('@notionhq/client');
const fetch = require('node-fetch');
const fs = require('fs');
const { execSync } = require('child_process');
const { RSI, SMA } = require('technicalindicators');
const { analyzeMacroEvents, getMacroSignal } = require('./macro-events');
const { executeRealTradeTaker, readTradingMode, isKillSwitchActive, loadDailyState } = require('./real-trader');
const { initialize: initPriceFeeds, getHybridPrices, getVWAP, getFundingRate, shutdown: shutdownPriceFeeds } = require('./price-feeds');
const { initialize: initOrderBook, getOrderBookSignal, shutdown: shutdownOrderBook } = require('./orderbook-signal');
const { initialize: initLiquidation, getLiquidationSignal, shutdown: shutdownLiquidation } = require('./liquidation-signal');
const { checkNewTrades: checkWhaleTrades, getWhaleSignal, getWhaleActivity } = require('./whale-tracker');
const { recordSessionData, getSessionBias } = require('./session-tracker');

// Config
const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const notion = new Client({ 
  auth: fs.readFileSync(process.env.HOME + '/.config/notion/api_key', 'utf-8').trim() 
});

const HISTORY_FILE = './odds-history.json';
const TRADES_FILE = './active-trades.json';
const PRICE_HISTORY_FILE = './price-history.json';
const TRADING_CONFIG_FILE = './trading-config.json';

function loadTradingConfig() {
  try { return JSON.parse(fs.readFileSync(TRADING_CONFIG_FILE, 'utf-8')); }
  catch { return { paths: { arb: { enabled: true }, breakingNews: { enabled: true }, path1: { enabled: true }, path2: { enabled: true }, path3: { enabled: true }, whale: { enabled: true } } }; }
}

function isPathEnabled(pathName) {
  const config = loadTradingConfig();
  return config.paths?.[pathName]?.enabled !== false;
}

// Tiered stake sizing based on confidence
const STAKE_TIERS = [
  { minConf: 0.75, multiplier: 2.0, label: '75%+' },   // $20 — highest conviction
  { minConf: 0.70, multiplier: 1.5, label: '70-74%' },  // $15
  { minConf: 0.60, multiplier: 1.0, label: '60-69%' },  // $10 — base
  { minConf: 0.50, multiplier: 0.5, label: '50-59%' },  // $5 — low conviction
  { minConf: 0,    multiplier: 0.5, label: '<50%' },     // $5 — ARB-only zone
];

function getStakeForConfidence(confidence, baseStake) {
  // Read dynamic stake tiers from trading config, fall back to hardcoded
  const config = loadTradingConfig();
  const tiers = config.stakeTiers || STAKE_TIERS;
  
  if (config.stakeTiers) {
    // Dynamic tiers use absolute stake values
    for (const tier of tiers) {
      if (confidence >= tier.minConf) return tier.stake;
    }
    return tiers[tiers.length - 1]?.stake || baseStake;
  }
  
  // Fallback: hardcoded tiers use multipliers
  for (const tier of STAKE_TIERS) {
    if (confidence >= tier.minConf) return Math.round(baseStake * tier.multiplier);
  }
  return baseStake;
}

// Get dynamic parameter from trading config, falling back to THRESHOLDS
function getParam(key, fallback) {
  const config = loadTradingConfig();
  if (config.params && config.params[key] !== undefined) return config.params[key];
  return fallback;
}

function isKillSwitchOn() {
  const config = loadTradingConfig();
  return config.killSwitch === true;
}

function getExcludedAssets() {
  const config = loadTradingConfig();
  return config.excludedAssets || THRESHOLDS.excludedAssets || [];
}
const NEWS_STATE_FILE = './news-state.json';

// ========== BREAKING NEWS STATE TRACKING ==========
function loadNewsState() {
  try { return JSON.parse(fs.readFileSync(NEWS_STATE_FILE, 'utf8')); }
  catch { return { lastNewsTrade: {}, newsTradesThisHour: [], seenNewsHashes: [] }; }
}
function saveNewsState(state) {
  fs.writeFileSync(NEWS_STATE_FILE, JSON.stringify(state, null, 2));
}
function hashNews(text) {
  // Simple hash of sentiment summary to detect duplicate "breaking" news
  if (!text) return '';
  return text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 50);
}
function isNewsCooldownActive(asset, state) {
  const last = state.lastNewsTrade[asset];
  if (!last) return false;
  return (Date.now() - last) < THRESHOLDS.breakingNewsCooldownMs;
}
function isNewsRateLimited(state) {
  const oneHourAgo = Date.now() - 3600000;
  const recent = (state.newsTradesThisHour || []).filter(t => t > oneHourAgo);
  state.newsTradesThisHour = recent; // clean up old entries
  return recent.length >= THRESHOLDS.breakingNewsMaxPerHour;
}
function isNewsStale(summary, state) {
  const hash = hashNews(summary);
  if (!hash) return false;
  return (state.seenNewsHashes || []).includes(hash);
}
function recordNewsTrade(asset, summary, state) {
  state.lastNewsTrade[asset] = Date.now();
  if (!state.newsTradesThisHour) state.newsTradesThisHour = [];
  state.newsTradesThisHour.push(Date.now());
  const hash = hashNews(summary);
  if (hash) {
    if (!state.seenNewsHashes) state.seenNewsHashes = [];
    state.seenNewsHashes.push(hash);
    // Keep last 50 hashes
    if (state.seenNewsHashes.length > 50) state.seenNewsHashes = state.seenNewsHashes.slice(-50);
  }
  saveNewsState(state);
}

// ========== THRESHOLDS (TRIAL MODE - more trades for data) ==========
const THRESHOLDS = {
  // Tiered approach: multiple paths to a trade
  // WEEK 2 OPTIMAL: Skip 60-69% death zone, favor 70%+ and multi-signal <60%
  // Paths define WHAT qualifies. Confidence tiers define HOW MUCH we stake.
  path1: { confidence: 0.55, categories: 3 },  // 3 signals agree — slightly higher bar
  path2: { confidence: 0.70, categories: 2 },  // 2 signals — skip 60-69% death zone
  path3: { confidence: 0.75, categories: 1 },  // Single signal — needs strong conviction
  
  // Value betting: minimum edge over market odds
  minEdge: 0.03,  // 3% min edge (proven in Week 1)
  
  // Breaking news: automatically qualifies
  breakingNewsMinConfidence: 0.60,  // Raised from 0.55 — news needs more conviction
  
  // Correlation: BTC move triggers alt bets
  correlationThreshold: 0.03,  // 3% BTC move
  correlationWindow: 5,  // minutes
  
  // ARB: Price-to-odds arbitrage (real price moved, odds haven't caught up)
  arbMinDiscrepancy: 0.02,  // 2% difference between implied and actual
  arbMinPriceMove: 0.003,   // 0.3% minimum price move to trigger
  
  // Asset weights — set dynamically by macro sentiment (positive = bullish, negative = bearish)
  // All assets trade equally by default. Macro bot updates these based on daily sentiment.
  assetWeights: { SOL: 0.03, ETH: 0.02, BTC: 0 },
  directionWeights: { Up: 0.02, Down: -0.05 },  // Up dominates (+$232 vs -$0.28)
  excludedAssets: ['XRP'],  // XRP stays excluded (41% WR, -$37.67)
  breakingNewsOnly: false,
  
  // Breaking news improvements
  breakingNewsCooldownMs: 15 * 60 * 1000,  // 15 min cooldown per asset after news trade
  breakingNewsRequirePriceMove: true,       // Require price confirmation
  breakingNewsMinPriceMove: 0.002,          // 0.2% min price move in same direction
  breakingNewsMaxPerHour: 3,                // Max breaking news trades per hour (all assets)
};

// ========== TRADE TRACKING ==========
function loadActiveTrades() {
  try { return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8')); } 
  catch { return {}; }
}

function saveActiveTrades(trades) {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}

function hasAlreadyBet(slug) {
  return !!loadActiveTrades()[slug];
}

function recordBet(slug, trade) {
  const trades = loadActiveTrades();
  const now = new Date();
  const windowStart = new Date(trade.windowStart);
  const elapsedMinutes = Math.round(((now - windowStart) / 60000) * 10) / 10;
  trades[slug] = { ...trade, timestamp: now.toISOString(), elapsedMinutes };
  saveActiveTrades(trades);
}

// ========== PRICE HISTORY (for correlation) ==========
function loadPriceHistory() {
  try { return JSON.parse(fs.readFileSync(PRICE_HISTORY_FILE, 'utf-8')); }
  catch { return { BTC: [], ETH: [], SOL: [], XRP: [] }; }
}

function savePriceHistory(history) {
  fs.writeFileSync(PRICE_HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ========== ODDS HISTORY ==========
function loadHistory() {
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')); }
  catch { return { BTC: [], ETH: [], SOL: [], XRP: [] }; }
}

function saveHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ========== FETCH REAL PRICES (WebSocket feeds from price-feeds.js) ==========
async function fetchCryptoPrices() {
  try {
    const hybridPrices = await getHybridPrices();
    
    const result = {};
    for (const asset of ['BTC', 'ETH', 'SOL']) {
      if (hybridPrices[asset]) {
        result[asset] = {
          price: hybridPrices[asset].price,
          change24h: 0,
          source: hybridPrices[asset].source
        };
      }
    }
    
    const sources = Object.entries(result).map(([k,v]) => `${k}:${v.source}`).join(', ');
    console.log(`📊 Prices: ${sources}`);
    
    return result;
  } catch (error) {
    console.log('⚠️  Price fetch failed:', error.message);
    return null;
  }
}

// ========== CORRELATION ANALYSIS ==========
function analyzeCorrelation(priceHistory, currentPrices) {
  const signals = [];
  
  // Check if BTC moved significantly in last N minutes
  const btcHistory = priceHistory.BTC || [];
  if (btcHistory.length < 2 || !currentPrices?.BTC) return signals;
  
  // Find price from ~5 mins ago
  const fiveMinsAgo = Date.now() - (THRESHOLDS.correlationWindow * 60 * 1000);
  const oldBtc = btcHistory.find(p => new Date(p.timestamp).getTime() <= fiveMinsAgo);
  
  if (!oldBtc) return signals;
  
  const btcMove = (currentPrices.BTC.price - oldBtc.price) / oldBtc.price;
  
  if (Math.abs(btcMove) >= THRESHOLDS.correlationThreshold) {
    const direction = btcMove > 0 ? 'Up' : 'Down';
    // Signal for alts to follow BTC
    signals.push({
      type: 'correlation',
      direction,
      btcMove: btcMove * 100,
      message: `BTC moved ${(btcMove * 100).toFixed(2)}% in ${THRESHOLDS.correlationWindow}min - alts likely to follow`
    });
  }
  
  return signals;
}

// ========== FETCH MARKETS ==========
async function fetchMarkets() {
  try {
    const res = await fetch('https://polymarket.com/crypto/15M', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    const html = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([^<]+)<\/script>/);
    if (!match) return null;
    
    const data = JSON.parse(match[1]);
    const marketQuery = data.props?.pageProps?.dehydratedState?.queries?.find(q => 
      q.queryKey?.[0] === 'crypto-markets' && q.queryKey?.[1] === '15M'
    );
    
    return marketQuery?.state?.data?.pages?.[0]?.events || [];
  } catch (error) {
    console.error('Fetch error:', error.message);
    return null;
  }
}

function parseMarket(event) {
  const market = event.markets?.[0];
  if (!market) return null;
  
  let prices = market.outcomePrices || [];
  if (typeof prices === 'string') {
    try { prices = JSON.parse(prices); } catch { prices = prices.split(','); }
  }
  
  const assetMatch = event.slug.match(/^(btc|eth|sol|xrp)/i);
  
  // Skip excluded assets (read dynamically from trading config)
  const excluded = getExcludedAssets();
  if (assetMatch && excluded.includes(assetMatch[1].toUpperCase())) return null;
  
  // Parse CLOB token IDs for real trading
  let clobTokenIds = market.clobTokenIds || [];
  if (typeof clobTokenIds === 'string') {
    try { clobTokenIds = JSON.parse(clobTokenIds); } catch { clobTokenIds = []; }
  }

  return {
    id: event.id,
    slug: event.slug,
    conditionId: market.conditionId || null,
    clobTokenIds: clobTokenIds,  // [0]=Up, [1]=Down
    asset: assetMatch ? assetMatch[1].toUpperCase() : 'UNKNOWN',
    upOdds: parseFloat(prices[0]) || 0,
    downOdds: parseFloat(prices[1]) || 0,
    volume: parseFloat(event.volume) || 0,
    liquidity: parseFloat(event.liquidity) || 0,
    startTime: event.startTime || market.eventStartTime,
    endTime: market.endDate
  };
}

// ========== TECHNICAL INDICATORS ==========
function calculateIndicators(history, asset) {
  const values = history[asset] || [];
  if (values.length < 5) return { rsi: 50, sma: 0.5, momentum: 0 };
  
  const prices = values.map(v => v.upOdds * 100);
  
  const rsiResult = RSI.calculate({ values: prices, period: Math.min(14, prices.length - 1) });
  const rsi = rsiResult.length > 0 ? rsiResult[rsiResult.length - 1] : 50;
  
  const smaResult = SMA.calculate({ values: prices, period: Math.min(5, prices.length) });
  const sma = smaResult.length > 0 ? smaResult[smaResult.length - 1] / 100 : 0.5;
  
  const lookback = Math.min(5, prices.length - 1);
  const momentum = (prices[prices.length - 1] - prices[prices.length - 1 - lookback]) / 100;
  
  return { rsi, sma, momentum };
}

// ========== GROK SENTIMENT ==========
async function getGrokSentiment() {
  return new Promise((resolve) => {
    try {
      const result = execSync(
        'cd ~/clawd/polymarket-15m && source ~/clawd/trueshot/.venv/bin/activate && python3 grok-analyzer.py 2>&1',
        { timeout: 45000, encoding: 'utf-8', shell: '/bin/bash' }
      );
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resolve(JSON.parse(jsonMatch[0]));
      } else {
        resolve({});
      }
    } catch (error) {
      console.log('⚠️  Grok analysis unavailable');
      resolve({});
    }
  });
}

// ========== GENERATE SIGNAL WITH VALUE CALCULATION ==========
function generateSignal(market, indicators, sentiment, correlationSignals, priceData = null) {
  const signals = [];
  let score = 0;
  
  const signalTypes = {
    technical: 0,
    odds: 0,
    sentiment: 0,
    correlation: 0,
    breaking: 0,
    arb: 0,
    momentum: 0,
    orderflow: 0,
    liquidation: 0
  };
  
  let hasBreakingNews = false;
  let arbOpportunity = null;
  
  // 1. Technical: RSI extremes
  if (indicators.rsi < 30) {
    signals.push('RSI oversold (<30)');
    score += 2;
    signalTypes.technical++;
  } else if (indicators.rsi > 70) {
    signals.push('RSI overbought (>70)');
    score -= 2;
    signalTypes.technical++;
  }
  
  // 2. Technical: Strong momentum
  if (indicators.momentum > 0.05) {
    signals.push(`Momentum +${(indicators.momentum * 100).toFixed(1)}%`);
    score += 1.5;
    signalTypes.technical++;
  } else if (indicators.momentum < -0.05) {
    signals.push(`Momentum ${(indicators.momentum * 100).toFixed(1)}%`);
    score -= 1.5;
    signalTypes.technical++;
  }
  
  // 3. Odds extremes (contrarian value)
  if (market.upOdds < 0.35) {
    signals.push(`Up underdog (${(market.upOdds * 100).toFixed(0)}%)`);
    score += 1.5;
    signalTypes.odds++;
  } else if (market.downOdds < 0.35) {
    signals.push(`Down underdog (${(market.downOdds * 100).toFixed(0)}%)`);
    score -= 1.5;
    signalTypes.odds++;
  }
  
  // 4. Grok sentiment
  const assetSentiment = sentiment[market.asset];
  if (assetSentiment) {
    const conf = assetSentiment.confidence || 0.5;
    
    // Breaking news is HUGE - separate signal type
    if (assetSentiment.breaking_news) {
      hasBreakingNews = true;
      signals.push('⚡ BREAKING NEWS');
      signalTypes.breaking++;
      score *= 1.5;  // Amplify existing signals
      
      if (assetSentiment.sentiment === 'bullish') {
        score += 3;
      } else if (assetSentiment.sentiment === 'bearish') {
        score -= 3;
      }
    } else {
      // Regular sentiment
      if (assetSentiment.sentiment === 'bullish' && conf > 0.6) {
        signals.push(`Grok: bullish (${(conf*100).toFixed(0)}%)`);
        score += conf * 2;
        signalTypes.sentiment++;
      } else if (assetSentiment.sentiment === 'bearish' && conf > 0.6) {
        signals.push(`Grok: bearish (${(conf*100).toFixed(0)}%)`);
        score -= conf * 2;
        signalTypes.sentiment++;
      }
    }
  }
  
  // 5. Correlation (BTC leads)
  if (market.asset !== 'BTC' && correlationSignals.length > 0) {
    for (const corr of correlationSignals) {
      signals.push(`📈 ${corr.message}`);
      signalTypes.correlation++;
      if (corr.direction === 'Up') {
        score += 2;
      } else {
        score -= 2;
      }
    }
  }
  
  // 6. ARB: Price-to-odds arbitrage
  // If real price moved significantly but market odds haven't caught up
  if (priceData && priceData.priceChange) {
    const priceMove = priceData.priceChange; // e.g., +0.5% or -0.3%
    const absPriceMove = Math.abs(priceMove);
    
    // Calculate what odds SHOULD be based on price move direction
    // If price up significantly, Up should be favored (>50%)
    // If price down significantly, Down should be favored (>50%)
    
    if (absPriceMove >= THRESHOLDS.arbMinPriceMove) {
      const expectedDirection = priceMove > 0 ? 'Up' : 'Down';
      const expectedOdds = 0.5 + Math.min(absPriceMove * 10, 0.3); // 50% + scaled boost (max 80%)
      const actualOdds = expectedDirection === 'Up' ? market.upOdds : market.downOdds;
      const discrepancy = expectedOdds - actualOdds;
      
      if (discrepancy >= THRESHOLDS.arbMinDiscrepancy) {
        arbOpportunity = {
          direction: expectedDirection,
          expectedOdds,
          actualOdds,
          discrepancy,
          priceMove
        };
        signals.push(`🎰 ARB: ${expectedDirection} (price ${priceMove > 0 ? '+' : ''}${(priceMove*100).toFixed(2)}%, odds lag ${(discrepancy*100).toFixed(1)}%)`);
        signalTypes.arb++;
        
        // Strong score boost for ARB opportunities
        if (expectedDirection === 'Up') {
          score += 3 + (discrepancy * 10);
        } else {
          score -= 3 + (discrepancy * 10);
        }
      }
    }
  }
  
  // 7. Momentum confirmation: 30-min price trend
  const priceHistory = loadPriceHistory();
  const assetPrices = priceHistory[market.asset] || [];
  if (assetPrices.length >= 2) {
    const thirtyMinsAgo = Date.now() - 30 * 60 * 1000;
    const oldEntry = assetPrices.find(p => new Date(p.timestamp).getTime() <= thirtyMinsAgo);
    const latestEntry = assetPrices[assetPrices.length - 1];
    if (oldEntry && latestEntry) {
      const trend = (latestEntry.price - oldEntry.price) / oldEntry.price;
      const trendDir = trend > 0 ? 'Up' : 'Down';
      const proposedDir = score > 0 ? 'Up' : 'Down';
      if (Math.abs(trend) > 0.001) { // Only if there's a meaningful trend
        if (trendDir === proposedDir) {
          score += 0.5;
          signals.push(`📈 30m momentum confirms (${(trend*100).toFixed(2)}%)`);
          signalTypes.momentum++;
        } else {
          score -= 1;
          signals.push(`📉 30m momentum opposes (${(trend*100).toFixed(2)}%)`);
          signalTypes.momentum++;
        }
      }
    }
  }

  // 8. Order Book Signal
  try {
    const obSignal = getOrderBookSignal(market.asset);
    // Cap total orderflow contribution to ±1.0 max
    let obScore = 0;
    const obParts = [];
    if (obSignal.direction) {
      const obDir = obSignal.direction === 'Up' ? 1 : -1;
      obScore += Math.min(Math.abs(Math.log(obSignal.imbalance)), 1) * 0.5 * obDir;
      obParts.push(`📊 OrderBook imbalance ${obSignal.imbalance.toFixed(2)} → ${obSignal.direction}`);
    }
    if (obSignal.largeSweep) {
      obScore += obSignal.direction === 'Up' ? 0.3 : -0.3;
      obParts.push('🐋 Large sweep detected (>$500K)');
    }
    if (obSignal.mmPull) {
      obScore += obSignal.direction === 'Up' ? 0.2 : -0.2;
      obParts.push('⚠️ MM bid pull detected');
    }
    // Clamp total orderflow to ±1.0
    obScore = Math.max(-1.0, Math.min(1.0, obScore));
    score += obScore;
    signals.push(...obParts);
    if (obParts.length > 0) signalTypes.orderflow++;
  } catch (e) { /* orderbook signal failed, continue */ }
  
  // 9. Liquidation Cascade Signal
  try {
    const liqSignal = getLiquidationSignal(market.asset);
    if (liqSignal.strength && liqSignal.direction) {
      const liqDir = liqSignal.direction === 'Up' ? 1 : -1;
      const weights = { moderate: 1.0, strong: 2.0, extreme: 3.0 };
      const w = weights[liqSignal.strength] || 0;
      score += w * liqDir;
      signals.push(`💥 Liquidations: $${(liqSignal.volume/1e6).toFixed(1)}M (${liqSignal.strength}) → ${liqSignal.direction}`);
      signalTypes.liquidation++;
    }
  } catch (e) { /* liquidation signal failed, continue */ }
  
  // 10. VWAP Signal
  try {
    const vwapValue = getVWAP(market.asset);
    if (vwapValue && priceData && priceData.latestPrice) {
      const deviation = (priceData.latestPrice - vwapValue) / vwapValue;
      // If price is >1% from VWAP, signal mean reversion
      if (Math.abs(deviation) > 0.01) {
        const vwapDir = deviation > 0 ? -1.0 : 1.0; // Mean reversion
        score += vwapDir;
        signals.push(`📏 VWAP deviation ${(deviation*100).toFixed(2)}%`);
        signalTypes.technical++;
      }
    }
  } catch (e) { /* vwap failed */ }
  
  // 11. Funding Rate Signal (contrarian)
  try {
    const fundRate = getFundingRate(market.asset);
    if (fundRate !== null && Math.abs(fundRate) > 0.0005) { // >0.05%
      const fundDir = fundRate > 0 ? -0.5 : 0.5; // Bet against crowd
      score += fundDir;
      signals.push(`💸 Funding ${(fundRate*100).toFixed(3)}% → contrarian ${fundRate > 0 ? 'Down' : 'Up'}`);
      signalTypes.technical++;
    }
  } catch (e) { /* funding failed */ }
  
  // ATR volatility regime: scale score based on volatility
  try {
    const assetPricesForATR = (loadPriceHistory()[market.asset] || []).map(p => p.price);
    if (assetPricesForATR.length >= 21) {
      // Calculate ATR from price history
      const atrs = [];
      for (let i = 1; i < assetPricesForATR.length; i++) {
        atrs.push(Math.abs(assetPricesForATR[i] - assetPricesForATR[i-1]));
      }
      const currentATR = atrs[atrs.length - 1];
      const avgATR = atrs.slice(-20).reduce((s,v) => s+v, 0) / Math.min(atrs.length, 20);
      const atrRatio = avgATR > 0 ? currentATR / avgATR : 1;
      
      if (atrRatio < 0.8) {
        score *= 0.5; // Low vol = halve signals (noise)
        signals.push(`🔇 Low vol regime (ATR ${atrRatio.toFixed(2)}x avg) — scores halved`);
      } else if (atrRatio > 1.6) {
        score *= 1.2; // High vol = slight boost (was 1.5x, too aggressive)
        signals.push(`🔊 High vol regime (ATR ${atrRatio.toFixed(2)}x avg) — scores boosted 1.2x`);
      }
    }
  } catch (e) { /* ATR failed */ }

  // Minimum score threshold
  if (Math.abs(score) < 1) return null;
  
  const direction = score > 0 ? 'Up' : 'Down';
  const marketOdds = direction === 'Up' ? market.upOdds : market.downOdds;
  
  // Calculate our "fair odds" based on signal strength
  // Anchored at 50% (coin flip) and pushed by score strength
  // Score of 1 = ~55%, Score of 3 = ~65%, Score of 5 = ~80%
  const rawConfidence = Math.min(0.50 + (Math.abs(score) / 6) * 0.30, 0.80);
  const fairOdds = rawConfidence;
  
  // Edge = how much better our odds are vs market
  const edge = fairOdds - marketOdds;
  
  const categoryCount = Object.values(signalTypes).filter(v => v > 0).length;
  
  return {
    direction,
    marketOdds,
    fairOdds,
    edge,
    confidence: rawConfidence,
    score,
    signals,
    categoryCount,
    signalTypes,
    hasBreakingNews,
    arbOpportunity,
    asset: market.asset,
    slug: market.slug,
    conditionId: market.conditionId,
    clobTokenIds: market.clobTokenIds
  };
}

// ========== SHOULD WE BET? (Edge-First + Tiered) ==========
function shouldBet(signal) {
  if (!signal) return { bet: false, reason: 'No signal' };
  
  const { confidence, categoryCount, edge, hasBreakingNews, marketOdds, arbOpportunity, asset, score, signalTypes } = signal;
  
  // Apply asset weight to edge (read dynamically from trading config, fallback to THRESHOLDS)
  const tradingConfig = loadTradingConfig();
  const dynamicWeights = tradingConfig.assetWeights || {};
  const assetBonus = dynamicWeights[asset] !== undefined ? dynamicWeights[asset] : ((THRESHOLDS.assetWeights && THRESHOLDS.assetWeights[asset]) || 0);
  const dirBonus = 0; // Direction weights removed per Donal's decision
  const adjustedEdge = edge + assetBonus + dirBonus;
  
  // Kill switch
  if (isKillSwitchOn()) {
    return { bet: false, reason: '🛑 Kill switch active — all trading paused' };
  }
  
  // SAFETY: Never bet on underdogs where market odds too low
  const minOdds = getParam('minMarketOdds', 0.40);
  if (marketOdds < minOdds) {
    return { bet: false, reason: `Market odds too low (${(marketOdds*100).toFixed(0)}% < ${(minOdds*100).toFixed(0)}% min)` };
  }
  
  // ===== WHALE SIGNAL DATA (market maker flow) =====
  const whaleSignal = signal.slug ? getWhaleSignal(asset, signal.slug) : null;
  const whaleActivity = getWhaleActivity(asset, 15);
  
  // ARB: Price-to-odds arbitrage opportunity
  // Gate: don't ARB trade if confidence is garbage (signals disagree with direction)
  const arbMinDisc = getParam('arbMinDiscrepancy', THRESHOLDS.arbMinDiscrepancy);
  const arbMinConf = getParam('arbMinConfidence', 0.45);
  if (isPathEnabled('arb') && arbOpportunity && arbOpportunity.discrepancy >= arbMinDisc && confidence >= arbMinConf) {
    // Count how many other signal categories AGREE with the ARB direction
    const arbDir = arbOpportunity.direction;
    const scoreAgrees = (arbDir === 'Up' && score > 0) || (arbDir === 'Down' && score < 0);
    const nonArbCategories = Object.entries(signalTypes)
      .filter(([k, v]) => k !== 'arb' && v > 0)
      .map(([k]) => k);
    const confirmTag = nonArbCategories.length > 0 
      ? ` [${scoreAgrees ? '✓' : '✗'} ${nonArbCategories.join('+')} ${scoreAgrees ? 'confirms' : 'opposes'}]`
      : ' [no other signals]';
    
    // Whale flow tag — does market maker flow agree?
    let whaleTag = '';
    let whaleConfirmed = false;
    if (whaleSignal && whaleSignal.active) {
      const whaleAgrees = (arbDir === 'Up' && whaleSignal.flowImbalance > 0.15) || (arbDir === 'Down' && whaleSignal.flowImbalance < -0.15);
      whaleConfirmed = whaleAgrees;
      whaleTag = ` [🐋 ${whaleAgrees ? '✓' : '✗'} flow ${whaleSignal.dominantSide} ${(whaleSignal.flowImbalance*100).toFixed(0)}%]`;
    }
    
    return { 
      bet: true, 
      reason: `🎰 ARB: Price ${arbOpportunity.priceMove > 0 ? '+' : ''}${(arbOpportunity.priceMove*100).toFixed(2)}%, odds lag ${(arbOpportunity.discrepancy*100).toFixed(1)}%${confirmTag}${whaleTag}`,
      arbConfirmed: scoreAgrees,
      whaleConfirmed,
      confirmingSignals: nonArbCategories,
      nonArbScore: score - (arbDir === 'Up' ? 3 + arbOpportunity.discrepancy * 10 : -(3 + arbOpportunity.discrepancy * 10))
    };
  }
  
  // Breaking news — improved with multiple quality gates
  const newsMinConf = getParam('breakingNewsMinConfidence', THRESHOLDS.breakingNewsMinConfidence);
  if (isPathEnabled('breakingNews') && hasBreakingNews && confidence >= newsMinConf) {
    const newsState = loadNewsState();
    const assetSentiment = signal.asset ? (global._lastSentiment || {})[signal.asset] : null;
    
    // Gate 1: Cooldown — don't re-trade same asset within 15 min
    if (isNewsCooldownActive(asset, newsState)) {
      return { bet: false, reason: `⚡ NEWS cooldown active for ${asset}` };
    }
    
    // Gate 2: Rate limit — max 3 news trades per hour total
    if (isNewsRateLimited(newsState)) {
      return { bet: false, reason: `⚡ NEWS rate limited (${THRESHOLDS.breakingNewsMaxPerHour}/hr max)` };
    }
    
    // Gate 3: Stale news — skip if we've seen this exact sentiment before
    const newsSummary = assetSentiment?.summary || '';
    if (isNewsStale(newsSummary, newsState)) {
      return { bet: false, reason: `⚡ NEWS already seen (stale)` };
    }
    
    // Gate 4: Price confirmation — news should move price
    if (THRESHOLDS.breakingNewsRequirePriceMove && signal.arbOpportunity) {
      // Has price move — good, news is confirmed by market
    } else if (THRESHOLDS.breakingNewsRequirePriceMove) {
      // Check if there's ANY price movement in the signal direction
      const priceHistory = loadPriceHistory();
      const assetPrices = priceHistory[asset] || [];
      if (assetPrices.length >= 2) {
        const latest = assetPrices[assetPrices.length - 1].price;
        const prev = assetPrices[assetPrices.length - 2].price;
        const move = (latest - prev) / prev;
        const directionMatch = (signal.direction === 'Up' && move > 0) || (signal.direction === 'Down' && move < 0);
        if (!directionMatch || Math.abs(move) < THRESHOLDS.breakingNewsMinPriceMove) {
          return { bet: false, reason: `⚡ NEWS no price confirmation (${(move*100).toFixed(2)}% move, need ${signal.direction.toLowerCase()})` };
        }
      }
    }
    
    // All gates passed — record and trade
    recordNewsTrade(asset, newsSummary, newsState);
    return { bet: true, reason: `⚡ BREAKING NEWS (${(confidence*100).toFixed(0)}% conf, price-confirmed)` };
  }
  
  // Dynamic parameters from dashboard
  const minEdge = getParam('minEdge', THRESHOLDS.minEdge);
  const p1Conf = getParam('path1Confidence', THRESHOLDS.path1.confidence);
  const p1Cats = getParam('path1Categories', THRESHOLDS.path1.categories);
  const p2Conf = getParam('path2Confidence', THRESHOLDS.path2.confidence);
  const p2Cats = getParam('path2Categories', THRESHOLDS.path2.categories);
  const p3Conf = getParam('path3Confidence', THRESHOLDS.path3.confidence);
  const p3Cats = getParam('path3Categories', THRESHOLDS.path3.categories);

  // Check minimum edge — reject only if both raw AND weighted are below threshold
  if (edge < minEdge && adjustedEdge < minEdge) {
    return { bet: false, reason: `Insufficient edge (raw ${(edge*100).toFixed(1)}%, weighted ${(adjustedEdge*100).toFixed(1)}% < ${minEdge*100}% required)${assetBonus ? ' ['+asset+' weight: '+((assetBonus>0?'+':'')+((assetBonus*100).toFixed(0)))+'%]' : ''}` };
  }
  
  // ===== ORIGINAL PATHS (raw edge — no asset weight) =====
  if (edge >= minEdge) {
    if (isPathEnabled('path1') && confidence >= p1Conf && categoryCount >= p1Cats) {
      return { bet: true, reason: `Path1: ${categoryCount} categories, ${(confidence*100).toFixed(0)}% conf, ${(edge*100).toFixed(1)}% edge` };
    }
    if (isPathEnabled('path2') && confidence >= p2Conf && categoryCount >= p2Cats) {
      return { bet: true, reason: `Path2: ${categoryCount} categories, ${(confidence*100).toFixed(0)}% conf, ${(edge*100).toFixed(1)}% edge` };
    }
    if (isPathEnabled('path3') && confidence >= p3Conf && categoryCount >= p3Cats) {
      return { bet: true, reason: `Path3: High conviction (${(confidence*100).toFixed(0)}%), ${(edge*100).toFixed(1)}% edge` };
    }
  }
  
  // ===== WEIGHTED PATHS (edge + asset weight — A/B test) =====
  if (assetBonus !== 0 && adjustedEdge >= minEdge) {
    const wTag = `${asset} ${assetBonus > 0 ? '+' : ''}${(assetBonus*100).toFixed(0)}%`;
    if (isPathEnabled('path1') && confidence >= p1Conf && categoryCount >= p1Cats) {
      return { bet: true, reason: `Path1W[${wTag}]: ${categoryCount} categories, ${(confidence*100).toFixed(0)}% conf, ${(adjustedEdge*100).toFixed(1)}% edge` };
    }
    if (isPathEnabled('path2') && confidence >= p2Conf && categoryCount >= p2Cats) {
      return { bet: true, reason: `Path2W[${wTag}]: ${categoryCount} categories, ${(confidence*100).toFixed(0)}% conf, ${(adjustedEdge*100).toFixed(1)}% edge` };
    }
    if (isPathEnabled('path3') && confidence >= p3Conf && categoryCount >= p3Cats) {
      return { bet: true, reason: `Path3W[${wTag}]: High conviction (${(confidence*100).toFixed(0)}%), ${(adjustedEdge*100).toFixed(1)}% edge` };
    }
  }
  
  // ===== WHALE FLOW PATH (if whale agrees with direction, take the trade) =====
  // Testing mode: no confidence/category gates — whale agreement is the signal
  if (isPathEnabled('whale') && whaleSignal && whaleSignal.active) {
    const direction = score > 0 ? 'Up' : 'Down';
    const whaleAgrees = (direction === 'Up' && whaleSignal.flowImbalance > 0.15) || (direction === 'Down' && whaleSignal.flowImbalance < -0.15);
    
    if (whaleAgrees && edge >= minEdge) {
      return {
        bet: true,
        reason: `🐋 WHALE: whale ${whaleSignal.dominantSide} agrees (imbalance ${(whaleSignal.flowImbalance*100).toFixed(0)}%, ${whaleSignal.tradeCount} trades, conf ${(whaleSignal.confidence*100).toFixed(0)}%) | bot: ${categoryCount} cats, ${(confidence*100).toFixed(0)}% conf, ${(edge*100).toFixed(1)}% edge`,
        whaleConfirmed: true
      };
    }
  }
  
  return { bet: false, reason: `No path matched (${(confidence*100).toFixed(0)}% conf, ${categoryCount} cats, raw ${(edge*100).toFixed(1)}%/weighted ${(adjustedEdge*100).toFixed(1)}% edge)` };
}

// ========== MACRO EVENT TRADING PATH (Separate) ==========
async function checkMacroTrades(markets, currentPrices) {
  const macroAnalysis = await analyzeMacroEvents();
  const trades = [];
  
  // Log macro state
  if (macroAnalysis.upcomingEvents.length > 0) {
    console.log('\n📅 MACRO: Upcoming events:');
    macroAnalysis.upcomingEvents.forEach(e => {
      console.log(`   ${e.title} in ${e.minutesAway} min (forecast: ${e.forecast})`);
    });
  }
  
  if (macroAnalysis.avoidTrading) {
    console.log(`\n⚠️  MACRO: ${macroAnalysis.reason}`);
    return { trades: [], blocked: true, reason: macroAnalysis.reason };
  }
  
  if (macroAnalysis.tradingSignals.length === 0) {
    return { trades: [], blocked: false, reason: 'No macro signals' };
  }
  
  console.log(`\n📊 MACRO: ${macroAnalysis.tradingSignals.length} trading signal(s):`);
  
  for (const signal of macroAnalysis.tradingSignals) {
    console.log(`   ${signal.title}: ${signal.direction} (${(signal.confidence*100).toFixed(0)}% conf) — ${signal.reason}`);
    
    // Find matching markets for each asset this signal applies to
    for (const asset of signal.assets) {
      const market = markets.find(m => m.asset === asset);
      if (!market) continue;
      
      const marketOdds = signal.direction === 'Up' ? market.upOdds : market.downOdds;
      
      // Same min odds filter
      if (marketOdds < 0.40) {
        console.log(`   ⏭️ ${asset}: odds too low (${(marketOdds*100).toFixed(0)}%)`);
        continue;
      }
      
      const edge = signal.confidence - marketOdds;
      if (edge < 0.03) {
        console.log(`   ⏭️ ${asset}: insufficient edge (${(edge*100).toFixed(1)}%)`);
        continue;
      }
      
      trades.push({
        asset,
        direction: signal.direction,
        entryOdds: marketOdds,
        confidence: signal.confidence,
        edge,
        signals: [`📅 MACRO: ${signal.reason}`],
        signalTypes: { macro: 1 },
        reason: `📅 MACRO: ${signal.title} (${signal.direction}, ${(signal.confidence*100).toFixed(0)}% conf, ${(edge*100).toFixed(1)}% edge)`,
        slug: market.slug || market.id,
        conditionId: market.conditionId,
        clobTokenIds: market.clobTokenIds,
        isMacro: true
      });
    }
  }
  
  return { trades, blocked: false, reason: `${trades.length} macro trade(s)` };
}

// ========== LOG TRADE TO NOTION ==========
async function logTrade(trade) {
  try {
    // Determine trade mode tag
    const mode = readTradingMode();
    const modeTag = mode === 'real' && !isKillSwitchActive() ? '💰 REAL' : '📄 PAPER';
    
    // Always log to Notion (paper trade record)
    const windowStart = new Date(trade.windowStart);
    const elapsedMinutes = Math.round(((new Date() - windowStart) / 60000) * 10) / 10;
    
    // Build detailed signal breakdown
    const signalParts = [
      `[${modeTag}] [${elapsedMinutes}m]`,
      `Reason: ${trade.reason || 'none'}`,
      `Score: ${trade.score || 'n/a'}`,
      `Signals: ${(trade.signals || []).join(', ')}`,
    ];
    // Add signal type breakdown
    if (trade.signalTypes) {
      const active = Object.entries(trade.signalTypes).filter(([,v]) => v > 0).map(([k,v]) => `${k}:${v}`);
      if (active.length) signalParts.push(`Types: ${active.join(', ')}`);
    }
    // Add Grok sentiment detail (the actual news/reasoning)
    if (trade.sentimentDetail) {
      signalParts.push(`Grok: ${trade.sentimentDetail}`);
    }
    const signalText = signalParts.join(' | ').slice(0, 2000);
    
    // Determine if this is a real trade attempt
    const isRealMode = mode === 'real' && !isKillSwitchActive();
    const stake = getStakeForConfidence(trade.confidence || 0, config.stakePerTrade);
    let realResult = null;
    let tradeStatus = 'Pending';
    let executionNote = '';
    
    // Execute real trade FIRST if in real mode
    if (isRealMode) {
      console.log(`   💰 REAL MODE — executing on Polymarket...`);
      realResult = await executeRealTradeTaker({ ...trade, stake });
      if (realResult.success) {
        console.log(`   ✅ REAL ORDER: ${realResult.orderId} | $${stake}`);
        executionNote = ` | ORDER: ${realResult.orderId}`;
      } else {
        console.log(`   ❌ REAL ORDER REJECTED: ${realResult.reason}`);
        tradeStatus = 'Rejected';
        executionNote = ` | REJECTED: ${realResult.reason}`;
      }
    }
    
    // Log to Notion with mode tag and execution result
    const notionPage = await notion.pages.create({
      parent: { database_id: config.notionDatabaseId },
      properties: {
        'Name': { title: [{ text: { content: `${trade.asset} ${trade.direction} @ ${(trade.entryOdds * 100).toFixed(1)}%` } }] },
        'Asset': { select: { name: trade.asset } },
        'Direction': { select: { name: trade.direction } },
        'Entry Odds': { number: trade.entryOdds },
        'Stake': { number: stake },
        'Result': { select: { name: tradeStatus } },
        'Confidence': { number: trade.confidence || 0 },
        'Market URL': { url: `https://polymarket.com/event/${trade.slug}` },
        'Window Start': { date: { start: trade.windowStart } },
        'Window End': { date: { start: trade.windowEnd } },
        'Signals': { rich_text: [{ text: { content: signalText + executionNote } }] }
      }
    });
    console.log(`📝 TRADE LOGGED: ${trade.asset} ${trade.direction} @ ${(trade.entryOdds * 100).toFixed(1)}% [${modeTag}]${executionNote}`);
    console.log(`   Fair odds: ${((trade.fairOdds || trade.confidence || 0) * 100).toFixed(1)}% | Edge: ${((trade.edge || 0) * 100).toFixed(1)}%`);
    
    recordBet(trade.slug, trade);
    return true;
  } catch (error) {
    console.error('Notion error:', error.message);
    return false;
  }
}

// ========== MAIN MONITOR ==========
async function monitor() {
  const now = new Date();
  console.log(`\n${'='.repeat(70)}`);
  const tradingMode = readTradingMode();
  const killActive = isKillSwitchActive();
  const modeDisplay = killActive ? '🛑 KILLED' : tradingMode === 'real' ? '💰 REAL' : '📄 PAPER';
  console.log(`🔍 POLYMARKET 15M MONITOR V2 - ${now.toISOString()}`);
  console.log(`   Mode: ${modeDisplay} | Thresholds: ${THRESHOLDS.minEdge*100}% min edge | Paths: 65%/3cat, 70%/2cat, 80%/1cat`);
  console.log('='.repeat(70));
  
  // Fetch markets
  const events = await fetchMarkets();
  if (!events || events.length === 0) {
    console.log('⏳ No live 15M markets');
    return;
  }
  
  const markets = events.map(parseMarket).filter(Boolean);
  
  // Load histories
  const history = loadHistory();
  const priceHistory = loadPriceHistory();
  
  // Fetch real crypto prices for correlation
  console.log('\n💰 Fetching crypto prices...');
  const currentPrices = await fetchCryptoPrices();
  
  // ========== PRICE FEED HEALTH CHECK ==========
  const priceAlerts = [];
  const expectedAssets = ['BTC', 'ETH', 'SOL'];
  for (const asset of expectedAssets) {
    if (!currentPrices || !currentPrices[asset]?.price) {
      priceAlerts.push(`🚨 ${asset} price feed DEAD — no data returned!`);
    }
  }
  // Check for stale price history (>20 min old = missed 4+ cycles)
  for (const asset of expectedAssets) {
    const lastEntry = priceHistory[asset]?.[priceHistory[asset].length - 1];
    if (lastEntry) {
      const ageMs = now - new Date(lastEntry.timestamp).getTime();
      if (ageMs > 20 * 60 * 1000) {
        priceAlerts.push(`🚨 ${asset} price history STALE — last update ${Math.round(ageMs / 60000)} min ago!`);
      }
    }
  }
  if (priceAlerts.length > 0) {
    console.log('\n' + '⚠️'.repeat(20));
    console.log('⚠️  PRICE FEED ALERT — ARB TRADES WILL NOT FIRE WITHOUT PRICES');
    for (const alert of priceAlerts) console.log('  ' + alert);
    console.log('⚠️'.repeat(20));
    // Write alert to bot-status so dashboard shows it
    writeBotStatus([], 'price_feed_error', priceAlerts);
    // Write alert file — cron agent checks this and notifies
    const alertFile = __dirname + '/price-alert.json';
    try {
      const existing = fs.existsSync(alertFile) ? JSON.parse(fs.readFileSync(alertFile, 'utf8')) : {};
      // Only flag once per hour to avoid spam
      if (!existing.lastNotified || (Date.now() - existing.lastNotified > 3600000)) {
        fs.writeFileSync(alertFile, JSON.stringify({ alerts: priceAlerts, timestamp: new Date().toISOString(), lastNotified: Date.now(), acknowledged: false }, null, 2));
        console.log('🔔 ALERT FLAG SET — cron agent should notify Donal');
      }
    } catch(e) { console.log('Alert file write failed:', e.message); }
  }
  
  // Update price history
  if (currentPrices) {
    for (const asset of ['BTC', 'ETH', 'SOL']) {
      if (!priceHistory[asset]) priceHistory[asset] = [];
      if (currentPrices[asset]?.price) {
        priceHistory[asset].push({
          price: currentPrices[asset].price,
          timestamp: now.toISOString()
        });
        // Keep last 50 samples
        if (priceHistory[asset].length > 50) {
          priceHistory[asset] = priceHistory[asset].slice(-50);
        }
      }
    }
    savePriceHistory(priceHistory);
  }
  
  // Record session data (EU/US open tracking)
  try { recordSessionData(); } catch (e) { console.log('⚠️  Session tracker error:', e.message); }
  
  // Analyze BTC correlation
  const correlationSignals = analyzeCorrelation(priceHistory, currentPrices);
  if (correlationSignals.length > 0) {
    console.log('\n📈 CORRELATION DETECTED:');
    for (const sig of correlationSignals) {
      console.log(`   ${sig.message}`);
    }
  }
  
  // Get Grok sentiment
  console.log('\n🤖 Fetching Grok sentiment...');
  const sentiment = await getGrokSentiment();
  global._lastSentiment = sentiment;  // Make accessible to shouldBet for news dedup
  
  // Update odds history
  for (const market of markets) {
    if (!history[market.asset]) history[market.asset] = [];
    history[market.asset].push({ upOdds: market.upOdds, timestamp: now.toISOString() });
    if (history[market.asset].length > 100) {
      history[market.asset] = history[market.asset].slice(-100);
    }
  }
  saveHistory(history);
  
  // Analyze each market
  console.log('\n📊 MARKET ANALYSIS:\n');
  console.log('Asset | Market | Fair  | Edge  | Conf | Categories | Decision');
  console.log('------|--------|-------|-------|------|------------|' + '-'.repeat(30));
  
  const trades = [];
  
  for (const market of markets) {
    const indicators = calculateIndicators(history, market.asset);
    
    // Calculate recent price change for ARB detection
    let priceData = null;
    const assetPrices = priceHistory[market.asset];
    if (assetPrices && assetPrices.length >= 2) {
      const latestPrice = assetPrices[assetPrices.length - 1].price;
      const prevPrice = assetPrices[assetPrices.length - 2].price;
      const priceChange = (latestPrice - prevPrice) / prevPrice;
      priceData = { priceChange, latestPrice, prevPrice };
    }
    
    const signal = generateSignal(market, indicators, sentiment, correlationSignals, priceData);
    
    const decision = shouldBet(signal);
    
    // Format output
    const marketOddsStr = signal ? `${(signal.marketOdds * 100).toFixed(0)}%` : '-';
    const fairOddsStr = signal ? `${(signal.fairOdds * 100).toFixed(0)}%` : '-';
    const edgeStr = signal ? `${(signal.edge * 100).toFixed(0)}%` : '-';
    const confStr = signal ? `${(signal.confidence * 100).toFixed(0)}%` : '-';
    const catStr = signal ? `${signal.categoryCount}` : '-';
    const decisionStr = decision.bet ? `✅ BET ${signal.direction}` : `❌ ${decision.reason.slice(0, 25)}`;
    
    console.log(
      `${market.asset.padEnd(5)} | ` +
      `${marketOddsStr.padStart(6)} | ` +
      `${fairOddsStr.padStart(5)} | ` +
      `${edgeStr.padStart(5)} | ` +
      `${confStr.padStart(4)} | ` +
      `${catStr.padStart(10)} | ` +
      decisionStr
    );
    
    if (signal && signal.signals.length > 0) {
      console.log(`      └─ ${signal.signals.join(', ')}`);
    }
    
    if (decision.bet) {
      const windowEnd = new Date(market.endTime);
      const minsRemaining = (windowEnd - now) / 1000 / 60;
      
      const windowStart = new Date(market.startTime);
      const minsElapsed = (now - windowStart) / 1000 / 60;
      if (minsElapsed < 2) {
        console.log(`      ⏱️  Skipping - only ${minsElapsed.toFixed(1)} mins in (need 2+ mins for odds to settle)`);
      } else if (minsRemaining < 5) {
        console.log(`      ⏱️  Skipping - only ${minsRemaining.toFixed(1)} mins left`);
      } else if (hasAlreadyBet(market.slug)) {
        console.log(`      ⏭️  Already bet on this market`);
      } else {
        console.log(`      🎯 ${decision.reason}`);
        // Capture Grok sentiment detail for this asset
        const assetSentiment = sentiment[market.asset];
        let sentimentDetail = '';
        if (assetSentiment) {
          sentimentDetail = [
            assetSentiment.sentiment || 'neutral',
            assetSentiment.confidence ? `(${(assetSentiment.confidence*100).toFixed(0)}%)` : '',
            assetSentiment.breaking_news ? '⚡BREAKING' : '',
            assetSentiment.summary || ''
          ].filter(Boolean).join(' ');
        }
        
        trades.push({
          asset: market.asset,
          direction: signal.direction,
          entryOdds: signal.marketOdds,
          fairOdds: signal.fairOdds,
          edge: signal.edge,
          slug: market.slug,
          conditionId: market.conditionId,
          clobTokenIds: market.clobTokenIds,
          windowStart: market.startTime,
          windowEnd: market.endTime,
          confidence: signal.confidence,
          signals: signal.signals,
          score: signal.score,
          signalTypes: signal.signalTypes,
          sentimentDetail,
          reason: decision.reason,
          // Detailed signal breakdown for analysis
          signalDetails: {
            score: signal.score,
            signalTypes: signal.signalTypes,
            hasBreakingNews: signal.hasBreakingNews,
            hasArb: !!signal.arbOpportunity,
            arbDiscrepancy: signal.arbOpportunity?.discrepancy || 0,
            categoryCount: signal.categoryCount,
            // ARB + signal confirmation tracking
            arbConfirmed: decision.arbConfirmed,
            confirmingSignals: decision.confirmingSignals || [],
            nonArbScore: decision.nonArbScore || 0,
            // Raw indicator values
            indicators: {
              rsi: indicators.rsi,
              sma: indicators.sma,
              momentum: indicators.momentum
            },
            priceChange: priceData?.priceChange || 0
          }
        });
      }
    }
  }
  
  // ========== MACRO EVENT PATH (separate) ==========
  const macroResult = await checkMacroTrades(markets, currentPrices);
  const macroTrades = [];
  
  if (macroResult.blocked) {
    console.log(`\n⚠️  MACRO BLOCK: ${macroResult.reason} — skipping ALL trades this round`);
    // Don't execute any trades (including regular ones) during macro event windows
    console.log('\n' + '='.repeat(70) + '\n');
    return;
  }
  
  if (macroResult.trades.length > 0) {
    console.log(`\n📅 MACRO TRADES: ${macroResult.trades.length} signal(s)`);
    for (const mt of macroResult.trades) {
      if (hasAlreadyBet(mt.slug)) {
        console.log(`   ⏭️ ${mt.asset} ${mt.direction}: Already bet on this market`);
      } else {
        console.log(`   📅 ${mt.asset} ${mt.direction}: ${mt.reason}`);
        // Find the matching market for window times
        const market = markets.find(m => m.asset === mt.asset);
        macroTrades.push({
          ...mt,
          windowStart: market?.startTime,
          windowEnd: market?.endTime,
          signalDetails: {
            score: 0,
            signalTypes: { macro: 1 },
            hasBreakingNews: false,
            hasArb: false,
            arbDiscrepancy: 0,
            categoryCount: 1,
            indicators: {},
            priceChange: 0,
            isMacro: true
          }
        });
      }
    }
  }
  
  // Execute regular trades
  if (trades.length > 0) {
    console.log(`\n🎯 ${trades.length} REGULAR TRADE(S) TO EXECUTE:`);
    for (const trade of trades) {
      await logTrade(trade);
    }
  }
  
  // Execute macro trades (tagged separately in Notion for tracking)
  if (macroTrades.length > 0) {
    console.log(`\n📅 ${macroTrades.length} MACRO TRADE(S) TO EXECUTE:`);
    for (const trade of macroTrades) {
      // Tag signals with MACRO prefix for easy filtering
      trade.signals = trade.signals.map(s => s.startsWith('📅') ? s : `📅 ${s}`);
      await logTrade(trade);
    }
  }
  
  if (trades.length === 0 && macroTrades.length === 0) {
    console.log('\n✋ No value bets this round');
  }
  
  // Print Grok summaries
  if (Object.keys(sentiment).length > 0) {
    console.log('\n📱 GROK SENTIMENT:');
    for (const [asset, data] of Object.entries(sentiment)) {
      const newsTag = data.breaking_news ? '⚡' : '  ';
      if (data.summary) {
        console.log(`  ${newsTag} ${asset}: ${data.sentiment || 'neutral'} - ${data.summary.slice(0, 60)}...`);
      }
    }
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
}

// Clean up old trades
function cleanupOldTrades(currentSlugs) {
  const trades = loadActiveTrades();
  const cleaned = {};
  for (const [slug, trade] of Object.entries(trades)) {
    if (currentSlugs.includes(slug)) {
      cleaned[slug] = trade;
    }
  }
  saveActiveTrades(cleaned);
}

// Write bot status for dashboard
function writeBotStatus(trades = [], status = 'ok', alerts = [], errorMsg = null) {
  const now = Date.now();
  const tradingConfig = loadTradingConfig();
  
  // Track consecutive errors and last successful run
  let prevStatus = {};
  try { prevStatus = JSON.parse(fs.readFileSync('./bot-status.json', 'utf8')); } catch {}
  
  const consecutiveErrors = status === 'error' 
    ? (prevStatus.consecutiveErrors || 0) + 1 
    : 0;
  const lastSuccessfulRun = status === 'ok' 
    ? new Date().toISOString() 
    : (prevStatus.lastSuccessfulRun || null);
  const erroringSince = status === 'error' && !prevStatus.erroringSince
    ? new Date().toISOString()
    : (status === 'error' ? prevStatus.erroringSince : null);
  
  const statusFile = {
    lastRun: new Date().toISOString(),
    status,
    tradesPlaced: trades.length,
    consecutiveErrors,
    lastSuccessfulRun,
    erroringSince,
    lastError: status === 'error' ? (errorMsg || 'Unknown error') : null,
    thresholds: THRESHOLDS,
    stakeTiers: STAKE_TIERS.map(t => ({ ...t, stake: Math.round(10 * t.multiplier) })),
    pathsEnabled: tradingConfig.paths || {},
    nextRun: new Date(now + 30000).toISOString(), // +30s
    ...(alerts.length > 0 && { alerts })
  };
  fs.writeFileSync('./bot-status.json', JSON.stringify(statusFile, null, 2));
  
  // Also update the state file for dashboard
  const stateDir = process.env.HOME + '/.openclaw/workspace/state';
  const cronsState = {
    jobs: [{
      id: "54d3c815-e34f-49b3-94cc-77c1f91b7bf4",
      name: "Polymarket 15M Monitor",
      enabled: true,
      schedule: { kind: "every", everyMs: 30000 },
      state: {
        nextRunAtMs: now + 300000,
        lastRunAtMs: now,
        lastStatus: status,
        lastDurationMs: 12000
      }
    }],
    updatedAt: new Date().toISOString()
  };
  try {
    fs.writeFileSync(stateDir + '/crons.json', JSON.stringify(cronsState, null, 2));
  } catch (e) { /* ignore */ }
}

// Run as persistent process with 30s loop
if (require.main === module) {
  // Initialize WebSocket feeds
  try { initPriceFeeds(); } catch(e) { console.log('⚠️ Price feeds init failed:', e.message); }
  try { initOrderBook(); } catch(e) { console.log('⚠️ OrderBook init failed:', e.message); }
  try { initLiquidation(); } catch(e) { console.log('⚠️ Liquidation init failed:', e.message); }
  
  // Wait 3s for WS connections to establish, then start loop
  let lastNotionLog = 0;
  const LOOP_INTERVAL = 30000; // 30 seconds
  const MIN_NOTION_INTERVAL = 120000; // Don't log to Notion more than once per 2 min (unless trade)
  
  setTimeout(async () => {
    async function runLoop() {
      try {
        await monitor();
        writeBotStatus([], 'ok');
        // Check results every 5 min
        if (Date.now() - lastNotionLog > 300000) {
          lastNotionLog = Date.now();
          try {
            const { checkResults } = require('./check-results.js');
            await checkResults();
          } catch (e) {
            console.log('⚠️  Results check skipped');
          }
        }
      } catch (err) {
        console.error('Monitor error:', err.message, '\nStack:', err.stack || 'no stack');
        writeBotStatus([], 'error', [], err.message);
      }
      // Whale tracker - check every 5 mins (market quality signal, not directional)
      if (!global._lastWhaleCheck || Date.now() - global._lastWhaleCheck > 300000) {
        try { await checkWhaleTrades(); global._lastWhaleCheck = Date.now(); } catch (e) { console.log('⚠️  Whale tracker error:', e.message); }
      }
    }
    
    // First run
    await runLoop();
    // Then every 30s
    setInterval(runLoop, LOOP_INTERVAL);
  }, 3000);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    try { shutdownPriceFeeds(); } catch(e) {}
    try { shutdownOrderBook(); } catch(e) {}
    try { shutdownLiquidation(); } catch(e) {}
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    try { shutdownPriceFeeds(); } catch(e) {}
    try { shutdownOrderBook(); } catch(e) {}
    try { shutdownLiquidation(); } catch(e) {}
    process.exit(0);
  });
}

module.exports = { monitor };
