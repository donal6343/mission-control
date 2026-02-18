import { NextResponse } from "next/server";
import { readWorkspaceJson } from "@/lib/workspace";

interface Client {
  id: string;
  name: string;
  company?: string;
  stage: "prospect" | "lead" | "negotiation" | "active" | "churned";
  value?: number;
  lastContact?: string;
  notes?: string;
}

const FALLBACK: Client[] = [
  { id: "c1", name: "Alex Chen", company: "TechCorp", stage: "active", value: 5000, lastContact: new Date(Date.now() - 86400000).toISOString() },
  { id: "c2", name: "Sarah Williams", company: "StartupXYZ", stage: "negotiation", value: 3000, lastContact: new Date(Date.now() - 172800000).toISOString() },
  { id: "c3", name: "James Liu", company: "DataFlow", stage: "prospect", lastContact: new Date(Date.now() - 432000000).toISOString() },
  { id: "c4", name: "Maya Patel", company: "CloudNine", stage: "lead", value: 8000, lastContact: new Date(Date.now() - 259200000).toISOString() },
];

export async function GET() {
  const data = await readWorkspaceJson<{ clients: Client[] }>("state/clients.json");
  return NextResponse.json({ clients: data?.clients || FALLBACK });
}
