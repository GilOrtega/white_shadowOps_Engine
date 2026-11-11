import { useSyncExternalStore } from "react";
import { HASH } from "./next-link";
const PATH = Object.fromEntries(Object.entries(HASH).map(([path, hash]) => [hash, path]));
const sub = (cb: () => void) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); };
export function usePathname(): string {
  return useSyncExternalStore(sub, () => PATH[window.location.hash] ?? "/", () => "/");
}
