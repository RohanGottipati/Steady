import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
export function SiteShell({
  children,
  dark = true,
}: {
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only z-50 bg-white p-3 text-ink focus:not-sr-only focus:fixed"
      >
        Skip to content
      </a>
      <SiteHeader tone={dark ? "dark" : "light"} />
      {children}
      <SiteFooter />
    </div>
  );
}
