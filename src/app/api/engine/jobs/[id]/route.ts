import { del } from "@vercel/blob";
import { z } from "zod";
import { checkKey, deny } from "@/hq/server/auth";
import { dispatchRender, getJob, saveJob } from "@/hq/server/shorts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const job = await getJob((await ctx.params).id);
  return job ? Response.json({ job }) : Response.json({ code: "NOT_FOUND", message: "No existe ese Short." }, { status: 404 });
}

const PatchSchema = z.discriminatedUnion("action", [
  // Del editor (GitHub Actions)
  z.object({ action: z.literal("stage"), stage: z.string().max(60) }),
  z.object({ action: z.literal("done"), result: z.object({ url: z.string().url().max(600), pathname: z.string().max(300), durationSec: z.number().min(0).max(600) }), transcript: z.string().max(4000).default("") }),
  z.object({ action: z.literal("fail"), error: z.string().max(300) }),
  // De la app
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("discard") }),
  z.object({ action: z.literal("retry") }),
]);

/** Borra archivos de Blob sin tronar si ya no existen o si Blob no está conectado. */
async function remove(urls: string[]) {
  if (!urls.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    await del(urls);
  } catch (err) {
    console.error("[engine/jobs] del", err instanceof Error ? err.message.slice(0, 120) : "");
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const job = await getJob((await ctx.params).id);
  if (!job) return Response.json({ code: "NOT_FOUND", message: "No existe ese Short." }, { status: 404 });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INPUT_INVALID", message: z.prettifyError(parsed.error) }, { status: 400 });
  const b = parsed.data;
  let next = job;
  switch (b.action) {
    case "stage":
      next = { ...job, status: "rendering", stage: b.stage };
      break;
    case "done":
      // El original ya no hace falta: se borra para no llenar el espacio gratis (1 GB).
      await remove(job.clips.map((c) => c.url));
      next = { ...job, status: "ready", stage: "", result: b.result, transcript: b.transcript, error: "" };
      break;
    case "fail":
      next = { ...job, status: "error", stage: "", error: b.error };
      break;
    case "approve":
      if (job.status !== "ready") return Response.json({ code: "STATE", message: "Ese Short todavía no está listo." }, { status: 409 });
      next = { ...job, status: "approved" };
      break;
    case "discard":
      await remove([...job.clips.map((c) => c.url), ...(job.result ? [job.result.url] : [])]);
      next = { ...job, status: "discarded" };
      break;
    case "retry": {
      if (job.status !== "error" || job.result) return Response.json({ code: "STATE", message: "Solo se reintenta un Short que falló." }, { status: 409 });
      const problem = await dispatchRender(job.id);
      next = problem ? { ...job, error: problem } : { ...job, status: "queued", stage: "Esperando al editor", error: "" };
      break;
    }
  }
  await saveJob(next);
  return Response.json({ job: next });
}
