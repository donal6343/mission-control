import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const WALLET_ADDRESS = "0x0F1d47f532Cbe918a954D5F56B78659154930b10";
const POLYGON_RPC = "https://polygon.drpc.org";
// Both USDC variants on Polygon
const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_BRIDGED = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const BALANCE_SELECTOR = "0x70a08231";

async function getTokenBalance(tokenAddress: string): Promise<number> {
  const paddedAddress = WALLET_ADDRESS.toLowerCase().replace("0x", "").padStart(64, "0");
  const res = await fetch(POLYGON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "eth_call",
      params: [{ to: tokenAddress, data: BALANCE_SELECTOR + paddedAddress }, "latest"],
    }),
  });
  const data = await res.json();
  return parseInt(data.result || "0", 16) / 1e6;
}

async function getPolBalance(): Promise<number> {
  const res = await fetch(POLYGON_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [WALLET_ADDRESS, "latest"] }),
  });
  const data = await res.json();
  return parseInt(data.result || "0", 16) / 1e18;
}

export async function GET() {
  try {
    // Always fetch live on-chain balance
    const [usdcNative, usdcBridged, pol] = await Promise.all([
      getTokenBalance(USDC_NATIVE),
      getTokenBalance(USDC_BRIDGED),
      getPolBalance(),
    ]);

    const usdc = Math.round((usdcNative + usdcBridged) * 100) / 100;
    const polRounded = Math.round(pol * 10000) / 10000;

    return NextResponse.json({
      address: WALLET_ADDRESS,
      usdc,
      matic: polRounded,
      lastChecked: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
