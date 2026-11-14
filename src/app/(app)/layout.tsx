"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AppLoader } from "@/components/ui/app-loader";
import { useDietFit } from "@/components/providers/dietfit-provider";

export default function InternalAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { state, hydrated, firebaseRemoteLoaded } = useDietFit();
  // A returning Firebase user lands here right after sign-in with a fresh
  // local state; their onboardingCompleted has not been rehydrated from
  // Firestore yet. Hold the redirect until the remote fetch settles so we
  // don't bounce them through onboarding a second time.
  // When this device already has a finished profile there is nothing to
  // decide, so show it straight away (every app open used to sit on the
  // loader for the Firestore round trip). The remote copy still merges in
  // when it lands, and saving keeps waiting for it (see firebase-remote-gate).
  // Keyed on the remote gate rather than authMode="firebase": on a cleared
  // local state, authMode starts as "demo" and only flips to "firebase"
  // once onAuthStateChanged fires, which is exactly the race we need to
  // wait out. The gate opens immediately on devices without Firebase, so
  // the hold is tight.
  const hasCompleteLocalState = state.onboardingCompleted && state.paywallCompleted;
  const awaitingFirebaseRemote = !firebaseRemoteLoaded && !hasCompleteLocalState;

  useEffect(() => {
    if (!hydrated || awaitingFirebaseRemote) {
      return;
    }

    if (!state.onboardingCompleted) {
      router.replace("/onboarding");
      return;
    }

    if (!state.paywallCompleted) {
      router.replace("/paywall");
    }
  }, [
    awaitingFirebaseRemote,
    hydrated,
    router,
    state.onboardingCompleted,
    state.paywallCompleted,
  ]);

  if (!hydrated || awaitingFirebaseRemote) {
    return <AppLoader />;
  }

  // Redirecting to onboarding or the paywall (after sign-out or account
  // deletion, say): keep the loader up instead of a blank page.
  if (!state.onboardingCompleted || !state.paywallCompleted) {
    return <AppLoader />;
  }

  return <AppShell>{children}</AppShell>;
}
