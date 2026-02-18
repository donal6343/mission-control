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

    // Decision paths logic
    const decisionPaths = [
      { name: "🎰 ARB", requirement: `Price move >${((thresholds?.arbMinPriceMove || 0.003) * 100).toFixed(1)}% + odds lag >${((thresholds?.arbMinDiscrepancy || 0.02) * 100).toFixed(0)}%` },
      { name: "⚡ Breaking News", requirement: `News detected + ${((thresholds?.breakingNewsMinConfidence || 0.55) * 100).toFixed(0)}%+ conf` },
      { name: "🔥 Massive Edge", requirement: "30%+ edge + any 1 signal" },
      { name: "💰 High Edge", requirement: "20%+ edge + 2 signals" },
      { name: "Path 1", requirement: `${((thresholds?.path1?.confidence || 0.55) * 100).toFixed(0)}%+ conf + ${thresholds?.path1?.categories || 3} signals` },
      { name: "Path 2", requirement: `${((thresholds?.path2?.confidence || 0.60) * 100).toFixed(0)}%+ conf + ${thresholds?.path2?.categories || 2} signals` },
      { name: "Path 3", requirement: `${((thresholds?.path3?.confidence || 0.70) * 100).toFixed(0)}%+ conf + ${thresholds?.path3?.categories || 1} signal` },
    ];

    const signalCategories = [
      { name: "Technical", description: "RSI extremes, momentum" },
      { name: "Odds", description: "Contrarian value" },
      { name: "Sentiment", description: "Grok analysis" },
      { name: "Correlation", description: "BTC leads alts" },
      { name: "Breaking", description: "News detected" },
      { name: "ARB", description: "Price-odds discrepancy" },
    ];

    const safetyRails = [
      { rule: "Min market odds", value: "35%" },
      { rule: "Min edge required", value: `${((thresholds?.minEdge || 0.05) * 100).toFixed(0)}%` },
      { rule: "No duplicate bets", value: "Same market window" },
      { rule: "Time buffer", value: "Skip if <5 mins left" },
    ];

    const botStatusResponse = {
      name: "Polymarket 15M V2",
      cronId: POLYMARKET_CRON_ID,
      status: "running",
      schedule: "Every 5 minutes",
      lastRun,
      lastStatus,
      lastDuration,
      nextRun,
      description: "Edge-first value betting with multi-signal confirmation",
      logic: {
        decisionPaths,
        signalCategories,
        safetyRails,
        currentMode: "Trial Mode (looser thresholds for data collection)",
      }
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
