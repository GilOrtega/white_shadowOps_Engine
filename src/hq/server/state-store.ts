import { HqStateSchema, type HqState } from "@/hq/schemas";
import { kvGet, kvSet } from "./kv";

/**
 * Copia en la nube de tu centro de mando (Upstash). Gana el cambio más reciente.
 * Nunca guarda la clave de acceso: esa vive solo en tus dispositivos.
 */
export interface CloudState { state: HqState; updatedAt: number; device: string }
const KEY = "wso:state";

export async function getCloud(): Promise<CloudState | null> {
  const raw = await kvGet<{ state: unknown; updatedAt: number; device: string }>(KEY);
  if (!raw) return null;
  const p = HqStateSchema.safeParse(raw.state);
  return p.success ? { state: p.data, updatedAt: raw.updatedAt, device: raw.device } : null;
}

export async function putCloud(c: CloudState) {
  await kvSet(KEY, { ...c, state: { ...c.state, accessKey: "" } });
}
