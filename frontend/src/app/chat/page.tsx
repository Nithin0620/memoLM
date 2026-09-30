"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Send,
  Sparkles,
  Zap,
  RefreshCw,
  Sliders,
  Database,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Clock,
  DollarSign,
  Layers,
  ArrowLeft,
  Trash2,
  Cpu,
  CornerDownLeft,
  Search,
  Activity,
} from "lucide-react";
import { MemoLM, ChatCompletion, ChatCompletionChunk } from "@memolm/sdk";
import { ColdStartWarning } from "@/components/ColdStartWarning";

interface MessageItem {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: {
    hitType?: string;
    similarity?: number;
    latencyMs?: number;
    costUsd?: number;
    safetyVerdict?: string;
    matchedQuery?: string;
    isStreaming?: boolean;
  };
}

const PRESET_PROMPTS = [
  "What is the capital of France?",
  "What is the capital of France? Explain in detail.",
  "Write a Python function to compute Fibonacci numbers.",
  "How does semantic caching work in LLMs?",
  "What is MemoLM and how does it prevent data leaks?",
];

export default function ChatPlaygroundPage() {
  // Config state
  const [gatewayUrl, setGatewayUrl] = useState("https://memolm.onrender.com");
  const [apiKey, setApiKey] = useState("");
  const [tenantId, setTenantId] = useState("default-tenant");
  const [knowledgeVersion, setKnowledgeVersion] = useState("v1.0");
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("low");
  const [model, setModel] = useState("openai/gpt-oss-20b");
  const [isStreaming, setIsStreaming] = useState(true);
  const [forceRefresh, setForceRefresh] = useState(false);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.85);

  // Status & Metrics state
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    totalRequests: 0,
    cacheHits: 0,
    exactHits: 0,
    semanticHits: 0,
    llmCalls: 0,
    tokensSaved: 0,
    costSavedUsd: 0,
    latencySavedMs: 0,
  });

  // Chat state
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<MessageItem[]>([
    {
      id: "intro-1",
      role: "assistant",
      content:
        "👋 Welcome to the **MemoLM Realtime Chat Playground**!\n\nThis interface directly uses the **`@memolm/sdk`** TypeScript SDK in your browser. Ask any question twice (or rephrased) to test exact and semantic cache hits in real time!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Gateway health check
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch(`${gatewayUrl}/openapi.json`, {
          method: "HEAD",
          signal: AbortSignal.timeout(2000),
        });
        setGatewayOnline(res.ok);
      } catch {
        setGatewayOnline(false);
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => clearInterval(interval);
  }, [gatewayUrl]);

  // Handle Send
  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || isLoading) return;

    if (!customPrompt) {
      setInput("");
    }

    const userMessage: MessageItem = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setIsLoading(true);

    // Prepare assistant placeholder
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: MessageItem = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      metadata: {
        isStreaming: true,
      },
    };
    setMessages((prev) => [...prev, assistantPlaceholder]);

    const startTime = performance.now();

    try {
      // Initialize @memolm/sdk Client
      const client = new MemoLM({
        baseURL: gatewayUrl,
        apiKey: apiKey || undefined,
        defaultTenant: tenantId || "default-tenant",
        defaultKnowledgeVersion: knowledgeVersion || "v1.0",
        defaultRisk: riskLevel,
      });

      // Filter conversation history for the API call (exclude intro message)
      const chatMessages = newHistory
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      if (isStreaming) {
        // STREAMING VIA SDK
        const stream = (await client.chat.completions.create({
          model: model || "openai/gpt-oss-20b",
          messages: chatMessages,
          stream: true,
          tenantId: tenantId,
          knowledgeVersion: knowledgeVersion,
          risk: riskLevel,
          forceRefresh: forceRefresh,
          similarityThreshold: similarityThreshold,
        })) as AsyncGenerator<ChatCompletionChunk, void, unknown>;

        let accumulatedContent = "";
        let finalMetadata: any = null;

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          accumulatedContent += delta;

          if (chunk._memolm) {
            finalMetadata = chunk._memolm;
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    content: accumulatedContent,
                    metadata: {
                      ...msg.metadata,
                      ...(finalMetadata
                        ? {
                            hitType: finalMetadata.hitType,
                            similarity: finalMetadata.similarity,
                            latencyMs: finalMetadata.latencyMs,
                            costUsd: finalMetadata.estimatedCostUsd,
                            safetyVerdict: finalMetadata.safetyVerdict,
                            matchedQuery: finalMetadata.matchedQuery,
                          }
                        : {}),
                    },
                  }
                : msg
            )
          );
        }

        const elapsedMs = performance.now() - startTime;
        const hitType = finalMetadata?.hitType || "LLM_CALL";

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  metadata: {
                    ...msg.metadata,
                    isStreaming: false,
                    latencyMs: finalMetadata?.latencyMs || elapsedMs,
                    hitType: hitType,
                    similarity: finalMetadata?.similarity ?? (hitType.includes("CACHE") ? 1.0 : 0.0),
                    costUsd: finalMetadata?.estimatedCostUsd || (hitType.includes("CACHE") ? 0 : 0.002),
                  },
                }
              : msg
          )
        );

        // Update session metrics
        updateMetrics(hitType, elapsedMs);
      } else {
        // NON-STREAMING VIA SDK
        const res = (await client.chat.completions.create({
          model: model || "openai/gpt-oss-20b",
          messages: chatMessages,
          stream: false,
          tenantId: tenantId,
          knowledgeVersion: knowledgeVersion,
          risk: riskLevel,
          forceRefresh: forceRefresh,
          similarityThreshold: similarityThreshold,
        })) as ChatCompletion;

        const content = res.choices[0]?.message?.content || "";
        const meta = res._memolm;
        const elapsedMs = performance.now() - startTime;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: content,
                  metadata: {
                    isStreaming: false,
                    hitType: meta?.hitType || "LLM_CALL",
                    similarity: meta?.similarity,
                    latencyMs: meta?.latencyMs || elapsedMs,
                    costUsd: meta?.estimatedCostUsd || 0,
                    safetyVerdict: meta?.safetyVerdict,
                    matchedQuery: meta?.matchedQuery,
                  },
                }
              : msg
          )
        );

        // Update session metrics
        updateMetrics(meta?.hitType || "LLM_CALL", elapsedMs);
      }
    } catch (err: any) {
      console.error("Chat Error:", err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                content: `⚠️ **Error communicating with MemoLM Gateway:**\n\`\`\`\n${err?.message || err}\n\`\`\`\nPlease check that your backend server is running at \`${gatewayUrl}\`.`,
                metadata: {
                  isStreaming: false,
                  hitType: "ERROR",
                  safetyVerdict: "REJECTED",
                },
              }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const updateMetrics = (hitType: string, latencyMs: number) => {
    setSessionStats((prev) => {
      const isExact = hitType === "EXACT_CACHE_HIT";
      const isSemantic = hitType === "SEMANTIC_CACHE_HIT";
      const isHit = isExact || isSemantic;

      const newTotal = prev.totalRequests + 1;
      const newHits = prev.cacheHits + (isHit ? 1 : 0);
      const newExact = prev.exactHits + (isExact ? 1 : 0);
      const newSemantic = prev.semanticHits + (isSemantic ? 1 : 0);
      const newLlm = prev.llmCalls + (isHit ? 0 : 1);
      const tokensSaved = prev.tokensSaved + (isHit ? 350 : 0);
      const costSavedUsd = prev.costSavedUsd + (isHit ? 0.0035 : 0);
      const latencySavedMs = prev.latencySavedMs + (isHit ? Math.max(0, 1200 - latencyMs) : 0);

      return {
        totalRequests: newTotal,
        cacheHits: newHits,
        exactHits: newExact,
        semanticHits: newSemantic,
        llmCalls: newLlm,
        tokensSaved,
        costSavedUsd,
        latencySavedMs,
      };
    });
  };

  // Invalidate Cache Handler
  const handleInvalidate = async () => {
    try {
      const client = new MemoLM({ baseURL: gatewayUrl, apiKey: apiKey || undefined });
      const res = await client.cache.invalidate({
        tenantId: tenantId || undefined,
        version: knowledgeVersion || undefined,
      });
      alert(`✅ Cache Invalidated!\nEntries purged: ${res.deleted_count ?? "All matching"}`);
    } catch (err: any) {
      alert(`⚠️ Cache Invalidation Failed: ${err.message}`);
    }
  };

  // Clear Chat
  const handleClearChat = () => {
    setMessages([
      {
        id: "intro-reset",
        role: "assistant",
        content: "🧹 Conversation cleared. Ask a new question to test the cache!",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  return (
    <div className="flex flex-col h-screen bg-[#060709] text-zinc-100 font-sans overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-white/[0.08] bg-[#090b0e]/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors py-1 px-2 rounded-md hover:bg-white/[0.05]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Home</span>
          </Link>
          <div className="h-4 w-px bg-white/[0.1]" />
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-indigo-500/30 bg-indigo-500/10">
              <Shield className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            <span className="font-mono font-bold text-sm text-white">memoLM</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              TS SDK Playground
            </span>
          </div>
        </div>

        {/* Status indicator & Settings button */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-xs font-mono">
            <span
              className={`h-2 w-2 rounded-full ${
                gatewayOnline === true
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                  : "bg-rose-400"
              }`}
            />
            <span className="text-zinc-300">
              {gatewayOnline === true ? "Gateway Connected" : "Gateway Offline"}
            </span>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg border transition-all ${
              showSettings
                ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white hover:border-white/[0.2]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>SDK Config</span>
          </button>

          <button
            onClick={handleClearChat}
            title="Clear Chat"
            className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-lg transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main App Grid */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Chat Conversation Column */}
        <main className="flex-1 flex flex-col min-w-0 bg-gradient-to-b from-[#060709] to-[#040507]">
          {/* Metrics Ribbon */}
          <div className="border-b border-white/[0.06] bg-black/30 px-4 py-2 flex items-center justify-between text-xs font-mono shrink-0 overflow-x-auto gap-4">
            <div className="flex items-center gap-6 text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                <span>Requests:</span>
                <span className="text-white font-semibold">{sessionStats.totalRequests}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cache Hit Rate:</span>
                <span className="text-emerald-400 font-semibold">
                  {sessionStats.totalRequests > 0
                    ? `${Math.round((sessionStats.cacheHits / sessionStats.totalRequests) * 100)}%`
                    : "0%"}
                </span>
                <span className="text-[10px] text-zinc-500">
                  ({sessionStats.exactHits} exact, {sessionStats.semanticHits} semantic)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                <span>Cost Saved:</span>
                <span className="text-amber-300 font-semibold">
                  ${sessionStats.costSavedUsd.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Time Saved:</span>
                <span className="text-cyan-300 font-semibold">
                  {(sessionStats.latencySavedMs / 1000).toFixed(2)}s
                </span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-500 hidden md:block">
              SDK Mode: <span className="text-zinc-300">@memolm/sdk (In-Browser TS)</span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-4xl mx-auto ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role !== "user" && (
                  <div className="w-8 h-8 rounded-lg border border-indigo-500/30 bg-indigo-950/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(99,102,241,0.15)]">
                    <Shield className="w-4 h-4 text-indigo-400" />
                  </div>
                )}

                <div
                  className={`flex flex-col gap-1.5 max-w-[85%] sm:max-w-[75%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {/* Sender & Timestamp */}
                  <div className="flex items-center gap-2 px-1 text-[11px] font-mono text-zinc-500">
                    <span>{msg.role === "user" ? "You" : "MemoLM"}</span>
                    <span>•</span>
                    <span>{msg.timestamp}</span>
                  </div>

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/10 rounded-tr-sm"
                        : "bg-[#111318] border border-white/[0.08] text-zinc-200 shadow-md rounded-tl-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                    {msg.metadata?.isStreaming && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
                    )}
                  </div>

                  {/* Telemetry Badge for Assistant Messages */}
                  {msg.metadata && !msg.metadata.isStreaming && (
                    <div className="flex flex-wrap items-center gap-1.5 px-1 mt-0.5 text-[11px] font-mono">
                      {msg.metadata.hitType === "EXACT_CACHE_HIT" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                          <Flame className="w-3 h-3 text-emerald-400" />
                          EXACT HIT
                        </span>
                      )}
                      {msg.metadata.hitType === "SEMANTIC_CACHE_HIT" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold shadow-[0_0_8px_rgba(6,182,212,0.15)]">
                          <Zap className="w-3 h-3 text-cyan-400" />
                          SEMANTIC HIT ({Math.round((msg.metadata.similarity ?? 0.95) * 100)}%)
                        </span>
                      )}
                      {msg.metadata.hitType === "LLM_CALL" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-semibold">
                          <Cpu className="w-3 h-3 text-zinc-400" />
                          LLM CALL
                        </span>
                      )}
                      {msg.metadata.hitType === "ERROR" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          REJECTED / ERROR
                        </span>
                      )}

                      {msg.metadata.latencyMs !== undefined && (
                        <span className="text-zinc-500 flex items-center gap-0.5">
                          <Clock className="w-3 h-3" />
                          {msg.metadata.latencyMs.toFixed(1)}ms
                        </span>
                      )}

                      {msg.metadata.costUsd !== undefined && (
                        <span className="text-zinc-500 flex items-center gap-0.5">
                          <DollarSign className="w-3 h-3" />${msg.metadata.costUsd.toFixed(5)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="my-3">
                <ColdStartWarning
                  isLoading={isLoading}
                  thresholdSeconds={3.5}
                  serverUrl={gatewayUrl}
                  mode="inline"
                />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <ColdStartWarning
            isLoading={isLoading}
            thresholdSeconds={4.5}
            serverUrl={gatewayUrl}
            mode="overlay"
          />

          {/* Preset Prompts Pills */}
          <div className="px-4 sm:px-6 pt-2 pb-1 flex items-center gap-2 overflow-x-auto max-w-4xl mx-auto w-full no-scrollbar">
            <span className="text-[11px] font-mono text-zinc-500 shrink-0">Try test:</span>
            {PRESET_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(prompt)}
                disabled={isLoading}
                className="shrink-0 text-xs px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] text-zinc-300 hover:text-white hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-all text-left"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Box Area */}
          <div className="p-4 sm:p-6 pt-2 max-w-4xl mx-auto w-full shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="relative flex items-end rounded-xl border border-white/[0.12] bg-[#0f1117] p-2 focus-within:border-indigo-500/70 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all shadow-xl"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Ask anything (e.g. prompt once, then rephrase to see semantic cache hit)..."
                rows={2}
                disabled={isLoading}
                className="flex-1 resize-none bg-transparent px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none disabled:opacity-50"
              />

              <div className="flex items-center gap-2 shrink-0 pb-1 pr-1">
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-30 disabled:hover:bg-indigo-600 transition-all shadow-md shadow-indigo-600/20"
                >
                  {isLoading ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </form>
            <div className="flex justify-between items-center px-1 pt-2 text-[11px] font-mono text-zinc-500">
              <span>Press Enter to send, Shift+Enter for new line</span>
              <span>Backend target: {gatewayUrl}</span>
            </div>
          </div>
        </main>

        {/* Slide-out / Side Configuration Drawer */}
        {showSettings && (
          <aside className="w-80 border-l border-white/[0.08] bg-[#0c0e14] p-5 flex flex-col gap-5 overflow-y-auto z-10 shrink-0 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <h2 className="font-mono font-semibold text-sm text-white">SDK Parameters</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {/* Gateway URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>Gateway URL</span>
                <span className="text-[10px] text-zinc-500">baseURL</span>
              </label>
              <input
                type="text"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                className="w-full text-xs font-mono bg-[#161820] border border-white/[0.1] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Tenant ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>Tenant ID</span>
                <span className="text-[10px] text-zinc-500">tenantId</span>
              </label>
              <input
                type="text"
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="w-full text-xs font-mono bg-[#161820] border border-white/[0.1] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Knowledge Version */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400 flex items-center justify-between">
                <span>Knowledge Version</span>
                <span className="text-[10px] text-zinc-500">knowledgeVersion</span>
              </label>
              <input
                type="text"
                value={knowledgeVersion}
                onChange={(e) => setKnowledgeVersion(e.target.value)}
                className="w-full text-xs font-mono bg-[#161820] border border-white/[0.1] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Risk Level */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400">Risk Level Policy</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["low", "medium", "high"] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setRiskLevel(lvl)}
                    className={`text-xs font-mono py-1.5 rounded-md border capitalize transition-all ${
                      riskLevel === lvl
                        ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 font-semibold"
                        : "bg-[#161820] border-white/[0.08] text-zinc-400 hover:text-white"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono text-zinc-400">Model</label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full text-xs font-mono bg-[#161820] border border-white/[0.1] rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Similarity Threshold */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono text-zinc-400">
                <span>Similarity Threshold</span>
                <span className="text-indigo-400 font-semibold">{similarityThreshold}</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={0.99}
                step={0.01}
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Toggles */}
            <div className="space-y-3 pt-2 border-t border-white/[0.08]">
              <label className="flex items-center justify-between text-xs font-mono text-zinc-300 cursor-pointer">
                <span>SSE Streaming (`stream: true`)</span>
                <input
                  type="checkbox"
                  checked={isStreaming}
                  onChange={(e) => setIsStreaming(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between text-xs font-mono text-zinc-300 cursor-pointer">
                <span>Force Refresh (`forceRefresh`)</span>
                <input
                  type="checkbox"
                  checked={forceRefresh}
                  onChange={(e) => setForceRefresh(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0"
                />
              </label>
            </div>

            {/* Cache Actions */}
            <div className="space-y-2 pt-4 border-t border-white/[0.08]">
              <span className="text-xs font-mono text-zinc-400 font-semibold">Cache Operations</span>
              <button
                onClick={handleInvalidate}
                className="w-full flex items-center justify-center gap-2 text-xs font-mono py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Invalidate Tenant Cache</span>
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
