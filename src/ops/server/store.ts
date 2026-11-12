import { AnthropicStructuredLlm } from "@/engine";
import { localClock } from "@/hq/push";
import { kvGet, kvOnce, kvSet } from "@/hq/server/kv";
import { getSub, delSub } from "@/hq/server/push-store";
import { getCloud } from "@/hq/server/state-store";
import { pushConfigured, sendPush } from "@/hq/server/webpush";
import { advance, AGENTS, AUTO_GOALS, isStale, newMission, type MissionStore } from "../engine";
import { AutoSettingsSchema, MissionSchema, type AutoSettings, type Mission } from "../schemas";

/** Misiones en Upstash (30 días). Un índice con las últimas 30. */
const K = { m: (id: string) => `wso:ops:m:${id}`, index: "wso:ops:index", auto: "wso:ops:auto" };
const TTL = 60 * 60 * 24 * 30;

export const kvMissions: MissionStore = {
  async get(id) {
    const p = MissionSchema.safeParse(await kvGet(K.m(id)));
    return p.success ? p.data : null;
  },
  async put(m) {
    await kvSet(K.m(m.id), m, TTL);
  },
};

export async function listIds(): Promise<string[]> {
  return (await kvGet<string[]>(K.index)) ?? [];
}

export async function createMission(goal: string, origin: Mission["origin"] = "manual"): Promise<Mission> {
  const id = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const m = newMission(id, goal, Date.now(), origin);
  await kvMissions.put(m);
  await kvSet(K.index, [id, ...(await listIds())].slice(0, 30));
  return m;
}

export async function listMissions(): Promise<Mission[]> {
  const ids = await listIds();
  const all = await Promise.all(ids.map((id) => kvMissions.get(id)));
  return all.filter((m): m is Mission => m !== null);
}

export const getAuto = async (): Promise<AutoSettings> => AutoSettingsSchema.parse((await kvGet(K.auto)) ?? {});
export const setAuto = (a: AutoSettings) => kvSet(K.auto, a);

const tz = () => process.env.WSO_TZ || "America/Hermosillo";

/** Corre la misión en este proceso hasta ~4.5 min y avisa por push al terminar. */
export async function drive(id: string, budgetMs = 270_000): Promise<Mission | null> {
  const cloud = await getCloud().catch(() => null);
  const today = localClock(new Date(), tz()).date;
  const m = await advance(kvMissions, new AnthropicStructuredLlm(), id, cloud?.state ?? null, today, Date.now() + budgetMs);
  if (m && (m.status === "done" || m.status === "failed") && pushConfigured() && (await kvOnce(`wso:ops:notified:${m.id}`, TTL))) {
    const sub = await getSub().catch(() => null);
    if (sub) {
      const who = [...new Set(m.tasks.filter((t) => t.status === "done").map((t) => AGENTS[t.agent].name))].join(", ");
      const r = await sendPush(sub, {
        title: m.status === "done" ? "✅ Misión lista" : "⚠️ La misión se detuvo",
        body: m.status === "done" ? `${m.goal.slice(0, 80)} — entregaron: ${who || "Sombra"}.` : (m.error ?? "Revisa Operaciones."),
        url: "/ops", tag: `wso-ops-${m.id}`,
      });
      if (!r.ok && r.gone) await delSub();
    }
  }
  return m;
}

/** Desde el cron: retoma misiones atoradas y lanza las automáticas (lunes / diario, ~7 am). */
export async function opsTick(now = new Date()): Promise<string[]> {
  const done: string[] = [];
  for (const m of await listMissions()) {
    if (isStale(m, now.getTime()) && m.attempts < 3) {
      await kvMissions.put({ ...m, attempts: m.attempts + 1, updatedAt: now.getTime() });
      await drive(m.id, 200_000);
      done.push(`resume:${m.id}`);
    }
  }
  const { date, hour } = localClock(now, tz());
  if (hour >= 6 && hour < 11) {
    const auto = await getAuto();
    const monday = new Date(`${date}T12:00:00`).getDay() === 1;
    for (const [origin, on] of [["auto-semana", auto.weekly && monday], ["auto-dia", auto.daily]] as const) {
      if (on && (await kvOnce(`wso:ops:auto:${origin}:${date}`, 60 * 60 * 30))) {
        const m = await createMission(AUTO_GOALS[origin], origin);
        await drive(m.id, 200_000);
        done.push(`${origin}:${m.id}`);
      }
    }
  }
  return done;
}
