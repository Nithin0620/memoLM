"use client";

import React, { useState } from "react";
import { Layers, Database, ShieldCheck, Zap, ArrowRight } from "lucide-react";

export function ArchitectureSection() {
  const [activeStep, setActiveStep] = useState<number>(2);

  const steps = [
    {
      id: 0,
      title: "01. Request Interception",
      badge: "OpenAI-Compatible",
      description: "Inbound requests target http://localhost:8000/v1/chat/completions. The gateway strips MemoLM headers and passes prompts down-pipeline.",
      icon: Layers,
    },
    {
      id: 1,
      title: "02. Dual-Tier Retrieval",
      badge: "Exact + Qdrant Vectors",
      description: "Sub-5ms exact hash lookup runs concurrently with Qdrant vector retrieval, enforcing strict tenant isolation filters.",
      icon: Database,
    },
    {
      id: 2,
      title: "03. The Safety Gate",
      badge: "Constraint Firewall",
      description: "Verifies candidate match against Knowledge Version, TTL expiration, tenant boundary, and domain risk margin.",
      icon: ShieldCheck,
    },
    {
      id: 3,
      title: "04. Return or LLM Fallback",
      badge: "Sub-20ms or Writeback",
      description: "Verified hits return in ~18ms with 0 tokens billed. Stale or miss queries route to Groq/OpenAI with automatic writeback.",
      icon: Zap,
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 border-t border-white/[0.06] bg-[#050508] relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <span>Core Pipeline</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            How MemoLM Works
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            A deterministic, low-overhead pipeline ensuring no response is served without verified safety credentials.
          </p>
        </div>

        {/* 4 Architectural Cards */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-4 gap-3 max-w-6xl mx-auto">
          {steps.map((s) => {
            const Icon = s.icon;
            const isSelected = activeStep === s.id;
            return (
              <div
                key={s.id}
                onClick={() => setActiveStep(s.id)}
                className={`cursor-pointer rounded-xl border p-4 transition-all flex flex-col justify-between ${
                  isSelected
                    ? "border-indigo-500/60 bg-indigo-950/20 shadow-[0_0_20px_rgba(99,102,241,0.1)]"
                    : "border-white/[0.06] bg-white/[0.015] hover:border-white/[0.12] hover:bg-white/[0.03]"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-zinc-300">
                      <Icon className="h-4 w-4 text-indigo-400" />
                    </div>
                    <span className="font-mono text-[10px] text-zinc-500">{s.badge}</span>
                  </div>

                  <h3 className="mt-3 text-xs font-bold font-mono text-white">{s.title}</h3>
                </div>

                <p className="mt-2 text-[11px] text-zinc-400 leading-relaxed font-sans">{s.description}</p>
              </div>
            );
          })}
        </div>

        {/* Detailed Technical Blueprint Box */}
        <div className="mt-6 max-w-4xl mx-auto rounded-xl border border-white/[0.08] bg-[#07070a] p-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-white">Pipeline Execution Spec: {steps[activeStep].title}</span>
            </div>
            <span className="text-[11px] text-zinc-500">Stage {activeStep + 1} of 4</span>
          </div>

          <div className="mt-3 rounded-lg bg-[#030304] p-4 border border-white/[0.06] font-mono text-xs text-zinc-300 leading-relaxed overflow-x-auto">
            {activeStep === 0 && (
              <>
                <span className="text-zinc-500">// Inbound Request Parsing</span>
                <br />
                POST /v1/chat/completions
                <br />
                x-memolm-version: <span className="text-emerald-400">&quot;v12&quot;</span>
                <br />
                x-memolm-tenant: <span className="text-sky-400">&quot;acme-corp&quot;</span>
                <br />
                x-memolm-risk: <span className="text-purple-400">&quot;low&quot;</span>
              </>
            )}
            {activeStep === 1 && (
              <>
                <span className="text-zinc-500">// Dual-tier Memory Index</span>
                <br />
                1. Exact Hash Match: MurmurHash3 on stitched conversation &rarr; sub-5ms lookup.
                <br />
                2. Semantic Vector Index: Qdrant Cosine Distance with Must-filter on (tenant_id == &quot;acme-corp&quot;).
              </>
            )}
            {activeStep === 2 && (
              <>
                <span className="text-zinc-500">// The Safety Gate Constraints</span>
                <br />
                candidate = qdrant.search(embedding, filter=tenant_filter)
                <br />
                if candidate.payload.version != requested.version:
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;return <span className="text-rose-400">REJECT(&quot;knowledge_version_mismatch&quot;)</span>
                <br />
                if now() &gt; candidate.payload.created_at + candidate.payload.ttl:
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;return <span className="text-rose-400">REJECT(&quot;ttl_expired&quot;)</span>
                <br />
                if candidate.score &lt; risk_margin(requested.risk):
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;return <span className="text-rose-400">REJECT(&quot;similarity_below_margin&quot;)</span>
                <br />
                return <span className="text-emerald-400">SAFE_CACHE_HIT</span>
              </>
            )}
            {activeStep === 3 && (
              <>
                <span className="text-zinc-500">// Final Output Resolution</span>
                <br />
                if SAFE_CACHE_HIT:
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;return JSONResponse(cached.response, stats=&lbrace; verdict: &quot;SAFE_CACHE_HIT&quot;, latency_saved: 1.18s &rbrace;)
                <br />
                else:
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;response = await groq_client.chat.completions.create(...)
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;qdrant.upsert(Point(embedding, payload=&lbrace; version, tenant, response, ttl &rbrace;))
                <br />
                &nbsp;&nbsp;&nbsp;&nbsp;return response
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
