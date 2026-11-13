import type { Metadata } from "next";
import { ContentWeekPage } from "@/components/content/ContentWeek";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Semana de contenido — WhiteShadow" };

export default function ContenidoPage() {
  return <Shell><ContentWeekPage /></Shell>;
}
