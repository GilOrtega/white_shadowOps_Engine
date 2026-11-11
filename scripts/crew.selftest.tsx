/** Pruebas del Stream Crew, el medidor "Rapo a la 0" y el Auto-Hook.  npx tsx scripts/crew.selftest.tsx */
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import { StudioView } from "../src/components/crew/Studio";
import * as C from "../src/crew/logic";
import { templateCopy } from "../src/crew/copywriter";
import { StreamJobSchema, type MineEvent } from "../src/crew/schemas";
import { mineClips } from "../src/engine";
import { demoLlm, demoTranscript } from "../src/engine/demo/fake";
import { buildAss } from "../src/engine/media/subtitles";
import { SubtitleStyleSchema } from "../src/engine/media/schemas";
import * as L from "../src/hq/logic";
import { defaultState, HqStateSchema } from "../src/hq/schemas";
import { POST as mineStream } from "../src/app/api/engine/mine/stream/route";

const TODAY = "2026-11-09";
const meal = (kcal: number, i: number) => ({ id: `m${i}`, name: "comida", kcal, proteinG: 30, source: "manual" as const, at: "x" });
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function main() {
  // --- Rapo a la 0 -----------------------------------------------------------------
  const empty = defaultState();
  assert.equal(L.dangerInfo(empty, TODAY, 9).level, "ok");
  assert.equal(L.dangerInfo(empty, TODAY, 15).level, "atento");
  const late = L.dangerInfo(empty, TODAY, 21);
  assert.equal(late.level, "peligro");
  assert.ok(late.pct >= 85);
  assert.equal(late.hoursLeft, 3);
  assert.match(late.detail, /entrenar y registrar comidas/);
  assert.doesNotMatch(late.detail, /cuidar calorías/, "si faltan comidas no repite calorías");

  const done = HqStateSchema.parse({ days: { [TODAY]: { date: TODAY, trainingDone: true, meals: [meal(600, 1), meal(700, 2)] } } });
  assert.equal(L.dangerInfo(done, TODAY, 23).level, "cumplido");
  const over = HqStateSchema.parse({ days: { [TODAY]: { date: TODAY, meals: [meal(1500, 1), meal(1200, 2)] } } });
  assert.equal(L.dangerInfo(over, TODAY, 10).level, "peligro");
  assert.equal(L.dangerInfo(over, TODAY, 10).pct, 100);
  const onlyTrain = HqStateSchema.parse({ days: { [TODAY]: { date: TODAY, meals: [meal(600, 1), meal(700, 2)] } } });
  assert.equal(L.dangerInfo(onlyTrain, TODAY, 17).level, "ok");
  assert.equal(L.dangerInfo(onlyTrain, TODAY, 19).level, "atento");

  // --- Agente 6: Plan de ataque ---------------------------------------------------------
  assert.equal(C.contentAngle(empty, TODAY).tone, "tecnico");
  const streakDays = Object.fromEntries(["2026-11-07", "2026-11-08", TODAY].map((d) => [d, { date: d, trainingDone: true, meals: [meal(600, 1), meal(700, 2)] }]));
  const streaking = HqStateSchema.parse({ days: streakDays });
  const a = C.contentAngle(streaking, TODAY);
  assert.equal(a.tone, "motivacional");
  assert.match(a.line, /día 18 y llevas 3 días seguidos/);
  const fell = HqStateSchema.parse({ days: { "2026-11-07": streakDays["2026-11-07"], "2026-11-08": { date: "2026-11-08" } } });
  assert.match(C.contentAngle(fell, TODAY).line, /Ayer se cayó/);
  assert.match(C.contentAngle(empty, "2026-12-18").line, /Faltan 3 días/);

  // --- briefing → opciones del Miner ------------------------------------------------------
  const opts = C.minerOptionsFor({ highlight: "lo de WordPress", tone: "viral", clipCount: 3, length: "corto" }, "ángulo X");
  assert.deepEqual([opts.maxClipsTotal, opts.minDurationSec, opts.maxDurationSec], [3, 18, 30]);
  assert.match(opts.context, /WordPress/);
  assert.match(opts.context, /ángulo X/);
  assert.ok(opts.context.length <= 500);

  // --- Miner con avance (hooks) ----------------------------------------------------------------
  const events: string[] = [];
  const res = await mineClips(demoLlm, demoTranscript(), { maxClipsTotal: 3 }, undefined, {
    onStart: (i) => events.push(`start:${i.windows}`),
    onWindow: (i) => events.push(`w:${i.done}/${i.total}`),
  });
  assert.equal(events[0], `start:${res.stats.windows}`);
  assert.equal(events.at(-1), `w:${res.stats.windows}/${res.stats.windows}`);
  assert.ok(res.clips.length > 0 && res.clips.length <= 3);
  await mineClips(demoLlm, demoTranscript(), {}, undefined, { onWindow: () => { throw new Error("hook roto"); } }); // no debe tumbar

  // --- endpoint SSE en modo demo -------------------------------------------------------------
  const sse = await mineStream(new Request("http://x/api/engine/mine/stream", { method: "POST", body: JSON.stringify({ demo: true, options: { maxClipsTotal: 2 } }) }));
  assert.equal(sse.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const parsed = (await sse.text()).split("\n\n").filter(Boolean).map((c) => JSON.parse(c.replace(/^data: /, "")) as MineEvent);
  assert.equal(parsed[0]!.type, "start");
  assert.ok(parsed.some((e) => e.type === "window"));
  const result = parsed.at(-1)!;
  assert.equal(result.type, "result");
  assert.ok(result.type === "result" && result.clips.length === 2);
  const unauth = await mineStream(new Request("http://x", { method: "POST", body: JSON.stringify({ transcript: demoTranscript() }) }));
  assert.ok([401, 503].includes(unauth.status), "sin clave no corre el Miner real");

  // --- trabajo, revisión y plan de render -------------------------------------------------------
  let job = C.newJob({
    id: "demo-1", now: "2026-11-09T10:00:00.000Z", fileName: "transcript.json", sourceId: "stream-11", durationSec: 2400, segments: 400, hasWords: true,
    brief: { highlight: "", tone: "tecnico", clipCount: 2, length: "corto" }, angle: "ángulo", demo: true,
  });
  assert.equal(job.stages.transcript.status, "done");
  assert.equal(job.stages.publisher.status, "waiting");
  job = { ...C.withStage(job, "miner", { status: "done", pct: 100 }), clips: C.toReview(result.type === "result" ? result.clips : []) };
  assert.ok(StreamJobSchema.safeParse(job).success, "el trabajo cumple el esquema");
  assert.equal(job.clips[0]!.decision, "pendiente");
  assert.equal(C.renderPlan(job).clips.length, 0, "sin aprobar no se exporta nada");

  job = { ...job, clips: job.clips.map((c, i) => (i === 0 ? { ...c, decision: "aprobado" as const, hook: "Nadie te dice esto", captionY: 0.6, copy: templateCopy({ topic: c.clip.topic, hook: c.hook }, "tecnico") } : { ...c, decision: "descartado" as const })) };
  const plan = C.renderPlan(job);
  assert.equal(plan.kind, "wso.render-plan");
  assert.equal(plan.clips.length, 1);
  const r = plan.render[plan.clips[0]!.id]!;
  assert.equal(r.hook, "Nadie te dice esto");
  assert.equal(r.marginV, C.marginVFor(0.6));
  assert.equal(C.marginVFor(0.68), 572);
  assert.match(C.copyPack(job), /Gancho: Nadie te dice esto/);
  assert.match(C.copyPack(job), /#sonora/);
  assert.equal(C.captionCovered(0.85, "tiktok"), true);
  assert.equal(C.captionCovered(0.68, "tiktok"), false);

  // --- Auto-Hook en el ASS ---------------------------------------------------------------
  const ass = buildAss({ words: [{ text: "hola", start: 10, end: 10.5 }], clipStart: 10, clipEnd: 30, style: SubtitleStyleSchema.parse({}), width: 1080, height: 1920, hook: { text: "Nadie te dice {esto}", durationSec: 2.8 } });
  assert.match(ass, /Style: Hook/);
  assert.match(ass, /Dialogue: 1,0:00:00\.00,0:00:02\.80,Hook,,0,0,0,,Nadie te dice \(esto\)/);
  assert.doesNotMatch(buildAss({ words: [], clipStart: 0, clipEnd: 5, style: SubtitleStyleSchema.parse({}), width: 1080, height: 1920 }), /,Hook,/);

  // --- pantalla del estudio --------------------------------------------------------------
  const studioEmpty = text(renderToString(<StudioView hq={defaultState()} today={TODAY} jobs={[]} />));
  assert.match(studioEmpty, /Agente 6 · Plan de ataque/);
  assert.match(studioEmpty, /Arrastra la transcripción/);
  assert.match(studioEmpty, /Probar con demo/);
  const studio = text(renderToString(<StudioView hq={defaultState()} today={TODAY} jobs={[{ ...job, status: "review" }]} />));
  assert.match(studio, /Pipeline en vivo/);
  assert.match(studio, /Copywriter/);
  assert.match(studio, /Corte de montaje/);
  assert.match(studio, /1 de 2 aprobados/);
  assert.match(studio, /npm run render:plan/);
  assert.ok(!/NaN|undefined|\[object/.test(studio), "sin NaN/undefined en pantalla");

  console.log("crew OK ✔");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
