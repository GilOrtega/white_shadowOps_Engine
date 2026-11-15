import { z } from "zod";
import { checkKey, deny } from "@/hq/server/auth";
import { dispatchRender, listJobs, saveJob, shortsReady } from "@/hq/server/shorts";
import { NewShortSchema, newJobId, type ShortJob } from "@/engine/shorts/plan";

/** Tus Shorts (los últimos 20) y qué falta configurar. */
export async function GET(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const ready = shortsReady();
  if (!ready.kv) return Response.json({ jobs: [], ready });
  return Response.json({ jobs: await listJobs(), ready });
}

/** Crea un Short con los clips ya subidos y arranca el editor. */
export async function POST(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const parsed = NewShortSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INPUT_INVALID", message: z.prettifyError(parsed.error) }, { status: 400 });
  if (!shortsReady().kv) return Response.json({ code: "NOT_CONFIGURED", message: "Falta la base de datos (Upstash)." }, { status: 503 });
  const now = new Date().toISOString();
  let job: ShortJob = { id: newJobId(), createdAt: now, updatedAt: now, status: "queued", stage: "Esperando al editor", result: null, transcript: "", error: "", ...parsed.data };
  await saveJob(job);
  const problem = await dispatchRender(job.id);
  if (problem) {
    job = { ...job, status: "error", stage: "", error: problem };
    await saveJob(job);
  }
  return Response.json({ job });
}
