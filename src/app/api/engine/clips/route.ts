import { z } from "zod";
import { checkKey, deny } from "@/hq/server/auth";
import { saveJob, shortsReady } from "@/hq/server/shorts";
import { newJobId, StreamClipSchema, type ShortJob } from "@/engine/shorts/plan";

/** El Clipper de tu PC registra aquí cada clip de stream ya editado (llega "Listo para revisar"). */
export async function POST(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const parsed = StreamClipSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: "INPUT_INVALID", message: z.prettifyError(parsed.error) }, { status: 400 });
  if (!shortsReady().kv) return Response.json({ code: "NOT_CONFIGURED", message: "Falta la base de datos (Upstash)." }, { status: 503 });
  const now = new Date().toISOString();
  const job: ShortJob = { id: newJobId(), createdAt: now, updatedAt: now, status: "ready", source: "stream", clips: [], badge: "", stage: "", error: "", ...parsed.data };
  await saveJob(job);
  return Response.json({ job });
}
