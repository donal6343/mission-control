"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/hooks/use-api";
import { REFRESH_INTERVAL } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import {
  Shield, AlertTriangle, CheckCircle2, Info, TrendingUp,
  Activity, Lightbulb, Search, Zap, Clock,
} from "lucide-react";

interface Finding {
  summary: string;
  category: string;
  severity: string;
  recommendation: string;
  evidence: string;
  impact: string;
}

interface AuditData {
  timestamp: string | null;
  healthScore: number | null;
  totalFindings: number;
  tradesAnalyzed?: number;
  overallWinRate?: number;
  overallPnl?: number;
  bySeverity: { critical: number; high: number; medium: number; low: number; info: number };
  byCategory: { performance: number; reliability: number; "new-opportunity": number; risk: number; optimization: number };
  findings: Finding[];
  error?: string;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof AlertTriangle }> = {
  critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20", icon: AlertTriangle },
  high: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20", icon: AlertTriangle },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20", icon: Info },
  low: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20", icon: Info },
  info: { color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20", icon: Info },
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Activity; color: string }> = {
  performance: { label: "Performance", icon: TrendingUp, color: "text-blue-400" },
  reliability: { label: "Reliability", icon: Shield, color: "text-red-400" },
  "new-opportunity": { label: "New Opportunities", icon: Search, color: "text-green-400" },
  risk: { label: "Risk", icon: AlertTriangle, color: "text-orange-400" },
  optimization: { label: "Optimization", icon: Lightbulb, color: "text-purple-400" },
};

function HealthGauge({ score }: { score: number | null }) {
  if (score === null) return <div className="text-zinc-500 text-sm">No data</div>;
  const color = score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : score >= 40 ? "text-orange-400" : "text-red-400";
  const bgColor = score >= 80 ? "bg-green-500/20" : score >= 60 ? "bg-yellow-500/20" : score >= 40 ? "bg-orange-500/20" : "bg-red-500/20";
  return (
    <div className={`flex items-center gap-3 p-4 rounded-xl ${bgColor}`}>
      <div className={`text-4xl font-bold ${color}`}>{score}</div>
      <div className="text-sm text-zinc-400">
        <div className={`font-medium ${color}`}>
          {score >= 80 ? "Healthy" : score >= 60 ? "Fair" : score >= 40 ? "Degraded" : "Critical"}
        </div>
        <div>Health Score</div>
      </div>
    </div>
  );
}

export default function AuditPage() {
  const { data, loading } = useApi<AuditData>("/api/audit", { refreshInterval: REFRESH_INTERVAL });

  if (loading && !data) return <PageWrapper title="Bot Audit"><GridSkeleton /></PageWrapper>;

  const findings = data?.findings || [];
  const categories = Object.keys(CATEGORY_CONFIG);

  return (
    <PageWrapper title="Bot Audit" subtitle={data?.timestamp ? `Last run: ${formatRelativeTime(data.timestamp)}` : "No audit data yet"}>
      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <GlassCard>
          <HealthGauge score={data?.healthScore ?? null} />
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-zinc-500 mb-1">Trades Analyzed</div>
          <div className="text-2xl font-bold text-zinc-200">{data?.tradesAnalyzed || 0}</div>
          <div className="flex gap-2 mt-2 text-xs flex-wrap">
            {data?.overallWinRate != null && <span className="text-green-400">{(data.overallWinRate * 100).toFixed(1)}% WR</span>}
            {data?.overallPnl != null && <span className={data.overallPnl >= 0 ? "text-green-400" : "text-red-400"}>{data.overallPnl >= 0 ? "+" : ""}${data.overallPnl.toFixed(2)}</span>}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-zinc-500 mb-1">Findings</div>
          <div className="text-2xl font-bold text-zinc-200">{data?.totalFindings || 0}</div>
          <div className="flex gap-2 mt-2 text-xs flex-wrap">
            {data?.bySeverity.critical ? <span className="text-red-400">{data.bySeverity.critical} critical</span> : null}
            {data?.bySeverity.high ? <span className="text-orange-400">{data.bySeverity.high} high</span> : null}
            {data?.bySeverity.medium ? <span className="text-yellow-400">{data.bySeverity.medium} medium</span> : null}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-zinc-500 mb-1">Last Audit</div>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span className="text-sm text-zinc-300">{data?.timestamp ? formatRelativeTime(data.timestamp) : "Never"}</span>
          </div>
          {data?.error && <div className="text-xs text-red-400 mt-2">{data.error}</div>}
        </GlassCard>
      </div>

      {/* Findings by Category */}
      {categories.map(cat => {
        const catFindings = findings.filter(f => f.category === cat);
        if (catFindings.length === 0) return null;
        const cfg = CATEGORY_CONFIG[cat];
        const Icon = cfg.icon;
        return (
          <div key={cat} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`w-4 h-4 ${cfg.color}`} />
              <h2 className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</h2>
              <span className="text-xs text-zinc-500">({catFindings.length})</span>
            </div>
            <div className="space-y-2">
              {catFindings.map((f, i) => {
                const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.info;
                const SevIcon = sev.icon;
                return (
                  <GlassCard key={i} className={`p-3 border ${sev.bg}`}>
                    <div className="flex items-start gap-2">
                      <SevIcon className={`w-4 h-4 mt-0.5 shrink-0 ${sev.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-medium uppercase ${sev.color}`}>{f.severity}</span>
                          <span className="text-sm font-medium text-zinc-200">{f.summary}</span>
                        </div>
                        {f.recommendation && (
                          <div className="text-xs text-zinc-400 mt-1 space-y-1">
                            {f.recommendation.split('\n\n').map((line, li) => (
                              <div key={li}><span className="text-zinc-500">{li === 0 ? '💡 ' : '→ '}</span>{line}</div>
                            ))}
                          </div>
                        )}
                        {f.evidence && (
                          <details className="text-xs text-zinc-500 mt-1 group">
                            <summary className="cursor-pointer hover:text-zinc-400"><span className="text-zinc-600">📊 </span>Evidence (click to expand)</summary>
                            <pre className="mt-1 ml-4 whitespace-pre-wrap text-zinc-500 font-mono text-[10px]">{f.evidence}</pre>
                          </details>
                        )}
                        {f.impact && f.impact !== 'N/A' && (
                          <div className="text-xs text-zinc-500 mt-1">
                            <span className="text-zinc-600">🎯 </span>{f.impact}
                          </div>
                        )}
                      </div>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        );
      })}

      {findings.length === 0 && !loading && (
        <GlassCard className="p-8 text-center">
          <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-2" />
          <div className="text-zinc-400">No audit findings yet. Run the auditor to generate findings.</div>
          <div className="text-xs text-zinc-500 mt-1">node ~/clawd/polymarket-15m/bot-auditor.js</div>
        </GlassCard>
      )}
    </PageWrapper>
  );
}
