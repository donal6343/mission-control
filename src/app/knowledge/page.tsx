"use client";

import { Suspense, useState } from "react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TabBar, useActiveTab } from "@/components/ui/TabBar";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Search, BookOpen, FileText, Folder,
  Globe, ExternalLink, Package, ArrowRight,
} from "lucide-react";

const TABS = [
  { id: "knowledge", label: "Knowledge" },
  { id: "ecosystem", label: "Ecosystem" },
];

const KNOWLEDGE_ITEMS = [
  { id: "k1", title: "SOUL.md", type: "file", path: "SOUL.md", category: "Identity" },
  { id: "k2", title: "AGENTS.md", type: "file", path: "AGENTS.md", category: "Configuration" },
  { id: "k3", title: "TOOLS.md", type: "file", path: "TOOLS.md", category: "Configuration" },
  { id: "k4", title: "MEMORY.md", type: "file", path: "MEMORY.md", category: "Memory" },
  { id: "k5", title: "Daily Notes", type: "folder", path: "memory/", category: "Memory" },
  { id: "k6", title: "Skills", type: "folder", path: "skills/", category: "Capabilities" },
  { id: "k7", title: "State", type: "folder", path: "state/", category: "Runtime" },
  { id: "k8", title: "Content Queue", type: "file", path: "content/queue.md", category: "Content" },
];

const ECOSYSTEM_PRODUCTS = [
  {
    slug: "trueshot",
    name: "Trueshot",
    description: "Photo authenticity platform with blockchain proof",
    status: "beta",
    tech: ["React Native", "Base", "NFT"],
    color: "#22c55e",
  },
  {
    slug: "openclaw",
    name: "OpenClaw",
    description: "AI agent infrastructure platform",
    status: "active",
    tech: ["Node.js", "TypeScript", "Claude"],
    color: "#6366f1",
  },
  {
    slug: "mission-control",
    name: "Mission Control",
    description: "Real-time agent management dashboard",
    status: "development",
    tech: ["Next.js", "Convex", "Tailwind"],
    color: "#06b6d4",
  },
];

function KnowledgeContent() {
  const activeTab = useActiveTab(TABS, "knowledge");

  return (
    <PageWrapper title="Knowledge" subtitle="Knowledge base & ecosystem products">
      <TabBar tabs={TABS} defaultTab="knowledge" layoutId="knowledge-tab" />
      {activeTab === "knowledge" && <KnowledgeTab />}
      {activeTab === "ecosystem" && <EcosystemTab />}
    </PageWrapper>
  );
}

function KnowledgeTab() {
  const [search, setSearch] = useState("");
  const filtered = KNOWLEDGE_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.category.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(filtered.map((i) => i.category))];

  return (
    <div>
      {/* Search */}
      <div className="glass-card p-1 mb-4 flex items-center gap-2">
        <Search className="w-4 h-4 text-zinc-500 ml-3" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search knowledge base..."
          className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none py-2.5"
        />
      </div>

      {/* Categories */}
      {categories.map((cat) => (
        <div key={cat} className="mb-4">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 px-1">{cat}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {filtered
              .filter((i) => i.category === cat)
              .map((item, i) => (
                <GlassCard key={item.id} index={i} padding="sm" className="cursor-pointer group">
                  <div className="flex items-center gap-2.5">
                    {item.type === "file" ? (
                      <FileText className="w-4 h-4 text-zinc-500 group-hover:text-primary-400 transition-colors" />
                    ) : (
                      <Folder className="w-4 h-4 text-zinc-500 group-hover:text-primary-400 transition-colors" />
                    )}
                    <div>
                      <p className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-zinc-600">{item.path}</p>
                    </div>
                  </div>
                </GlassCard>
              ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <EmptyState icon={Search} title="No results" description={`No files matching "${search}"`} />
      )}
    </div>
  );
}

function EcosystemTab() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {ECOSYSTEM_PRODUCTS.map((product, i) => (
        <Link key={product.slug} href={`/ecosystem/${product.slug}`}>
          <GlassCard index={i} className="group cursor-pointer h-full">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${product.color}15` }}>
                <Package className="w-5 h-5" style={{ color: product.color }} />
              </div>
              <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium uppercase ${
                product.status === "active" ? "bg-accent-green/10 text-accent-green" :
                product.status === "beta" ? "bg-accent-yellow/10 text-accent-yellow" :
                "bg-white/[0.04] text-zinc-500"
              }`}>
                {product.status}
              </span>
            </div>
            <h3 className="text-sm font-medium text-zinc-200 mb-1 group-hover:text-zinc-100 transition-colors">
              {product.name}
            </h3>
            <p className="text-[11px] text-zinc-500 mb-3 line-clamp-2">{product.description}</p>
            <div className="flex flex-wrap gap-1">
              {product.tech.map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-500">
                  {t}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1 mt-3 text-[10px] text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">
              View details <ArrowRight className="w-3 h-3" />
            </div>
          </GlassCard>
        </Link>
      ))}
    </div>
  );
}

export default function KnowledgePage() {
  return (
    <Suspense fallback={<PageWrapper title="Knowledge"><div /></PageWrapper>}>
      <KnowledgeContent />
    </Suspense>
  );
}
