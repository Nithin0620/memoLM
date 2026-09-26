import { MemoLM } from "../src/index";

async function main() {
  const client = new MemoLM({
    baseURL: process.env.MEMOLM_BASE_URL || "http://localhost:8000",
    defaultKnowledgeVersion: "v12",
  });

  console.log("==================================================");
  console.log("MemoLM TypeScript SDK - Non-Streaming Demo");
  console.log("==================================================");

  // 1. First Call: Cold Request (Cache Miss -> LLM Call)
  console.log("\n[Request 1]: Asking question for the first time...");
  const start1 = performance.now();
  const res1 = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "user", content: "What is the capital of France?" },
    ],
    knowledgeVersion: "v12",
    tenantId: "acme-corp",
  });
  const time1 = (performance.now() - start1).toFixed(0);

  console.log(`Answer: ${res1.choices[0].message.content}`);
  console.log(`Latency: ${time1}ms`);
  console.log(`MemoLM Stats:`, res1.memolm_stats || "Fresh LLM Response (Saved to Cache)");

  // 2. Second Call: Semantic Cache Hit (~20ms)
  console.log("\n[Request 2]: Asking the exact same question again...");
  const start2 = performance.now();
  const res2 = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "user", content: "What is the capital of France?" },
    ],
    knowledgeVersion: "v12",
    tenantId: "acme-corp",
  });
  const time2 = (performance.now() - start2).toFixed(0);

  console.log(`Answer: ${res2.choices[0].message.content}`);
  console.log(`Latency: ${time2}ms (Speedup: ${(Number(time1) / Math.max(Number(time2), 1)).toFixed(1)}x)`);
  console.log(`MemoLM Stats:`, res2.memolm_stats);

  // 3. Third Call: Safety Gate Invalidation (Knowledge Version bumped to v13)
  console.log("\n[Request 3]: Knowledge version updated to v13 (Safety Gate invalidation)...");
  const start3 = performance.now();
  const res3 = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "user", content: "What is the capital of France?" },
    ],
    knowledgeVersion: "v13", // Bumped version!
    tenantId: "acme-corp",
  });
  const time3 = (performance.now() - start3).toFixed(0);

  console.log(`Answer: ${res3.choices[0].message.content}`);
  console.log(`Latency: ${time3}ms (Stale v12 rejected -> Fresh LLM call)`);
  console.log(`MemoLM Stats:`, res3.memolm_stats || "Safety Invalidation Passed -> Fresh LLM");
}

main().catch(console.error);
