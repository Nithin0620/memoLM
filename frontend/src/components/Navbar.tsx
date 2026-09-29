"use client";

import React, { useState, useEffect } from "react";
import { Shield, Github, ArrowUpRight, Terminal, Activity } from "lucide-react";

export function Navbar() {
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("http://127.0.0.1:8000/openapi.json", {
          method: "HEAD",
          signal: AbortSignal.timeout(1500),
        });
        setGatewayOnline(res.ok);
      } catch {
        setGatewayOnline(false);
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#030304]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand & Status */}
        <div className="flex items-center gap-4">
          <a href="#" className="flex items-center gap-2.5 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.12] bg-zinc-900 shadow-inner group-hover:border-indigo-500/50 transition-colors">
              <Shield className="h-3.5 w-3.5 text-indigo-400 group-hover:scale-105 transition-transform" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm tracking-tight text-white font-mono">memoLM</span>
              <span className="rounded px-1.5 py-0.2 text-[10px] font-mono text-zinc-400 border border-white/[0.08] bg-white/[0.02]">
                v1.0
              </span>
            </div>
          </a>

          {/* Live Engine Indicator */}
          <div className="hidden md:flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-0.5 text-[11px] font-mono text-zinc-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                gatewayOnline === true
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"
                  : "bg-amber-400"
              }`}
            />
            <span>{gatewayOnline === true ? "gateway: online (8000)" : "gateway: simulated"}</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="hidden lg:flex items-center gap-7 text-xs font-mono text-zinc-400">
          <a href="#how-it-works" className="hover:text-zinc-200 transition-colors">
            Architecture
          </a>
          <a href="#demo" className="hover:text-zinc-200 transition-colors">
            Interactive Console
          </a>
          <a href="#features" className="hover:text-zinc-200 transition-colors">
            Safety Gate
          </a>
          <a href="#quickstart" className="hover:text-zinc-200 transition-colors">
            Quickstart
          </a>
          <a href="#roi-calculator" className="hover:text-zinc-200 transition-colors">
            Calculator
          </a>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <a
            href="https://github.com/Nithin0620/memoLM"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.02] px-3 py-1.2 text-xs font-mono text-zinc-300 hover:border-white/[0.18] hover:text-white transition-all"
          >
            <Github className="h-3.5 w-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Star</span>
          </a>

          <a
            href="#demo"
            className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.2 text-xs font-medium text-black hover:bg-zinc-200 transition-colors shadow-[0_0_15px_rgba(255,255,255,0.15)]"
          >
            <span>Live Console</span>
            <ArrowUpRight className="h-3 w-3" />
          </a>
        </div>
      </div>
    </header>
  );
}
