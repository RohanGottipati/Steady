/** True when the page URL asks for diagnostics, or the public env switch is on. */
export function isDebugEnabled(
  search: string,
  debugDefault: string | undefined = process.env.NEXT_PUBLIC_DEBUG_DEFAULT,
): boolean {
  return new URLSearchParams(search).get("debug") === "1" || debugDefault === "true";
}
