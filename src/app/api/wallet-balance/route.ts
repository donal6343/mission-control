import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

const WALLET_STATUS_PATH = "/home/ubuntu/clawd/polymarket-15m/wallet-status.json";
const WALLET_PATH = path.join(process.env.HOME || "", ".config/polymarket/wallet.json");
const POLYGON_RPC = "https://polygon.drpc.org";
const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";

async function fetchLiveBalance(address: string) {
  const [maticRes, usdcRes] = await Promise.all([
    fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    }),
    fetch(POLYGON_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "eth_call",
        params: [{ to: USDC_CONTRACT, data: "0x70a08231" + address.slice(2).padStart(64, "0") }, "latest"],
      }),
    }),
  ]);
  const maticData = await maticRes.json();
  const usdcData = await usdcRes.json();
  return {
    matic: parseInt(maticData.result || "0", 16) / 1e18,
    usdc: parseInt(usdcData.result || "0", 16) / 1e6,
  };
}

export async function GET() {
  try {
    // Try cached wallet-status.json first (updated every 5 min by monitor)
    try {
      const status = JSON.parse(await readFile(WALLET_STATUS_PATH, "utf-8"));
      return NextResponse.json({
        address: status.address,
        usdc: status.usdc,
        matic: status.pol,
        lastChecked: status.timestamp,
      });
    } catch {}

    // Fallback: live RPC query
    let address = null;
    try {
      const walletData = JSON.parse(await readFile(WALLET_PATH, "utf-8"));
      address = walletData.address;
    } catch {
      return NextResponse.json({ error: "No wallet configured" }, { status: 404 });
    }

    const balance = await fetchLiveBalance(address);
    return NextResponse.json({ address, ...balance, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
