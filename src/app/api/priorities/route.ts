import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || "/home/ubuntu/.openclaw/workspace";

export async function GET() {
  try {
    const prioritiesPath = join(WORKSPACE_PATH, "state/priorities.json");
    const data = JSON.parse(await readFile(prioritiesPath, "utf-8"));
    
    return NextResponse.json({
      ...data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch priorities:", error);
    return NextResponse.json({
      priorities: [],
      scores: { revenue: 0, product: 0, growth: 0, ops: 0 },
      blockers: [],
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
