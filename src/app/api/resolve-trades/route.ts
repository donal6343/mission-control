import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST() {
  try {
    const output = execSync(
      "cd /home/ubuntu/clawd/polymarket-15m && node check-results.js 2>&1",
      { timeout: 30000, encoding: "utf-8" }
    );
    
    // Parse results from output
    const resolved = (output.match(/✅|Updated/g) || []).length;
    const pending = (output.match(/pending|⏳/gi) || []).length;
    
    return NextResponse.json({ 
      ok: true, 
      message: `Resolved trades checked`,
      output: output.slice(-500),
      resolved,
      pending
    });
  } catch (error: any) {
    return NextResponse.json({ 
      ok: false, 
      error: error.message,
      output: error.stdout?.slice(-500) || error.stderr?.slice(-500) || ""
    }, { status: 500 });
  }
}
