import type { Metadata } from "next";
import { Shell } from "@/components/hq/Shell";
import { NutriPage } from "@/components/nutri/Nutri";

export const metadata: Metadata = { title: "Nutriólogo — WhiteShadow" };

export default function Page() {
  return <Shell><NutriPage /></Shell>;
}
