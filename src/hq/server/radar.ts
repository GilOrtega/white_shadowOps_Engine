import type Anthropic from "@anthropic-ai/sdk";
import type { StructuredLlm } from "@/engine";
import { collectSources, DRAFT_SYSTEM, draftPrompt, finalizeIdeas, RadarDraftSchema, type RadarIdea, type RadarSource, RESEARCH_SYSTEM, researchPrompt } from "../radar";

type MessagesClient = { messages: { create: (body: Anthropic.Messages.MessageCreateParamsNonStreaming, opts?: { signal?: AbortSignal }) => Promise<Anthropic.Messages.Message> } };

/** Paso 1: el modelo busca en la web (herramienta del servidor) y resume hallazgos. */
export async function research(client: MessagesClient, args: { niche: string; pillars: string[]; today: string; model: string; signal?: AbortSignal }) {
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: researchPrompt(args.niche, args.pillars, args.today) }];
  const found: { title: string; url: string; page_age?: string | null }[] = [];
  const trace: string[] = [];
  let text = "";
  for (let turn = 0; turn < 3; turn++) {
    const res = await client.messages.create({
      model: args.model,
      max_tokens: 3000,
      system: RESEARCH_SYSTEM,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      messages,
    }, { signal: args.signal });
    trace.push(`${res.stop_reason}:${res.content.map((b) => b.type).join(",")}`);
    for (const block of res.content) {
      if (block.type === "web_search_tool_result" && !Array.isArray(block.content)) {
        trace.push(`search_error:${(block.content as { error_code?: string }).error_code ?? "?"}`);
      }
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) found.push({ title: r.title, url: r.url, page_age: r.page_age });
      } else if (block.type === "text") {
        text += block.text;
        for (const c of block.citations ?? []) if (c.type === "web_search_result_location") found.push({ title: c.title ?? c.url, url: c.url });
      }
    }
    // Búsquedas largas pueden pausar el turno: se continúa con lo que ya hay.
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content as Anthropic.Messages.ContentBlockParam[] });
  }
  return { findings: text.trim(), sources: collectSources(found), trace };
}

export async function runRadar(deps: { client: MessagesClient; llm: StructuredLlm }, args: { niche: string; pillars: string[]; today: string; model: string; signal?: AbortSignal }): Promise<{ ideas: RadarIdea[]; sources: RadarSource[] }> {
  const { findings, sources, trace } = await research(deps.client, args);
  if (!sources.length || !findings) {
    console.warn("[radar] sin fuentes", JSON.stringify({ trace, findingsChars: findings.length }));
    return { ideas: [], sources };
  }
  const draft = await deps.llm.generate({
    system: DRAFT_SYSTEM,
    prompt: draftPrompt(findings, sources, args.niche, args.pillars),
    schema: RadarDraftSchema,
    schemaName: "report_radar_ideas",
    schemaDescription: "Las mejores ideas del nicho, con fuentes por número.",
    model: args.model,
    maxTokens: 3000,
    signal: args.signal,
  });
  return { ideas: finalizeIdeas(draft.data, sources), sources };
}
