/** Programa de gym: split, fases, progresión.  npx tsx scripts/training.selftest.ts */
import assert from "node:assert/strict";
import * as T from "../src/hq/training";
import { HqStateSchema, PlanSchema } from "../src/hq/schemas";

const plan = (days: number[], goal: "bajar" | "musculo" | "ambas" = "bajar") => PlanSchema.parse({ goal, gymDays: days, time: "tarde", content: "tres", createdAt: "x" });
const START = "2026-10-23";

// Split según días: nada de "haz pierna y camina".
assert.deepEqual(T.SPLITS[4]!.map((s) => s.key), ["upperA", "lowerA", "upperB", "lowerB"]);
for (const [n, split] of Object.entries(T.SPLITS)) {
  assert.equal(split.length, Number(n));
  for (const s of split) {
    assert.ok(s.main.length >= 5, `${s.name}: al menos 5 ejercicios`);
    for (const r of s.main) {
      assert.ok(T.LIB[r.id], `${r.id} existe`);
      assert.ok(r.reps[0] <= r.reps[1] && r.rest >= 45);
    }
  }
}

// Lunes, semana 3 del reto, 4 días: Torso A completo con sus series.
const mon = T.workoutFor(plan([0, 1, 3, 4]), "2026-11-09", START);
assert.equal(mon.kind, "gym");
assert.equal(mon.session!.key, "upperA");
assert.equal(mon.phase.name, "Construcción");
assert.equal(mon.rx[0]!.sets, 4);
assert.ok(mon.minutes >= 50 && mon.minutes <= 95, `duración realista: ${mon.minutes}`);
assert.equal(mon.finisher!.title, "Cardio 15 min", "objetivo bajar → cardio al final");
assert.equal(T.rxLine(mon.rx[0]!), "Press de banca 4×5–7");

// Fases: adaptación (−1 serie), descarga en semana 7, pico después.
const w1 = T.workoutFor(plan([0, 1, 3, 4]), "2026-10-27", START);
assert.equal(w1.phase.name, "Adaptación");
assert.equal(w1.rx[0]!.sets, 3);
assert.equal(T.phaseFor(7).name, "Descarga");
assert.equal(T.phaseFor(9).name, "Pico");

// Días sin gym: pasos según objetivo + movilidad; domingo descanso activo.
const wed = T.workoutFor(plan([0, 1, 3, 4], "musculo"), "2026-11-11", START);
assert.equal(wed.kind, "walk");
assert.equal(wed.steps, 7000);
assert.ok(wed.mobility.length >= 3);
assert.equal(T.workoutFor(plan([0, 1, 3, 4]), "2026-11-15", START).kind, "rest");

// Con 2 días, la rotación cambia por semana (no siempre la misma sesión).
const twoA = T.workoutFor(plan([0, 3]), "2026-11-02", START).session!.key;
const twoB = T.workoutFor(plan([0, 3]), "2026-11-05", START).session!.key;
assert.notEqual(twoA, twoB);

// Progresión (doble progresión).
const rx = mon.rx[0]!; // banca 4×5–7
const st = (lifts: Record<string, { kg: number; reps: number[] }>, date = "2026-11-02") => HqStateSchema.parse({ days: { [date]: { date, lifts } } });
assert.match(T.suggestion(HqStateSchema.parse({}), rx, "2026-11-09", mon.phase), /reps en reserva/);
assert.match(T.suggestion(st({ banca: { kg: 60, reps: [7, 7, 7, 7] } }), rx, "2026-11-09", mon.phase), /hoy 62.5 kg/);
assert.match(T.suggestion(st({ banca: { kg: 60, reps: [7, 6, 6, 5] } }), rx, "2026-11-09", mon.phase), /Repite 60 kg y busca 7 reps/);
const squat = T.SPLITS[4]![1]!.main[0]!;
assert.match(T.suggestion(st({ sentadilla: { kg: 80, reps: [7, 7, 7, 7] } }), squat, "2026-11-09", mon.phase), /85 kg/, "pierna sube de 5 en 5");
assert.match(T.suggestion(st({ banca: { kg: 60, reps: [7, 7, 7] } }), rx, "2026-12-04", T.phaseFor(7)), /54 kg/, "descarga: 10 % menos");
assert.equal(T.lastLog(st({ banca: { kg: 60, reps: [7] } }, "2026-11-09"), "banca", "2026-11-09"), null, "no cuenta el mismo día");
assert.match(T.suggestion(st({ dominada: { kg: 0, reps: [8, 7, 6, 6] } }), T.SPLITS[4]![2]!.main[1]!, "2026-11-09", mon.phase), /tu peso\): 8, 7, 6, 6/);
assert.equal(T.volumeOf({ banca: { kg: 60, reps: [7, 7] } }), 840);

console.log("entrenamiento OK ✔");
