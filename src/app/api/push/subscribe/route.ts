import { z } from "zod";
import { PushSnapshotSchema } from "@/hq/push";
import { checkKey, deny } from "@/hq/server/auth";
import { delSub, pushReady, setState, setSub, SubscriptionSchema } from "@/hq/server/push-store";

const Body = z.object({ subscription: SubscriptionSchema, snapshot: PushSnapshotSchema.optional() });

export async function POST(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const ready = pushReady();
  if (!ready.ok) return Response.json(ready, { status: 503 });
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Suscripción inválida." }, { status: 400 });
  await setSub(body.data.subscription);
  if (body.data.snapshot) await setState(body.data.snapshot);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  const ready = pushReady();
  if (!ready.ok) return Response.json(ready, { status: 503 });
  await delSub();
  return Response.json({ ok: true });
}
