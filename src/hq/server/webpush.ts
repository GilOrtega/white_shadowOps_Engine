import webpush, { type PushSubscription } from "web-push";

/** Envío Web Push con llaves VAPID (se generan una vez: npm run push:keys). */
export const pushConfigured = () =>
  Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

export type SendResult = { ok: true } | { ok: false; gone: boolean; status: number };

export async function sendPush(sub: PushSubscription, payload: { title: string; body: string; url?: string; tag?: string }): Promise<SendResult> {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:avisos@whiteshadow.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 3, urgency: "high" });
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 0;
    // 404/410 = el navegador ya no tiene esa suscripción (la borraste o reinstalaste la app).
    return { ok: false, gone: status === 404 || status === 410, status };
  }
}
