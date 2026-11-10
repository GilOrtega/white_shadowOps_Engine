# Worker de render (Fase 2) para Cloud Run / cualquier contenedor.
# Vercel NO corre FFmpeg: este contenedor recibe jobs (Fase 3: Cloud Tasks / Pub/Sub) y renderiza.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core fontconfig ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm i --no-save tsx

COPY tsconfig.json ./
COPY src/engine ./src/engine
COPY scripts ./scripts

ENV NODE_ENV=production
# Fase 3 agrega worker/server.ts (HTTP para Cloud Tasks). Por ahora: CLI.
ENTRYPOINT ["npx", "tsx", "scripts/render.ts"]
