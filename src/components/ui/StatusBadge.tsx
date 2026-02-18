"use client";

import { statusColor, statusDot } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`status-dot ${statusDot(status)}`} />
      <span className={`text-[11px] font-medium capitalize ${statusColor(status)}`}>
        {status}
      </span>
    </span>
  );
}
