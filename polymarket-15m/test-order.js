#!/usr/bin/env node
/**
 * Test $1 real order on Polymarket CLOB
 * Places a limit buy for $1 on BTC Up at ~50% odds
 */

const { ethers } = require('ethers');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const { ClobClient } = require('@polymarket/clob-client');

const POLYGON_RPC = 'https://polygon.drpc.org';
const CLOB_URL = 'https://clob.polymarket.com';
const CHAIN_ID = 137;

// Load wallet
function loadWallet() {
  const envPath = path.join(process.env.HOME, '.config/polymarket/.env');
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const pkMatch = envContent.match(/POLYMARKET_PRIVATE_KEY=(.+)/);
  if (!pkMatch) throw new Error('No private key found');
  const provider = new ethers.providers.JsonRpcProvider(POLYGON_RPC);
  return new ethers.Wallet(pkMatch[1].trim(), provider);
}

async function main() {
  console.log('🧪 Polymarket Test Order — $1 BTC Up');
  console.log('=====================================\n');

  // 1. Load wallet
  const wallet = loadWallet();
  console.log('✅ Wallet:', wallet.address);

  // 2. Find current BTC 5M market near 50%
  console.log('\n🔍 Finding BTC market near 50% odds...');
  const res = await fetch('https://polymarket.com/crypto/5M', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'text/html,application/xhtml+xml' }
  });
  const html = await res.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json"[^>]*>([^<]+)<\/script>/);
  if (!match) throw new Error('Could not fetch market data');
  
  const data = JSON.parse(match[1]);
  const queries = data.props?.pageProps?.dehydratedState?.queries || [];
  const mq = queries.find(q => q.queryKey?.[0] === 'crypto-markets');
  const events = mq?.state?.data?.pages?.[0]?.events || [];
  
  let targetMarket = null;
  for (const e of events) {
    const m = e.markets?.[0];
    if (!m) continue;
    const q = (m.question || '').toLowerCase();
    if (q.includes('bitcoin') || q.includes('btc')) {
      const prices = m.outcomePrices || [];
      const upPrice = parseFloat(prices[0] || 0);
      if (upPrice > 0.30 && upPrice < 0.70) {
        targetMarket = {
          question: m.question,
          conditionId: m.conditionId,
          tokenId: m.clobTokenIds[0], // Up token
          upPrice: upPrice,
          negRisk: m.negRisk || false,
        };
        break;
      }
    }
  }

  if (!targetMarket) {
    console.log('❌ No BTC market near 50% found. Current markets:');
    for (const e of events.slice(0, 3)) {
      const m = e.markets?.[0];
      if (m) console.log(`  ${m.question}: ${m.outcomePrices}`);
    }
    return;
  }

  console.log(`✅ Found: ${targetMarket.question}`);
  console.log(`   Up price: ${targetMarket.upPrice}`);
  console.log(`   Token ID: ${targetMarket.tokenId.slice(0, 30)}...`);
  console.log(`   Condition: ${targetMarket.conditionId}`);

  // 3. Create CLOB client and derive API key
  console.log('\n🔑 Deriving CLOB API credentials...');
  
  const clobClient = new ClobClient(
    CLOB_URL,
    CHAIN_ID,
    wallet,
  );

  let apiCreds;
  try {
    apiCreds = await clobClient.createOrDeriveApiKey();
    console.log('✅ API key derived');
  } catch (e) {
    console.error('❌ API key error:', e.message);
    return;
  }

  // Recreate client with API creds
  const authedClient = new ClobClient(
    CLOB_URL,
    CHAIN_ID,
    wallet,
    apiCreds,
  );

  // 4. Check tick size
  console.log('\n📏 Getting tick size...');
  let tickSize = '0.01';
  try {
    const negRiskParam = targetMarket.negRisk ? '&neg_risk=true' : '';
    const marketInfo = await fetch(`${CLOB_URL}/markets/${targetMarket.conditionId}?${negRiskParam}`);
    const mInfo = await marketInfo.json();
    tickSize = mInfo.minimum_tick_size || '0.01';
    console.log(`✅ Tick size: ${tickSize}`);
  } catch (e) {
    console.log(`⚠️  Could not get tick size, using default: ${tickSize}`);
  }

  // 5. Place a $1 limit buy on Up
  const price = Math.round(targetMarket.upPrice * 100) / 100; // Round to tick
  const size = 2; // 2 shares ≈ $1 at ~50% odds

  console.log(`\n💰 Placing order:`);
  console.log(`   Side: BUY`);
  console.log(`   Token: Up`);
  console.log(`   Price: ${price}`);
  console.log(`   Size: ${size} shares`);
  console.log(`   Cost: ~$${(price * size).toFixed(2)}`);

  try {
    const order = await authedClient.createAndPostOrder({
      tokenID: targetMarket.tokenId,
      price: price,
      side: 'BUY',
      size: size,
      feeRateBps: 1000,
      tickSize: tickSize,
      negRisk: targetMarket.negRisk,
    });
    
    console.log('\n✅ ORDER PLACED!');
    console.log(JSON.stringify(order, null, 2));
  } catch (e) {
    console.error('\n❌ Order failed:', e.message);
    if (e.message.includes('allowance') || e.message.includes('approve')) {
      console.log('\n⚠️  Need to approve USDC spending first. Run approval flow.');
    }
  }
}

main().catch(e => console.error('Fatal:', e.message));
