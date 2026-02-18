import { NextResponse } from "next/server";
import { readWorkspaceJson, readWorkspaceFile } from "@/lib/workspace";

interface Agent {
  id: string;
  name: string;
  status: string;
  model: string;
  capabilities: string[];
  lastActive?: string;
  sessionsToday?: number;
  soul?: string;
  rules?: string;
}

const FALLBACK: Agent[] = [
  {
    id: "main",
    name: "Truey",
    status: "online",
    model: "claude-opus-4-6",
    capabilities: ["chat", "code", "browsing", "file-ops", "cron", "tts"],
    lastActive: new Date().toISOString(),
    sessionsToday: 12,
  },
];

export async function GET() {
  const registry = await readWorkspaceJson<{ agents: Agent[] }>("agents/registry.json");
  const agents = registry?.agents || FALLBACK;

  // Try to enrich with SOUL.md / RULES.md
  const enriched = await Promise.all(
    agents.map(async (agent) => {
      const soul = await readWorkspaceFile(`agents/${agent.id}/SOUL.md`);
      const rules = await readWorkspaceFile(`agents/${agent.id}/RULES.md`);
      return { ...agent, soul: soul || undefined, rules: rules || undefined };
    })
  );

  return NextResponse.json({ agents: enriched, timestamp: new Date().toISOString() });
}
