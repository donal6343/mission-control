"use client";

import { motion } from "framer-motion";
import { Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center py-12 sm:py-16"
    >
      <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-zinc-600" />
      </div>
      <h3 className="text-sm font-medium text-zinc-400 mb-1">{title}</h3>
      {description && <p className="text-xs text-zinc-600 max-w-xs text-center">{description}</p>}
    </motion.div>
  );
}
