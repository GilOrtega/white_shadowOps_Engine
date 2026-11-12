/** Hábitos, recordatorios y propuestas del agente.  npx tsx scripts/habits.selftest.tsx */
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { HabitsToday, Proposals } from "../src/components/hq/Proactive";
import * as H from "../src/hq/habits";
import * as I from "../src/hq/insights";
import { dueReminders, snapshotOf } from "../src/hq/push";
import { defaultState, HqStateSchema } from "../src/hq/schemas";

const TODAY = "2026-11-11"; // miércoles (índice 2)
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const ctx = { journal: null, approvedClipsThisWeek: 0 };

// Estados viejos cargan sin hábitos.
assert.deepEqual(HqStateSchema.parse({ v: 1 }).habits, []);
assert.deepEqual(HqStateSchema.parse({ v: 1 }).dismissed, {});

// Racha por hábito: cuenta solo días que tocaba; hoy sin marcar no rompe.
const crea = { id: "c", title: "Creatina", emoji: "💊", time: "09:00", days: [0, 1, 2, 3, 4, 5, 6], anchor: "el desayuno", kind: "hacer" as const, facet: "cuerpo" as const, createdAt: "2026-11-01" };
const gym = { ...crea, id: "g", title: "Grabar clip", time: "19:00", days: [0, 2, 4] }; // L, Mi, V
const s = HqStateSchema.parse({
  habits: [crea, gym],
  days: {
    "2026-11-08": { date: "2026-11-08", habitsDone: ["c"] },
    "2026-11-09": { date: "2026-11-09", habitsDone: ["c", "g"] },
    "2026-11-10": { date: "2026-11-10", habitsDone: ["c"] },
  },
});
assert.equal(H.habitStreak(s, crea, TODAY), 3);
assert.equal(H.habitStreak(s, gym, TODAY), 1, "martes no tocaba: no rompe");
assert.equal(H.isDue(gym, "2026-11-10"), false);
const now = H.today(s, TODAY, "10:15");
assert.equal(now[0]!.habit.id, "c");
assert.equal(now[0]!.late, true, "9:00 ya pasó y no está marcada");
assert.equal(now[1]!.late, false);
assert.equal(H.stackLine(crea), "Después de el desayuno");

// Recordatorios del servidor: a su hora, hasta 90 min, una vez marcado ya no.
const snap = snapshotOf(s, TODAY, "America/Hermosillo");
assert.deepEqual(snap.habits.map((h) => h.id), ["c", "g"]);
assert.equal(JSON.stringify(snap).includes("desayuno"), false, "el servidor no recibe el ancla");
assert.deepEqual(dueReminders(snap, TODAY, "08:59").map((h) => h.id), []);
assert.deepEqual(dueReminders(snap, TODAY, "09:00").map((h) => h.id), ["c"]);
assert.deepEqual(dueReminders(snap, TODAY, "10:31").map((h) => h.id), [], "pasados 90 min ya no se manda");
const doneSnap = snapshotOf(HqStateSchema.parse({ ...s, days: { ...s.days, [TODAY]: { date: TODAY, habitsDone: ["c"] } } }), TODAY, "America/Hermosillo");
assert.deepEqual(dueReminders(doneSnap, TODAY, "09:10").map((h) => h.id), []);
assert.deepEqual(dueReminders(snapshotOf(s, "2026-11-10", "America/Hermosillo"), TODAY, "09:10").map((h) => h.id), ["c"], "resumen de ayer: hoy nada marcado");
assert.deepEqual(dueReminders(snap, "2026-11-12", "19:05").map((h) => h.id), [], "jueves no toca grabar clip");

// Propuestas.
const empty = I.proposals(defaultState(), TODAY, 10, ctx);
assert.ok(empty.some((p) => p.id === "habit-starter-creatina"), "sin hábitos propone empezar por la creatina");
assert.ok(empty.some((p) => p.facet === "dinero"));
assert.ok(empty.every((p, i, a) => i === 0 || a[i - 1]!.priority <= p.priority), "ordenadas por prioridad");

// Estancado de peso → −100 kcal (como el check-in de MacroFactor).
const flat = HqStateSchema.parse({
  profile: { startDate: "2026-10-23", startWeightKg: 88 },
  days: Object.fromEntries(["2026-10-28", "2026-11-01", "2026-11-04", "2026-11-07", "2026-11-10"].map((d) => [d, { date: d, weightKg: 88 }])),
});
const cal = I.proposals(flat, TODAY, 10, ctx).find((p) => p.action.kind === "calories");
assert.ok(cal, "propone ajuste de calorías");
assert.deepEqual(cal!.action, { kind: "calories", delta: -100 });
assert.match(cal!.title, /2,000 kcal/);

// Bajando demasiado rápido → +100.
const fast = HqStateSchema.parse({
  profile: { startDate: "2026-10-23", startWeightKg: 90 },
  days: Object.fromEntries([["2026-11-01", 90], ["2026-11-03", 89.4], ["2026-11-05", 88.8], ["2026-11-07", 88.2], ["2026-11-09", 87.6], ["2026-11-11", 87]].map(([d, kg]) => [d, { date: d, weightKg: kg }])),
});
assert.equal(I.proposals(fast, TODAY, 10, ctx).find((p) => p.action.kind === "calories")?.action.kind === "calories" && (I.proposals(fast, TODAY, 10, ctx).find((p) => p.action.kind === "calories")!.action as { delta: number }).delta, 100);

// Entrega cerca → sube bloques. Descartar hoy la oculta.
const work = HqStateSchema.parse({ work: { focusGoal: 2, projects: [{ id: "p", name: "Landing", due: "2026-11-13" }] } });
const fp = I.proposals(work, TODAY, 10, ctx).find((p) => p.action.kind === "focusGoal")!;
assert.deepEqual(fp.action, { kind: "focusGoal", value: 3 });
assert.equal(fp.priority, 0);
const dismissed = HqStateSchema.parse({ ...work, dismissed: { [fp.id]: TODAY } });
assert.equal(I.proposals(dismissed, TODAY, 10, ctx).some((p) => p.id === fp.id), false);
assert.equal(I.proposals(dismissed, "2026-11-12", 10, ctx).some((p) => p.action.kind === "focusGoal"), true, "mañana vuelve si sigue igual");

// Hábito que se cae → moverlo una hora antes.
const missing = HqStateSchema.parse({ habits: [{ ...crea, createdAt: "2026-11-01" }] });
const mv = I.proposals(missing, TODAY, 10, ctx).find((p) => p.action.kind === "habitTime");
assert.deepEqual(mv?.action, { kind: "habitTime", habitId: "c", time: "08:00" });

// Pantallas.
const props = text(renderToString(<Proposals hq={defaultState()} today={TODAY} list={empty} />));
assert.match(props, /Sombra propone/);
assert.match(props, /Agregar creatina 9:00/);
assert.match(props, /Ahora no/);
const habitsEmpty = text(renderToString(<HabitsToday hq={defaultState()} today={TODAY} hhmm="10:00" />));
assert.match(habitsEmpty, /Creatina/);
const habits = text(renderToString(<HabitsToday hq={s} today={TODAY} hhmm="10:00" />));
assert.match(habits, /0 de 2 hechos/);
assert.match(habits, /🔥3/);
assert.match(habits, /Después de el desayuno → creatina/);

console.log("hábitos + propuestas OK ✔");
