import { z } from "zod";
import { PushSnapshotSchema, type PushSnapshot } from "@/hq/push";
import { kvConfigured, kvDel, kvGet, kvSet } from "./kv";
import { pushConfigured } from "./webpush";

/** Por ahora hay un solo dueño: una suscripción y un resumen. Con usuarios, la llave lleva su id. */
export const KEYS = { sub: "wso:push:sub", state: "wso:push:state", sent: (k: string) => `wso:push:sent:${k}` };

export const SubscriptionSchema = z.object({
  endpoint: z.string().url().max(1000),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
export type StoredSub = z.infer<typeof SubscriptionSchema>;

export function pushReady(): { ok: true } | { ok: false; code: "NOT_CONFIGURED"; message: string } {
  if (!pushConfigured()) return { ok: false, code: "NOT_CONFIGURED", message: "Faltan las llaves VAPID en el servidor (npm run push:keys)." };
  if (!kvConfigured()) return { ok: false, code: "NOT_CONFIGURED", message: "Falta conectar Upstash Redis en Vercel (Storage)." };
  return { ok: true };
}

export const getSub = () => kvGet<StoredSub>(KEYS.sub);
export const setSub = (s: StoredSub) => kvSet(KEYS.sub, s);
export const delSub = () => kvDel(KEYS.sub);
export async function getState(): Promise<PushSnapshot | null> {
  const raw = await kvGet<unknown>(KEYS.state);
  const p = PushSnapshotSchema.safeParse(raw);
  return p.success ? p.data : null;
}
export const setState = (s: PushSnapshot) => kvSet(KEYS.state, s, 60 * 60 * 24 * 3);
