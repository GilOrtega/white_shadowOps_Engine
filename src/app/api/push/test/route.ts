import { checkKey, deny } from "@/hq/server/auth";
import { delSub, getSub, pushReady } from "@/hq/server/push-store";
import { sendPush } from "@/hq/server/webpush";

export async function POST(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const ready = pushReady();
  if (!ready.ok) return Response.json(ready, { status: 503 });
  const sub = await getSub();
  if (!sub) return Response.json({ code: "NO_SUBSCRIPTION", message: "Primero activa los avisos en este dispositivo." }, { status: 404 });
  const res = await sendPush(sub, { title: "💈 Prueba de Rapo a la 0", body: "Así te voy a avisar si el día va en peligro.", url: "/", tag: "wso-test" });
  if (!res.ok && res.gone) await delSub();
  return res.ok ? Response.json({ ok: true }) : Response.json({ code: "SEND_FAILED", message: res.gone ? "Este dispositivo ya no acepta avisos. Actívalos de nuevo." : "No se pudo enviar el aviso." }, { status: 502 });
}
