import { timingSafeEqual } from "node:crypto";

/**
 * Los agentes con IA gastan tu API key, así que no son públicos:
 * el navegador manda la clave de acceso (Ajustes) y aquí se compara con WSO_API_SECRET.
 */
/**
 * Al pegar la clave en Vercel o en la app es fácil que se cuele un espacio, un salto de línea
 * o comillas ("frase"). Se limpian igual en ambos lados para que eso no cuente como "incorrecta".
 */
export const normalizeKey = (raw: string | null | undefined) =>
  (raw ?? "").trim().replace(/^(["'`])([\s\S]*)\1$/, "$2").trim();

function matches(req: Request, secret: string) {
  const got = Buffer.from(normalizeKey(req.headers.get("x-wso-key")));
  const want = Buffer.from(normalizeKey(secret));
  return want.length > 0 && got.length === want.length && timingSafeEqual(got, want);
}

export type AccessResult = { ok: true } | { ok: false; status: number; code: "NOT_CONFIGURED" | "UNAUTHORIZED"; message: string };

export function checkAgentAccess(req: Request): AccessResult {
  const secret = process.env.WSO_API_SECRET;
  if (!process.env.ANTHROPIC_API_KEY || !secret) {
    return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "Faltan ANTHROPIC_API_KEY y WSO_API_SECRET en el servidor." };
  }
  if (!matches(req, secret)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Clave de acceso incorrecta." };
  }
  return { ok: true };
}

export const deny = (r: Extract<AccessResult, { ok: false }>) =>
  Response.json({ code: r.code, message: r.message }, { status: r.status });

/** Para rutas que no gastan IA (avisos push): basta la clave de acceso. */
export function checkKey(req: Request): AccessResult {
  const secret = process.env.WSO_API_SECRET;
  if (!secret) return { ok: false, status: 503, code: "NOT_CONFIGURED", message: "Falta WSO_API_SECRET en el servidor." };
  if (!matches(req, secret)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Clave de acceso incorrecta." };
  }
  return { ok: true };
}
