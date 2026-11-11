import type { Metadata } from "next";
import { PlanInterview } from "@/components/hq/PlanInterview";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Plan de ataque — WhiteShadow" };

export default function PlanPage() {
  return <Shell><PlanInterview /></Shell>;
}
