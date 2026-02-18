import {
  Home, Settings, Bot, MessageSquare, FileText,
  Radio, BookOpen, Code2,
} from "lucide-react";

export const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Ops", href: "/ops", icon: Settings },
  { label: "Agents", href: "/agents", icon: Bot },
  { label: "Chat", href: "/chat", icon: MessageSquare },
  { label: "Content", href: "/content", icon: FileText },
  { label: "Comms", href: "/comms", icon: Radio },
  { label: "Knowledge", href: "/knowledge", icon: BookOpen },
  { label: "Code", href: "/code", icon: Code2 },
] as const;

export const WORKSPACE_PATH = process.env.WORKSPACE_PATH || `${process.env.HOME}/.openclaw/workspace`;
export const REFRESH_INTERVAL = 15000;
