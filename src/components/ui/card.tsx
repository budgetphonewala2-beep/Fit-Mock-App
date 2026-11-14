import * as React from "react";
import { cn } from "@/lib/utils";

type CardVariant = "glass" | "flat" | "muted";
type CardRadius = "chip" | "tile" | "card" | "hero" | "panel";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  radius?: CardRadius;
};

const VARIANT_STYLES: Record<CardVariant, string> = {
  /** Legacy frosted surface; kept for pages that still lean on it. */
  glass: "glass-panel",
  /** The Korean-reskin default: white surface, faint border, tile shadow. */
  flat: "border border-border bg-white shadow-card",
  /** Accent-soft ground for empty states and inline callouts. */
  muted: "bg-accent-soft/60",
};

const RADIUS_STYLES: Record<CardRadius, string> = {
  chip: "rounded-chip",
  tile: "rounded-tile",
  card: "rounded-card",
  hero: "rounded-hero",
  panel: "rounded-panel",
};

export function Card({
  className,
  variant = "glass",
  radius,
  ...props
}: CardProps) {
  const radiusClass = radius
    ? RADIUS_STYLES[radius]
    : variant === "glass"
      ? "rounded-hero"
      : "rounded-card";
  return (
    <div
      className={cn(VARIANT_STYLES[variant], radiusClass, "p-5", className)}
      {...props}
    />
  );
}
