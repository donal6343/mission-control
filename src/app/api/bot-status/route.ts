import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const POLYMARKET_PATH = "/home/ubuntu/clawd/polymarket-15m";
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || "/home/ubuntu/.openclaw/workspace";
const POLYMARKET_CRON_ID = "54d3c815-e34f-49b3-94cc-77c1f91b7bf4";

export async function GET() {
  try {
    let lastRun: string | null = null;
    let lastStatus: string | null = null;
    let lastDuration: string | null = null;
    let nextRun: string | null = null;
    let thresholds: any = null;

    // Try to read bot-status.json from polymarket directory (most accurate)
    try {
      const botStatusPath = join(POLYMARKET_PATH, "bot-status.json");
      const botStatus = JSON.parse(await readFile(botStatusPath, "utf-8"));
      lastRun = botStatus.lastRun;
      lastStatus = botStatus.status;
      nextRun = botStatus.nextRun;
      thresholds = botStatus.thresholds;
      var stakeTiersFromBot = botStatus.stakeTiers;
      var consecutiveErrors = botStatus.consecutiveErrors || 0;
      var lastSuccessfulRun = botStatus.lastSuccessfulRun || null;
      var erroringSince = botStatus.erroringSince || null;
      var lastError = botStatus.lastError || null;
    } catch {
      // Fall back to crons.json
      try {
        const cronsPath = join(WORKSPACE_PATH, "state/crons.json");
        const data = JSON.parse(await readFile(cronsPath, "utf-8"));
        const polymarketJob = data.jobs?.find((job: any) => job.id === POLYMARKET_CRON_ID);
        
        if (polymarketJob?.state) {
          lastRun = polymarketJob.state.lastRunAtMs 
            ? new Date(polymarketJob.state.lastRunAtMs).toISOString() 
            : null;
          lastStatus = polymarketJob.state.lastStatus;
          lastDuration = polymarketJob.state.lastDurationMs 
            ? `${(polymarketJob.state.lastDurationMs / 1000).toFixed(1)}s`
            : null;
          nextRun = polymarketJob.state.nextRunAtMs 
            ? new Date(polymarketJob.state.nextRunAtMs).toISOString() 
            : null;
        }
      } catch {}
    }

    // Read trading config for path enabled states
    let tradingConfig: any = { paths: {} };
    try {
      tradingConfig = JSON.parse(await readFile(join(POLYMARKET_PATH, "trading-config.json"), "utf-8"));
    } catch {}

    // Decision paths — read dynamically from bot thresholds
    const pc = tradingConfig.paths || {};
    const params = tradingConfig.params || {};
    const decisionPaths = [
      { name: "🎰 ARB", key: "arb", requirement: `Price move >${((thresholds?.arbMinPriceMove || 0.003) * 100).toFixed(1)}% + odds lag >${((thresholds?.arbMinDiscrepancy || 0.02) * 100).toFixed(0)}% + conf ≥45%`, type: "bypass", enabled: pc.arb?.enabled !== false, mode: pc.arb?.mode || 'paper' },
      { name: "⚡ Breaking News", key: "breakingNews", requirement: `News detected + ${((thresholds?.breakingNewsMinConfidence || 0.60) * 100).toFixed(0)}%+ conf + price confirmation`, type: "bypass", enabled: pc.breakingNews?.enabled !== false, mode: pc.breakingNews?.mode || 'paper' },
      { name: "Path 1", key: "path1", requirement: `${thresholds?.path1?.categories || 3} signals + ${((thresholds?.minEdge || 0.03) * 100).toFixed(0)}%+ edge (min ${((thresholds?.path1?.confidence || 0.50) * 100).toFixed(0)}% conf)`, type: "signal", enabled: pc.path1?.enabled !== false, mode: pc.path1?.mode || 'paper' },
      { name: "Path 2", key: "path2", requirement: `${thresholds?.path2?.categories || 2} signals + ${((thresholds?.minEdge || 0.03) * 100).toFixed(0)}%+ edge (min ${((thresholds?.path2?.confidence || 0.55) * 100).toFixed(0)}% conf)`, type: "signal", enabled: pc.path2?.enabled !== false, mode: pc.path2?.mode || 'paper' },
      { name: "Path 3", key: "path3", requirement: `${thresholds?.path3?.categories || 1} signal + ${((thresholds?.minEdge || 0.03) * 100).toFixed(0)}%+ edge (min ${((thresholds?.path3?.confidence || 0.65) * 100).toFixed(0)}% conf)`, type: "signal", enabled: pc.path3?.enabled !== false, mode: pc.path3?.mode || 'paper' },
      { name: "🐋 Whale", key: "whale", requirement: "Whale flow agrees with direction + min edge (testing mode)", type: "whale", enabled: pc.whale?.enabled !== false, mode: pc.whale?.mode || 'paper' },
      { name: "📅 Macro", key: "macro", requirement: "Economic events + sentiment shift", type: "macro", enabled: pc.macro?.enabled !== false, mode: pc.macro?.mode || 'paper' },
      { name: "🏗️ S/R Levels", key: "supportResistance", requirement: `S/R signal + 1 confirming + ${((params.srMinConfidence || 0.60) * 100).toFixed(0)}%+ conf + ${((params.minEdge || 0.03) * 100).toFixed(0)}%+ edge`, type: "signal", enabled: pc.supportResistance?.enabled !== false, mode: pc.supportResistance?.mode || 'paper' },
      { name: "🧠 Adaptive", key: "adaptive", requirement: `Learns from today's results (min ${pc.adaptive?.minWindowsToLearn || 6} windows), adjusts signal weights`, type: "signal", enabled: pc.adaptive?.enabled !== false, mode: pc.adaptive?.mode || 'paper' },
      { name: "🔒 Close", key: "close", requirement: `Price ${((params.closeMinPrice || 0.80) * 100).toFixed(0)}-${((params.closeMaxPrice || 0.85) * 100).toFixed(0)}c + <${params.closeMaxMinutesRemaining || 5}min left`, type: "close", enabled: pc.close?.enabled !== false, mode: pc.close?.mode || 'paper' },
    ];

    // Asset weights — set dynamically by macro sentiment bot
    const dynamicWeights = tradingConfig.assetWeights || {};
    const macroUpdate = tradingConfig.macroUpdate || {};
    const allAssets = ['BTC', 'ETH', 'SOL', 'XRP'];
    const macroWeightSource = tradingConfig.params?.macroWeightSource || 'manual';
    const assetConfig = allAssets.map(asset => {
      const manualWeight = dynamicWeights[asset] !== undefined ? dynamicWeights[asset] : (thresholds?.assetWeights?.[asset] || 0);
      const engineWeight = macroUpdate.results?.[asset]?.weight || 0;
      const weight = macroWeightSource === 'engine' ? engineWeight : manualWeight;
      const macroResult = macroUpdate.results?.[asset];
      const assetStakeMultipliers = tradingConfig.assetStakeMultipliers || {};
      return {
        asset,
        weight,
        stakeMultiplier: assetStakeMultipliers[asset] ?? 1.0,
        sentiment: weight > 0.01 ? "bullish" : weight < -0.01 ? "bearish" : "neutral",
        excluded: (tradingConfig.excludedAssets || thresholds?.excludedAssets || []).includes(asset),
        macro: macroResult ? {
          priceTrend: macroResult.price?.trend || macroResult.outlook,
          momentum4h: macroResult.price?.momentum4h,
          sentimentRaw: macroResult.sentiment?.reason || macroResult.summary,
          keyFactor: macroResult.key_factor,
          confidence: macroResult.confidence,
          source: macroUpdate.source,
        } : null,
      };
    });

    const signalCategories = [
      { name: "Technical", description: "RSI extremes, VWAP deviation, ATR volatility" },
      { name: "Momentum", description: "Price momentum over window" },
      { name: "Sentiment", description: "Grok X/Twitter analysis" },
      { name: "Correlation", description: "BTC move triggers alt bets" },
      { name: "Breaking News", description: "Market-moving news (with quality gates)" },
      { name: "ARB", description: "Price moved but odds haven't caught up" },
    ];

    const safetyRails = [
      { rule: "Min market odds", value: `${((params.minMarketOdds ?? 0.25) * 100).toFixed(0)}%`, configKey: "minMarketOdds" },
      { rule: "Min edge required", value: `${((params.minEdge ?? 0.03) * 100).toFixed(0)}%`, configKey: "minEdge" },
      { rule: "Max confidence cap", value: `${((params.maxConfidence ?? 0.80) * 100).toFixed(0)}%`, configKey: "maxConfidence" },
      { rule: "Max stake per trade", value: `$${params.maxStakePerTrade ?? 20}`, configKey: "maxStakePerTrade" },
      { rule: "Max daily trades", value: `${params.maxDailyTrades ?? 100}`, configKey: "maxDailyTrades" },
      { rule: "Max daily loss", value: `$${params.maxDailyLoss ?? 50}`, configKey: "maxDailyLoss" },
      { rule: "Max concurrent positions", value: `${params.maxConcurrentPositions ?? 20}`, configKey: "maxConcurrentPositions" },
      { rule: "Max price divergence", value: `${((params.maxPriceDivergence ?? 0.15) * 100).toFixed(0)}pp`, configKey: "maxPriceDivergence" },
      { rule: "Max slippage", value: `${((params.maxSlippage ?? 0.10) * 100).toFixed(0)}pp`, configKey: "maxSlippage" },
      { rule: "News cooldown", value: `${((thresholds?.breakingNewsCooldownMs || 900000) / 60000).toFixed(0)} min per asset` },
      { rule: "News rate limit", value: `${thresholds?.breakingNewsMaxPerHour || 3}/hr max` },
      { rule: "No duplicate bets", value: "Same market window" },
      { rule: "Excluded assets", value: (tradingConfig.excludedAssets || []).join(", ") || "None" },
    ];

    // Read wallet status
    let walletStatus: any = null;
    try {
      walletStatus = JSON.parse(await readFile(join(POLYMARKET_PATH, "wallet-status.json"), "utf-8"));
    } catch {}

    // Determine actual health status
    const isStale = lastRun && (Date.now() - new Date(lastRun).getTime() > 120000); // >2min since last run
    const isErroring = lastStatus === 'error' && consecutiveErrors > 0;
    const healthStatus = isErroring ? "error" : isStale ? "stale" : "running";

    // Circuit breaker state
    let circuitBreaker: any = { active: false, enabled: true, recentWR: null, pausedUntil: null };
    try {
      const regimeState = JSON.parse(await readFile(join(POLYMARKET_PATH, "regime-state.json"), "utf-8"));
      const results = regimeState.recentResults || [];
      const wins = results.filter((r: string) => r === 'W').length;
      const wr = results.length > 0 ? wins / results.length : null;
      const now = Date.now();
      const isActive = regimeState.pausedUntil && now < regimeState.pausedUntil;
      const minsLeft = isActive ? Math.round((regimeState.pausedUntil - now) / 60000) : 0;
      
      // Check if circuit breaker is enabled (disabled in paper mode or via config toggle)
      const cbEnabled = tradingConfig.circuitBreakerEnabled !== false; // default true
      const globalMode = (() => { try { return JSON.parse(require("fs").readFileSync(join(POLYMARKET_PATH, "trading-mode.json"), "utf-8")).mode; } catch { return "paper"; } })();
      const bypassed = globalMode === 'paper' || !cbEnabled;
      
      circuitBreaker = {
        active: isActive && !bypassed,
        enabled: cbEnabled,
        bypassed,
        bypassReason: !cbEnabled ? 'Disabled via dashboard' : globalMode === 'paper' ? 'Paper mode' : null,
        recentResults: results.slice(-10),
        recentWR: wr !== null ? Math.round(wr * 100) : null,
        pausedUntil: isActive ? regimeState.pausedUntil : null,
        minsLeft: isActive ? minsLeft : 0,
        lookback: 10,
        threshold: 35,
      };
    } catch {}

    const botStatusResponse = {
      name: "Polymarket 15M V2",
      cronId: POLYMARKET_CRON_ID,
      status: healthStatus,
      schedule: "Every 5 minutes",
      lastRun,
      lastStatus,
      lastDuration,
      nextRun,
      wallet: walletStatus ? {
        address: walletStatus.address,
        pol: walletStatus.pol,
        usdc: walletStatus.usdc,
        lastChecked: walletStatus.timestamp,
      } : null,
      health: {
        consecutiveErrors: consecutiveErrors || 0,
        lastSuccessfulRun: lastSuccessfulRun || null,
        erroringSince: erroringSince || null,
        lastError: lastError || null,
        executionAlert: (() => { try { return JSON.parse(require("fs").readFileSync(join(POLYMARKET_PATH, "execution-alert.json"), "utf-8")); } catch { return null; } })(),
      },
      description: "Edge-first value betting with multi-signal confirmation",
      logic: {
        decisionPaths,
        signalCategories,
        safetyRails,
        assetConfig,
        stakeTiers: tradingConfig.stakeTiers || stakeTiersFromBot || [],
        params: tradingConfig.params || {},
        killSwitch: tradingConfig.killSwitch || false,
        excludedAssets: tradingConfig.excludedAssets || thresholds?.excludedAssets || [],
        macroUpdate: tradingConfig.macroUpdate ? {
          timestamp: tradingConfig.macroUpdate.timestamp,
          source: tradingConfig.macroUpdate.source,
        } : null,
        currentMode: "Week 2 — Optimised settings + fair odds fix",
        fairOddsFormula: "50% + (signal_strength / 6) × 30% → range 50-80%",
      },
      circuitBreaker,
      macroSentiment: (() => {
        try {
          const macroResult = JSON.parse(require("fs").readFileSync(join(POLYMARKET_PATH, "macro-sentiment-result.json"), "utf-8"));
          const macroLog = JSON.parse(require("fs").readFileSync(join(POLYMARKET_PATH, "macro-sentiment-log.json"), "utf-8"));
          const lastWeights = macroLog.history?.slice(-5) || [];
          return {
            current: macroResult.data || {},
            updatedAt: macroResult.timestamp ? new Date(macroResult.timestamp * 1000).toISOString() : null,
            recentHistory: lastWeights.map((h: any) => ({
              timestamp: h.timestamp,
              weights: h.weights,
            })),
          };
        } catch { return null; }
      })()
    };

    return NextResponse.json({ bot: botStatusResponse, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error("Error fetching bot status:", error);
    return NextResponse.json({ 
      bot: {
        name: "Polymarket 15M Monitor",
        status: "unknown",
        schedule: "Every 5 minutes",
      },
      error: error.message,
      timestamp: new Date().toISOString() 
    });
  }
}
