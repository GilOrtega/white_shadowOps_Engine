import { after } from "next/server";
import { checkAgentAccess, checkKey, deny } from "@/hq/server/auth";
import { kvConfigured } from "@/hq/server/kv";
import { drive, kvMissions } from "@/ops/server/store";

export const maxDuration = 300;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = checkKey(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return Response.json({ code: "NOT_CONFIGURED" }, { status: 503 });
  const { id } = await ctx.params;
  const m = await kvMissions.get(id);
  return m ? Response.json({ mission: m }) : Response.json({ code: "NOT_FOUND" }, { status: 404 });
}

/** Reintentar: los pasos fallidos vuelven a la fila y los agentes siguen. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);
  if (!kvConfigured()) return Response.json({ code: "NOT_CONFIGURED" }, { status: 503 });
  const { id } = await ctx.params;
  const m = await kvMissions.get(id);
  if (!m) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const retry = {
    ...m,
    status: m.tasks.length ? ("running" as const) : ("planning" as const),
    error: null,
    attempts: 0,
    updatedAt: Date.now(),
    tasks: m.tasks.map((t) => (t.status === "failed" || t.status === "running" ? { ...t, status: "pending" as const, error: null } : t)),
    summary: m.status === "failed" ? "" : m.summary,
  };
  await kvMissions.put(retry);
  after(() => drive(id).then(() => undefined).catch((e) => console.error("[ops/drive]", e)));
  return Response.json({ mission: retry });
}
