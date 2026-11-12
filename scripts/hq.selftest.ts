/** Pruebas de la lógica del centro de mando.  npx tsx scripts/hq.selftest.ts */
import assert from "node:assert/strict";
import * as L from "../src/hq/logic";
import { defaultState, HqStateSchema, type HqState } from "../src/hq/schemas";

const meal = (kcal: number, i = 0) => ({ id: `m${i}`, name: "comida", kcal, proteinG: 30, source: "manual" as const, at: "x" });

function main() {
  const TODAY = "2026-11-09"; // lunes
  assert.equal(L.weekdayIndex(TODAY), 0);
  assert.equal(L.weekdayIndex("2026-11-15"), 6);
  assert.equal(L.addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(L.diffDays("2026-10-23", TODAY), 17);

  let s: HqState = defaultState();
  const info = L.challengeInfo(s.profile, TODAY);
  assert.equal(info.dayNumber, 18);
  assert.equal(info.daysLeft, 42);
  assert.equal(info.endDate, "2026-12-21");
  assert.equal(L.challengeInfo(s.profile, "2027-03-01").finished, true);

  // sin plan: pregunta del Estratega y entrenamiento genérico
  assert.ok(L.agentQuestions(s, TODAY).some((q) => q.id === "plan"));
  assert.equal(L.trainingFor(null, TODAY).kind, "walk");
  assert.equal(L.buildPlan(["bajar", "4"], "now"), null);

  const plan = L.buildPlan(["bajar", "4", "tarde", "tres"], "now")!;
  assert.deepEqual(plan.gymDays, [0, 1, 3, 4]);
  s = { ...s, plan };
  // 4 días → Torso / Pierna: lun torso A, mar pierna A, jue torso B, vie pierna B.
  assert.match(L.trainingFor(plan, TODAY).title, /Torso A/);
  assert.match(L.trainingFor(plan, "2026-11-10").title, /Pierna A/);
  assert.equal(L.trainingFor(plan, "2026-11-11").kind, "walk");
  assert.match(L.trainingFor(plan, "2026-11-12").title, /Torso B/);
  assert.ok(L.trainingFor(plan, TODAY).exercises.length >= 5, "rutina completa, no solo 'haz pierna'");
  assert.equal(L.trainingFor(plan, "2026-11-15").kind, "rest");
  assert.equal(L.isContentDay(plan, TODAY), true);
  assert.equal(L.isContentDay(plan, "2026-11-10"), false);
  const week = L.planWeek(plan);
  assert.equal(week.filter((d) => d.gym).length, 4);
  assert.match(week[6]!.extra, /pesaje/);

  // misiones y día cumplido
  assert.equal(L.isDayComplete(s, TODAY), false);
  const withDay = (st: HqState, date: string, patch: object): HqState => ({ ...st, days: { ...st.days, [date]: { ...L.dayOf(st, date), ...patch } } });
  s = withDay(s, TODAY, { trainingDone: true, meals: [meal(700, 1)] });
  assert.equal(L.isDayComplete(s, TODAY), false, "1 comida no basta");
  s = withDay(s, TODAY, { meals: [meal(700, 1), meal(800, 2)] });
  assert.equal(L.isDayComplete(s, TODAY), true);
  assert.equal(L.missionsFor(s, TODAY).find((m) => m.id === "clip")?.required, false, "el clip es bonus");
  s = withDay(s, TODAY, { meals: [meal(1500, 1), meal(900, 2)] });
  assert.equal(L.isDayComplete(s, TODAY), false, "pasarse de calorías rompe el día");
  s = withDay(s, TODAY, { meals: [meal(700, 1), meal(800, 2)] });

  // racha: hoy + 2 días atrás; hoy incompleto no la rompe
  for (const d of ["2026-11-08", "2026-11-07"]) s = withDay(s, d, { trainingDone: true, meals: [meal(600, 1), meal(600, 2)] });
  assert.equal(L.streak(s, TODAY), 3);
  assert.equal(L.streak(s, "2026-11-10"), 3);
  assert.equal(L.streak(s, "2026-11-11"), 0);

  // niveles
  s = withDay(s, TODAY, { clipDone: true, weightKg: 87.4 });
  const p = L.progress(s);
  assert.equal(p.xp, 3 * 100 + 25 + 10);
  assert.equal(p.level, 2);
  assert.equal(p.completeDays, 3);

  // rangos y mapa del reto
  assert.deepEqual([L.rankInfo(0).name, L.rankInfo(335).name, L.rankInfo(335).toNext, L.rankInfo(335).nextName], ["Recluta", "Soldado", 265, "Cabo"]);
  assert.deepEqual([L.rankInfo(2999).name, L.rankInfo(2999).nextName, L.rankInfo(3000).name, L.rankInfo(3000).prestige], ["Leyenda", "Prestigio 1", "Recluta", 1]);
  const grid = L.challengeGrid(s, TODAY);
  assert.equal(grid.length, 60);
  assert.deepEqual([grid[17]!.state, grid[16]!.state, grid[14]!.state, grid[18]!.state], ["done", "done", "missed", "future"]);
  assert.equal(L.challengeGrid(defaultState(), TODAY)[17]!.state, "today");

  // peso: incluye el punto de inicio y promedia 7 días
  s = withDay(s, "2026-11-02", { weightKg: 88.0 });
  const series = L.weightSeries(s);
  assert.equal(series[0]!.date, "2026-10-23");
  assert.equal(series[0]!.kg, 87.95);
  assert.equal(series.at(-1)!.kg, 87.4);
  assert.ok(Math.abs(series.at(-1)!.trend - 87.4) < 1e-9, "88.0 ya quedó fuera de la ventana de 7 días");
  const rate = L.weeklyRate(series)!;
  assert.ok(Math.abs(rate - (87.4 - 88.0)) < 1e-9, `ritmo ${rate}`);
  assert.equal(L.weeklyRate(series.slice(0, 1)), null);

  // el Coach es conservador
  let fast = withDay(s, TODAY, { weightKg: 85.0 });
  assert.match(L.coachNote(fast, TODAY), /más de 1 kg por semana/);
  fast = { ...s, profile: { ...s.profile, goalWeightKg: 75 } };
  assert.match(L.coachNote(fast, TODAY), /no voy a empujar/);
  assert.match(L.coachNote(withDay(s, TODAY, { feeling: "fundido" }), TODAY), /una serie menos/);
  assert.match(L.coachNote(defaultState(), TODAY), /Sin báscula/);

  // agentes
  const cards = L.agentCards(s, TODAY);
  assert.equal(cards.length, 6);
  assert.equal(cards.find((c) => c.id === "coach")!.status, "done");
  assert.equal(cards.find((c) => c.id === "nutri")!.pct, Math.round((1500 / 2100) * 100));
  const qs = L.agentQuestions(s, TODAY);
  assert.ok(!qs.some((q) => q.id === "plan" || q.id === "weight" || q.id === "feeling"));
  assert.ok(qs.some((q) => q.id === "goal"));
  assert.ok(L.agentQuestions({ ...defaultState(), plan }, TODAY).some((q) => q.id === "weight"));

  // la mascota habla según el día
  const fresh = { ...defaultState(), plan };
  assert.deepEqual([L.mascotLine(fresh, TODAY, 8).mood, L.mascotLine(fresh, TODAY, 20).mood], ["listo", "preocupado"]);
  assert.equal(L.mascotLine(s, TODAY, 20).mood, "fiesta");
  const half = withDay(fresh, TODAY, { trainingDone: true });
  assert.match(L.mascotLine(half, TODAY, 13).text, /Te falta: Registrar tus comidas/);
  assert.match(L.mascotReply("ahora", fresh, TODAY).text, /Ponte los tenis/);
  assert.match(L.mascotReply("ahora", s, TODAY).text, /Ya cumpliste/);
  assert.match(L.mascotReply("animo", s, TODAY).text, /Llevas 3 días cumplidos y 0\.\d kg menos/);
  assert.match(L.mascotReply("animo", fresh, TODAY).text, /Todos empiezan en cero/);
  assert.match(L.mascotReply("ahora", withDay(fresh, TODAY, { trainingDone: true, meals: [meal(1500, 1), meal(900, 2)] }), TODAY).text, /No lo compenses/);

  // el estado sobrevive ida y vuelta por JSON y rechaza basura
  assert.deepEqual(HqStateSchema.parse(JSON.parse(JSON.stringify(s))), s);
  assert.equal(HqStateSchema.safeParse({ profile: { calorieTarget: 900 } }).success, false, "piso de calorías");
  assert.equal(HqStateSchema.safeParse({ days: { hoy: {} } }).success, false);
  assert.equal(HqStateSchema.safeParse({ profile: { photo: "javascript:alert(1)" } }).success, false, "la foto solo puede ser un JPEG en data URL");
  assert.equal(HqStateSchema.safeParse({ profile: { photo: "data:image/jpeg;base64,AAAA" } }).success, true);

  console.log("hq OK ✔", { dia: info.dayNumber, racha: L.streak(s, TODAY), nivel: p.level, ritmo: rate.toFixed(2) });
}
main();
