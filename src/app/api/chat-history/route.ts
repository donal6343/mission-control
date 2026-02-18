import { NextResponse } from "next/server";

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  channel: string;
}

const SESSIONS: ChatSession[] = [
  { id: "s1", title: "Dashboard Planning", lastMessage: "Let's build the mission control...", timestamp: new Date().toISOString(), messageCount: 24, channel: "telegram" },
  { id: "s2", title: "Trueshot Strategy", lastMessage: "We should focus on beta launch...", timestamp: new Date(Date.now() - 3600000).toISOString(), messageCount: 18, channel: "telegram" },
  { id: "s3", title: "Content Review", lastMessage: "The Twitter thread looks good...", timestamp: new Date(Date.now() - 86400000).toISOString(), messageCount: 8, channel: "discord" },
];

export async function GET() {
  return NextResponse.json({ sessions: SESSIONS });
}
