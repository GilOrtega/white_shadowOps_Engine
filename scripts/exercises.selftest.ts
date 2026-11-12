/** Pruebas de la biblioteca de técnica.  npx tsx scripts/exercises.selftest.ts */
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { EXERCISES, ROUTINE_MEDIA } from "../src/hq/exercise-db.gen";
import { alternativesFor, isSwapValid, mediaFor } from "../src/hq/exercises";
import { HqStateSchema } from "../src/hq/schemas";
import { LIB, lastLog, logKey, suggestion } from "../src/hq/training";

// Cada ejercicio de la rutina tiene técnica, GIF y alternativas
for (const id of Object.keys(LIB)) {
  const m = mediaFor(id);
  assert.ok(m, `sin técnica: ${id}`);
  assert.ok(m.steps.length >= 2, `sin pasos: ${id}`);
  assert.ok(alternativesFor(id).length >= 2, `pocas alternativas: ${id}`);
}
for (const e of Object.values(EXERCISES)) {
  for (const ext of ["gif", "jpg"]) {
    const f = `public/ex/${e.id}.${ext}`;
    assert.ok(existsSync(f) && statSync(f).size > 1000, `falta ${f}`);
  }
  assert.ok(!/[a-z]{3,} [a-z]{3,}/.test(e.target) || /[áéíóú]/.test(e.target) || e.target.split(" ").length <= 3);
  assert.ok(e.steps.every((s) => !/^[A-Z][a-z]+ (the|your|with) /.test(s)), `pasos en inglés: ${e.id}`);
}
assert.ok(Object.values(ROUTINE_MEDIA).some((l) => l.some((x) => EXERCISES[x]!.home)), "debe haber opciones en casa");

// Cambiar ejercicio
const alt = ROUTINE_MEDIA.sentadilla![1]!;
assert.equal(mediaFor("sentadilla", alt)!.id, alt);
assert.equal(mediaFor("sentadilla", "9999")!.id, ROUTINE_MEDIA.sentadilla![0]); // swap inválido → el de la rutina
assert.ok(isSwapValid("sentadilla", alt));
assert.ok(!isSwapValid("sentadilla", ROUTINE_MEDIA.banca![0]!));
assert.ok(!alternativesFor("sentadilla", alt).some((a) => a.id === alt));
assert.ok(alternativesFor("sentadilla", alt).some((a) => a.id === ROUTINE_MEDIA.sentadilla![0]));
const homeLast = alternativesFor("banca");
assert.equal(homeLast.at(-1)!.home, true, "las de casa van al final");

// El progreso del cambio se lleva aparte
assert.equal(logKey("sentadilla"), "sentadilla");
assert.equal(logKey("sentadilla", alt), `sentadilla~${alt}`);
const s = HqStateSchema.parse({
  v: 1,
  exerciseSwaps: { sentadilla: alt },
  days: {
    "2026-11-10": { date: "2026-11-10", lifts: { sentadilla: { kg: 80, reps: [8, 8, 8] }, [`sentadilla~${alt}`]: { kg: 24, reps: [10, 10, 10] } } },
  },
});
assert.equal(lastLog(s, logKey("sentadilla", alt), "2026-11-12")!.log.kg, 24);
assert.equal(lastLog(s, "sentadilla", "2026-11-12")!.log.kg, 80);
const rx = { id: logKey("sentadilla", alt), sets: 3, reps: [8, 10] as [number, number], rest: 120, unit: "reps" as const };
assert.match(suggestion(s, rx as never, "2026-11-12", { name: "Construcción", rir: 2 } as never), /26.5 kg/);
assert.deepEqual(HqStateSchema.parse({ v: 1 }).exerciseSwaps, {});

console.log("técnica de ejercicios OK ✔");
