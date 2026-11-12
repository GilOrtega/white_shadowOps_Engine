/** Centro de mando por facetas.  npx tsx scripts/facets.selftest.tsx */
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { CommandCenterView, WorkMoney } from "../src/components/hq/CommandCenter";
import * as F from "../src/hq/facets";
import { defaultState, HqStateSchema } from "../src/hq/schemas";

const TODAY = "2026-11-11"; // miércoles
const meal = (kcal: number, i: number) => ({ id: `m${i}`, name: "comida", kcal, proteinG: 30, source: "manual" as const, at: "x" });
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const ctx0: F.FacetContext = { journal: { todayCount: 0, streak: 0 }, approvedClipsThisWeek: 0 };

// Estados viejos (sin facetas) siguen cargando.
const old = HqStateSchema.parse({ v: 1, days: { [TODAY]: { date: TODAY, trainingDone: true } } });
assert.equal(old.work.focusGoal, 2);
assert.equal(old.money.monthlyGoal, null);
assert.equal(old.days[TODAY]!.focusBlocks, 0);

// Día vacío.
const e = F.facets(defaultState(), TODAY, 10, ctx0);
assert.deepEqual(e.map((f) => f.id), ["cuerpo", "mente", "trabajo", "marca", "dinero"]);
assert.equal(e.find((f) => f.id === "dinero")!.status, "sin-datos");
assert.equal(e.find((f) => f.id === "mente")!.next!.action.kind, "feeling");
assert.equal(e.find((f) => f.id === "trabajo")!.next!.action.kind, "focus");
assert.equal(F.lifeScore(e), 0);

// Día redondo.
const full = HqStateSchema.parse({
  days: {
    "2026-11-09": { date: "2026-11-09", clipDone: true },
    [TODAY]: { date: TODAY, trainingDone: true, feeling: "con_todo", focusBlocks: 2, clipDone: true, meals: [meal(600, 1), meal(700, 2)] },
  },
  money: { monthlyGoal: 30000, entries: [{ id: "a", date: "2026-11-03", amount: 18000, note: "Aura Homes" }, { id: "b", date: "2026-10-30", amount: 99999 }] },
  work: { projects: [{ id: "p", name: "Landing", client: "Aura Homes", due: "2026-11-12" }] },
});
const f = F.facets(full, TODAY, 21, { journal: { todayCount: 1, streak: 4 }, approvedClipsThisWeek: 1 });
const by = (id: F.FacetId) => f.find((x) => x.id === id)!;
assert.equal(by("cuerpo").status, "cumplido");
assert.equal(by("mente").pct, 100);
assert.equal(by("trabajo").status, "cumplido");
assert.match(by("trabajo").sub, /Landing: entrega en 1 d/);
assert.equal(by("marca").metric, "3/3 clips esta semana", "2 días marcados + 1 aprobado");
assert.equal(F.monthIncome(full, TODAY), 18000, "solo cuenta noviembre");
assert.equal(by("dinero").metric, "$18,000 de $30,000");
assert.equal(by("dinero").status, "ok", "día 11 de 30: 60% supera el ritmo (37%)");
assert.equal(F.lifeScore(f), 92, "4 facetas al 100 + dinero al 60");

// Lo más urgente primero.
const late = F.facets(defaultState(), TODAY, 21, ctx0);
assert.equal(F.mostUrgent(late)!.id, "cuerpo");

// Pantalla.
const html = text(renderToString(<CommandCenterView hq={full} today={TODAY} hour={21} dateLabel="Miércoles, 11 de noviembre" ctx={{ journal: { todayCount: 1, streak: 4 }, approvedClipsThisWeek: 1 }} />));
assert.match(html, /Centro de mando/);
assert.match(html, /Lo que sigue · Dinero/);
assert.match(html, /Dinero va arriba del ritmo/);
for (const name of ["Cuerpo", "Mente", "Trabajo", "Marca", "Dinero"]) assert.match(html, new RegExp(name));
const emptyHtml = text(renderToString(<CommandCenterView hq={defaultState()} today={TODAY} hour={21} dateLabel="x" ctx={ctx0} />));
assert.match(emptyHtml, /Lo que sigue · Cuerpo/);
assert.match(emptyHtml, /Te falta entrenar/);
assert.match(emptyHtml, /Con todo/);
assert.match(emptyHtml, /\+1 bloque/);
assert.ok(!/NaN|undefined/.test(emptyHtml + html));
const wm = text(renderToString(<WorkMoney hq={full} today={TODAY} />));
assert.match(wm, /Landing/);
assert.match(wm, /Aura Homes/);
assert.match(wm, /\$18,000 de \$30,000 este mes/);

console.log("facetas OK ✔");

// Historial para gráficas.
const hist = F.history(full, TODAY, 14, new Set([TODAY]));
assert.equal(hist.length, 14);
assert.equal(hist.at(-1)!.date, TODAY);
assert.equal(hist.at(-1)!.scores.cuerpo, 100);
assert.equal(hist.at(-1)!.scores.mente, 100, "con todo + captura");
assert.equal(hist.find((d) => d.date === "2026-11-09")!.scores.marca, 100);
assert.equal(hist[0]!.scores.cuerpo, 0, "antes no había misiones");
const pace = F.monthPace(full, TODAY);
assert.equal(pace.length, 11);
assert.equal(pace.at(-1)!.acc, 18000);
assert.equal(Math.round(pace.at(-1)!.pace), 11000);
const visual = text(renderToString(<CommandCenterView hq={full} today={TODAY} hour={21} dateLabel="x" ctx={{ journal: { todayCount: 1, streak: 4 }, approvedClipsThisWeek: 1 }} captures={[]} />));
assert.match(visual, /Tus últimas 2 semanas/);
assert.match(visual, /Constancia por faceta/);
assert.match(visual, /Tu historia en fotos/);
assert.match(visual, /Acumulado \$18,000/);
console.log("visuales OK ✔");
