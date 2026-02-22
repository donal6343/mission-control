import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";

const CONFIG_PATH = "/home/ubuntu/clawd/polymarket-15m/trading-config.json";

async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, "utf-8"));
  } catch {
    return { paths: {}, params: {}, stakeTiers: [], excludedAssets: [], killSwitch: false };
  }
}

export async function GET() {
  const config = await loadConfig();
  return NextResponse.json(config);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const config = await loadConfig();

    // Toggle path
    if (body.action === "togglePath" && body.pathName) {
      if (!config.paths[body.pathName]) config.paths[body.pathName] = { enabled: true, label: body.pathName };
      config.paths[body.pathName].enabled = body.enabled;
    }

    // Update stake tier
    if (body.action === "updateStakeTier" && body.index !== undefined && body.stake !== undefined) {
      if (config.stakeTiers && config.stakeTiers[body.index]) {
        config.stakeTiers[body.index].stake = body.stake;
      }
    }

    // Update parameter
    if (body.action === "updateParam" && body.key && body.value !== undefined) {
      if (!config.params) config.params = {};
      config.params[body.key] = body.value;
    }

    // Kill switch
    if (body.action === "killSwitch") {
      config.killSwitch = body.enabled;
    }

    // Toggle asset exclusion
    if (body.action === "toggleAsset" && body.asset) {
      if (!config.excludedAssets) config.excludedAssets = [];
      if (body.excluded) {
        if (!config.excludedAssets.includes(body.asset)) config.excludedAssets.push(body.asset);
      } else {
        config.excludedAssets = config.excludedAssets.filter((a: string) => a !== body.asset);
      }
    }

    // Legacy toggle support
    if (body.pathName && body.enabled !== undefined && !body.action) {
      if (!config.paths[body.pathName]) config.paths[body.pathName] = { enabled: true, label: body.pathName };
      config.paths[body.pathName].enabled = body.enabled;
    }

    config.updatedAt = new Date().toISOString();
    config.updatedBy = "dashboard";

    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
