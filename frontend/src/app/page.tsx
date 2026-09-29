"use client";

import React from "react";
import { Navbar } from "@/components/Navbar";
import { HeroSection } from "@/components/HeroSection";
import { InteractiveSimulator } from "@/components/InteractiveSimulator";
import { ProblemVsSolution } from "@/components/ProblemVsSolution";
import { ArchitectureSection } from "@/components/ArchitectureSection";
import { FeaturesBento } from "@/components/FeaturesBento";
import { CodeTabsSection } from "@/components/CodeTabsSection";
import { RoiCalculator } from "@/components/RoiCalculator";
import { FaqSection } from "@/components/FaqSection";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-[#09090b] text-[#f4f4f5]">
      {/* Top Fixed / Sticky Navigation */}
      <Navbar />

      {/* Main Landing Page Flow */}
      <main>
        {/* 1. Hero with Announcement, Copyable Quick Install, and Value Proposition */}
        <HeroSection />

        {/* 2. Interactive Simulator (The Star Hero Demo) */}
        <InteractiveSimulator />

        {/* 3. Problem vs Solution: Why Naive Caching Breaks in Production */}
        <ProblemVsSolution />

        {/* 4. Architectural Deep Dive: The 4 Internal Engine Pillars */}
        <ArchitectureSection />

        {/* 5. Enterprise Scale Bento Grid: Multi-Tenant, Dynamic TTL, Fail-Open */}
        <FeaturesBento />

        {/* 6. How to Start: 60-Second Onboarding with Code Tabs (Python, TS, cURL) */}
        <CodeTabsSection />

        {/* 7. Interactive ROI & Cost Savings Calculator */}
        <RoiCalculator />

        {/* 8. Developer FAQ Accordion */}
        <FaqSection />
      </main>

      {/* Footer with Documentation & Resources */}
      <Footer />
    </div>
  );
}
