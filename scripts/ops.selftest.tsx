/** Operaciones: misiones de agentes en el servidor.  npx tsx scripts/ops.selftest.tsx */
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import type { StructuredLlm } from "../src/engine/core/llm";
import { Markdown, OpsView } from "../src/components/ops/Ops";
import * as E from "../src/ops/engine";
import { MissionSchema, type Mission } from "../src/ops/schemas";
import { defaultState, HqStateSchema } from "../src/hq/schemas";
import { GET as listRoute, POST as createRoute } from "../src/app/api/ops/missions/route";
import { GET as syncGet } from "../src/app/api/sync/route";

const TODAY = "2026-11-12";
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

/** LLM falso: responde según el esquema pedido y registra lo que recibió. */
function fakeLlm(opts: { failAgent?: string; failPlan?: boolean } = {}) {
  const calls: { schema: string; system: string; prompt: string }[] = [];
  const llm: StructuredLlm = {
    async generate(req) {
      calls.push({ schema: req.schemaName, system: req.system, prompt: req.prompt });
      const usage = { inputTokens: 100, outputTokens: 50 };
      if (req.schemaName === "report_plan") {
        if (opts.failPlan) throw new Error("plan roto");
        return { data: req.schema.parse({ tasks: [
          { agent: "estratega", title: "Plan de entrega por día", brief: "Divide la landing en tareas diarias hasta el viernes." },
          { agent: "coach", title: "Entrenos que no choquen", brief: "Acomoda el gym alrededor de los bloques de trabajo." },
        ] }), attempts: 1, usage, model: "fake" };
      }
      if (req.schemaName === "report_deliverable") {
        if (opts.failAgent && req.system.includes(opts.failAgent)) throw new Error("agente caído");
        return { data: req.schema.parse({ deliverable: `## Entregable\n- **Lunes**: maquetar hero\n- Martes: formulario\nTexto suficiente para pasar el mínimo.` }), attempts: 1, usage, model: "fake" };
      }
      return { data: req.schema.parse({ summary: "## Plan de ataque\n1. Hoy: hero de la landing\n2. Gym 7 pm", actions: [{ kind: "focusGoal", value: 3 }, { kind: "habit", title: "Revisar pendientes", emoji: "📋", time: "08:00", anchor: "el café" }] }), attempts: 1, usage, model: "fake" };
    },
  };
  return { llm, calls };
}

function memStore() {
  const db = new Map<string, Mission>();
  const writes: Mission[] = [];
  return {
    db, writes,
    store: { get: async (id: string) => db.get(id) ?? null, put: async (m: Mission) => { const v = MissionSchema.parse(m); db.set(m.id, v); writes.push(v); } } satisfies E.MissionStore,
  };
}

async function main() {
  const hq = HqStateSchema.parse({ work: { projects: [{ id: "p", name: "Landing Aura", client: "Aura Homes", due: "2026-11-14" }] } });

  // Contexto: datos reales, sin clave de acceso ni fotos.
  const ctx = E.contextText({ ...hq, accessKey: "secreta", profile: { ...hq.profile, photo: "data:image/png;base64,AAAA" } }, TODAY);
  assert.match(ctx, /Landing Aura \(Aura Homes\) entrega 2026-11-14/);
  assert.match(ctx, /Reto físico: día 21/);
  assert.doesNotMatch(ctx, /secreta|base64/);

  // Misión completa: planear → 2 agentes → resumen. Se guarda después de cada paso.
  const { llm, calls } = fakeLlm();
  const { store, db, writes } = memStore();
  await store.put(E.newMission("m1", "Plan para entregar la Landing de Aura el viernes", 1000));
  let t = 1000;
  const done = await E.advance(store, llm, "m1", hq, TODAY, Number.MAX_SAFE_INTEGER, () => (t += 10));
  assert.equal(done!.status, "done");
  assert.deepEqual(done!.tasks.map((x) => [x.agent, x.status]), [["estratega", "done"], ["coach", "done"]]);
  assert.match(done!.tasks[0]!.output, /maquetar hero/);
  assert.equal(done!.tasks[0]!.tokens, 150);
  assert.match(done!.summary, /Plan de ataque/);
  assert.equal(done!.actions.length, 2);
  assert.equal(E.progressOf(done!), 100);
  assert.deepEqual(calls.map((c) => c.schema), ["report_plan", "report_deliverable", "report_deliverable", "report_summary"]);
  assert.match(calls[2]!.prompt, /trabajo_del_equipo/, "el segundo agente ve lo del primero");
  assert.match(calls[1]!.prompt, /Landing Aura/, "los agentes reciben tu contexto");
  assert.ok(writes.length >= 6, "guarda en cada paso (si se corta, se retoma)");
  assert.ok(writes.some((w) => w.tasks.some((x) => x.status === "running")), "se ve quién está trabajando");

  // Un agente falla: los demás siguen y la misión cierra con lo que hay.
  const f = fakeLlm({ failAgent: "Coach" });
  const s2 = memStore();
  await s2.store.put(E.newMission("m2", "Plan de la semana completo", 1000));
  const m2 = await E.advance(s2.store, f.llm, "m2", hq, TODAY, Number.MAX_SAFE_INTEGER);
  assert.equal(m2!.status, "done");
  assert.equal(m2!.tasks.find((x) => x.agent === "coach")!.status, "failed");
  assert.match(m2!.tasks.find((x) => x.agent === "coach")!.error!, /agente caído/);

  // Si Sombra no puede planear, la misión se detiene con el motivo.
  const p = fakeLlm({ failPlan: true });
  const s3 = memStore();
  await s3.store.put(E.newMission("m3", "Algo que no se puede planear", 1000));
  const m3 = await E.advance(s3.store, p.llm, "m3", null, TODAY, Number.MAX_SAFE_INTEGER);
  assert.equal(m3!.status, "failed");
  assert.match(m3!.error!, /plan roto/);

  // Se corta a medio camino (deadline) y otra corrida la termina: nada se repite.
  const r = fakeLlm();
  const s4 = memStore();
  await s4.store.put(E.newMission("m4", "Misión larga para cortar a medias", 1000));
  let clock = 0;
  const half = await E.advance(s4.store, r.llm, "m4", hq, TODAY, 3, () => clock++);
  assert.notEqual(half!.status, "done", "se detuvo por tiempo");
  const resumed = await E.advance(s4.store, r.llm, "m4", hq, TODAY, Number.MAX_SAFE_INTEGER);
  assert.equal(resumed!.status, "done");
  assert.equal(r.calls.filter((c) => c.schema === "report_plan").length, 1, "no vuelve a planear");
  assert.equal(E.isStale({ ...half!, status: "running", updatedAt: 0 }, 4 * 60_000), true);
  assert.equal(E.isStale({ ...resumed!, updatedAt: 0 }, 10 * 60_000), false, "una terminada nunca está atorada");
  void db;

  // Rutas: sin Upstash lo dicen claro; sin clave no corren.
  process.env.WSO_API_SECRET = "clave";
  process.env.ANTHROPIC_API_KEY = "x";
  delete process.env.KV_REST_API_URL;
  assert.equal((await listRoute(new Request("http://x"))).status, 401);
  assert.equal((await listRoute(new Request("http://x", { headers: { "x-wso-key": "clave" } }))).status, 503);
  assert.equal((await createRoute(new Request("http://x", { method: "POST", headers: { "x-wso-key": "clave" }, body: JSON.stringify({ goal: "plan de la semana" }) }))).status, 503);
  assert.equal((await syncGet(new Request("http://x", { headers: { "x-wso-key": "clave" } }))).status, 503);

  // Pantalla.
  const empty = text(renderToString(<OpsView hq={{ ...defaultState(), accessKey: "" }} today={TODAY} initial={[]} />));
  assert.match(empty, /Operaciones/);
  assert.match(empty, /Plan de la semana/);
  assert.match(empty, /Pon tu clave de acceso/);
  const full = text(renderToString(<OpsView hq={{ ...hq, accessKey: "clave" }} today={TODAY} initial={[done!, { ...writes.find((w) => w.tasks.some((x) => x.status === "running"))!, id: "m9" }]} />));
  assert.match(full, /Plan de ataque de Sombra/);
  assert.match(full, /Estratega/);
  assert.match(full, /Entregado/);
  assert.match(full, /Meta de enfoque: 3 bloques al día/);
  assert.match(full, /Revisar pendientes a las 08:00/);
  assert.ok(!/NaN|undefined/.test(full));
  const md = renderToString(<Markdown text={"## Título\n- **uno**\n- dos\n1. a\n<script>alert(1)</script>"} />);
  assert.match(md, /<strong[^>]*>uno<\/strong>/);
  assert.match(md, /<ol/);
  assert.doesNotMatch(md, /<script>/, "no inyecta HTML");

  console.log("operaciones OK ✔");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
