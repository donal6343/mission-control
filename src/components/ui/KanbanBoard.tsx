"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  items: KanbanItem[];
}

interface KanbanItem {
  id: string;
  title: string;
  subtitle?: string;
  tags?: string[];
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  renderItem?: (item: KanbanItem, index: number) => ReactNode;
}

export function KanbanBoard({ columns, renderItem }: KanbanBoardProps) {
  return (
    <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-4 -mx-3 px-3 sm:-mx-0 sm:px-0">
      {columns.map((col) => (
        <div key={col.id} className="min-w-[260px] sm:min-w-[280px] flex-1">
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
            <span className="text-xs font-medium text-zinc-300">{col.title}</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{col.items.length}</span>
          </div>
          <div className="space-y-2">
            {col.items.map((item, i) =>
              renderItem ? (
                renderItem(item, i)
              ) : (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-3 cursor-pointer hover:bg-white/[0.05] transition-colors"
                >
                  <p className="text-xs font-medium text-zinc-200 mb-1">{item.title}</p>
                  {item.subtitle && (
                    <p className="text-[11px] text-zinc-500 line-clamp-2">{item.subtitle}</p>
                  )}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-zinc-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
