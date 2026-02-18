"use client";

import { Suspense } from "react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TabBar, useActiveTab } from "@/components/ui/TabBar";
import { GlassCard } from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApi } from "@/hooks/use-api";
import { REFRESH_INTERVAL } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  Server, AlertTriangle, CheckCircle2, XCircle, Clock,
  Zap, Target, TrendingUp, Users, Code2, MessageSquare,
  Settings, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState } from "react";

const TABS = [
  { id: "operations", label: "Operations" },
  { id: "tasks", label: "Tasks" },
  { id: "calendar", label: "Calendar" },
];

const CATEGORY_ICONS: Record<string, typeof Zap> = {
  Revenue: TrendingUp,
  Product: Target,
  Community: Users,
  Content: MessageSquare,
  Ops: Settings,
};

const CATEGORY_COLORS: Record<string, string> = {
  Revenue: "text-accent-green",
  Product: "text-primary-400",
  Community: "text-accent-cyan",
  Content: "text-accent-yellow",
  Ops: "text-zinc-400",
};

function OpsContent() {
  const activeTab = useActiveTab(TABS, "operations");

  return (
    <PageWrapper title="Operations" subtitle="System operations, tasks & calendar">
      <TabBar tabs={TABS} defaultTab="operations" layoutId="ops-tab" />
      {activeTab === "operations" && <OperationsTab />}
      {activeTab === "tasks" && <TasksTab />}
      {activeTab === "calendar" && <CalendarTab />}
    </PageWrapper>
  );
}

function OperationsTab() {
  const { data: systemData } = useApi<{
    servers: Array<{ name: string; status: string; uptime?: string; cpu?: number; memory?: number }>;
  }>("/api/system-state", { refreshInterval: REFRESH_INTERVAL });

  const { data: obsData } = useApi<{
    observations: Array<{ id: string; message: string; type: string; timestamp: string; source: string }>;
  }>("/api/observations", { refreshInterval: REFRESH_INTERVAL });

  const { data: priorityData } = useApi<{
    priorities: Array<{ id: string; title: string; category: string; urgency: string; dueDate?: string }>;
  }>("/api/priorities", { refreshInterval: REFRESH_INTERVAL });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      {/* Server Health */}
      <GlassCard index={0}>
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Server className="w-4 h-4 text-zinc-500" /> Server Health
        </h3>
        <div className="space-y-3">
          {systemData?.servers?.map((server) => (
            <div key={server.name} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <StatusBadge status={server.status} />
                <span className="text-xs text-zinc-200">{server.name}</span>
              </div>
              <span className="text-[10px] text-zinc-500">{server.uptime}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Priorities */}
      <GlassCard index={1}>
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-zinc-500" /> Priorities
        </h3>
        <div className="space-y-2">
          {priorityData?.priorities?.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 p-2 rounded-lg bg-white/[0.02]"
            >
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase ${
                p.urgency === "critical" ? "bg-accent-red/10 text-accent-red" :
                p.urgency === "high" ? "bg-accent-yellow/10 text-accent-yellow" :
                p.urgency === "medium" ? "bg-accent-blue/10 text-accent-blue" :
                "bg-white/[0.04] text-zinc-500"
              }`}>
                {p.urgency}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs text-zinc-200 truncate block">{p.title}</span>
                <span className="text-[10px] text-zinc-500">{p.category}</span>
              </div>
              {p.dueDate && <span className="text-[10px] text-zinc-500 shrink-0">{p.dueDate}</span>}
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* Observations Feed */}
      <GlassCard index={2} className="lg:col-span-2">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-zinc-500" /> Observations Feed
        </h3>
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {obsData?.observations?.map((obs, i) => (
            <motion.div
              key={obs.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02]"
            >
              {obs.type === "success" && <CheckCircle2 className="w-3.5 h-3.5 text-accent-green mt-0.5 shrink-0" />}
              {obs.type === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-accent-yellow mt-0.5 shrink-0" />}
              {obs.type === "error" && <XCircle className="w-3.5 h-3.5 text-accent-red mt-0.5 shrink-0" />}
              {obs.type === "info" && <Clock className="w-3.5 h-3.5 text-accent-blue mt-0.5 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-300">{obs.message}</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">{obs.source} · {formatRelativeTime(obs.timestamp)}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

function TasksTab() {
  const { data, loading } = useApi<{
    tasks: Array<{
      id: string; title: string; description: string; category: string;
      priority: string; status: string; estimatedTime?: string;
    }>;
  }>("/api/suggested-tasks");

  const [actionState, setActionState] = useState<Record<string, string>>({});

  if (loading) return <GridSkeleton count={6} />;

  const tasks = data?.tasks || [];
  const categories = [...new Set(tasks.map((t) => t.category))];

  const handleAction = async (taskId: string, action: string) => {
    setActionState((prev) => ({ ...prev, [taskId]: action }));
    await fetch("/api/suggested-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, action }),
    });
  };

  return (
    <div className="space-y-4">
      {/* Category Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
        {categories.map((cat, i) => {
          const Icon = CATEGORY_ICONS[cat] || Zap;
          const color = CATEGORY_COLORS[cat] || "text-zinc-400";
          const count = tasks.filter((t) => t.category === cat).length;
          return (
            <GlassCard key={cat} index={i} padding="sm" className="text-center">
              <Icon className={`w-5 h-5 ${color} mx-auto mb-1.5`} />
              <p className="text-[11px] font-medium text-zinc-300">{cat}</p>
              <p className="text-[10px] text-zinc-500">{count} tasks</p>
            </GlassCard>
          );
        })}
      </div>

      {/* Task Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {tasks.map((task, i) => {
          const resolved = actionState[task.id];
          return (
            <GlassCard key={task.id} index={i} className={resolved ? "opacity-60" : ""}>
              <div className="flex items-start justify-between mb-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase ${
                  task.priority === "high" ? "bg-accent-red/10 text-accent-red" :
                  task.priority === "medium" ? "bg-accent-yellow/10 text-accent-yellow" :
                  "bg-white/[0.04] text-zinc-500"
                }`}>
                  {task.priority}
                </span>
                <span className="text-[10px] text-zinc-600">{task.estimatedTime}</span>
              </div>
              <h4 className="text-xs font-medium text-zinc-200 mb-1">{task.title}</h4>
              <p className="text-[11px] text-zinc-500 mb-3 line-clamp-2">{task.description}</p>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] ${CATEGORY_COLORS[task.category] || "text-zinc-500"}`}>{task.category}</span>
                {resolved ? (
                  <span className={`text-[10px] ${resolved === "approved" ? "text-accent-green" : "text-accent-red"}`}>
                    {resolved}
                  </span>
                ) : (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleAction(task.id, "approved")}
                      className="text-[10px] px-2 py-1 rounded-md bg-accent-green/10 text-accent-green hover:bg-accent-green/20 transition-colors"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(task.id, "rejected")}
                      className="text-[10px] px-2 py-1 rounded-md bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-colors"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

function CalendarTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8am-7pm

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-zinc-400" />
          </button>
          <span className="text-sm text-zinc-300 font-medium">
            {startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} -{" "}
            {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          </button>
        </div>
        <button
          onClick={() => setWeekOffset(0)}
          className="text-[10px] px-2 py-1 rounded-md bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          Today
        </button>
      </div>

      <div className="glass-card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-white/[0.06]">
          <div className="p-2 text-[10px] text-zinc-600" />
          {days.map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div
                key={i}
                className={`p-2 text-center border-l border-white/[0.04] ${isToday ? "bg-primary/[0.06]" : ""}`}
              >
                <p className="text-[10px] text-zinc-500">{dayNames[i]}</p>
                <p className={`text-sm font-medium ${isToday ? "text-primary-400" : "text-zinc-300"}`}>
                  {d.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="max-h-[400px] overflow-y-auto">
          {hours.map((hour) => (
            <div key={hour} className="grid grid-cols-8 border-b border-white/[0.03] min-h-[40px]">
              <div className="p-1.5 text-[10px] text-zinc-600 text-right pr-2">
                {hour}:00
              </div>
              {days.map((_, i) => (
                <div
                  key={i}
                  className="border-l border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-zinc-600 mt-2 text-center">
        Connect Convex to enable calendar events. Click any cell to create an event.
      </p>
    </div>
  );
}

export default function OpsPage() {
  return (
    <Suspense fallback={<PageWrapper title="Operations"><GridSkeleton /></PageWrapper>}>
      <OpsContent />
    </Suspense>
  );
}
