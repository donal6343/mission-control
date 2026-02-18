import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const NOTION_API_KEY = fs.readFileSync(
  path.join(process.env.HOME || "", ".config/notion/api_key"),
  "utf-8"
).trim();

const REPORTS_DB_ID = "ebce804f-fc34-4532-9230-b23a9e6c25ef";

export async function GET() {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${REPORTS_DB_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 20,
      }),
    });

    const data = await res.json();
    
    const reports = (data.results || []).map((page: any) => {
      const props = page.properties;
      // Try different property names for the title
      const nameProperty = props?.Name || props?.name || props?.Title || props?.title;
      let name = "Untitled";
      
      if (nameProperty?.title?.[0]?.plain_text) {
        name = nameProperty.title[0].plain_text;
      }

      return {
        id: page.id,
        name,
        url: `https://notion.so/${page.id.replace(/-/g, '')}`,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
      };
    });

    return NextResponse.json({ 
      reports,
      timestamp: new Date().toISOString() 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
