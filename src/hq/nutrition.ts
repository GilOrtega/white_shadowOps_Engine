import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Plan de alimentación de tu nutrióloga dentro de WhiteShadow: rota sus opciones por día,
 * te dice qué toca ahorita y arma la lista del súper. Las calorías son estimaciones nuestras.
 */

import { ActivitySchema, type Activity, NutritionSchema, type Nutrition } from "./nutrition-schema";

export { ActivitySchema, NutritionSchema };
export type { Activity, Nutrition };

export const ACTIVITY: Record<Activity, { factor: number; label: string; what: string }> = {
  sedentario: { factor: 1.2, label: "Sedentario", what: "Trabajo sentado y casi no entrenas" },
  ligero: { factor: 1.375, label: "Ligero", what: "1–2 entrenamientos por semana" },
  moderado: { factor: 1.55, label: "Moderado", what: "3–5 entrenamientos por semana" },
  alto: { factor: 1.725, label: "Alto", what: "6 o más, o trabajo físico" },
};

/** Piso de calorías: nunca por debajo de esto, aunque la fórmula lo pida. */
export const KCAL_FLOOR = 1500;

export function currentWeight(s: HqState) {
  const series = L.weightSeries(s);
  return series.at(-1)?.trend ?? s.profile.startWeightKg;
}

export function activityFor(s: HqState): Activity {
  if (s.nutrition.activity) return s.nutrition.activity;
  const n = s.plan?.gymDays.length ?? 0;
  return n >= 6 ? "alto" : n >= 3 ? "moderado" : n >= 1 ? "ligero" : "sedentario";
}

export type Targets = {
  /** Gasto de mantenimiento estimado con fórmula (null si faltan datos). */
  maintenance: number | null;
  /** Lo que da en promedio un día del plan de tu nutrióloga (aproximado). */
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  basis: "plan";
  note: string;
};

const round = (n: number, to: number) => Math.round(n / to) * to;

/** Mifflin-St Jeor (1990): la más usada para estimar el gasto en reposo. */
export function bmr(weightKg: number, heightCm: number, age: number, sex: "h" | "m") {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "h" ? 5 : -161);
}

/** Promedio de un día del plan: una opción cualquiera de cada tiempo + la proteína de las 5. */
function planAverage() {
  const avg = (slot: Slot, k: "kcal" | "p" | "c" | "f") => {
    const l = DISHES.filter((d) => d.slot === slot);
    return l.reduce((x, d) => x + d[k], 0) / l.length;
  };
  const sum = (k: "kcal" | "p" | "c" | "f") => (["desayuno", "comida", "colacion", "cena"] as Slot[]).reduce((x, sl) => x + avg(sl, k), 0);
  return { kcal: sum("kcal"), p: sum("p"), c: sum("c"), f: sum("f") };
}

export function targetsFor(s: HqState): Targets {
  const w = currentWeight(s);
  const n = s.nutrition;
  const maintenance = n.heightCm && n.age && n.sex ? round(bmr(w, n.heightCm, n.age, n.sex) * ACTIVITY[activityFor(s)].factor, 10) : null;
  const a = planAverage();
  return {
    maintenance,
    kcal: round(a.kcal, 50),
    proteinG: round(a.p, 5),
    carbsG: round(a.c, 5),
    fatG: round(a.f, 5),
    basis: "plan",
    note: "Tu plan lo armó tu nutrióloga y se lleva por porciones, no contando calorías. Las cifras son aproximadas, solo para que veas por dónde andas.",
  };
}

// --- Plan de la nutrióloga (Lic. Ma. Eva Vásquez, nov 2026) -------------------------
export type Slot = "desayuno" | "comida" | "cena" | "colacion";
export const SLOTS: { id: Slot; label: string; time: string }[] = [
  { id: "desayuno", label: "Desayuno", time: "9:00" },
  { id: "comida", label: "Comida", time: "14:00" },
  { id: "colacion", label: "Proteína", time: "17:00" },
  { id: "cena", label: "Cena", time: "20:30" },
];
type Ing = { item: string; qty: number; unit: string };
export type Dish = { id: string; name: string; slot: Slot; kcal: number; p: number; c: number; f: number; portion: string; ing: Ing[] };

const i = (item: string, qty: number, unit: string): Ing => ({ item, qty, unit });

/** Porciones tal cual vienen en el plan. Calorías y macros son estimaciones nuestras, no de la nutrióloga. */
export const DISHES: Dish[] = [
  // Desayunos
  { id: "d-mexicana", name: "Huevo a la mexicana", slot: "desayuno", kcal: 360, p: 37, c: 23, f: 17, portion: "2 huevos + 3 claras + chile, tomate y cebolla + 2 pz de pan Bimbo Cero + aguacate", ing: [i("Huevo", 2, "pzas"), i("Huevo (claras)", 3, "pzas"), i("Pan Bimbo Cero", 2, "rebanadas"), i("Tomate", 1, "pza"), i("Cebolla", 0.25, "pza"), i("Chile", 1, "pza"), i("Aguacate", 0.25, "pza")] },
  { id: "d-estrellado", name: "Huevo estrellado", slot: "desayuno", kcal: 440, p: 17, c: 42, f: 22, portion: "2 huevos + salsa mexicana + 3 tortillas de maíz + aguacate", ing: [i("Huevo", 2, "pzas"), i("Tortilla de maíz", 3, "pzas"), i("Tomate", 1, "pza"), i("Aguacate", 0.25, "pza")] },
  { id: "d-machaca", name: "Huevo con machaca", slot: "desayuno", kcal: 465, p: 42, c: 42, f: 14, portion: "2 huevos + 3 claras + 3 cdas de machaca + verdura + 3 tortillas de maíz", ing: [i("Huevo", 2, "pzas"), i("Huevo (claras)", 3, "pzas"), i("Machaca", 3, "cdas"), i("Tortilla de maíz", 3, "pzas"), i("Verdura", 0.5, "taza")] },
  { id: "d-jamon", name: "Huevo con jamón", slot: "desayuno", kcal: 380, p: 37, c: 26, f: 12, portion: "2 huevos + 3 claras + 3 rebanadas de jamón + 2 tortillas de maíz", ing: [i("Huevo", 2, "pzas"), i("Huevo (claras)", 3, "pzas"), i("Jamón", 3, "rebanadas"), i("Tortilla de maíz", 2, "pzas")] },
  // Comidas
  { id: "c-fajitas", name: "Fajitas de res con brócoli y coliflor", slot: "comida", kcal: 850, p: 76, c: 60, f: 30, portion: "2 tz de carne de res + brócoli y coliflor libre + 1 tz de arroz + pepino, tomate y aguacate", ing: [i("Carne de res (fajitas)", 2, "tazas"), i("Brócoli", 0.5, "pza"), i("Coliflor", 0.25, "pza"), i("Arroz", 0.33, "taza (crudo)"), i("Pepino", 1, "pza"), i("Tomate", 1, "pza"), i("Aguacate", 0.25, "pza")] },
  { id: "c-pollo", name: "Salteado de pollo", slot: "comida", kcal: 900, p: 105, c: 65, f: 20, portion: "2⅓ tz de pechuga + zanahoria y calabaza al vapor + 2 cdas de elote + aguacate + 4 tortillas de maíz", ing: [i("Pechuga de pollo", 2.33, "tazas"), i("Zanahoria", 1, "pza"), i("Calabacita", 1, "pza"), i("Elote", 2, "cdas"), i("Aguacate", 0.25, "pza"), i("Tortilla de maíz", 4, "pzas")] },
  { id: "c-pescado", name: "Pescado a la plancha", slot: "comida", kcal: 660, p: 70, c: 35, f: 26, portion: "2 pz de tilapia + aguacate + 1 papa cocida + ensalada verde + vinagreta de aceite de oliva, limón y pimienta", ing: [i("Filete de tilapia", 2, "pzas"), i("Papa", 1, "pza"), i("Ensalada verde", 1, "bolsa"), i("Aceite de oliva", 1, "cda"), i("Limón", 1, "pza"), i("Aguacate", 0.25, "pza")] },
  { id: "c-tostadas", name: "Tostadas de carne molida", slot: "comida", kcal: 900, p: 62, c: 85, f: 34, portion: "1½ tz de carne de res + zanahoria y verduras al gusto + ¾ tz de frijoles + 5 tostadas horneadas", ing: [i("Carne molida de res", 1.5, "tazas"), i("Zanahoria", 1, "pza"), i("Frijoles", 0.75, "taza"), i("Tostadas horneadas", 5, "pzas")] },
  { id: "c-ceviche", name: "Ceviche de pescado", slot: "comida", kcal: 600, p: 62, c: 55, f: 14, portion: "Ceviche en cantidad libre + aguacate + 5 tostadas", ing: [i("Pescado para ceviche", 250, "g"), i("Limón", 4, "pzas"), i("Tomate", 1, "pza"), i("Pepino", 1, "pza"), i("Aguacate", 0.25, "pza"), i("Tostadas horneadas", 5, "pzas")] },
  { id: "c-pechuga", name: "Pechuga a la plancha", slot: "comida", kcal: 700, p: 90, c: 20, f: 28, portion: "2 tz de pechuga + salsa al gusto + ensalada verde al gusto + vinagreta de aceite de oliva, limón y pimienta + 2 cdas de arándanos + 3 nueces", ing: [i("Pechuga de pollo", 2, "tazas"), i("Ensalada verde", 1, "bolsa"), i("Aceite de oliva", 1, "cda"), i("Limón", 1, "pza"), i("Arándanos", 2, "cdas"), i("Nuez", 3, "pzas")] },
  // 5:00 pm
  { id: "p-shake", name: "Batido de proteína", slot: "colacion", kcal: 180, p: 26, c: 12, f: 4, portion: "1 scoop de proteína + leche vegetal + 4 fresas", ing: [i("Proteína en polvo", 1, "scoop"), i("Leche vegetal", 250, "ml"), i("Fresas", 4, "pzas")] },
  // Cenas
  { id: "n-fruta", name: "Ensalada de fruta", slot: "cena", kcal: 300, p: 9, c: 50, f: 9, portion: "1½ tz de fruta picada + ½ tz de yogurt + 3 nueces + 2 cdas de granola", ing: [i("Fruta picada", 1.5, "tazas"), i("Yogurt", 0.5, "taza"), i("Nuez", 3, "pzas"), i("Granola", 2, "cdas")] },
  { id: "n-atun", name: "Tostadas de atún", slot: "cena", kcal: 455, p: 50, c: 38, f: 10, portion: "180 g de atún con verduras + 1 cdta de mayonesa + 4 tostadas horneadas", ing: [i("Atún en agua", 180, "g"), i("Verdura", 0.5, "taza"), i("Mayonesa", 1, "cdta"), i("Tostadas horneadas", 4, "pzas")] },
  { id: "n-sincronizada", name: "Sincronizada", slot: "cena", kcal: 480, p: 27, c: 42, f: 22, portion: "3 tortillas de maíz + 3 cdas de queso + 3 rebanadas de jamón + verdura + aguacate", ing: [i("Tortilla de maíz", 3, "pzas"), i("Queso", 3, "cdas"), i("Jamón", 3, "rebanadas"), i("Verdura", 0.5, "taza"), i("Aguacate", 0.25, "pza")] },
  { id: "n-sandwich", name: "Sándwich de jamón", slot: "cena", kcal: 295, p: 18, c: 22, f: 14, portion: "3 rebanadas de jamón de pavo + 2 pz de pan Bimbo Cero + verdura + aguacate + 1 cdta de mayonesa", ing: [i("Jamón de pavo", 3, "rebanadas"), i("Pan Bimbo Cero", 2, "rebanadas"), i("Verdura", 0.5, "taza"), i("Aguacate", 0.25, "pza"), i("Mayonesa", 1, "cdta")] },
];

/** Snacks libres del plan (entre comidas, cuando te dé hambre). */
export const SNACKS = ["Gelatina sin azúcar", "Pepino", "Jícama", "Fruta", "18 almendras", "8 nueces"];

/** Líquidos y suplementos que indicó la nutrióloga. */
export const PLAN_EXTRAS = {
  liquidsL: 2.9,
  routine: [
    { time: "Al despertar", what: "1 taza de agua + 2 cdas de aloe vera (en ayunas)" },
    { time: "9:00 – 1:30 pm", what: "1 litro de té: 1 sobre de manzanilla + 1 sobre de té verde" },
    { time: "4:00 – 8:30 pm", what: "1½ litros de agua + 2 cdas de clorofila" },
  ],
  supplements: [
    { name: "Ashwagandha", when: "1 cápsula en la mañana y 1 a las 11:30 pm" },
    { name: "Vitamina C", when: "Durante el día" },
    { name: "Creatina", when: "Diario (dosis por confirmar con tu nutrióloga)" },
    { name: "Proteína", when: "5:00 pm, en el batido" },
  ],
  /** Medición inicial con la nutrióloga. */
  baseline: { date: "2026-11-04", weightKg: 84.1, bmi: 27.1, fatPct: 21.2, waterPct: 57.7, musclePct: 42.9, waistCm: 94 },
};

export const dishById = (id: string) => DISHES.find((d) => d.id === id) ?? null;

export type MenuMeal = { slot: Slot; dish: Dish; swapped: boolean; /** Siempre 1: las porciones son las del plan. */ x: number };
export type DayMenu = { day: number; meals: MenuMeal[]; kcal: number; p: number };
export const portionLabel = (x: number) => (x === 1 ? "" : `Porción ×${x}`);

/** Un día del plan: rota las opciones de tu nutrióloga para no repetir, respetando tus cambios y lo que no te gusta. */
export function dayMenu(_t: Targets, day: number, opts: { skip?: string[]; avoid?: string[]; fixed?: Partial<Record<Slot, string>> } = {}): DayMenu {
  const order: Slot[] = ["desayuno", "comida", "colacion", "cena"];
  const meals = order.map((slot, k) => {
    const fixed = opts.fixed?.[slot] ? dishById(opts.fixed[slot]!) : null;
    if (fixed) return { slot, dish: fixed, swapped: true, x: 1 };
    const all = DISHES.filter((d) => d.slot === slot);
    const ok = all.filter((d) => !opts.skip?.includes(d.id));
    const list = ok.length ? ok : all;
    let pick = list[(day + k) % list.length]!;
    if (opts.avoid?.includes(pick.id) && list.length > 1) pick = list[(day + k + 1) % list.length]!;
    return { slot, dish: pick, swapped: false, x: 1 };
  });
  return { day, meals, kcal: Math.round(meals.reduce((s, m) => s + m.dish.kcal, 0)), p: Math.round(meals.reduce((s, m) => s + m.dish.p, 0)) };
}

export const swapKey = (weekOf: string, day: number, slot: Slot) => `${weekOf}:${day}:${slot}`;

/** Menú de lunes a domingo; tus cambios se respetan y el resto evita repetir lo de ayer. */
export function weekMenu(s: HqState, weekOf: string): DayMenu[] {
  const t = targetsFor(s);
  const out: DayMenu[] = [];
  for (let day = 0; day < 7; day++) {
    const fixed: Partial<Record<Slot, string>> = {};
    for (const sl of SLOTS) {
      const id = s.nutrition.swaps[swapKey(weekOf, day, sl.id)];
      if (id && dishById(id)) fixed[sl.id] = id;
    }
    const avoid = out.at(-1)?.meals.map((m) => m.dish.id) ?? [];
    out.push(dayMenu(t, day, { skip: s.nutrition.skip, avoid, fixed }));
  }
  return out;
}

/** Otras opciones para el mismo tiempo de comida, de la que más se parece en calorías a la que menos. */
export function alternatives(dish: Dish, skip: string[] = []) {
  return DISHES.filter((d) => d.slot === dish.slot && d.id !== dish.id && !skip.includes(d.id)).sort((a, b) => Math.abs(a.kcal - dish.kcal) - Math.abs(b.kcal - dish.kcal));
}

/** Lista del súper de la semana: suma cantidades del mismo ingrediente. */
export function groceryList(menu: DayMenu[]) {
  const map = new Map<string, Ing>();
  for (const d of menu) for (const m of d.meals) for (const g of m.dish.ing) {
    const key = `${g.item}|${g.unit}`;
    const prev = map.get(key);
    map.set(key, { ...g, qty: (prev?.qty ?? 0) + g.qty * m.x });
  }
  return [...map.values()].sort((a, b) => a.item.localeCompare(b.item, "es"));
}

export const fmtQty = (g: Ing) => {
  const q = Math.round(g.qty * 100) / 100;
  const pretty = q % 1 === 0 ? String(q) : q.toFixed(q < 1 ? 2 : 1).replace(/\.?0+$/, "");
  return `${pretty} ${g.unit}`;
};

/** Qué te toca ahorita según el plan del día. */
export function nextMeal(s: HqState, today: string, hour: number) {
  const t = targetsFor(s);
  const d = L.dayOf(s, today);
  const leftK = t.kcal - L.kcalOf(d);
  const leftP = Math.max(0, t.proteinG - L.proteinOf(d));
  const slot: Slot = hour < 12 ? "desayuno" : hour < 16 ? "comida" : hour < 19 ? "colacion" : "cena";
  const menu = weekMenu(s, weekStartOf(today));
  const dish = menu[L.weekdayIndex(today)]!.meals.find((m) => m.slot === slot)!.dish;
  const time = SLOTS.find((x) => x.id === slot)!.time;
  const text = slot === "colacion"
    ? "A las 5:00 pm toca tu batido de proteína. Si te da hambre antes: pepino, jícama o gelatina sin azúcar."
    : `Opción del plan para hoy (${time}). Si se te antoja otra de las opciones de tu nutrióloga, cámbiala en el menú.`;
  return { slot, leftK, leftP, dish, text };
}

/** Lunes de la semana de una fecha (AAAA-MM-DD). */
function weekStartOf(date: string) {
  return L.addDays(date, -L.weekdayIndex(date));
}
