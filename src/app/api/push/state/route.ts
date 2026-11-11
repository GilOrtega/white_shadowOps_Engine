import { PushSnapshotSchema } from "@/hq/push";
import { checkKey, deny } from "@/hq/server/auth";
import { pushReady, setState } from "@/hq/server/push-store";

/** El navegador manda el resumen del día cada vez que cambias algo (sin comidas ni peso). */
export async function POST(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const ready = pushReady();
  if (!ready.ok) return Response.json(ready, { status: 503 });
  const body = PushSnapshotSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Resumen inválido." }, { status: 400 });
  await setState(body.data);
  return Response.json({ ok: true });
}
