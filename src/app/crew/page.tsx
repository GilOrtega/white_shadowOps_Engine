import type { Metadata } from "next";
import { Studio } from "@/components/crew/Studio";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Estudio de shorts — WhiteShadow" };

export default function CrewPage() {
  return <Shell><Studio /></Shell>;
}
