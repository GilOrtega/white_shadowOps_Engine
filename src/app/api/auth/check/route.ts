import { kvConfigured } from "@/hq/server/kv";
import { checkKey, deny } from "@/hq/server/auth";

/**
 * "Probar clave" de Ajustes: dice si la clave coincide y qué le falta al servidor.
 * Nunca devuelve la clave ni su largo.
 */
export async function GET(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  return Response.json({ ok: true, ai: Boolean(process.env.ANTHROPIC_API_KEY), sync: kvConfigured(), push: Boolean(process.env.VAPID_PRIVATE_KEY) });
}
