import { NextResponse } from "next/server";

interface Product {
  slug: string;
  name: string;
  description: string;
  status: string;
  tech: string[];
  links: { label: string; url: string }[];
  metrics?: Record<string, string | number>;
}

const PRODUCTS: Record<string, Product> = {
  trueshot: {
    slug: "trueshot",
    name: "Trueshot",
    description: "Photo authenticity platform. Take verifiably real photos with blockchain proof on Base.",
    status: "beta",
    tech: ["React Native", "Base", "NFT", "AI Detection"],
    links: [
      { label: "Website", url: "https://trueshot.io" },
      { label: "App Store", url: "#" },
    ],
    metrics: { users: 0, photos: 0, chains: "Base" },
  },
  openclaw: {
    slug: "openclaw",
    name: "OpenClaw",
    description: "AI agent infrastructure platform. Build, deploy, and manage AI agents.",
    status: "active",
    tech: ["Node.js", "TypeScript", "Claude", "Telegram"],
    links: [{ label: "GitHub", url: "#" }],
    metrics: { agents: 1, sessions: "100+", uptime: "99.9%" },
  },
  "mission-control": {
    slug: "mission-control",
    name: "Mission Control",
    description: "Real-time dashboard for monitoring and managing the OpenClaw AI agent ecosystem.",
    status: "development",
    tech: ["Next.js", "Convex", "Tailwind", "Framer Motion"],
    links: [],
    metrics: { pages: 8, apiRoutes: 14 },
  },
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const product = PRODUCTS[slug];
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}
