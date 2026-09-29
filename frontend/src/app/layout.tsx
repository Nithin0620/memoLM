import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MemoLM — Intelligent LLM Response Firewall & Safe Semantic Cache",
  description:
    "Drop-in OpenAI & Groq compatible proxy that prevents unnecessary LLM calls by serving cached answers only when they are semantically relevant and verified safe to reuse.",
  keywords: [
    "llm cache",
    "semantic cache",
    "response firewall",
    "ai gateway",
    "openai proxy",
    "qdrant",
    "groq",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark scroll-smooth">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>" />
      </head>
      <body className="min-h-screen bg-[#09090b] text-[#f4f4f5] antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
