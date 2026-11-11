/** Avisos push de "Rapo a la 0": reglas, reloj por zona y rutas.  npx tsx scripts/push.selftest.ts */
import assert from "node:assert/strict";
import * as L from "../src/hq/logic";
import { localClock, pushDecision, snapshotOf, PushSnapshotSchema } from "../src/hq/push";
import { defaultState, HqStateSchema } from "../src/hq/schemas";
import { GET as cron } from "../src/app/api/cron/rapo/route";
import { POST as subscribe } from "../src/app/api/push/subscribe/route";

const TODAY = "2026-11-09";
const meal = (kcal: number, i: number) => ({ id: `m${i}`, name: "comida", kcal, proteinG: 30, source: "manual" as const, at: "x" });

async function main() {
  // La app y el servidor deciden igual.
  const empty = defaultState();
  for (const h of [9, 15, 19, 21, 23]) {
    const snap = snapshotOf(empty, TODAY, "America/Hermosillo");
    const app = L.dangerInfo(empty, TODAY, h).level;
    const srv = pushDecision(snap, TODAY, h)?.level ?? "sin aviso";
    assert.equal(srv, app === "atento" || app === "peligro" ? app : "sin aviso", `hora ${h}`);
  }

  const snap = snapshotOf(empty, TODAY, "America/Hermosillo");
  assert.ok(PushSnapshotSchema.safeParse(snap).success);
  assert.deepEqual(snap.left.sort(), ["kcal", "meals", "train"]);
  assert.equal(JSON.stringify(snap).includes("comida"), false, "el resumen no lleva comidas");

  // Día cumplido: no molesta, aunque sea tarde.
  const done = HqStateSchema.parse({ days: { [TODAY]: { date: TODAY, trainingDone: true, meals: [meal(600, 1), meal(700, 2)] } } });
  assert.equal(pushDecision(snapshotOf(done, TODAY, "America/Hermosillo"), TODAY, 21), null);

  // Resumen viejo (ayer) = hoy no has registrado nada.
  const stale = pushDecision(snapshotOf(done, "2026-11-08", "America/Hermosillo"), TODAY, 21);
  assert.equal(stale?.level, "peligro");
  assert.equal(pushDecision(null, TODAY, 15)?.level, "atento");
  assert.equal(pushDecision(null, TODAY, 10), null);

  // Avisos distintos por nivel; el mismo nivel y hora no se repite.
  const a = pushDecision(snap, TODAY, 15)!;
  const b = pushDecision(snap, TODAY, 21)!;
  assert.notEqual(a.dedupeKey, b.dedupeKey);
  assert.match(b.title, /💈/);
  assert.match(b.body, /entrenar/);
  assert.match(b.body, /registrar comidas/);

  // Reloj local: 03:30 UTC del 10 nov = 20:30 del 9 nov en Hermosillo (UTC−7, sin horario de verano).
  assert.deepEqual(localClock(new Date("2026-11-10T03:30:00Z"), "America/Hermosillo"), { date: "2026-11-09", hour: 20 });
  assert.deepEqual(localClock(new Date("2026-11-09T21:10:00Z"), "America/Hermosillo"), { date: "2026-11-09", hour: 14 });

  // Rutas: sin secreto no corren; sin configuración lo dicen claro.
  delete process.env.CRON_SECRET;
  assert.equal((await cron(new Request("http://x/api/cron/rapo"))).status, 401);
  process.env.CRON_SECRET = "s3cret";
  assert.equal((await cron(new Request("http://x/api/cron/rapo", { headers: { authorization: "Bearer nope" } }))).status, 401);
  const notReady = await cron(new Request("http://x/api/cron/rapo", { headers: { authorization: "Bearer s3cret" } }));
  assert.equal(notReady.status, 503, "sin VAPID/Redis responde 503 y no truena");
  process.env.WSO_API_SECRET = "clave";
  assert.equal((await subscribe(new Request("http://x", { method: "POST", body: "{}" }))).status, 401);
  assert.equal((await subscribe(new Request("http://x", { method: "POST", headers: { "x-wso-key": "clave" }, body: "{}" }))).status, 503);

  console.log("push OK ✔");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
