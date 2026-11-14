"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDietFit } from "@/components/providers/dietfit-provider";

// Someone who has already onboarded on this browser skips the public home
// page and lands back in the app. /onboarding forwards them on to the
// paywall or /workout as appropriate.
export function ReturningUserRedirect() {
  const router = useRouter();
  const { state, hydrated } = useDietFit();

  useEffect(() => {
    if (hydrated && state.onboardingCompleted) {
      router.replace("/onboarding");
    }
  }, [hydrated, router, state.onboardingCompleted]);

  return null;
}
