import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { usePathname } from "next/navigation";
import { Studio } from "@/components/crew/Studio";
import { Dashboard } from "@/components/hq/Dashboard";
import { JournalPage } from "@/components/hq/Journal";
import { PlanInterview } from "@/components/hq/PlanInterview";
import { Progress } from "@/components/hq/Progress";
import { Settings } from "@/components/hq/Settings";
import { Shell } from "@/components/hq/Shell";

function Shorts() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">Shorts</h1>
      <p className="max-w-2xl text-sm text-fg/85">El motor que convierte un video largo en shorts ya funciona, pero corre en tu compu, no desde esta pantalla. Falta conectarlo a la app y construir la publicación en TikTok, Reels y Shorts.</p>
    </div>
  );
}

function App() {
  const path = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);
  return (
    <Shell>
      {path === "/plan" ? <PlanInterview /> : path === "/progreso" ? <Progress /> : path === "/ajustes" ? <Settings /> : path === "/crew" ? <Studio /> : path === "/bitacora" ? <JournalPage /> : path === "/engine" ? <Shorts /> : <Dashboard />}
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
