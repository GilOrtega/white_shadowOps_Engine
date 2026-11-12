import { checkKey, deny } from "@/hq/server/auth";
import { kvConfigured } from "@/hq/server/kv";
import { getAuto, setAuto } from "@/ops/server/store";
import { AutoSettingsSchema } from "@/ops/schemas";

/** Misiones automáticas: plan de la semana (lunes) y briefing diario (~7 am). */
export async function GET(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return Response.json({ code: "NOT_CONFIGURED" }, { status: 503 });
  return Response.json({ auto: await getAuto() });
}

export async function PUT(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return Response.json({ code: "NOT_CONFIGURED" }, { status: 503 });
  const body = AutoSettingsSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID" }, { status: 400 });
  await setAuto(body.data);
  return Response.json({ auto: body.data });
}
