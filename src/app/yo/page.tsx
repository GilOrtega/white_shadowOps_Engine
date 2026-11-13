import type { Metadata } from "next";
import { LifeView } from "@/components/hq/Dashboard";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Mi vida — WhiteShadow" };

export default function Page() {
  return <Shell><LifeView /></Shell>;
}
