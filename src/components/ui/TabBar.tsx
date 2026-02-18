"use client";

import { motion } from "framer-motion";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

interface Tab {
  id: string;
  label: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  defaultTab?: string;
  layoutId?: string;
}

export function TabBar({ tabs, defaultTab, layoutId = "tab" }: TabBarProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = searchParams.get("tab") || defaultTab || tabs[0]?.id;

  const setTab = useCallback(
    (tabId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tabId === (defaultTab || tabs[0]?.id)) {
        params.delete("tab");
      } else {
        params.set("tab", tabId);
      }
      const qs = params.toString();
      router.push(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname, defaultTab, tabs]
  );

  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.04] mb-4 sm:mb-6 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setTab(tab.id)}
          className={`relative px-3 sm:px-4 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            activeTab === tab.id ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId={layoutId}
              className="absolute inset-0 bg-white/[0.06] rounded-lg"
              transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {tab.label}
            {tab.count !== undefined && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-zinc-400">
                {tab.count}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function useActiveTab(tabs: { id: string }[], defaultTab?: string): string {
  const searchParams = useSearchParams();
  return searchParams.get("tab") || defaultTab || tabs[0]?.id || "";
}
