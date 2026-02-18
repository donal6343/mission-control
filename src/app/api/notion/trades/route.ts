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
      if (result === "Win") {
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
    
    const allTimeData = await allTimeRes.json();
    let allWins = 0, allLosses = 0, allPending = 0, allPnl = 0;
    
    (allTimeData.results || []).forEach((page: any) => {
      const props = page.properties;
      const result = props?.Result?.select?.name || "Pending";
      const stake = props?.Stake?.number || 10;
      const odds = props?.["Entry Odds"]?.number || 0.5;
      
      if (result === "Win") {
        allWins++;
        allPnl += stake * (1 - odds) / odds;
      } else if (result === "Loss") {
        allLosses++;
        allPnl -= stake;
      } else {
        allPending++;
      }
    });

    const allTimeWinRate = allWins + allLosses > 0 ? (allWins / (allWins + allLosses) * 100).toFixed(1) : "N/A";

    return NextResponse.json({ 
      trades, 
      date: targetDate,
      stats: { wins, losses, pending, pnl: pnl.toFixed(2), winRate },
      allTime: { 
        wins: allWins, 
        losses: allLosses, 
        pending: allPending, 
        pnl: allPnl.toFixed(2), 
        winRate: allTimeWinRate,
        total: allWins + allLosses + allPending
      },
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
