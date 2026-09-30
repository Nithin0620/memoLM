import { NextRequest, NextResponse } from "next/server";

const DEFAULT_GROQ_KEY = process.env.GROQ_API_KEY || "";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model = "openai/gpt-oss-20b", temperature = 0.7, max_tokens = 500, apiKey } = body;

    const effectiveKey = apiKey || DEFAULT_GROQ_KEY;
    const t0 = performance.now();

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temperature,
        max_tokens: max_tokens,
      }),
    });

    const data = await groqRes.json();
    const latencyMs = Math.round(performance.now() - t0);

    if (!groqRes.ok) {
      return NextResponse.json(
        { error: data.error?.message || "Groq API error", details: data },
        { status: groqRes.status }
      );
    }

    const content = data.choices?.[0]?.message?.content || "";
    const tokens = data.usage?.total_tokens || 350;
    const costUsd = Number((tokens * 0.00001).toFixed(5));

    return NextResponse.json({
      status: "ok",
      content,
      latencyMs,
      tokensBilled: tokens,
      costUsd,
      model,
      raw: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to contact Groq API" },
      { status: 500 }
    );
  }
}
