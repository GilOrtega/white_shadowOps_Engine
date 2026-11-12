import type { Metadata } from "next";
import { Ops } from "@/components/ops/Ops";
import { Shell } from "@/components/hq/Shell";

export const metadata: Metadata = { title: "Operaciones — WhiteShadow" };

export default function OpsPage() {
  return <Shell><Ops /></Shell>;
}
