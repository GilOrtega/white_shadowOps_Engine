/** Pruebas del Nutriólogo.  npx tsx scripts/nutrition.selftest.ts */
import assert from "node:assert/strict";
import * as N from "../src/hq/nutrition";
import { HqStateSchema, type HqState } from "../src/hq/schemas";

const base = (over: Partial<HqState["nutrition"]> = {}, goal: "bajar" | "musculo" | "ambas" = "bajar"): HqState => HqStateSchema.parse({
  v: 1,
  profile: { startDate: "2026-10-23", startWeightKg: 88, calorieTarget: 2100 },
  plan: { goal, gymDays: [0, 1, 2, 3], time: "tarde", content: "tres", createdAt: "2026-10-01T00:00:00Z" },
  nutrition: over,
});

// Mifflin-St Jeor: hombre 88 kg, 175 cm, 30 años → 10·88 + 6.25·175 − 5·30 + 5 = 1828.75
assert.equal(N.bmr(88, 175, 30, "h"), 1828.75);
assert.equal(N.bmr(60, 160, 30, "m"), 10 * 60 + 6.25 * 160 - 150 - 161);

// Sin datos: usa la meta del perfil
const sin = N.targetsFor(base());
assert.equal(sin.basis, "perfil");
assert.equal(sin.kcal, 2100);
assert.equal(sin.maintenance, null);

// Con datos: 4 días de gym → moderado (1.55); bajar → −20 %
const s = base({ heightCm: 175, age: 30, sex: "h" });
assert.equal(N.activityFor(s), "moderado");
const t = N.targetsFor(s);
assert.equal(t.basis, "formula");
assert.equal(t.maintenance, Math.round((1828.75 * 1.55) / 10) * 10);
assert.equal(t.kcal, Math.round((t.maintenance! * 0.8) / 50) * 50);
assert.equal(t.proteinG, 175); // 2 g/kg de 88 kg → 176 → redondeado a 5
assert.ok(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal) < 60, "los macros suman la meta");

// Nunca baja del piso de 1,500 kcal
const chica = N.targetsFor(base({ heightCm: 150, age: 60, sex: "m", activity: "sedentario" }));
assert.equal(chica.kcal, N.KCAL_FLOOR);
assert.match(chica.note, /mínimo de 1,500/);
// Músculo → superávit
assert.ok(N.targetsFor(base({ heightCm: 175, age: 30, sex: "h" }, "musculo")).kcal > t.maintenance!);

// Menú: 4 tiempos, cerca de la meta y con proteína suficiente
const menu = N.weekMenu(s, "2026-11-09");
assert.equal(menu.length, 7);
for (const d of menu) {
  assert.deepEqual(d.meals.map((m) => m.slot), ["desayuno", "comida", "colacion", "cena"]);
  assert.ok(Math.abs(d.kcal - t.kcal) <= 350, `día ${d.day}: ${d.kcal} vs ${t.kcal}`);
}
assert.ok(menu.some((d, k) => k > 0 && d.meals[1]!.dish.id !== menu[k - 1]!.meals[1]!.dish.id), "varía la comida entre días");

// Cambios y platillos que no quieres
const swapped = N.weekMenu({ ...s, nutrition: { ...s.nutrition, swaps: { [N.swapKey("2026-11-09", 2, "comida")]: "caldo-res" } } }, "2026-11-09");
assert.equal(swapped[2]!.meals[1]!.dish.id, "caldo-res");
assert.equal(swapped[2]!.meals[1]!.swapped, true);
const sinTacos = N.weekMenu({ ...s, nutrition: { ...s.nutrition, skip: ["tacos-bistec"] } }, "2026-11-09");
assert.ok(sinTacos.every((d) => d.meals.every((m) => m.dish.id !== "tacos-bistec")));
assert.ok(N.alternatives(N.dishById("pollo-arroz")!).every((d) => d.slot === "comida" && d.id !== "pollo-arroz"));

// Súper: suma cantidades
const list = N.groceryList(menu);
const tortillas = list.filter((g) => g.item === "Tortilla de maíz");
assert.equal(tortillas.length, 1);
assert.ok(new Set(list.map((g) => `${g.item}|${g.unit}`)).size === list.length);
assert.equal(N.fmtQty({ item: "x", qty: 0.25, unit: "pza" }), "0.25 pza");
assert.equal(N.fmtQty({ item: "x", qty: 3, unit: "pzas" }), "3 pzas");

// Siguiente comida
const day = "2026-11-12";
const s2 = { ...s, days: { [day]: { ...HqStateSchema.parse({ v: 1, days: { [day]: { date: day } } }).days[day]!, meals: [{ id: "m", name: "x", kcal: 600, proteinG: 30, source: "manual" as const, at: "" }] } } };
const nm = N.nextMeal(s2, day, 14);
assert.equal(nm.slot, "comida");
assert.ok(nm.dish && nm.dish.kcal <= nm.leftK + 60);
const over = N.nextMeal({ ...s2, days: { [day]: { ...s2.days[day]!, meals: [{ id: "m", name: "x", kcal: 3000, proteinG: 100, source: "manual" as const, at: "" }] } } }, day, 21);
assert.match(over.text, /No lo compenses/);

// Datos viejos cargan
assert.deepEqual(HqStateSchema.parse({ v: 1 }).nutrition, { heightCm: null, age: null, sex: null, activity: null, skip: [], swaps: {} });

console.log("nutriólogo OK ✔");
