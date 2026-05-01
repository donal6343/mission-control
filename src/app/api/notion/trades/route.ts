import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTION_API_KEY = fs.readFileSync(
  path.join(process.env.HOME || "", ".config/notion/api_key"),
  "utf-8"
).trim();

const DATABASE_ID = "ef252bd7-2bf6-4865-94be-7435ec41fb90";
const CACHE_DIR = path.join(process.env.HOME || "", "clawd/polymarket-15m/cache");
const ALL_TIME_CACHE = path.join(CACHE_DIR, "all-time-stats.json");
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Ensure cache dir exists
try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

function parseTrade(page: any) {
  const props = page.properties;
  const name = props?.Name?.title?.[0]?.plain_text || "Unknown";
  const result = props?.Result?.select?.name || "Pending";
  const stake = props?.Stake?.number || 10;
  const odds = props?.["Entry Odds"]?.number || 0.5;
  const fillPrice = props?.["Fill Price"]?.number ?? null;
  const effectiveOdds = fillPrice ?? odds; // Use fill price for display/profit if available
  const confidence = props?.Confidence?.number || 0;
  const asset = props?.Asset?.select?.name || "?";
  const direction = props?.Direction?.select?.name || "?";
  const signals = props?.Signals?.rich_text?.[0]?.plain_text || "";
  const marketUrl = props?.["Market URL"]?.url || "";
  const windowEnd = props?.["Window End"]?.date?.start || null;
  const windowStart = props?.["Window Start"]?.date?.start || null;
  const executionTime = props?.["Execution Time"]?.date?.start || null;

  let profit = 0;
  if (result === "Adjustment") {
    const isPositive = name.includes('+') || signals.includes('Change +');
    profit = isPositive ? stake : -stake;
  } else if (result === "Win") {
    profit = stake * (1 - effectiveOdds) / effectiveOdds;
  } else if (result === "Loss") {
    profit = -stake;
  }

  const mode = signals.includes('💰 REAL') ? 'real' : signals.includes('📄 PAPER') ? 'paper' : 'paper';

  let tradePath = 'unknown';
  if (signals.includes('🏗️ S/R') || signals.includes('S/R:')) tradePath = 'sr';
  else if (signals.match(/Path1[W:]|Path1\b/)) tradePath = 'path1';
  else if (signals.match(/Path2[W:]|Path2\b/)) tradePath = 'path2';
  else if (signals.match(/Path3[W:]|Path3\b/)) tradePath = 'path3';
  else if (signals.includes('🎰 ARB') || signals.includes('Arb:')) tradePath = 'arb';
  else if (signals.includes('⚡ BREAKING') || signals.includes('breakingNews')) tradePath = 'breakingNews';
  else if (signals.includes('📅 MACRO') || signals.includes('Macro:')) tradePath = 'macro';
  else if (signals.includes('🐋 WHALE')) tradePath = 'whale';
  else if (signals.includes('🎯 TREND') || signals.includes('Trend:')) tradePath = 'trend';
  else if (signals.includes('🔄 COPY') || signals.includes('Copy:')) tradePath = 'copy';
  else if (signals.includes('🧠 ADAPTIVE') || signals.includes('ADAPTIVE:') || signals.includes('Adaptive')) tradePath = 'adaptive';
  else if (signals.includes('🔒 CLOSE') || signals.includes('CLOSE:')) tradePath = 'close';

  const rejectedMatch = signals.match(/REJECTED: (.+?)(\||$)/);
  const rejectionReason = rejectedMatch ? rejectedMatch[1].trim() : null;

  return {
    id: page.id,
    name, asset, direction, result, stake, odds, fillPrice, effectiveOdds, confidence, profit, signals,
    mode, tradePath, rejectionReason, marketUrl, windowEnd, windowStart, executionTime,
    notionUrl: `https://notion.so/${page.id.replace(/-/g, '')}`,
  };
}

function accumStats(trades: any[]) {
  const modeStats: Record<string, { wins: number; losses: number; pending: number; pnl: number }> = {
    all: { wins: 0, losses: 0, pending: 0, pnl: 0 },
    paper: { wins: 0, losses: 0, pending: 0, pnl: 0 },
    real: { wins: 0, losses: 0, pending: 0, pnl: 0 },
  };

  for (const t of trades) {
    const mode = t.mode || 'paper';
    if (t.result === "Adjustment") {
      modeStats.all.pnl += t.profit; modeStats[mode].pnl += t.profit;
    } else if (t.result === "Win") {
      modeStats.all.wins++; modeStats[mode].wins++;
      modeStats.all.pnl += t.profit; modeStats[mode].pnl += t.profit;
    } else if (t.result === "Loss") {
      modeStats.all.losses++; modeStats[mode].losses++;
      modeStats.all.pnl += t.profit; modeStats[mode].pnl += t.profit;
    } else {
      modeStats.all.pending++; modeStats[mode].pending++;
    }
  }
  return modeStats;
}

function buildStats(s: { wins: number; losses: number; pending: number; pnl: number }) {
  return {
    wins: s.wins, losses: s.losses, pending: s.pending,
    pnl: s.pnl.toFixed(2),
    winRate: s.wins + s.losses > 0 ? (s.wins / (s.wins + s.losses) * 100).toFixed(1) : "N/A",
    total: s.wins + s.losses + s.pending,
  };
}

async function fetchNotionPage(filter?: any, sorts?: any[], cursor?: string) {
  const body: any = { page_size: 100 };
  if (filter) body.filter = filter;
  if (sorts) body.sorts = sorts;
  if (cursor) body.start_cursor = cursor;

  const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function fetchAllTrades() {
  const results: any[] = [];
  let hasMore = true;
  let cursor: string | undefined;

  while (hasMore) {
    const data = await fetchNotionPage(undefined, [{ property: "Window End", direction: "descending" }], cursor);
    results.push(...(data.results || []));
    hasMore = data.has_more;
    cursor = data.next_cursor;
  }
  return results.map(parseTrade);
}

async function getAllTimeStats(forceRefresh = false) {
  // Always try to return cached data first
  let cached: any = null;
  try {
    cached = JSON.parse(fs.readFileSync(ALL_TIME_CACHE, "utf-8"));
  } catch {}

  // If cache is fresh enough, return it
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  // If cache exists but is stale, return stale cache immediately
  // and refresh in background (stale-while-revalidate)
  if (cached && !forceRefresh) {
    // Fire background refresh (don't await)
    refreshAllTimeCache().catch(() => {});
    return cached;
  }

  // No cache at all or force refresh — must fetch synchronously
  return refreshAllTimeCache();
}

async function refreshAllTimeCache() {
  const allTrades = await fetchAllTrades();
  const modeStats = accumStats(allTrades);

  const result = {
    allTime: buildStats(modeStats.all),
    allTimePaper: buildStats(modeStats.paper),
    allTimeReal: buildStats(modeStats.real),
    tradeCount: allTrades.length,
    cachedAt: Date.now(),
  };

  try { fs.writeFileSync(ALL_TIME_CACHE, JSON.stringify(result)); } catch {}
  return result;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const refresh = searchParams.get("refresh") === "1";

    const targetDate = dateParam || new Date().toISOString().split("T")[0];
    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;

    const filter = {
      and: [
        { property: "Window Start", date: { on_or_after: dayStart } },
        { property: "Window Start", date: { on_or_before: dayEnd } },
      ],
    };

    // Fetch today's trades (paginated) + cached all-time stats in parallel
    async function fetchDayTrades() {
      const results: any[] = [];
      let hasMore = true;
      let cursor: string | undefined;
      while (hasMore) {
        const data = await fetchNotionPage(filter, [{ property: "Window End", direction: "descending" }], cursor);
        results.push(...(data.results || []));
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }
      return results.map(parseTrade);
    }

    const [trades, allTimeStats] = await Promise.all([
      fetchDayTrades(),
      getAllTimeStats(refresh),
    ]);

    let wins = 0, losses = 0, pending = 0, pnl = 0;
    for (const t of trades) {
      if (t.result === "Win") { wins++; pnl += t.profit; }
      else if (t.result === "Loss") { losses++; pnl += t.profit; }
      else if (t.result === "Adjustment") { pnl += t.profit; }
      else { pending++; }
    }

    const winRate = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(1) : "N/A";

    return NextResponse.json({
      trades,
      date: targetDate,
      stats: { wins, losses, pending, pnl: pnl.toFixed(2), winRate },
      ...allTimeStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
