"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApi } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/utils";
import { REFRESH_INTERVAL } from "@/lib/constants";
import { GitBranch, GitCommit, Code2, FolderGit } from "lucide-react";

interface Repo {
  name: string; path: string; branch: string;
  lastCommit: string; lastCommitMessage: string; status: string;
}

export default function CodePage() {
  const { data, loading } = useApi<{ repos: Repo[] }>("/api/repos", { refreshInterval: REFRESH_INTERVAL });

  if (loading) {
    return (
      <PageWrapper title="Code" subtitle="Repository overview">
        <GridSkeleton count={6} />
      </PageWrapper>
    );
  }

  const repos = data?.repos || [];

  return (
    <PageWrapper title="Code" subtitle="Repository overview">
      {repos.length === 0 ? (
        <EmptyState
          icon={FolderGit}
          title="No repositories found"
          description="Git repositories in ~/Desktop/Projects/ and ~/clawd/ will appear here"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {repos.map((repo, i) => (
            <GlassCard key={repo.name} index={i} className="group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/[0.04] flex items-center justify-center">
                    <Code2 className="w-4 h-4 text-zinc-400 group-hover:text-primary-400 transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-xs font-medium text-zinc-200">{repo.name}</h3>
                    <p className="text-[10px] text-zinc-600 truncate max-w-[150px]">{repo.path}</p>
                  </div>
                </div>
                <StatusBadge status={repo.status === "clean" ? "online" : "warning"} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px]">
                  <GitBranch className="w-3 h-3 text-zinc-500" />
                  <span className="text-zinc-300 font-mono">{repo.branch}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md ${
                    repo.status === "clean" ? "bg-accent-green/10 text-accent-green" : "bg-accent-yellow/10 text-accent-yellow"
                  }`}>
                    {repo.status}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-[11px]">
                  <GitCommit className="w-3 h-3 text-zinc-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-zinc-400 truncate">{repo.lastCommitMessage}</p>
                    <p className="text-zinc-600 text-[10px]">{formatRelativeTime(repo.lastCommit)}</p>
                  </div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
