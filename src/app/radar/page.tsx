import type { Metadata } from "next";
import { RadarPage } from "@/components/content/Radar";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Radar del nicho — WhiteShadow" };

export default function Page() {
  return <Shell><RadarPage /></Shell>;
}
