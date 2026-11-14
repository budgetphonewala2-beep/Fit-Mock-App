import { NextResponse } from "next/server";
import { hasOpenAiCoachEnv } from "@/lib/env";
import {
  WORKOUT_LIBRARY,
  dedupeLibraryItems,
  generateWorkoutLibraryWithAi,
  type WorkoutLibraryItem,
} from "@/lib/workout-library";

type CachedLibrary = {
  items: WorkoutLibraryItem[];
  source: "ai-augmented" | "catalog";
  expiresAt: number;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours
let cache: CachedLibrary | null = null;
let refreshInFlight: Promise<void> | null = null;

function catalogLibrary(): CachedLibrary {
  return {
    items: dedupeLibraryItems(WORKOUT_LIBRARY),
    source: "catalog",
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

// Refresh the AI-augmented library in the background so a slow LLM call never
// blocks the response. Runs at most once at a time.
function refreshAiLibrary() {
  if (refreshInFlight || !hasOpenAiCoachEnv()) {
    return;
  }

  refreshInFlight = generateWorkoutLibraryWithAi()
    .then((aiItems) => {
      // Union with the curated catalog so the list is never thin and every
      // muscle group stays covered, then dedupe by exercise name.
      cache = {
        items: dedupeLibraryItems([...WORKOUT_LIBRARY, ...aiItems]),
        source: "ai-augmented",
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
    })
    .catch((error) => {
      console.error("Workout library AI generation failed, keeping catalog.", error);
    })
    .finally(() => {
      refreshInFlight = null;
    });
}

export async function GET() {
  const now = Date.now();

  // Always respond instantly with the curated catalog on a cold/expired cache,
  // and augment with AI-generated exercises in the background for next time.
  if (!cache) {
    cache = catalogLibrary();
    refreshAiLibrary();
  } else if (cache.expiresAt < now) {
    // Serve the stale list immediately; kick off a background refresh.
    cache = { ...cache, expiresAt: now + CACHE_TTL_MS };
    refreshAiLibrary();
  }

  return NextResponse.json({
    items: cache.items,
    source: cache.source,
    count: cache.items.length,
  });
}
