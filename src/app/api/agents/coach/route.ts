import { AnthropicStructuredLlm, isEngineError } from "@/engine";
import { coachAdvice, CoachRequestSchema } from "@/hq/agents/coach";
import { checkAgentAccess, deny } from "@/hq/server/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);

  const body = CoachRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Datos inválidos." }, { status: 400 });

  try {
    return Response.json(await coachAdvice(new AnthropicStructuredLlm(), body.data, req.signal));
  } catch (err) {
    console.error("[agents/coach]", isEngineError(err) ? `${err.code} ${err.message}` : err);
    return Response.json({ code: "AGENT_FAILED", message: "El Coach no respondió. Intenta de nuevo." }, { status: 502 });
  }
}
