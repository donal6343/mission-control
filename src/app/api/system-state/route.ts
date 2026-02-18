import { NextResponse } from "next/server";
import { readWorkspaceJson } from "@/lib/workspace";

interface ServerInfo {
  name: string;
  status: string;
  url?: string;
  uptime?: string;
  cpu?: number;
  memory?: number;
  lastCheck?: string;
}

const FALLBACK: ServerInfo[] = [
  { name: "Gateway", status: "online", uptime: "14d 6h", cpu: 12, memory: 34 },
  { name: "Agent Runtime", status: "online", uptime: "14d 6h", cpu: 28, memory: 52 },
  { name: "Convex", status: "online", uptime: "30d+", cpu: 5, memory: 18 },
  { name: "Telegram Bot", status: "online", uptime: "7d 2h", cpu: 3, memory: 12 },
];

export async function GET() {
  const data = await readWorkspaceJson<{ servers: ServerInfo[] }>("state/servers.json");
  return NextResponse.json({
    servers: data?.servers || FALLBACK,
    timestamp: new Date().toISOString(),
  });
}
