import assert from "node:assert/strict";
import { AnthropicStructuredLlm, MinerResponseSchema } from "../src/engine";
import { toToolInputSchema } from "../src/engine/core/llm";

async function main() {
  const js = toToolInputSchema(MinerResponseSchema);
  assert.equal(js.type, "object");
  assert.ok(!("$schema" in js));

  const bad = { clips: [{ startSegmentId: 5, endSegmentId: 2, topic: "x", category: "tecnico", hookText: "hook ok", rationale: "razón suficiente", viralityScore: 150, valueDensity: 50 }] };
  const good = { clips: [{ startSegmentId: 2, endSegmentId: 5, topic: "Tema ok", category: "tecnico", hookText: "hook ok", rationale: "razón suficiente", viralityScore: 80, valueDensity: 50 }] };
  const sent: any[] = [];
  let n = 0;
  const client: any = { messages: { create: async (body: any) => {
    sent.push(structuredClone(body));
    const input = n++ === 0 ? bad : good;
    return { stop_reason: "tool_use", usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: "tool_use", id: `tu_${n}`, name: body.tool_choice.name, input }] };
  } } };

  const llm = new AnthropicStructuredLlm({ client, defaultModel: "test" });
  const r = await llm.generate({ system: "s", prompt: "p", schema: MinerResponseSchema, schemaName: "report_clips", schemaDescription: "d" });
  assert.equal(r.attempts, 2);
  assert.equal(r.usage.inputTokens, 20);
  const last = sent[1].messages.at(-1).content[0];
  assert.equal(last.type, "tool_result"); assert.equal(last.is_error, true);
  console.log("LLM retry OK ✔\n--- error devuelto al modelo ---\n" + last.content);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
