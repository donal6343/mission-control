import { NextResponse } from "next/server";
import { readWorkspaceJson } from "@/lib/workspace";

interface RevenueData {
  totalMRR: number;
  totalARR: number;
  monthlyGrowth: number;
  streams: { name: string; mrr: number; status: string; trend: string }[];
}

const FALLBACK: RevenueData = {
  totalMRR: 0,
  totalARR: 0,
  monthlyGrowth: 0,
  streams: [
    { name: "Trueshot", mrr: 0, status: "pre-revenue", trend: "flat" },
    { name: "Consulting", mrr: 0, status: "active", trend: "up" },
  ],
};

export async function GET() {
  const data = await readWorkspaceJson<RevenueData>("state/revenue.json");
  return NextResponse.json(data || FALLBACK);
}
