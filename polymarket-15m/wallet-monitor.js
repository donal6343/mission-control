#!/usr/bin/env node
/**
 * Wallet Balance Monitor
 * Checks POL and USDC balances on Polygon, writes to wallet-status.json.
 * Run via cron every 5 minutes.
 */

const fs = require('fs');
const path = require('path');

const WALLET_ADDRESS = '0x0F1d47f532Cbe918a954D5F56B78659154930b10';
const STATUS_FILE = path.join(__dirname, 'wallet-status.json');
const POLYGON_RPC = 'https://polygon.drpc.org';

// USDC (native) on Polygon — Polymarket uses this
const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
// Legacy USDC (bridged) — check both
const USDCE_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
// ERC20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = '0x70a08231';

async function getPolBalance() {
  const res = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_getBalance',
      params: [WALLET_ADDRESS, 'latest']
    })
  });
  const data = await res.json();
  return parseInt(data.result, 16) / 1e18;
}

async function getTokenBalance(tokenAddress) {
  const paddedAddress = WALLET_ADDRESS.toLowerCase().replace('0x', '').padStart(64, '0');
  const callData = BALANCE_OF_SELECTOR + paddedAddress;
  
  const res = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'eth_call',
      params: [{ to: tokenAddress, data: callData }, 'latest']
    })
  });
  const data = await res.json();
  return parseInt(data.result, 16) / 1e6;
}

async function getUsdceBalance() {
  const [usdc, usdce] = await Promise.all([
    getTokenBalance(USDC_ADDRESS),
    getTokenBalance(USDCE_ADDRESS),
  ]);
  return usdc + usdce; // combine both USDC types
}

function loadPrevious() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')); }
  catch { return null; }
}

async function run() {
  const [pol, usdc] = await Promise.all([getPolBalance(), getUsdceBalance()]);
  const prev = loadPrevious();
  
  const status = {
    address: WALLET_ADDRESS,
    pol: Math.round(pol * 10000) / 10000,
    usdc: Math.round(usdc * 100) / 100,
    timestamp: new Date().toISOString(),
    changed: false,
    changes: [],
  };
  
  if (prev) {
    if (Math.abs(status.pol - prev.pol) > 0.0001) {
      const diff = status.pol - prev.pol;
      status.changes.push(`POL: ${prev.pol.toFixed(4)} → ${status.pol.toFixed(4)} (${diff > 0 ? '+' : ''}${diff.toFixed(4)})`);
      status.changed = true;
    }
    if (Math.abs(status.usdc - prev.usdc) > 0.001) {
      const diff = status.usdc - prev.usdc;
      status.changes.push(`USDC: $${prev.usdc.toFixed(2)} → $${status.usdc.toFixed(2)} (${diff > 0 ? '+' : ''}$${diff.toFixed(2)})`);
      status.changed = true;
    }
  } else {
    // First run — always report
    status.changed = true;
    status.changes.push(`Initial balance: ${status.pol.toFixed(4)} POL, $${status.usdc.toFixed(2)} USDC`);
  }
  
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  
  console.log(`💰 Wallet: ${status.pol.toFixed(4)} POL | $${status.usdc.toFixed(2)} USDC`);
  if (status.changed) {
    console.log(`📢 Changes: ${status.changes.join(', ')}`);
    // Output for cron agent to pick up and notify
    console.log(`NOTIFY: ${status.changes.join(' | ')}`);
  }
  
  return status;
}

run().catch(e => {
  console.error('❌ Wallet monitor failed:', e.message);
  process.exit(1);
});
