import type { MetadataRoute } from "next";

/** Permite "Agregar a inicio" en el iPhone y Android: se abre a pantalla completa, como app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WhiteShadow — Centro de mando",
    short_name: "WhiteShadow",
    description: "Tu reto, tu plan de ataque y tus agentes.",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#090b10",
    lang: "es-MX",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
