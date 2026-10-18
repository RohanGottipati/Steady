"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SteadyMark } from "../brand/SteadyMark";
import { cn } from "@/lib/utils";
export function SiteHeader({ tone = "light" }: { tone?: "light" | "dark" }) {
  const path = usePathname();
  const dark = tone === "dark";
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur",
        dark ? "border-white/10 bg-ink/95 text-white" : "bg-background/95",
      )}
    >
      <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="Steady home"
        >
          <SteadyMark className="h-8 w-8" />
          <span className="text-lg font-semibold">Steady</span>
          <span className="hidden font-mono text-[10px] uppercase tracking-widest opacity-50 lg:inline">
            Surgical motion trainer
          </span>
        </Link>
        <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
          {[
            { href: "/library", label: "Library" },
            { href: "/progress", label: "Progress" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-2 transition-colors",
                path === item.href
                  ? "bg-scrub-100 text-ink"
                  : dark
                    ? "text-white/75 hover:bg-white/10"
                    : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/train/needle-passing"
            className={cn(
              "ml-2 inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium",
              dark ? "bg-scrub-100 text-ink" : "bg-ink text-white",
            )}
          >
            <span className="hidden sm:inline">Enter the OR</span>
            <span className="sm:hidden">Train</span>
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </nav>
      </div>
    </header>
  );
}
