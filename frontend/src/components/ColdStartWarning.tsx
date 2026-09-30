"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Server,
  Zap,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  Flame,
  Info,
} from "lucide-react";

interface ColdStartWarningProps {
  /**
   * Whether the request or operation is currently in a loading/pending state.
   */
  isLoading: boolean;
  /**
   * Threshold in seconds after which to show the cold start warning. Default is 3.5 seconds.
   */
  thresholdSeconds?: number;
  /**
   * Optional custom server URL to display.
   */
  serverUrl?: string;
  /**
   * Optional title override.
   */
  title?: string;
  /**
   * Mode to render: 'overlay' (centered floating modal), 'banner' (compact sticky banner), or 'inline' (within content card).
   */
  mode?: "overlay" | "banner" | "inline";
  /**
   * Optional callback when user dismisses or minimizes the warning.
   */
  onDismiss?: () => void;
}

export function ColdStartWarning({
  isLoading,
  thresholdSeconds = 3.5,
  serverUrl = "https://memolm.onrender.com",
  title = "Server Waking Up (Cold Start)",
  mode = "overlay",
  onDismiss,
}: ColdStartWarningProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (isLoading) {
      setDismissed(false);
      setElapsedSeconds(0);

      const startTime = Date.now();
      timer = setInterval(() => {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        setElapsedSeconds(secs);
        if (secs >= thresholdSeconds && !dismissed) {
          setIsVisible(true);
        }
      }, 500);
    } else {
      setIsVisible(false);
      setElapsedSeconds(0);
      setIsMinimized(false);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading, thresholdSeconds, dismissed]);

  if (!isLoading || !isVisible || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    setIsVisible(false);
    if (onDismiss) onDismiss();
  };

  // 1. INLINE MODE (Rendered inside card / chat / simulator)
  if (mode === "inline") {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-zinc-900/90 to-amber-950/30 p-4 shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-300">
        <div className="flex items-start gap-3.5">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Flame className="h-5 w-5 animate-pulse text-amber-400" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
                <span>{title}</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {elapsedSeconds}s elapsed
                </span>
              </h4>
              <button
                onClick={handleDismiss}
                className="text-zinc-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
              The backend is hosted on Render&apos;s free tier and spins down when idle. It is currently booting up (usually takes <span className="font-semibold text-amber-300">30–50 seconds</span> for the first request).
            </p>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-mono">
                <Zap className="h-3 w-3" /> Sub-20ms once warm
              </span>
              <span>•</span>
              <span className="font-mono truncate text-zinc-500">{serverUrl}</span>
            </div>
          </div>
        </div>

        {/* Progress bar animation */}
        <div className="mt-3 h-1 w-full bg-zinc-800/80 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-300 rounded-full transition-all duration-500"
            style={{ width: `${Math.min((elapsedSeconds / 45) * 100, 95)}%` }}
          />
        </div>
      </div>
    );
  }

  // 2. BANNER MODE (Sticky bottom or top banner)
  if (mode === "banner") {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="relative rounded-2xl border border-amber-500/40 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl ring-1 ring-amber-500/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                <Flame className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-200 flex items-center gap-2">
                  <span>Backend Server Waking Up</span>
                  <span className="font-mono text-[11px] px-2 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {elapsedSeconds}s
                  </span>
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Render container cold start in progress (~30-50s). Please keep this tab open.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleDismiss}
                className="text-xs text-zinc-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition-all"
              >
                Hide
              </button>
            </div>
          </div>

          <div className="mt-2.5 h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-500"
              style={{ width: `${Math.min((elapsedSeconds / 45) * 100, 95)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // 3. OVERLAY / MODAL MODE (Polished Floating Warning Screen)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-lg rounded-3xl border border-amber-500/30 bg-gradient-to-b from-zinc-900/95 via-zinc-950/98 to-zinc-900/95 p-6 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10 transition-all duration-300 ${
          isMinimized ? "p-4 max-w-md" : ""
        }`}
      >
        {/* Glowing ambient background blob */}
        <div className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-40 w-72 -translate-x-1/2 bg-amber-500/20 blur-3xl opacity-70" />

        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/40 shadow-inner">
              <Flame className="h-6 w-6 text-amber-400 animate-bounce" />
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-amber-500"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  <Clock className="h-3 w-3" />
                  Cold Start: {elapsedSeconds}s
                </span>
                <span className="text-[10px] font-mono text-zinc-500">Render Free Tier</span>
              </div>
              <h3 className="mt-1 text-base font-bold text-white tracking-tight">
                {title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              title={isMinimized ? "Expand" : "Minimize"}
            >
              {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              title="Close overlay"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!isMinimized && (
          <>
            {/* Body Explanation */}
            <div className="mt-4 space-y-3">
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                The MemoLM API backend is hosted on a free Render instance that automatically spins down after 15 minutes of inactivity.
              </p>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400 shrink-0" />
                  <span>Booting Docker Container & Qdrant Connection...</span>
                </div>
                <p className="text-xs text-zinc-400 leading-normal pl-6">
                  Initial startup usually requires <span className="font-semibold text-amber-300">30–50 seconds</span>. Your request is queued and will execute automatically as soon as the server is ready.
                </p>
              </div>

              {/* Highlighting performance after warm */}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-emerald-300 font-semibold text-[11px]">
                    <Zap className="h-3.5 w-3.5" /> Sub-20ms Latency
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Subsequent cached requests respond in under 20ms once warm.
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-2.5">
                  <div className="flex items-center gap-1.5 text-indigo-300 font-semibold text-[11px]">
                    <Server className="h-3.5 w-3.5" /> Multi-Tenant Cache
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Isolated semantic vector storage stays active during your session.
                  </p>
                </div>
              </div>
            </div>

            {/* Live Progress Bar */}
            <div className="mt-5 space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>Waking up container...</span>
                <span className="text-amber-400 font-semibold">{elapsedSeconds}s / ~45s</span>
              </div>
              <div className="h-2 w-full bg-zinc-800/90 rounded-full overflow-hidden p-0.5 border border-zinc-700/50">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-300 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                  style={{
                    width: `${Math.min(Math.max((elapsedSeconds / 45) * 100, 8), 96)}%`,
                  }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/[0.08]">
              <span className="text-[11px] font-mono text-zinc-500 truncate max-w-[240px]">
                Target: {serverUrl}
              </span>
              <button
                onClick={handleDismiss}
                className="px-4 py-1.5 text-xs font-semibold text-zinc-200 bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl transition-all shadow-sm"
              >
                Wait in Background
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
