#!/usr/bin/env node
/**
 * Polymarket Whale Tracker
 * Monitors wallet 0x732f189193d7a8c8bc8d8eb91f501a22736af081 (0x732F1 / Antique-Twig)
 * Tracks all crypto up/down trades with market conditions
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const WALLET = '0x732f189193d7a8c8bc8d8eb91f501a22736af081';
const API_URL = 'https://data-api.polymarket.com/activity';
const TRADES_FILE = path.join(__dirname, 'whale-trades.json');
const CRYPTO_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'];
const MAX_API_OFFSET = 3000;
const PAGE_SIZE = 100;

// Parse window timing from slug like "btc-updown-5m-1771635000" or title
function parseWindowFromTrade(trade) {
  const slug = trade.slug || trade.eventSlug || '';
  const title = trade.title || '';
  
  // Extract epoch from slug (last number)
  const epochMatch = slug.match(/(\d{10,})$/);
  let windowStart = null;
  let windowDuration = null;
  
  if (epochMatch) {
    windowStart = parseInt(epochMatch[1]) * 1000;
  }
  
  // Extract duration from slug (e.g., "5m", "15m")
  const durMatch = slug.match(/(\d+)m-\d{10}/);
  if (durMatch) {
    windowDuration = parseInt(durMatch[1]) * 60 * 1000;
  } else {
    // Try from title: "7:50PM-7:55PM" = 5min, "6PM" could be 15m
    const timeRange = title.match(/(\d{1,2}(?::\d{2})?(?:AM|PM))\s*-\s*(\d{1,2}(?::\d{2})?(?:AM|PM))/i);
    if (timeRange) {
      // Parse times to estimate duration
      const parseTime = (t) => {
        const m = t.match(/(\d{1,2})(?::(\d{2}))?(AM|PM)/i);
        if (!m) return 0;
        let h = parseInt(m[1]);
        const min = m[2] ? parseInt(m[2]) : 0;
        if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
        return h * 60 + min;
      };
      const start = parseTime(timeRange[1]);
      const end = parseTime(timeRange[2]);
      if (end > start) {
        windowDuration = (end - start) * 60 * 1000;
      }
    }
    if (!windowDuration) windowDuration = 15 * 60 * 1000; // default 15m
  }
  
  const windowEnd = windowStart ? windowStart + windowDuration : null;
  const tradeTs = trade.timestamp * 1000;
  const minutesIntoWindow = windowStart ? (tradeTs - windowStart) / 60000 : null;
  const minutesRemaining = windowEnd ? (windowEnd - tradeTs) / 60000 : null;
  
  return {
    windowStart: windowStart ? new Date(windowStart).toISOString() : null,
    windowEnd: windowEnd ? new Date(windowEnd).toISOString() : null,
    windowDurationMin: windowDuration / 60000,
    minutesIntoWindow: minutesIntoWindow !== null ? Math.round(minutesIntoWindow * 100) / 100 : null,
    minutesRemaining: minutesRemaining !== null ? Math.round(minutesRemaining * 100) / 100 : null,
  };
}

// Detect asset from title/slug
function detectAsset(trade) {
  const text = (trade.title || '') + ' ' + (trade.slug || '');
  for (const asset of CRYPTO_ASSETS) {
    if (text.toLowerCase().includes(asset.toLowerCase()) || 
        text.toLowerCase().includes(asset === 'BTC' ? 'bitcoin' : asset === 'ETH' ? 'ethereum' : asset === 'SOL' ? 'solana' : 'xrp')) {
      return asset;
    }
  }
  return null;
}

// Check if trade is a crypto up/down market
function isCryptoUpDown(trade) {
  const text = (trade.title || '') + ' ' + (trade.slug || '');
  return /up.?or.?down|updown/i.test(text) && detectAsset(trade) !== null;
}

// Load existing trades data
function loadTrades() {
  try {
    return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8'));
  } catch {
    return {
      wallet: WALLET,
      username: '0x732F1',
      trades: [],
      lastChecked: null,
      lastTimestamp: 0,
      stats: { totalTrades: 0, byAsset: {}, byDirection: {}, avgEntryTime: 0, winRate: 0 }
    };
  }
}

function saveTrades(data) {
  data.lastChecked = new Date().toISOString();
  // Recompute stats
  const trades = data.trades;
  data.stats.totalTrades = trades.length;
  data.stats.byAsset = {};
  data.stats.byDirection = {};
  let totalEntryTime = 0;
  let entryCount = 0;
  
  for (const t of trades) {
    data.stats.byAsset[t.asset] = (data.stats.byAsset[t.asset] || 0) + 1;
    data.stats.byDirection[t.direction] = (data.stats.byDirection[t.direction] || 0) + 1;
    if (t.minutesIntoWindow !== null) {
      totalEntryTime += t.minutesIntoWindow;
      entryCount++;
    }
  }
  data.stats.avgEntryTime = entryCount ? Math.round((totalEntryTime / entryCount) * 100) / 100 : 0;
  
  fs.writeFileSync(TRADES_FILE, JSON.stringify(data, null, 2));
}

// Fetch trades from API
async function fetchTrades(offset = 0, limit = PAGE_SIZE) {
  const url = `${API_URL}?user=${WALLET}&limit=${limit}&offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Process raw API trade into our format
function processTrade(raw) {
  const asset = detectAsset(raw);
  const window = parseWindowFromTrade(raw);
  
  return {
    timestamp: new Date(raw.timestamp * 1000).toISOString(),
    epochTimestamp: raw.timestamp,
    asset,
    direction: raw.outcome || (raw.outcomeIndex === 0 ? 'Up' : 'Down'),
    size: raw.size,
    usdcSize: raw.usdcSize,
    price: raw.price,
    side: raw.side,
    marketSlug: raw.slug || raw.eventSlug,
    transactionHash: raw.transactionHash,
    ...window,
  };
}

// Fetch new trades since last check
async function fetchNewTrades(data) {
  const lastTs = data.lastTimestamp || 0;
  let newTrades = [];
  let offset = 0;
  let done = false;
  
  while (!done && offset < MAX_API_OFFSET) {
    const batch = await fetchTrades(offset);
    if (!batch || batch.length === 0) break;
    
    for (const raw of batch) {
      if (raw.timestamp <= lastTs) {
        done = true;
        break;
      }
      if (raw.type !== 'TRADE') continue;
      if (!isCryptoUpDown(raw)) continue;
      newTrades.push(processTrade(raw));
    }
    
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    
    // Small delay to be nice to API
    await new Promise(r => setTimeout(r, 200));
  }
  
  return newTrades;
}

// Backfill: fetch all available trades (up to offset 3000)
async function backfill() {
  console.log('🐋 Starting whale trade backfill...');
  const data = loadTrades();
  const existingHashes = new Set(data.trades.map(t => t.transactionHash + t.price + t.size));
  let totalFetched = 0;
  let newCount = 0;
  
  for (let offset = 0; offset < MAX_API_OFFSET; offset += PAGE_SIZE) {
    process.stdout.write(`\r  Fetching offset ${offset}...`);
    try {
      const batch = await fetchTrades(offset);
      if (!batch || batch.length === 0) break;
      totalFetched += batch.length;
      
      for (const raw of batch) {
        if (raw.type !== 'TRADE') continue;
        if (!isCryptoUpDown(raw)) continue;
        const trade = processTrade(raw);
        const key = trade.transactionHash + trade.price + trade.size;
        if (!existingHashes.has(key)) {
          data.trades.push(trade);
          existingHashes.add(key);
          newCount++;
        }
      }
      
      if (batch.length < PAGE_SIZE) break;
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`\n  Error at offset ${offset}: ${err.message}`);
      break;
    }
  }
  
  // Sort by timestamp
  data.trades.sort((a, b) => (a.epochTimestamp || 0) - (b.epochTimestamp || 0));
  
  // Update lastTimestamp
  if (data.trades.length > 0) {
    data.lastTimestamp = data.trades[data.trades.length - 1].epochTimestamp;
  }
  
  saveTrades(data);
  console.log(`\n✅ Backfill complete. Fetched ${totalFetched} total records, ${newCount} new crypto trades. Total: ${data.trades.length}`);
  return data;
}

// Incremental check - call this from smart-monitor loop
async function checkNewTrades() {
  const data = loadTrades();
  const newTrades = await fetchNewTrades(data);
  
  if (newTrades.length > 0) {
    // Deduplicate
    const existingHashes = new Set(data.trades.map(t => t.transactionHash + t.price + t.size));
    let added = 0;
    for (const t of newTrades) {
      const key = t.transactionHash + t.price + t.size;
      if (!existingHashes.has(key)) {
        data.trades.push(t);
        existingHashes.add(key);
        added++;
      }
    }
    
    // Sort and update
    data.trades.sort((a, b) => (a.epochTimestamp || 0) - (b.epochTimestamp || 0));
    if (data.trades.length > 0) {
      data.lastTimestamp = data.trades[data.trades.length - 1].epochTimestamp;
    }
    saveTrades(data);
    
    if (added > 0) {
      console.log(`🐋 Whale tracker: ${added} new trades (total: ${data.trades.length})`);
    }
    return newTrades;
  }
  
  data.lastChecked = new Date().toISOString();
  fs.writeFileSync(TRADES_FILE, JSON.stringify(data, null, 2));
  return [];
}

// Analysis
function analyze(data) {
  if (!data) data = loadTrades();
  const trades = data.trades;
  if (trades.length === 0) return 'No trades to analyze.';
  
  const lines = [];
  lines.push(`# 🐋 Whale Analysis: ${data.username} (${data.wallet.slice(0,8)}...)`);
  lines.push(`\nAnalyzed: ${trades.length} crypto up/down trades`);
  lines.push(`Period: ${trades[0].timestamp} to ${trades[trades.length-1].timestamp}`);
  
  // By asset
  lines.push('\n## Trades by Asset');
  const byAsset = {};
  for (const t of trades) {
    if (!byAsset[t.asset]) byAsset[t.asset] = [];
    byAsset[t.asset].push(t);
  }
  for (const [asset, ts] of Object.entries(byAsset).sort((a,b) => b[1].length - a[1].length)) {
    const totalUSDC = ts.reduce((s, t) => s + (t.usdcSize || 0), 0);
    lines.push(`- **${asset}**: ${ts.length} trades ($${totalUSDC.toFixed(2)} USDC)`);
  }
  
  // By direction
  lines.push('\n## Direction Preference');
  const byDir = {};
  for (const t of trades) {
    if (!byDir[t.direction]) byDir[t.direction] = { count: 0, usdc: 0 };
    byDir[t.direction].count++;
    byDir[t.direction].usdc += t.usdcSize || 0;
  }
  for (const [dir, d] of Object.entries(byDir)) {
    lines.push(`- **${dir}**: ${d.count} trades ($${d.usdc.toFixed(2)} USDC) — ${(d.count/trades.length*100).toFixed(1)}%`);
  }
  
  // Entry timing
  lines.push('\n## Entry Timing (minutes into window)');
  const withTiming = trades.filter(t => t.minutesIntoWindow !== null && t.minutesIntoWindow >= 0);
  if (withTiming.length > 0) {
    const times = withTiming.map(t => t.minutesIntoWindow).sort((a,b) => a - b);
    const avg = times.reduce((s,t) => s+t, 0) / times.length;
    const median = times[Math.floor(times.length/2)];
    lines.push(`- Average: ${avg.toFixed(2)} min`);
    lines.push(`- Median: ${median.toFixed(2)} min`);
    lines.push(`- Range: ${times[0].toFixed(2)} - ${times[times.length-1].toFixed(2)} min`);
    
    // Buckets
    const early = withTiming.filter(t => t.minutesIntoWindow < 3).length;
    const mid = withTiming.filter(t => t.minutesIntoWindow >= 3 && t.minutesIntoWindow < 10).length;
    const late = withTiming.filter(t => t.minutesIntoWindow >= 10).length;
    lines.push(`- Early (<3m): ${early} (${(early/withTiming.length*100).toFixed(1)}%)`);
    lines.push(`- Mid (3-10m): ${mid} (${(mid/withTiming.length*100).toFixed(1)}%)`);
    lines.push(`- Late (>10m): ${late} (${(late/withTiming.length*100).toFixed(1)}%)`);
  }
  
  // Price/odds distribution
  lines.push('\n## Entry Prices (odds they buy at)');
  const prices = trades.map(t => t.price).filter(p => p > 0).sort((a,b) => a - b);
  if (prices.length > 0) {
    const avgPrice = prices.reduce((s,p) => s+p, 0) / prices.length;
    const medianPrice = prices[Math.floor(prices.length/2)];
    lines.push(`- Average: ${avgPrice.toFixed(3)}`);
    lines.push(`- Median: ${medianPrice.toFixed(3)}`);
    lines.push(`- Range: ${prices[0].toFixed(3)} - ${prices[prices.length-1].toFixed(3)}`);
    
    // Price buckets
    const cheap = prices.filter(p => p < 0.3).length;
    const fair = prices.filter(p => p >= 0.3 && p < 0.6).length;
    const expensive = prices.filter(p => p >= 0.6).length;
    lines.push(`- Cheap (<0.30): ${cheap} (${(cheap/prices.length*100).toFixed(1)}%)`);
    lines.push(`- Fair (0.30-0.60): ${fair} (${(fair/prices.length*100).toFixed(1)}%)`);
    lines.push(`- Expensive (>0.60): ${expensive} (${(expensive/prices.length*100).toFixed(1)}%)`);
  }
  
  // Trade sizes
  lines.push('\n## Trade Sizes (USDC)');
  const sizes = trades.map(t => t.usdcSize).filter(s => s > 0).sort((a,b) => a - b);
  if (sizes.length > 0) {
    const avgSize = sizes.reduce((s,v) => s+v, 0) / sizes.length;
    const totalSize = sizes.reduce((s,v) => s+v, 0);
    lines.push(`- Total volume: $${totalSize.toFixed(2)}`);
    lines.push(`- Average: $${avgSize.toFixed(2)}`);
    lines.push(`- Median: $${sizes[Math.floor(sizes.length/2)].toFixed(2)}`);
    lines.push(`- Max: $${sizes[sizes.length-1].toFixed(2)}`);
  }
  
  // Window duration preference
  lines.push('\n## Window Duration Preference');
  const byDuration = {};
  for (const t of trades) {
    const d = t.windowDurationMin || 'unknown';
    byDuration[d] = (byDuration[d] || 0) + 1;
  }
  for (const [dur, count] of Object.entries(byDuration).sort((a,b) => b[1] - a[1])) {
    lines.push(`- ${dur} min: ${count} trades (${(count/trades.length*100).toFixed(1)}%)`);
  }
  
  // Hourly distribution
  lines.push('\n## Trading Hours (UTC)');
  const byHour = {};
  for (const t of trades) {
    const h = new Date(t.timestamp).getUTCHours();
    byHour[h] = (byHour[h] || 0) + 1;
  }
  const sortedHours = Object.entries(byHour).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));
  for (const [h, count] of sortedHours) {
    const bar = '█'.repeat(Math.ceil(count / Math.max(...Object.values(byHour)) * 20));
    lines.push(`- ${String(h).padStart(2,'0')}:00 ${bar} ${count}`);
  }
  
  // Side (BUY vs SELL)
  lines.push('\n## Side (BUY vs SELL)');
  const buys = trades.filter(t => t.side === 'BUY').length;
  const sells = trades.filter(t => t.side === 'SELL').length;
  lines.push(`- BUY: ${buys} (${(buys/trades.length*100).toFixed(1)}%)`);
  lines.push(`- SELL: ${sells} (${(sells/trades.length*100).toFixed(1)}%)`);
  
  lines.push(`\n---\n*Generated: ${new Date().toISOString()}*`);
  return lines.join('\n');
}

// Cross-reference whale trades against our trades
function crossReference() {
  const data = loadTrades();
  const ourTradesFile = path.join(__dirname, 'active-trades.json');
  let ourTrades;
  try { ourTrades = JSON.parse(fs.readFileSync(ourTradesFile, 'utf-8')); } 
  catch { return '\n## 🔄 Cross-Reference: Us vs Whale\n\nNo active-trades.json found.\n'; }
  
  // Group whale trades by slug → aggregate per window
  const whaleBySlug = {};
  for (const t of data.trades) {
    const slug = t.marketSlug;
    if (!whaleBySlug[slug]) whaleBySlug[slug] = { trades: [], dirUsdc: {}, totalUsdc: 0, firstTs: t.timestamp };
    whaleBySlug[slug].trades.push(t);
    whaleBySlug[slug].dirUsdc[t.direction] = (whaleBySlug[slug].dirUsdc[t.direction] || 0) + (t.usdcSize || 0);
    whaleBySlug[slug].totalUsdc += (t.usdcSize || 0);
    if (t.timestamp < whaleBySlug[slug].firstTs) whaleBySlug[slug].firstTs = t.timestamp;
  }
  
  // Compute per-window aggregates
  for (const slug in whaleBySlug) {
    const w = whaleBySlug[slug];
    w.primaryDirection = Object.entries(w.dirUsdc).sort((a,b) => b[1] - a[1])[0][0];
    // USDC-weighted avg price
    let pSum = 0, wSum = 0;
    for (const t of w.trades) { pSum += t.price * (t.usdcSize||1); wSum += (t.usdcSize||1); }
    w.avgPrice = wSum ? pSum / wSum : 0;
    // Avg entry time into window
    const times = w.trades.filter(t => t.minutesIntoWindow !== null).map(t => t.minutesIntoWindow);
    w.avgEntryMin = times.length ? times.reduce((a,b)=>a+b,0)/times.length : null;
  }
  
  // Find overlapping windows
  const overlaps = [];
  for (const [slug, ours] of Object.entries(ourTrades)) {
    const whale = whaleBySlug[slug];
    if (!whale) continue;
    
    const agreed = ours.direction === whale.primaryDirection;
    const ourEntryMin = (ours.timestamp && ours.windowStart) ? 
      (new Date(ours.timestamp) - new Date(ours.windowStart)) / 60000 : null;
    
    overlaps.push({
      slug,
      asset: ours.asset,
      ourDir: ours.direction,
      whaleDir: whale.primaryDirection,
      agreed,
      ourOdds: ours.entryOdds,
      whalePrice: Math.round(whale.avgPrice * 1000) / 1000,
      ourConf: ours.confidence ? Math.round(ours.confidence * 100) / 100 : null,
      ourEdge: ours.edge ? Math.round(ours.edge * 1000) / 1000 : null,
      whaleUsdc: Math.round(whale.totalUsdc * 100) / 100,
      whaleCount: whale.trades.length,
      ourEntryMin: ourEntryMin !== null ? Math.round(ourEntryMin * 100) / 100 : null,
      whaleEntryMin: whale.avgEntryMin !== null ? Math.round(whale.avgEntryMin * 100) / 100 : null,
      whaleFirst: (whale.avgEntryMin !== null && ourEntryMin !== null) ? whale.avgEntryMin < ourEntryMin : null,
      result: ours.result || null,
      windowStart: ours.windowStart,
    });
  }
  
  // Build report
  const lines = [];
  lines.push('\n## 🔄 Cross-Reference: Us vs Whale (Antique-Twig)');
  lines.push(`\nOur trades: ${Object.keys(ourTrades).length} | Whale windows: ${Object.keys(whaleBySlug).length}`);
  lines.push(`**Overlapping windows: ${overlaps.length}**`);
  
  if (overlaps.length === 0) {
    lines.push('\n⚠️ **No overlapping windows found.**');
    lines.push('');
    lines.push('This is expected when data ranges don\'t overlap:');
    // Show date ranges
    const ourSlugs = Object.keys(ourTrades).sort();
    const whaleSlugs = Object.keys(whaleBySlug).sort();
    if (ourSlugs.length > 0) {
      const ourFirst = ourTrades[ourSlugs[0]].windowStart || ourSlugs[0];
      const ourLast = ourTrades[ourSlugs[ourSlugs.length-1]].windowStart || ourSlugs[ourSlugs.length-1];
      lines.push(`- Our trades range: ${ourFirst} → ${ourLast}`);
    }
    if (data.trades.length > 0) {
      lines.push(`- Whale trades range: ${data.trades[0].timestamp} → ${data.trades[data.trades.length-1].timestamp}`);
    }
    lines.push('');
    lines.push('The whale tracker now runs every 30s. As both systems trade simultaneously,');
    lines.push('overlaps will accumulate and this section will auto-populate with signal data.');
    lines.push('');
    lines.push('**To generate useful cross-reference data:**');
    lines.push('1. Keep whale-tracker running (integrated into smart-monitor loop)');
    lines.push('2. Both must be active during the same windows');
    lines.push('3. Re-run `node whale-tracker.js xref` after a trading session');
    return lines.join('\n');
  }
  
  // Summary stats
  const agreeCount = overlaps.filter(o => o.agreed).length;
  const disagreeCount = overlaps.length - agreeCount;
  lines.push(`\n### Agreement Rate`);
  lines.push(`- Same direction: ${agreeCount}/${overlaps.length} (${(agreeCount/overlaps.length*100).toFixed(1)}%)`);
  lines.push(`- Opposite direction: ${disagreeCount}/${overlaps.length} (${(disagreeCount/overlaps.length*100).toFixed(1)}%)`);
  
  // Win rates (if results available)
  const withResults = overlaps.filter(o => o.result);
  if (withResults.length > 0) {
    const agreedWithResult = withResults.filter(o => o.agreed);
    const disagreedWithResult = withResults.filter(o => !o.agreed);
    
    lines.push('\n### Win Rates (resolved windows only)');
    if (agreedWithResult.length > 0) {
      const agreedWins = agreedWithResult.filter(o => o.result === 'won' || o.result === 'win').length;
      lines.push(`- When agreed: ${agreedWins}/${agreedWithResult.length} wins (${(agreedWins/agreedWithResult.length*100).toFixed(1)}%)`);
    }
    if (disagreedWithResult.length > 0) {
      const weWon = disagreedWithResult.filter(o => o.result === 'won' || o.result === 'win').length;
      lines.push(`- When disagreed — we were right: ${weWon}/${disagreedWithResult.length} (${(weWon/disagreedWithResult.length*100).toFixed(1)}%)`);
      lines.push(`- When disagreed — whale was right: ${disagreedWithResult.length - weWon}/${disagreedWithResult.length} (${((disagreedWithResult.length-weWon)/disagreedWithResult.length*100).toFixed(1)}%)`);
    }
  } else {
    lines.push('\n### Win Rates');
    lines.push('- ⚠️ No resolved results yet. Results will populate as windows close.');
  }
  
  // Timing comparison
  const withBothTiming = overlaps.filter(o => o.ourEntryMin !== null && o.whaleEntryMin !== null);
  if (withBothTiming.length > 0) {
    const ourAvg = withBothTiming.reduce((s,o) => s + o.ourEntryMin, 0) / withBothTiming.length;
    const whaleAvg = withBothTiming.reduce((s,o) => s + o.whaleEntryMin, 0) / withBothTiming.length;
    const whaleFirstCount = withBothTiming.filter(o => o.whaleFirst).length;
    
    lines.push('\n### Entry Timing (shared windows)');
    lines.push(`- Our avg entry: ${ourAvg.toFixed(2)} min into window`);
    lines.push(`- Whale avg entry: ${whaleAvg.toFixed(2)} min into window`);
    lines.push(`- Whale trades first: ${whaleFirstCount}/${withBothTiming.length} (${(whaleFirstCount/withBothTiming.length*100).toFixed(1)}%)`);
  }
  
  // Odds comparison
  const withBothOdds = overlaps.filter(o => o.ourOdds && o.whalePrice);
  if (withBothOdds.length > 0) {
    const ourAvgOdds = withBothOdds.reduce((s,o) => s + o.ourOdds, 0) / withBothOdds.length;
    const whaleAvgOdds = withBothOdds.reduce((s,o) => s + o.whalePrice, 0) / withBothOdds.length;
    lines.push('\n### Entry Odds Comparison');
    lines.push(`- Our avg entry odds: ${ourAvgOdds.toFixed(3)}`);
    lines.push(`- Whale avg entry price: ${whaleAvgOdds.toFixed(3)}`);
    lines.push(`- Whale gets ${whaleAvgOdds < ourAvgOdds ? 'better' : 'worse'} prices on avg`);
  }
  
  // Per-overlap detail table
  lines.push('\n### Individual Overlaps');
  lines.push('| Window | Asset | Us | Whale | Agree? | Our Odds | Whale Price | Whale $ | Result |');
  lines.push('|--------|-------|----|-------|--------|----------|-------------|---------|--------|');
  for (const o of overlaps.slice(0, 50)) {
    lines.push(`| ${o.slug.replace(/.*updown-\d+m-/,'')} | ${o.asset} | ${o.ourDir} | ${o.whaleDir} | ${o.agreed?'✅':'❌'} | ${o.ourOdds||'-'} | ${o.whalePrice||'-'} | $${o.whaleUsdc} | ${o.result||'pending'} |`);
  }
  if (overlaps.length > 50) lines.push(`\n... and ${overlaps.length - 50} more`);
  
  // Signal interpretation
  lines.push('\n### Signal Interpretation');
  if (agreeCount > disagreeCount) {
    lines.push('**🟢 Confirming signal** — Whale mostly agrees with our direction.');
    lines.push('When both agree, consider increasing position size.');
  } else if (disagreeCount > agreeCount) {
    lines.push('**🔴 Contrarian signal** — Whale often takes the opposite side.');
    lines.push('When whale disagrees, consider reducing confidence or skipping.');
  } else {
    lines.push('**🟡 Neutral** — No clear pattern of agreement or disagreement yet.');
  }
  
  return lines.join('\n');
}

// Main
if (require.main === module) {
  const cmd = process.argv[2] || 'check';
  
  (async () => {
    try {
      if (cmd === 'backfill') {
        const data = await backfill();
        const analysis = analyze(data) + '\n' + crossReference();
        fs.writeFileSync(path.join(__dirname, 'whale-analysis.md'), analysis);
        console.log('\n📊 Analysis saved to whale-analysis.md');
        console.log(analysis);
      } else if (cmd === 'analyze' || cmd === 'xref') {
        const analysis = analyze() + '\n' + crossReference();
        fs.writeFileSync(path.join(__dirname, 'whale-analysis.md'), analysis);
        console.log(analysis);
      } else {
        const newTrades = await checkNewTrades();
        if (newTrades.length > 0) {
          console.log(`Found ${newTrades.length} new whale trades`);
          for (const t of newTrades.slice(-5)) {
            console.log(`  ${t.asset} ${t.direction} $${t.usdcSize?.toFixed(2)} @ ${t.price} (${t.minutesIntoWindow?.toFixed(1)}m in)`);
          }
        }
      }
    } catch (err) {
      console.error('Error:', err.message);
      process.exit(1);
    }
  })();
}

/**
 * Get whale market-making signal for a specific asset/window
 * Returns: { active, flowImbalance, impliedFair, spreadQuality, dominantSide, confidence }
 * - active: boolean — is whale trading this window?
 * - flowImbalance: -1 to +1 — negative = whale loading Down, positive = loading Up (by $ volume)
 * - impliedFair: estimated fair price for Up based on whale's buy prices
 * - spreadQuality: 'tight'|'normal'|'wide' — based on whale spread
 * - dominantSide: 'Up'|'Down'|'neutral' — which side got more $
 * - confidence: 0-1 — how many trades back this signal (more trades = higher)
 */
function getWhaleSignal(asset, windowSlug) {
  const data = loadTrades();
  if (!data || !data.trades || data.trades.length === 0) return null;
  
  // Find whale trades in this window (match by slug or by asset + similar timestamp)
  const windowTrades = data.trades.filter(t => {
    if (windowSlug && t.marketSlug === windowSlug) return true;
    return false;
  });
  
  if (windowTrades.length === 0) return null;
  
  const upTrades = windowTrades.filter(t => t.direction === 'Up');
  const downTrades = windowTrades.filter(t => t.direction === 'Down');
  
  const upUSDC = upTrades.reduce((s, t) => s + (t.usdcSize || 0), 0);
  const downUSDC = downTrades.reduce((s, t) => s + (t.usdcSize || 0), 0);
  const totalUSDC = upUSDC + downUSDC;
  
  if (totalUSDC === 0) return null;
  
  // Flow imbalance: -1 (all Down) to +1 (all Up)
  const flowImbalance = totalUSDC > 0 ? (upUSDC - downUSDC) / totalUSDC : 0;
  
  // Implied fair price: average of whale's Up buy prices weighted by size
  const upWeightedPrice = upTrades.length > 0
    ? upTrades.reduce((s, t) => s + t.price * (t.usdcSize || 0), 0) / upUSDC
    : null;
  const downWeightedPrice = downTrades.length > 0
    ? downTrades.reduce((s, t) => s + t.price * (t.usdcSize || 0), 0) / downUSDC
    : null;
  
  // Implied fair = midpoint if both sides traded
  let impliedFair = null;
  if (upWeightedPrice && downWeightedPrice) {
    impliedFair = upWeightedPrice; // Up price IS the implied fair for Up outcome
  } else if (upWeightedPrice) {
    impliedFair = upWeightedPrice;
  }
  
  // Spread quality: how tight is up_price + down_price to 1.0?
  let spreadQuality = 'unknown';
  if (upWeightedPrice && downWeightedPrice) {
    const totalCost = upWeightedPrice + downWeightedPrice;
    if (totalCost >= 0.97) spreadQuality = 'tight';
    else if (totalCost >= 0.90) spreadQuality = 'normal';
    else spreadQuality = 'wide';
  }
  
  // Dominant side
  let dominantSide = 'neutral';
  if (Math.abs(flowImbalance) > 0.15) {
    dominantSide = flowImbalance > 0 ? 'Up' : 'Down';
  }
  
  // Confidence based on trade count
  const tradeCount = windowTrades.length;
  const confidence = Math.min(tradeCount / 20, 1.0); // 20+ trades = max confidence
  
  return {
    active: true,
    flowImbalance: Math.round(flowImbalance * 1000) / 1000,
    impliedFair,
    spreadQuality,
    dominantSide,
    upUSDC: Math.round(upUSDC * 100) / 100,
    downUSDC: Math.round(downUSDC * 100) / 100,
    tradeCount,
    confidence
  };
}

/**
 * Get recent whale activity summary for an asset (last N minutes)
 * Useful for checking if whale is active (liquidity available)
 */
function getWhaleActivity(asset, minutesBack = 15) {
  const data = loadTrades();
  if (!data || !data.trades) return { active: false };
  
  const cutoff = new Date(Date.now() - minutesBack * 60000).toISOString();
  const recent = data.trades.filter(t => t.asset === asset && t.timestamp > cutoff);
  
  if (recent.length === 0) return { active: false, tradeCount: 0 };
  
  const upUSDC = recent.filter(t => t.direction === 'Up').reduce((s, t) => s + (t.usdcSize || 0), 0);
  const downUSDC = recent.filter(t => t.direction === 'Down').reduce((s, t) => s + (t.usdcSize || 0), 0);
  const totalUSDC = upUSDC + downUSDC;
  const flowImbalance = totalUSDC > 0 ? (upUSDC - downUSDC) / totalUSDC : 0;
  
  return {
    active: true,
    tradeCount: recent.length,
    totalUSDC: Math.round(totalUSDC * 100) / 100,
    flowImbalance: Math.round(flowImbalance * 1000) / 1000,
    dominantSide: Math.abs(flowImbalance) > 0.15 ? (flowImbalance > 0 ? 'Up' : 'Down') : 'neutral'
  };
}

module.exports = { checkNewTrades, backfill, analyze, crossReference, loadTrades, getWhaleSignal, getWhaleActivity };
