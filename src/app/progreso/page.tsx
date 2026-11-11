import type { Metadata } from "next";
import { Progress } from "@/components/hq/Progress";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Progreso — WhiteShadow" };

export default function ProgresoPage() {
  return <Shell><Progress /></Shell>;
}
