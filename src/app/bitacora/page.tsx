import type { Metadata } from "next";
import { Suspense } from "react";
import { JournalPage } from "@/components/hq/Journal";
import { Shell } from "@/components/hq/Shell";
import { Loading } from "@/components/hq/ui";

export const metadata: Metadata = { title: "Bitácora — WhiteShadow" };

export default function BitacoraPage() {
  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <JournalPage />
      </Suspense>
    </Shell>
  );
}
