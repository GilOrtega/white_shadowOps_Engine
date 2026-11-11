/** Pruebas offline de los agentes Nutri y Coach (LLM simulado).  npx tsx scripts/agents.selftest.ts */
import assert from "node:assert/strict";
import type { StructuredLlm } from "../src/engine";
import { applyGuardrails, coachAdvice, CoachRequestSchema } from "../src/hq/agents/coach";
import { mascotAnswer, MascotRequestSchema } from "../src/hq/agents/mascota";
import { estimateMeal, NutriRequestSchema } from "../src/hq/agents/nutri";
import { checkAgentAccess } from "../src/hq/server/auth";

const fakeLlm = (raw: unknown, seen: { req?: any } = {}): StructuredLlm => ({
  async generate(req) {
    seen.req = req;
    return { data: req.schema.parse(raw), attempts: 1, usage: { inputTokens: 0, outputTokens: 0 }, model: "fake" };
  },
});

async function main() {
  // Nutri: el total lo suma el código, no el modelo
  const seen: { req?: any } = {};
  const img = { imageBase64: "A".repeat(200), mediaType: "image/jpeg" as const, hint: "tacos de asada" };
  const est = await estimateMeal(
    fakeLlm({ isFood: true, name: "Tacos de asada", confidence: "media", note: "3 tacos con tortilla de maíz", items: [
      { food: "Carne asada", portion: "150 g", kcal: 330, proteinG: 38.4 },
      { food: "Tortilla de maíz", portion: "3 piezas", kcal: 190, proteinG: 4.2 },
    ] }, seen),
    img,
  );
  assert.equal(est.kcal, 520);
  assert.equal(est.proteinG, 43);
  assert.equal(seen.req.images[0].mediaType, "image/jpeg");
  assert.match(seen.req.prompt, /tacos de asada/);
  const notFood = await estimateMeal(fakeLlm({ isFood: false, name: "No es comida", confidence: "alta", note: "Es un teclado", items: [{ food: "x", portion: "1", kcal: 999, proteinG: 1 }] }), img);
  assert.equal(notFood.kcal, 0, "si no es comida no cuenta calorías");
  assert.equal(NutriRequestSchema.safeParse({ imageBase64: "no es base64!!".repeat(20), mediaType: "image/jpeg" }).success, false);
  assert.equal(NutriRequestSchema.safeParse({ imageBase64: "A".repeat(200), mediaType: "image/gif" }).success, false);

  // Coach: las reglas del código mandan sobre el modelo
  const day = (complete: boolean) => ({ date: "2026-11-01", complete, trained: complete, meals: 3, kcal: 2000, weightKg: null, feeling: null });
  const base = CoachRequestSchema.parse({ dayNumber: 18, challengeDays: 60, startWeightKg: 87.95, goalWeightKg: null, calorieTarget: 2100, trendKg: 87.4, weeklyRateKg: -0.1, streak: 3, plan: { goal: "bajar", gymDaysPerWeek: 4 }, days: Array.from({ length: 14 }, (_, i) => day(i % 2 === 0)) });
  const cut = { headline: "Semana floja, hay que apretar", bullets: ["Cumpliste 3 de 7 días."], actionToday: "Ve al gym hoy.", adjustment: "menos_kcal" as const };
  assert.equal(applyGuardrails(cut, base).adjustment, "ninguno", "sin constancia no se bajan calorías");
  const good = { ...base, days: Array.from({ length: 14 }, () => day(true)) };
  assert.equal(applyGuardrails(cut, good).adjustment, "menos_kcal");
  assert.equal(applyGuardrails(cut, { ...good, weeklyRateKg: -1.3 }).adjustment, "mas_kcal");
  assert.equal(applyGuardrails(cut, { ...good, calorieTarget: 1600 }).adjustment, "mas_caminata");
  const adv = await coachAdvice(fakeLlm(cut), base);
  assert.ok(adv.guardrail);
  assert.equal(CoachRequestSchema.safeParse({ ...base, calorieTarget: 1000 }).success, false);

  // Mascota: valida entrada y manda los datos como datos
  const mseen: { req?: any } = {};
  const mreq = MascotRequestSchema.parse({ message: "ya no quiero ir al gym", context: { name: "Buddy", mascotName: "Sombra", dayNumber: 18, daysLeft: 42, streak: 0, completeDays: 3, rank: "Soldado", missionsLeft: ["Gym — Día A"], training: "Gym — Día A", kcal: 0, calorieTarget: 2100, stake: "x" } });
  const ans = await mascotAnswer(fakeLlm({ reply: "Llevas 3 días. Ve hoy aunque sea 30 minutos.", mood: "fuego" }, mseen), mreq);
  assert.equal(ans.mood, "fuego");
  assert.match(mseen.req.prompt, /<mensaje>\nya no quiero ir al gym/);
  assert.match(mseen.req.system, /nunca sugieras bajar más de 1 kg/);
  assert.equal(MascotRequestSchema.safeParse({ ...mreq, message: "x".repeat(301) }).success, false);

  // Acceso
  const req = (key?: string) => new Request("http://x/api", { method: "POST", headers: key ? { "x-wso-key": key } : {} });
  delete process.env.ANTHROPIC_API_KEY; delete process.env.WSO_API_SECRET;
  assert.deepEqual([checkAgentAccess(req("x")).ok, (checkAgentAccess(req("x")) as any).code], [false, "NOT_CONFIGURED"]);
  process.env.ANTHROPIC_API_KEY = "k"; process.env.WSO_API_SECRET = "secreto-de-prueba-123";
  assert.equal((checkAgentAccess(req()) as any).code, "UNAUTHORIZED");
  assert.equal((checkAgentAccess(req("otro")) as any).code, "UNAUTHORIZED");
  assert.equal(checkAgentAccess(req("secreto-de-prueba-123")).ok, true);

  console.log("agentes OK ✔");
}
main().catch((e) => { console.error(e); process.exit(1); });
