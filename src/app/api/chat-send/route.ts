import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  // Placeholder - would forward to agent
  return NextResponse.json({
    success: true,
    message: {
      id: Date.now().toString(),
      role: "assistant",
      content: "Message received. Agent processing is not connected yet.",
      timestamp: new Date().toISOString(),
    },
  });
}
