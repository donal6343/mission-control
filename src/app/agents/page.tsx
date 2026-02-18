"use client";

import { Suspense, useState } from "react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TabBar, useActiveTab } from "@/components/ui/TabBar";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { useApi } from "@/hooks/use-api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Brain, Cpu, ChevronDown, ChevronUp,
  FileText, Shield, Zap, DollarSign, ArrowRight,
} from "lucide-react";

const TABS = [
  { id: "agents", label: "Agents" },
  { id: "models", label: "Models" },
];

interface Agent {
  id: string; name: string; status: string; model: string;
  capabilities: string[]; lastActive?: string; sessionsToday?: number;
  soul?: string; rules?: string;
}

const MODELS = [
  { id: "opus", name: "Claude Opus 4", provider: "Anthropic", cost: "$15/$75", routing: "Primary", failover: "Sonnet 4", status: "active", tasks: "Complex reasoning, coding, analysis" },
  { id: "sonnet", name: "Claude Sonnet 4", provider: "Anthropic", cost: "$3/$15", routing: "Secondary", failover: "Haiku 3.5", status: "active", tasks: "General chat, summaries" },
  { id: "haiku", name: "Claude Haiku 3.5", provider: "Anthropic", cost: "$0.25/$1.25", routing: "Fast tasks", failover: "GPT-4o-mini", status: "active", tasks: "Quick responses, classification" },
  { id: "gpt4o", name: "GPT-4o", provider: "OpenAI", cost: "$2.50/$10", routing: "Fallback", failover: "Sonnet 4", status: "standby", tasks: "Backup, specific APIs" },
  { id: "gpt4omini", name: "GPT-4o-mini", provider: "OpenAI", cost: "$0.15/$0.60", routing: "Budget", failover: "Haiku 3.5", status: "standby", tasks: "Low-cost operations" },
];

function AgentsContent() {
  const activeTab = useActiveTab(TABS, "agents");

  return (
    <PageWrapper title="Agents" subtitle="Agent registry & model inventory">
      <TabBar tabs={TABS} defaultTab="agents" layoutId="agents-tab" />
      {activeTab === "agents" && <AgentsTab />}
      {activeTab === "models" && <ModelsTab />}
    </PageWrapper>
  );
}

function AgentsTab() {
  const { data, loading } = useApi<{ agents: Agent[] }>("/api/agents");
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <GridSkeleton count={3} />;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {data?.agents?.map((agent, i) => (
        <GlassCard key={agent.id} index={i} hover={false} className="cursor-pointer" onClick={() => setExpanded(expanded === agent.id ? null : agent.id)}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-zinc-200">{agent.name}</h3>
                <p className="text-[10px] text-zinc-500">{agent.id}</p>
              </div>
            </div>
            <StatusBadge status={agent.status} />
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-3 h-3 text-zinc-500" />
            <span className="text-[11px] text-zinc-400">{agent.model}</span>
          </div>

          <div className="flex flex-wrap gap-1 mb-3">
            {agent.capabilities?.map((cap) => (
              <span key={cap} className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-500">
                {cap}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>{agent.sessionsToday || 0} sessions today</span>
            {expanded === agent.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </div>

          <AnimatePresence>
            {expanded === agent.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-3">
                  {agent.soul && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1">
                        <FileText className="w-3 h-3" /> SOUL.md
                      </h4>
                      <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap max-h-[150px] overflow-y-auto p-2 rounded-lg bg-black/30">
                        {agent.soul.slice(0, 500)}{agent.soul.length > 500 ? "..." : ""}
                      </pre>
                    </div>
                  )}
                  {agent.rules && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1">
                        <Shield className="w-3 h-3" /> RULES.md
                      </h4>
                      <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap max-h-[150px] overflow-y-auto p-2 rounded-lg bg-black/30">
                        {agent.rules.slice(0, 500)}{agent.rules.length > 500 ? "..." : ""}
                      </pre>
                    </div>
                  )}
                  {!agent.soul && !agent.rules && (
                    <p className="text-[10px] text-zinc-600 italic">No SOUL.md or RULES.md found for this agent.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      ))}
    </div>
  );
}

function ModelsTab() {
  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Model", "Provider", "Cost (in/out per 1M)", "Routing", "Failover", "Status", "Tasks"].map((h) => (
                <th key={h} className="text-left text-[10px] uppercase tracking-wider text-zinc-500 p-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODELS.map((model, i) => (
              <motion.tr
                key={model.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
              >
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-primary-400" />
                    <span className="text-xs font-medium text-zinc-200">{model.name}</span>
                  </div>
                </td>
                <td className="p-3 text-xs text-zinc-400">{model.provider}</td>
                <td className="p-3">
                  <span className="text-xs text-zinc-300 font-mono flex items-center gap-1">
                    <DollarSign className="w-3 h-3 text-zinc-500" />{model.cost}
                  </span>
                </td>
                <td className="p-3 text-xs text-zinc-400">{model.routing}</td>
                <td className="p-3">
                  <span className="text-xs text-zinc-400 flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 text-zinc-600" />{model.failover}
                  </span>
                </td>
                <td className="p-3"><StatusBadge status={model.status} /></td>
                <td className="p-3 text-[11px] text-zinc-500 max-w-[200px] truncate">{model.tasks}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<PageWrapper title="Agents"><GridSkeleton /></PageWrapper>}>
      <AgentsContent />
    </Suspense>
  );
}
