/** Pruebas de Sombra coordinador y de la Bitácora.  npx tsx scripts/coordinator.selftest.ts */
import assert from "node:assert/strict";
import { briefing, pageTip } from "../src/hq/coordinator";
import { beforeAfter, captureStreak, groupByWeek, pulse, type Capture } from "../src/hq/journal";
import { buildPlan } from "../src/hq/logic";
import { defaultState, HqStateSchema } from "../src/hq/schemas";

const TODAY = "2026-11-09";
const cap = (id: string, date: string, kind: Capture["kind"] = "inicio"): Capture => ({ id, date, kind, note: "", createdAt: `${date}T10:00:00Z`, w: 100, h: 80 });

// --- coordinador ---
const empty = briefing(defaultState(), TODAY, 9, { todayCount: 0, total: 0, streak: 0 });
assert.equal(empty.next?.id, "plan", "sin plan, lo primero es armarlo");
assert.ok(empty.alerts.some((a) => a.id === "capture"), "pide la captura del día");
assert.match(empty.summary, /Día 18 de 60, 0 de 3 misiones/);
assert.equal(briefing(defaultState(), TODAY, 9, null).alerts.some((a) => a.id === "capture"), false, "sin datos de bitácora no inventa");

const meal = (n: string, kcal: number) => ({ id: n, name: n, kcal, proteinG: 30, source: "manual", at: "x" });
const done = HqStateSchema.parse({
  plan: buildPlan(["bajar", "4", "tarde", "resultado"], "now"),
  profile: { goalWeightKg: 84 },
  days: { [TODAY]: { date: TODAY, weightKg: 87.4, trainingDone: true, meals: [meal("a", 600), meal("b", 700)] } },
});
const b = briefing(done, TODAY, 20, { todayCount: 1, total: 5, streak: 4 });
assert.equal(b.mood, "fiesta");
assert.equal(b.next, null, "día cumplido: no hay pendiente");
assert.ok(b.alerts.some((a) => a.id === "done"));
assert.ok(b.alerts.some((a) => a.id === "jstreak"));
assert.ok(b.alerts.length <= 5);

const over = HqStateSchema.parse({ ...done, days: { [TODAY]: { date: TODAY, trainingDone: true, meals: [meal("a", 1500), meal("b", 900)] } } });
assert.ok(briefing(over, TODAY, 13, null).alerts.some((a) => a.id === "kcal" && /300 kcal arriba/.test(a.text)));

assert.match(pageTip("/bitacora", defaultState(), TODAY, { todayCount: 0, total: 0, streak: 0 }), /primera captura/);
assert.match(pageTip("/progreso", defaultState(), TODAY, null), /7 días/);

// --- bitácora ---
const list = [cap("a", "2026-10-23"), cap("b", "2026-11-08", "metricas"), cap("c", TODAY), cap("d", "2026-11-07"), cap("e", "2026-10-20", "fisico")];
assert.equal(captureStreak(list, TODAY), 3);
assert.equal(captureStreak(list, "2026-11-10"), 3, "si hoy aún no hay, cuenta desde ayer");
assert.deepEqual(pulse(list, TODAY), { todayCount: 1, total: 5, streak: 3 });
const weeks = groupByWeek(list, "2026-10-23");
assert.equal(weeks[0]!.title, "Semana 3");
assert.equal(weeks.at(-1)!.title, "Antes del reto");
assert.equal(weeks.reduce((n, w) => n + w.count, 0), 5);
const ba = beforeAfter(list, "inicio")!;
assert.equal(ba.before.id, "a");
assert.equal(ba.after.id, "c");
assert.equal(ba.days, 17);
assert.equal(beforeAfter(list, "fisico"), null, "con una sola no hay comparación");

console.log("coordinador + bitácora OK ✔");
