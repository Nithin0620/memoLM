"use client";

import React from "react";
import { X, Check, ShieldAlert, ShieldCheck } from "lucide-react";

export function ProblemVsSolution() {
  const comparisons = [
    {
      vulnerability: "Stale Documentation & Deprecated Policies",
      naive: "Blind vector caches continue serving outdated v12 return/pricing policies for weeks after business documentation updates.",
      memolm: "Bump knowledge_version tag (v12 ➔ v13). The Safety Gate immediately blocks stale candidates with zero database purges.",
    },
    {
      vulnerability: "Cross-Tenant Data & Prompt Bleed",
      naive: "Vector similarity has no concept of tenant boundaries. High-similarity queries cross organizations, leaking internal company data.",
      memolm: "Every vector search applies cryptographic tenant isolation at the query execution level. Never crosses tenant partitions.",
    },
    {
      vulnerability: "Hallucinated Output Permanence",
      naive: "Once an LLM hallucinates an erroneous response, a naive cache stores it forever, repeatedly poisoning customer conversations.",
      memolm: "Dynamic semantic TTL assigns zero-caching to high-risk domains and enforces strict similarity margins on sensitive categories.",
    },
    {
      vulnerability: "Unexplainable Black Box Failures",
      naive: "When a customer complains about an incorrect answer, engineers have zero visibility into why the cache triggered or similarity scores.",
      memolm: "Every response returns explicit telemetry: cosine similarity, required threshold, latency saved, and itemized safety gate verdicts.",
    },
  ];

  return (
    <section id="features" className="py-20 md:py-28 border-t border-white/[0.06] bg-[#030305] relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <span>Production Failure Modes</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Why Naive Semantic Caching Breaks
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Raw vector retrieval assumes similarity equals safety. Here is why enterprise teams replace raw vector caches with the MemoLM Firewall.
          </p>
        </div>

        {/* Matrix Comparison Table */}
        <div className="mt-14 max-w-5xl mx-auto rounded-2xl border border-white/[0.08] bg-[#070709] overflow-hidden shadow-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 border-b border-white/[0.06] text-xs font-mono">
            <div className="p-4 bg-rose-950/10 border-b md:border-b-0 md:border-r border-white/[0.06] flex items-center gap-2 text-rose-400">
              <ShieldAlert className="h-4 w-4" />
              <span className="font-bold uppercase tracking-wider">Naive Vector Caches (Unsafe)</span>
            </div>
            <div className="p-4 bg-emerald-950/10 flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span className="font-bold uppercase tracking-wider">MemoLM Response Firewall</span>
            </div>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {comparisons.map((c, i) => (
              <div key={i} className="grid grid-cols-1 md:grid-cols-2 text-xs">
                {/* Left: Naive problem */}
                <div className="p-5 md:border-r border-white/[0.06] bg-white/[0.005]">
                  <div className="flex items-center gap-2 text-rose-400 font-mono font-medium text-[11px]">
                    <X className="h-3.5 w-3.5 shrink-0" />
                    <span>{c.vulnerability}</span>
                  </div>
                  <p className="mt-2 text-zinc-400 leading-relaxed text-[11px] sm:text-xs">
                    {c.naive}
                  </p>
                </div>

                {/* Right: MemoLM solution */}
                <div className="p-5 bg-emerald-950/[0.04]">
                  <div className="flex items-center gap-2 text-emerald-400 font-mono font-medium text-[11px]">
                    <Check className="h-3.5 w-3.5 shrink-0" />
                    <span>MemoLM Resolution</span>
                  </div>
                  <p className="mt-2 text-zinc-300 leading-relaxed text-[11px] sm:text-xs">
                    {c.memolm}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
