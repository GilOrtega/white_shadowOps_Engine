/** Renderiza las pantallas con datos sembrados para cachar errores de render.  npx tsx scripts/ui.selftest.tsx */
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { DashboardView } from "../src/components/hq/Dashboard";
import { Mascot } from "../src/components/hq/Mascot";
import { PlanView } from "../src/components/hq/PlanInterview";
import { ProgressView } from "../src/components/hq/Progress";
import { SettingsView } from "../src/components/hq/Settings";
import { buildPlan } from "../src/hq/logic";
import { defaultState, HqStateSchema } from "../src/hq/schemas";

const TODAY = "2026-11-09";
const meal = (name: string, kcal: number) => ({ id: name, name, kcal, proteinG: 35, source: "manual", at: "x" });
const seeded = HqStateSchema.parse({
  plan: buildPlan(["bajar", "4", "tarde", "tres"], "now"),
  profile: { goalWeightKg: 84 },
  days: {
    "2026-11-02": { date: "2026-11-02", weightKg: 88.1, trainingDone: true, meals: [meal("a", 700), meal("b", 900)] },
    "2026-11-06": { date: "2026-11-06", weightKg: 87.6 },
    [TODAY]: { date: TODAY, weightKg: 87.4, trainingDone: true, feeling: "normal", meals: [meal("Huevos con frijoles", 520), meal("Tacos de asada", 780)] },
  },
});

const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const empty = text(renderToString(<DashboardView hq={defaultState()} today={TODAY} />));
assert.match(empty, /Día 18 de 60/);
assert.match(empty, /A remontar, Buddy\./);
assert.match(empty, /Recluta/);
assert.match(empty, /Rapo a la 0/);
assert.match(empty, /Daily Fuel/);
assert.match(empty, /Sin asegurar/);
const late = text(renderToString(<DashboardView hq={defaultState()} today={TODAY} hour={21} />));
assert.match(late, /Quedan 3 h/);
const ghost = text(renderToString(<Mascot hq={defaultState()} today={TODAY} hour={20} variant="panel" />));
assert.match(ghost, /Sombra/);
assert.match(ghost, /¿Qué hago ahorita\?/);
assert.match(ghost, /Ya es tarde y el día sigue en ceros/);
assert.match(empty, /Necesito 4 respuestas/);
assert.match(empty, /¿Cuánto pesaste hoy en ayunas\?/);
assert.match(empty, /0 de 3/);

const dash = text(renderToString(<DashboardView hq={seeded} today={TODAY} />));
assert.match(dash, /Gym — Día A: pierna \+ empuje/);
assert.match(dash, /Día cumplido\./);
assert.match(dash, /Día asegurado/);
assert.match(dash, /El mapa de tu remontada/);
assert.match(dash, /La apuesta: Si fallo, me rapo con la 0\./);
assert.match(dash, /\d+ XP para Soldado/);
assert.match(dash, /1,300 \/ 2,100/);
assert.match(dash, /Tacos de asada/);
assert.match(dash, /Sentadilla o prensa 3×10/);
assert.match(dash, /Plan activo/);
assert.match(dash, /\+25 XP/);
assert.ok(!/NaN|undefined|\[object/.test(dash), "sin NaN/undefined en pantalla");

const prog = text(renderToString(<ProgressView hq={seeded} today={TODAY} />));
assert.match(prog, /Tendencia \(promedio de 7 días\)/);
assert.match(prog, /meta 84\.0/);
assert.match(prog, /Cumplido/);
assert.ok(!/NaN|undefined/.test(prog));
assert.match(text(renderToString(<ProgressView hq={defaultState()} today={TODAY} />)), /Registra tu primer pesaje/);

assert.match(text(renderToString(<PlanView hq={defaultState()} />)), /Pregunta 1 de 4/);
assert.match(text(renderToString(<PlanView hq={defaultState()} initialAnswers={["bajar", "3", "noche", "diario"]} />)), /Aceptar plan/);
assert.match(text(renderToString(<PlanView hq={seeded} />)), /Tu plan activo/);
assert.match(text(renderToString(<SettingsView hq={seeded} />)), /Agentes con IA/);

console.log("ui OK ✔");
