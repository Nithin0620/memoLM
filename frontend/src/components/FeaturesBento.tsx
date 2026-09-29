"use client";

import React from "react";
import { ShieldCheck, Zap, Lock, RefreshCw, Activity, Layers } from "lucide-react";

export function FeaturesBento() {
  return (
    <section className="py-20 md:py-28 border-t border-white/[0.06] bg-[#030304] relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <span>Production Architecture</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Built for High-Throughput Workloads
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Everything your engineering team needs to safely cache generative AI responses without operational surprises.
          </p>
        </div>

        {/* 6-Card Bento Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {/* Card 1 */}
          <div className="card-slick card-slick-hover rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-indigo-400">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-sm font-bold font-mono text-white">The Multi-Point Safety Gate</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Every candidate is evaluated against Knowledge Version, TTL validity, tenant ownership, and risk policies before serving.
              </p>
            </div>
            <div className="mt-5 font-mono text-[10px] text-zinc-400 bg-[#030304] p-2 rounded border border-white/[0.06]">
              x-memolm-version: &quot;v12&quot;
            </div>
          </div>

          {/* Card 2 */}
          <div className="card-slick card-slick-hover rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-emerald-400">
                <Zap className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-sm font-bold font-mono text-white">Dual-Tier Latency Optimization</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Sub-5ms exact deterministic match for repeated prompts; sub-20ms semantic vector search in Qdrant for natural paraphrases.
              </p>
            </div>
            <div className="mt-5 font-mono text-[10px] text-emerald-400 bg-[#030304] p-2 rounded border border-white/[0.06]">
              p99_latency: 18ms
            </div>
          </div>

          {/* Card 3 */}
          <div className="card-slick card-slick-hover rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-sky-400">
                <Lock className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-sm font-bold font-mono text-white">Multi-Tenant Namespace Isolation</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Partition vector collections by customer, organization, or user. Data never crosses tenant boundaries under any similarity score.
              </p>
            </div>
            <div className="mt-5 font-mono text-[10px] text-sky-400 bg-[#030304] p-2 rounded border border-white/[0.06]">
              tenant_id: &quot;acme-corp&quot;
            </div>
          </div>

          {/* Card 4 */}
          <div className="card-slick card-slick-hover rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-purple-400">
                <RefreshCw className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-sm font-bold font-mono text-white">Zero-Downtime Cache Invalidation</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Increment your version tag (v12 ➔ v13). Outdated records are safely blocked in milliseconds without expensive database purges.
              </p>
            </div>
            <div className="mt-5 font-mono text-[10px] text-purple-400 bg-[#030304] p-2 rounded border border-white/[0.06]">
              invalidation_overhead: 0ms
            </div>
          </div>

          {/* Card 5 */}
          <div className="card-slick card-slick-hover rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-amber-400">
                <Layers className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-sm font-bold font-mono text-white">100% Fail-Open Reliability</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                If the MemoLM gateway ever becomes unreachable, SDKs automatically fail open directly to your upstream LLM. Zero outage risk.
              </p>
            </div>
            <div className="mt-5 font-mono text-[10px] text-amber-400 bg-[#030304] p-2 rounded border border-white/[0.06]">
              fallback_to_upstream: True
            </div>
          </div>

          {/* Card 6 */}
          <div className="card-slick card-slick-hover rounded-xl p-5 flex flex-col justify-between">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-900 text-rose-400">
                <Activity className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-sm font-bold font-mono text-white">Explainable Decision Audit Stream</h3>
              <p className="mt-2 text-xs text-zinc-400 leading-relaxed">
                Programmatically inspect why every candidate passed or was rejected with similarity scores, latency speedups, and audit logs.
              </p>
            </div>
            <div className="mt-5 font-mono text-[10px] text-rose-400 bg-[#030304] p-2 rounded border border-white/[0.06]">
              response.memolm_stats
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
