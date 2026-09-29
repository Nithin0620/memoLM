"use client";

import React, { useState } from "react";
import {
  Shield,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Send,
  Code,
  Terminal,
} from "lucide-react";
import { DemoMessage, ExplainabilityData } from "@/lib/types";

const SIMULATED_CACHE_ENTRIES = [
  {
    keywords: [
      "return",
      "refund",
      "money back",
      "send back",
      "exchange",
      "policy",
    ],
    matchedQuery: "What is the return policy?",
    answer:
      "Items can be refunded within 30 days of purchase with original receipt and intact tags.",
    updatedAnswer:
      "Under policy v13, refunds are offered for 14 days as store credit.",
    similarity: 0.962,
  },
  {
    keywords: ["shipping", "delivery", "deliver", "ship", "arrive"],
    matchedQuery: "How long does shipping take?",
    answer:
      "Standard shipping typically arrives within 3-5 business days. Express shipping arrives within 1-2 business days.",
    updatedAnswer:
      "Standard shipping typically arrives within 3-5 business days. Express shipping arrives within 1-2 business days.",
    similarity: 0.948,
  },
  {
    keywords: ["track", "tracking", "order status", "where is my order"],
    matchedQuery: "How can I track my order?",
    answer:
      "Use the tracking link in your shipping confirmation email to see your order's latest status.",
    updatedAnswer:
      "Use the tracking link in your shipping confirmation email to see your order's latest status.",
    similarity: 0.937,
  },
  {
    keywords: ["payment", "credit card", "billing", "pay with"],
    matchedQuery: "What payment methods do you accept?",
    answer:
      "We accept major credit and debit cards, plus secure payments through PayPal.",
    updatedAnswer:
      "We accept major credit and debit cards, plus secure payments through PayPal.",
    similarity: 0.929,
  },
  {
    keywords: ["cancel", "cancellation", "stop my order"],
    matchedQuery: "Can I cancel my order?",
    answer:
      "Orders can be canceled before they ship. Contact support with your order number as soon as possible.",
    updatedAnswer:
      "Orders can be canceled before they ship. Contact support with your order number as soon as possible.",
    similarity: 0.921,
  },
  {
    keywords: ["password", "sign in", "log in", "login"],
    matchedQuery: "How do I reset my password?",
    answer:
      'Select "Forgot password" on the sign-in page and follow the secure reset link sent to your email.',
    updatedAnswer:
      'Select "Forgot password" on the sign-in page and follow the secure reset link sent to your email.',
    similarity: 0.914,
  },
  {
    keywords: ["hours", "contact support", "customer service"],
    matchedQuery: "When is customer support available?",
    answer:
      "Customer support is available Monday-Friday, 9am-5pm local time. Contact us through the Help Center.",
    updatedAnswer:
      "Customer support is available Monday-Friday, 9am-5pm local time. Contact us through the Help Center.",
    similarity: 0.908,
  },
];

function findSimulatedCacheEntry(query: string) {
  const normalizedQuery = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const queryWords = normalizedQuery.split(" ");

  return SIMULATED_CACHE_ENTRIES.find((entry) =>
    entry.keywords.some((keyword) =>
      keyword.includes(" ")
        ? normalizedQuery.includes(keyword)
        : queryWords.includes(keyword),
    ),
  );
}

export function InteractiveSimulator() {
  const [knowledgeVersion, setKnowledgeVersion] = useState<string>("v12");
  const [riskLevel, setRiskLevel] = useState<string>("low");
  const [tenantId, setTenantId] = useState<string>("acme-corp");
  const [queryInput, setQueryInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [showJsonRaw, setShowJsonRaw] = useState<boolean>(false);

  const [messages, setMessages] = useState<DemoMessage[]>([
    {
      id: "initial-assistant",
      role: "assistant",
      content:
        "MemoLM Gateway initialized. Select a scenario preset below or submit any prompt to trace the Safety Gate decision in real-time.",
      timestamp: "12:00:00",
    },
  ]);

  const [latestExplainability, setLatestExplainability] =
    useState<ExplainabilityData | null>(null);
  const completedRequests = messages
    .filter((message) => message.role === "assistant" && message.explainability)
    .map((message) => message.explainability!);
  const cacheHitCount = completedRequests.filter(
    (request) => request.verdict === "SAFE_CACHE_HIT",
  ).length;
  const cacheHitRate = completedRequests.length
    ? Math.round((cacheHitCount / completedRequests.length) * 100)
    : 0;
  const latencySavedMs = completedRequests.reduce(
    (total, request) => total + request.latency_saved_ms,
    0,
  );
  const costSavedUsd = completedRequests.reduce(
    (total, request) => total + request.cost_saved_usd,
    0,
  );

  const runDemoStep = async (step: number) => {
    setActiveStep(step);
    setIsLoading(true);

    let query = "";
    let version = knowledgeVersion;
    let expectedVerdict: "SAFE_CACHE_HIT" | "CACHE_MISS" | "SAFETY_REJECTED" =
      "CACHE_MISS";
    let mockContent = "";
    let mockSimilarity = 0.0;
    let mockLatency = 1180;
    let mockLatencySaved = 0;
    let mockCostSaved = 0;
    let rejectionReasons: string[] = [];

    if (step === 1) {
      query = "What is the return policy?";
      version = "v12";
      setKnowledgeVersion("v12");
      expectedVerdict = "CACHE_MISS";
      mockContent =
        "Items can be refunded within 30 days of purchase with original receipt and intact tags. (Fresh LLM execution via Groq/OpenAI)";
      mockLatency = 1180;
      mockSimilarity = 0.0;
    } else if (step === 2) {
      query = "Can I get my money back?";
      version = "v12";
      setKnowledgeVersion("v12");
      expectedVerdict = "SAFE_CACHE_HIT";
      mockContent =
        "Items can be refunded within 30 days of purchase with original receipt and intact tags.";
      mockLatency = 19;
      mockLatencySaved = 1161;
      mockCostSaved = 0.005;
      mockSimilarity = 0.962;
    } else if (step === 3) {
      query = "Can I get my money back?";
      version = "v13";
      setKnowledgeVersion("v13");
      expectedVerdict = "SAFETY_REJECTED";
      mockContent =
        "Under our updated v13 policy, refunds are processed within 14 days and eligible for store credit. (Stale v12 cache safely rejected -> Fresh LLM call)";
      mockLatency = 1210;
      mockSimilarity = 0.962;
      rejectionReasons = [
        "knowledge_version_mismatch: requested 'v13', candidate is 'v12'",
      ];
    }

    let realData: any = null;
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-memolm-version": version,
            "x-memolm-tenant": tenantId,
            "x-memolm-risk": riskLevel,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [{ role: "user", content: query }],
          }),
          signal: AbortSignal.timeout(3000),
        },
      );

      if (response.ok) {
        realData = await response.json();
      }
    } catch {
      // offline simulation
    }

    const userMsg: DemoMessage = {
      id: "usr-" + Date.now(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    let explain: ExplainabilityData;
    let assistantText = "";

    if (realData && realData.choices) {
      assistantText = realData.choices[0].message.content;
      const stats = realData.memolm_stats || {};
      const verdict = (stats.verdict || "CACHE_MISS") as any;
      explain = {
        verdict: verdict,
        similarity:
          stats.similarity || (verdict === "SAFE_CACHE_HIT" ? 0.95 : 0.0),
        required_similarity: 0.85,
        latency_ms:
          stats.latency_ms || (verdict === "SAFE_CACHE_HIT" ? 21 : 1100),
        latency_saved_ms:
          stats.latency_saved || (verdict === "SAFE_CACHE_HIT" ? 1100 : 0),
        cost_saved_usd: verdict === "SAFE_CACHE_HIT" ? 0.005 : 0,
        rejection_reasons: stats.rejection_reasons || [],
        knowledge_version: version,
        tenant_id: tenantId,
        risk: riskLevel,
        checks: {
          knowledge_version_match: !stats.rejection_reasons?.some((r: string) =>
            r.includes("version"),
          ),
          ttl_fresh: !stats.rejection_reasons?.some((r: string) =>
            r.includes("ttl"),
          ),
          tenant_match: !stats.rejection_reasons?.some((r: string) =>
            r.includes("tenant"),
          ),
          risk_policy_pass: !stats.rejection_reasons?.some((r: string) =>
            r.includes("risk"),
          ),
        },
      };
    } else {
      assistantText = mockContent;
      explain = {
        verdict: expectedVerdict,
        similarity: mockSimilarity,
        required_similarity: 0.85,
        latency_ms: mockLatency,
        latency_saved_ms: mockLatencySaved,
        cost_saved_usd: mockCostSaved,
        rejection_reasons: rejectionReasons,
        knowledge_version: version,
        cached_version: step === 3 ? "v12" : version,
        tenant_id: tenantId,
        risk: riskLevel,
        matched_query: step > 1 ? "What is the return policy?" : undefined,
        checks: {
          knowledge_version_match: step !== 3,
          ttl_fresh: true,
          tenant_match: true,
          risk_policy_pass: true,
        },
      };
    }

    const assistantMsg: DemoMessage = {
      id: "asst-" + Date.now(),
      role: "assistant",
      content: assistantText,
      timestamp: new Date().toLocaleTimeString(),
      explainability: explain,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setLatestExplainability(explain);
    setIsLoading(false);
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryInput.trim() || isLoading) return;

    const query = queryInput.trim();
    setQueryInput("");
    setIsLoading(true);

    const userMsg: DemoMessage = {
      id: "usr-" + Date.now(),
      role: "user",
      content: query,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    let realData: any = null;
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-memolm-version": knowledgeVersion,
            "x-memolm-tenant": tenantId,
            "x-memolm-risk": riskLevel,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-20b",
            messages: [{ role: "user", content: query }],
          }),
          signal: AbortSignal.timeout(4000),
        },
      );

      if (response.ok) {
        realData = await response.json();
      }
    } catch {
      // offline simulation
    }

    let explain: ExplainabilityData;
    let assistantText = "";

    if (realData && realData.choices) {
      assistantText = realData.choices[0].message.content;
      const stats = realData.memolm_stats || {};
      const verdict = (stats.verdict || "CACHE_MISS") as any;
      explain = {
        verdict: verdict,
        similarity: stats.similarity || 0.0,
        required_similarity: 0.85,
        latency_ms: stats.latency_ms || 25,
        latency_saved_ms: stats.latency_saved || 0,
        cost_saved_usd: verdict === "SAFE_CACHE_HIT" ? 0.005 : 0,
        rejection_reasons: stats.rejection_reasons || [],
        knowledge_version: knowledgeVersion,
        tenant_id: tenantId,
        risk: riskLevel,
        checks: {
          knowledge_version_match: !stats.rejection_reasons?.some((r: string) =>
            r.includes("version"),
          ),
          ttl_fresh: !stats.rejection_reasons?.some((r: string) =>
            r.includes("ttl"),
          ),
          tenant_match: !stats.rejection_reasons?.some((r: string) =>
            r.includes("tenant"),
          ),
          risk_policy_pass: !stats.rejection_reasons?.some((r: string) =>
            r.includes("risk"),
          ),
        },
      };
    } else {
      const cacheEntry = findSimulatedCacheEntry(query);
      if (cacheEntry && knowledgeVersion === "v12") {
        assistantText = cacheEntry.answer;
        explain = {
          verdict: "SAFE_CACHE_HIT",
          similarity: cacheEntry.similarity,
          required_similarity: 0.85,
          latency_ms: 22,
          latency_saved_ms: 1150,
          cost_saved_usd: 0.005,
          rejection_reasons: [],
          knowledge_version: knowledgeVersion,
          tenant_id: tenantId,
          risk: riskLevel,
          matched_query: cacheEntry.matchedQuery,
          checks: {
            knowledge_version_match: true,
            ttl_fresh: true,
            tenant_match: true,
            risk_policy_pass: true,
          },
        };
      } else if (cacheEntry && knowledgeVersion === "v13") {
        assistantText = `${cacheEntry.updatedAnswer} (Stale v12 cache blocked by Safety Gate)`;
        explain = {
          verdict: "SAFETY_REJECTED",
          similarity: cacheEntry.similarity,
          required_similarity: 0.85,
          latency_ms: 1205,
          latency_saved_ms: 0,
          cost_saved_usd: 0,
          rejection_reasons: [
            "knowledge_version_mismatch: requested 'v13', candidate is 'v12'",
          ],
          knowledge_version: knowledgeVersion,
          cached_version: "v12",
          tenant_id: tenantId,
          risk: riskLevel,
          matched_query: cacheEntry.matchedQuery,
          checks: {
            knowledge_version_match: false,
            ttl_fresh: true,
            tenant_match: true,
            risk_policy_pass: true,
          },
        };
      } else {
        assistantText = `Processed fresh from upstream LLM: Response generated for query "${query}".`;
        explain = {
          verdict: "CACHE_MISS",
          similarity: 0.42,
          required_similarity: 0.85,
          latency_ms: 1190,
          latency_saved_ms: 0,
          cost_saved_usd: 0,
          rejection_reasons: ["no_semantic_candidate_found"],
          knowledge_version: knowledgeVersion,
          tenant_id: tenantId,
          risk: riskLevel,
          checks: {
            knowledge_version_match: true,
            ttl_fresh: true,
            tenant_match: true,
            risk_policy_pass: true,
          },
        };
      }
    }

    const assistantMsg: DemoMessage = {
      id: "asst-" + Date.now(),
      role: "assistant",
      content: assistantText,
      timestamp: new Date().toLocaleTimeString(),
      explainability: explain,
    };

    setMessages((prev) => [...prev, assistantMsg]);
    setLatestExplainability(explain);
    setIsLoading(false);
  };

  const handleReset = () => {
    setMessages([
      {
        id: "initial-assistant",
        role: "assistant",
        content:
          "Simulator reset. Click any of the 3 presets to test the gateway response flow.",
        timestamp: "12:00:00",
      },
    ]);
    setLatestExplainability(null);
    setActiveStep(0);
    setKnowledgeVersion("v12");
  };

  return (
    <section
      id="demo"
      className="py-20 md:py-28 border-t border-white/[0.06] bg-[#050508] relative"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            <span>Interactive Safety Gate Console</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Trace the Gate in Real-Time
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400 font-normal">
            Experience how MemoLM distinguishes safe semantic paraphrases from
            dangerous stale documentation leaks.
          </p>
        </div>

        {/* 3 Preset Workflow Buttons */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl mx-auto">
          <button
            onClick={() => runDemoStep(1)}
            disabled={isLoading}
            className={`flex items-start gap-3 rounded-xl p-3.5 text-left border transition-all ${
              activeStep === 1
                ? "border-amber-500/50 bg-amber-950/20 shadow-[0_0_20px_rgba(245,158,11,0.1)]"
                : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-amber-500/20 text-amber-400 font-mono text-xs font-bold">
              01
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-white">
                Cold Ask (Cache Miss)
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                First query &quot;What is return policy?&quot; calls LLM
                (~1.2s), writes to cache.
              </div>
            </div>
          </button>

          <button
            onClick={() => runDemoStep(2)}
            disabled={isLoading}
            className={`flex items-start gap-3 rounded-xl p-3.5 text-left border transition-all ${
              activeStep === 2
                ? "border-emerald-500/50 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
              02
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-white">
                Semantic Paraphrase (Safe Hit)
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Paraphrase &quot;Can I get money back?&quot; served in ~18ms
                (96% similarity).
              </div>
            </div>
          </button>

          <button
            onClick={() => runDemoStep(3)}
            disabled={isLoading}
            className={`flex items-start gap-3 rounded-xl p-3.5 text-left border transition-all ${
              activeStep === 3
                ? "border-rose-500/50 bg-rose-950/20 shadow-[0_0_20px_rgba(244,63,94,0.1)]"
                : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-rose-500/20 text-rose-400 font-mono text-xs font-bold">
              03
            </div>
            <div>
              <div className="font-mono text-xs font-semibold text-white">
                Version Invalidation (v12 ➔ v13)
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">
                Bump version to <code className="text-rose-400">v13</code> ➔
                Gate blocks stale v12 and refreshes!
              </div>
            </div>
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
          <div className="rounded-xl border border-emerald-500/15 bg-emerald-950/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-300/70">
              <Sparkles className="h-3.5 w-3.5" />
              Safe cache hits
            </div>
            <div className="mt-1 text-xl font-semibold text-emerald-300">
              {cacheHitCount}
            </div>
          </div>
          <div className="rounded-xl border border-indigo-500/15 bg-indigo-950/10 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-indigo-300/70">
              Session hit rate
            </div>
            <div className="mt-1 text-xl font-semibold text-indigo-300">
              {cacheHitRate}%
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/15 bg-amber-950/10 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-300/70">
              <Zap className="h-3.5 w-3.5" />
              Latency saved
            </div>
            <div className="mt-1 text-xl font-semibold text-amber-300">
              {(latencySavedMs / 1000).toFixed(2)}s
            </div>
          </div>
          <div className="rounded-xl border border-cyan-500/15 bg-cyan-950/10 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-cyan-300/70">
              Cost avoided
            </div>
            <div className="mt-1 text-xl font-semibold text-cyan-300">
              ${costSavedUsd.toFixed(3)}
            </div>
          </div>
        </div>

        {/* Console Box with macOS Chrome */}
        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#08080b] shadow-2xl overflow-hidden max-w-6xl mx-auto">
          {/* Top Window Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-950/80 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              <div className="ml-3 hidden sm:flex items-center gap-2 font-mono text-[11px] text-zinc-400">
                <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-indigo-400 font-semibold border border-indigo-500/20">
                  POST
                </span>
                <span>/v1/chat/completions</span>
              </div>
            </div>

            {/* Parameter Ribbon Controls */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span className="text-zinc-500">ver:</span>
                <div className="flex rounded border border-white/[0.08] bg-zinc-900 p-0.5">
                  <button
                    onClick={() => setKnowledgeVersion("v12")}
                    className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                      knowledgeVersion === "v12"
                        ? "bg-zinc-700 text-white font-bold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    v12
                  </button>
                  <button
                    onClick={() => setKnowledgeVersion("v13")}
                    className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                      knowledgeVersion === "v13"
                        ? "bg-zinc-700 text-white font-bold"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    v13
                  </button>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white transition-colors"
                title="Reset conversation"
              >
                <RotateCcw className="h-3 w-3" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>

          {/* Split Pane: Chat vs Safety Gate Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[500px]">
            {/* Left: Chat Flow (7 Cols) */}
            <div className="lg:col-span-7 border-b lg:border-b-0 lg:border-r border-white/[0.06] flex flex-col justify-between">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[460px]">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-zinc-100 text-black font-medium"
                          : "border border-white/[0.06] bg-white/[0.02] text-zinc-300"
                      }`}
                    >
                      {m.content}
                    </div>
                    {m.explainability && (
                      <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.2 rounded font-medium ${
                            m.explainability.verdict === "SAFE_CACHE_HIT"
                              ? "bg-emerald-950/60 text-emerald-400 border border-emerald-500/20"
                              : m.explainability.verdict === "SAFETY_REJECTED"
                                ? "bg-rose-950/60 text-rose-400 border border-rose-500/20"
                                : "bg-amber-950/60 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {m.explainability.verdict} (
                          {m.explainability.latency_ms}ms)
                        </span>
                        <span>{m.timestamp}</span>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 text-xs font-mono text-indigo-400 py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
                    <span>
                      Evaluating Safety Gate &amp; Qdrant vector index...
                    </span>
                  </div>
                )}
              </div>

              {/* Chat Form */}
              <form
                onSubmit={handleCustomSubmit}
                className="border-t border-white/[0.06] p-3 bg-zinc-950/60 flex items-center gap-2"
              >
                <input
                  type="text"
                  value={queryInput}
                  onChange={(e) => setQueryInput(e.target.value)}
                  placeholder="Try: return, shipping, order tracking, payment, cancellation..."
                  className="flex-1 rounded-lg border border-white/[0.08] bg-[#030304] px-3.5 py-2 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isLoading || !queryInput.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black hover:bg-zinc-200 disabled:opacity-40 transition-colors shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>

            {/* Right: Detailed Gate Diagnostics (5 Cols) */}
            <div className="lg:col-span-5 p-5 flex flex-col justify-between bg-zinc-950/40 overflow-y-auto max-h-[520px]">
              <div>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-indigo-400" />
                    <span className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                      Gate Diagnostics
                    </span>
                  </div>
                  <button
                    onClick={() => setShowJsonRaw(!showJsonRaw)}
                    className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white"
                  >
                    <Code className="h-3 w-3" />
                    <span>{showJsonRaw ? "Audit View" : "Raw JSON"}</span>
                  </button>
                </div>

                {latestExplainability ? (
                  showJsonRaw ? (
                    <div className="mt-3 rounded-lg bg-[#030304] p-3 border border-white/[0.06] font-mono text-[10px] text-zinc-300 overflow-x-auto">
                      <pre>{JSON.stringify(latestExplainability, null, 2)}</pre>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {/* Verdict Badge Box */}
                      <div
                        className={`rounded-lg p-3 border ${
                          latestExplainability.verdict === "SAFE_CACHE_HIT"
                            ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                            : latestExplainability.verdict === "SAFETY_REJECTED"
                              ? "bg-rose-950/20 border-rose-500/30 text-rose-300"
                              : "bg-amber-950/20 border-amber-500/30 text-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {latestExplainability.verdict ===
                            "SAFE_CACHE_HIT" && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          )}
                          {latestExplainability.verdict ===
                            "SAFETY_REJECTED" && (
                            <XCircle className="h-4 w-4 text-rose-400" />
                          )}
                          {latestExplainability.verdict === "CACHE_MISS" && (
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                          )}
                          <span className="font-mono font-bold text-xs">
                            {latestExplainability.verdict}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] opacity-80 leading-relaxed font-sans">
                          {latestExplainability.verdict === "SAFE_CACHE_HIT" &&
                            "Passed all 4 safety checkpoints. Answer safely served in ~18ms."}
                          {latestExplainability.verdict === "SAFETY_REJECTED" &&
                            "Candidate match found in vector store, but blocked by Safety Gate. Forwarded fresh to LLM."}
                          {latestExplainability.verdict === "CACHE_MISS" &&
                            "No semantic match above similarity threshold. Called fresh LLM and written back to cache."}
                        </p>
                      </div>

                      {/* Cosine Meter */}
                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 font-mono text-xs">
                        <div className="flex justify-between items-center text-zinc-400 text-[11px]">
                          <span>Cosine Similarity Score</span>
                          <span className="font-bold text-white">
                            {(latestExplainability.similarity * 100).toFixed(1)}
                            %
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-zinc-900 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              latestExplainability.verdict === "SAFE_CACHE_HIT"
                                ? "bg-emerald-400"
                                : latestExplainability.verdict ===
                                    "SAFETY_REJECTED"
                                  ? "bg-rose-400"
                                  : "bg-amber-400"
                            }`}
                            style={{
                              width: `${Math.min(latestExplainability.similarity * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[10px] text-zinc-500">
                          <span>Threshold: 85.0%</span>
                          <span>
                            Candidate:{" "}
                            {latestExplainability.matched_query || "None"}
                          </span>
                        </div>
                      </div>

                      {/* 4 Checkpoints */}
                      <div className="space-y-1.5 font-mono text-xs">
                        <div className="flex items-center justify-between rounded border border-white/[0.04] bg-white/[0.01] p-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            {latestExplainability.checks
                              ?.knowledge_version_match ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                            )}
                            <span className="text-zinc-300">
                              Knowledge Version
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            req: {latestExplainability.knowledge_version}
                          </span>
                        </div>

                        <div className="flex items-center justify-between rounded border border-white/[0.04] bg-white/[0.01] p-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-zinc-300">Dynamic TTL</span>
                          </div>
                          <span className="text-[10px] text-emerald-400">
                            valid (24h)
                          </span>
                        </div>

                        <div className="flex items-center justify-between rounded border border-white/[0.04] bg-white/[0.01] p-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-zinc-300">
                              Tenant Isolation
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            {tenantId}
                          </span>
                        </div>

                        <div className="flex items-center justify-between rounded border border-white/[0.04] bg-white/[0.01] p-2">
                          <div className="flex items-center gap-2 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-zinc-300">
                              Domain Risk Gate
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-500">
                            policy: {riskLevel}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="mt-16 flex flex-col items-center justify-center text-center p-6 text-zinc-500 font-mono text-xs">
                    <Shield className="h-8 w-8 text-zinc-700 mb-2" />
                    <span>
                      Run a scenario preset above to inspect the Safety Gate
                      trace.
                    </span>
                  </div>
                )}
              </div>

              {/* Bottom Timing Summary */}
              {latestExplainability && (
                <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between font-mono text-xs">
                  <div className="text-zinc-400">
                    Latency:{" "}
                    <span className="text-white font-bold">
                      {latestExplainability.latency_ms}ms
                    </span>
                  </div>
                  <div className="text-zinc-400">
                    Billed:{" "}
                    <span className="text-white font-bold">
                      {latestExplainability.cost_saved_usd > 0
                        ? "$0.000"
                        : "$0.005"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
