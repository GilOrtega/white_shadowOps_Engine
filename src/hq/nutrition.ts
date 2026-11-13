import * as L from "./logic";
import type { HqState } from "./schemas";

/**
 * Nutriólogo de WhiteShadow (orientación general, no sustituye a un nutriólogo con cédula).
 * Calcula tu gasto y tu meta con Mifflin-St Jeor, reparte macros y arma un menú mexicano
 * con porciones que se acerca a tu meta. Todo funciona sin IA.
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
  /** Gasto de mantenimiento estimado (null si faltan datos). */
  maintenance: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** De dónde salió la meta. */
  basis: "formula" | "perfil";
  note: string;
};

const round = (n: number, to: number) => Math.round(n / to) * to;

/** Mifflin-St Jeor (1990): la más usada para estimar el gasto en reposo. */
export function bmr(weightKg: number, heightCm: number, age: number, sex: "h" | "m") {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "h" ? 5 : -161);
}

export function targetsFor(s: HqState): Targets {
  const w = currentWeight(s);
  const n = s.nutrition;
  const goal = s.plan?.goal ?? "bajar";
  let kcal = s.profile.calorieTarget;
  let maintenance: number | null = null;
  let basis: Targets["basis"] = "perfil";
  let note = "Completa estatura, edad y sexo para calcular tu meta con fórmula.";
  if (n.heightCm && n.age && n.sex) {
    maintenance = round(bmr(w, n.heightCm, n.age, n.sex) * ACTIVITY[activityFor(s)].factor, 10);
    const adj = goal === "bajar" ? -0.2 : goal === "ambas" ? -0.15 : 0.1;
    kcal = Math.max(KCAL_FLOOR, round(maintenance * (1 + adj), 50));
    basis = "formula";
    note = goal === "bajar" ? "Déficit de ~20 %: bajas sin matarte de hambre."
      : goal === "ambas" ? "Déficit moderado (~15 %) con proteína alta: bajar grasa y cuidar músculo."
        : "Superávit ligero (~10 %) para construir músculo sin subir de más.";
    if (kcal === KCAL_FLOOR && maintenance * (1 + adj) < KCAL_FLOOR) note += " Se respetó el mínimo de 1,500 kcal.";
  }
  const proteinG = Math.min(230, round(w * (goal === "musculo" ? 1.8 : 2.0), 5));
  const fatG = round((kcal * 0.27) / 9, 5);
  const carbsG = Math.max(50, round((kcal - proteinG * 4 - fatG * 9) / 4, 5));
  return { maintenance, kcal, proteinG, carbsG, fatG, basis, note };
}

// --- Recetario --------------------------------------------------------------------
export type Slot = "desayuno" | "comida" | "cena" | "colacion";
export const SLOTS: { id: Slot; label: string; time: string }[] = [
  { id: "desayuno", label: "Desayuno", time: "8:00" },
  { id: "comida", label: "Comida", time: "14:00" },
  { id: "colacion", label: "Colación", time: "17:30" },
  { id: "cena", label: "Cena", time: "20:30" },
];
type Ing = { item: string; qty: number; unit: string };
export type Dish = { id: string; name: string; slot: Slot; kcal: number; p: number; c: number; f: number; portion: string; ing: Ing[] };

const i = (item: string, qty: number, unit: string): Ing => ({ item, qty, unit });

/** Valores aproximados por porción (tablas de composición comunes); sirven para orientarte, no son exactos. */
export const DISHES: Dish[] = [
  // Desayunos
  { id: "huevo-mexicana", name: "Huevos a la mexicana con frijoles", slot: "desayuno", kcal: 520, p: 28, c: 48, f: 24, portion: "3 huevos, 2 tortillas de maíz, ½ taza de frijoles", ing: [i("Huevo", 3, "pzas"), i("Tortilla de maíz", 2, "pzas"), i("Frijoles", 0.5, "taza"), i("Jitomate", 1, "pza"), i("Cebolla", 0.25, "pza")] },
  { id: "avena-claras", name: "Avena con plátano y claras", slot: "desayuno", kcal: 430, p: 32, c: 62, f: 6, portion: "½ taza de avena con leche light, 4 claras, 1 plátano", ing: [i("Avena", 0.5, "taza"), i("Leche light", 250, "ml"), i("Huevo (claras)", 4, "pzas"), i("Plátano", 1, "pza")] },
  { id: "molletes", name: "Molletes integrales con panela", slot: "desayuno", kcal: 480, p: 26, c: 58, f: 14, portion: "2 mitades de bolillo integral, frijol, 60 g de panela, pico de gallo", ing: [i("Bolillo integral", 1, "pza"), i("Frijoles", 0.5, "taza"), i("Queso panela", 60, "g"), i("Jitomate", 1, "pza")] },
  { id: "licuado-yogur", name: "Licuado de yogur griego, avena y plátano", slot: "desayuno", kcal: 430, p: 32, c: 58, f: 8, portion: "200 g de yogur griego natural, 250 ml de leche light, 30 g de avena, 1 plátano", ing: [i("Yogur griego natural", 200, "g"), i("Leche light", 250, "ml"), i("Avena", 0.25, "taza"), i("Plátano", 1, "pza")] },
  { id: "chilaquiles-pollo", name: "Chilaquiles horneados con pollo", slot: "desayuno", kcal: 520, p: 38, c: 50, f: 18, portion: "40 g de totopo horneado, salsa verde, 100 g de pollo, queso fresco", ing: [i("Totopos horneados", 40, "g"), i("Pechuga de pollo", 100, "g"), i("Tomate verde", 3, "pzas"), i("Queso fresco", 30, "g")] },
  // Comidas
  { id: "pollo-arroz", name: "Pechuga asada con arroz y ensalada", slot: "comida", kcal: 640, p: 55, c: 62, f: 16, portion: "180 g de pechuga, 1 taza de arroz, ensalada, ¼ de aguacate", ing: [i("Pechuga de pollo", 180, "g"), i("Arroz", 0.5, "taza (crudo)"), i("Lechuga", 0.25, "pza"), i("Aguacate", 0.25, "pza")] },
  { id: "tacos-bistec", name: "Tacos de bistec con frijoles de la olla", slot: "comida", kcal: 700, p: 48, c: 70, f: 22, portion: "4 tacos (150 g de bistec) con cebolla y cilantro, ½ taza de frijoles", ing: [i("Bistec de res", 150, "g"), i("Tortilla de maíz", 4, "pzas"), i("Frijoles", 0.5, "taza"), i("Cebolla", 0.25, "pza")] },
  { id: "caldo-res", name: "Caldo de res con verduras", slot: "comida", kcal: 520, p: 40, c: 45, f: 18, portion: "1 plato grande (150 g de carne), 2 tortillas", ing: [i("Chambarete de res", 150, "g"), i("Calabacita", 1, "pza"), i("Zanahoria", 1, "pza"), i("Elote", 0.5, "pza"), i("Tortilla de maíz", 2, "pzas")] },
  { id: "tinga-tostadas", name: "Tinga de pollo en tostadas horneadas", slot: "comida", kcal: 560, p: 45, c: 50, f: 18, portion: "200 g de tinga, 3 tostadas horneadas, lechuga", ing: [i("Pechuga de pollo", 160, "g"), i("Tostadas horneadas", 3, "pzas"), i("Jitomate", 2, "pzas"), i("Chipotle", 1, "pza")] },
  { id: "pescado-arroz", name: "Filete de pescado a la plancha con arroz", slot: "comida", kcal: 560, p: 48, c: 55, f: 14, portion: "200 g de pescado blanco, ¾ de taza de arroz, ensalada", ing: [i("Filete de pescado", 200, "g"), i("Arroz", 0.4, "taza (crudo)"), i("Pepino", 1, "pza"), i("Limón", 2, "pzas")] },
  { id: "carne-nopales", name: "Carne asada con nopales y frijoles", slot: "comida", kcal: 680, p: 52, c: 50, f: 28, portion: "180 g de carne asada, nopales asados, ½ taza de frijoles, 2 tortillas", ing: [i("Arrachera o diezmillo", 180, "g"), i("Nopales", 3, "pzas"), i("Frijoles", 0.5, "taza"), i("Tortilla de maíz", 2, "pzas")] },
  { id: "tostadas-atun", name: "Tostadas de atún con pico de gallo", slot: "comida", kcal: 520, p: 50, c: 40, f: 16, portion: "2 latas de atún en agua, 3 tostadas horneadas, ¼ de aguacate", ing: [i("Atún en agua", 2, "latas"), i("Tostadas horneadas", 3, "pzas"), i("Jitomate", 1, "pza"), i("Aguacate", 0.25, "pza")] },
  // Cenas
  { id: "quesadillas-pollo", name: "Quesadillas de pollo con panela", slot: "cena", kcal: 460, p: 36, c: 40, f: 16, portion: "2 tortillas de maíz, 80 g de pollo, 50 g de panela, salsa", ing: [i("Tortilla de maíz", 2, "pzas"), i("Pechuga de pollo", 80, "g"), i("Queso panela", 50, "g")] },
  { id: "ensalada-pollo", name: "Ensalada de pollo y garbanzo", slot: "cena", kcal: 450, p: 42, c: 30, f: 16, portion: "150 g de pollo, ½ taza de garbanzo, verduras, 1 cda de aceite de oliva", ing: [i("Pechuga de pollo", 150, "g"), i("Garbanzo cocido", 0.5, "taza"), i("Lechuga", 0.25, "pza"), i("Aceite de oliva", 1, "cda")] },
  { id: "huevo-nopal", name: "Huevos con nopales", slot: "cena", kcal: 330, p: 28, c: 20, f: 14, portion: "2 huevos + 3 claras, nopales, 1 tortilla", ing: [i("Huevo", 2, "pzas"), i("Huevo (claras)", 3, "pzas"), i("Nopales", 2, "pzas"), i("Tortilla de maíz", 1, "pza")] },
  { id: "sincronizadas", name: "Sincronizadas de pavo y panela", slot: "cena", kcal: 420, p: 30, c: 40, f: 14, portion: "2 tortillas de harina integral, 60 g de pechuga de pavo, 40 g de panela", ing: [i("Tortilla de harina integral", 2, "pzas"), i("Pechuga de pavo", 60, "g"), i("Queso panela", 40, "g")] },
  { id: "bowl-yogur", name: "Bowl de yogur griego con fruta", slot: "cena", kcal: 380, p: 28, c: 48, f: 8, portion: "250 g de yogur griego natural, 1 taza de fruta, 30 g de granola", ing: [i("Yogur griego natural", 250, "g"), i("Fruta de temporada", 1, "taza"), i("Granola", 30, "g")] },
  // Colaciones
  { id: "manzana-cacahuate", name: "Manzana con cacahuates", slot: "colacion", kcal: 230, p: 7, c: 28, f: 11, portion: "1 manzana, 20 g de cacahuate natural", ing: [i("Manzana", 1, "pza"), i("Cacahuate natural", 20, "g")] },
  { id: "jicama-panela", name: "Jícama y pepino con panela", slot: "colacion", kcal: 200, p: 14, c: 18, f: 8, portion: "1 taza de jícama y pepino con limón y chile, 60 g de panela", ing: [i("Jícama", 0.5, "pza"), i("Pepino", 1, "pza"), i("Queso panela", 60, "g")] },
  { id: "yogur-nueces", name: "Yogur griego con nueces", slot: "colacion", kcal: 220, p: 18, c: 10, f: 12, portion: "170 g de yogur griego natural, 15 g de nuez", ing: [i("Yogur griego natural", 170, "g"), i("Nuez", 15, "g")] },
  { id: "atun-galletas", name: "Atún con galletas saladas", slot: "colacion", kcal: 250, p: 28, c: 20, f: 6, portion: "1 lata de atún en agua, 6 galletas saladas", ing: [i("Atún en agua", 1, "lata"), i("Galletas saladas", 6, "pzas")] },
  { id: "huevo-naranja", name: "Huevos cocidos y naranja", slot: "colacion", kcal: 220, p: 13, c: 16, f: 10, portion: "2 huevos cocidos, 1 naranja", ing: [i("Huevo", 2, "pzas"), i("Naranja", 1, "pza")] },
];
export const dishById = (id: string) => DISHES.find((d) => d.id === id) ?? null;

export type MenuMeal = { slot: Slot; dish: Dish; swapped: boolean; /** Porción: 1, 1.25 o 1.5. */ x: number };
export type DayMenu = { day: number; meals: MenuMeal[]; kcal: number; p: number };
const PORTIONS = [1, 1.25, 1.5];
export const portionLabel = (x: number) => (x === 1 ? "" : x === 1.25 ? "Porción y cuarto" : "Porción y media");

/** Elige la combinación de platillos más cercana a tu meta (calorías y proteína), variando día con día. */
export function dayMenu(t: Targets, day: number, opts: { skip?: string[]; avoid?: string[]; fixed?: Partial<Record<Slot, string>> } = {}): DayMenu {
  const pool = (slot: Slot) => {
    const fixed = opts.fixed?.[slot] ? dishById(opts.fixed[slot]!) : null;
    if (fixed) return [fixed];
    const list = DISHES.filter((d) => d.slot === slot && !opts.skip?.includes(d.id));
    return list.length ? list : DISHES.filter((d) => d.slot === slot);
  };
  const [D, C, S, N] = (["desayuno", "comida", "colacion", "cena"] as Slot[]).map(pool) as [Dish[], Dish[], Dish[], Dish[]];
  let best: { score: number; combo: Dish[]; xs: number[] } | null = null;
  for (const a of D) for (const b of C) for (const c of S) for (const d of N) for (const xb of PORTIONS) for (const xd of PORTIONS) {
    const combo = [a, b, c, d];
    const xs = [1, xb, 1, xd];
    const kcal = combo.reduce((s, x, k) => s + x.kcal * xs[k]!, 0);
    const p = combo.reduce((s, x, k) => s + x.p * xs[k]!, 0);
    // Cerca de la meta, sin quedarse corto de proteína, distinto a ayer y sin agrandar porciones de más.
    const repeat = combo.filter((x) => opts.avoid?.includes(x.id)).length;
    const rot = combo.reduce((s, x, k) => s + ((DISHES.indexOf(x) + day * (k + 2)) % 7) * 0.05, 0);
    const big = (xb - 1 + xd - 1) * 0.8;
    const score = Math.abs(kcal - t.kcal) / 40 + Math.max(0, t.proteinG - p) / 4 + repeat * 1.5 + rot + big;
    if (!best || score < best.score) best = { score, combo, xs };
  }
  const order: Slot[] = ["desayuno", "comida", "colacion", "cena"];
  const meals = best!.combo.map((dish, k) => ({ slot: order[k]!, dish, swapped: Boolean(opts.fixed?.[order[k]!]), x: best!.xs[k]! }));
  return { day, meals, kcal: Math.round(meals.reduce((s, m) => s + m.dish.kcal * m.x, 0)), p: Math.round(meals.reduce((s, m) => s + m.dish.p * m.x, 0)) };
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

/** Qué te conviene comer ahorita con lo que ya llevas en el día. */
export function nextMeal(s: HqState, today: string, hour: number) {
  const t = targetsFor(s);
  const d = L.dayOf(s, today);
  const kcal = L.kcalOf(d);
  const p = L.proteinOf(d);
  const leftK = t.kcal - kcal;
  const leftP = Math.max(0, t.proteinG - p);
  const slot: Slot = hour < 11 ? "desayuno" : hour < 16 ? "comida" : hour < 19 ? "colacion" : "cena";
  if (leftK < 150) {
    return { slot, leftK, leftP, dish: dishById("jicama-panela"), text: leftK < 0 ? `Ya vas ${Math.abs(leftK).toLocaleString("es-MX")} kcal arriba. No lo compenses mañana: vuelve a tu plan normal. Si te da hambre, algo ligero y con proteína.` : "Ya casi cumples tus calorías. Si te da hambre, algo ligero y con proteína." };
  }
  const options = DISHES.filter((x) => x.slot === slot && !s.nutrition.skip.includes(x.id) && x.kcal <= leftK + 60);
  const pick = options.sort((a, b) => (b.p / b.kcal) - (a.p / a.kcal))[0] ?? DISHES.filter((x) => x.slot === "colacion").sort((a, b) => a.kcal - b.kcal)[0]!;
  const text = leftP > 40
    ? `Te quedan ${leftK.toLocaleString("es-MX")} kcal y te faltan ${Math.round(leftP)} g de proteína: prioriza la proteína.`
    : `Te quedan ${leftK.toLocaleString("es-MX")} kcal. Vas bien de proteína.`;
  return { slot, leftK, leftP, dish: pick, text };
}
