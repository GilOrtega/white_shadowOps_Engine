/** Reglas de sincronización: un dispositivo vacío nunca borra tus datos.  npx tsx scripts/sync.selftest.ts */
import assert from "node:assert/strict";
import { HqStateSchema } from "../src/hq/schemas";
import { acceptPut, contentScore, decide, isEmptyState } from "../src/hq/sync-rules";

const empty = HqStateSchema.parse({ v: 1, accessKey: "x" });
const phone = HqStateSchema.parse({ v: 1, days: { "2026-11-10": { date: "2026-11-10", weightKg: 87.5, meals: [{ id: "a", name: "Huevos", kcal: 500, at: "x" }] } } });
const more = HqStateSchema.parse({ ...phone, habits: [{ id: "c", title: "Creatina", createdAt: "2026-11-01" }] });

assert.ok(isEmptyState(empty));
assert.ok(!isEmptyState(phone));
assert.ok(contentScore(more) > contentScore(phone));

// El caso real: la compu (vacía, clave recién puesta) subió primero; luego el celular con datos pone la clave.
const cloudEmpty = { state: empty, updatedAt: 2_000 };
assert.equal(decide(phone, 1_000, cloudEmpty), "push", "el celular sube sus datos aunque la nube sea 'más nueva'");
assert.equal(acceptPut({ state: phone, updatedAt: 1_000 }, cloudEmpty), true, "el servidor acepta datos sobre una nube vacía");
// Y la compu vacía, al volver, adopta lo del celular
const cloudPhone = { state: phone, updatedAt: 1_000 };
assert.equal(decide(empty, 2_000, cloudPhone), "adopt");
// Un vacío nunca reemplaza datos en el servidor, aunque sea más nuevo
assert.equal(acceptPut({ state: empty, updatedAt: 9_000 }, cloudPhone), false);
assert.equal(acceptPut({ state: empty, updatedAt: 9_000 }, null), false);
// Entre dos dispositivos con datos, gana lo más nuevo
assert.equal(decide(more, 3_000, cloudPhone), "push");
assert.equal(decide(phone, 500, { state: more, updatedAt: 3_000 }), "adopt");
assert.equal(acceptPut({ state: phone, updatedAt: 500 }, { state: more, updatedAt: 3_000 }), false);
assert.equal(acceptPut({ state: more, updatedAt: 3_000 }, cloudPhone), true);
// Nada en ningún lado: no hace nada
assert.equal(decide(empty, 1, null), "none");
assert.equal(decide(empty, 1, cloudEmpty), "none");

console.log("sync seguro OK ✔");
