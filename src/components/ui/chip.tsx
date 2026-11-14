import * as React from "react";
import { cn } from "@/lib/utils";

type ChipTone = "muted" | "brand" | "accent" | "danger" | "outline";
type ChipSize = "sm" | "md";

type ChipProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
  size?: ChipSize;
};

const TONE_STYLES: Record<ChipTone, string> = {
  muted: "bg-sand-200 text-ink-700",
  brand: "bg-mint-100 text-teal-700",
  accent: "bg-orange-100 text-orange-700",
  danger: "bg-[#fce7e4] text-[#7b1d1d]",
  outline: "border border-border text-ink-700",
};

const SIZE_STYLES: Record<ChipSize, string> = {
  sm: "h-6 px-2 text-caption",
  md: "h-7 px-2.5 text-body-s",
};

export function Chip({
  className,
  tone = "muted",
  size = "sm",
  ...props
}: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill font-semibold",
        TONE_STYLES[tone],
        SIZE_STYLES[size],
        className,
      )}
      {...props}
    />
  );
}
