"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { ReactNode } from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  children: ReactNode;
  className?: string;
  index?: number;
  hover?: boolean;
  padding?: "sm" | "md" | "lg";
}

export function GlassCard({
  children,
  className = "",
  index = 0,
  hover = true,
  padding = "md",
  ...props
}: GlassCardProps) {
  const paddings = { sm: "p-3", md: "p-4 sm:p-5", lg: "p-5 sm:p-6" };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        delay: index * 0.05,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      whileHover={hover ? { y: -2, transition: { duration: 0.2 } } : undefined}
      className={`glass-card ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}
