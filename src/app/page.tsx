"use client";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { GlassCard } from "@/components/ui/GlassCard";
import { GridSkeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApi } from "@/hooks/use-api";
import { REFRESH_INTERVAL } from "@/lib/constants";
import { formatRelativeTime } from "@/lib/utils";
import {
  Server, Bot, Clock, DollarSign, FileText,
  Activity, AlertTriangle, CheckCircle2, TrendingUp,
  Cpu, MemoryStick, LineChart, MessageSquare, ArrowUpRight, ArrowDownRight,
  Zap, Play, Twitter, ExternalLink, Reply, Image as ImageIcon, ChevronDown, ChevronRight,
  Target, Coins, Camera, ChevronLeft, Calendar, Power, Shield, ShieldOff, ShieldAlert, RefreshCw, Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";

type TabType = "trueshot" | "crypto" | "audit";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>("crypto");
  const [expandedCron, setExpandedCron] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [tradeFilter, setTradeFilter] = useState<'all' | 'paper' | 'real'>('all');
  const [pathFilter, setPathFilter] = useState<Set<string>>(new Set());
  const [assetFilter, setAssetFilter] = useState<Set<string>>(new Set());
  const [confFilter, setConfFilter] = useState<string>('all');
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState<string | null>(null);
  
  const { data: systemData, loading: sysLoading } = useApi<{
    servers: Array<{ name: string; status: string; uptime?: string; cpu?: number; memory?: number }>;
  }>("/api/system-state", { refreshInterval: REFRESH_INTERVAL });

  const { data: agentData, loading: agentLoading } = useApi<{
    agents: Array<{ id: string; name: string; status: string; model: string; sessionsToday?: number; lastActive?: string }>;
  }>("/api/agents", { refreshInterval: REFRESH_INTERVAL });

  const { data: cronData, loading: cronLoading } = useApi<{
    crons: Array<{ id: string; name: string; status: string; schedule?: string; lastRun?: string; lastStatus?: string; duration?: string; enabled?: boolean; errors?: number; payload?: string }>;
    stats?: { total: number; enabled: number; healthy: number; errors: number; disabled: number };
    error?: string;
  }>("/api/cron-health", { refreshInterval: REFRESH_INTERVAL });

  const { data: revenueData } = useApi<{
    totalMRR: number; totalARR: number; monthlyGrowth: number;
    streams: Array<{ name: string; mrr: number; status: string; trend: string }>;
  }>("/api/revenue", { refreshInterval: REFRESH_INTERVAL });

  const { data: contentData } = useApi<{
    items: Array<{ id: string; title: string; status: string; category?: string; notionUrl?: string }>;
    stats?: { total: number; inProgress: number; byCategory: Record<string, number>; byStatus: Record<string, number> };
  }>("/api/content-pipeline", { refreshInterval: REFRESH_INTERVAL });

  const { data: taskData } = useApi<{
    tasks: Array<{ id: string; status: string }>;
  }>("/api/suggested-tasks", { refreshInterval: REFRESH_INTERVAL });

  // Trades with date parameter
  const { data: tradesData, loading: tradesLoading, refresh: refreshTrades } = useApi<{
    trades: Array<{ id: string; name: string; asset: string; direction: string; result: string; profit: number; confidence: number; notionUrl: string; windowEnd?: string; signals?: string; stake?: number; odds?: number }>;
    date: string;
    stats: { wins: number; losses: number; pending: number; pnl: string; winRate: string };
    allTime: { wins: number; losses: number; pending: number; pnl: string; winRate: string; total: number };
  }>(`/api/notion/trades?date=${selectedDate}`, { refreshInterval: REFRESH_INTERVAL });

  const { data: strapData } = useApi<{
    straplines: Array<{ id: string; text: string; used: boolean; usedDate: string | null; notionUrl: string }>;
    stats: { total: number; unused: number; used: number };
  }>("/api/notion/straplines", { refreshInterval: REFRESH_INTERVAL });

  const { data: notionTasksData } = useApi<{
    tasks: Array<{ id: string; title: string; done: boolean; notionUrl: string }>;
    stats: { total: number; done: number; pending: number };
  }>("/api/notion/tasks", { refreshInterval: REFRESH_INTERVAL });

  const { data: reportsData } = useApi<{
    reports: Array<{ id: string; name: string; url: string; createdTime: string; lastEditedTime: string }>;
  }>("/api/notion/reports", { refreshInterval: REFRESH_INTERVAL });

  const { data: botData, refresh: refreshBotStatus } = useApi<{
    bot: { 
      name: string; 
      status: string; 
      schedule: string; 
      lastRun?: string; 
      lastStatus?: string; 
      lastDuration?: string; 
      nextRun?: string;
      health?: {
        consecutiveErrors: number;
        lastSuccessfulRun: string | null;
        erroringSince: string | null;
        lastError: string | null;
      };
      logic?: {
        decisionPaths?: Array<{ name: string; key: string; requirement: string; type: string; enabled: boolean }>;
        signalCategories?: Array<{ name: string; description: string }>;
        safetyRails?: Array<{ rule: string; value: string }>;
        assetConfig?: Array<{ asset: string; weight: number; sentiment: string; excluded: boolean }>;
        stakeTiers?: Array<{ minConf: number; label: string; stake: number }>;
        params?: Record<string, any>;
        killSwitch?: boolean;
        excludedAssets?: string[];
        macroUpdate?: { timestamp: string; source: string } | null;
        currentMode?: string;
        fairOddsFormula?: string;
      };
      circuitBreaker?: {
        active: boolean;
        enabled: boolean;
        bypassed: boolean;
        bypassReason: string | null;
        recentResults: string[];
        recentWR: number | null;
        pausedUntil: number | null;
        minsLeft: number;
        lookback: number;
        threshold: number;
      };
      macroSentiment?: {
        current: Record<string, { weight: number; outlook: string; confidence: number; summary: string; key_factor: string }>;
        updatedAt: string | null;
        recentHistory?: Array<{ timestamp: string; weights: Record<string, number> }>;
      } | null;
    };
  }>("/api/bot-status", { refreshInterval: REFRESH_INTERVAL });

  const { data: twitterData } = useApi<{
    account: string;
    accountUrl: string;
    tweets: Array<{ id: string; type: string; text: string; timestamp: string; url?: string; tokenId?: string; tokenName?: string; farcaster?: boolean }>;
    stats: { tweetsToday: number; tweetsThisWeek: number; gmPosts: number; replies: number };
  }>("/api/twitter", { refreshInterval: REFRESH_INTERVAL });

  const { data: prioritiesData } = useApi<{
    priorities: Array<{ title: string; reason: string; action: string; category: string }>;
    scores: { revenue: number; product: number; growth: number; ops: number };
    blockers: string[];
    updatedAt: string;
  }>("/api/priorities", { refreshInterval: REFRESH_INTERVAL });

  const { data: cryptoData } = useApi<{
    predictions: {
      pending: Array<{ id: string; date: string; prediction: string; reasoning: string; deadline: string; confidence: string; category: string }>;
      resolved: Array<{ id: string; prediction: string; result: string; confidence: string }>;
      stats: { total: number; resolved: number; correct: number; wrong: number; winRate: string; pendingCount: number };
    };
  }>("/api/crypto", { refreshInterval: REFRESH_INTERVAL });

  // Trading controls
  const { data: tradingControl, loading: tradingControlLoading } = useApi<{
    mode: string;
    killSwitch: boolean;
    killInfo?: { activated: string; reason: string };
    walletConfigured: boolean;
    walletAddress?: string;
    lastRun?: string;
    botAlerts?: string[];
    paperBalance?: number;
    daily: { date: string; tradesPlaced: number; totalPnl: number; openPositions: number };
    limits: { maxStakePerTrade: number; maxDailyLoss: number; maxDailyTrades: number; maxConcurrentPositions: number };
  }>("/api/trading-control", { refreshInterval: 5000 }); // faster refresh for kill switch

  const { data: walletBalance } = useApi<{
    address: string;
    usdc: number;
    matic: number;
  }>("/api/wallet-balance", { refreshInterval: 10000 }); // live on-chain balance every 10s

  // Sync trade filter to current bot mode on initial load
  useEffect(() => {
    const mode = tradingControl?.mode;
    if (mode === 'real') setTradeFilter('real');
    else if (mode === 'paper') setTradeFilter('paper');
  }, [tradingControl?.mode]);

  // Compute filtered stats based on trade mode + path filters
  const filteredStats = useMemo(() => {
    if (!tradesData?.trades) return null;
    let filtered = tradeFilter === 'all' ? tradesData.trades : tradesData.trades.filter((t: any) => t.mode === tradeFilter);
    if (pathFilter.size > 0) {
      filtered = filtered.filter((t: any) => pathFilter.has(t.tradePath));
    }
    if (assetFilter.size > 0) {
      filtered = filtered.filter((t: any) => assetFilter.has(t.asset));
    }
    if (confFilter !== 'all') {
      const conf = (t: any) => (t.confidence || 0) * 100;
      if (confFilter === '75+') filtered = filtered.filter((t: any) => conf(t) >= 75);
      else if (confFilter === '65-74') filtered = filtered.filter((t: any) => conf(t) >= 65 && conf(t) < 75);
      else if (confFilter === '55-64') filtered = filtered.filter((t: any) => conf(t) >= 55 && conf(t) < 65);
      else if (confFilter === '<55') filtered = filtered.filter((t: any) => conf(t) < 55);
    }
    let wins = 0, losses = 0, pending = 0, pnl = 0;
    filtered.forEach((t: any) => {
      if (t.result === 'Win') { wins++; pnl += t.profit; }
      else if (t.result === 'Loss') { losses++; pnl += t.profit; }
      else if (t.result === 'Pending') { pending++; }
    });
    const winRate = wins + losses > 0 ? (wins / (wins + losses) * 100).toFixed(1) : 'N/A';
    return { wins, losses, pending, pnl: pnl.toFixed(2), winRate };
  }, [tradesData, tradeFilter, pathFilter, assetFilter, confFilter]);

  // Get available paths from today's trades + always-show paths
  const availablePaths = useMemo(() => {
    if (!tradesData?.trades) return [];
    const paths = new Set<string>();
    tradesData.trades.forEach((t: any) => { if (t.tradePath && t.tradePath !== 'unknown') paths.add(t.tradePath); });
    // Always show these paths even if no trades yet
    ['close'].forEach(p => paths.add(p));
    return Array.from(paths).sort();
  }, [tradesData]);

  // Compute filtered all-time stats from API per-mode breakdowns
  const filteredAllTime = useMemo(() => {
    if (tradeFilter === 'all') return tradesData?.allTime || null;
    if (tradeFilter === 'paper') return (tradesData as any)?.allTimePaper || null;
    if (tradeFilter === 'real') return (tradesData as any)?.allTimeReal || null;
    return tradesData?.allTime || null;
  }, [tradesData, tradeFilter]);

  const [killArmed, setKillArmed] = useState(false);
  const killTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const toggleKillSwitch = useCallback(async () => {
    // If already killed, single press to resume
    if (tradingControl?.killSwitch) {
      await fetch("/api/trading-control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unkill" }),
      });
      return;
    }
    
    // Two-press to kill: first press arms, second press fires
    if (!killArmed) {
      setKillArmed(true);
      // Auto-disarm after 3 seconds
      if (killTimerRef.current) clearTimeout(killTimerRef.current);
      killTimerRef.current = setTimeout(() => setKillArmed(false), 3000);
      return;
    }
    
    // Armed and pressed again — execute kill
    setKillArmed(false);
    if (killTimerRef.current) clearTimeout(killTimerRef.current);
    await fetch("/api/trading-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "kill" }),
    });
  }, [tradingControl?.killSwitch, killArmed]);

  const setTradingMode = useCallback(async (mode: string) => {
    await fetch("/api/trading-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set-mode", mode }),
    });
    // Sync trade filter to match mode
    if (mode === 'paper') setTradeFilter('paper');
    else if (mode === 'real') setTradeFilter('real');
    else setTradeFilter('all');
  }, []);

  // Date navigation helpers
  const navigateDate = useCallback((days: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + days);
    setSelectedDate(current.toISOString().split("T")[0]);
  }, [selectedDate]);

  const isToday = useMemo(() => selectedDate === new Date().toISOString().split("T")[0], [selectedDate]);
  
  const formatDateLabel = useCallback((dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (dateStr === today.toISOString().split("T")[0]) return "Today";
    if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }, []);

  if (sysLoading && agentLoading && cronLoading) {
    return (
      <PageWrapper title="Dashboard" subtitle="Truebot Mission Control">
        <GridSkeleton count={6} />
      </PageWrapper>
    );
  }

  const healthyServers = systemData?.servers?.filter((s) => s.status === "online").length || 0;
  const totalServers = systemData?.servers?.length || 0;
  const healthyCrons = cronData?.crons?.filter((c) => c.status === "healthy").length || 0;
  const totalCrons = cronData?.crons?.length || 0;
  const pendingTasks = taskData?.tasks?.filter((t) => t.status === "pending").length || 0;
  const contentInProgress = contentData?.items?.filter((i) => i.status !== "published").length || 0;

  return (
    <PageWrapper title="Dashboard" subtitle="Truebot Mission Control">
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab("trueshot")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "trueshot"
              ? "bg-primary-500/20 text-primary-400 border border-primary-500/30"
              : "bg-white/[0.03] text-zinc-400 border border-white/[0.05] hover:bg-white/[0.05]"
          }`}
        >
          <Camera className="w-4 h-4" />
          Trueshot
        </button>
        <button
          onClick={() => setActiveTab("crypto")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "crypto"
              ? "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30"
              : "bg-white/[0.03] text-zinc-400 border border-white/[0.05] hover:bg-white/[0.05]"
          }`}
        >
          <Coins className="w-4 h-4" />
          Crypto Bot
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === "audit"
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
              : "bg-white/[0.03] text-zinc-400 border border-white/[0.05] hover:bg-white/[0.05]"
          }`}
        >
          <Shield className="w-4 h-4" />
          Bot Auditor
        </button>
      </div>

      {activeTab === "trueshot" ? (
        <>
          {/* Quick Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 sm:mb-6">
            <QuickStat icon={Target} label="Revenue" value={`${prioritiesData?.scores?.revenue || 0}/5`} color={prioritiesData?.scores?.revenue && prioritiesData.scores.revenue >= 3 ? "text-accent-green" : "text-accent-red"} index={0} />
            <QuickStat icon={Zap} label="Product" value={`${prioritiesData?.scores?.product || 0}/5`} color={prioritiesData?.scores?.product && prioritiesData.scores.product >= 3 ? "text-accent-green" : "text-accent-yellow"} index={1} />
            <QuickStat icon={TrendingUp} label="Growth" value={`${prioritiesData?.scores?.growth || 0}/5`} color={prioritiesData?.scores?.growth && prioritiesData.scores.growth >= 3 ? "text-accent-green" : "text-accent-yellow"} index={2} />
            <QuickStat icon={Bot} label="Ops" value={`${prioritiesData?.scores?.ops || 0}/5`} color={prioritiesData?.scores?.ops && prioritiesData.scores.ops >= 3 ? "text-accent-green" : "text-accent-yellow"} index={3} />
          </div>

          {/* Priorities Section */}
          <GlassCard index={0} className="mb-4">
            <CardHeader icon={Target} title="Mission Priorities" badge={prioritiesData?.updatedAt ? `Updated ${formatRelativeTime(prioritiesData.updatedAt)}` : undefined} />
            <div className="space-y-3 mt-3">
              {prioritiesData?.priorities?.map((priority: any, idx: number) => (
                <a 
                  key={idx} 
                  href={priority.notionUrl || "https://notion.so/2f6f4aa39817801a9da9e756315c2ee5"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer group"
                >
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    priority.category === "revenue" ? "bg-green-500/20 text-green-400" :
                    priority.category === "product" ? "bg-purple-500/20 text-purple-400" :
                    priority.category === "growth" ? "bg-blue-500/20 text-blue-400" :
                    "bg-zinc-500/20 text-zinc-400"
                  }`}>{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-zinc-200 font-medium group-hover:text-white transition-colors">{priority.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{priority.reason}</p>
                    <p className="text-xs text-zinc-400 mt-1">→ {priority.action}</p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 shrink-0 mt-1" />
                </a>
              ))}
              {prioritiesData?.blockers && prioritiesData.blockers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.05]">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Blockers</p>
                  {prioritiesData.blockers.map((blocker, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-accent-red">
                      <AlertTriangle className="w-3 h-3" />
                      {blocker}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Research & Reports - Right after Priorities */}
          <GlassCard index={1} className="mb-4">
            <CardHeader icon={FileText} title="Research & Reports" badge={reportsData?.reports ? `${reportsData.reports.length} reports` : undefined} />
            <div className="space-y-2 mt-3 max-h-[200px] overflow-y-auto custom-scrollbar">
              {reportsData?.reports?.slice(0, 8).map((report) => (
                <a 
                  key={report.id} 
                  href={report.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between py-1.5 hover:bg-white/[0.03] px-1 -mx-1 rounded cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-2">
                    <span className="text-xs text-zinc-300 truncate block">{report.name}</span>
                    <span className="text-[9px] text-zinc-500">
                      {new Date(report.createdTime).toLocaleDateString()}
                    </span>
                  </div>
                  <ExternalLink className="w-3 h-3 text-zinc-600 shrink-0" />
                </a>
              ))}
              {(!reportsData?.reports || reportsData.reports.length === 0) && (
                <p className="text-xs text-zinc-500 text-center py-4">No reports yet</p>
              )}
            </div>
          </GlassCard>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {/* System Health */}
        <GlassCard index={0} className="col-span-1">
          <CardHeader icon={Server} title="System Health" badge={`${healthyServers}/${totalServers} online`} />
          <div className="space-y-2.5 mt-3">
            {systemData?.servers?.map((server) => (
              <div key={server.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusBadge status={server.status} />
                  <span className="text-xs text-zinc-300">{server.name}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  {server.cpu !== undefined && (
                    <span className="flex items-center gap-1">
                      <Cpu className="w-3 h-3" />{server.cpu}%
                    </span>
                  )}
                  {server.memory !== undefined && (
                    <span className="flex items-center gap-1">
                      <MemoryStick className="w-3 h-3" />{server.memory}%
                    </span>
                  )}
                  {server.uptime && <span>{server.uptime}</span>}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Agent Status */}
        <GlassCard index={1} className="col-span-1">
          <CardHeader icon={Bot} title="Agent Status" />
          <div className="space-y-3 mt-3">
            {agentData?.agents?.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={agent.status} />
                    <span className="text-xs font-medium text-zinc-200">{agent.name}</span>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 ml-[18px]">{agent.model}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-zinc-400">{agent.sessionsToday || 0} sessions</p>
                  {agent.lastActive && (
                    <p className="text-[10px] text-zinc-600">{formatRelativeTime(agent.lastActive)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Cron Health */}
        <GlassCard index={2} className="col-span-1 xl:col-span-2">
          <CardHeader icon={Clock} title="Cron Jobs" badge={cronData?.stats ? `${cronData.stats.healthy}/${cronData.stats.enabled} healthy` : undefined} />
          <div className="space-y-1 mt-3 max-h-[320px] overflow-y-auto custom-scrollbar">
            {cronData?.crons?.map((cron: any) => (
              <div key={cron.id} className={cron.status === "disabled" ? "opacity-50" : ""}>
                <div 
                  onClick={() => setExpandedCron(expandedCron === cron.id ? null : cron.id)}
                  className="flex items-center justify-between py-1.5 px-2 -mx-1 rounded cursor-pointer hover:bg-white/[0.03] transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {expandedCron === cron.id ? (
                      <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
                    )}
                    {cron.status === "healthy" ? (
                      <CheckCircle2 className="w-3 h-3 text-accent-green shrink-0" />
                    ) : cron.status === "error" ? (
                      <AlertTriangle className="w-3 h-3 text-accent-red shrink-0" />
                    ) : (
                      <Clock className="w-3 h-3 text-zinc-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-xs text-zinc-300 truncate block">{cron.name}</span>
                      <span className="text-[9px] text-zinc-500">{cron.schedule}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] shrink-0 ml-2">
                    {cron.lastStatus && (
                      <span className={`px-1.5 py-0.5 rounded ${
                        cron.lastStatus === "ok" ? "bg-accent-green/10 text-accent-green" :
                        cron.lastStatus === "error" ? "bg-accent-red/10 text-accent-red" :
                        "bg-white/[0.04] text-zinc-500"
                      }`}>
                        {cron.lastStatus}
                      </span>
                    )}
                    {cron.duration && <span className="text-zinc-600">{cron.duration}</span>}
                    {cron.lastRun && <span className="text-zinc-500">{formatRelativeTime(cron.lastRun, true)}</span>}
                    {!cron.enabled && <span className="text-zinc-600 italic">disabled</span>}
                  </div>
                </div>
                <AnimatePresence>
                  {expandedCron === cron.id && cron.payload && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <pre className="text-[10px] text-zinc-400 bg-black/30 rounded-md p-3 ml-6 mr-1 mb-2 whitespace-pre-wrap font-mono leading-relaxed">
                        {cron.payload}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {(!cronData?.crons || cronData.crons.length === 0) && (
              <p className="text-xs text-zinc-500 text-center py-4">
                {cronData?.error ? `Error: ${cronData.error}` : "No cron jobs"}
              </p>
            )}
          </div>
        </GlassCard>

        {/* Revenue */}
        <GlassCard index={3} className="col-span-1">
          <CardHeader icon={DollarSign} title="Revenue" />
          <div className="mt-3">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-2xl font-semibold text-zinc-100">
                ${(revenueData?.totalMRR || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-zinc-500">MRR</span>
              {revenueData?.monthlyGrowth !== undefined && revenueData.monthlyGrowth > 0 && (
                <span className="text-[10px] text-accent-green flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />+{revenueData.monthlyGrowth}%
                </span>
              )}
            </div>
            <div className="space-y-2">
              {revenueData?.streams?.map((stream) => (
                <div key={stream.name} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400">{stream.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-300">${stream.mrr.toLocaleString()}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-500 capitalize">
                      {stream.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* Content Pipeline */}
        <GlassCard index={4} className="col-span-1">
          <CardHeader icon={FileText} title="Content Pipeline" badge={contentData?.stats ? `${contentData.stats.inProgress} in progress` : undefined} />
          <div className="space-y-2 mt-3 max-h-[200px] overflow-y-auto custom-scrollbar">
            {contentData?.items?.slice(0, 8).map((item: any) => (
              <a 
                key={item.id} 
                href={item.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between py-1 hover:bg-white/[0.03] px-1 -mx-1 rounded cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0 mr-2">
                  <span className="text-xs text-zinc-300 truncate block">{item.title}</span>
                  <span className={`text-[9px] ${
                    item.category === "Content" ? "text-blue-400" :
                    item.category === "Development" ? "text-purple-400" :
                    item.category === "Business" ? "text-green-400" :
                    item.category === "Research" ? "text-yellow-400" :
                    "text-zinc-500"
                  }`}>{item.category}</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md shrink-0 ${
                  item.status === "published" ? "bg-accent-green/10 text-accent-green" :
                  item.status === "ready" ? "bg-accent-blue/10 text-accent-blue" :
                  item.status === "review" ? "bg-accent-yellow/10 text-accent-yellow" :
                  item.status === "drafting" ? "bg-orange-500/10 text-orange-400" :
                  "bg-white/[0.04] text-zinc-500"
                }`}>
                  {item.status}
                </span>
              </a>
            ))}
            {(!contentData?.items || contentData.items.length === 0) && (
              <p className="text-xs text-zinc-500 text-center py-4">No content items</p>
            )}
          </div>
        </GlassCard>

        {/* Twitter Feed */}
        <GlassCard index={6} className="col-span-1 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <CardHeader icon={Twitter} title="Twitter Activity" badge={twitterData?.stats ? `${twitterData.stats.tweetsThisWeek} this week` : undefined} />
            <a 
              href={twitterData?.accountUrl || "https://x.com/trueshotio"} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-primary-400 hover:text-primary-300 flex items-center gap-1"
            >
              @Trueshotio <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="flex items-center gap-4 mb-3 pb-3 border-b border-white/[0.04] text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> {twitterData?.stats?.gmPosts || 0} GM posts
            </span>
            <span className="flex items-center gap-1">
              <Reply className="w-3 h-3" /> {twitterData?.stats?.replies || 0} replies
            </span>
          </div>
          <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
            {twitterData?.tweets?.slice(0, 8).map((tweet) => (
              <a 
                key={tweet.id} 
                href={tweet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 py-1.5 hover:bg-white/[0.03] px-1 -mx-1 rounded cursor-pointer transition-colors"
              >
                <div className="shrink-0 mt-0.5">
                  {tweet.type === "gm" ? (
                    <ImageIcon className="w-3 h-3 text-accent-yellow" />
                  ) : (
                    <Reply className="w-3 h-3 text-accent-cyan" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300 truncate">{tweet.text}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {tweet.tokenName && (
                      <span className="text-[9px] text-zinc-500">📸 {tweet.tokenName}</span>
                    )}
                    <span className="text-[9px] text-zinc-600">
                      {new Date(tweet.timestamp).toLocaleDateString()} {new Date(tweet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {tweet.farcaster && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">FC</span>
                    )}
                  </div>
                </div>
              </a>
            ))}
            {(!twitterData?.tweets || twitterData.tweets.length === 0) && (
              <p className="text-xs text-zinc-500 text-center py-4">No recent tweets</p>
            )}
          </div>
        </GlassCard>

        {/* GM Straplines */}
        <GlassCard index={8} className="col-span-1">
          <CardHeader icon={MessageSquare} title="GM Straplines" badge={strapData?.stats ? `${strapData.stats.unused} unused` : undefined} />
          <div className="space-y-2 mt-3 max-h-[200px] overflow-y-auto custom-scrollbar">
            {strapData?.straplines?.slice(0, 10).map((strap) => (
              <a 
                key={strap.id} 
                href={strap.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between py-1 hover:bg-white/[0.03] px-1 -mx-1 rounded cursor-pointer transition-colors"
              >
                <span className={`text-xs truncate mr-2 ${strap.used ? "text-zinc-500" : "text-zinc-300"}`}>
                  "{strap.text}"
                </span>
                {strap.used ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-600 shrink-0">
                    {strap.usedDate?.split("T")[0]}
                  </span>
                ) : (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-accent-green/10 text-accent-green shrink-0">
                    ready
                  </span>
                )}
              </a>
            ))}
          </div>
        </GlassCard>

        {/* Notion Tasks */}
        <GlassCard index={9} className="col-span-1">
          <CardHeader icon={CheckCircle2} title="To Do List" badge={notionTasksData?.stats ? `${notionTasksData.stats.pending} pending` : undefined} />
          <div className="space-y-2 mt-3 max-h-[200px] overflow-y-auto custom-scrollbar">
            {notionTasksData?.tasks?.slice(0, 10).map((task) => (
              <a 
                key={task.id} 
                href={task.notionUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 py-1 hover:bg-white/[0.03] px-1 -mx-1 rounded cursor-pointer transition-colors"
              >
                <div className={`w-3 h-3 rounded border ${task.done ? "bg-accent-green/20 border-accent-green" : "border-zinc-600"} flex items-center justify-center`}>
                  {task.done && <CheckCircle2 className="w-2 h-2 text-accent-green" />}
                </div>
                <span className={`text-xs truncate ${task.done ? "text-zinc-500 line-through" : "text-zinc-300"}`}>
                  {task.title}
                </span>
              </a>
            ))}
          </div>
        </GlassCard>

        {/* Activity Feed */}
        <GlassCard index={10} className="col-span-1">
          <CardHeader icon={Activity} title="Quick Actions" />
          <div className="space-y-2 mt-3">
            {[
              { label: "Review pending tasks", count: pendingTasks, href: "/ops?tab=tasks" },
              { label: "Check content pipeline", count: contentInProgress, href: "/content" },
              { label: "Monitor cron jobs", count: totalCrons, href: "/ops" },
              { label: "View agent details", count: agentData?.agents?.length || 0, href: "/agents" },
            ].map((action, i) => (
              <motion.a
                key={action.label}
                href={action.href}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors group cursor-pointer"
              >
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">{action.label}</span>
                <span className="text-[10px] text-zinc-600">{action.count}</span>
              </motion.a>
            ))}
          </div>
        </GlassCard>
      </div>
        </>
      ) : activeTab === "crypto" ? (
        /* Crypto Tab Content */
        <>
      {/* Polymarket Section TOP */}
        <GlassCard index={0} className="mb-6 border-accent-yellow/20">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-accent-yellow" />
              <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">Polymarket 15M Bot</h2>
              {botData?.bot?.status === "error" ? (
                <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-accent-red/20 text-accent-red">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" />
                  ERROR
                </span>
              ) : botData?.bot?.status === "stale" ? (
                <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-accent-yellow/20 text-accent-yellow">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow animate-pulse" />
                  STALE
                </span>
              ) : botData?.bot?.status === "running" ? (
                <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-accent-green/20 text-accent-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                  LIVE
                </span>
              ) : null}
            </div>
            {/* All-time stats */}
            {(tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime) && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
                <span className="text-zinc-500">{tradeFilter === 'all' ? 'All-time:' : tradeFilter === 'paper' ? '📄 Paper:' : '💰 Real:'}</span>
                <span className="text-zinc-400">{(tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime)?.wins}W/{(tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime)?.losses}L</span>
                <span className={`font-semibold ${parseFloat((tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime)?.pnl || '0') >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                  {parseFloat((tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime)?.pnl || '0') >= 0 ? "+" : ""}${(tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime)?.pnl}
                </span>
                <span className="text-zinc-500">({(tradeFilter === 'all' ? tradesData?.allTime : filteredAllTime)?.winRate}%)</span>
              </div>
            )}
          </div>

          {/* Status Bar: Last Run + Balance */}
          <div className="flex flex-wrap items-center gap-4 mb-4 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-[11px]">
            {/* Last Run */}
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-500">Last run:</span>
              {tradingControl?.lastRun ? (
                <span className="text-zinc-300">{formatRelativeTime(tradingControl.lastRun, true)}</span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </div>

            {/* Divider */}
            <span className="text-zinc-700">|</span>

            {/* Wallet Balance */}
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-zinc-500" />
              {tradingControl?.mode === "paper" ? (
                <>
                  <span className="text-zinc-500">Paper balance:</span>
                  <span className="text-accent-yellow font-mono font-medium">
                    ${(tradeFilter === 'all' || tradeFilter === 'paper') && tradesData?.allTime ? (1000 + parseFloat((tradeFilter === 'all' ? tradesData.allTime : filteredAllTime)?.pnl || '0')).toFixed(2) : tradingControl?.paperBalance?.toFixed(2) || "1,000.00"}
                  </span>
                </>
              ) : walletBalance ? (
                <>
                  <span className="text-zinc-500">Wallet:</span>
                  <span className="text-accent-green font-mono font-medium">${walletBalance.usdc.toFixed(2)} USDC</span>
                  <span className="text-zinc-600">+ {walletBalance.matic.toFixed(4)} POL</span>
                </>
              ) : tradingControl?.walletConfigured ? (
                <span className="text-zinc-500">Loading balance...</span>
              ) : (
                <span className="text-zinc-600">No wallet</span>
              )}
            </div>

            {/* Alerts */}
            {tradingControl?.botAlerts && tradingControl.botAlerts.length > 0 && (
              <>
                <span className="text-zinc-700">|</span>
                <div className="flex items-center gap-1.5 text-accent-red">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>{tradingControl.botAlerts[0]}</span>
                </div>
              </>
            )}
          </div>

          {/* Error Banner */}
          {botData?.bot?.status === "error" && botData?.bot?.health && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-accent-red/10 border border-accent-red/30 text-xs">
              <div className="flex items-center gap-2 text-accent-red font-semibold mb-1">
                <AlertTriangle className="w-4 h-4" />
                Bot is crashing — not trading!
              </div>
              <div className="text-zinc-400 space-y-0.5">
                <div>Error: <span className="text-zinc-300 font-mono">{botData.bot.health.lastError}</span></div>
                <div>Failing since: <span className="text-zinc-300">{botData.bot.health.erroringSince ? formatRelativeTime(botData.bot.health.erroringSince, true) : 'unknown'}</span></div>
                <div>Consecutive failures: <span className="text-zinc-300">{botData.bot.health.consecutiveErrors}</span></div>
                {botData.bot.health.lastSuccessfulRun && (
                  <div>Last successful run: <span className="text-zinc-300">{formatRelativeTime(botData.bot.health.lastSuccessfulRun, true)}</span></div>
                )}
              </div>
            </div>
          )}

          {/* Trading Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
            {/* Mode Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Mode:</span>
              <div className="flex gap-1">
                {(["paper", "real", "disabled"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTradingMode(m)}
                    className={`text-[10px] px-2.5 py-1 rounded-md font-medium transition-all ${
                      tradingControl?.mode === m
                        ? m === "real" ? "bg-accent-green/20 text-accent-green border border-accent-green/30"
                        : m === "disabled" ? "bg-accent-red/20 text-accent-red border border-accent-red/30"
                        : "bg-accent-yellow/20 text-accent-yellow border border-accent-yellow/30"
                        : "bg-white/[0.03] text-zinc-500 border border-white/[0.05] hover:bg-white/[0.05]"
                    }`}
                  >
                    {m === "paper" ? "📄 Paper" : m === "real" ? "💰 Real" : "⛔ Off"}
                  </button>
                ))}
              </div>
            </div>

            {/* Kill Switch */}
            <button
              onClick={toggleKillSwitch}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tradingControl?.killSwitch
                  ? "bg-accent-red/20 text-accent-red border border-accent-red/30 animate-pulse"
                  : killArmed
                    ? "bg-accent-red/30 text-accent-red border border-accent-red/50 animate-pulse"
                    : "bg-white/[0.03] text-zinc-400 border border-white/[0.05] hover:bg-accent-red/10 hover:text-accent-red hover:border-accent-red/20"
              }`}
            >
              {tradingControl?.killSwitch ? (
                <><ShieldOff className="w-3.5 h-3.5" /> KILLED — Click to Resume</>
              ) : killArmed ? (
                <><ShieldAlert className="w-3.5 h-3.5" /> CONFIRM KILL</>
              ) : (
                <><Shield className="w-3.5 h-3.5" /> Kill Switch</>
              )}
            </button>

            {/* Wallet Status */}
            <div className="flex items-center gap-2 ml-auto text-[10px]">
              {tradingControl?.walletConfigured ? (
                <span className="text-zinc-500">
                  Wallet: <a href={`https://polymarket.com/profile/${tradingControl.walletAddress}`} target="_blank" rel="noopener noreferrer" className="text-zinc-400 font-mono hover:text-accent-green transition-colors">{tradingControl.walletAddress?.slice(0, 6)}...{tradingControl.walletAddress?.slice(-4)} ↗</a>
                </span>
              ) : (
                <span className="text-zinc-600">No wallet configured</span>
              )}
            </div>

            {/* Daily real trading stats */}
            {tradingControl?.mode === "real" && tradingControl.daily.tradesPlaced > 0 && (
              <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                <span>Today: {tradingControl.daily.tradesPlaced} trades</span>
                <span className={tradingControl.daily.totalPnl >= 0 ? "text-accent-green" : "text-accent-red"}>
                  {tradingControl.daily.totalPnl >= 0 ? "+" : ""}${tradingControl.daily.totalPnl.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Date Navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4 pb-3 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateDate(-1)}
                className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-zinc-400" />
              </button>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-200">{formatDateLabel(selectedDate)}</span>
                <span className="text-xs text-zinc-500 hidden sm:inline">{selectedDate}</span>
              </div>
              <button
                onClick={() => navigateDate(1)}
                disabled={isToday}
                className={`p-1.5 rounded-lg border border-white/[0.05] transition-colors ${
                  isToday ? "bg-white/[0.01] text-zinc-600 cursor-not-allowed" : "bg-white/[0.03] hover:bg-white/[0.06] text-zinc-400"
                }`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
                  className="text-xs text-primary-400 hover:text-primary-300 ml-1"
                >
                  Today
                </button>
              )}
            </div>
          
            {/* Day stats */}
            {(filteredStats || tradesData?.stats) && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-300">{(filteredStats || tradesData?.stats)?.wins}W/{(filteredStats || tradesData?.stats)?.losses}L</span>
                {((filteredStats || tradesData?.stats)?.pending ?? 0) > 0 && (
                  <span className="text-xs text-accent-yellow">({(filteredStats || tradesData?.stats)?.pending} pending)</span>
                )}
                <button
                  onClick={async () => {
                    setResolving(true);
                    setResolveMsg(null);
                    try {
                      const res = await fetch("/api/resolve-trades", { method: "POST" });
                      const data = await res.json();
                      setResolveMsg(data.ok ? "✅ Resolved" : "❌ Failed");
                      refreshTrades();
                    } catch { setResolveMsg("❌ Error"); }
                    setTimeout(() => setResolveMsg(null), 3000);
                    setResolving(false);
                  }}
                  disabled={resolving}
                  className="p-1 rounded-md bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] transition-colors disabled:opacity-50"
                  title="Resolve pending trades & refresh"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${resolving ? "animate-spin" : ""}`} />
                </button>
                {resolveMsg && <span className="text-xs text-zinc-400">{resolveMsg}</span>}
                <span className={`text-lg font-bold ${parseFloat((filteredStats || tradesData?.stats)?.pnl || '0') >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                  {parseFloat((filteredStats || tradesData?.stats)?.pnl || '0') >= 0 ? "+" : ""}${(filteredStats || tradesData?.stats)?.pnl}
                </span>
              </div>
            )}
          </div>

          {/* Trade Mode Filter */}
          <div className="flex gap-1 mb-2">
            {(['all', 'paper', 'real'] as const).map(f => (
              <button
                key={f}
                onClick={() => setTradeFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  tradeFilter === f
                    ? f === 'real' ? 'bg-accent-green/20 text-accent-green' : f === 'paper' ? 'bg-accent-yellow/20 text-accent-yellow' : 'bg-white/10 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f === 'all' ? 'All' : f === 'paper' ? '📄 Paper' : '💰 Real'}
              </button>
            ))}
          </div>

          {/* Path Filter - multi-select */}
          {availablePaths.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              <button
                onClick={() => setPathFilter(new Set())}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  pathFilter.size === 0 ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                All Paths
              </button>
              {availablePaths.map(p => {
                const labels: Record<string, string> = {
                  path1: 'Path 1', path2: 'Path 2', path3: 'Path 3',
                  sr: '🏗️ S/R', arb: '🎰 Arb', breakingNews: '⚡ News',
                  macro: '📅 Macro', whale: '🐋 Whale', trend: '📈 Trend', copy: '🔄 Copy', adaptive: '🧠 Adaptive', close: '🔒 Close', unknown: '❓',
                };
                const isSelected = pathFilter.has(p);
                return (
                  <button
                    key={p}
                    onClick={() => {
                      const next = new Set(pathFilter);
                      if (isSelected) next.delete(p); else next.add(p);
                      setPathFilter(next);
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                      isSelected ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                    }`}
                  >
                    {labels[p] || p}
                  </button>
                );
              })}
            </div>
          )}

          {/* Asset Filter */}
          <div className="flex flex-wrap gap-1 mb-2">
            <button
              onClick={() => setAssetFilter(new Set())}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                assetFilter.size === 0 ? 'bg-white/10 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              All Assets
            </button>
            {['BTC', 'ETH', 'SOL', 'XRP'].map(asset => {
              const isSelected = assetFilter.has(asset);
              return (
                <button
                  key={asset}
                  onClick={() => {
                    const next = new Set(assetFilter);
                    if (isSelected) next.delete(asset); else next.add(asset);
                    setAssetFilter(next);
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                    isSelected ? 'bg-accent-amber/20 text-accent-amber border border-accent-amber/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                  }`}
                >
                  {asset}
                </button>
              );
            })}
          </div>

          {/* Confidence Filter */}
          <div className="flex flex-wrap gap-1 mb-2">
            {[
              { key: 'all', label: 'All Conf' },
              { key: '75+', label: '75%+' },
              { key: '65-74', label: '65-74%' },
              { key: '55-64', label: '55-64%' },
              { key: '<55', label: '<55%' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setConfFilter(key)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  confFilter === key ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Trades List */}
          {(() => {
            const matchTrade = (t: any) => {
              if (tradeFilter !== 'all' && t.mode !== tradeFilter) return false;
              if (pathFilter.size > 0 && !pathFilter.has(t.tradePath)) return false;
              if (assetFilter.size > 0 && !assetFilter.has(t.asset)) return false;
              if (confFilter !== 'all') {
                const c = (t.confidence || 0) * 100;
                if (confFilter === '75+' && c < 75) return false;
                if (confFilter === '65-74' && (c < 65 || c >= 75)) return false;
                if (confFilter === '55-64' && (c < 55 || c >= 65)) return false;
                if (confFilter === '<55' && c >= 55) return false;
              }
              return true;
            };
            return (
          <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
            {tradesLoading ? (
              <div className="text-center py-8">
                <div className="inline-block w-5 h-5 border-2 border-accent-yellow/30 border-t-accent-yellow rounded-full animate-spin" />
              </div>
            ) : tradesData?.trades && tradesData.trades.filter(matchTrade).length > 0 ? (
              tradesData.trades.filter(matchTrade).map((trade: any) => (
                <a 
                  key={trade.id} 
                  href={trade.marketUrl || trade.notionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-2.5 px-2.5 sm:px-3 hover:bg-white/[0.03] rounded-lg cursor-pointer transition-colors border border-white/[0.03] bg-white/[0.01]"
                >
                  {/* Direction Icon */}
                  {trade.direction === "Up" ? (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent-green/10 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 text-accent-green" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-accent-red/10 flex items-center justify-center shrink-0">
                      <ArrowDownRight className="w-4 h-4 sm:w-5 sm:h-5 text-accent-red" />
                    </div>
                  )}
                
                  {/* Trade Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <span className="text-sm text-zinc-200 font-medium">{trade.asset}</span>
                      <span className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded ${
                        trade.direction === "Up" ? "bg-accent-green/10 text-accent-green" : "bg-accent-red/10 text-accent-red"
                      }`}>{trade.direction}</span>
                      {(trade as any).fillPrice
                        ? <><span className="text-[10px] sm:text-xs text-zinc-400 font-medium">@ {((trade as any).fillPrice * 100).toFixed(1)}%</span>{(trade as any).fillPrice !== trade.odds && <span className="text-[10px] text-zinc-600 hidden sm:inline ml-1">(sig {(trade.odds * 100).toFixed(0)}%)</span>}</>
                        : <span className="text-[10px] sm:text-xs text-zinc-500">@ {(trade.odds * 100).toFixed(1)}%</span>
                      }
                      {trade.stake && <span className="text-[10px] sm:text-xs text-accent-yellow font-medium">${trade.stake}</span>}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-zinc-500 mt-0.5 truncate">
                      {trade.windowEnd ? `closes ${new Date(trade.windowEnd).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : trade.executionTime ? new Date(trade.executionTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                      {trade.signals && <span className="ml-1.5 truncate">📊 {trade.signals.substring(0, 40)}{trade.signals.length > 40 ? '...' : ''}</span>}
                    </div>
                  </div>
                
                  {/* Result */}
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className="flex items-center gap-1">
                      {trade.notionUrl && <a href={trade.notionUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors" title="Open in Notion">📋</a>}
                      {trade.mode === 'real' && <span className="text-[8px] px-1 rounded bg-accent-green/20 text-accent-green">REAL</span>}
                      {trade.tradePath && trade.tradePath !== 'unknown' && <span className="text-[8px] px-1 rounded bg-accent-blue/15 text-accent-blue/70" title={`Path: ${trade.tradePath}`}>{
                        ({ path1: 'P1', path2: 'P2', path3: 'P3', sr: 'S/R', arb: 'ARB', breakingNews: 'NEWS', macro: 'MACRO', whale: 'WHALE', trend: 'TREND', copy: 'COPY', adaptive: '🧠', close: '🔒' } as Record<string, string>)[trade.tradePath] || trade.tradePath
                      }</span>}
                      <span className={`text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-lg font-medium ${
                        trade.result === "Win" ? "bg-accent-green/20 text-accent-green" :
                        trade.result === "Loss" ? "bg-accent-red/20 text-accent-red" :
                        trade.result === "Rejected" ? "bg-orange-500/20 text-orange-400" :
                        "bg-accent-yellow/20 text-accent-yellow"
                      }`}>
                        {trade.result === "Pending" ? "⏳" : trade.result === "Rejected" ? "❌ Rejected" : trade.result}
                      </span>
                    </div>
                    {trade.rejectionReason && (
                      <span className="text-[9px] text-orange-400/70 truncate max-w-[120px]" title={trade.rejectionReason}>{trade.rejectionReason}</span>
                    )}
                    {trade.result !== "Pending" && trade.result !== "Rejected" && (
                      <span className={`text-xs sm:text-sm font-semibold ${trade.profit >= 0 ? "text-accent-green" : "text-accent-red"}`}>
                        {trade.profit >= 0 ? "+" : ""}${trade.profit.toFixed(2)}
                      </span>
                    )}
                  </div>
                </a>
              ))
            ) : (
              <div className="text-center py-8">
                <p className="text-sm text-zinc-500">No trades on {formatDateLabel(selectedDate)}</p>
                <button 
                  onClick={() => navigateDate(-1)}
                  className="text-xs text-primary-400 hover:text-primary-300 mt-2"
                >
                  ← Check previous day
                </button>
              </div>
            )}
          </div>
            );
          })()}
        </GlassCard>

          {/* Trading Control Panel */}
          {botData?.bot?.logic && (() => {
            const logic = botData.bot.logic;
            const postConfig = async (body: any) => {
              console.log('[postConfig] sending:', JSON.stringify(body));
              try {
                const res = await fetch('/api/trading-config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                });
                console.log('[postConfig] status:', res.status);
                // Small delay to let file write complete, then refresh
                setTimeout(() => refreshBotStatus(), 200);
              } catch (err) {
                console.error('[postConfig] error:', err);
              }
            };
            return (
            <GlassCard index={2} className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-3">
                <CardHeader icon={Settings} title="Trading Control Panel" badge={logic.currentMode} />
                {/* Kill Switch */}
                <button
                  onClick={() => postConfig({ action: 'killSwitch', enabled: !logic.killSwitch })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    logic.killSwitch
                      ? 'bg-accent-red/20 text-accent-red border border-accent-red/30 animate-pulse'
                      : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:bg-zinc-700'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {logic.killSwitch ? '🛑 PAUSED' : 'Trading Active'}
                </button>
              </div>

              {/* Circuit Breaker Status */}
              {(() => {
                const cb = botData?.bot?.circuitBreaker;
                if (!cb) return null;
                return (
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border mb-3 ${
                    cb.active ? 'bg-accent-red/10 border-accent-red/30' :
                    cb.bypassed ? 'bg-zinc-700/30 border-zinc-600/30' :
                    'bg-accent-green/10 border-accent-green/30'
                  }`}>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm">{cb.active ? '🚨' : cb.bypassed ? '⏸️' : '✅'}</span>
                      <div>
                        <span className={`text-xs font-medium ${
                          cb.active ? 'text-accent-red' : cb.bypassed ? 'text-zinc-400' : 'text-accent-green'
                        }`}>
                          Circuit Breaker: {cb.active ? `ACTIVE (${cb.minsLeft}m left)` : cb.bypassed ? `Off (${cb.bypassReason})` : 'Ready'}
                        </span>
                        {cb.recentWR !== null && (
                          <span className={`text-[10px] ml-2 ${cb.recentWR < cb.threshold ? 'text-accent-red' : 'text-zinc-400'}`}>
                            Recent WR: {cb.recentWR}% ({cb.recentResults.length} trades) · Threshold: {cb.threshold}%
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => postConfig({ action: 'toggleCircuitBreaker', enabled: !cb.enabled })}
                      className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                        cb.enabled
                          ? 'bg-accent-green/20 text-accent-green border border-accent-green/30 hover:bg-accent-green/30'
                          : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30 hover:bg-zinc-700'
                      }`}
                    >
                      {cb.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    {cb.recentResults.length > 0 && (
                      <div className="flex gap-0.5">
                        {cb.recentResults.map((r: string, i: number) => (
                          <span key={i} className={`w-2 h-2 rounded-full ${r === 'W' ? 'bg-accent-green' : 'bg-accent-red'}`} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Column 1: Decision Paths */}
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Decision Paths</h3>
                  <div className="space-y-2">
                    {logic.decisionPaths?.map((path: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="flex bg-zinc-800 rounded-md overflow-hidden shrink-0">
                          {(["real", "paper", "disabled"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => postConfig({ action: 'setPathMode', pathName: path.key, mode: m })}
                              className={`px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                path.mode === m
                                  ? m === 'real' ? 'bg-accent-green/70 text-white' : m === 'paper' ? 'bg-yellow-600/70 text-white' : 'bg-red-600/70 text-white'
                                  : 'text-zinc-500 hover:text-zinc-300'
                              }`}
                            >
                              {m === "real" ? "💰" : m === "paper" ? "📄" : "⛔"}
                            </button>
                          ))}
                        </div>
                        <span className={`text-zinc-200 font-medium whitespace-nowrap ${path.mode === 'disabled' ? 'opacity-40' : ''}`}>{path.name}</span>
                        <span className="text-zinc-500 truncate">{path.requirement}</span>
                      </div>
                    ))}
                  </div>

                  {/* Macro Direction Lean — at-a-glance view */}
                  {botData?.bot?.macroSentiment?.current && (
                    <div className="mt-3">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Direction Lean</h3>
                      <div className="grid grid-cols-3 gap-2">
                        {['BTC', 'ETH', 'SOL'].map(asset => {
                          const d = botData?.bot?.macroSentiment?.current?.[asset];
                          if (!d) return null;
                          const w = d.weight || 0;
                          const outlook = d.outlook || 'neutral';
                          const conf = d.confidence || 0;
                          const bgClass = outlook === 'bullish' ? 'border-accent-green/30 bg-accent-green/10' : outlook === 'bearish' ? 'border-accent-red/30 bg-accent-red/10' : 'border-zinc-700 bg-zinc-800/50';
                          const textClass = outlook === 'bullish' ? 'text-accent-green' : outlook === 'bearish' ? 'text-accent-red' : 'text-zinc-400';
                          const icon = outlook === 'bullish' ? '↑' : outlook === 'bearish' ? '↓' : '→';
                          const barWidth = Math.min(Math.abs(w) / 0.05 * 100, 100);
                          const barColor = outlook === 'bullish' ? 'bg-accent-green' : outlook === 'bearish' ? 'bg-accent-red' : 'bg-zinc-600';
                          return (
                            <div key={asset} className={`rounded-lg border px-3 py-2 ${bgClass}`}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-bold text-zinc-200">{asset}</span>
                                <span className={`text-lg font-bold ${textClass}`}>{icon}</span>
                              </div>
                              <div className={`text-xs font-semibold ${textClass} mt-0.5`}>
                                {w > 0 ? '+' : ''}{(w * 100).toFixed(1)}% {outlook}
                              </div>
                              {/* Strength bar */}
                              <div className="mt-1.5 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barWidth}%` }} />
                              </div>
                              <div className="text-[10px] text-zinc-500 mt-1">
                                {(conf * 100).toFixed(0)}% confident
                              </div>
                              {d.key_factor && (
                                <div className="text-[10px] text-zinc-400 mt-0.5 leading-snug truncate" title={d.key_factor}>
                                  ⚡ {d.key_factor}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {botData?.bot?.macroSentiment?.updatedAt && (
                        <div className="text-[10px] text-zinc-600 mt-1.5">
                          Updated: {new Date(botData?.bot?.macroSentiment?.updatedAt).toLocaleTimeString()} · Refreshes hourly
                        </div>
                      )}
                    </div>
                  )}

                  {/* Asset Config */}
                  {logic.assetConfig && (
                    <div className="mt-3">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Assets & Macro Bias</h3>
                      <div className="space-y-2">
                        {logic.assetConfig.map((a: any) => (
                          <div key={a.asset} className={`text-xs px-2.5 py-2 rounded-lg border ${
                            a.excluded ? "border-red-500/30 bg-red-500/10" :
                            a.sentiment === "bullish" ? "border-accent-green/20 bg-accent-green/5" :
                            a.sentiment === "bearish" ? "border-accent-red/20 bg-accent-red/5" :
                            "border-zinc-700 bg-zinc-800/50"
                          }`}>
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => postConfig({ action: 'toggleAsset', asset: a.asset, excluded: !a.excluded })}
                                  className={`font-medium ${a.excluded ? 'text-red-400 line-through' : 'text-zinc-200'}`}
                                >
                                  {a.asset} {a.excluded ? '✗' : ''}
                                </button>
                                <span className={`${a.sentiment === 'bullish' ? 'text-accent-green' : a.sentiment === 'bearish' ? 'text-accent-red' : 'text-zinc-500'}`}>
                                  {a.sentiment === 'bullish' ? '📈' : a.sentiment === 'bearish' ? '📉' : '➡️'} {a.sentiment}
                                </span>
                              </div>
                              {!a.excluded && (
                                <div className="flex items-center gap-1">
                                  {(logic.params?.macroWeightSource || 'manual') === 'manual' ? (
                                    <>
                                      <button
                                        onClick={() => postConfig({ action: 'updateAssetWeight', asset: a.asset, weight: Math.max(-0.05, Math.round((a.weight - 0.01) * 100) / 100) })}
                                        className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center"
                                      >-</button>
                                      <span className={`font-mono w-10 text-center ${a.weight > 0 ? 'text-accent-green' : a.weight < 0 ? 'text-accent-red' : 'text-zinc-400'}`}>
                                        {a.weight > 0 ? '+' : ''}{(a.weight * 100).toFixed(0)}%
                                      </span>
                                      <button
                                        onClick={() => postConfig({ action: 'updateAssetWeight', asset: a.asset, weight: Math.min(0.05, Math.round((a.weight + 0.01) * 100) / 100) })}
                                        className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center"
                                      >+</button>
                                      <button
                                        onClick={() => postConfig({ action: 'updateAssetWeight', asset: a.asset, weight: 0 })}
                                        className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400 flex items-center justify-center text-[9px]"
                                      >⊘</button>
                                    </>
                                  ) : (
                                    <span className={`font-mono text-xs ${a.weight > 0 ? 'text-accent-green' : a.weight < 0 ? 'text-accent-red' : 'text-zinc-400'}`}>
                                      {a.weight > 0 ? '+' : ''}{(a.weight * 100).toFixed(1)}% <span className="text-zinc-500 text-[10px]">(engine)</span>
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            {!a.excluded && (
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-[10px] text-zinc-500">Stake multiplier</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => postConfig({ action: 'updateAssetStake', asset: a.asset, multiplier: Math.max(0, Math.round(((a.stakeMultiplier ?? 1.0) - 0.1) * 10) / 10) })}
                                    className="w-4 h-4 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center text-[10px]"
                                  >-</button>
                                  <span className={`font-mono text-[10px] w-8 text-center ${(a.stakeMultiplier ?? 1.0) === 1.0 ? 'text-zinc-400' : (a.stakeMultiplier ?? 1.0) > 1.0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                    {(a.stakeMultiplier ?? 1.0).toFixed(1)}x
                                  </span>
                                  <button
                                    onClick={() => postConfig({ action: 'updateAssetStake', asset: a.asset, multiplier: Math.min(3.0, Math.round(((a.stakeMultiplier ?? 1.0) + 0.1) * 10) / 10) })}
                                    className="w-4 h-4 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center text-[10px]"
                                  >+</button>
                                </div>
                              </div>
                            )}
                            {a.macro && !a.excluded && (logic.params?.macroWeightSource || 'manual') === 'engine' && (
                              <div className="mt-1.5 p-1.5 rounded bg-zinc-800/80 border border-zinc-700/50">
                                <div className="text-[11px] text-zinc-300 leading-snug">
                                  {a.macro.sentimentRaw || a.macro.priceTrend || 'No analysis available'}
                                </div>
                                {a.macro.keyFactor && (
                                  <div className="text-[10px] text-accent-yellow mt-1">
                                    ⚡ {a.macro.keyFactor}
                                  </div>
                                )}
                                {a.macro.confidence !== undefined && (
                                  <div className="text-[10px] text-zinc-500 mt-0.5">
                                    Confidence: {((a.macro.confidence || 0) * 100).toFixed(0)}% · {a.macro.source || 'unknown'}
                                  </div>
                                )}
                              </div>
                            )}
                            {a.macro && !a.excluded && (logic.params?.macroWeightSource || 'manual') === 'manual' && (
                              <div className="text-[10px] text-zinc-500 mt-1 leading-tight">
                                {a.macro.sentimentRaw || a.macro.priceTrend || 'Price-trend fallback (Grok disabled)'}
                                {a.macro.momentum4h !== undefined && <span className="ml-1 text-zinc-600">| 4h: {(a.macro.momentum4h * 100).toFixed(1)}%</span>}
                              </div>
                            )}
                            {!a.macro && !a.excluded && (
                              <div className="text-[10px] text-zinc-500 mt-1">Source: price-trend fallback (Grok disabled)</div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-xs text-zinc-400 font-medium">Weight source:</span>
                        {['manual', 'engine'].map(src => (
                          <button
                            key={src}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); console.log('[macro] switching to', src); postConfig({ action: 'updateParam', key: 'macroWeightSource', value: src }); }}
                            className={`px-4 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                              (logic.params?.macroWeightSource || 'manual') === src
                                ? 'bg-accent-yellow text-black ring-2 ring-yellow-500/50'
                                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white'
                            }`}
                          >{src.charAt(0).toUpperCase() + src.slice(1)}</button>
                        ))}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-1">
                        Manual = you set weights with sliders. Engine = macro bot sets weights automatically.
                        {logic.macroUpdate?.timestamp && <span> Last: {new Date(logic.macroUpdate.timestamp).toLocaleTimeString()}</span>}
                        {logic.macroUpdate?.source && <span> ({logic.macroUpdate.source})</span>}
                      </div>
                    </div>
                  )}
                </div>

                {/* Column 2: Parameters */}
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Parameters</h3>
                  <div className="space-y-2">
                    {[
                      { key: 'minEdge', label: 'Min Edge', scale: 100, min: 1, max: 20 },
                      { key: 'minMarketOdds', label: 'Min Market Odds', scale: 100, min: 20, max: 60 },
                      { key: 'maxConfidence', label: 'Max Confidence', scale: 100, min: 50, max: 95 },
                      { key: 'underdogThreshold', label: 'Underdog Threshold', scale: 100, min: 20, max: 50 },
                      { key: 'path1Confidence', label: 'Path1 Min Conf', scale: 100, min: 40, max: 80 },
                      { key: 'path1Categories', label: 'Path1 Min Cats', scale: 1, min: 1, max: 5, unit: '' },
                      { key: 'path2Confidence', label: 'Path2 Min Conf', scale: 100, min: 40, max: 80 },
                      { key: 'path2Categories', label: 'Path2 Min Cats', scale: 1, min: 1, max: 5, unit: '' },
                      { key: 'path3Confidence', label: 'Path3 Min Conf', scale: 100, min: 50, max: 90 },
                      { key: 'path3Categories', label: 'Path3 Min Cats', scale: 1, min: 1, max: 5, unit: '' },
                      { key: 'srMinConfidence', label: 'S/R Min Conf', scale: 100, min: 30, max: 70 },
                      { key: 'arbMinDiscrepancy', label: 'ARB Min Disc', scale: 100, min: 1, max: 10 },
                      { key: 'arbMinConfidence', label: 'ARB Min Conf', scale: 100, min: 30, max: 70 },
                      { key: 'arbMinPriceMove', label: 'ARB Min Price Move', scale: 1000, min: 1, max: 20, unit: '‰' },
                      { key: 'breakingNewsMinConfidence', label: 'News Min Conf', scale: 100, min: 40, max: 80 },
                      { key: 'breakingNewsMaxOdds', label: 'News Max Odds', scale: 100, min: 50, max: 90 },
                      { key: 'breakingNewsMaxPerHour', label: 'News Max/Hour', scale: 1, min: 1, max: 10, unit: '' },
                      { key: 'breakingNewsCooldownMin', label: 'News Cooldown', scale: 1, min: 5, max: 60, unit: 'min' },
                      { key: 'breakingNewsMinPriceMove', label: 'News Min Price Move', scale: 1000, min: 1, max: 20, unit: '‰' },
                      { key: 'correlationThreshold', label: 'Corr Threshold', scale: 100, min: 1, max: 10 },
                      { key: 'correlationWindow', label: 'Corr Window', scale: 1, min: 1, max: 15, unit: 'min' },
                      { key: 'maxDailyTrades', label: 'Max Daily Trades', scale: 1, min: 5, max: 1000, unit: '' },
                      { key: 'maxConcurrentPositions', label: 'Max Concurrent', scale: 1, min: 5, max: 200, unit: '' },
                      { key: 'maxStakePerTrade', label: 'Max Stake/Trade', scale: 1, min: 5, max: 500, unit: '$' },
                      { key: 'maxDailyLoss', label: 'Max Daily Loss', scale: 1, min: 10, max: 500, unit: '$' },
                      { key: 'macroWeightMultiplier', label: 'Macro Weight ×', scale: 1, min: 0, max: 40, unit: '' },
                      { key: 'macroSpread', label: 'Macro Spread', scale: 100, min: 0, max: 100, unit: '%' },
                    ].map(({ key, label, scale, min, max, unit }) => {
                      const val = logic.params?.[key] !== undefined ? Math.round(logic.params[key] * scale) : 0;
                      return (
                        <div key={key} className="flex items-center justify-between text-xs gap-2">
                          <span className="text-zinc-400 truncate">{label}</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { const nv = Math.max(min, val - 1); if (nv !== val) postConfig({ action: 'updateParam', key, value: nv / scale }); }}
                              className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center"
                            >-</button>
                            <div className="flex items-center gap-0">
                              <input
                                type="number"
                                key={`${key}-${val}`}
                                defaultValue={val}
                                min={min}
                                max={max}
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value);
                                  if (!isNaN(v) && v >= min && v <= max && v !== val) {
                                    postConfig({ action: 'updateParam', key, value: v / scale });
                                  }
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="w-10 bg-transparent text-zinc-200 font-mono text-center border-b border-zinc-600 focus:border-accent-yellow outline-none py-0.5"
                              />
                              <span className="text-zinc-500">{unit !== undefined ? unit : '%'}</span>
                            </div>
                            <button
                              onClick={() => { const nv = Math.min(max, val + 1); if (nv !== val) postConfig({ action: 'updateParam', key, value: nv / scale }); }}
                              className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center"
                            >+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Column 3: Stake Tiers */}
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Confidence → Stake</h3>
                  <div className="space-y-2">
                    {logic.stakeTiers?.map((tier: any, i: number) => (
                      <div key={i} className={`flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg border ${
                        i === 0 ? 'border-accent-green/30 bg-accent-green/10' :
                        i === 1 ? 'border-accent-yellow/30 bg-accent-yellow/10' :
                        i === 2 ? 'border-zinc-500/30 bg-zinc-500/10' :
                        'border-accent-red/30 bg-accent-red/10'
                      }`}>
                        <span className={`font-medium ${
                          i === 0 ? 'text-accent-green' : i === 1 ? 'text-accent-yellow' : i === 2 ? 'text-zinc-300' : 'text-accent-red'
                        }`}>{tier.label}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => postConfig({ action: 'updateStakeTier', index: i, stake: Math.max(1, tier.stake - 5) })}
                            className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center"
                          >-</button>
                          <div className="flex items-center gap-0">
                            <span className="text-zinc-400">$</span>
                            <input
                              type="number"
                              defaultValue={tier.stake}
                              min={1}
                              max={100}
                              onBlur={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val > 0 && val !== tier.stake) {
                                  postConfig({ action: 'updateStakeTier', index: i, stake: val });
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="w-10 bg-transparent text-zinc-200 font-mono text-center border-b border-zinc-600 focus:border-accent-yellow outline-none py-0.5"
                            />
                          </div>
                          <button
                            onClick={() => postConfig({ action: 'updateStakeTier', index: i, stake: tier.stake + 5 })}
                            className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center"
                          >+</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {logic.fairOddsFormula && (
                    <div className="mt-3 pt-3 border-t border-white/[0.05] text-[10px] text-zinc-500">
                      Fair odds: <span className="font-mono text-zinc-400">{logic.fairOddsFormula}</span>
                    </div>
                  )}

                  {/* Path-specific stake overrides */}
                  <div className="mt-3 pt-3 border-t border-white/[0.05]">
                    <PathStakeTiers postConfig={postConfig} defaultTiers={logic.stakeTiers || []} />
                  </div>
                </div>
              </div>
            </GlassCard>
            );
          })()}

          {/* Crypto Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 sm:mb-6">
            <QuickStat icon={LineChart} label="Win Rate" value={cryptoData?.predictions?.stats?.winRate ? `${cryptoData.predictions.stats.winRate}%` : "0%"} color="text-accent-green" index={0} />
            <QuickStat icon={CheckCircle2} label="Correct" value={String(cryptoData?.predictions?.stats?.correct || 0)} color="text-accent-green" index={1} />
            <QuickStat icon={AlertTriangle} label="Wrong" value={String(cryptoData?.predictions?.stats?.wrong || 0)} color="text-accent-red" index={2} />
            <QuickStat icon={Clock} label="Pending" value={String(cryptoData?.predictions?.stats?.pendingCount || 0)} color="text-accent-yellow" index={3} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily Analysis / Predictions */}
            <GlassCard index={0} className="col-span-1">
              <CardHeader icon={Target} title="Active Predictions" badge={`${cryptoData?.predictions?.stats?.pendingCount || 0} pending`} />
              <div className="space-y-3 mt-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                {cryptoData?.predictions?.pending?.map((pred) => (
                  <div key={pred.id} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-sm text-zinc-200">{pred.prediction}</p>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${
                        pred.confidence === "high" ? "bg-accent-green/20 text-accent-green" :
                        pred.confidence === "medium" ? "bg-accent-yellow/20 text-accent-yellow" :
                        "bg-zinc-500/20 text-zinc-400"
                      }`}>{pred.confidence}</span>
                    </div>
                    <p className="text-xs text-zinc-500 mb-2">{pred.reasoning}</p>
                    <div className="flex items-center gap-3 text-[10px] text-zinc-600">
                      <span>📅 {pred.date}</span>
                      <span>⏰ Due: {pred.deadline}</span>
                      <span className="px-1.5 py-0.5 rounded bg-white/[0.04]">{pred.category}</span>
                    </div>
                  </div>
                ))}
                {(!cryptoData?.predictions?.pending || cryptoData.predictions.pending.length === 0) && (
                  <p className="text-xs text-zinc-500 text-center py-4">No pending predictions</p>
                )}
              </div>
            </GlassCard>

            {/* Bot Status Card */}
            <GlassCard index={1} className="col-span-1">
              <CardHeader icon={Zap} title="Bot Configuration" badge={botData?.bot?.status === "error" ? "🔴 ERROR" : botData?.bot?.status === "running" ? "🟢 LIVE" : "⚫ OFF"} />
              <div className="mt-3">
                {/* Last Run Info */}
                <div className="bg-white/[0.02] rounded-lg p-3 mb-4 border border-white/[0.03]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Last Run</span>
                    {botData?.bot?.lastStatus && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        botData.bot.lastStatus === "ok" ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-accent-red"
                      }`}>{botData.bot.lastStatus}</span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-200 font-medium">
                    {botData?.bot?.lastRun 
                      ? new Date(botData.bot.lastRun).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                      : '-'}
                  </div>
                  {botData?.bot?.lastDuration && (
                    <div className="text-[10px] text-zinc-500 mt-1">Duration: {botData.bot.lastDuration}</div>
                  )}
                  {botData?.bot?.nextRun && (
                    <div className="text-[10px] text-zinc-400 mt-1">
                      Next: {new Date(botData.bot.nextRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>

                {/* Current Mode */}
                {botData?.bot?.logic?.currentMode && (
                  <div className="bg-accent-amber/10 border border-accent-amber/20 rounded-lg px-3 py-2 mb-4">
                    <span className="text-[10px] text-accent-amber">{botData.bot.logic.currentMode}</span>
                  </div>
                )}

                {/* Decision Paths */}
                <div className="mb-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Decision Paths</div>
                  <div className="space-y-1">
                    {botData?.bot?.logic?.decisionPaths?.map((path: any, i: number) => (
                      <div key={i} className="flex justify-between text-[11px] py-1 border-b border-white/[0.02] last:border-0">
                        <span className="text-zinc-400">{path.name}</span>
                        <span className="text-zinc-300 text-right">{path.requirement}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Signal Categories */}
                <div className="mb-4">
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Signal Categories</div>
                  <div className="flex flex-wrap gap-1.5">
                    {botData?.bot?.logic?.signalCategories?.map((cat: any, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-1 bg-white/[0.03] rounded text-zinc-400" title={cat.description}>
                        {cat.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Safety Rails */}
                <div>
                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Safety Rails</div>
                  <div className="space-y-1">
                    {botData?.bot?.logic?.safetyRails?.map((rail: any, i: number) => (
                      <div key={i} className="flex justify-between text-[10px]">
                        <span className="text-zinc-500">{rail.rule}</span>
                        <span className="text-zinc-400">{rail.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* Resolved Predictions */}
            <GlassCard index={2} className="col-span-1 lg:col-span-2">
              <CardHeader icon={CheckCircle2} title="Resolved Predictions" badge={`${cryptoData?.predictions?.stats?.resolved || 0} total`} />
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto custom-scrollbar">
                {cryptoData?.predictions?.resolved?.slice(-8).reverse().map((pred) => (
                  <div key={pred.id} className={`p-2 rounded-lg border ${
                    pred.result === "correct" ? "bg-accent-green/5 border-accent-green/20" :
                    "bg-accent-red/5 border-accent-red/20"
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-zinc-300">{pred.prediction}</p>
                      <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${
                        pred.result === "correct" ? "bg-accent-green/20 text-accent-green" : "bg-accent-red/20 text-accent-red"
                      }`}>{pred.result === "correct" ? "✓" : "✗"}</span>
                    </div>
                  </div>
                ))}
                {(!cryptoData?.predictions?.resolved || cryptoData.predictions.resolved.length === 0) && (
                  <p className="text-xs text-zinc-500 text-center py-4 col-span-2">No resolved predictions yet</p>
                )}
              </div>
            </GlassCard>
          </div>
        </>
      ) : (
        /* Audit Tab Content */
        <AuditTabContent />
      )}
    </PageWrapper>
  );
}

// ─── Audit Tab ─────────────────────────────────────────────────────────────

interface AuditFinding {
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
  findings: AuditFinding[];
}

const SEV_STYLE: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  high: { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  medium: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  low: { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  info: { color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" },
};

const CAT_STYLE: Record<string, { label: string; color: string }> = {
  performance: { label: "Performance", color: "text-blue-400" },
  reliability: { label: "Reliability", color: "text-red-400" },
  "new-opportunity": { label: "New Opportunities", color: "text-green-400" },
  risk: { label: "Risk", color: "text-orange-400" },
  optimization: { label: "Optimization", color: "text-purple-400" },
};

function PathStakeTiers({ postConfig, defaultTiers }: { postConfig: (body: any) => void; defaultTiers: any[] }) {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const { data: config, refresh: refreshConfig } = useApi<any>('/api/trading-config', { refreshInterval: REFRESH_INTERVAL });
  // Wrap postConfig to also refresh our local config
  const post = async (body: any) => {
    await postConfig(body);
    setTimeout(() => refreshConfig(), 300);
  };
  const groups = [
    { key: 'path1', label: 'Path 1' },
    { key: 'path2', label: 'Path 2' },
    { key: 'path3', label: 'Path 3' },
    { key: 'sr', label: '🏗️ S/R' },
    { key: 'arb', label: '🎰 Arb' },
    { key: 'breakingNews', label: '⚡ News' },
    { key: 'macro', label: '📅 Macro' },
    { key: 'trend', label: '📈 Trend' },
    { key: 'copy', label: '🔄 Copy' },
    { key: 'adaptive', label: '🧠 Adaptive' },
    { key: 'close', label: '🔒 Close' },
  ];

  const pathTiers = config?.pathStakeTiers || {};
  const activeTiers = selectedGroup ? (pathTiers[selectedGroup] || null) : null;
  const displayTiers = activeTiers || defaultTiers || [];
  const isCustom = selectedGroup && !!pathTiers[selectedGroup];

  return (
    <div>
      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Per-Path Stakes</h4>
      <div className="flex flex-wrap gap-1 mb-2">
        {groups.map(g => (
          <button
            key={g.key}
            onClick={() => setSelectedGroup(selectedGroup === g.key ? null : g.key)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              selectedGroup === g.key
                ? pathTiers[g.key] ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30' : 'bg-white/10 text-zinc-200 border border-zinc-500/30'
                : pathTiers[g.key] ? 'text-accent-blue/70 border border-transparent' : 'text-zinc-600 border border-transparent hover:text-zinc-400'
            }`}
          >
            {g.label}{pathTiers[g.key] ? ' ✦' : ''}
          </button>
        ))}
      </div>
      {selectedGroup && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-zinc-500">{isCustom ? 'Custom stakes' : 'Using default stakes'}</span>
            {isCustom && (
              <button
                onClick={() => post({ action: 'clearPathStakeTier', group: selectedGroup })}
                className="text-[9px] text-accent-red/70 hover:text-accent-red"
              >Reset to default</button>
            )}
          </div>
          {displayTiers.map((tier: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-zinc-800/50">
              <span className="text-zinc-400">{tier.label}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => post({ action: 'updatePathStakeTier', group: selectedGroup, index: i, stake: Math.max(1, (tier.stake || 5) - 5) })}
                  className="w-4 h-4 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center text-[10px]"
                >-</button>
                <span className="text-zinc-300 font-mono w-8 text-center">${tier.stake || 5}</span>
                <button
                  onClick={() => post({ action: 'updatePathStakeTier', group: selectedGroup, index: i, stake: (tier.stake || 5) + 5 })}
                  className="w-4 h-4 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 flex items-center justify-center text-[10px]"
                >+</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditTabContent() {
  const { data, loading } = useApi<AuditData>("/api/audit", { refreshInterval: REFRESH_INTERVAL });
  const [expandedEvidence, setExpandedEvidence] = useState<Record<number, boolean>>({});

  if (loading && !data) return <GridSkeleton />;

  const findings = data?.findings || [];
  const healthScore = data?.healthScore ?? 0;
  const scoreColor = healthScore >= 80 ? "text-green-400" : healthScore >= 60 ? "text-yellow-400" : healthScore >= 40 ? "text-orange-400" : "text-red-400";
  const scoreBg = healthScore >= 80 ? "bg-green-500/10" : healthScore >= 60 ? "bg-yellow-500/10" : healthScore >= 40 ? "bg-orange-500/10" : "bg-red-500/10";

  const categories = ["performance", "optimization", "new-opportunity", "reliability", "risk"];

  return (
    <>
      {/* Top Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <GlassCard className="p-4">
          <div className={`flex items-center gap-3 p-3 rounded-xl ${scoreBg}`}>
            <div className={`text-3xl font-bold ${scoreColor}`}>{healthScore}</div>
            <div className="text-xs text-zinc-400">
              <div className={`font-medium ${scoreColor}`}>
                {healthScore >= 80 ? "Healthy" : healthScore >= 60 ? "Fair" : healthScore >= 40 ? "Degraded" : "Critical"}
              </div>
              <div>Health Score</div>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-zinc-500 mb-1">Trades Analyzed</div>
          <div className="text-2xl font-bold text-zinc-200">{data?.tradesAnalyzed || 0}</div>
          <div className="flex gap-2 mt-2 text-xs">
            {data?.overallWinRate != null && <span className="text-green-400">{(data.overallWinRate * 100).toFixed(1)}% WR</span>}
            {data?.overallPnl != null && <span className={data.overallPnl >= 0 ? "text-green-400" : "text-red-400"}>{data.overallPnl >= 0 ? "+" : ""}${data.overallPnl.toFixed(2)}</span>}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-zinc-500 mb-1">Findings</div>
          <div className="text-2xl font-bold text-zinc-200">{data?.totalFindings || 0}</div>
          <div className="flex gap-2 mt-2 text-xs flex-wrap">
            {data?.bySeverity?.critical ? <span className="text-red-400">{data.bySeverity.critical} critical</span> : null}
            {data?.bySeverity?.high ? <span className="text-orange-400">{data.bySeverity.high} high</span> : null}
            {data?.bySeverity?.medium ? <span className="text-yellow-400">{data.bySeverity.medium} medium</span> : null}
          </div>
        </GlassCard>
        <GlassCard className="p-4">
          <div className="text-xs text-zinc-500 mb-1">Last Audit</div>
          <div className="flex items-center gap-2 mt-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span className="text-sm text-zinc-300">{data?.timestamp ? formatRelativeTime(data.timestamp) : "Never"}</span>
          </div>
        </GlassCard>
      </div>

      {/* Findings by Category */}
      {categories.map(cat => {
        const catFindings = findings.filter(f => f.category === cat);
        if (catFindings.length === 0) return null;
        const cfg = CAT_STYLE[cat] || { label: cat, color: "text-zinc-400" };
        return (
          <div key={cat} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h2 className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</h2>
              <span className="text-xs text-zinc-500">({catFindings.length})</span>
            </div>
            <div className="space-y-2">
              {catFindings.map((f, i) => {
                const sev = SEV_STYLE[f.severity] || SEV_STYLE.info;
                const globalIdx = findings.indexOf(f);
                return (
                  <GlassCard key={i} className={`p-3 border ${sev.bg}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${sev.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                          <button
                            onClick={() => setExpandedEvidence(prev => ({ ...prev, [globalIdx]: !prev[globalIdx] }))}
                            className="text-xs text-zinc-600 mt-1 hover:text-zinc-400 transition-colors"
                          >
                            📊 {expandedEvidence[globalIdx] ? 'Hide' : 'Show'} evidence
                          </button>
                        )}
                        {f.evidence && expandedEvidence[globalIdx] && (
                          <pre className="mt-1 ml-4 whitespace-pre-wrap text-zinc-500 font-mono text-[10px]">{f.evidence}</pre>
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
          <div className="text-zinc-400">No audit findings yet. Auditor runs automatically.</div>
        </GlassCard>
      )}
    </>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
  color,
  index,
}: {
  icon: typeof Server;
  label: string;
  value: string;
  color: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass-card p-3 sm:p-4"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-lg sm:text-xl font-semibold text-zinc-100">{value}</span>
    </motion.div>
  );
}

function CardHeader({
  icon: Icon,
  title,
  badge,
}: {
  icon: typeof Server;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-zinc-500" />
        <h3 className="text-xs font-medium text-zinc-300 uppercase tracking-wider">{title}</h3>
      </div>
      {badge && (
        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] text-zinc-500">
          {badge}
        </span>
      )}
    </div>
  );
}
