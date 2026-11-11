import { localClock, pushDecision } from "@/hq/push";
import { kvOnce } from "@/hq/server/kv";
import { delSub, getState, getSub, KEYS, pushReady } from "@/hq/server/push-store";
import { sendPush } from "@/hq/server/webpush";

/**
 * Vercel Cron (vercel.json): ~14:00, ~20:00 y ~21:00 hora de Sonora.
 * Si el día va en peligro, manda UN aviso por nivel. Si ya cumpliste, no hace nada.
 */

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  const ready = pushReady();
  if (!ready.ok) return Response.json(ready, { status: 503 });

  const [sub, snap] = await Promise.all([getSub(), getState()]);
  if (!sub) return Response.json({ sent: false, reason: "sin suscripción" });

  const tz = snap?.tz ?? process.env.WSO_TZ ?? "America/Hermosillo";
  const { date, hour } = localClock(new Date(), tz);
  const msg = pushDecision(snap, date, hour);
  if (!msg) return Response.json({ sent: false, reason: "el día va bien", date, hour });
  if (!(await kvOnce(KEYS.sent(msg.dedupeKey), 60 * 60 * 30))) return Response.json({ sent: false, reason: "ya avisado", date, hour });

  const res = await sendPush(sub, { title: msg.title, body: msg.body, url: "/", tag: `wso-rapo-${date}` });
  if (!res.ok && res.gone) await delSub();
  return Response.json({ sent: res.ok, level: msg.level, date, hour });
}
