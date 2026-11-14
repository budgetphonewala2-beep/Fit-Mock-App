import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selectable tile used for onboarding choices. Replaces `fm-goalfig`,
 * `fm-placecard`, `fm-tile` — one primitive with variants:
 *
 * - `list` — full-width horizontal row (default). Original `.fm-tile` shape.
 * - `figure` — square with image on top, label below. Original `.fm-goalfig`.
 * - `photo` — image on top with a wider content area. Original `.fm-placecard`.
 */
type OptionCardLayout = "list" | "figure" | "photo";

type OptionCardProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  layout?: OptionCardLayout;
  selected?: boolean;
  label: string;
  description?: string;
  media?: React.ReactNode;
};

export function OptionCard({
  layout = "list",
  selected,
  label,
  description,
  media,
  className,
  ...props
}: OptionCardProps) {
  const base =
    "group relative w-full overflow-hidden rounded-card border-2 bg-white text-left text-ink-900 transition-[border-color,box-shadow,transform] duration-200 active:scale-[0.985]";
  const state = selected
    ? "border-mint-500 shadow-brand"
    : "border-sand-200 hover:border-sand-300";

  if (layout === "figure") {
    return (
      <button
        type="button"
        className={cn(base, state, "flex flex-col", className)}
        aria-pressed={selected}
        {...props}
      >
        {media ? (
          <div className="w-full bg-sand-100 aspect-square overflow-hidden">
            {media}
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 px-3 py-3">
          <span
            className={cn(
              "text-body-s font-bold",
              selected ? "text-teal-700" : "text-ink-500",
            )}
          >
            {label}
          </span>
          {selected ? (
            <span className="grid h-5 w-5 place-items-center rounded-pill bg-mint-500 text-ink-900 shadow-tile">
              <Check className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      </button>
    );
  }

  if (layout === "photo") {
    return (
      <button
        type="button"
        className={cn(base, state, "flex flex-col", className)}
        aria-pressed={selected}
        {...props}
      >
        {media ? (
          <div className="relative w-full aspect-[4/3] bg-sand-100 overflow-hidden">
            {media}
          </div>
        ) : null}
        <div className="px-3.5 py-3">
          <span
            className={cn(
              "block text-body-m font-bold",
              selected && "text-teal-700",
            )}
          >
            {label}
          </span>
          {description ? (
            <span className="mt-1 block text-body-s text-ink-500">
              {description}
            </span>
          ) : null}
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        base,
        state,
        "flex items-center gap-3 px-4 py-3.5",
        className,
      )}
      aria-pressed={selected}
      {...props}
    >
      {media ? <span className="flex-none">{media}</span> : null}
      <span className="flex-1">
        <span
          className={cn(
            "block text-body-m font-bold",
            selected && "text-teal-700",
          )}
        >
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block text-body-s text-ink-500">
            {description}
          </span>
        ) : null}
      </span>
      {selected ? (
        <span className="grid h-6 w-6 flex-none place-items-center rounded-pill bg-mint-500 text-ink-900 shadow-tile">
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}
