import { NextRequest, NextResponse } from "next/server";

const CLOB_BASE = "https://clob.polymarket.com";
const PROXY_SECRET = process.env.CLOB_PROXY_SECRET || "";

// Headers to forward to Polymarket
const FORWARD_HEADERS = [
  "content-type",
  "poly-address",
  "poly-signature", 
  "poly-timestamp",
  "poly-nonce",
  "poly-api-key",
  "poly-passphrase",
];

async function proxyRequest(req: NextRequest) {
  // Auth check
  const secret = req.headers.get("x-proxy-secret");
  if (PROXY_SECRET && secret !== PROXY_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build target URL
  const url = new URL(req.url);
  const targetPath = url.pathname.replace("/api/clob-proxy", "");
  const targetUrl = `${CLOB_BASE}${targetPath}${url.search}`;

  // Forward relevant headers
  const headers: Record<string, string> = {};
  for (const key of FORWARD_HEADERS) {
    const val = req.headers.get(key);
    if (val) headers[key] = val;
  }

  try {
    const body = req.method !== "GET" && req.method !== "HEAD" 
      ? await req.text() 
      : undefined;

    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const data = await resp.text();
    return new NextResponse(data, {
      status: resp.status,
      headers: { "content-type": resp.headers.get("content-type") || "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Proxy error", message: e.message }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const DELETE = proxyRequest;
