import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

interface ContentItem {
  id: string;
  title: string;
  category: string;
  status: string;
  platform?: string;
  priority?: string;
  notes?: string;
  notionUrl: string;
}

const NOTION_API_KEY_PATH = process.env.NOTION_API_KEY_PATH || "/home/ubuntu/.config/notion/api_key";
const CONTENT_DB_ID = "307f4aa3-9817-8145-bc62-f3e599a097e3";

async function getNotionApiKey(): Promise<string | null> {
  try {
    const key = await readFile(NOTION_API_KEY_PATH, "utf-8");
    return key.trim();
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const apiKey = await getNotionApiKey();
    if (!apiKey) {
      return NextResponse.json({ items: [], error: "No Notion API key", timestamp: new Date().toISOString() });
    }

    const response = await fetch(`https://api.notion.com/v1/databases/${CONTENT_DB_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        sorts: [
          { property: "Priority", direction: "ascending" },
          { property: "Status", direction: "ascending" },
        ],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const data = await response.json();

    const items: ContentItem[] = data.results.map((page: any) => {
      const props = page.properties;
      return {
        id: page.id,
        title: props.Title?.title?.[0]?.plain_text || "Untitled",
        category: props.Category?.select?.name || "Uncategorized",
        status: props.Status?.select?.name?.toLowerCase() || "idea",
        platform: props.Platform?.select?.name,
        priority: props.Priority?.select?.name,
        notes: props.Notes?.rich_text?.[0]?.plain_text,
        notionUrl: `https://notion.so/${page.id.replace(/-/g, "")}`,
      };
    });

    // Group by category for stats
    const byCategory = items.reduce((acc: Record<string, number>, item) => {
      acc[item.category] = (acc[item.category] || 0) + 1;
      return acc;
    }, {});

    const byStatus = items.reduce((acc: Record<string, number>, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      items,
      stats: {
        total: items.length,
        byCategory,
        byStatus,
        inProgress: (byStatus.drafting || 0) + (byStatus.review || 0),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching content pipeline:", error);
    return NextResponse.json({
      items: [],
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
