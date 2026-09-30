"use client";

import React, { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  Shield,
  Terminal,
  Zap,
  Lock,
  Gauge,
  Sparkles,
} from "lucide-react";

export function HeroSection() {
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"npm" | "pip" | "curl">("npm");

  const commands = {
    npm: "npm install @memolm/sdk",
    pip: "pip install memolm",
    curl: `curl -X POST https://memolm.onrender.com/v1/chat/completions \\
  -H "x-memolm-version: v12" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"What is the policy?"}]}'`,
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section className="relative pt-16 pb-20 md:pt-24 md:pb-28 overflow-hidden bg-dot-pattern">
      {/* Subtle Ambient Mask */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_0%,#030304_70%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[800px] -translate-x-1/2 bg-gradient-to-b from-indigo-500/15 via-purple-500/5 to-transparent blur-3xl opacity-60" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
        {/* Master Headline - Crisp & Authoritative */}
        <h1 className="mt-8 text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white max-w-5xl mx-auto leading-[1.08]">
          Never pay twice for an LLM call.
          <br />
          <span className="text-zinc-400 font-medium">
            Never serve a stale answer.
          </span>
        </h1>

        {/* Technical Subheadline */}
        <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-zinc-400 font-normal leading-relaxed">
          Blind semantic similarity is dangerous in production. MemoLM sits
          between your application and upstream LLMs (Groq, OpenAI, Gemini),
          subjecting every candidate match to an explainable{" "}
          <strong className="text-zinc-200 font-medium">Safety Gate</strong>{" "}
          before returning it in{" "}
          <span className="text-emerald-400 font-mono font-medium">~18ms</span>.
        </p>

        {/* Dual Actions */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/compare"
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          >
            <span>Compare vs Groq Live</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>

          <a
            href="/chat"
            className="flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-5 py-2.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all"
          >
            <span>Realtime Chat (SDK)</span>
          </a>

          <a
            href="#demo"
            className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-xs font-semibold text-black hover:bg-zinc-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            <span>Interactive Simulator</span>
          </a>

          <a
            href="#quickstart"
            className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-5 py-2.5 text-xs font-mono text-zinc-300 hover:border-white/[0.18] hover:text-white transition-all"
          >
            <Terminal className="h-3.5 w-3.5 text-zinc-400" />
            <span>Developer SDK Guide</span>
          </a>
        </div>

        {/* High-End Terminal Box */}
        <div className="mx-auto mt-10 max-w-xl text-left">
          <div className="rounded-xl border border-white/[0.08] bg-[#08080a] shadow-2xl overflow-hidden">
            {/* macOS Chrome Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] bg-zinc-950/70 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
                <span className="ml-2 font-mono text-[11px] text-zinc-500">
                  terminal
                </span>
              </div>
              <div className="flex items-center gap-1 rounded bg-[#030304] p-0.5 border border-white/[0.06]">
                {(["npm", "pip", "curl"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded px-2.5 py-0.5 text-[11px] font-mono transition-colors ${
                      activeTab === tab
                        ? "bg-zinc-800 text-white font-medium"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Terminal Body */}
            <div className="flex items-center justify-between p-4 font-mono text-xs">
              <div className="flex items-center gap-2 text-zinc-300 overflow-x-auto">
                <span className="text-indigo-400 select-none">$</span>
                <span className="whitespace-pre">{commands[activeTab]}</span>
              </div>
              <button
                onClick={() => handleCopy(commands[activeTab], activeTab)}
                className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                title="Copy command"
              >
                {copied === activeTab ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Hardware / Engine Metrics Strip */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-5xl mx-auto">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-center backdrop-blur-md">
            <div className="font-mono text-2xl lg:text-3xl font-bold text-white tracking-tight">
              ~18ms
            </div>
            <div className="mt-1 text-xs text-zinc-400 font-medium">
              Safe Hit Latency
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              vs 1,200ms cold LLM
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-center backdrop-blur-md">
            <div className="font-mono text-2xl lg:text-3xl font-bold text-emerald-400 tracking-tight">
              100%
            </div>
            <div className="mt-1 text-xs text-zinc-400 font-medium">
              Version Isolation
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Zero stale docs served
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-center backdrop-blur-md">
            <div className="font-mono text-2xl lg:text-3xl font-bold text-indigo-400 tracking-tight">
              &gt;85%
            </div>
            <div className="mt-1 text-xs text-zinc-400 font-medium">
              Token Reductions
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              On repeated semantics
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-center backdrop-blur-md">
            <div className="font-mono text-2xl lg:text-3xl font-bold text-zinc-200 tracking-tight">
              Fail-Open
            </div>
            <div className="mt-1 text-xs text-zinc-400 font-medium">
              Zero Outage Guarantee
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              Automatic upstream direct
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
