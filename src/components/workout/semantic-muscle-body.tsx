import { bodyFront } from "@/lib/body-front";
import { cn } from "@/lib/utils";

type SemanticMuscleBodyProps = {
  highlightSlugs: string[];
  className?: string;
};

const neutralSlugs = new Set(["head", "hair", "hands", "feet", "ankles", "knees"]);

function getPaths(part: (typeof bodyFront)[number]) {
  return [
    ...(part.path.common ?? []),
    ...(part.path.left ?? []),
    ...(part.path.right ?? []),
  ];
}

export function SemanticMuscleBody({
  highlightSlugs,
  className,
}: SemanticMuscleBodyProps) {
  const highlighted = new Set(highlightSlugs);

  return (
    <svg
      viewBox="150 70 470 1285"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label="Human muscle map with workout focus highlighted"
    >
      <defs>
        <linearGradient id="semantic-muscle-highlight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#37c9a6" />
          <stop offset="100%" stopColor="#15857A" />
        </linearGradient>
        <filter id="semantic-muscle-glow" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g>
        {bodyFront.map((part) => {
          const isHighlighted = highlighted.has(part.slug);
          const isNeutral = neutralSlugs.has(part.slug);
          const fill = isHighlighted
            ? "url(#semantic-muscle-highlight)"
            : isNeutral
              ? "rgba(75, 80, 73, 0.26)"
              : "rgba(75, 80, 73, 0.38)";

          return (
            <g
              key={part.slug}
              filter={isHighlighted ? "url(#semantic-muscle-glow)" : undefined}
            >
              {getPaths(part).map((path, index) => (
                <path
                  key={`${part.slug}-${index}`}
                  d={path}
                  fill={fill}
                  stroke={isHighlighted ? "rgba(14, 75, 69, 0.4)" : "rgba(255,255,255,0.28)"}
                  strokeWidth={isHighlighted ? 1.5 : 0.75}
                  opacity={isHighlighted ? 0.96 : 1}
                />
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
