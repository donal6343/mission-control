import { NextResponse } from "next/server";
import { readWorkspaceJson, readWorkspaceFile } from "@/lib/workspace";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const registry = await readWorkspaceJson<{ agents: Array<{ id: string; name: string; status: string; model: string; capabilities: string[] }> }>("agents/registry.json");
  const agent = registry?.agents?.find((a) => a.id === id);

  const soul = await readWorkspaceFile(`agents/${id}/SOUL.md`);
  const rules = await readWorkspaceFile(`agents/${id}/RULES.md`);

  if (!agent) {
    return NextResponse.json(
      { error: "Agent not found", id, soul, rules },
      { status: 404 }
    );
  }

  return NextResponse.json({ ...agent, soul, rules });
}
