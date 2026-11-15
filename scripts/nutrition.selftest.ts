/** Pruebas del plan de la nutrióloga.  npx tsx scripts/nutrition.selftest.ts */
import assert from "node:assert/strict";
import { dayChecklist, PLAN_CHECKS } from "../src/hq/flames";
import * as L from "../src/hq/logic";
import * as N from "../src/hq/nutrition";
import { HqStateSchema, migrateRestart, type HqState } from "../src/hq/schemas";

const base = (over: Partial<HqState["nutrition"]> = {}): HqState => HqStateSchema.parse({
  v: 1,
  profile: { startDate: "2026-10-23", startWeightKg: 88, calorieTarget: 2100 },
  plan: { goal: "ambas", gymDays: [0, 1, 2, 3], time: "tarde", content: "tres", createdAt: "2026-10-01T00:00:00Z" },
  nutrition: over,
});

// Reinicio del reto: el 23 oct pasa al 15 nov y el día 60 cae el 13 de enero
const s = migrateRestart(base());
assert.equal(s.profile.startDate, "2026-11-15");
assert.equal(L.addDays(s.profile.startDate, s.profile.challengeDays - 1), "2027-01-13");
const otra = HqStateSchema.parse({ v: 1, profile: { startDate: "2026-12-01" } });
assert.equal(migrateRestart(otra), otra, "otras fechas se respetan");

// Mifflin-St Jeor sigue disponible como referencia
assert.equal(N.bmr(88, 175, 30, "h"), 1828.75);

// El plan: 4 desayunos, 6 comidas, 1 batido y 4 cenas, tal cual la hoja
const count = (sl: N.Slot) => N.DISHES.filter((d) => d.slot === sl).length;
assert.deepEqual([count("desayuno"), count("comida"), count("colacion"), count("cena")], [4, 6, 1, 4]);
assert.ok(N.SNACKS.includes("18 almendras") && N.SNACKS.includes("8 nueces"));
assert.equal(N.PLAN_EXTRAS.liquidsL, 2.9);

const t = N.targetsFor(s);
assert.equal(t.basis, "plan");
assert.ok(t.kcal >= 1500 && t.kcal <= 2400, `promedio razonable: ${t.kcal}`);

// Menú: rota opciones, porciones del plan, sin repetir comida el día siguiente
const menu = N.weekMenu(s, "2026-11-16");
assert.equal(menu.length, 7);
for (const d of menu) {
  assert.deepEqual(d.meals.map((m) => m.slot), ["desayuno", "comida", "colacion", "cena"]);
  assert.ok(d.meals.every((m) => m.x === 1));
  assert.equal(d.meals[2]!.dish.id, "p-shake");
}
for (let k = 1; k < 7; k++) assert.notEqual(menu[k]!.meals[1]!.dish.id, menu[k - 1]!.meals[1]!.dish.id);
assert.equal(new Set(menu.map((d) => d.meals[1]!.dish.id)).size, 6, "en la semana salen las 6 comidas");

// Cambios y lo que no te gusta
const swapped = N.weekMenu({ ...s, nutrition: { ...s.nutrition, swaps: { [N.swapKey("2026-11-16", 2, "comida")]: "c-ceviche" } } }, "2026-11-16");
assert.equal(swapped[2]!.meals[1]!.dish.id, "c-ceviche");
assert.equal(swapped[2]!.meals[1]!.swapped, true);
const sinAtun = N.weekMenu({ ...s, nutrition: { ...s.nutrition, skip: ["n-atun"] } }, "2026-11-16");
assert.ok(sinAtun.every((d) => d.meals.every((m) => m.dish.id !== "n-atun")));
assert.ok(N.alternatives(N.dishById("c-pollo")!).every((d) => d.slot === "comida" && d.id !== "c-pollo"));

// Súper: suma cantidades
const list = N.groceryList(menu);
assert.equal(list.filter((g) => g.item === "Tortilla de maíz").length, 1);
assert.ok(new Set(list.map((g) => `${g.item}|${g.unit}`)).size === list.length);
assert.equal(N.fmtQty({ item: "x", qty: 0.25, unit: "pza" }), "0.25 pza");

// Qué toca ahorita = la opción del día en el plan
const day = "2026-11-18";
const nm = N.nextMeal(s, day, 14);
assert.equal(nm.slot, "comida");
assert.equal(nm.dish.id, N.weekMenu(s, "2026-11-16")[2]!.meals[1]!.dish.id);
assert.equal(N.nextMeal(s, day, 17).dish.id, "p-shake");

// Lista del día: indicaciones de la nutrióloga desde el 15 nov
const c = dayChecklist(s, "2026-11-16");
assert.equal(c.items.filter((i) => i.group === "plan").length, PLAN_CHECKS.length);
assert.equal(dayChecklist(s, "2026-11-10").items.filter((i) => i.group === "plan").length, 0);
const done = migrateRestart(HqStateSchema.parse({ ...s, days: { "2026-11-16": { date: "2026-11-16", planDone: ["aloe", "te"] } } }));
assert.equal(dayChecklist(done, "2026-11-16").items.filter((i) => i.group === "plan" && i.done).length, 2);

// Datos viejos cargan
assert.deepEqual(HqStateSchema.parse({ v: 1 }).nutrition, { heightCm: null, age: null, sex: null, activity: null, skip: [], swaps: {} });
assert.deepEqual(HqStateSchema.parse({ v: 1, days: { "2026-11-01": { date: "2026-11-01" } } }).days["2026-11-01"]!.planDone, []);

console.log("plan de nutrióloga OK ✔");
