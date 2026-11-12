import { z } from "zod";
import { HqStateSchema } from "@/hq/schemas";
import { checkKey, deny } from "@/hq/server/auth";
import { kvConfigured } from "@/hq/server/kv";
import { getCloud, putCloud } from "@/hq/server/state-store";

/** Sincronización: GET trae la copia de la nube; PUT la reemplaza si tu cambio es más nuevo. */
const notReady = () => Response.json({ code: "NOT_CONFIGURED", message: "Falta conectar Upstash Redis en Vercel (Storage)." }, { status: 503 });

export async function GET(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return notReady();
  return Response.json({ cloud: await getCloud() });
}

const Body = z.object({ state: HqStateSchema, updatedAt: z.number().int().positive(), device: z.string().max(40) });

export async function PUT(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return notReady();
  const raw = await req.text();
  if (raw.length > 900_000) return Response.json({ code: "TOO_LARGE", message: "Tus datos pesan demasiado para sincronizar (¿una foto de perfil muy grande?)." }, { status: 413 });
  const body = Body.safeParse(JSON.parse(raw || "null"));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Datos inválidos." }, { status: 400 });
  const cloud = await getCloud();
  if (cloud && cloud.updatedAt > body.data.updatedAt) return Response.json({ code: "STALE", cloud }, { status: 409 });
  await putCloud(body.data);
  return Response.json({ ok: true, updatedAt: body.data.updatedAt });
}
