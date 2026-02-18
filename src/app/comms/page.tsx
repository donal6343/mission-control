"use client";

import { Suspense } from "react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TabBar, useActiveTab } from "@/components/ui/TabBar";
import { GlassCard } from "@/components/ui/GlassCard";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApi } from "@/hooks/use-api";
import { motion } from "framer-motion";
import {
  MessageSquare, Mail, Bell, Hash,
  Users, ArrowRight,
} from "lucide-react";

const TABS = [
  { id: "comms", label: "Comms" },
  { id: "crm", label: "CRM" },
];

interface Client {
  id: string; name: string; company?: string;
  stage: "prospect" | "lead" | "negotiation" | "active" | "churned";
  value?: number; lastContact?: string;
}

const MOCK_NOTIFICATIONS = [
  { id: "n1", type: "discord", channel: "#general", message: "New member joined the server", time: "5m ago", icon: Hash },
  { id: "n2", type: "telegram", channel: "Donal", message: "Hey, can you check on the Trueshot build?", time: "12m ago", icon: MessageSquare },
  { id: "n3", type: "email", channel: "inbox", message: "Meeting confirmation for Friday", time: "1h ago", icon: Mail },
  { id: "n4", type: "discord", channel: "#dev", message: "PR #42 merged successfully", time: "2h ago", icon: Hash },
  { id: "n5", type: "notification", channel: "system", message: "Weekly report generated", time: "3h ago", icon: Bell },
];

function CommsContent() {
  const activeTab = useActiveTab(TABS, "comms");

  return (
    <PageWrapper title="Communications" subtitle="Messages, notifications & CRM">
      <TabBar tabs={TABS} defaultTab="comms" layoutId="comms-tab" />
      {activeTab === "comms" && <CommsTab />}
      {activeTab === "crm" && <CRMTab />}
    </PageWrapper>
  );
}

function CommsTab() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
      {/* Notifications Feed */}
      <GlassCard index={0} className="lg:col-span-2">
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Bell className="w-4 h-4 text-zinc-500" /> Recent Notifications
        </h3>
        <div className="space-y-2">
          {MOCK_NOTIFICATIONS.map((notif, i) => {
            const Icon = notif.icon;
            return (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-colors cursor-pointer"
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  notif.type === "discord" ? "bg-[#5865F2]/10" :
                  notif.type === "telegram" ? "bg-[#0088cc]/10" :
                  notif.type === "email" ? "bg-accent-yellow/10" :
                  "bg-white/[0.04]"
                }`}>
                  <Icon className={`w-3.5 h-3.5 ${
                    notif.type === "discord" ? "text-[#5865F2]" :
                    notif.type === "telegram" ? "text-[#0088cc]" :
                    notif.type === "email" ? "text-accent-yellow" :
                    "text-zinc-400"
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-medium text-zinc-400 uppercase">{notif.type}</span>
                    <span className="text-[10px] text-zinc-600">{notif.channel}</span>
                  </div>
                  <p className="text-xs text-zinc-300 truncate">{notif.message}</p>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{notif.time}</span>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>

      {/* Discord Digest */}
      <GlassCard index={1}>
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <Hash className="w-4 h-4 text-[#5865F2]" /> Discord Digest
        </h3>
        <EmptyState
          icon={Hash}
          title="No Discord data"
          description="Connect Discord integration to see server digest"
        />
      </GlassCard>

      {/* Telegram */}
      <GlassCard index={2}>
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#0088cc]" /> Telegram
        </h3>
        <EmptyState
          icon={MessageSquare}
          title="Connected via OpenClaw"
          description="Messages are handled through the agent runtime"
        />
      </GlassCard>
    </div>
  );
}

function CRMTab() {
  const { data, loading } = useApi<{ clients: Client[] }>("/api/clients");

  if (loading) return <div className="animate-pulse h-64 bg-white/[0.02] rounded-[16px]" />;

  const clients = data?.clients || [];
  const stages = [
    { id: "prospect", title: "Prospect", color: "#71717a" },
    { id: "lead", title: "Lead", color: "#eab308" },
    { id: "negotiation", title: "Negotiation", color: "#3b82f6" },
    { id: "active", title: "Active", color: "#22c55e" },
  ];

  const columns = stages.map((stage) => ({
    ...stage,
    items: clients
      .filter((c) => c.stage === stage.id)
      .map((c) => ({
        id: c.id,
        title: c.name,
        subtitle: c.company ? `${c.company}${c.value ? ` · $${c.value.toLocaleString()}` : ""}` : undefined,
        tags: [],
      })),
  }));

  return <KanbanBoard columns={columns} />;
}

export default function CommsPage() {
  return (
    <Suspense fallback={<PageWrapper title="Comms"><div /></PageWrapper>}>
      <CommsContent />
    </Suspense>
  );
}
