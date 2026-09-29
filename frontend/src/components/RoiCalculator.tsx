"use client";

import React, { useState } from "react";
import { Calculator, DollarSign, Clock, Zap } from "lucide-react";

export function RoiCalculator() {
  const [monthlyRequests, setMonthlyRequests] = useState<number>(500000);
  const [cacheHitRate, setCacheHitRate] = useState<number>(45);
  const [tokensPerRequest, setTokensPerRequest] = useState<number>(1200);
  const [costPer1kTokens, setCostPer1kTokens] = useState<number>(0.015);

  const cachedRequests = monthlyRequests * (cacheHitRate / 100);
  const monthlyTokensSaved = cachedRequests * tokensPerRequest;
  const monthlySavingsUsd = (monthlyTokensSaved / 1000) * costPer1kTokens;
  const annualSavingsUsd = monthlySavingsUsd * 12;

  const secondsSaved = cachedRequests * 1.18;
  const hoursSaved = Math.round(secondsSaved / 3600);

  return (
    <section id="roi-calculator" className="py-20 md:py-28 border-t border-white/[0.06] bg-[#030304] relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <Calculator className="h-3.5 w-3.5 text-emerald-400" />
            <span>Economic Impact</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Calculate Your Cloud LLM Savings
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Estimate direct inference bill reductions and user latency saved across your production stack.
          </p>
        </div>

        <div className="mt-14 max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Sliders (7 Cols) */}
          <div className="lg:col-span-7 card-slick rounded-xl p-6 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-300">Monthly Inbound Queries:</span>
                <span className="text-white font-bold">{monthlyRequests.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min={50000}
                max={5000000}
                step={50000}
                value={monthlyRequests}
                onChange={(e) => setMonthlyRequests(Number(e.target.value))}
                className="mt-3 w-full"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
                <span>50k</span>
                <span>2.5M</span>
                <span>5M</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-300">Target Cache Hit Ratio:</span>
                <span className="text-emerald-400 font-bold">{cacheHitRate}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={80}
                step={5}
                value={cacheHitRate}
                onChange={(e) => setCacheHitRate(Number(e.target.value))}
                className="mt-3 w-full"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
                <span>10% (Sparse)</span>
                <span>45% (Typical Support)</span>
                <span>80% (High Repetition)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-300">Average Tokens per Query:</span>
                <span className="text-indigo-400 font-bold">{tokensPerRequest} tokens</span>
              </div>
              <input
                type="range"
                min={300}
                max={4000}
                step={100}
                value={tokensPerRequest}
                onChange={(e) => setTokensPerRequest(Number(e.target.value))}
                className="mt-3 w-full"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-600">
                <span>300</span>
                <span>2,000</span>
                <span>4,000</span>
              </div>
            </div>
          </div>

          {/* Results (5 Cols) */}
          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-[#07070a] p-6 shadow-2xl">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 uppercase tracking-wider">
                <span>Estimated Monthly Savings</span>
                <DollarSign className="h-4 w-4 text-emerald-400" />
              </div>
              <div className="mt-3 font-mono text-4xl sm:text-5xl font-bold text-white tracking-tight">
                ${Math.round(monthlySavingsUsd).toLocaleString()}
                <span className="text-xs font-normal text-zinc-500"> / mo</span>
              </div>
              <div className="mt-2 text-xs font-mono text-zinc-400">
                Projected Annual ROI: <strong className="text-emerald-400">${Math.round(annualSavingsUsd).toLocaleString()} / yr</strong>
              </div>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-[#07070a] p-6 shadow-2xl">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-500 uppercase tracking-wider">
                <span>End-User Wait Time Saved</span>
                <Clock className="h-4 w-4 text-indigo-400" />
              </div>
              <div className="mt-3 font-mono text-3xl sm:text-4xl font-bold text-white tracking-tight">
                {hoursSaved.toLocaleString()}
                <span className="text-xs font-normal text-zinc-500"> hours / mo</span>
              </div>
              <div className="mt-2 text-xs font-sans text-zinc-400 leading-relaxed">
                Replaces ~1.2s cold model wait times with ~18ms deterministic vector responses.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
