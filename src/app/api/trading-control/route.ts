import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const BOT_DIR = "/home/ubuntu/clawd/polymarket-15m";
const KILL_SWITCH_PATH = path.join(process.env.HOME || "", ".polymarket-kill");
const MODE_PATH = path.join(BOT_DIR, "trading-mode.json");
const STATE_PATH = path.join(BOT_DIR, "real-trading-state.json");
const WALLET_PATH = path.join(process.env.HOME || "", ".config/polymarket/wallet.json");

function getStatus() {
  // Kill switch
  let killSwitch = false;
  let killInfo = null;
  try {
    if (fs.existsSync(KILL_SWITCH_PATH)) {
      killSwitch = true;
      killInfo = JSON.parse(fs.readFileSync(KILL_SWITCH_PATH, "utf-8"));
    }
  } catch {}

  // Mode
  let mode = "paper";
  let modeUpdatedAt = null;
  try {
    const modeData = JSON.parse(fs.readFileSync(MODE_PATH, "utf-8"));
    mode = modeData.mode || "paper";
    modeUpdatedAt = modeData.updatedAt;
  } catch {}

  // Daily state
  let dailyState = { date: "", tradesPlaced: 0, totalPnl: 0, openPositions: 0, trades: [] };
  try {
    dailyState = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
  } catch {}

  // Wallet
  let walletConfigured = false;
  let walletAddress = null;
  try {
    if (fs.existsSync(WALLET_PATH)) {
      walletConfigured = true;
      const walletData = JSON.parse(fs.readFileSync(WALLET_PATH, "utf-8"));
      walletAddress = walletData.address;
    }
  } catch {}

  return {
    mode,
    modeUpdatedAt,
    killSwitch,
    killInfo,
    walletConfigured,
    walletAddress,
    daily: {
      date: dailyState.date,
      tradesPlaced: dailyState.tradesPlaced,
      totalPnl: dailyState.totalPnl,
      openPositions: dailyState.openPositions,
    },
    limits: {
      maxStakePerTrade: 10,
      maxDailyLoss: 50,
      maxDailyTrades: 30,
      maxConcurrentPositions: 5,
    },
  };
}

export async function GET() {
  return NextResponse.json(getStatus());
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, reason } = body;

    switch (action) {
      case "kill":
        fs.writeFileSync(
          KILL_SWITCH_PATH,
          JSON.stringify({
            activated: new Date().toISOString(),
            reason: reason || "Dashboard kill switch",
          })
        );
        return NextResponse.json({ ok: true, action: "kill", message: "Kill switch activated" });

      case "unkill":
        if (fs.existsSync(KILL_SWITCH_PATH)) {
          fs.unlinkSync(KILL_SWITCH_PATH);
        }
        return NextResponse.json({ ok: true, action: "unkill", message: "Kill switch deactivated" });

      case "set-mode": {
        const { mode } = body;
        if (!["paper", "real", "disabled"].includes(mode)) {
          return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
        }
        const config = {
          mode,
          updatedAt: new Date().toISOString(),
          updatedBy: "dashboard",
        };
        fs.writeFileSync(MODE_PATH, JSON.stringify(config, null, 2));
        return NextResponse.json({ ok: true, action: "set-mode", mode });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
