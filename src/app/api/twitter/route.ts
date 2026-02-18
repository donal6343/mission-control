import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

interface TweetLogEntry {
  timestamp: string;
  tokenId?: string;
  name?: string;
  username?: string | null;
  tweetId?: string;
  text?: string;
  success: boolean;
  farcaster?: boolean;
  error?: string;
}

interface RepliedTweet {
  id: string;
  repliedAt: string;
}

interface Tweet {
  id: string;
  type: "gm" | "reply" | "engagement";
  text: string;
  timestamp: string;
  url?: string;
  tokenId?: string;
  tokenName?: string;
  success: boolean;
  farcaster?: boolean;
}

const TRUESHOT_PATH = process.env.TRUESHOT_PATH || "/home/ubuntu/clawd/trueshot";

export async function GET() {
  try {
    const tweets: Tweet[] = [];

    // Read tweet log (GM posts)
    try {
      const tweetLogPath = join(TRUESHOT_PATH, "tweet-log.json");
      const tweetLogData = await readFile(tweetLogPath, "utf-8");
      const tweetLog: TweetLogEntry[] = JSON.parse(tweetLogData);

      // Get last 10 successful GM posts
      const gmPosts = tweetLog
        .filter((t) => t.success && t.tweetId)
        .slice(-10)
        .reverse()
        .map((t) => ({
          id: t.tweetId!,
          type: "gm" as const,
          text: t.text || "GM post",
          timestamp: t.timestamp,
          url: `https://x.com/trueshotio/status/${t.tweetId}`,
          tokenId: t.tokenId,
          tokenName: t.name,
          success: t.success,
          farcaster: t.farcaster,
        }));

      tweets.push(...gmPosts);
    } catch (e) {
      console.error("Error reading tweet-log.json:", e);
    }

    // Read replied tweets
    try {
      const repliedPath = join(TRUESHOT_PATH, "replied-tweets.json");
      const repliedData = await readFile(repliedPath, "utf-8");
      const replied: RepliedTweet[] = JSON.parse(repliedData);

      // Get last 5 replies
      const replyTweets = replied
        .slice(-5)
        .reverse()
        .map((r) => ({
          id: r.id,
          type: "reply" as const,
          text: "Reply to mention",
          timestamp: r.repliedAt,
          url: `https://x.com/trueshotio/status/${r.id}`,
          success: true,
        }));

      tweets.push(...replyTweets);
    } catch (e) {
      console.error("Error reading replied-tweets.json:", e);
    }

    // Sort all by timestamp
    tweets.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate stats
    const last24h = Date.now() - 24 * 60 * 60 * 1000;
    const last7d = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const stats = {
      tweetsToday: tweets.filter((t) => new Date(t.timestamp).getTime() > last24h).length,
      tweetsThisWeek: tweets.filter((t) => new Date(t.timestamp).getTime() > last7d).length,
      gmPosts: tweets.filter((t) => t.type === "gm").length,
      replies: tweets.filter((t) => t.type === "reply").length,
    };

    return NextResponse.json({
      account: "@Trueshotio",
      accountUrl: "https://x.com/trueshotio",
      tweets: tweets.slice(0, 15),
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching Twitter data:", error);
    return NextResponse.json({
      account: "@Trueshotio",
      accountUrl: "https://x.com/trueshotio",
      tweets: [],
      stats: { tweetsToday: 0, tweetsThisWeek: 0, gmPosts: 0, replies: 0 },
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
