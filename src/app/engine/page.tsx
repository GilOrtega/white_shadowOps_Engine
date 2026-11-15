import type { Metadata } from "next";
import { ShortsPage } from "@/components/engine/ShortsStudio";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Motor de Shorts — WhiteShadow" };

export default function EnginePage() {
  return (
    <Shell>
      <ShortsPage />
    </Shell>
  );
}
