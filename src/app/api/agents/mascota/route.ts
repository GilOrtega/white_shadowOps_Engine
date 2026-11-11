import { AnthropicStructuredLlm, isEngineError } from "@/engine";
import { mascotAnswer, MascotRequestSchema } from "@/hq/agents/mascota";
import { checkAgentAccess, deny } from "@/hq/server/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);

  const body = MascotRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Mensaje inválido." }, { status: 400 });

  try {
    return Response.json(await mascotAnswer(new AnthropicStructuredLlm(), body.data, req.signal));
  } catch (err) {
    console.error("[agents/mascota]", isEngineError(err) ? `${err.code} ${err.message}` : err);
    return Response.json({ code: "AGENT_FAILED", message: "No pude contestar. Intenta de nuevo." }, { status: 502 });
  }
}
