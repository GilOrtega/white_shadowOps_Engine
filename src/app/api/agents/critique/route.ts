import { z } from "zod";
import { AnthropicStructuredLlm, isEngineError } from "@/engine";
import { CRITIQUE_SYSTEM, CritiqueSchema, critiquePrompt } from "@/hq/critique";
import { checkAgentAccess, deny } from "@/hq/server/auth";

/** Coach de contenido: consejos para mejorar un guion, carrusel o historia antes de grabar. */
export const maxDuration = 60;

const Piece = z.object({
  title: z.string().max(90),
  hook: z.string().max(200),
  beats: z.array(z.string().max(240)).max(10),
  cta: z.string().max(140),
});
const Body = z.object({
  item: Piece.extend({ format: z.enum(["guion", "carrusel", "historia"]), pillar: z.string().max(60) }),
  compare: Piece.nullable().optional(),
});

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Borrador inválido." }, { status: 400 });
  try {
    const res = await new AnthropicStructuredLlm().generate({
      system: CRITIQUE_SYSTEM,
      prompt: critiquePrompt(body.data.item, body.data.compare ?? null),
      schema: CritiqueSchema,
      schemaName: "report_script_critique",
      schemaDescription: "Crítica editorial del borrador.",
      model: process.env.WSO_CONTENT_MODEL || process.env.WSO_COACH_MODEL || "claude-haiku-5-5",
      maxTokens: 2000,
      signal: req.signal,
    });
    return Response.json(res.data);
  } catch (err) {
    console.error("[agents/critique]", isEngineError(err) ? `${err.code} ${err.message}` : err);
    return Response.json({ code: "AGENT_FAILED", message: "El coach de contenido no respondió. Intenta de nuevo." }, { status: 502 });
  }
}
