"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { NAV_ITEMS } from "@/lib/constants";
import { Activity } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="glass-nav sticky top-0 z-50 px-2 sm:px-4">
      <div className="max-w-[1600px] mx-auto flex items-center h-12 gap-0.5 sm:gap-1 overflow-x-auto">
        <Link href="/" className="flex items-center gap-2 mr-2 sm:mr-4 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary-400" />
          </div>
          <span className="font-semibold text-xs sm:text-sm hidden sm:block text-zinc-200">
            Mission Control
          </span>
        </Link>

        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative shrink-0"
            >
              <motion.div
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors ${
                  isActive
                    ? "text-primary-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute inset-0 bg-primary/[0.08] rounded-lg"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10 hidden xs:inline" style={{ fontSize: "clamp(9px, 1.2vw, 12px)" }}>
                  {item.label}
                </span>
              </motion.div>
            </Link>
          );
        })}

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <LiveIndicator />
        </div>
      </div>
    </nav>
  );
}

function LiveIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-green/10 border border-accent-green/20">
      <div className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse-slow" />
      <span className="text-[10px] text-accent-green font-medium">LIVE</span>
    </div>
  );
}
