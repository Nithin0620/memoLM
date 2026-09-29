"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: "What happens if the MemoLM Gateway goes down?",
      a: "MemoLM is architected with a strict Fail-Open guarantee. Both the Python and TypeScript SDKs (and wrap_openai) intercept connection drops and transparently route requests directly to your primary LLM provider (Groq, OpenAI, or Gemini) without throwing exceptions to your end-users.",
    },
    {
      q: "How does knowledge version invalidation work without database purges?",
      a: "MemoLM tags every cached vector embedding with a knowledge_version attribute in Qdrant's payload metadata. When your application bumps to 'v13', the Safety Gate rejects matches tagged with older versions during candidate evaluation. This prompts a fresh LLM generation that writes back the updated answer under 'v13'.",
    },
    {
      q: "Does MemoLM support real-time streaming (Server-Sent Events)?",
      a: "Yes. Cache hits are streamed token-by-token with realistic micro-intervals (~10ms) so frontends preserve typing effects without delay. On cache misses, MemoLM proxies the live LLM stream directly while asynchronously saving the completed response to Qdrant.",
    },
    {
      q: "How does MemoLM differ from Redis exact caches or standard LangChain semantic caches?",
      a: "Redis only matches verbatim strings. LangChain's semantic cache blindly returns any match above a similarity threshold, even if documentation updated or data belongs to another tenant. MemoLM enforces a deterministic Safety Gate verifying version, dynamic TTL, cryptographic tenant isolation, and risk margins before serving.",
    },
    {
      q: "Can I pre-seed known FAQ or documentation answers before users ask?",
      a: "Yes. Use client.cache.seed() in either the Python or TypeScript SDK to warm up Q&A pairs directly into Qdrant. The first user asking any semantic paraphrase receives an instant 18ms hit at $0 token cost.",
    },
  ];

  return (
    <section className="py-20 md:py-28 border-t border-white/[0.06] bg-[#050508] relative">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <HelpCircle className="h-3.5 w-3.5 text-zinc-400" />
            <span>Architecture FAQ</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Frequently Asked Questions
          </h2>
        </div>

        <div className="mt-12 space-y-2">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden transition-colors"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-4 sm:p-5 text-left text-xs sm:text-sm font-mono font-medium text-zinc-300 hover:text-white"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-white" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs text-zinc-400 leading-relaxed border-t border-white/[0.04] pt-3 font-sans">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
