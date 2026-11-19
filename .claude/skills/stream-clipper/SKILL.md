---
name: stream-clipper
description: Corta los streams de Gil (grabaciones de OBS de GTA/PS5) en Shorts verticales con su cámara arriba, subtítulos y gancho, los revisa (PASS/WARN/FAIL) y los sube a WhiteShadow para aprobarlos. Úsala cuando pida "corta mi stream", "saca clips del stream de anoche" o similar.
---

# Clipper de streams de WhiteShadow

Solo para **los streams de Gil** (NotGilOrtega). No cortes streams de otros creadores: es contenido ajeno y puede tumbar su canal por copyright.

## 1. Encontrar el stream
- Si Gil no da la ruta, busca la grabación más reciente en su carpeta de OBS (por defecto `~/Videos`, archivos `.mkv` o `.mp4` con fecha en el nombre) y **confírmale cuál** antes de seguir.
- Si es `.mkv`, sirve tal cual (ffmpeg lo lee).

## 2. Revisar que todo esté instalado (solo la primera vez)
- `ffmpeg -version` → si falta, en Windows: `winget install Gyan.FFmpeg`.
- `python --version` (3.10+) y `pip install -r engine/requirements.txt`.
- `.env.local` debe tener `ANTHROPIC_API_KEY`, `WSO_API_SECRET` y (si usa cámara) `CLIPPER_CAM=x,y,ancho,alto`.
  Nunca imprimas ni pegues el valor de esas claves; solo verifica que existan.
- Si no hay `CLIPPER_CAM`, pregúntale dónde está su cámara en la escena de OBS. Para medirla: saca un frame
  (`ffmpeg -ss 60 -i <stream> -frames:v 1 frame.jpg`), míralo y calcula el rectángulo en fracciones 0..1.

## 3. Cortar
```
npm run clipper -- "<ruta del stream>" --max 8
```
- `--contexto "GTA RP con amigos, persecución"` si Gil cuenta de qué fue el stream.
- `--sin-subir` para probar sin mandar nada a la app.
- Es reanudable: si se corta, vuelve a correr el mismo comando.

## 4. Revisar
Muéstrale la tabla final (PASS / WARN / FAIL con notas). Los FAIL no se suben. Si muchos salen FAIL por "pantalla negra",
es el HDCP de la PS5 (Ajustes → Sistema → HDMI → desactivar HDCP).

## 5. Entregar
Los PASS y WARN quedan en **WhiteShadow → Contenido → Motor** como "Listo para revisar". Gil los aprueba desde el celular
con "Me gusta: publicar".
