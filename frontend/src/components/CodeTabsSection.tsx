"use client";

import React, { useState } from "react";
import {
  Check,
  Copy,
  Terminal,
  Code2,
  Cpu,
  Layers,
  Shield,
  Sparkles,
  Zap,
  Sliders,
  Database,
  Search,
  ArrowRight,
  Info,
} from "lucide-react";

type SdkTab =
  | "py-wrap"
  | "py-native"
  | "py-async"
  | "ts-native"
  | "ts-wrap"
  | "ts-stream"
  | "cache-admin"
  | "curl";

interface ModelOption {
  id: string;
  name: string;
  provider: "groq" | "openai" | "gemini" | "anthropic";
  badge: string;
  description: string;
}

const MODELS: ModelOption[] = [
  {
    id: "openai/gpt-oss-20b",
    name: "GPT-OSS 20B",
    provider: "groq",
    badge: "Groq Default",
    description: "Ultra-fast open-weight reasoning model hosted on Groq LPU",
  },
  {
    id: "openai/gpt-oss-120b",
    name: "GPT-OSS 120B",
    provider: "groq",
    badge: "Groq",
    description: "High-capability open-weight reasoning model hosted on Groq LPU",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    badge: "OpenAI",
    description: "Flagship multimodal frontier model from OpenAI",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    badge: "OpenAI",
    description: "Fast, cost-efficient model with high intelligence",
  },
  {
    id: "gemini-1.5-flash",
    name: "Gemini 1.5 Flash",
    provider: "gemini",
    badge: "Google",
    description: "Lightweight, sub-second latency model with long context",
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    provider: "anthropic",
    badge: "Anthropic",
    description: "Leading frontier model for coding and deep analysis",
  },
];

export function CodeTabsSection() {
  const [activeTab, setActiveTab] = useState<SdkTab>("py-wrap");
  const [selectedModel, setSelectedModel] = useState<string>("openai/gpt-oss-20b");
  const [copied, setCopied] = useState<boolean>(false);
  const [activeParamDoc, setActiveParamDoc] = useState<string | null>("knowledge_version");

  // Generate dynamic snippet depending on selected model
  const getSnippet = (tab: SdkTab, modelId: string): string => {
    switch (tab) {
      case "py-wrap":
        return `# 1. Drop-in OpenAI Wrapper (1-Line Zero Code Rewrite)
from openai import OpenAI
from memolm import wrap_openai

# Initialize standard OpenAI client and wrap it
openai_client = OpenAI(api_key="your-api-key")

client = wrap_openai(
    openai_client,
    gateway_url="https://memolm.onrender.com",
    knowledge_version="v12",          # Prevents serving outdated answers
    tenant_id="acme-corp",            # Strict tenant vector isolation
    risk="low",                       # Risk level policy ('low' | 'medium' | 'high')
    fallback_to_upstream=True         # Fails open to OpenAI if MemoLM gateway is offline
)

# Standard call sites remain 100% untouched
response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "system", "content": "You are a customer support specialist."},
        {"role": "user", "content": "What is the return and refund policy?"}
    ],
    temperature=0.7,
    max_tokens=500
)

# Access response content
print(response.choices[0].message.content)

# Access MemoLM explainability statistics
if hasattr(response, "memolm_stats") and response.memolm_stats:
    print(f"Safety Verdict:  {response.memolm_stats.verdict}")
    print(f"Similarity:      {response.memolm_stats.similarity:.3f}")
    print(f"Latency Saved:   {response.memolm_stats.latency_saved}s")
    print(f"Cost Incurred:   $" + "{response.memolm_stats.cost_incurred}")

# Print cumulative session ROI metrics
print(client.get_session_metrics())
# => Total: 12 | Hits: 10 (83.3%) | Latency Saved: 11.2s | Cost Saved: $0.052`;

      case "py-native":
        return `# 2. Native MemoLM Python Client (Full Control & Safety Gate)
from memolm import MemoLM, CacheMissError

# Initialize MemoLM client with default policy
client = MemoLM(
    base_url="https://memolm.onrender.com",
    api_key="memo-key",
    default_tenant="acme-corp",
    default_knowledge_version="v12",
    default_risk="low",
    max_retries=3,
    fallback_to_upstream=True,
    upstream_provider="groq"
)

# Execute query with fine-grained per-request cache controls
response = client.chat.completions.create(
    model="${modelId}",
    messages=[
        {"role": "system", "content": "You are an AI assistant."},
        {"role": "user", "content": "How do I upgrade my team subscription?"}
    ],
    knowledge_version="v12",          # Target knowledge version
    tenant_id="acme-corp",            # Multi-tenant isolation namespace
    risk="low",                       # Low risk (similarity threshold ~0.85)
    force_refresh=False,              # Set True to bypass cache & force fresh LLM call
    cache_only=False,                 # Set True to only accept cache hit ($0 cost)
    similarity_threshold=0.90,        # Custom similarity threshold override
    ttl_seconds=86400                 # Custom TTL override (24 hours)
)

print(response.content)
print(f"Verdict: {response.memolm_stats.verdict}")
print(f"Cached Query: {response.memolm_stats.matched_query}")`;

      case "py-async":
        return `# 3. Async & Real-time Streaming Client (AsyncMemoLM)
import asyncio
from memolm import AsyncMemoLM

async def main():
    # Asynchronous context manager manages connection pooling
    async with AsyncMemoLM(base_url="https://memolm.onrender.com") as client:
        
        # Real-time SSE Token-by-Token Streaming
        stream = await client.chat.completions.create(
            model="${modelId}",
            messages=[{"role": "user", "content": "Explain vector semantic caching."}],
            knowledge_version="v12",
            tenant_id="acme-corp",
            stream=True               # Returns async stream iterator
        )
        
        print("Streaming response:")
        async for chunk in stream:
            delta = chunk.choices[0].delta.content or ""
            print(delta, end="", flush=True)
            
        print("\\n\\nSession Metrics:", client.get_session_metrics())

asyncio.run(main())`;

      case "ts-native":
        return `// 4. Native TypeScript / JavaScript SDK (@memolm/sdk)
import { MemoLM } from "@memolm/sdk";

// Initialize type-safe MemoLM client
const client = new MemoLM({
  baseURL: "https://memolm.onrender.com",
  apiKey: "memo-key",
  defaultTenant: "acme-corp",
  defaultKnowledgeVersion: "v12",
  defaultRisk: "low",
  maxRetries: 2,
  fallbackToUpstream: true,
});

async function run() {
  const response = await client.chat.completions.create({
    model: "${modelId}",
    messages: [
      { role: "system", content: "You are a technical support agent." },
      { role: "user", content: "How do I configure webhook alerts?" }
    ],
    knowledgeVersion: "v12",
    tenantId: "acme-corp",
    risk: "low",
    similarityThreshold: 0.88,
    forceRefresh: false,
  });

  // Extract answer content
  console.log("Answer:", response.choices[0].message.content);
  
  // Explainability and Safety Gate telemetry
  console.log("Verdict:", response.memolm_stats?.verdict);
  console.log("Similarity:", response.memolm_stats?.similarity);
  console.log("Latency Saved:", response.memolm_stats?.latency_saved, "s");
  
  // Real-time Session ROI stats
  console.log("Session Metrics:", client.getSessionMetrics());
}

run();`;

      case "ts-wrap":
        return `// 5. TypeScript Drop-in OpenAI Wrapper (wrapOpenAI)
import OpenAI from "openai";
import { wrapOpenAI } from "@memolm/sdk";

// Initialize your existing OpenAI client instance
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

// Wrap existing client in 1 line
const client = wrapOpenAI(openai, {
  gatewayURL: "https://memolm.onrender.com",
  defaultKnowledgeVersion: "v12",
  defaultTenant: "acme-corp",
  defaultRisk: "low",
  fallbackToUpstream: true // Automatically fails open to OpenAI if gateway is offline
});

// Standard OpenAI SDK usage remains 100% identical
const response = await client.chat.completions.create({
  model: "${modelId}",
  messages: [
    { role: "user", content: "What is your enterprise SLA policy?" }
  ],
  temperature: 0.2
});

console.log(response.choices[0].message.content);
console.log("MemoLM Telemetry:", response.memolm_stats);
console.log("Session ROI:", client.getSessionMetrics());`;

      case "ts-stream":
        return `// 6. Real-Time Token Streaming in Next.js / Edge Runtimes
import { MemoLM } from "@memolm/sdk";

const client = new MemoLM({ baseURL: "https://memolm.onrender.com" });

export async function POST(req: Request) {
  const { prompt } = await req.json();

  // Stream completions with native AsyncIterable
  const stream = await client.chat.completions.create({
    model: "${modelId}",
    messages: [{ role: "user", content: prompt }],
    knowledgeVersion: "v12",
    tenantId: "acme-corp",
    stream: true,
  });

  // Convert to ReadableStream for web clients
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream" },
  });
}`;

      case "cache-admin":
        return `# 7. Active Cache Administration (Inspect, Seed & Invalidate)
from memolm import MemoLM, QAPair

client = MemoLM(base_url="https://memolm.onrender.com")

# A. Dry-run query inspection (Check match & safety gate before calling LLM)
inspection = client.cache.inspect(
    query="Can I return opened headphones?",
    tenant_id="acme-corp",
    version="v12",
    risk="low"
)
print("Inspection Verdict:", inspection["verdict"])           # "SAFE_CACHE_HIT"
print("Similarity Score:",  inspection["similarity"])        # 0.942
print("Rejection Reasons:", inspection["rejection_reasons"]) # []

# B. Bulk Pre-seed Knowledge Base / FAQ (Zero-latency instant cold hits)
client.cache.seed([
    QAPair(
        question="What is the refund window?",
        answer="All purchases can be returned within 30 days of receipt.",
        tenant_id="acme-corp",
        version="v12",
        risk="low"
    ),
    QAPair(
        question="Where are company headquarters located?",
        answer="MemoLM headquarters are located in San Francisco, CA.",
        tenant_id="acme-corp",
        version="v12"
    )
])

# C. Invalidate cached vectors on documentation or policy version update
client.cache.invalidate(tenant_id="acme-corp", version="v11")
print("Purged outdated v11 cache entries.")`;

      case "curl":
        return `# 8. Zero-Dependency cURL / HTTP REST Gateway
curl -X POST https://memolm.onrender.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer memo-key" \\
  -H "x-memolm-version: v12" \\
  -H "x-memolm-tenant: acme-corp" \\
  -H "x-memolm-risk: low" \\
  -H "x-memolm-force-refresh: false" \\
  -H "x-memolm-similarity-threshold: 0.88" \\
  -d '{
    "model": "${modelId}",
    "messages": [
      {
        "role": "user",
        "content": "What is the return policy for international orders?"
      }
    ],
    "temperature": 0.5,
    "max_tokens": 300,
    "stream": false
  }'`;

      default:
        return "";
    }
  };

  const currentSnippet = getSnippet(activeTab, selectedModel);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Syntax highlighting parser
  const renderHighlightedCode = (code: string) => {
    return code.split("\n").map((line, lineIndex) => {
      // Line formatting
      const isComment = line.trim().startsWith("#") || line.trim().startsWith("//");
      if (isComment) {
        return (
          <div key={lineIndex} className="table-row">
            <span className="table-cell pr-4 text-right select-none text-zinc-600 font-mono text-[11px]">
              {lineIndex + 1}
            </span>
            <span className="table-cell font-mono text-zinc-500 italic whitespace-pre">
              {line}
            </span>
          </div>
        );
      }

      // Tokenize line with regex for colors
      // Match keywords, strings, functions, numbers, arguments
      const tokens: { text: string; type: string }[] = [];
      let remaining = line;

      const patterns = [
        { type: "comment", regex: /^(\/\/|#).*$/ },
        { type: "string", regex: /^("[^"]*"|'[^']*'|`[^`]*`)/ },
        {
          type: "keyword",
          regex:
            /^(import|from|const|await|async|def|class|return|if|else|elif|for|while|try|except|with|as|export|function|new|let|var|yield)\b/,
        },
        { type: "boolean", regex: /^(True|False|true|false|None|null|undefined)\b/ },
        {
          type: "builtin",
          regex:
            /^(print|console|log|len|range|open|hasattr|dict|list|set|Response|ReadableStream|TextEncoder)\b/,
        },
        {
          type: "function",
          regex:
            /^(wrap_openai|wrapOpenAI|create|get_session_metrics|getSessionMetrics|inspect|seed|invalidate|complete|stream|run|main)\b/,
        },
        {
          type: "class",
          regex:
            /^(OpenAI|MemoLM|AsyncMemoLM|QAPair|ChatCompletion|ChatCompletionChunk|SessionMetrics|CacheMissError)\b/,
        },
        {
          type: "property",
          regex:
            /^(model|messages|role|content|knowledge_version|knowledgeVersion|tenant_id|tenantId|risk|force_refresh|forceRefresh|cache_only|cacheOnly|similarity_threshold|similarityThreshold|ttl_seconds|stream|fallback_to_upstream|fallbackToUpstream|gateway_url|gatewayURL|base_url|baseURL|api_key|apiKey|max_retries|maxRetries|upstream_provider|temperature|max_tokens)\b(?=\s*[:=])/,
        },
        { type: "number", regex: /^\b(\d+(\.\d+)?)\b/ },
        { type: "operator", regex: /^(===|!==|==|!=|<=|>=|=>|\+|-|\*|\/|=|>|<|:)/ },
        { type: "other", regex: /^(\s+|[a-zA-Z_]\w*|[^\s\w])/ },
      ];

      while (remaining.length > 0) {
        let matched = false;
        for (const pattern of patterns) {
          const match = remaining.match(pattern.regex);
          if (match) {
            tokens.push({ text: match[0], type: pattern.type });
            remaining = remaining.slice(match[0].length);
            matched = true;
            break;
          }
        }
        if (!matched) {
          tokens.push({ text: remaining[0], type: "other" });
          remaining = remaining.slice(1);
        }
      }

      return (
        <div key={lineIndex} className="table-row leading-relaxed hover:bg-white/[0.02]">
          <span className="table-cell pr-4 text-right select-none text-zinc-600 font-mono text-[11px] w-8">
            {lineIndex + 1}
          </span>
          <span className="table-cell font-mono whitespace-pre">
            {tokens.map((token, tokenIdx) => {
              let colorClass = "text-zinc-200";
              if (token.type === "keyword") colorClass = "text-purple-400 font-medium";
              else if (token.type === "string") colorClass = "text-emerald-300";
              else if (token.type === "boolean") colorClass = "text-rose-400 font-medium";
              else if (token.type === "function") colorClass = "text-sky-300 font-medium";
              else if (token.type === "class") colorClass = "text-yellow-300 font-semibold";
              else if (token.type === "builtin") colorClass = "text-cyan-300";
              else if (token.type === "property") colorClass = "text-amber-300";
              else if (token.type === "number") colorClass = "text-fuchsia-300";
              else if (token.type === "operator") colorClass = "text-zinc-400";
              else if (token.type === "comment") colorClass = "text-zinc-500 italic";

              return (
                <span key={tokenIdx} className={colorClass}>
                  {token.text}
                </span>
              );
            })}
          </span>
        </div>
      );
    });
  };

  const PARAMETERS = [
    {
      name: "model",
      type: "string",
      default: '"openai/gpt-oss-20b"',
      desc: "Target model ID across Groq, OpenAI, Gemini, or Anthropic.",
      example: 'model="openai/gpt-oss-20b"',
    },
    {
      name: "knowledge_version",
      type: "string",
      default: '"v1"',
      desc: "Prevents stale data. Bumping version instantly invalidates outdated cache entries.",
      example: 'knowledge_version="v12"',
    },
    {
      name: "tenant_id",
      type: "string",
      default: '"default-tenant"',
      desc: "Enforces strict tenant namespace isolation in vector storage.",
      example: 'tenant_id="acme-corp"',
    },
    {
      name: "risk",
      type: '"low" | "medium" | "high"',
      default: '"low"',
      desc: "Controls Safety Gate strictness. High risk enforces tighter similarity cutoff.",
      example: 'risk="low"',
    },
    {
      name: "similarity_threshold",
      type: "float (0.0 - 1.0)",
      default: "0.85",
      desc: "Minimum cosine similarity score required for a semantic cache hit.",
      example: "similarity_threshold=0.92",
    },
    {
      name: "force_refresh",
      type: "boolean",
      default: "false",
      desc: "Bypasses cache lookup, calls upstream LLM fresh, and updates cache.",
      example: "force_refresh=True",
    },
    {
      name: "cache_only",
      type: "boolean",
      default: "false",
      desc: "Guaranteed $0 cost. If not in cache, raises CacheMissError without billing LLM.",
      example: "cache_only=True",
    },
    {
      name: "fallback_to_upstream",
      type: "boolean",
      default: "true",
      desc: "Zero-downtime fail-open: routes directly to LLM if gateway is unreachable.",
      example: "fallback_to_upstream=True",
    },
  ];

  return (
    <section id="quickstart" className="py-20 md:py-28 border-t border-white/[0.06] bg-[#050508] relative">
      {/* Background glow */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-indigo-600/10 blur-[130px] rounded-full" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1 text-xs font-mono text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.15)]">
            <Terminal className="h-3.5 w-3.5 text-indigo-400" />
            <span>Multi-Language SDK & API Reference</span>
          </div>
          <h2 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Integrate in 60 Seconds
          </h2>
          <p className="mt-4 text-sm sm:text-base text-zinc-400">
            Type-safe Python and TypeScript SDKs, 1-line OpenAI drop-in wrappers, and direct HTTP proxies with explainable Safety Gate stats.
          </p>
        </div>

        {/* Dynamic Model Selector Bar */}
        <div className="mt-10 max-w-5xl mx-auto rounded-xl border border-white/[0.08] bg-zinc-950/60 p-3.5 backdrop-blur-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-mono font-semibold text-white">Select Upstream Model Target:</span>
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Updates code snippets below dynamically
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
            {MODELS.map((m) => {
              const isSelected = selectedModel === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`flex flex-col text-left p-2 rounded-lg border transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500/10 text-white shadow-[0_0_12px_rgba(99,102,241,0.2)]"
                      : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-white hover:border-white/[0.15]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold">{m.name}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{m.badge}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Code Tabs Window */}
        <div className="mt-6 max-w-5xl mx-auto rounded-2xl border border-white/[0.1] bg-[#07070a] shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden">
          {/* Window Chrome Header */}
          <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] bg-[#090b10] px-4 py-3 gap-3">
            {/* Tab navigation */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setActiveTab("py-wrap")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "py-wrap"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>Python (wrap_openai)</span>
              </button>

              <button
                onClick={() => setActiveTab("py-native")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "py-native"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>Python Native</span>
              </button>

              <button
                onClick={() => setActiveTab("py-async")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "py-async"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>Python Async & SSE</span>
              </button>

              <button
                onClick={() => setActiveTab("ts-native")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "ts-native"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>TypeScript (@memolm/sdk)</span>
              </button>

              <button
                onClick={() => setActiveTab("ts-wrap")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "ts-wrap"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>TypeScript (wrapOpenAI)</span>
              </button>

              <button
                onClick={() => setActiveTab("cache-admin")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "cache-admin"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>Cache Admin & Seed</span>
              </button>

              <button
                onClick={() => setActiveTab("curl")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono transition-all ${
                  activeTab === "curl"
                    ? "bg-indigo-600/30 text-indigo-300 font-medium border border-indigo-500/40 shadow-sm"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <span>cURL Gateway</span>
              </button>
            </div>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-zinc-900 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copied to Clipboard</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                  <span>Copy Snippet</span>
                </>
              )}
            </button>
          </div>

          {/* Syntax Highlighted Editor View */}
          <div className="p-4 sm:p-6 overflow-x-auto bg-[#030407]">
            <div className="table w-full border-collapse">
              {renderHighlightedCode(currentSnippet)}
            </div>
          </div>

          {/* Code Footer Legend */}
          <div className="flex flex-wrap items-center justify-between border-t border-white/[0.06] bg-[#090b10] px-4 py-2.5 text-[11px] font-mono text-zinc-500 gap-2">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-400" /> Keywords
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-sky-400" /> Functions
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Strings
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Parameters
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-yellow-400" /> Classes
              </span>
            </div>
            <div className="text-zinc-400">
              Selected: <span className="text-indigo-300 font-semibold">{selectedModel}</span>
            </div>
          </div>
        </div>

        {/* Parameter & Model Selection Reference Grid */}
        <div className="mt-12 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-400" />
              <h3 className="text-base font-bold text-white font-mono">SDK Parameter & Policy Reference</h3>
            </div>
            <span className="text-xs font-mono text-zinc-500">Supports sync, async & streaming across all providers</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {PARAMETERS.map((p) => (
              <div
                key={p.name}
                onClick={() => setActiveParamDoc(p.name)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  activeParamDoc === p.name
                    ? "border-indigo-500/50 bg-indigo-500/5 shadow-md shadow-indigo-500/10"
                    : "border-white/[0.06] bg-zinc-950/40 hover:border-white/[0.12]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-amber-300">{p.name}</span>
                  <span className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 rounded bg-white/[0.03]">
                    {p.type}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                  {p.desc}
                </p>
                <div className="mt-2 text-[11px] font-mono text-zinc-500 bg-[#040507] p-1.5 rounded border border-white/[0.04]">
                  Default: <span className="text-zinc-300">{p.default}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
