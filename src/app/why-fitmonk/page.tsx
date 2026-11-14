"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import {
  Activity,
  MessageCircle,
  Sparkles,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { createFirebaseAuth } from "@/lib/firebase-browser";
import { nativeBridge } from "@/lib/native-bridge";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { cn } from "@/lib/utils";

type Reason = {
  icon: LucideIcon;
  title: string;
  body: string;
  tag?: "Elite";
};

const REASONS: Reason[] = [
  {
    icon: Sparkles,
    title: "Made for you",
    body: "A plan built around your body, your schedule, and the food you actually eat.",
  },
  {
    icon: Activity,
    title: "Adapts daily",
    body: "Workouts that adapt to how you feel today, not a fixed template.",
  },
  {
    icon: MessageCircle,
    title: "A coach that listens",
    body: "An AI coach that reads your meals, your streak, and your hardest part.",
  },
  {
    icon: Users,
    title: "A real trainer",
    body: "On Elite, a real trainer on a video call every month.",
    tag: "Elite",
  },
];

export default function WhyFitmonkPage() {
  const router = useRouter();
  const { resetApp } = useDietFit();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await nativeBridge.purchases.logout().catch(() => null);
    } catch {
      // Qonversion logout is best-effort — don't block sign-out on it.
    }
    const auth = createFirebaseAuth();
    if (auth) {
      await signOut(auth).catch(() => null);
    }
    resetApp();
    router.replace("/sign-in");
  }

  return (
    <div
      className="relative mx-auto flex min-h-screen w-full max-w-[460px] flex-col bg-[#0F4038] text-white"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Header: close signs the user out. */}
      <div className="flex h-[52px] shrink-0 items-center px-4">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          aria-label="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 disabled:opacity-60"
        >
          <X className="h-5 w-5 text-white" strokeWidth={2.25} />
        </button>
      </div>

      {/* Title + subtitle. */}
      <div className="mt-[18px] px-4">
        <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-[-0.02em] text-white">
          Why Fitmonk?
        </h1>
        <p className="mt-[14px] max-w-[18rem] font-sans text-[15px] leading-[1.45] text-[#F7F1E6]/70">
          Here is what you get for the price of one coffee a week.
        </p>
      </div>

      {/* Reason rows. */}
      <div className="mt-6 flex flex-1 flex-col gap-[10px] px-4">
        {REASONS.map(({ icon: Icon, title, body, tag }) => (
          <div
            key={title}
            className={cn(
              "flex items-start gap-[14px] rounded-[16px] border border-[rgba(247,241,230,0.10)] bg-[rgba(247,241,230,0.08)] p-[14px]",
            )}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[rgba(21,181,155,0.16)]">
              <Icon className="h-5 w-5 text-[#5CD6BE]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-[2px]">
                <h2 className="font-display text-[15px] font-bold leading-[20px] text-white">
                  {title}
                </h2>
                {tag ? (
                  <span className="inline-flex items-center rounded-full bg-[#F2843A] px-[7px] py-[2px] font-sans text-[10px] font-extrabold uppercase tracking-[0.03em] text-[#0E2320]">
                    {tag}
                  </span>
                ) : null}
              </div>
              <p className="mt-[2px] font-sans text-[13.5px] font-medium leading-[1.4] text-[#F7F1E6]/80">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: primary CTA back to paywall, secondary sign-out link. */}
      <div
        className="shrink-0 px-4 pb-[22px] pt-6"
        style={{ paddingBottom: "calc(22px + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => router.push("/paywall")}
          disabled={signingOut}
          className="flex w-full min-h-[54px] items-center justify-center rounded-full bg-[#F2843A] px-5 py-[10px] font-sans text-[16px] font-extrabold text-[#0E2320] transition active:scale-[0.985] disabled:opacity-70"
        >
          See the plans
        </button>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="mt-[8px] flex min-h-[40px] w-full items-center justify-center text-center font-sans text-[13px] font-bold text-[#F7F1E6]/55 disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
