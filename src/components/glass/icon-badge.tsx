import * as React from "react";
import { cn } from "@/lib/utils";

type IconBadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** "dark" for badges sitting on glass-dark / glass-tint surfaces. */
  tone?: "light" | "dark";
};

/**
 * The round hairline-outlined icon that heads every glass card. Size the icon
 * inside it (h-4 w-4 by default reads right at this 32px badge).
 */
export function IconBadge({ tone = "light", className, ...props }: IconBadgeProps) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
        tone === "dark" ? "border-white/35" : "border-foreground/20",
        className,
      )}
      {...props}
    />
  );
}
