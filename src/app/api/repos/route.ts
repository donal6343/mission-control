import { NextResponse } from "next/server";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { execSync } from "child_process";

interface Repo {
  name: string;
  path: string;
  branch: string;
  lastCommit: string;
  lastCommitMessage: string;
  status: string;
  language?: string;
}

async function scanRepos(): Promise<Repo[]> {
  const dirs = [
    join(process.env.HOME || "/home/ubuntu", "Desktop/Projects"),
    join(process.env.HOME || "/home/ubuntu", "clawd"),
  ];

  const repos: Repo[] = [];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        try {
          const s = await stat(join(fullPath, ".git"));
          if (s.isDirectory()) {
            const branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: fullPath, encoding: "utf-8" }).trim();
            const lastCommit = execSync("git log -1 --format=%ci", { cwd: fullPath, encoding: "utf-8" }).trim();
            const lastCommitMessage = execSync("git log -1 --format=%s", { cwd: fullPath, encoding: "utf-8" }).trim();
            const statusOutput = execSync("git status --porcelain", { cwd: fullPath, encoding: "utf-8" }).trim();
            repos.push({
              name: entry,
              path: fullPath,
              branch,
              lastCommit,
              lastCommitMessage,
              status: statusOutput ? "dirty" : "clean",
            });
          }
        } catch {
          // Not a git repo
        }
      }
    } catch {
      // Directory doesn't exist
    }
  }

  return repos;
}

export async function GET() {
  const repos = await scanRepos();
  return NextResponse.json({ repos, timestamp: new Date().toISOString() });
}
