/**
 * Errores tipados del Engine. Cada error lleva un `code` estable para logs,
 * métricas y para decidir reintentos en el orquestador.
 */
export type EngineErrorCode =
  | "CONFIG_INVALID"
  | "INPUT_INVALID"
  | "LLM_REQUEST_FAILED"
  | "LLM_OUTPUT_INVALID"
  | "LLM_OUTPUT_TRUNCATED"
  | "LLM_REFUSED"
  | "ABORTED"
  | "INTERNAL_CONTRACT"
  | "MEDIA_BINARY_MISSING"
  | "MEDIA_PROBE_FAILED"
  | "MEDIA_RENDER_FAILED"
  | "MEDIA_TIMEOUT"
  | "TRANSCRIPTION_FAILED";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    code: EngineErrorCode,
    message: string,
    opts: { retryable?: boolean; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "EngineError";
    this.code = code;
    this.retryable = opts.retryable ?? false;
    this.details = opts.details;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, retryable: this.retryable };
  }
}

export const isEngineError = (e: unknown): e is EngineError => e instanceof EngineError;
