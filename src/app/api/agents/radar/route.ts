import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { AnthropicStructuredLlm, isEngineError } from "@/engine";
import { checkAgentAccess, deny } from "@/hq/server/auth";
import { runRadar } from "@/hq/server/radar";

/** Radar del nicho: busca en la web y devuelve ideas con fuente. Tarda ~30–60 s. */
export const maxDuration = 120;

const Body = z.object({
  niche: z.string().trim().min(3).max(140),
  pillars: z.array(z.string().max(60)).max(6).default([]),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Escribe tu nicho (mínimo 3 letras)." }, { status: 400 });
  const model = process.env.WSO_RADAR_MODEL || process.env.WSO_CONTENT_MODEL || "claude-haiku-5-5";
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 100_000 });
    const out = await runRadar({ client, llm: new AnthropicStructuredLlm({ client, defaultModel: model }) }, { ...body.data, model, signal: req.signal });
    if (!out.ideas.length) return Response.json({ code: "NO_RESULTS", message: "El radar no encontró fuentes útiles. Prueba con un nicho más específico." }, { status: 422 });
    return Response.json(out);
  } catch (err) {
    console.error("[agents/radar]", isEngineError(err) ? `${err.code} ${err.message}` : err);
    return Response.json({ code: "AGENT_FAILED", message: "El radar no respondió. Intenta de nuevo en un rato." }, { status: 502 });
  }
}
