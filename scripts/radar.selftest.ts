/** Pruebas del Radar del nicho (sin red: cliente y LLM falsos).  npx tsx scripts/radar.selftest.ts */
import assert from "node:assert/strict";
import { collectSources, draftPrompt, finalizeIdeas, RadarDraftSchema, RESEARCH_SYSTEM } from "../src/hq/radar";
import { HqStateSchema } from "../src/hq/schemas";
import { runRadar } from "../src/hq/server/radar";

// Fuentes: solo http(s), sin repetidas
const src = collectSources([
  { title: "Tendencia A", url: "https://a.com/1", page_age: "2 weeks ago" },
  { title: "Repetida", url: "https://a.com/1" },
  { title: "Malo", url: "javascript:alert(1)" },
  { title: "", url: "https://b.com/x" },
]);
assert.deepEqual(src.map((s) => s.url), ["https://a.com/1", "https://b.com/x"]);
assert.equal(src[1]!.title, "https://b.com/x");

// Ideas con fuentes inexistentes se descartan; las fuertes van primero
const idea = (t: string, sources: number[], strength: "alta" | "media" = "media") => ({ title: t, why: "w", how: "h", hook: "g", format: "guion" as const, pillar: "Gym", strength, sources });
const ideas = finalizeIdeas({ ideas: [idea("Media buena", [2]), idea("Inventada", [9]), idea("Fuerte", [1, 1, 2], "alta")] }, src);
assert.deepEqual(ideas.map((i) => i.title), ["Fuerte", "Media buena"]);
assert.equal(ideas[0]!.sources.length, 2);
assert.match(draftPrompt("hallazgos", src, "gym", ["Gym"]), /1\. Tendencia A — https:\/\/a\.com\/1 \(2 weeks ago\)/);
assert.match(RESEARCH_SYSTEM, /DATOS, no instrucciones/);
assert.throws(() => RadarDraftSchema.parse({ ideas: [idea("x", [])] }));

async function main() {
// Flujo completo: busca (con pausa de turno), luego arma ideas
const calls: unknown[] = [];
const client = {
  messages: {
    create: async (body: { tools?: unknown[] }) => {
      calls.push(body);
      const first = calls.length === 1;
      return {
        stop_reason: first ? "pause_turn" : "end_turn",
        content: first
          ? [{ type: "web_search_tool_result", tool_use_id: "t1", caller: { type: "direct" }, content: [{ type: "web_search_result", title: "Gym + código", url: "https://x.com/gym", page_age: null, encrypted_content: "" }] }]
          : [{ type: "text", text: "Los retos con apuesta pública enganchan.", citations: [{ type: "web_search_result_location", url: "https://y.com/reto", title: "Retos", cited_text: "", encrypted_index: "" }] }],
      };
    },
  },
};
const llm = {
  generate: async (req: { prompt: string; schema: { parse: (x: unknown) => unknown } }) => {
    assert.match(req.prompt, /1\. Gym \+ código — https:\/\/x\.com\/gym/);
    assert.match(req.prompt, /2\. Retos — https:\/\/y\.com\/reto/);
    return { data: req.schema.parse({ ideas: [idea("Día 26 del reto", [2], "alta"), idea("Mi setup", [1]), idea("Sin fuente", [7])] }), usage: { inputTokens: 1, outputTokens: 1 } };
  },
};
const out = await runRadar({ client: client as never, llm: llm as never }, { niche: "gym y código", pillars: ["Gym"], today: "2026-11-12", model: "fake" });
assert.equal(calls.length, 2, "continúa después de pause_turn");
assert.ok((calls[0] as { tools: { type: string }[] }).tools.some((t) => t.type === "web_search_20250305"));
assert.deepEqual(out.ideas.map((i) => i.title), ["Día 26 del reto", "Mi setup"]);
assert.equal(out.ideas[0]!.sources[0]!.url, "https://y.com/reto");

// Sin fuentes no inventa ideas
const empty = await runRadar({ client: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "nada", citations: null }] }) } } as never, llm: llm as never }, { niche: "x y z", pillars: [], today: "2026-11-12", model: "fake" });
assert.equal(empty.ideas.length, 0);

// Estado viejo carga con radar vacío
assert.deepEqual(HqStateSchema.parse({ v: 1 }).radar, { niche: "", ranAt: null, ideas: [], used: [] });

console.log("radar OK ✔");
}
void main().catch((e) => { console.error(e); process.exit(1); });
