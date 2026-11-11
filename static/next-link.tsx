import type { ComponentProps } from "react";
export const HASH: Record<string, string> = { "/": "#hoy", "/plan": "#plan", "/progreso": "#progreso", "/bitacora": "#bitacora", "/crew": "#estudio", "/engine": "#motor", "/ajustes": "#ajustes" };
export default function Link({ href, ...rest }: Omit<ComponentProps<"a">, "href"> & { href: string }) {
  return <a href={href.startsWith("#") ? href : HASH[href] ?? "#hoy"} {...rest} />;
}
