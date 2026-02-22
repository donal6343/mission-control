#!/usr/bin/env node
/**
 * Check and update trade results from Polymarket
 * Uses gamma-api to check resolved markets
 */

const { Client } = require('@notionhq/client');
const fetch = require('node-fetch');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
const notion = new Client({ 
  auth: fs.readFileSync(process.env.HOME + '/.config/notion/api_key', 'utf-8').trim() 
});

// Get pending trades from Notion
async function getPendingTrades() {
  const apiKey = fs.readFileSync(process.env.HOME + '/.config/notion/api_key', 'utf-8').trim();
  const response = await fetch(`https://api.notion.com/v1/databases/${config.notionDatabaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        property: 'Result',
        select: { equals: 'Pending' }
      }
    })
  });
  const data = await response.json();
  return data.results || [];
}

// Check market resolution via gamma-api
async function checkMarketResolution(marketUrl) {
  try {
    // Extract slug from URL (https://polymarket.com/event/SLUG)
    const slug = marketUrl.split('/event/')[1]?.split('?')[0];
    if (!slug) return null;
    
    const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    const events = await res.json();
    
    if (!events || events.length === 0) return null;
    
    const event = events[0];
    const market = event.markets?.[0];
    
    if (!market) return null;
    if (!market.closed) return { resolved: false };
    
    // Parse outcome prices
    let prices = market.outcomePrices;
    if (typeof prices === 'string') {
      prices = JSON.parse(prices);
    }
    
    const upPrice = parseFloat(prices[0]) || 0;
    const downPrice = parseFloat(prices[1]) || 0;
    
    // Winner is the one with price = 1
    let winner = null;
    if (upPrice >= 0.99) winner = 'Up';
    else if (downPrice >= 0.99) winner = 'Down';
    
    return { resolved: true, winner, upPrice, downPrice };
  } catch (error) {
    console.error(`Error checking ${marketUrl}:`, error.message);
    return null;
  }
}

// Update trade result in Notion
async function updateTradeResult(pageId, result) {
  await notion.pages.update({
    page_id: pageId,
    properties: {
      'Result': { select: { name: result } }
    }
  });
}

// Update result in local active-trades.json for signal analysis
const TRADES_FILE = './active-trades.json';

function updateLocalTradeResult(slug, result, pnl) {
  try {
    const trades = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8'));
    if (trades[slug]) {
      trades[slug].result = result;
      trades[slug].pnl = pnl;
      trades[slug].resolvedAt = new Date().toISOString();
      fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
    }
  } catch (e) {
    // Silently fail if file doesn't exist
  }
}

// Calculate stats
function calculateStats(results) {
  const wins = results.filter(r => r === 'Win').length;
  const losses = results.filter(r => r === 'Loss').length;
  const total = wins + losses;
  
  return {
    wins,
    losses,
    total,
    winRate: total > 0 ? (wins / total * 100).toFixed(1) : 0,
    pnl: wins * config.stakePerTrade * 0.9 - losses * config.stakePerTrade // Assuming ~2x payout on average
  };
}

// Main check
async function checkResults() {
  console.log('🔍 Checking pending trades...\n');
  
  const pending = await getPendingTrades();
  console.log(`Found ${pending.length} pending trade(s)\n`);
  
  const results = [];
  let stillPending = 0;
  
  for (const trade of pending) {
    const name = trade.properties.Name.title[0]?.text?.content || 'Unknown';
    const direction = trade.properties.Direction.select?.name;
    const marketUrl = trade.properties['Market URL']?.url;
    const odds = trade.properties['Entry Odds']?.number || 0;
    
    if (!marketUrl) {
      console.log(`⚠️  ${name}: No market URL`);
      continue;
    }
    
    const resolution = await checkMarketResolution(marketUrl);
    
    if (!resolution) {
      console.log(`❓ ${name}: Could not fetch market`);
      stillPending++;
      continue;
    }
    
    if (!resolution.resolved) {
      console.log(`⏳ ${name}: Still open`);
      stillPending++;
      continue;
    }
    
    const won = resolution.winner === direction;
    const result = won ? 'Win' : 'Loss';
    const payout = won ? (1 / odds) : 0;
    const pnl = won ? (payout - 1) * config.stakePerTrade : -config.stakePerTrade;
    
    console.log(`${won ? '✅' : '❌'} ${name}`);
    console.log(`   Bet: ${direction} @ ${(odds * 100).toFixed(1)}% | Result: ${resolution.winner} won`);
    console.log(`   PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
    
    await updateTradeResult(trade.id, result);
    
    // Extract slug from name (format: "BTC Up @ xx% - 1771282800")
    const slugMatch = name.match(/(\w+)\s+(Up|Down).*?(\d{10})/);
    if (slugMatch) {
      const slug = `${slugMatch[1].toLowerCase()}-updown-15m-${slugMatch[3]}`;
      updateLocalTradeResult(slug, result, pnl);
    }
    
    results.push(result);
  }
  
  const stats = calculateStats(results);
  
  console.log('\n' + '='.repeat(50));
  console.log(`📊 SESSION RESULTS`);
  console.log('='.repeat(50));
  console.log(`Resolved: ${stats.wins}W / ${stats.losses}L (${stats.winRate}% win rate)`);
  console.log(`Still pending: ${stillPending}`);
  console.log(`Est. PnL: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`);
  console.log('='.repeat(50));
  
  return stats;
}

if (require.main === module) {
  checkResults().catch(console.error);
}

module.exports = { checkResults };
