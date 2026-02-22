import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTION_API_KEY = fs.readFileSync(
  path.join(process.env.HOME || "", ".config/notion/api_key"),
  "utf-8"
).trim();

const DATABASE_ID = "ef252bd7-2bf6-4865-94be-7435ec41fb90";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date"); // YYYY-MM-DD format
    
    // Build filter for the specific date if provided
    let filter: any = undefined;
    let targetDate = dateParam || new Date().toISOString().split("T")[0];
    
    // Get start and end of the target day
    const dayStart = `${targetDate}T00:00:00.000Z`;
    const dayEnd = `${targetDate}T23:59:59.999Z`;
    
    filter = {
      and: [
        {
          property: "Window End",
          date: { on_or_after: dayStart }
        },
        {
          property: "Window End",
          date: { on_or_before: dayEnd }
        }
      ]
    };

    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter,
        sorts: [{ property: "Window End", direction: "descending" }],
        page_size: 100,
      }),
    });

    const data = await res.json();
    
    let wins = 0, losses = 0, pending = 0;
    let pnl = 0;
    
    const trades = (data.results || []).map((page: any) => {
      const props = page.properties;
      const name = props?.Name?.title?.[0]?.plain_text || "Unknown";
      const result = props?.Result?.select?.name || "Pending";
      const stake = props?.Stake?.number || 10;
      const odds = props?.["Entry Odds"]?.number || 0.5;
      const confidence = props?.Confidence?.number || 0;
      const asset = props?.Asset?.select?.name || "?";
      const direction = props?.Direction?.select?.name || "?";
      const signals = props?.Signals?.rich_text?.[0]?.plain_text || "";
      const marketUrl = props?.["Market URL"]?.url || "";
      const windowEnd = props?.["Window End"]?.date?.start || null;
      
      let profit = 0;
      if (result === "Adjustment") {
        // Daily reconciliation adjustment — apply as-is to PnL
        // Positive adjustment = we have more than Notion thinks (profit)
        // Negative adjustment = we have less (loss)
        // The name contains the direction info
        const isPositive = name.includes('+') || signals.includes('Change +');
        profit = isPositive ? stake : -stake;
        pnl += profit;
      } else if (result === "Win") {
        wins++;
        profit = stake * (1 - odds) / odds;
        pnl += profit;
      } else if (result === "Loss") {
        losses++;
        profit = -stake;
        pnl -= stake;
      } else {
        pending++;
      }
      
      // Extract mode from signals text [💰 REAL] or [📄 PAPER]
      const mode = signals.includes('💰 REAL') ? 'real' : signals.includes('📄 PAPER') ? 'paper' : 'paper';
      // Extract rejection reason if present
      const rejectedMatch = signals.match(/REJECTED: (.+?)(\||$)/);
      const rejectionReason = rejectedMatch ? rejectedMatch[1].trim() : null;

      return {
        id: page.id,
        name,
        asset,
        direction,
        result,
        stake,
        odds,
        confidence,
        profit,
        signals,
        mode,
        rejectionReason,
        marketUrl,
        windowEnd,
        notionUrl: `https://notion.so/${page.id.replace(/-/g, '')}`,
      };
    });

    const winRate = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(1) : "N/A";

    // Also fetch overall stats (all time)
    const allTimeRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sorts: [{ property: "Window End", direction: "descending" }],
        page_size: 100,
      }),
    });
    
    // Paginate through ALL trades for accurate all-time stats
    let allTimeResults: any[] = [];
    let hasMore = true;
    let startCursor: string | undefined = undefined;
    while (hasMore) {
      const pageRes: Response = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_API_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sorts: [{ property: "Window End", direction: "descending" }],
          page_size: 100,
          ...(startCursor ? { start_cursor: startCursor } : {}),
        }),
      });
      const allTimeData = await pageRes.json();
      allTimeResults = allTimeResults.concat(allTimeData.results || []);
      hasMore = allTimeData.has_more;
      startCursor = allTimeData.next_cursor;
    }

    const modeStats: Record<string, { wins: number; losses: number; pending: number; pnl: number }> = {
      all: { wins: 0, losses: 0, pending: 0, pnl: 0 },
      paper: { wins: 0, losses: 0, pending: 0, pnl: 0 },
      real: { wins: 0, losses: 0, pending: 0, pnl: 0 },
    };

    allTimeResults.forEach((page: any) => {
      const props = page.properties;
      const result = props?.Result?.select?.name || "Pending";
      const stake = props?.Stake?.number || 10;
      const odds = props?.["Entry Odds"]?.number || 0.5;
      const signals = props?.Signals?.rich_text?.[0]?.plain_text || "";
      const mode = signals.includes('💰 REAL') ? 'real' : 'paper';

      let profit = 0;
      if (result === "Adjustment") {
        const name = props?.Name?.title?.[0]?.plain_text || "";
        const isPositive = name.includes('+') || signals.includes('Change +');
        profit = isPositive ? stake : -stake;
        modeStats.all.pnl += profit; modeStats[mode].pnl += profit;
      } else if (result === "Win") {
        profit = stake * (1 - odds) / odds;
        modeStats.all.wins++; modeStats[mode].wins++;
        modeStats.all.pnl += profit; modeStats[mode].pnl += profit;
      } else if (result === "Loss") {
        profit = -stake;
        modeStats.all.losses++; modeStats[mode].losses++;
        modeStats.all.pnl += profit; modeStats[mode].pnl += profit;
      } else {
        modeStats.all.pending++; modeStats[mode].pending++;
      }
    });

    const buildStats = (s: typeof modeStats.all) => ({
      wins: s.wins,
      losses: s.losses,
      pending: s.pending,
      pnl: s.pnl.toFixed(2),
      winRate: s.wins + s.losses > 0 ? (s.wins / (s.wins + s.losses) * 100).toFixed(1) : "N/A",
      total: s.wins + s.losses + s.pending,
    });

    return NextResponse.json({ 
      trades, 
      date: targetDate,
      stats: { wins, losses, pending, pnl: pnl.toFixed(2), winRate },
      allTime: buildStats(modeStats.all),
      allTimePaper: buildStats(modeStats.paper),
      allTimeReal: buildStats(modeStats.real),
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
