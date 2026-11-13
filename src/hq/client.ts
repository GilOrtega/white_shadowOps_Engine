"use client";

/** Llamada a un agente con IA. Nunca lanza: regresa el dato o un mensaje para mostrar. */
export async function callAgent<T>(path: "/api/agents/nutri" | "/api/agents/coach" | "/api/agents/mascota" | "/api/agents/copy" | "/api/agents/ideas" | "/api/agents/content", body: unknown, accessKey: string): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  if (process.env.WSO_STATIC) {
    return { ok: false, code: "NOT_CONFIGURED", message: "En esta versión de arranque los agentes con IA están apagados; se activan cuando la app quede en Vercel." };
  }
  try {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-wso-key": accessKey }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (res.ok && json) return { ok: true, data: json as T };
    const code = json?.code ?? "AGENT_FAILED";
    const message =
      code === "NOT_CONFIGURED" ? "Este agente todavía no está activado en el servidor. Mira Ajustes para activarlo."
      : code === "UNAUTHORIZED" ? "La clave de acceso no coincide. Revísala en Ajustes."
      : json?.message ?? "El agente no respondió. Intenta de nuevo.";
    return { ok: false, code, message };
  } catch {
    return { ok: false, code: "NETWORK", message: "Sin conexión con el servidor. Intenta de nuevo." };
  }
}

/** Reduce la foto a máx. 1024 px y JPEG para que suba rápido y cueste poco. */
export async function fileToJpegBase64(file: File, maxSide = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82).split(",")[1] ?? "";
}

/** Foto de perfil: recorte cuadrado al centro, 192 px, JPEG ligero (cabe en el guardado local). */
export async function fileToAvatar(file: File, side = 192): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const crop = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, (bitmap.width - crop) / 2, (bitmap.height - crop) / 2, crop, crop, 0, 0, side, side);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}
