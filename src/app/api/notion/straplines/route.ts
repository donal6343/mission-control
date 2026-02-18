import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTION_API_KEY = fs.readFileSync(
  path.join(process.env.HOME || "", ".config/notion/api_key"),
  "utf-8"
).trim();

const DATABASE_ID = "45515a96-4d03-4904-abae-2dcac588d0ea";

export async function GET() {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sorts: [{ property: "UsedDate", direction: "descending" }],
        page_size: 50,
      }),
    });

    const data = await res.json();
    
    const straplines = (data.results || []).map((page: any) => ({
      id: page.id,
      text: page.properties?.Name?.title?.[0]?.plain_text || "Unknown",
      used: page.properties?.Used?.checkbox || false,
      usedDate: page.properties?.UsedDate?.date?.start || null,
      notionUrl: `https://notion.so/${page.id.replace(/-/g, '')}`,
    }));

    const unused = straplines.filter((s: any) => !s.used).length;
    const used = straplines.filter((s: any) => s.used).length;

    return NextResponse.json({ 
      straplines, 
      stats: { total: straplines.length, unused, used },
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
