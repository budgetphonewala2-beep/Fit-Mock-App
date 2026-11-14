import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <div className={cn("h-2.5 overflow-hidden rounded-full bg-primary/10", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary via-forest to-accent transition-all duration-500"
        style={{ width: `${Math.max(0, Math.min(value, 100))}%` }}
      />
    </div>
  );
}
