// Arma la versión de un solo archivo (sin servidor) de la app: static/out/index.html
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
mkdirSync(resolve(here, "out"), { recursive: true });

const js = await build({
  entryPoints: [resolve(here, "main.tsx")],
  bundle: true, minify: true, write: false, format: "iife", target: "es2020", jsx: "automatic",
  define: { "process.env.WSO_STATIC": '"1"', "process.env.NODE_ENV": '"production"' },
  alias: { "next/link": resolve(here, "next-link.tsx"), "next/navigation": resolve(here, "next-navigation.ts"), "@": resolve(root, "src") },
  logLevel: "warning",
});
execFileSync("npx", ["@tailwindcss/cli", "-i", resolve(root, "src/app/globals.css"), "-o", resolve(here, "out/app.css"), "--minify"], { cwd: root, stdio: "inherit" });
const css = readFileSync(resolve(here, "out/app.css"), "utf8");
const code = js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

writeFileSync(resolve(here, "out/index.html"), `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>WhiteShadow — Centro de mando</title>
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${code}</script>
</body>
</html>
`);
console.log("static/out/index.html", Math.round((css.length + code.length) / 1024), "KB");
