import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(" ");
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

export function statusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "online": case "healthy": case "active": case "running": return "text-accent-green";
    case "offline": case "error": case "failed": return "text-accent-red";
    case "warning": case "degraded": case "pending": return "text-accent-yellow";
    default: return "text-zinc-400";
  }
}

export function statusDot(status: string): string {
  switch (status?.toLowerCase()) {
    case "online": case "healthy": case "active": case "running": return "status-dot-online";
    case "offline": case "error": case "failed": return "status-dot-offline";
    default: return "status-dot-warning";
  }
}
