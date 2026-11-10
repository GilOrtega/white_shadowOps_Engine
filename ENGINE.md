# whiteShadowOps_Engine

Motor multiagente Stream-to-Shorts (antes "Autonomous Crew").

## Estructura (encima de `create-next-app --src-dir`)

```
src/
├─ app/
│  └─ api/engine/
│     ├─ mine/route.ts          ← FASE 1: POST transcript → clips
│     ├─ jobs/route.ts          ← F3: crear job / consultar estado
│     └─ webhooks/[provider]/   ← F3: callbacks de Deepgram, render y publish
├─ engine/                        ← motor multiagente (sin dependencias de React)
│  ├─ index.ts                  ← API pública: import { ... } from "@/engine"
│  ├─ core/
│  │  ├─ errors.ts              ← EngineError con code + retryable
│  │  ├─ env.ts                 ← env validado con Zod (lazy)
│  │  └─ llm.ts                 ← StructuredLlm + Claude (tool use + reintento Zod)
│  ├─ schemas/                  ← contratos Zod entre etapas
│  │  ├─ transcript.ts          ← formato normalizado (segmentos + palabras)
│  │  ├─ clip.ts                ← salida del Miner y Clip final
│  │  ├─ copy.ts                ← F4: títulos, hooks, hashtags
│  │  └─ job.ts                 ← F3: estado del pipeline
│  ├─ ingest/                   ← F2: deepgram.ts, whisper.ts → Transcript
│  ├─ agents/
│  │  ├─ miner/                 ← FASE 1 ✔ (index, prompt, windowing)
│  │  ├─ copywriter/            ← F4
│  │  └─ publisher/             ← F5: tiktok.ts, youtube.ts
│  ├─ media/                    ← F3: plan de recorte 9:16 + subtítulos ASS (lógica pura)
│  └─ pipeline/                 ← F3: orquestador + pasos idempotentes
scripts/
├─ mine.ts                      ← CLI local (sin límites de Vercel)
├─ miner.selftest.ts            ← prueba offline del Miner (LLM falso)
└─ llm.selftest.ts              ← prueba del reintento por validación
worker/                         ← F3: FFmpeg en Cloud Run (Docker), NO en Vercel
```

## Decisiones clave

1. **El modelo elige IDs de segmento, no segundos.** Los timestamps salen de la
   transcripción: cero tiempos alucinados y cortes siempre en frontera de frase.
   El código ajusta a 30–60 s agregando o quitando segmentos completos.
2. **Salida estructurada en 2 capas:** tool use forzado (JSON Schema generado
   desde Zod) + `safeParse` con Zod. Si falla, el error vuelve al modelo como
   `tool_result` con `is_error` y lo corrige (máx. 2 reintentos).
3. **Ventanas con traslape** (15 min / 90 s) + dedupe temporal (NMS) → sirve igual
   para un video de 10 min que para un stream de 4 h, con concurrencia limitada.
4. **Tolerante a fallos parciales:** si falla una ventana, sigue con las demás
   y la reporta en `windowErrors`. `failFast: true` lo cambia.
5. **Anti prompt injection:** la transcripción se trata como datos (el chat del
   stream puede traer “ignora lo anterior…”).
6. **Agnóstico de proveedor:** los agentes dependen de `StructuredLlm`; se puede
   cambiar de modelo o inyectar un fake en tests.

## Límites de Vercel (afectan F2–F5)

- Las funciones tienen tiempo máximo y límite de body (~4.5 MB): **el video nunca
  pasa por una función.** Se sube directo del cliente a GCS o Vercel Blob con URL
  firmada.
- **FFmpeg va en un worker** (Cloud Run, con tu GCP) disparado por cola
  (Cloud Tasks, QStash o Inngest). Vercel solo orquesta y guarda estado.
- La transcripción va por API asíncrona con webhook (Deepgram `callback`), no
  esperando en la request.
- Cada paso del pipeline es idempotente (por `jobId` + `step`) para reintentar sin duplicar.

## Uso

```bash
npm i zod@^4 @anthropic-ai/sdk
npm i -D tsx

npx tsx scripts/miner.selftest.ts     # sin API key
npx tsx --env-file=.env.local scripts/mine.ts ./mi-stream.transcript.json --context "stream de Next.js + mindset"
```

```bash
curl -X POST https://TU-APP.vercel.app/api/engine/mine \
  -H "Authorization: Bearer $WSO_API_SECRET" -H "Content-Type: application/json" \
  -d @payload.json   # { "transcript": {...}, "options": { "maxClipsTotal": 8 } }
```

Requisitos: TypeScript estricto, `paths: { "@/*": ["./src/*"] }` (ya viene en create-next-app), Zod 4.


## Fases (orden vigente)

| Fase | Módulo | Estado |
|---|---|---|
| 1 | Content Miner (`src/engine/agents/miner`) | ✅ listo y probado |
| 2 | Media Processor FFmpeg (`src/engine/media`) | ✅ listo y probado con renders reales |
| 3 | Ingesta Deepgram + pipeline local reanudable (`src/engine/ingest`, `src/engine/pipeline`) | ✅ listo y probado |
| 3b | Orquestación en la nube: webhook Deepgram, cola y worker HTTP en Cloud Run | siguiente |
| 4 | Copywriter & SEO | pendiente |
| 5 | Publisher (TikTok, Reels, Shorts) | pendiente |

## Fase 2 — Media Processor

```
src/engine/media/
├─ schemas.ts    ← RenderJob, Layout, SubtitleStyle, OutputSpec, VideoProbe (Zod)
├─ layout.ts     ← filtergraphs 9:16: center-crop | blur-fill | split (facecam + pantalla)
├─ subtitles.ts  ← .ass con "palabra activa" desde timestamps por palabra
├─ ffmpeg.ts     ← spawn sin shell, progreso, timeout, abort, ffprobe validado
└─ render.ts     ← renderClip(): idempotente, escribe .part.mp4 y renombra al final
```

- Salida: 1080x1920, H.264 (veryfast, CRF 20), AAC 48 kHz, audio normalizado a -14 LUFS, `+faststart`.
- Subtítulos arriba de la zona de botones de TikTok/Reels (`marginV` 560) con salto de línea automático.
- **No corre en Vercel**: va en `worker/Dockerfile` (Cloud Run). La app de Next solo orquesta.

```bash
npm run test:media                       # requiere ffmpeg instalado
npx tsx scripts/render.ts stream.mp4 transcript.json stream.clips.json --layout split --out ./renders
```


## Fase 3 — Ingesta + pipeline completo

```bash
# .env.local
DEEPGRAM_API_KEY=...
ANTHROPIC_API_KEY=...

npx tsx --env-file=.env.local scripts/pipeline.ts "C:\videos\stream.mp4" --layout split --context "stream de Next.js" --max 5
```

Pasos y caché en `out/<jobId>/`: `audio.mp3` → `transcript.json` → `clips.json` → `renders/*.mp4` → `result.json`.
Si se corta, vuelves a correr el mismo comando: retoma sin volver a pagar Deepgram ni Claude.

- Audio mono 16 kHz MP3 (~30 MB/h) para subir rápido.
- `nova-3`, español por defecto (`--lang multi` si mezclas mucho inglés), keyterms técnicos.
- Segmentos de ≤12 s cortados por pausa/fin de frase; timestamps por palabra para subtítulos.
- `npx tsx scripts/pipeline.selftest.ts` prueba todo offline (Deepgram y Claude simulados, FFmpeg real).
