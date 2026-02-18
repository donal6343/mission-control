import { NextResponse } from "next/server";
import { readWorkspaceJson } from "@/lib/workspace";

interface Observation {
  id: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  timestamp: string;
  source: string;
}

const FALLBACK: Observation[] = [
  { id: "o1", message: "All systems operational", type: "success", timestamp: new Date().toISOString(), source: "monitor" },
  { id: "o2", message: "Twitter rate limit approaching (80%)", type: "warning", timestamp: new Date(Date.now() - 300000).toISOString(), source: "twitter" },
  { id: "o3", message: "New email from client: Project update", type: "info", timestamp: new Date(Date.now() - 900000).toISOString(), source: "email" },
  { id: "o4", message: "Cron job 'email-check' completed successfully", type: "success", timestamp: new Date(Date.now() - 1800000).toISOString(), source: "cron" },
  { id: "o5", message: "Memory usage at 62% - normal range", type: "info", timestamp: new Date(Date.now() - 3600000).toISOString(), source: "system" },
];

export async function GET() {
  const data = await readWorkspaceJson<{ observations: Observation[] }>("state/observations.json");
  return NextResponse.json({ observations: data?.observations || FALLBACK });
}
