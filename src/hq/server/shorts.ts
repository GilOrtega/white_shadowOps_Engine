import { ShortJobSchema, type ShortJob } from "@/engine/shorts/plan";
import { kvConfigured, kvGet, kvSet } from "./kv";

/**
 * Trabajos de Shorts en Upstash y disparo del editor en GitHub Actions.
 * El editor (workflow render-short.yml) recibe solo el id; los detalles los pide a la app con la clave.
 */
const IDS = "wso:shorts:ids";
const key = (id: string) => `wso:shorts:${id}`;
const KEEP = 20;
/** Los trabajos se borran solos a los 30 días. */
const TTL = 30 * 24 * 3600;

export const REPO = process.env.ENGINE_REPO || "GilOrtega/white_shadowops_engine";
export const WORKFLOW = "render-short.yml";

export async function getJob(id: string): Promise<ShortJob | null> {
  const raw = await kvGet<unknown>(key(id));
  const p = ShortJobSchema.safeParse(raw);
  return p.success ? p.data : null;
}

export async function saveJob(job: ShortJob) {
  await kvSet(key(job.id), { ...job, updatedAt: new Date().toISOString() }, TTL);
  const ids = (await kvGet<string[]>(IDS)) ?? [];
  if (!ids.includes(job.id)) await kvSet(IDS, [job.id, ...ids].slice(0, KEEP));
}

export async function listJobs(): Promise<ShortJob[]> {
  const ids = (await kvGet<string[]>(IDS)) ?? [];
  const jobs = await Promise.all(ids.map(getJob));
  return jobs.filter((j): j is ShortJob => Boolean(j) && j!.status !== "discarded");
}

export const shortsReady = () => ({
  kv: kvConfigured(),
  blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  dispatch: Boolean(process.env.GH_DISPATCH_TOKEN),
});

/** Arranca el editor en GitHub Actions. Regresa un mensaje si no se pudo. */
export async function dispatchRender(jobId: string, f: typeof fetch = fetch): Promise<string | null> {
  const token = process.env.GH_DISPATCH_TOKEN?.trim();
  if (!token) return "Falta GH_DISPATCH_TOKEN en Vercel para arrancar el editor.";
  const res = await f(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
    cache: "no-store",
  });
  if (res.ok) return null;
  console.error("[shorts] dispatch", res.status);
  if (res.status === 401 || res.status === 403) return "GitHub rechazó GH_DISPATCH_TOKEN (revisa que tenga permiso de Actions: lectura y escritura en el repo).";
  if (res.status === 404) return "GitHub no encontró el editor (render-short.yml) o el token no ve el repo.";
  return `GitHub respondió ${res.status} al arrancar el editor.`;
}
