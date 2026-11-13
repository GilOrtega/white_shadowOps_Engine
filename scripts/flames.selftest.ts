/** Pruebas de flamas, semanas perfectas y evolución de Sombra.  npx tsx scripts/flames.selftest.ts */
import assert from "node:assert/strict";
import { challengeWeeks, dayChecklist, evolution, flameOf, formFor, weekStreak } from "../src/hq/flames";
import * as L from "../src/hq/logic";
import { HabitSchema, HqStateSchema, type HqState } from "../src/hq/schemas";

const START = "2026-10-05"; // lunes
const base = (): HqState => HqStateSchema.parse({ v: 1, profile: { startDate: START, calorieTarget: 2000 }, plan: { goal: "ambas", gymDays: [0, 1, 2, 3, 4, 5], time: "tarde", content: "resultado", createdAt: "2026-10-01T00:00:00Z" } });
const meal = (k: number) => ({ id: Math.random().toString(36).slice(2), name: "x", kcal: k, proteinG: null, source: "manual" as const, at: "2026-10-05T12:00:00Z" });

/** Día con la lista completa (3 del reto) más pendientes propios. */
function day(s: HqState, date: string, opts: { train?: boolean; todos?: boolean[] } = {}) {
  s.days[date] = { ...L.emptyDay(date), trainingDone: opts.train ?? true, meals: [meal(800), meal(700)], todos: (opts.todos ?? []).map((done, i) => ({ id: `t${i}`, title: `T${i}`, done })) };
}

// La lista junta misiones + hábitos que tocan + pendientes
let s = base();
s.habits = [HabitSchema.parse({ id: "cre", title: "Creatina", createdAt: START })];
day(s, START, { todos: [true, false] });
const c = dayChecklist(s, START);
assert.deepEqual(c.items.map((i) => i.group), ["reto", "reto", "reto", "habitos", "tuyo", "tuyo"]);
assert.equal(c.total, 6);
assert.equal(c.done, 4); // 3 del reto + 1 pendiente
assert.equal(c.missing, 1); // 80 % de 6 = 4.8 → 5
assert.equal(flameOf(s, START), "none");
s.days[START]!.habitsDone = ["cre"];
assert.equal(flameOf(s, START), "flama"); // 5/6 = 83 %
s.days[START]!.todos[1]!.done = true;
assert.equal(flameOf(s, START), "completa");
assert.equal(flameOf(s, "2026-10-06"), "none", "día sin registro no tiene flama");

// 80 % exacto cuenta: 4 de 5
s = base();
day(s, START, { todos: [true, false] });
assert.equal(dayChecklist(s, START).pct, 0.8);
assert.equal(flameOf(s, START), "flama");

// Semanas: 7 flamas = perfecta; la semana en curso no rompe la racha
s = base();
for (let i = 0; i < 28; i++) day(s, L.addDays(START, i));
let today = L.addDays(START, 30); // semana 5 en curso
let w = weekStreak(s, today);
assert.equal(challengeWeeks(s, today).length, 5);
assert.equal(w.streak, 4);
assert.equal(formFor(w.streak).form.id, "tormenta");
assert.equal(evolution(s, today).form.name, "Sombra Tormenta");

// Una semana con un día sin flama rompe la racha (y la forma baja), pero el récord queda
day(s, L.addDays(START, 30), { train: false }); // 2/3 = 67 %
for (let i = 28; i < 35; i++) if (i !== 30) day(s, L.addDays(START, i));
today = L.addDays(START, 36);
w = weekStreak(s, today);
assert.equal(w.streak, 0);
assert.equal(w.best, 4);
assert.equal(evolution(s, today).form.id, "base");

// La semana se cierra en cuanto el 7.º día tiene flama
s = base();
for (let i = 0; i < 7; i++) day(s, L.addDays(START, i));
assert.equal(weekStreak(s, L.addDays(START, 6)).streak, 1);
assert.equal(evolution(s, L.addDays(START, 6)).form.id, "chispa");
assert.equal(evolution(s, L.addDays(START, 3)).charge, 4 / 7);

// Escalera de formas
assert.deepEqual([0, 1, 3, 4, 8, 15, 16, 40].map((n) => formFor(n).form.id), ["base", "chispa", "chispa", "tormenta", "furia", "furia", "bestia", "bestia"]);
assert.equal(formFor(2).toNext, 2);
assert.equal(formFor(16).next, null);

// El clip extra no te quita la flama si no lo haces, pero sí suma si lo haces
s = base();
s.plan = { ...s.plan!, content: "diario" };
day(s, START);
const withClip = dayChecklist(s, START);
assert.ok(withClip.items.some((i) => i.bonus && !i.done));
assert.equal(withClip.total, 3);
assert.equal(flameOf(s, START), "completa");
s.days[START]!.clipDone = true;
assert.equal(dayChecklist(s, START).total, 4);

// Datos viejos sin "todos" siguen cargando
assert.deepEqual(HqStateSchema.parse({ v: 1, days: { [START]: { date: START } } }).days[START]!.todos, []);

console.log("flamas OK ✔");
