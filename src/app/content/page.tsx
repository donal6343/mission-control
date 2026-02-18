"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/hooks/use-api";
import { REFRESH_INTERVAL } from "@/lib/constants";

interface ContentItem {
  id: string;
  title: string;
  type: string;
  status: "idea" | "drafting" | "review" | "scheduled" | "published";
  platform?: string;
  tags?: string[];
}

const COLUMN_CONFIG = [
  { id: "idea", title: "Ideas", color: "#71717a" },
  { id: "drafting", title: "Drafting", color: "#eab308" },
  { id: "review", title: "Review", color: "#3b82f6" },
  { id: "scheduled", title: "Scheduled", color: "#6366f1" },
  { id: "published", title: "Published", color: "#22c55e" },
];

export default function ContentPage() {
  const { data, loading } = useApi<{ items: ContentItem[] }>("/api/content-pipeline", {
    refreshInterval: REFRESH_INTERVAL,
  });

  if (loading) {
    return (
      <PageWrapper title="Content" subtitle="Content pipeline & drafts">
        <GridSkeleton count={5} />
      </PageWrapper>
    );
  }

  const items = data?.items || [];
  const columns = COLUMN_CONFIG.map((col) => ({
    ...col,
    items: items
      .filter((item) => item.status === col.id)
      .map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.platform ? `${item.type} · ${item.platform}` : item.type,
        tags: item.tags,
      })),
  }));

  return (
    <PageWrapper title="Content" subtitle="Content pipeline & drafts">
      <KanbanBoard columns={columns} />
    </PageWrapper>
  );
}
