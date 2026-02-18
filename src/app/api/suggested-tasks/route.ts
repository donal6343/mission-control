import { NextResponse } from "next/server";
import { readWorkspaceJson } from "@/lib/workspace";

interface SuggestedTask {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "approved" | "rejected";
  estimatedTime?: string;
}

const FALLBACK: SuggestedTask[] = [
  { id: "st1", title: "Set up revenue tracking dashboard", description: "Integrate Stripe/payment APIs and build real-time revenue widgets", category: "Revenue", priority: "high", status: "pending", estimatedTime: "2h" },
  { id: "st2", title: "Create weekly content calendar", description: "Plan 5 pieces of content for next week across platforms", category: "Content", priority: "medium", status: "pending", estimatedTime: "1h" },
  { id: "st3", title: "Audit agent capabilities", description: "Document all agent skills and identify gaps", category: "Product", priority: "medium", status: "pending", estimatedTime: "45m" },
  { id: "st4", title: "Discord community engagement", description: "Respond to pending messages and create engagement plan", category: "Community", priority: "high", status: "pending", estimatedTime: "30m" },
  { id: "st5", title: "Optimize cron job schedules", description: "Review all cron timings and reduce unnecessary checks", category: "Ops", priority: "low", status: "pending", estimatedTime: "1h" },
  { id: "st6", title: "Trueshot beta testing plan", description: "Create testing protocol and recruit beta testers", category: "Product", priority: "high", status: "pending", estimatedTime: "3h" },
];

export async function GET() {
  const data = await readWorkspaceJson<{ tasks: SuggestedTask[] }>("state/suggested-tasks.json");
  return NextResponse.json({ tasks: data?.tasks || FALLBACK });
}

export async function POST(req: Request) {
  const body = await req.json();
  // In production, this would write to the workspace or Convex
  return NextResponse.json({ success: true, action: body.action, taskId: body.taskId });
}
