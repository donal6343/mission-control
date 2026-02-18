import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

const CRYPTO_PATH = "/home/ubuntu/.openclaw/agents/crypto";
const TRADES_PATH = "/home/ubuntu/.openclaw/workspace/state/crons.json";

interface Prediction {
  id: string;
  date: string;
  prediction: string;
  reasoning: string;
  deadline: string;
  status: string;
  confidence: string;
  category: string;
  priceAtPrediction?: number;
  result?: string;
}

export async function GET() {
  try {
    // Read predictions
    let predictions: Prediction[] = [];
    let stats = { total: 0, resolved: 0, correct: 0, wrong: 0 };
    
    try {
      const predData = JSON.parse(await readFile(`${CRYPTO_PATH}/predictions.json`, "utf-8"));
      predictions = predData.predictions || [];
      stats = predData.stats || stats;
    } catch (e) {
      console.error("Error reading predictions:", e);
    }

    // Separate pending and resolved
    const pending = predictions.filter(p => p.status === "pending");
    const resolved = predictions.filter(p => p.status !== "pending").slice(-10);

    // Calculate win rate
    const winRate = stats.resolved > 0 ? ((stats.correct / stats.resolved) * 100).toFixed(1) : "0";

    return NextResponse.json({
      predictions: {
        pending,
        resolved,
        stats: {
          ...stats,
          winRate,
          pendingCount: pending.length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch crypto data:", error);
    return NextResponse.json({
      predictions: { pending: [], resolved: [], stats: {} },
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
