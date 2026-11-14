import { bodyBack } from "@/lib/body-back";
import { cn } from "@/lib/utils";

type SemanticBackMuscleBodyProps = {
  highlightSlugs: string[];
  className?: string;
};

const neutralSlugs = new Set(["head", "hair", "hands", "feet", "ankles"]);

function getPaths(part: (typeof bodyBack)[number]) {
  return [
    ...(part.path.common ?? []),
    ...(part.path.left ?? []),
    ...(part.path.right ?? []),
  ];
}

export function SemanticBackMuscleBody({
  highlightSlugs,
  className,
}: SemanticBackMuscleBodyProps) {
  const highlighted = new Set(highlightSlugs);

  return (
    <svg
      viewBox="724 0 724 1448"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label="Back muscle map with workout focus highlighted"
    >
      <defs>
        <linearGradient id="semantic-back-highlight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6fe0c0" />
          <stop offset="55%" stopColor="#37c9a6" />
          <stop offset="100%" stopColor="#15857A" />
        </linearGradient>
        <filter id="semantic-back-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {bodyBack.map((part) => {
        const isHighlighted = highlighted.has(part.slug);
        const isNeutral = neutralSlugs.has(part.slug);

        return (
          <g
            key={part.slug}
            filter={isHighlighted ? "url(#semantic-back-glow)" : undefined}
          >
            {getPaths(part).map((path, index) => (
              <path
                key={`${part.slug}-${index}`}
                d={path}
                fill={
                  isHighlighted
                    ? "url(#semantic-back-highlight)"
                    : isNeutral
                      ? "rgba(75, 80, 73, 0.26)"
                      : "rgba(75, 80, 73, 0.38)"
                }
                stroke={isHighlighted ? "rgba(14, 75, 69, 0.4)" : "rgba(255,255,255,0.28)"}
                strokeWidth={isHighlighted ? 1.5 : 0.75}
                opacity={isHighlighted ? 0.95 : 1}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
