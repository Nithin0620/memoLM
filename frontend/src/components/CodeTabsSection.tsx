"use client";

import React, { useState } from "react";
import { Check, Copy, Terminal, Code2 } from "lucide-react";

export function CodeTabsSection() {
  const [activeTab, setActiveTab] = useState<"py-wrap" | "py-native" | "ts-native" | "curl">("py-wrap");
  const [copied, setCopied] = useState<boolean>(false);

  const snippets = {
    "py-wrap": `# 1. Drop-in OpenAI Wrapper (Zero Code Rewrite)
from openai import OpenAI
from memolm import wrap_openai

# Wrap your existing OpenAI client in 1 line
client = wrap_openai(
    OpenAI(),
    gateway_url="http://localhost:8000",
    knowledge_version="v12",
    tenant_id="acme-corp",
    fallback_to_upstream=True  # Automatically fails open to OpenAI if gateway is offline
)

# Standard call sites remain completely untouched
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is the return policy?"}],
)

print(response.choices[0].message.content)
print(f"Safety Verdict: {response.memolm_stats.verdict}")
print(f"Latency Saved: {response.memolm_stats.latency_saved}s")`,

    "py-native": `# 2. Using the Native MemoLM Python Client
from memolm import MemoLM

client = MemoLM(
    base_url="http://localhost:8000",
    default_knowledge_version="v12",
    default_tenant="acme-corp",
    default_risk="low"
)

response = client.chat.completions.create(
    model="openai/gpt-oss-20b",
    messages=[{"role": "user", "content": "How do refunds work?"}],
    knowledge_version="v12",
    force_refresh=False,       # Set True to bypass cache
    similarity_threshold=0.92, # Custom similarity override
)

print(response.content)
print(client.get_session_metrics())`,

    "ts-native": `// 3. TypeScript & Node.js Native SDK
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({
  baseURL: "http://localhost:8000",
  defaultKnowledgeVersion: "v12",
  defaultTenant: "acme-corp",
  defaultRisk: "low",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-oss-20b",
  messages: [{ role: "user", content: "What is the refund policy?" }],
  knowledgeVersion: "v12",
});

console.log(response.choices[0].message.content);
console.log("Stats:", response.memolm_stats);
console.log(client.getSessionMetrics());`,

    curl: `# 4. Zero-Dependency cURL / HTTP Proxy
curl -X POST http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "x-memolm-version: v12" \\
  -H "x-memolm-tenant: acme-corp" \\
  -H "x-memolm-risk: low" \\
  -d '{
    "model": "openai/gpt-oss-20b",
    "messages": [
      {"role": "user", "content": "What is the refund policy?"}
    ]
  }'`,
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="quickstart" className="py-20 md:py-28 border-t border-white/[0.06] bg-[#050508] relative">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-xs font-mono text-zinc-300">
            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            <span>Developer Quickstart</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Integration in Under 60 Seconds
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Integrate with Python, TypeScript, or any OpenAI-compatible client with zero architecture changes.
          </p>
        </div>

        {/* 3 Step Flow */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <div className="card-slick rounded-xl p-5">
            <div className="font-mono text-xs text-indigo-400 font-bold">01 / INSTALL</div>
            <h4 className="mt-2 text-xs font-bold text-white uppercase tracking-wider font-mono">Install Package</h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed font-sans">
              Add the lightweight client to your project via pip or npm.
            </p>
            <div className="mt-3 rounded bg-[#030304] p-2 font-mono text-xs text-zinc-300 border border-white/[0.06]">
              pip install memolm
            </div>
          </div>

          <div className="card-slick rounded-xl p-5">
            <div className="font-mono text-xs text-purple-400 font-bold">02 / TARGET</div>
            <h4 className="mt-2 text-xs font-bold text-white uppercase tracking-wider font-mono">Point to Gateway</h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed font-sans">
              Set base URL to your local or deployed MemoLM instance.
            </p>
            <div className="mt-3 rounded bg-[#030304] p-2 font-mono text-xs text-zinc-300 border border-white/[0.06]">
              base_url=&quot;http://localhost:8000&quot;
            </div>
          </div>

          <div className="card-slick rounded-xl p-5">
            <div className="font-mono text-xs text-emerald-400 font-bold">03 / PROTECT</div>
            <h4 className="mt-2 text-xs font-bold text-white uppercase tracking-wider font-mono">Pass Safety Tags</h4>
            <p className="mt-1 text-xs text-zinc-400 leading-relaxed font-sans">
              Pass your knowledge version and tenant tag for protection.
            </p>
            <div className="mt-3 rounded bg-[#030304] p-2 font-mono text-xs text-zinc-300 border border-white/[0.06]">
              knowledge_version=&quot;v12&quot;
            </div>
          </div>
        </div>

        {/* Editor Window */}
        <div className="mt-8 max-w-4xl mx-auto rounded-xl border border-white/[0.08] bg-[#070709] shadow-2xl overflow-hidden">
          {/* Editor Header */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/[0.06] bg-zinc-950/70 px-4 py-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("py-wrap")}
                className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                  activeTab === "py-wrap"
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Python (wrap_openai)
              </button>
              <button
                onClick={() => setActiveTab("py-native")}
                className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                  activeTab === "py-native"
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Python Native
              </button>
              <button
                onClick={() => setActiveTab("ts-native")}
                className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                  activeTab === "ts-native"
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                TypeScript / Node
              </button>
              <button
                onClick={() => setActiveTab("curl")}
                className={`rounded px-3 py-1 text-xs font-mono transition-colors ${
                  activeTab === "curl"
                    ? "bg-zinc-800 text-white font-medium"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                cURL Proxy
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          {/* Editor Body */}
          <div className="p-5 overflow-x-auto bg-[#030304]">
            <pre className="font-mono text-xs sm:text-[13px] text-zinc-300 leading-relaxed whitespace-pre">
              {snippets[activeTab]}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
