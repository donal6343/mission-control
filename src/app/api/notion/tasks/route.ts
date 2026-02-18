import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTION_API_KEY = fs.readFileSync(
  path.join(process.env.HOME || "", ".config/notion/api_key"),
  "utf-8"
).trim();

const DATABASE_ID = "2f6f4aa3-9817-80d9-82ae-d5ecc73fc759";

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
        sorts: [{ property: "Created time", direction: "descending" }],
        page_size: 30,
      }),
    });

    const data = await res.json();
    
    const tasks = (data.results || []).map((page: any) => {
      const props = page.properties;
      return {
        id: page.id,
        title: props?.Task?.title?.[0]?.plain_text || props?.Name?.title?.[0]?.plain_text || "Untitled",
        done: props?.Done?.checkbox || false,
        createdAt: page.created_time,
        notionUrl: `https://notion.so/${page.id.replace(/-/g, '')}`,
      };
    });

    const done = tasks.filter((t: any) => t.done).length;
    const pending = tasks.filter((t: any) => !t.done).length;

    return NextResponse.json({ 
      tasks, 
      stats: { total: tasks.length, done, pending },
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
