import type { Metadata } from "next";
import { IdeasTeam } from "@/components/hq/Dashboard";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Ideas y equipo — WhiteShadow" };

export default function Page() {
  return <Shell><IdeasTeam /></Shell>;
}
