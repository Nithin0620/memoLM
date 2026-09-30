"use client";

import React from "react";
import { Shield, Github, BookOpen, Terminal } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#030304] py-12 md:py-16 text-xs text-zinc-500 font-mono">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded border border-white/[0.1] bg-zinc-900 text-white">
                <Shield className="h-3.5 w-3.5 text-indigo-400" />
              </div>
              <span className="font-bold text-sm text-white font-mono">memoLM</span>
            </div>
            <p className="text-zinc-400 leading-relaxed text-xs font-sans">
              The intelligent LLM response firewall and safe semantic cache gateway. Sub-20ms verified responses with zero stale answer leaks.
            </p>
            <div className="flex items-center gap-2 pt-1 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-zinc-400">Open-Source MIT License</span>
            </div>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">Product</h4>
            <ul className="mt-3 space-y-2 text-zinc-400 text-xs font-sans">
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors">
                  Architecture Pipeline
                </a>
              </li>
              <li>
                <a href="#demo" className="hover:text-white transition-colors">
                  Interactive Simulator
                </a>
              </li>
              <li>
                <a href="#features" className="hover:text-white transition-colors">
                  Safety Gate Matrix
                </a>
              </li>
              <li>
                <a href="#roi-calculator" className="hover:text-white transition-colors">
                  ROI &amp; Cost Calculator
                </a>
              </li>
            </ul>
          </div>

          {/* Integration */}
          <div>
            <h4 className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">SDKs</h4>
            <ul className="mt-3 space-y-2 text-zinc-400 text-xs font-sans">
              <li>
                <a href="#quickstart" className="hover:text-white transition-colors">
                  Python SDK (memolm)
                </a>
              </li>
              <li>
                <a href="#quickstart" className="hover:text-white transition-colors">
                  TypeScript SDK (@memolm/sdk)
                </a>
              </li>
              <li>
                <a href="#quickstart" className="hover:text-white transition-colors">
                  OpenAI Drop-In Wrapper
                </a>
              </li>
              <li>
                <a href="#quickstart" className="hover:text-white transition-colors">
                  Active Cache APIs
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px]">Resources</h4>
            <ul className="mt-3 space-y-2 text-zinc-400 text-xs font-sans">
              <li>
                <a
                  href="https://memolm.ssh.net.in"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Shield className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Live App (memolm.ssh.net.in)</span>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Nithin0620/memoLM"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Github className="h-3.5 w-3.5" />
                  <span>GitHub Repository</span>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Nithin0620/memoLM/blob/main/SDK_GUIDE.md"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>SDK Integration Guide</span>
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Nithin0620/memoLM/blob/main/HOW_IT_WORKS.md"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 hover:text-white transition-colors"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Technical Specification</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-zinc-500 text-[11px]">
          <p>© {new Date().getFullYear()} MemoLM Team. Built for mission-critical AI workloads.</p>
          <div className="flex items-center gap-2">
            <span>Deterministic Cache Gateway</span>
            <span>•</span>
            <span>Version-Protected</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
