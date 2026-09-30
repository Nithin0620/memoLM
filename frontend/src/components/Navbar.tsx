"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import logo from "../assets/image.png";
import {
  Github,
  ArrowUpRight,
  Menu,
  X,
  MessageSquare,
  Sparkles,
  Terminal,
  Activity,
  Layers,
  Calculator,
  ChevronRight,
  Scale,
  Flame,
  Clock,
  Info,
} from "lucide-react";

export function Navbar() {
  const [gatewayOnline, setGatewayOnline] = useState<boolean | null>(null);
  const [showColdStartModal, setShowColdStartModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("https://memolm.onrender.com/openapi.json", {
          method: "HEAD",
          signal: AbortSignal.timeout(2000),
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

  const NAV_ITEMS = [
    { label: "Architecture", href: "/#how-it-works" },
    { label: "Simulator", href: "/#demo" },
    { label: "Compare vs Groq", href: "/compare" },
    { label: "Quickstart", href: "/#quickstart" },
    { label: "Calculator", href: "/#roi-calculator" },
  ];

  return (
    <header className="sticky top-0 z-50 w-full pt-2 pb-2 px-3 sm:px-6 transition-all duration-300">
      {/* Floating Glassmorphic Container */}
      <div
        className={`mx-auto max-w-6xl rounded-2xl transition-all duration-300 ${
          scrolled
            ? "bg-[#08090d]/80 backdrop-blur-2xl border border-white/[0.09] shadow-[0_16px_36px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.08)]"
            : "bg-[#08090d]/50 backdrop-blur-md border border-white/[0.05] shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_0_rgba(255,255,255,0.04)]"
        }`}
      >
        <div className="flex h-13 items-center justify-between px-3.5 sm:px-5 py-2">
          {/* Brand & Status */}
          <div className="flex items-center gap-3.5">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="h-8 w-8 overflow-hidden rounded-full">
                <Image
                  src={logo}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full rounded-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              </div>

              {/* Title & Version */}
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[15px] tracking-tight text-white group-hover:text-zinc-100 transition-colors">
                  memo
                  <span className="text-indigo-400 font-mono font-normal">
                    LM
                  </span>
                </span>
              </div>
            </Link>

            {/* Live Gateway Indicator */}
            <button
              onClick={() => setShowColdStartModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-[11px] font-mono transition-all group"
              title="Click for Server Status & Cold Start Info"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  gatewayOnline === true
                    ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              <span className="text-zinc-400 group-hover:text-zinc-200">
                {gatewayOnline === true ? "Gateway: Online" : "Render Cold Start"}
              </span>
              {gatewayOnline !== true && (
                <Flame className="h-3 w-3 text-amber-400 animate-bounce" />
              )}
            </button>
          </div>

          {/* Desktop Navigation Links */}
          <nav
            className="hidden lg:flex items-center gap-1 bg-white/[0.02] border border-white/[0.05] rounded-xl p-1 shadow-inner"
            onMouseLeave={() => setHoveredTab(null)}
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHoveredTab(item.label)}
                className={`relative px-3 py-1.5 text-[12.5px] font-medium tracking-tight rounded-lg transition-colors duration-150 ${
                  hoveredTab === item.label
                    ? "text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {hoveredTab === item.label && (
                  <span className="absolute inset-0 rounded-lg bg-white/[0.06] border border-white/[0.06] -z-10 transition-all duration-150" />
                )}
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <a
              href="https://github.com/Nithin0620/memoLM"
              target="_blank"
              rel="noreferrer"
              className="hidden md:flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-white/[0.18] hover:bg-white/[0.06] hover:text-white transition-all shadow-sm"
            >
              <Github className="h-3.5 w-3.5 text-zinc-400" />
              <span>Star</span>
            </a>

            {/* Action CTAs */}
            <Link
              href="/compare"
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-all shadow-sm"
            >
              <Scale className="h-3.5 w-3.5 text-indigo-400" />
              <span>Compare vs Groq</span>
            </Link>

            {/* Primary Action Button */}
            <Link
              href="/chat"
              className="relative group flex items-center gap-2 rounded-xl bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-zinc-100 active:scale-[0.98] transition-all duration-150 shadow-[0_0_20px_rgba(255,255,255,0.18),inset_0_1px_0_0_rgba(255,255,255,0.8)]"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-600 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-600" />
              </span>
              <span>Live Chat</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle mobile menu"
              className="flex lg:hidden p-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="h-4.5 w-4.5" />
              ) : (
                <Menu className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/[0.07] px-4 py-4 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
            {/* Gateway status */}
            <div className="flex items-center justify-between p-2.5 rounded-xl border border-white/[0.06] bg-black/40 text-xs font-mono text-zinc-300">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    gatewayOnline === true
                      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                      : "bg-amber-400"
                  }`}
                />
                <span>
                  Gateway:{" "}
                  {gatewayOnline === true ? "Online" : "Simulated"}
                </span>
              </div>
              <span className="text-[10px] text-zinc-500">FastAPI</span>
            </div>

            {/* Mobile Nav items */}
            <div className="flex flex-col space-y-1 pt-1">
              <Link
                href="/chat"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-300 font-mono"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <span>Realtime Chat (SDK)</span>
                </div>
                <ChevronRight className="w-4 h-4 text-indigo-400" />
              </Link>

              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-between p-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                >
                  <span>{item.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                </Link>
              ))}

              <a
                href="https://github.com/Nithin0620/memoLM"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Github className="w-4 h-4 text-zinc-400" />
                  <span>GitHub Repository</span>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-zinc-600" />
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Cold Start Information Modal */}
      {showColdStartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-[#0c0e14] p-6 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                  <Flame className="h-6 w-6 animate-pulse text-amber-400" />
                </div>
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Render Free Tier Notice
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Backend Server Cold Start
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setShowColdStartModal(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <p>
                The backend API is deployed on <span className="font-semibold text-white">Render&apos;s free tier</span>. To conserve resources, the container enters sleep mode after 15 minutes of inactivity.
              </p>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                  <Clock className="h-3.5 w-3.5" /> Initial Boot Delay: 30–50 Seconds
                </div>
                <p className="text-xs text-zinc-400">
                  When waking from sleep, the first request will take roughly 30–50 seconds to initialize Qdrant vector storage and the FastAPI gateway.
                </p>
              </div>
              <p className="text-xs text-emerald-400 font-mono">
                ⚡ Once awake, all cached queries respond in sub-20ms!
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between pt-3 border-t border-white/[0.08]">
              <span className="text-[11px] font-mono text-zinc-500 truncate">
                https://memolm.onrender.com
              </span>
              <button
                onClick={() => setShowColdStartModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-zinc-950 bg-white hover:bg-zinc-200 rounded-xl transition-all shadow-sm"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
