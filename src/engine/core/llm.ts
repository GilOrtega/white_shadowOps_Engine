import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { EngineError } from "./errors";
import { getEngineEnv } from "./env";

/**
 * Contrato agnóstico de proveedor para "salida estructurada".
 * Los agentes dependen de esta interfaz, no del SDK: así se puede
 * cambiar de modelo/proveedor o inyectar un fake en tests.
 */
export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  prompt: string;
  /** Imágenes que acompañan al prompt (base64, sin el prefijo data:). */
  images?: { mediaType: "image/jpeg" | "image/png" | "image/webp"; data: string }[];
  schema: S;
  /** Nombre de la "herramienta" de salida; snake_case. */
  schemaName: string;
  schemaDescription: string;
  model?: string;
  maxTokens?: number;
  /** Esfuerzo de razonamiento del modelo (output_config.effort). */
  effort?: "low" | "medium" | "high";
  /** Reintentos cuando el JSON no pasa Zod (además de los reintentos HTTP del SDK). */
  maxValidationRetries?: number;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  data: T;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface StructuredLlm {
  generate<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>>;
}

/** Convierte un schema Zod a JSON Schema aceptado como `input_schema`. */
export function toToolInputSchema(schema: z.ZodType): Anthropic.Messages.Tool.InputSchema {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  delete json.$schema;
  if (json.type !== "object") {
    throw new EngineError("CONFIG_INVALID", "El schema de salida debe ser un objeto en la raíz");
  }
  return json as Anthropic.Messages.Tool.InputSchema;
}

/**
 * Implementación con Claude usando tool use forzado (`tool_choice`):
 * el modelo está obligado a responder con un objeto que cumple el
 * JSON Schema; aun así validamos con Zod (refinements, rangos, etc.) y,
 * si falla, le regresamos el error como `tool_result` para que corrija.
 */
/**
 * Llaves de Anthropic que no están dentro de un workspace necesitan decir cuál usar.
 * Pon ANTHROPIC_WORKSPACE_ID (wrkspc_…) en Vercel, o usa una llave creada dentro de un workspace.
 */
export function workspaceHeaders(): Record<string, string> | undefined {
  const id = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  return id ? { "anthropic-workspace-id": id } : undefined;
}

export class AnthropicStructuredLlm implements StructuredLlm {
  private readonly client: Anthropic;
  private readonly defaultModel: string;

  constructor(opts: { apiKey?: string; defaultModel?: string; client?: Anthropic } = {}) {
    const env = opts.client && opts.defaultModel ? undefined : getEngineEnv();
    this.client =
      opts.client ??
      new Anthropic({
        apiKey: opts.apiKey ?? env?.ANTHROPIC_API_KEY,
        defaultHeaders: workspaceHeaders(),
        maxRetries: 3, // 429 / 5xx / errores de red con backoff exponencial
        timeout: 120_000,
      });
    this.defaultModel = opts.defaultModel ?? env!.WSO_MINER_MODEL;
  }

  async generate<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
    const model = req.model ?? this.defaultModel;
    const maxValidationRetries = req.maxValidationRetries ?? 2;
    const tool: Anthropic.Messages.Tool = {
      name: req.schemaName,
      description: req.schemaDescription,
      input_schema: toToolInputSchema(req.schema),
    };

    const messages: Anthropic.Messages.MessageParam[] = [
      {
        role: "user",
        content: req.images?.length
          ? [
              ...req.images.map(
                (img): Anthropic.Messages.ImageBlockParam => ({
                  type: "image",
                  source: { type: "base64", media_type: img.mediaType, data: img.data },
                }),
              ),
              { type: "text", text: req.prompt },
            ]
          : req.prompt,
      },
    ];
    const usage = { inputTokens: 0, outputTokens: 0 };
    let lastIssue = "";

    for (let attempt = 1; attempt <= maxValidationRetries + 1; attempt++) {
      if (req.signal?.aborted) throw new EngineError("ABORTED", "Operación cancelada");

      let res: Anthropic.Messages.Message;
      try {
        res = await this.client.messages.create(
          {
            model,
            max_tokens: req.maxTokens ?? 4096,
            ...(req.effort ? { output_config: { effort: req.effort } } : {}),
            system: req.system,
            tools: [tool],
            tool_choice: { type: "tool", name: tool.name },
            messages,
          },
          { signal: req.signal },
        );
      } catch (cause) {
        if (cause instanceof Anthropic.APIUserAbortError) {
          throw new EngineError("ABORTED", "Operación cancelada", { cause });
        }
        const status = cause instanceof Anthropic.APIError ? cause.status : undefined;
        // El mensaje de Anthropic dice el motivo (modelo, saldo, esquema…); nunca incluye la llave.
        const detail = cause instanceof Anthropic.APIError ? String(cause.message).replace(/sk-ant-[\w-]+/g, "[llave]").slice(0, 300) : "";
        throw new EngineError("LLM_REQUEST_FAILED", `Fallo la llamada al modelo (${status ?? "red"})${detail ? `: ${detail}` : ""}`, {
          retryable: status === undefined || status === 429 || status >= 500,
          cause,
        });
      }

      usage.inputTokens += res.usage.input_tokens;
      usage.outputTokens += res.usage.output_tokens;

      if (res.stop_reason === "refusal") {
        throw new EngineError("LLM_REFUSED", "El modelo se negó a procesar el contenido");
      }
      if (res.stop_reason === "max_tokens") {
        throw new EngineError("LLM_OUTPUT_TRUNCATED", "La respuesta se cortó por max_tokens; súbelo o reduce la ventana", {
          retryable: true,
        });
      }

      const toolUse = res.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === tool.name,
      );
      if (!toolUse) {
        lastIssue = "La respuesta no incluyó la herramienta de salida";
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: `Responde únicamente llamando a la herramienta ${tool.name}.` });
        continue;
      }

      const parsed = req.schema.safeParse(toolUse.input);
      if (parsed.success) {
        return { data: parsed.data, attempts: attempt, usage, model };
      }

      lastIssue = z.prettifyError(parsed.error);
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            is_error: true,
            content: `El objeto no pasó la validación. Corrige SOLO estos problemas y vuelve a llamar a ${tool.name}:\n${lastIssue}`,
          },
        ],
      });
    }

    throw new EngineError("LLM_OUTPUT_INVALID", `Salida inválida tras ${maxValidationRetries + 1} intentos`, {
      details: lastIssue,
    });
  }
}
