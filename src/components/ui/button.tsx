import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "brand" | "secondary" | "ghost" | "light";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full-width block. Defaults to false for md/sm, true for lg. */
  block?: boolean;
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[13px]",
  md: "h-11 px-4 text-sm",
  lg: "h-14 px-5 text-[17px]",
};

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white shadow-accent hover:brightness-[0.95] active:scale-[0.975]",
  brand:
    "bg-brand text-foreground shadow-brand hover:bg-forest active:scale-[0.975]",
  secondary:
    "border border-border bg-white text-foreground hover:border-primary/25 hover:bg-white active:scale-[0.985]",
  ghost:
    "bg-transparent text-muted hover:bg-foreground/5 active:scale-[0.985]",
  light:
    "bg-background text-foreground hover:bg-background/80 active:scale-[0.985]",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  block,
  type = "button",
  ...props
}: ButtonProps) {
  const isBlock = block ?? size === "lg";
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition duration-200 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none",
        SIZE_STYLES[size],
        VARIANT_STYLES[variant],
        isBlock && "w-full",
        className,
      )}
      type={type}
      {...props}
    />
  );
}
