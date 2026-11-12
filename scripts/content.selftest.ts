/** Pruebas de la semana de contenido.  npx tsx scripts/content.selftest.ts */
import assert from "node:assert/strict";
import { asText, cell, fromAgent, starterWeek, weekStats } from "../src/hq/content";
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

console.log("contenido OK ✔");
