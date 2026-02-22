/**
 * Auto-Redeem: Claims resolved Polymarket positions back to USDC
 * 
 * How it works:
 * 1. Fetches all positions from data-api.polymarket.com
 * 2. Filters for redeemable positions (resolved markets)
 * 3. Calls ConditionalTokens.redeemPositions() on-chain for winners
 * 4. Losers with redeemable=true are just marked as resolved (they return 0 USDC)
 * 
 * ConditionalTokens contract: 0x4D97DCd97eC945f40cF65F87097ACe5EA0476045 (Polygon)
 * redeemPositions(collateral, parentCollectionId, conditionId, indexSets)
 */

const { ethers } = require('ethers');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Polygon RPC
const RPC_URL = 'https://polygon-bor-rpc.publicnode.com';

// Contract addresses (Polygon mainnet)
const CONDITIONAL_TOKENS = '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
const USDC_POLYGON = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Minimal ABI for redeemPositions
const CT_ABI = [
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets) external',
  'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)'
];

const ENV_PATH = path.join(process.env.HOME || '', '.config/polymarket/.env');
const REDEEM_LOG_PATH = path.join(__dirname, 'redeem-log.json');

function loadWallet() {
  const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
  // Load private key from .env file (same as real-trader.js)
  if (fs.existsSync(ENV_PATH)) {
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const pkMatch = envContent.match(/POLYMARKET_PRIVATE_KEY=(.+)/);
    if (pkMatch && pkMatch[1]) {
      return new ethers.Wallet(pkMatch[1].trim(), provider);
    }
  }
  if (process.env.POLYMARKET_PRIVATE_KEY) {
    return new ethers.Wallet(process.env.POLYMARKET_PRIVATE_KEY, provider);
  }
  throw new Error('No wallet configured. Set POLYMARKET_PRIVATE_KEY in ~/.config/polymarket/.env');
}

function loadRedeemLog() {
  try {
    return JSON.parse(fs.readFileSync(REDEEM_LOG_PATH, 'utf8'));
  } catch {
    return { redeemed: [] };
  }
}

function saveRedeemLog(log) {
  fs.writeFileSync(REDEEM_LOG_PATH, JSON.stringify(log, null, 2));
}

async function fetchPositions(walletAddress) {
  const resp = await axios.get('https://data-api.polymarket.com/positions', {
    params: { user: walletAddress },
    timeout: 10000
  });
  return resp.data || [];
}

/**
 * Redeem a resolved position
 * For binary markets (Up/Down), indexSets = [1, 2] redeems both outcomes
 * The contract pays out based on which outcome won
 */
async function redeemPosition(wallet, conditionId) {
  const ct = new ethers.Contract(CONDITIONAL_TOKENS, CT_ABI, wallet);
  
  // parentCollectionId = bytes32(0) for top-level conditions
  const parentCollectionId = ethers.constants.HashZero;
  
  // indexSets: [1, 2] = redeem both outcomes (binary market)
  // 1 = outcome 0 (Up), 2 = outcome 1 (Down)
  const indexSets = [1, 2];
  
  console.log(`   📤 Calling redeemPositions for condition ${conditionId.slice(0, 16)}...`);
  
  // Polygon requires minimum 25 gwei priority fee
  const maxPriorityFee = ethers.utils.parseUnits('35', 'gwei');
  const maxFee = ethers.utils.parseUnits('250', 'gwei');
  
  const tx = await ct.redeemPositions(
    USDC_POLYGON,
    parentCollectionId,
    conditionId,
    indexSets,
    { gasLimit: 300000, maxPriorityFeePerGas: maxPriorityFee, maxFeePerGas: maxFee }
  );
  
  console.log(`   ⏳ TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`   ✅ TX confirmed in block ${receipt.blockNumber} | Gas: ${receipt.gasUsed.toString()}`);
  
  return { txHash: tx.hash, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() };
}

/**
 * Main: check all positions and redeem resolved ones
 */
async function autoRedeem() {
  const wallet = loadWallet();
  const address = wallet.address;
  console.log(`\n🔄 AUTO-REDEEM: Checking positions for ${address}`);
  
  const positions = await fetchPositions(address);
  const redeemLog = loadRedeemLog();
  const alreadyRedeemed = new Set(redeemLog.redeemed.map(r => r.conditionId));
  
  const redeemable = positions.filter(p => 
    p.redeemable === true && !alreadyRedeemed.has(p.conditionId)
  );
  
  if (redeemable.length === 0) {
    console.log('   ✅ No positions to redeem');
    return { redeemed: 0, results: [] };
  }
  
  // Group by conditionId (a single condition may have both Up and Down positions)
  const byCondition = {};
  for (const pos of redeemable) {
    if (!byCondition[pos.conditionId]) {
      byCondition[pos.conditionId] = [];
    }
    byCondition[pos.conditionId].push(pos);
  }
  
  console.log(`   📋 Found ${Object.keys(byCondition).length} resolved market(s) to redeem`);
  
  const results = [];
  for (const [conditionId, condPositions] of Object.entries(byCondition)) {
    const pos = condPositions[0]; // Use first position for metadata
    const isWin = pos.currentValue > 0;
    const label = `${pos.title} [${pos.outcome}]`;
    
    console.log(`\n   ${isWin ? '🏆' : '💀'} ${label}`);
    console.log(`      Bought: $${pos.initialValue.toFixed(2)} | Current: $${pos.currentValue.toFixed(2)} | PnL: $${pos.cashPnl.toFixed(2)}`);
    
    try {
      const txResult = await redeemPosition(wallet, conditionId);
      
      const result = {
        conditionId,
        title: pos.title,
        outcome: pos.outcome,
        isWin,
        initialValue: pos.initialValue,
        currentValue: pos.currentValue,
        cashPnl: pos.cashPnl,
        txHash: txResult.txHash,
        redeemedAt: new Date().toISOString()
      };
      
      results.push(result);
      redeemLog.redeemed.push(result);
      saveRedeemLog(redeemLog);
      
      console.log(`      ✅ Redeemed! TX: ${txResult.txHash}`);
    } catch (error) {
      console.error(`      ❌ Redeem failed: ${error.message}`);
      results.push({ conditionId, title: pos.title, error: error.message });
    }
    
    // Brief pause between redemptions
    if (Object.keys(byCondition).length > 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  const won = results.filter(r => r.isWin && !r.error).length;
  const lost = results.filter(r => !r.isWin && !r.error).length;
  const failed = results.filter(r => r.error).length;
  const totalReclaimed = results.filter(r => r.isWin && !r.error).reduce((s, r) => s + r.currentValue, 0);
  
  console.log(`\n   📊 REDEEM SUMMARY: ${won} wins ($${totalReclaimed.toFixed(2)} reclaimed), ${lost} losses cleared, ${failed} failed`);
  
  return { redeemed: results.length - failed, totalReclaimed, results };
}

// Run standalone or export
if (require.main === module) {
  autoRedeem().then(r => {
    console.log('\nDone:', JSON.stringify(r, null, 2));
    process.exit(0);
  }).catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
  });
}

module.exports = { autoRedeem, fetchPositions };
