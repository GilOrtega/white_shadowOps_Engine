import type { Layout, NormRect, OutputSpec, VideoProbe } from "./schemas";

/** Redondea al par más cercano (libx264 + yuv420p exigen dimensiones pares). */
/** Tamaño par (mínimo 2). */
export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** Posición par (puede ser 0). */
const evenPos = (n: number) => Math.max(0, Math.round(n / 2) * 2);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rectángulo de recorte con la relación de aspecto de salida (p. ej. 9:16). */
export function centerCropRect(
  src: { width: number; height: number },
  out: { width: number; height: number },
  focusX = 0.5,
): PixelRect {
  const target = out.width / out.height;
  const srcAspect = src.width / src.height;
  if (srcAspect > target) {
    const h = src.height - (src.height % 2);
    const w = Math.min(even(h * target), src.width - (src.width % 2));
    const x = evenPos(clamp(focusX * src.width - w / 2, 0, src.width - w));
    return { x: Math.min(x, src.width - w), y: 0, w, h };
  }
  const w = src.width - (src.width % 2);
  const h = Math.min(even(w / target), src.height - (src.height % 2));
  const y = evenPos((src.height - h) / 2);
  return { x: 0, y: Math.min(y, src.height - h), w, h };
}

export function normToPixels(r: NormRect, src: { width: number; height: number }): PixelRect {
  const w = Math.min(even(r.w * src.width), src.width - (src.width % 2));
  const h = Math.min(even(r.h * src.height), src.height - (src.height % 2));
  const x = clamp(evenPos(r.x * src.width), 0, src.width - w);
  const y = clamp(evenPos(r.y * src.height), 0, src.height - h);
  return { x, y, w, h };
}

const crop = (r: PixelRect) => `crop=${r.w}:${r.h}:${r.x}:${r.y}`;
/** Llena WxH sin deformar (escala de más y recorta el sobrante centrado). */
const fill = (w: number, h: number) =>
  `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h}`;

/**
 * Construye el filtergraph de video. Entrada: [0:v]. Salida: [v].
 * `assFile` es un nombre de archivo SIN ruta: FFmpeg se ejecuta con cwd en la carpeta
 * del job, así evitamos el infierno de escapar rutas de Windows dentro del filtergraph.
 */
export function buildVideoFilter(args: {
  layout: Layout;
  probe: Pick<VideoProbe, "width" | "height">;
  output: Pick<OutputSpec, "width" | "height" | "fps">;
  assFile?: string;
}): string {
  const { layout, probe, output } = args;
  const W = output.width;
  const H = output.height;
  const tail = [
    "setsar=1",
    output.fps ? `fps=${output.fps}` : null,
    args.assFile ? `ass=${args.assFile}` : null,
    "format=yuv420p",
  ]
    .filter(Boolean)
    .join(",");

  switch (layout.mode) {
    case "center-crop": {
      const r = centerCropRect(probe, output, layout.focusX);
      return `[0:v]${crop(r)},scale=${W}:${H}:flags=lanczos,${tail}[v]`;
    }
    case "blur-fill": {
      return [
        `[0:v]split=2[bgsrc][fgsrc]`,
        // Desenfoque a 1/4 de resolución y re-escala: mismo look, ~3x más rápido.
        `[bgsrc]${fill(even(W / 4), even(H / 4))},boxblur=luma_radius=${Math.max(1, Math.round(layout.blurRadius / 4))}:luma_power=2,scale=${W}:${H}:flags=bilinear,eq=brightness=-0.08[bg]`,
        `[fgsrc]scale=${W}:${H}:force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos[fg]`,
        `[bg][fg]overlay=(W-w)/2:(H-h)/2,${tail}[v]`,
      ].join(";");
    }
    case "split": {
      const topH = even(H * layout.topRatio);
      const botH = H - topH;
      const top = normToPixels(layout.top, probe);
      const bottom = normToPixels(layout.bottom, probe);
      return [
        `[0:v]split=2[tsrc][bsrc]`,
        `[tsrc]${crop(top)},${fill(W, topH)}[top]`,
        `[bsrc]${crop(bottom)},${fill(W, botH)}[bot]`,
        `[top][bot]vstack=inputs=2,${tail}[v]`,
      ].join(";");
    }
  }
}
