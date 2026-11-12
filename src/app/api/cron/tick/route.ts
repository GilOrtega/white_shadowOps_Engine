import { dueReminders, localClock, pushDecision } from "@/hq/push";
import { kvOnce } from "@/hq/server/kv";
import { delSub, getState, getSub, KEYS, pushReady } from "@/hq/server/push-store";
import { sendPush } from "@/hq/server/webpush";

/**
 * Reloj de avisos: recordatorios de hábitos a su hora, "Rapo a la 0" y la idea del día (9 am).
 * Pégale cada 15 min desde Google Cloud Scheduler (o cron-job.org) con
 *   Authorization: Bearer <CRON_SECRET>
 * Vercel Hobby solo permite crons diarios; con ellos funcionan Rapo e idea del día, no las horas exactas.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const ready = pushReady();
  if (!ready.ok) return Response.json(ready, { status: 503 });

  const [sub, snap] = await Promise.all([getSub(), getState()]);
  if (!sub) return Response.json({ sent: [], reason: "sin suscripción" });
  const tz = snap?.tz ?? process.env.WSO_TZ ?? "America/Hermosillo";
  const { date, hour, hhmm } = localClock(new Date(), tz);
  const sent: string[] = [];
  const send = async (key: string, payload: { title: string; body: string; tag: string }) => {
    if (!(await kvOnce(KEYS.sent(key), 60 * 60 * 30))) return true;
    const r = await sendPush(sub, { ...payload, url: "/" });
    if (!r.ok && r.gone) {
      await delSub();
      return false;
    }
    if (r.ok) sent.push(key);
    return true;
  };

  for (const h of dueReminders(snap, date, hhmm)) {
    if (!(await send(`${date}:habit:${h.id}`, { title: `${h.emoji} ${h.title}`, body: `Son las ${h.time}. Márcalo en WhiteShadow cuando lo hagas.`, tag: `wso-habit-${h.id}` }))) break;
  }
  const danger = pushDecision(snap, date, hour);
  if (danger) await send(danger.dedupeKey, { title: danger.title, body: danger.body, tag: `wso-rapo-${date}` });
  if (hour >= 9 && hour < 12 && snap?.idea) await send(`${date}:idea`, { title: `💡 ${snap.idea.title}`, body: snap.idea.body, tag: `wso-idea-${date}` });

  return Response.json({ date, hhmm, sent });
}
