import { AnthropicStructuredLlm, isEngineError } from "@/engine";
import { CopyRequestSchema, writeCopy } from "@/crew/copywriter";
import { checkAgentAccess, deny } from "@/hq/server/auth";

export const maxDuration = 120;

export async function POST(req: Request) {
  const access = checkAgentAccess(req);
  if (!access.ok) return deny(access);

  const body = CopyRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return Response.json({ code: "INPUT_INVALID", message: "Clips inválidos." }, { status: 400 });

  try {
    return Response.json(await writeCopy(new AnthropicStructuredLlm(), body.data, req.signal));
  } catch (err) {
    console.error("[agents/copy]", isEngineError(err) ? `${err.code} ${err.message}` : err);
    return Response.json({ code: "AGENT_FAILED", message: "El Copywriter no respondió. Intenta de nuevo." }, { status: 502 });
  }
}
