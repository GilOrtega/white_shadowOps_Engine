/** Renderiza las pantallas con datos sembrados para cachar errores de render.  npx tsx scripts/ui.selftest.tsx */
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { BodyTop, DashboardView, Team } from "../src/components/hq/Dashboard";
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
const bodyEmpty = text(renderToString(<BodyTop hq={defaultState()} today={TODAY} hour={12} />));
assert.match(bodyEmpty, /A remontar, Buddy\./);
assert.match(bodyEmpty, /Recluta/);
assert.match(bodyEmpty, /Rapo a la 0/);
assert.match(empty, /Daily Fuel/);
assert.match(empty, /Sin asegurar/);
const late = text(renderToString(<BodyTop hq={defaultState()} today={TODAY} hour={21} />));
assert.match(late, /Quedan 3 h/);
const ghost = text(renderToString(<Mascot hq={defaultState()} today={TODAY} hour={20} variant="panel" />));
assert.match(ghost, /Sombra/);
assert.match(ghost, /¿Qué hago ahorita\?/);
assert.match(ghost, /Ya es tarde y el día sigue en ceros/);
assert.match(bodyEmpty, /Necesito 4 respuestas/);
assert.match(bodyEmpty, /¿Cuánto pesaste hoy en ayunas\?/);
assert.match(empty, /Tu lista de hoy/);
assert.match(empty, /para la flama/);
assert.match(empty, /Solo hoy Todos los días/);

const dash = text(renderToString(<DashboardView hq={seeded} today={TODAY} />));
assert.match(dash, /Gym — Torso A \(fuerza\)/);
const body = text(renderToString(<BodyTop hq={seeded} today={TODAY} hour={12} />));
assert.match(body, /Día cumplido\./);
assert.match(dash, /Día asegurado/);
assert.match(body, /Calendario de flamas/);
assert.match(body, /La evolución de tu Sombra/);
assert.match(body, /Sombra Bestia|Bestia/);
assert.match(dash, /3 de 3 · cumple el 80 %/);
assert.match(dash, /Día completo\. Así se hace\./);
assert.ok(!/1 semanas|Faltan 1 /.test(dash), "plurales bien");
assert.match(body, /La apuesta: Si fallo, me rapo con la 0\./);
assert.match(body, /\d+ XP para Soldado/);
assert.match(dash, /1,300 de 2,100 kcal/);
assert.match(dash, /Tacos de asada/);
assert.match(dash, /Press de banca/);
assert.match(dash, /4×5–7 reps · descanso 3:00/);
assert.match(dash, /Calentamiento/);
assert.match(dash, /Terminar entrenamiento|Entrenamiento hecho/);
assert.match(text(renderToString(<Team hq={seeded} today={TODAY} />)), /Plan activo/);
assert.ok(!/NaN|undefined|\[object/.test(body), "sin NaN/undefined en Progreso");
assert.match(dash, /Grabar un clip de 20 s/);
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
