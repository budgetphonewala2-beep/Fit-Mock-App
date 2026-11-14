"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import {
  answerAiConsent,
  isAiConsentPromptOpen,
  subscribeAiConsent,
} from "@/lib/ai-consent";

/**
 * Explicit, informed consent before personal data is sent to OpenAI
 * (App Store Guideline 5.1.2(i)). Names the provider, what is sent and why,
 * and that it's optional. Mounted once at the root; opened by `aiFetch`.
 */
export function AiConsentSheet() {
  const open = useSyncExternalStore(
    subscribeAiConsent,
    isAiConsentPromptOpen,
    () => false,
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center p-4 pb-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm rounded-[28px] bg-[#fbf9f3] p-5 text-[#0E2320] shadow-[0_24px_60px_rgba(12,39,35,0.28)]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0E4B45]/10 text-[#0E4B45]">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-[12px] font-medium text-[#0E2320]/60">AI features</p>
        </div>
        <h3
          id="ai-consent-title"
          className="mt-2 text-[19px] font-medium tracking-[-0.02em]"
        >
          Use AI to analyse your meals and coach you?
        </h3>
        <p className="mt-2 text-[13px] leading-[1.5] text-[#0E2320]/70">
          To estimate nutrition and answer the Coach, Fitmonk sends what you choose to
          share to <strong>OpenAI</strong>, a third-party AI provider:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[12.5px] leading-[1.45] text-[#0E2320]/70">
          <li>meals you type or say, and meal photos you snap</li>
          <li>messages and photos you send to the Coach</li>
          <li>
            your profile and logs (goal, body stats, food preferences, meals, workouts) so
            plans and replies fit you
          </li>
        </ul>
        <p className="mt-2 text-[12px] leading-[1.5] text-[#0E2320]/55">
          OpenAI doesn&apos;t use this data to train its models. Without AI, meals are
          estimated on your device and the Coach and photo logging stay off. You can
          change this any time in Profile. See our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => answerAiConsent(true)}
            className="flex h-11 w-full items-center justify-center rounded-full bg-[#0E4B45] text-[14px] font-semibold text-white transition active:scale-[0.98]"
          >
            Allow AI features
          </button>
          <button
            type="button"
            onClick={() => answerAiConsent(false)}
            className="flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium text-[#0E2320]/70 transition active:scale-[0.98]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
