"use client";

import { useState, useSyncExternalStore } from "react";

// The bridge never changes after the page loads.
const subscribeNever = () => () => {};
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Crown,
  Dumbbell,
  FileText,
  Headphones,
  Lock,
  LogOut,
  MessageCircle,
  Pencil,
  Scale,
  Sparkles,
  ShieldCheck,
  Sparkle,
  Target,
  Trash2,
  User,
  Utensils,
  X,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { IconBadge } from "@/components/glass/icon-badge";
import {
  getActiveDays,
  getDietaryPreferenceLabel,
  getFoodFlagsForDietaryPreference,
  getGoalSummary,
} from "@/lib/recommendations";
import { deleteFirebaseAccount, deletionErrorMessage } from "@/lib/account-deletion";
import { createFirebaseAuth } from "@/lib/firebase-browser";
import { nativeBridge } from "@/lib/native-bridge";
import { getAiConsent, setAiConsent, subscribeAiConsent } from "@/lib/ai-consent";
import { getCycleTargetWeightKg, getGoalCycle } from "@/lib/goal-cycle";
import { cn, startOfTodayIso } from "@/lib/utils";
import { formatInr, priceFor } from "@/lib/pricing";
import {
  ELITE_UPCOMING_FEATURES,
  buildEliteMailtoUrl,
  buildEliteWhatsAppUrl,
} from "@/lib/elite-perks";
import { format, parseISO } from "date-fns";
import type {
  DietaryPreference,
  FitnessExperience,
  PrimaryGoal,
  Weekday,
  WorkoutEnvironment,
} from "@/lib/types";
import { WEEKDAYS_IN_ORDER } from "@/lib/types";

const PRIMARY_GOAL_OPTIONS: { value: PrimaryGoal; label: string }[] = [
  { value: "lose-weight", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "build-muscle", label: "Build muscle" },
  { value: "improve-endurance", label: "Improve endurance" },
  { value: "target-body-area", label: "Target body area" },
  { value: "competition-prep", label: "Competition prep" },
];

const EXPERIENCE_OPTIONS: { value: FitnessExperience; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "returning", label: "Returning" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const ENVIRONMENT_OPTIONS: { value: WorkoutEnvironment; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "gym", label: "Gym" },
];

const DIETARY_PREFERENCE_OPTIONS: DietaryPreference[] = [
  "vegetarian",
  "eggetarian",
  "non-vegetarian",
  "vegan",
];

const INJURY_OPTIONS = ["knee", "shoulder", "lower-back", "wrist", "ankle"];

const TIER_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  starter: { label: "Starter", color: "text-foreground/60", bg: "bg-foreground/6" },
  pro: { label: "Pro", color: "text-primary", bg: "bg-primary/10" },
  elite: { label: "Elite", color: "text-accent", bg: "bg-accent/10" },
};

const TIER_DETAILS: Record<
  string,
  { name: string; blurb: string; nextTier: string | null; nextLabel: string | null }
> = {
  starter: {
    name: "Starter",
    blurb: "Diet tracker · Workout plans · Basic AI Coach",
    nextTier: "pro",
    nextLabel: "Upgrade to Pro",
  },
  pro: {
    name: "Pro",
    blurb: "Adaptive AI Coach · Home workouts · AI diet plan",
    nextTier: "elite",
    nextLabel: "Upgrade to Elite",
  },
  elite: {
    name: "Elite",
    blurb: "Everything in Pro · Monthly call with a trainer",
    nextTier: null,
    nextLabel: null,
  },
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Weight inputs hold text so they can be cleared while typing; a stored
// 0 or missing weight starts empty instead of as a sticky "0".
function weightText(kg: number | undefined) {
  return kg ? String(kg) : "";
}

export default function ProfilePage() {
  const router = useRouter();
  const { state, hydrated, resetApp, updateProfile } = useDietFit();
  const [isEditing, setIsEditing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const aiConsent = useSyncExternalStore(subscribeAiConsent, getAiConsent, () => null);
  // Store links only make sense inside the app. The server snapshot is
  // `false`, so hydration matches and the client then reads the bridge.
  const isNativeApp = useSyncExternalStore(
    subscribeNever,
    () => nativeBridge.isNative,
    () => false,
  );
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Workout-days sheet: mirrors the picker on the workout tab so training days
  // and rest days can be adjusted from the profile too.
  const [showWorkoutDaysSheet, setShowWorkoutDaysSheet] = useState(false);
  const [workoutDaysDraft, setWorkoutDaysDraft] = useState<Weekday[]>([]);
  const [form, setForm] = useState(() => ({
    weightKg: weightText(state.profile?.weightKg),
    goalWeightKg: weightText(state.profile ? getCycleTargetWeightKg(state.profile) ?? undefined : undefined),
    primaryGoal: (state.profile?.primaryGoal ?? "maintain") as PrimaryGoal,
    fitnessExperience: (state.profile?.fitnessExperience ?? "beginner") as FitnessExperience,
    workoutEnvironment: (state.profile?.workoutEnvironment ?? "home") as WorkoutEnvironment,
    injuries: state.profile?.injuries ?? [],
    dietaryPreference: state.profile?.dietaryPreference ?? null,
    allergies: state.profile?.allergies.join(", ") ?? "",
    dislikedFoods: state.profile?.dislikedFoods.join(", ") ?? "",
  }));

  if (!hydrated) return null;

  if (!state.profile || !state.nutritionTargets) {
    return (
      <div className="px-4 pt-6 text-sm text-foreground/50">
        Complete onboarding to see your profile.
      </div>
    );
  }

  const profile = state.profile;
  const goalSummary = getGoalSummary(profile);
  const today = startOfTodayIso();
  const cycle = getGoalCycle(profile, today);
  const { dayNumber, totalDays, weekNumber, monthNumber, daysLeft } = cycle;
  const tier = state.subscriptionTier ?? "starter";
  const tierMeta = TIER_LABELS[tier] ?? TIER_LABELS.starter;
  const tierDetails = TIER_DETAILS[tier] ?? TIER_DETAILS.starter;
  // The billing period isn't stored yet, so quote the yearly rate the
  // paywall leads with.
  const tierPrice = `from ${formatInr(priceFor(tier, "yearly").perMonth)}/mo`;

  async function handleSignOut() {
    setSigningOut(true);
    const auth = createFirebaseAuth();
    if (auth) {
      await signOut(auth).catch(() => null);
    }
    // Clear the native Google session too, so the picker shows next sign-in.
    if (nativeBridge.isNative) {
      await nativeBridge.auth.googleSignOut().catch(() => null);
    }
    resetApp();
    router.replace("/onboarding");
  }

  async function handleDeleteAccount() {
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await deleteFirebaseAccount();
    } catch (error) {
      setDeleteError(deletionErrorMessage(error));
      setDeletingAccount(false);
      return;
    }
    // The login is gone; clear what's left on this device too.
    if (nativeBridge.isNative) {
      await nativeBridge.auth.googleSignOut().catch(() => null);
      await nativeBridge.purchases.logout().catch(() => null);
    }
    resetApp();
    router.replace("/onboarding");
  }

  function startEditing() {
    setForm({
      weightKg: weightText(profile.weightKg),
      goalWeightKg: weightText(getCycleTargetWeightKg(profile) ?? undefined),
      primaryGoal: profile.primaryGoal,
      fitnessExperience: profile.fitnessExperience,
      workoutEnvironment: profile.workoutEnvironment,
      injuries: profile.injuries,
      dietaryPreference: profile.dietaryPreference ?? null,
      allergies: profile.allergies.join(", "),
      dislikedFoods: profile.dislikedFoods.join(", "),
    });
    setIsEditing(true);
  }

  function toggleInjury(injury: string) {
    setForm((prev) => ({
      ...prev,
      injuries: prev.injuries.includes(injury)
        ? prev.injuries.filter((i) => i !== injury)
        : [...prev.injuries, injury],
    }));
  }

  function saveProfile() {
    // The form asks for the weight to reach; the profile stores how far that
    // is from the current weight (goalTargetKg is a change in kg).
    const nextWeightKg = Number(form.weightKg) || profile.weightKg;
    const goalWeightKg = Number(form.goalWeightKg);
    updateProfile({
      weightKg: nextWeightKg,
      goalTargetKg: goalWeightKg
        ? Math.round(Math.abs(goalWeightKg - nextWeightKg) * 10) / 10
        : undefined,
      primaryGoal: form.primaryGoal,
      fitnessExperience: form.fitnessExperience,
      workoutEnvironment: form.workoutEnvironment,
      injuries: form.injuries,
      ...(form.dietaryPreference
        ? {
            dietaryPreference: form.dietaryPreference,
            foodFlags: getFoodFlagsForDietaryPreference(form.dietaryPreference),
          }
        : {}),
      allergies: form.allergies.split(",").map((s) => s.trim()).filter(Boolean),
      dislikedFoods: form.dislikedFoods.split(",").map((s) => s.trim()).filter(Boolean),
    });
    setIsEditing(false);
  }

  return (
    <div className="glass-ui relative min-h-screen pb-28">
      <GlassBackdrop />

      <div className="relative mx-auto max-w-[460px] px-4 pt-[calc(0.75rem+var(--safe-top))]">

        {/* ── Hero: identity + plan cycle ── */}
        <div className="glass-dark mt-6 rounded-hero p-4">
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-[19px] font-semibold text-foreground">
                {initials(profile.name)}
              </div>
              {tier !== "starter" && (
                <div
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-primary-strong/80"
                  style={{ background: tier === "elite" ? "var(--accent)" : "var(--mint-medium)" }}
                >
                  <Crown className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-[21px] font-medium leading-tight tracking-[-0.02em] text-white">{profile.name}</h1>
              {state.userEmail ? (
                <p className="mt-0.5 truncate text-[12px] text-white/60">{state.userEmail}</p>
              ) : null}
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                tier === "elite"
                  ? "bg-accent text-white"
                  : tier === "pro"
                    ? "bg-mint-medium text-foreground"
                    : "bg-white/12 text-white/80",
              )}
            >
              {tierMeta.label}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-[14px] bg-white/12 px-3 py-2.5">
              <p className="text-[10.5px] text-white/60">Plan day</p>
              <p className="mt-1 text-[17px] font-medium text-white">
                {cycle.isComplete ? (
                  "Done"
                ) : (
                  <>
                    {dayNumber}<span className="text-[11px] text-white/45"> / {totalDays}</span>
                  </>
                )}
              </p>
            </div>
            <div className="rounded-[14px] bg-white/12 px-3 py-2.5">
              <p className="text-[10.5px] text-white/60">
                {cycle.isComplete ? "Ended" : "Days left"}
              </p>
              <p className="mt-1 text-[17px] font-medium text-white">
                {cycle.isComplete ? format(parseISO(cycle.endsOn), "d MMM") : daysLeft}
              </p>
            </div>
            <div className="rounded-[14px] bg-white/12 px-3 py-2.5">
              <p className="text-[10.5px] text-white/60">Phase</p>
              <p className="mt-1 text-[17px] font-medium text-white">
                M{monthNumber} W{weekNumber}
              </p>
            </div>
          </div>

          {tier === "elite" && (
            <button
              type="button"
              onClick={() => router.push("/coach-on-demand")}
              className="mt-3 flex w-full items-center justify-between gap-3 rounded-[14px] bg-white/12 px-3.5 py-3 text-left transition active:scale-[0.98]"
            >
              <span className="flex items-center gap-2.5">
                <CalendarClock className="h-4 w-4 text-accent" />
                <span className="text-[13px] font-medium text-white">
                  Book your monthly trainer call
                </span>
              </span>
              <span className="text-[11px] text-white/60">Included</span>
            </button>
          )}
        </div>

        {/* ── Plan tier card ── */}
        <button
          type="button"
          onClick={() => {
            if (tierDetails.nextTier) {
              router.push("/paywall?upgrade=1");
            }
          }}
          disabled={!tierDetails.nextTier}
          className={cn(
            "glass mt-3 flex w-full items-center gap-3 rounded-[22px] px-3.5 py-3 text-left transition",
            tierDetails.nextTier ? "active:scale-[0.99]" : "cursor-default",
          )}
        >
          <IconBadge
            className={cn(
              "h-9 w-9",
              tier === "elite"
                ? "border-accent/40 text-accent"
                : tier === "pro"
                  ? "border-primary/40 text-primary"
                  : "text-foreground/60",
            )}
          >
            {tier === "starter" ? (
              <Sparkles className="h-4 w-4" />
            ) : (
              <Crown className="h-4 w-4" />
            )}
          </IconBadge>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-foreground/55">
              Plan · {tierPrice}
            </p>
            <p className="mt-0.5 text-[15px] font-medium text-foreground">{tierDetails.name}</p>
            <p className="mt-0.5 truncate text-[11px] text-foreground/55">{tierDetails.blurb}</p>
          </div>
          {tierDetails.nextLabel ? (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_6px_14px_rgba(242,132,58,0.28)]">
              {tierDetails.nextLabel}
              <ChevronRight className="h-3 w-3" />
            </div>
          ) : (
            <span className="glass-inset shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold text-accent">
              Top plan
            </span>
          )}
        </button>

        {/* ── Elite perks ── */}
        {tier === "elite" ? (
          <>
            <div className="glass mt-3 rounded-hero px-3.5 py-3.5">
              <div className="flex items-center gap-2">
                <IconBadge className="h-8 w-8 border-accent/40 text-accent">
                  <Sparkle className="h-4 w-4" />
                </IconBadge>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-accent/80">
                    Elite early access
                  </p>
                  <p className="text-[15px] font-medium text-foreground">
                    Coming soon
                  </p>
                </div>
              </div>
              {ELITE_UPCOMING_FEATURES.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {ELITE_UPCOMING_FEATURES.map((feature) => (
                    <li
                      key={feature.id}
                      className="glass-inset rounded-chip px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-medium leading-snug text-foreground">
                          {feature.title}
                        </p>
                        {feature.eta ? (
                          <span className="shrink-0 rounded-full bg-accent/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                            {feature.eta}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-foreground/55">
                        {feature.blurb}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[12.5px] leading-snug text-foreground/55">
                  You are all caught up. New features land here before anyone
                  else sees them.
                </p>
              )}
            </div>

            <div className="glass mt-3 rounded-hero px-3.5 py-3.5">
              <div className="flex items-center gap-2">
                <IconBadge className="h-8 w-8 border-accent/40 text-accent">
                  <Headphones className="h-4 w-4" />
                </IconBadge>
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-accent/80">
                    Priority support
                  </p>
                  <p className="text-[15px] font-medium text-foreground">
                    We reply to Elite first
                  </p>
                </div>
              </div>
              <a
                href={buildEliteWhatsAppUrl(state.userEmail)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-between gap-3 rounded-full bg-primary-strong px-4 py-3 text-left shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.98]"
              >
                <span className="flex items-center gap-2 text-white">
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-[13.5px] font-semibold">
                    Chat on WhatsApp
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-white opacity-70" />
              </a>
              <a
                href={buildEliteMailtoUrl(state.userEmail)}
                className="mt-2 block text-center text-[12px] font-medium text-foreground/55 underline-offset-2 hover:underline"
              >
                or email contact@fitmonk.online
              </a>
            </div>
          </>
        ) : (
          <div className="glass mt-3 rounded-hero px-3.5 py-3.5">
            <div className="flex items-center gap-2">
              <IconBadge className="h-8 w-8">
                <Headphones className="h-4 w-4" />
              </IconBadge>
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-foreground/55">
                  Support
                </p>
                <p className="text-[15px] font-medium text-foreground">
                  We are here to help
                </p>
              </div>
            </div>
            <a
              href={`mailto:contact@fitmonk.online?subject=${encodeURIComponent(
                "Fitmonk support request",
              )}${
                state.userEmail
                  ? `&body=${encodeURIComponent(
                      `Account: ${state.userEmail}\n\nHow can we help?`,
                    )}`
                  : ""
              }`}
              className="mt-3 flex items-center justify-between gap-3 rounded-full bg-primary-strong px-4 py-3 text-left shadow-[0_10px_22px_rgba(12,39,35,0.22)] transition active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 text-white">
                <MessageCircle className="h-4 w-4" />
                <span className="text-[13.5px] font-semibold">
                  Email contact@fitmonk.online
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-white opacity-70" />
            </a>
          </div>
        )}

        {/* ── Profile info / edit ── */}
        <div className="glass mt-3 rounded-hero px-3.5 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[15px] font-medium text-foreground">
              <IconBadge className="h-8 w-8">
                <User className="h-4 w-4" />
              </IconBadge>
              Your profile
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={startEditing}
                className="glass-inset flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-white/80"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
          </div>

          {!isEditing ? (
            <div className="mt-3 grid gap-2">
              {[
                { icon: Target, label: "Goal", value: goalSummary.headline },
                { icon: Dumbbell, label: "Workout setup", value: `${profile.workoutEnvironment} · ${profile.exerciseFrequency}` },
                { icon: ShieldCheck, label: "Experience", value: profile.fitnessExperience },
                {
                  icon: Utensils,
                  label: "Food style",
                  value: profile.dietaryPreference
                    ? getDietaryPreferenceLabel(profile.dietaryPreference)
                    : "Not set yet",
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="glass-inset flex items-center gap-3 rounded-[16px] px-3 py-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-foreground/45" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-foreground/55">{label}</p>
                    <p className="mt-0.5 text-[13.5px] text-foreground first-letter:uppercase">{value}</p>
                  </div>
                </div>
              ))}
              {(() => {
                const activeDays = getActiveDays(profile);
                const restDays = WEEKDAYS_IN_ORDER.filter((day) => !activeDays.includes(day));
                const trainingCount = activeDays.length;
                const restSummary =
                  restDays.length === 0
                    ? "No rest days"
                    : restDays.length === 7
                      ? "All rest"
                      : `Rest ${restDays.map((day) => day.slice(0, 3)).join(", ")}`;

                return (
                  <button
                    type="button"
                    onClick={() => {
                      setWorkoutDaysDraft(activeDays);
                      setShowWorkoutDaysSheet(true);
                    }}
                    className="glass-inset flex items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition active:scale-[0.99]"
                    aria-label="Change your workout days"
                  >
                    <CalendarDays className="h-4 w-4 shrink-0 text-foreground/45" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-foreground/55">
                        Workout days
                      </p>
                      <p className="mt-0.5 text-[13.5px] text-foreground">
                        {trainingCount} training day{trainingCount === 1 ? "" : "s"} · {restSummary}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-foreground/35" />
                  </button>
                );
              })()}
              {profile.injuries.length > 0 && (
                <div className="glass-inset flex items-center gap-3 rounded-[16px] px-3 py-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-foreground/45" />
                  <div>
                    <p className="text-[11px] text-foreground/55">Injuries noted</p>
                    <p className="mt-0.5 text-[13.5px] text-foreground first-letter:uppercase">{profile.injuries.join(", ")}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 grid gap-4">
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] text-foreground/55">Current weight (kg)</span>
                <input type="number" className="glass-inset rounded-[14px] px-3 py-2.5 text-[14px] outline-none focus:border-primary/40" value={form.weightKg} onChange={(e) => setForm((p) => ({ ...p, weightKg: e.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] text-foreground/55">Goal weight (kg)</span>
                <input type="number" className="glass-inset rounded-[14px] px-3 py-2.5 text-[14px] outline-none focus:border-primary/40" value={form.goalWeightKg} onChange={(e) => setForm((p) => ({ ...p, goalWeightKg: e.target.value }))} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] text-foreground/55">Primary goal</span>
                <select className="glass-inset rounded-[14px] px-3 py-2.5 text-[14px] outline-none focus:border-primary/40" value={form.primaryGoal} onChange={(e) => setForm((p) => ({ ...p, primaryGoal: e.target.value as PrimaryGoal }))}>
                  {PRIMARY_GOAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] text-foreground/55">Experience</span>
                <select className="glass-inset rounded-[14px] px-3 py-2.5 text-[14px] outline-none focus:border-primary/40" value={form.fitnessExperience} onChange={(e) => setForm((p) => ({ ...p, fitnessExperience: e.target.value as FitnessExperience }))}>
                  {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] text-foreground/55">Workout setup</span>
                <select className="glass-inset rounded-[14px] px-3 py-2.5 text-[14px] outline-none focus:border-primary/40" value={form.workoutEnvironment} onChange={(e) => setForm((p) => ({ ...p, workoutEnvironment: e.target.value as WorkoutEnvironment }))}>
                  {ENVIRONMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-[11px] text-foreground/55">Food style</span>
                <select
                  className="glass-inset rounded-[14px] px-3 py-2.5 text-[14px] outline-none focus:border-primary/40"
                  value={form.dietaryPreference ?? ""}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      dietaryPreference: e.target.value
                        ? (e.target.value as DietaryPreference)
                        : null,
                    }))
                  }
                >
                  <option value="">Not set yet</option>
                  {DIETARY_PREFERENCE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {getDietaryPreferenceLabel(o)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2">
                <span className="text-[11px] text-foreground/55">Injuries</span>
                <div className="flex flex-wrap gap-2">
                  {INJURY_OPTIONS.map((injury) => (
                    <button key={injury} type="button" onClick={() => toggleInjury(injury)} className={cn("rounded-full border px-3 py-1.5 text-[12px] capitalize transition", form.injuries.includes(injury) ? "border-transparent bg-primary-strong text-white" : "glass-inset")}>
                      {injury.replace("-", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setIsEditing(false)} className="glass-inset flex-1 rounded-full py-3 text-[13px] font-semibold transition active:scale-[0.98]">Cancel</button>
                <button type="button" onClick={saveProfile} className="flex-1 rounded-full bg-primary-strong py-3 text-[13px] font-semibold text-white shadow-[0_10px_20px_rgba(12,39,35,0.16)] transition active:scale-[0.98]">Save changes</button>
              </div>
            </div>
          )}
        </div>

        {/* ── AI features & subscription ── */}
        <div className="glass mt-3 overflow-hidden rounded-[22px]">
          <div className="divide-y divide-foreground/8">
            <button
              type="button"
              role="switch"
              aria-checked={aiConsent === "granted"}
              onClick={() => setAiConsent(aiConsent === "granted" ? "declined" : "granted")}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-foreground/4"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-foreground/45" />
              <span className="flex-1">
                <span className="block text-[13.5px] text-foreground">AI features</span>
                <span className="block text-[11px] leading-[1.4] text-foreground/45">
                  Meal, photo and Coach analysis by OpenAI
                </span>
              </span>
              <span
                className={cn(
                  "relative h-6 w-10 shrink-0 rounded-full transition",
                  aiConsent === "granted" ? "bg-primary-strong" : "bg-foreground/20",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                    aiConsent === "granted" ? "left-[18px]" : "left-0.5",
                  )}
                />
              </span>
            </button>
            {isNativeApp ? (
              <button
                type="button"
                onClick={() =>
                  void nativeBridge.device.openExternal(
                    nativeBridge.platform === "ios"
                      ? "https://apps.apple.com/account/subscriptions"
                      : "https://play.google.com/store/account/subscriptions",
                  )
                }
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-foreground/4"
              >
                <CreditCard className="h-4 w-4 shrink-0 text-foreground/45" />
                <span className="flex-1 text-[13.5px] text-foreground">Manage subscription</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Legal ── */}
        <div className="glass mt-3 overflow-hidden rounded-[22px]">
          <div className="flex items-center gap-2 px-3.5 pt-3.5 text-[15px] font-medium text-foreground">
            <IconBadge className="h-8 w-8">
              <Scale className="h-4 w-4" />
            </IconBadge>
            Legal
          </div>
          <div className="mt-1.5 divide-y divide-foreground/8">
            {[
              { href: "/terms", icon: FileText, label: "Terms of Service" },
              { href: "/privacy", icon: Lock, label: "Privacy Policy" },
            ].map(({ href, icon: Icon, label }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3.5 transition active:bg-foreground/4"
              >
                <Icon className="h-4 w-4 shrink-0 text-foreground/45" />
                <span className="flex-1 text-[13.5px] text-foreground">{label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
              </Link>
            ))}
          </div>
        </div>

        {/* ── Actions ── */}
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            // Glass, warmed red so it still reads as the one destructive action.
            className="glass flex w-full items-center gap-3 rounded-[20px] bg-red-100/55! px-4 py-3.5 text-left transition active:scale-[0.98] disabled:opacity-60"
          >
            <LogOut className="h-4 w-4 shrink-0 text-red-500/70" />
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-red-600/80">{signingOut ? "Signing out…" : "Sign out"}</p>
              <p className="text-[11px] text-foreground/45">You&apos;ll need to sign in again to continue</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setShowDeleteSheet(true);
            }}
            className="flex w-full items-center gap-3 rounded-[20px] px-4 py-3 text-left transition active:scale-[0.98]"
          >
            <Trash2 className="h-4 w-4 shrink-0 text-foreground/40" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-foreground/60">Delete account</p>
              <p className="text-[11px] text-foreground/40">Permanently remove your account and data</p>
            </div>
          </button>
        </div>

      </div>

      {showDeleteSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-6">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => (deletingAccount ? null : setShowDeleteSheet(false))}
          />
          <div className="glass-sheet glass-ui relative w-full max-w-sm rounded-hero p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-red-600/80">Delete account</p>
                <h3 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                  Delete your account?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteSheet(false)}
                disabled={deletingAccount}
                className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95] disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5] text-foreground/65">
              This permanently deletes your profile, plan, meal and workout logs, progress
              and Coach chats. It can&apos;t be undone.
            </p>
            <p className="mt-2 text-[12px] leading-[1.5] text-foreground/50">
              You may be asked to confirm with Google or Apple first. A subscription bought
              through the App Store or Google Play isn&apos;t cancelled by this; cancel it in
              your store&apos;s subscription settings.
            </p>
            {deleteError ? (
              <p className="mt-3 text-[12px] leading-[1.45] text-red-600/80">{deleteError}</p>
            ) : null}
            <div className="mt-4 grid gap-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deletingAccount}
                className="flex h-11 w-full items-center justify-center rounded-full bg-red-600 text-[14px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
              >
                {deletingAccount ? "Deleting…" : "Delete account"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteSheet(false)}
                disabled={deletingAccount}
                className="flex h-11 w-full items-center justify-center rounded-full text-[14px] font-medium text-foreground/70 transition active:scale-[0.98] disabled:opacity-50"
              >
                Keep my account
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showWorkoutDaysSheet ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-6">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowWorkoutDaysSheet(false)}
          />
          <div className="glass-sheet glass-ui relative w-full max-w-sm rounded-hero p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-foreground/55">
                  Workout days
                </p>
                <h3 className="mt-1 text-[19px] font-medium tracking-[-0.02em] text-foreground">
                  Pick the days you train
                </h3>
                <p className="mt-1 text-[12.5px] leading-[1.45] text-foreground/58">
                  The rest of the week becomes recovery. Your plan regenerates the moment you save.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWorkoutDaysSheet(false)}
                className="glass-inset flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground/58 transition active:scale-[0.95]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* One row of seven: wrapping stranded Sunday as a long pill. */}
            <div className="mt-4 grid grid-cols-7 gap-1.5">
              {WEEKDAYS_IN_ORDER.map((day) => {
                const isActive = workoutDaysDraft.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setWorkoutDaysDraft((current) =>
                        current.includes(day)
                          ? current.filter((d) => d !== day)
                          : [...current, day],
                      )
                    }
                    className={cn(
                      "flex h-10 items-center justify-center rounded-full border text-[11.5px] font-semibold transition active:scale-[0.97]",
                      isActive
                        ? "border-transparent bg-primary-strong text-white shadow-[0_8px_18px_rgba(12,39,35,0.2)]"
                        : "border-foreground/12 bg-white text-foreground/70 hover:border-primary/30",
                    )}
                    aria-pressed={isActive}
                  >
                    {day.slice(0, 3)}
                  </button>
                );
              })}
            </div>

            <p className="mt-3 text-[11.5px] leading-[1.45] text-foreground/50">
              {workoutDaysDraft.length === 0
                ? "Pick at least one day so we can build you a plan."
                : `${workoutDaysDraft.length} training day${workoutDaysDraft.length === 1 ? "" : "s"} · ${7 - workoutDaysDraft.length} rest`}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowWorkoutDaysSheet(false)}
                className="flex h-11 items-center justify-center rounded-full border border-foreground/12 bg-white text-[13.5px] font-semibold text-foreground/70 transition active:scale-[0.97]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={workoutDaysDraft.length === 0}
                onClick={() => {
                  updateProfile({ preferredWorkoutWeekdays: workoutDaysDraft });
                  setShowWorkoutDaysSheet(false);
                }}
                className={cn(
                  "flex h-11 items-center justify-center rounded-full text-[13.5px] font-semibold transition active:scale-[0.97]",
                  workoutDaysDraft.length === 0
                    ? "cursor-not-allowed bg-primary/40 text-white/70"
                    : "bg-primary-strong text-white shadow-[0_10px_22px_rgba(12,39,35,0.22)]",
                )}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
