import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";

const CONFIG_PATH = "/home/ubuntu/clawd/polymarket-15m/trading-config.json";

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  } catch {
    return { paths: {}, params: {}, stakeTiers: [], excludedAssets: [], killSwitch: false };
  }
}

export async function GET() {
  const config = await loadConfig();
  return NextResponse.json(config);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const config = await loadConfig();

    // Toggle path
    if (body.action === "togglePath" && body.pathName) {
      if (!config.paths[body.pathName]) config.paths[body.pathName] = { enabled: true, label: body.pathName };
      config.paths[body.pathName].enabled = body.enabled;
    }

    // Update stake tier
    if (body.action === "updateStakeTier" && body.index !== undefined && body.stake !== undefined) {
      if (config.stakeTiers && config.stakeTiers[body.index]) {
        config.stakeTiers[body.index].stake = body.stake;
      }
    }

    // Update parameter — with safety floors to prevent over-trading
    if (body.action === "updateParam" && body.key && body.value !== undefined) {
      if (!config.params) config.params = {};
      const PARAM_FLOORS: Record<string, number> = {
        path1Confidence: 0.40,
        path2Confidence: 0.40,
        path3Confidence: 0.50,
        path1Categories: 1,
        path2Categories: 1,
        path3Categories: 1,
        minEdge: 0.01,
        minMarketOdds: 0.20,
        maxConfidence: 0.50,
        breakingNewsMinConfidence: 0.40,
        breakingNewsMaxOdds: 0.50,
        breakingNewsMaxPerHour: 1,
        breakingNewsCooldownMin: 5,
        breakingNewsMinPriceMove: 0.001,
        arbMinConfidence: 0.30,
        arbMinDiscrepancy: 0.01,
        arbMinPriceMove: 0.001,
        srMinConfidence: 0.30,
        underdogThreshold: 0.20,
        correlationThreshold: 0.01,
        correlationWindow: 1,
        maxDailyTrades: 5,
        maxConcurrentPositions: 5,
        maxStakePerTrade: 5,
        maxDailyLoss: 10,
        macroWeightMultiplier: 0,
        macroSpread: 0,
        overnightDisableStart: 0,
        overnightDisableEnd: 0,
        priceShockThreshold: 0.005,  // min 0.5% to trigger
        priceShockWindowMins: 1,     // min 1 minute lookback
      };
      // String params (no floor check)
      const STRING_PARAMS = ['macroWeightSource'];
      if (STRING_PARAMS.includes(body.key)) {
        const VALID_VALUES: Record<string, string[]> = {
          macroWeightSource: ['manual', 'engine'],
        };
        if (VALID_VALUES[body.key] && !VALID_VALUES[body.key].includes(body.value)) {
          return NextResponse.json({ error: `${body.key} must be one of: ${VALID_VALUES[body.key].join(', ')}` }, { status: 400 });
        }
        config.params[body.key] = body.value;
      } else {
        const floor = PARAM_FLOORS[body.key];
        if (floor !== undefined && body.value < floor) {
          return NextResponse.json({ error: `${body.key} cannot be set below ${floor} (safety floor)` }, { status: 400 });
        }
        config.params[body.key] = body.value;
      }
    }

    // Set path mode (real/paper/disabled)
    if (body.action === "setPathMode" && body.pathName && body.mode) {
      if (!["real", "paper", "disabled"].includes(body.mode)) {
        return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
      }
      if (!config.paths[body.pathName]) {
        return NextResponse.json({ error: "Unknown path" }, { status: 400 });
      }
      config.paths[body.pathName].mode = body.mode;
      if (body.mode === "disabled") {
        config.paths[body.pathName].enabled = false;
      } else {
        config.paths[body.pathName].enabled = true;
      }
    }

    // Update path-specific stake tiers
    if (body.action === "updatePathStakeTier" && body.group && body.index !== undefined && body.stake !== undefined) {
      if (!config.pathStakeTiers) config.pathStakeTiers = {};
      // Initialize from default tiers if not set for this group
      if (!config.pathStakeTiers[body.group]) {
        config.pathStakeTiers[body.group] = JSON.parse(JSON.stringify(config.stakeTiers || [
          { minConf: 0.75, stake: 15, label: "75%+" },
          { minConf: 0.70, stake: 10, label: "70-74%" },
          { minConf: 0.60, stake: 10, label: "60-69%" },
          { minConf: 0.50, stake: 5, label: "50-59%" },
          { minConf: 0, stake: 5, label: "<50%" },
        ]));
      }
      if (config.pathStakeTiers[body.group][body.index]) {
        config.pathStakeTiers[body.group][body.index].stake = body.stake;
      }
    }

    // Clear path-specific stake tiers (revert to default)
    if (body.action === "clearPathStakeTier" && body.group) {
      if (config.pathStakeTiers) {
        delete config.pathStakeTiers[body.group];
      }
    }

    // Kill switch
    if (body.action === "killSwitch") {
      config.killSwitch = body.enabled;
    }

    // Circuit breaker toggle
    if (body.action === "toggleCircuitBreaker") {
      config.circuitBreakerEnabled = body.enabled;
    }

    // Toggle asset exclusion
    if (body.action === "toggleAsset" && body.asset) {
      if (!config.excludedAssets) config.excludedAssets = [];
      if (body.excluded) {
        if (!config.excludedAssets.includes(body.asset)) config.excludedAssets.push(body.asset);
      } else {
        config.excludedAssets = config.excludedAssets.filter((a: string) => a !== body.asset);
      }
    }

    // Update per-asset stake multiplier
    if (body.action === "updateAssetStake" && body.asset && body.multiplier !== undefined) {
      if (!config.assetStakeMultipliers) config.assetStakeMultipliers = {};
      config.assetStakeMultipliers[body.asset] = Math.max(0, Math.min(3, Math.round(body.multiplier * 10) / 10));
    }

    // Update asset weight (manual override)
    if (body.action === "updateAssetWeight" && body.asset !== undefined && body.weight !== undefined) {
      if (!config.assetWeights) config.assetWeights = {};
      const w = Math.max(-0.05, Math.min(0.05, body.weight));
      config.assetWeights[body.asset] = Math.round(w * 100) / 100;
    }

    // Legacy toggle support
    if (body.pathName && body.enabled !== undefined && !body.action) {
      if (!config.paths[body.pathName]) config.paths[body.pathName] = { enabled: true, label: body.pathName };
      config.paths[body.pathName].enabled = body.enabled;
    }

    config.updatedAt = new Date().toISOString();
    config.updatedBy = "dashboard";

    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
