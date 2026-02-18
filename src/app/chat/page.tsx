"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { TabBar, useActiveTab } from "@/components/ui/TabBar";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { useApi } from "@/hooks/use-api";
import { motion } from "framer-motion";
import {
  MessageSquare, Send, Mic, MicOff, Terminal,
  Hash, ArrowRight, Bot, User,
} from "lucide-react";

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "command", label: "Command" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

function ChatContent() {
  const activeTab = useActiveTab(TABS, "chat");

  return (
    <PageWrapper title="Chat" subtitle="Communicate with your agent">
      <TabBar tabs={TABS} defaultTab="chat" layoutId="chat-tab" />
      {activeTab === "chat" && <ChatTab />}
      {activeTab === "command" && <CommandTab />}
    </PageWrapper>
  );
}

function ChatTab() {
  const { data: sessionData } = useApi<{
    sessions: Array<{ id: string; title: string; lastMessage: string; timestamp: string; messageCount: number; channel: string }>;
  }>("/api/chat-history");

  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, sessionId: selectedSession }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: "err", role: "assistant", content: "Failed to send message.", timestamp: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  };

  const toggleVoice = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    setIsListening(!isListening);
    // Web Speech API integration would go here
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-200px)] min-h-[400px]">
      {/* Session Sidebar */}
      <div className="w-64 shrink-0 hidden md:block">
        <div className="glass-card p-2 h-full overflow-y-auto">
          <h3 className="text-[10px] uppercase tracking-wider text-zinc-500 p-2 mb-1">Sessions</h3>
          {sessionData?.sessions?.map((session) => (
            <button
              key={session.id}
              onClick={() => setSelectedSession(session.id)}
              className={`w-full text-left p-2.5 rounded-lg mb-1 transition-colors ${
                selectedSession === session.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Hash className="w-3 h-3 text-zinc-500" />
                <span className="text-xs font-medium text-zinc-300 truncate">{session.title}</span>
              </div>
              <p className="text-[10px] text-zinc-500 truncate ml-5">{session.lastMessage}</p>
              <div className="flex items-center gap-2 mt-1 ml-5">
                <span className="text-[9px] text-zinc-600">{session.messageCount} msgs</span>
                <span className="text-[9px] text-zinc-600">{session.channel}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No messages yet"
              description="Start a conversation with your agent"
            />
          ) : (
            messages.map((msg, i) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary-400" />
                  </div>
                )}
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs ${
                  msg.role === "user"
                    ? "bg-primary/20 text-zinc-200 rounded-br-md"
                    : "bg-white/[0.04] text-zinc-300 rounded-bl-md"
                }`}>
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="w-6 h-6 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                )}
              </motion.div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleVoice}
              className={`p-2 rounded-lg transition-colors ${
                isListening ? "bg-accent-red/10 text-accent-red" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-primary/30 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="p-2.5 rounded-xl bg-primary/20 text-primary-400 hover:bg-primary/30 transition-colors disabled:opacity-30"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommandTab() {
  const [command, setCommand] = useState("");
  const [history, setHistory] = useState<Array<{ cmd: string; result: string; time: string }>>([]);

  const executeCommand = async () => {
    if (!command.trim()) return;
    const cmd = command;
    setCommand("");

    // Simulated command execution
    const result = `Command "${cmd}" received. Agent command interface not yet connected.`;
    setHistory((prev) => [...prev, { cmd, result, time: new Date().toISOString() }]);
  };

  return (
    <div className="glass-card h-[calc(100vh-200px)] min-h-[400px] flex flex-col overflow-hidden">
      {/* Output */}
      <div className="flex-1 overflow-y-auto p-4 font-mono">
        <p className="text-[10px] text-zinc-600 mb-4">OpenClaw Command Interface v1.0</p>
        {history.map((entry, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3"
          >
            <div className="flex items-center gap-2 text-xs">
              <ArrowRight className="w-3 h-3 text-primary-400" />
              <span className="text-primary-300">{entry.cmd}</span>
            </div>
            <pre className="text-[11px] text-zinc-400 ml-5 mt-1 whitespace-pre-wrap">{entry.result}</pre>
          </motion.div>
        ))}
        {history.length === 0 && (
          <EmptyState icon={Terminal} title="No commands yet" description="Type a command below" />
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-primary-400" />
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && executeCommand()}
            placeholder="Enter command..."
            className="flex-1 bg-transparent text-xs text-zinc-200 placeholder-zinc-600 outline-none font-mono"
          />
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<PageWrapper title="Chat"><div /></PageWrapper>}>
      <ChatContent />
    </Suspense>
  );
}
