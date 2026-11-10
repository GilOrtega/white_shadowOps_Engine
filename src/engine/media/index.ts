// Motor de medios (Fase 2). SOLO para Node con FFmpeg: worker / CLI, nunca en el bundle de Vercel.
export { renderClip, type RenderDeps } from "./render";
export { probeVideo, buildRenderArgs, defaultBinaries, type MediaBinaries } from "./ffmpeg";
export { buildVideoFilter, centerCropRect } from "./layout";
export { buildAss } from "./subtitles";
export * from "./schemas";
