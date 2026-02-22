import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return inputs.filter(Boolean).join(" ");
}

export function formatRelativeTime(date: Date | string, showTime = false): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  const relative = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : hrs < 24 ? `${hrs}h ago` : `${days}d ago`;
  return showTime ? `${relative} (${time})` : relative;
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
