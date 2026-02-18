import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  status: "healthy" | "error" | "disabled";
  lastRun?: string;
  nextRun?: string;
  duration?: string;
  lastStatus?: string;
  lastError?: string;
  enabled: boolean;
  payload?: string;
}

function formatSchedule(schedule: { kind: string; expr?: string; everyMs?: number; at?: string; tz?: string }): string {
  if (schedule.kind === "cron") {
    const tz = schedule.tz ? ` (${schedule.tz})` : "";
    return `${schedule.expr}${tz}`;
  } else if (schedule.kind === "every") {
    const mins = Math.round((schedule.everyMs || 0) / 60000);
    return `every ${mins}m`;
  } else if (schedule.kind === "at") {
    return `once: ${schedule.at}`;
  }
  return "unknown";
}

function formatDuration(ms?: number): string | undefined {
  if (!ms) return undefined;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || "/home/ubuntu/.openclaw/workspace";

export async function GET() {
  try {
    // Read cron jobs from state file (updated by OpenClaw)
    const cronsPath = join(WORKSPACE_PATH, "state/crons.json");
    const data = JSON.parse(await readFile(cronsPath, "utf-8"));
    
    const crons: CronJob[] = (data.jobs || [])
      .map((job: any) => {
        const lastStatus = job.state?.lastStatus;
        const hasError = lastStatus === "error" || job.state?.lastError;
        const isEnabled = job.enabled !== false;
        
        let status: CronJob["status"] = "healthy";
        if (!isEnabled) status = "disabled";
        else if (hasError) status = "error";
        
        return {
          id: job.id,
          name: job.name || job.id,
          schedule: formatSchedule(job.schedule),
          status,
          lastRun: job.state?.lastRunAtMs ? new Date(job.state.lastRunAtMs).toISOString() : undefined,
          nextRun: job.state?.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : undefined,
          duration: formatDuration(job.state?.lastDurationMs),
          lastStatus: job.state?.lastStatus,
          lastError: job.state?.lastError,
          enabled: isEnabled,
          payload: job.payload,
        };
      })
      // Sort: enabled first, then by name
      .sort((a: CronJob, b: CronJob) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

    // Stats
    const enabled = crons.filter(c => c.enabled).length;
    const healthy = crons.filter(c => c.status === "healthy").length;
    const errors = crons.filter(c => c.status === "error").length;
    const disabled = crons.filter(c => c.status === "disabled").length;

    return NextResponse.json({
      crons,
      stats: { total: crons.length, enabled, healthy, errors, disabled },
      updatedAt: data.updatedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to fetch cron jobs:", error);
    return NextResponse.json({
      crons: [],
      stats: { total: 0, enabled: 0, healthy: 0, errors: 0, disabled: 0 },
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
}
