import type { Metadata } from "next";
import { HabitsPage } from "@/components/hq/Dashboard";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Hábitos — WhiteShadow" };

export default function Page() {
  return <Shell><HabitsPage /></Shell>;
}
