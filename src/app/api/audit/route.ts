import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const filePath = join(process.env.HOME || "/home/ubuntu", "clawd/polymarket-15m/audit-findings.json");
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({
      timestamp: null,
      healthScore: null,
      totalFindings: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      byCategory: { performance: 0, reliability: 0, "new-opportunity": 0, risk: 0, optimization: 0 },
      findings: [],
      error: e instanceof Error ? e.message : "No audit data yet",
    });
  }
}
