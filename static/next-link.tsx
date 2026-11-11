import type { ComponentProps } from "react";
export const HASH: Record<string, string> = { "/": "#hoy", "/plan": "#plan", "/progreso": "#progreso", "/engine": "#shorts", "/ajustes": "#ajustes" };
export default function Link({ href, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  return <a href={HASH[href] ?? "#hoy"} {...rest} />;
}
