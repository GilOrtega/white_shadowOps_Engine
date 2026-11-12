import { after } from "next/server";
import { z } from "zod";
import { checkAgentAccess, checkKey, deny } from "@/hq/server/auth";
import { kvConfigured } from "@/hq/server/kv";
import { createMission, drive, listMissions } from "@/ops/server/store";

/** Misiones: GET lista, POST crea y arranca a los agentes (siguen aunque cierres la app). */
export const maxDuration = 300;
const notReady = () => Response.json({ code: "NOT_CONFIGURED", message: "Falta conectar Upstash Redis en Vercel (Storage)." }, { status: 503 });

export async function GET(req: Request) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return notReady();
  return Response.json({ missions: await listMissions() });
}

const Body = z.object({ goal: z.string().trim().min(8).max(400) });

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return notReady();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Escribe la misión (mínimo 8 letras)." }, { status: 400 });
  const m = await createMission(body.data.goal);
  after(() => drive(m.id).then(() => undefined).catch((e) => console.error("[ops/drive]", e)));
  return Response.json({ mission: m }, { status: 201 });
}
