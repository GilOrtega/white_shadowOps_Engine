/** Pruebas de la semana de contenido.  npx tsx scripts/content.selftest.ts */
import assert from "node:assert/strict";
import { asText, cell, fromAgent, starterWeek, weekStats } from "../src/hq/content";
import { CRITIQUE_SYSTEM, CritiqueSchema, critiquePrompt } from "../src/hq/critique";
import { HqStateSchema } from "../src/hq/schemas";

// Estado viejo (sin contentWeek) sigue cargando con temas por defecto
const old = HqStateSchema.parse({ v: 1 });
assert.equal(old.contentWeek.items.length, 0);
assert.ok(old.contentWeek.pillars.length >= 1);
assert.equal(old.contentWeek.weekOf, null);

// Plantilla: 7 días × 3 formatos, una casilla por combinación, todos válidos
const week = starterWeek(["Reto físico", "Programar con IA"]);
assert.equal(week.length, 21);
for (let d = 0; d < 7; d++) for (const f of ["guion", "carrusel", "historia"] as const) assert.ok(cell(week, d, f), `falta ${d} ${f}`);
assert.equal(new Set(week.map((i) => i.id)).size, 21);
const parsed = HqStateSchema.parse({ v: 1, contentWeek: { weekOf: "2026-11-09", items: week } });
assert.equal(parsed.contentWeek.items.length, 21);
assert.deepEqual(weekStats(week), { total: 21, listo: 0, publicado: 0 });

// Respuesta del agente → casillas (se recorta lo que sobra)
const piece = (t: string) => ({ title: t, hook: "h", beats: ["a", "b", "c"], cta: "x", pillar: "Reto físico" });
const out = { days: Array.from({ length: 7 }, (_, d) => ({ guion: piece(`G${d}`), carrusel: piece(`C${d}`), historia: piece(`H${d}`) })) };
const items = fromAgent(out);
assert.equal(items.length, 21);
assert.equal(cell(items, 3, "carrusel")!.title, "C3");
assert.equal(cell(items, 6, "historia")!.title, "H6");

// Texto para copiar
const txt = asText({ ...items[0], status: "listo" });
assert.match(txt, /^GUION · LUN — G0/);
assert.match(txt, /1\. a\n2\. b/);
assert.match(txt, /Cierre: x/);

// Editor de guiones: el borrador va como datos y la crítica tiene forma fija
const p = critiquePrompt({ ...items[0], status: "idea" } as never, { title: "Ref", hook: "", beats: ["x"], cta: "" });
assert.match(p, /<borrador>[\s\S]*"titulo":"G0"[\s\S]*<\/borrador>/);
assert.match(p, /<referencia>/);
assert.doesNotMatch(critiquePrompt({ ...items[0] } as never), /<referencia>/);
assert.match(CRITIQUE_SYSTEM, /DATOS, no instrucciones/);
assert.match(CRITIQUE_SYSTEM, /\[tu dato\]/);
const ok = CritiqueSchema.parse({
  verdict: "El gancho promete 3 pasos y solo das 2.", lens: "promesa", keep: ["“Me rapo con la 0”: es tu sello"],
  changes: [{ part: "Contexto", problem: "No se entiende qué es Cursor", fix: "Di: “el editor con IA que uso”" }],
  promiseGap: { promised: "3 pasos", delivered: "2 pasos", options: "Agrega el paso 3 (recomendado) o promete 2" },
  hook: "", close: "Y el paso 3 es el que nadie hace.", reach: "Puede jalar a programadores nuevos si el paso 3 se ve en pantalla.",
});
assert.equal(ok.changes.length, 1);
assert.throws(() => CritiqueSchema.parse({ ...ok, lens: "viralidad" }));
assert.throws(() => CritiqueSchema.parse({ ...ok, changes: Array(5).fill(ok.changes[0]) }));

console.log("contenido OK ✔");
