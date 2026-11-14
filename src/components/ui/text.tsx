import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Screen-level heading. Replaces `fm-title`. Size defaults to `display-l`
 * (the onboarding hero); pass `size="display-xl"` for the celebration
 * ceremonies, `size="title-l"` for section headers.
 */
type TitleSize =
  | "display-xl"
  | "display-l"
  | "display-m"
  | "title-l"
  | "title-m"
  | "title-s";

const TITLE_CLASS: Record<TitleSize, string> = {
  "display-xl": "text-display-xl",
  "display-l": "text-display-l",
  "display-m": "text-display-m",
  "title-l": "text-title-l",
  "title-m": "text-title-m",
  "title-s": "text-title-s",
};

type TitleProps = React.HTMLAttributes<HTMLHeadingElement> & {
  size?: TitleSize;
  as?: "h1" | "h2" | "h3" | "h4";
};

export function Title({
  size = "display-l",
  as = "h1",
  className,
  ...props
}: TitleProps) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        "font-display font-bold",
        TITLE_CLASS[size],
        className,
      )}
      {...props}
    />
  );
}

/** Supporting text under a Title. Replaces `fm-sub`. */
export function Sub({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-body-m text-ink-500", className)}
      {...props}
    />
  );
}

/** All-caps section label (e.g. "TRY ASKING"). Replaces `fm-overline`. */
export function Overline({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-overline font-semibold uppercase text-ink-500",
        className,
      )}
      {...props}
    />
  );
}
