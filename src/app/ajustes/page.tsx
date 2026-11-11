import type { Metadata } from "next";
import { Settings } from "@/components/hq/Settings";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Ajustes — WhiteShadow" };

export default function AjustesPage() {
  return <Shell><Settings /></Shell>;
}
