import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: "outline" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center border border-transparent px-2.5 py-0.5 text-xs font-medium",
        variant === "outline" && "border-border",
        className,
      )}
      {...props}
    />
  );
}
