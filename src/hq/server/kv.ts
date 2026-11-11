/**
 * Almacén mínimo para los avisos push (tu suscripción y el resumen del día).
 * Upstash Redis por REST, sin SDK. En Vercel: Storage → Marketplace → Upstash Redis
 * crea KV_REST_API_URL y KV_REST_API_TOKEN solos.
 */
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

export const kvConfigured = () => Boolean(url() && token());

async function cmd(args: (string | number)[]): Promise<unknown> {
  const res = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: string };
  if (json.error) throw new Error(`KV ${json.error}`);
  return json.result ?? null;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  const raw = await cmd(["GET", key]);
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown, ttlSec?: number) {
  await cmd(ttlSec ? ["SET", key, JSON.stringify(value), "EX", ttlSec] : ["SET", key, JSON.stringify(value)]);
}

/** SET NX: true solo la primera vez (para no repetir el mismo aviso). */
export async function kvOnce(key: string, ttlSec: number): Promise<boolean> {
  return (await cmd(["SET", key, "1", "NX", "EX", ttlSec])) === "OK";
}

export async function kvDel(key: string) {
  await cmd(["DEL", key]);
}
