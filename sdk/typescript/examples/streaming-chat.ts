import { MemoLM } from "../src/index";

async function main() {
  const client = new MemoLM({
    baseURL: process.env.MEMOLM_BASE_URL || "http://localhost:8000",
    defaultKnowledgeVersion: "v12",
  });

  console.log("==================================================");
  console.log("MemoLM TypeScript SDK - Live Streaming Demo");
  console.log("==================================================");

  const question = "Explain how quicksort algorithm works in 2 short paragraphs.";

  console.log(`\nUser: ${question}`);
  console.log("AI (Streaming): ");

  const stream = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [{ role: "user", content: question }],
    knowledgeVersion: "v12",
    tenantId: "acme-corp",
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      process.stdout.write(delta);
    }
  }

  console.log("\n\n[Done Streaming]");
}

main().catch(console.error);
