"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { signInWithPopup, signInWithRedirect } from "firebase/auth";
import {
  ArrowRight,
  Check,
  CircleUser,
  Drumstick,
  Dumbbell,
  Egg,
  Flame,
  Heart,
  HeartPulse,
  House,
  Infinity as InfinityIcon,
  LoaderCircle,
  Minus,
  Plane,
  PersonStanding,
  Salad,
  Scale,
  Sprout,
  Sun,
  Target,
  TrendingDown,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { Btn, Foot, Frame, Label, ScrollPicker, Seg, Tile } from "@/components/onboarding/ui";
import { Screen, ScreenBody, ScreenFooter, ScreenGrow } from "@/components/ui/screen";
import { hasFirebaseEnv } from "@/lib/env";
import {
  canSignInWithApple,
  createFirebaseAuth,
  createGoogleAuthProvider,
  signInWithAppleNative,
  signInWithGoogleNative,
} from "@/lib/firebase-browser";
import { nativeBridge } from "@/lib/native-bridge";
import {
  getFoodFlagsForDietaryPreference,
} from "@/lib/recommendations";
import { onboardingSchema } from "@/lib/validation";
import { AppLoader } from "@/components/ui/app-loader";
import type {
  DietaryPreference,
  OnboardingInput,
  PrimaryGoal,
  Sex as SexType,
  WorkoutEnvironment,
} from "@/lib/types";

/* ── Units & conversion helpers ── */

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;

function kgToLb(kg: number) {
  return kg / KG_PER_LB;
}
function lbToKg(lb: number) {
  return lb * KG_PER_LB;
}
function cmToIn(cm: number) {
  return cm / CM_PER_IN;
}
function inToCm(inches: number) {
  return inches * CM_PER_IN;
}

function getFirebaseErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

function getGoogleProfileName(displayName: string | null, email: string | null) {
  if (displayName && displayName.trim().length >= 2) {
    return displayName.trim();
  }

  const emailName = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();

  return emailName && emailName.length >= 2 ? emailName : "Fitmonk User";
}

/* ── Flow data ── */

type GoalKey = "lose" | "gain" | "keep";
type PlaceKey = "gym" | "home" | "both";
type SexKey = "female" | "male" | "other";

const GOAL_TO_PRIMARY: Record<GoalKey, PrimaryGoal> = {
  lose: "lose-weight",
  gain: "build-muscle",
  keep: "maintain",
};

// No dedicated "how many days can you train" screen in this flow, so we infer a
// sensible weekly cadence from the goal the user already picked instead of a
// flat default — users can still fine-tune this later on the Profile page.
const GOAL_TO_WORKOUT_DAYS: Record<GoalKey, number> = {
  lose: 6,
  gain: 6,
  keep: 5,
};

const SEX_TO_PROFILE: Record<SexKey, SexType> = {
  female: "female",
  male: "male",
  other: "prefer-not-to-say",
};

const PLACE_TO_ENVIRONMENT: Record<PlaceKey, WorkoutEnvironment> = {
  gym: "gym",
  home: "home",
  // "A bit of both" starts in gym: it is the broader setup, and home stays one
  // workout-setup change away.
  both: "gym",
};

const FORM_SCREENS = ["units", "sex", "age", "body", "goal", "place", "diet", "goal-weight", "motivation"] as const;
const SCREEN_ORDER = [
  "splash",
  "units",
  "sex",
  "age",
  "body",
  "goal",
  "place",
  "diet",
  "goal-weight",
  "projection",
  "motivation",
  "generating",
  "reveal",
] as const;

function formStepIndexFor(screen: (typeof SCREEN_ORDER)[number]) {
  return FORM_SCREENS.indexOf(screen as (typeof FORM_SCREENS)[number]);
}

export default function OnboardingPage() {
  const router = useRouter();
  const { completeOnboarding, firebaseRemoteLoaded, hydrated, signInFirebase, state } =
    useDietFit();

  const [screenIdx, setScreenIdx] = useState(0);
  const [googleLoadingIntent, setGoogleLoadingIntent] = useState<
    "new" | "existing" | "apple" | null
  >(null);
  // iOS app only, decided after mount so server and client render match.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    setAppleAvailable(canSignInWithApple());
  }, []);
  const [authStatus, setAuthStatus] = useState("");

  const [name, setName] = useState("");
  const [wUnit, setWUnit] = useState<"kg" | "lb">("kg");
  const [hUnit, setHUnit] = useState<"cm" | "ft">("cm");
  const [sex, setSex] = useState<SexKey | null>(null);
  const [age, setAge] = useState(28);
  const [heightCm, setHeightCm] = useState(170);
  const [weightKg, setWeightKg] = useState(72);
  const [goal, setGoal] = useState<GoalKey | null>(null);
  const [place, setPlace] = useState<PlaceKey | null>(null);
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference | null>(null);
  const [goalWeightKg, setGoalWeightKg] = useState(68);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hasSetGoalWeightDefault, setHasSetGoalWeightDefault] = useState(false);

  const screen = SCREEN_ORDER[screenIdx];

  function goNext() {
    setScreenIdx((value) => Math.min(value + 1, SCREEN_ORDER.length - 1));
  }
  function goBack() {
    setScreenIdx((value) => Math.max(value - 1, 0));
  }

  async function handleGetStarted() {
    setAuthStatus("");

    if (!hasFirebaseEnv()) {
      goNext();
      return;
    }

    const auth = createFirebaseAuth();

    if (!auth) {
      goNext();
      return;
    }

    setGoogleLoadingIntent("new");
    try {
      const result = nativeBridge.isNative
        ? await signInWithGoogleNative(auth)
        : await signInWithPopup(auth, createGoogleAuthProvider());
      setName(getGoogleProfileName(result.user.displayName, result.user.email));
      signInFirebase(result.user.email);
      goNext();
    } catch (signInError) {
      const code = getFirebaseErrorCode(signInError);
      if (code === "cancelled") return;
      if (!nativeBridge.isNative && code === "auth/popup-blocked") {
        setAuthStatus("Opening Google sign-in...");
        await signInWithRedirect(auth, createGoogleAuthProvider());
        return;
      }

      setAuthStatus(
        signInError instanceof Error
          ? signInError.message
          : "Google sign-in could not be completed.",
      );
    } finally {
      setGoogleLoadingIntent(null);
    }
  }

  // Works for new and returning users alike: a returning user's saved plan
  // loads after sign-in and the effect below moves them on to the app.
  async function handleAppleSignIn() {
    setAuthStatus("");
    const auth = hasFirebaseEnv() ? createFirebaseAuth() : null;
    if (!auth) {
      goNext();
      return;
    }

    setGoogleLoadingIntent("apple");
    try {
      const result = await signInWithAppleNative(auth);
      setName(getGoogleProfileName(result.user.displayName, result.user.email));
      signInFirebase(result.user.email);
      goNext();
    } catch (signInError) {
      if (getFirebaseErrorCode(signInError) === "cancelled") return;
      setAuthStatus(
        signInError instanceof Error
          ? signInError.message
          : "Sign in with Apple could not be completed.",
      );
    } finally {
      setGoogleLoadingIntent(null);
    }
  }

  async function handleSignInExisting() {
    setAuthStatus("");

    if (!hasFirebaseEnv()) {
      router.push("/sign-in");
      return;
    }

    const auth = createFirebaseAuth();

    if (!auth) {
      router.push("/sign-in");
      return;
    }

    setGoogleLoadingIntent("existing");
    try {
      const result = nativeBridge.isNative
        ? await signInWithGoogleNative(auth)
        : await signInWithPopup(auth, createGoogleAuthProvider());
      signInFirebase(result.user.email);
      router.push("/workout");
    } catch (signInError) {
      const code = getFirebaseErrorCode(signInError);
      if (code === "cancelled") return;
      if (!nativeBridge.isNative && code === "auth/popup-blocked") {
        setAuthStatus("Opening Google sign-in...");
        await signInWithRedirect(auth, createGoogleAuthProvider());
        return;
      }

      setAuthStatus(
        signInError instanceof Error
          ? signInError.message
          : "Google sign-in could not be completed.",
      );
    } finally {
      setGoogleLoadingIntent(null);
    }
  }

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    // A returning Firebase user reaches this page before syncFirebaseState has
    // merged their remote doc; the local snapshot still reports
    // onboardingCompleted=false and would keep them stuck here. Wait for the
    // fetch to settle before deciding whether to bounce them onward. The
    // effect keeps firing on later state changes -- if the merged remote
    // eventually flips onboardingCompleted to true, the redirect below fires
    // then, without a one-shot ref locking the check in prematurely on the
    // "no user yet" auth firing.
    // A device that already holds a finished profile can move on right away.
    if (
      state.authMode === "firebase" &&
      state.userEmail &&
      !firebaseRemoteLoaded &&
      !(state.onboardingCompleted && state.paywallCompleted)
    ) {
      return;
    }

    if (state.onboardingCompleted) {
      router.replace(state.paywallCompleted ? "/workout" : "/paywall");
    }
  }, [firebaseRemoteLoaded, hydrated, router, state.authMode, state.onboardingCompleted, state.paywallCompleted, state.userEmail]);

  // Keep goal weight in a sane default relative to current weight until the user touches it.
  useEffect(() => {
    if (!hasSetGoalWeightDefault && goal) {
      const delta = goal === "lose" ? -5 : goal === "gain" ? 4 : 0;
      setGoalWeightKg(Math.max(30, weightKg + delta));
      setHasSetGoalWeightDefault(true);
    }
  }, [goal, hasSetGoalWeightDefault, weightKg]);

  function buildOnboardingInput(): OnboardingInput {
    const resolvedGoal = goal ?? "lose";
    const resolvedPlace = place ?? "home";
    const primaryGoal = GOAL_TO_PRIMARY[resolvedGoal];
    const workoutEnvironment = PLACE_TO_ENVIRONMENT[resolvedPlace];
    const resolvedDietaryPreference = dietaryPreference ?? "non-vegetarian";
    const diffKg = Math.abs(weightKg - goalWeightKg);
    const weeks = Math.max(1, Math.round(diffKg / 0.6));
    const goalDurationMonths = Math.max(0.5, Math.round((weeks / 4.345) * 10) / 10);
    const preferredWorkoutDays = GOAL_TO_WORKOUT_DAYS[resolvedGoal];

    return {
      name: name || "Fitmonk User",
      age,
      sex: SEX_TO_PROFILE[sex ?? "other"],
      heightCm: Math.round(heightCm),
      weightKg: Math.round(weightKg * 10) / 10,
      goalTargetKg: Math.round(diffKg * 10) / 10,
      goalDurationMonths,
      motivationAnchor: anchor ?? undefined,
      exerciseFrequency: `${preferredWorkoutDays} days / week`,
      fitnessExperience: "beginner",
      commitmentLevel: "steady",
      primaryGoal,
      secondaryFocus: "General consistency",
      workoutEnvironment,
      preferredWorkoutDays,
      preferredWorkoutTime: "Evening",
      equipmentAccess: workoutEnvironment === "home" ? ["Yoga mat"] : ["Dumbbells", "Barbell"],
      injuries: [],
      dietaryPreference: resolvedDietaryPreference,
      foodFlags: getFoodFlagsForDietaryPreference(resolvedDietaryPreference),
      allergies: [],
      dislikedFoods: [],
    };
  }

  if (!hydrated) {
    return <AppLoader />;
  }

  // A returning Firebase user on a device with no local state yet reaches
  // the splash before onAuthStateChanged has flipped authMode to
  // "firebase" and before the Firestore fetch merged their completed
  // profile in. Hold the loader until the remote gate settles so the
  // splash screen doesn't flash for a frame while the redirect to
  // /workout is being decided.
  if (
    !firebaseRemoteLoaded &&
    !state.onboardingCompleted &&
    screen === "splash"
  ) {
    return <AppLoader message="Welcome back" />;
  }

  // A returning user whose profile just arrived is on the way to the app;
  // greet them while the workout screen loads instead of a blank page.
  if (state.onboardingCompleted && screen === "splash") {
    return <AppLoader message="Welcome back" />;
  }

  if (screen === "splash") {
    return (
      <Screen theme="dark">
        <ScreenBody center className="pt-10">
          <ScreenGrow />
          <Image
            src="/fitmonk-logo.png"
            alt="Fitmonk"
            width={300}
            height={114}
            className="fm-rise block h-auto w-[78%] max-w-[300px] rounded-[12px]"
            priority
          />
          <div className="h-4" />
          <h1 className="fm-title fm-title--big fm-rise" style={{ animationDelay: "60ms" }}>
            Your road to
            <br />
            fitness starts here
          </h1>
          <p className="fm-sub fm-rise text-center" style={{ animationDelay: "120ms" }}>
            Your personal coach builds a plan around your body, your goals and your schedule.
          </p>
          <ScreenGrow />
        </ScreenBody>
        <ScreenFooter>
          {appleAvailable ? (
            <Btn
              variant="brand"
              onClick={handleAppleSignIn}
              disabled={googleLoadingIntent !== null}
              icon={googleLoadingIntent === "apple" ? <LoaderCircle className="fm-spin" /> : undefined}
            >
              {googleLoadingIntent === "apple" ? "Opening Apple..." : "Continue with Apple"}
            </Btn>
          ) : null}
          <Btn
            variant="brand"
            onClick={handleGetStarted}
            disabled={googleLoadingIntent !== null}
            icon={googleLoadingIntent === "new" ? <LoaderCircle className="fm-spin" /> : undefined}
          >
            {googleLoadingIntent === "new" ? "Opening Google..." : "Get started"}
          </Btn>
          <Btn
            variant="ghost"
            onClick={handleSignInExisting}
            disabled={googleLoadingIntent !== null}
            icon={googleLoadingIntent === "existing" ? <LoaderCircle className="fm-spin" /> : undefined}
          >
            {googleLoadingIntent === "existing" ? "Opening Google..." : "I already have an account"}
          </Btn>
          {authStatus ? (
            <p className="fm-sub text-center">
              {authStatus}
            </p>
          ) : null}
        </ScreenFooter>
      </Screen>
    );
  }

  if (screen === "units") {
    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">First, your units</h1>
        <p className="fm-sub">We&apos;ll show weights and heights the way you like them. Change anytime in settings.</p>
        <div className="fm-spacer-md" />
        <Label>Weight</Label>
        <Seg
          value={wUnit}
          onChange={setWUnit}
          options={[
            { v: "kg", label: "Kilograms (kg)" },
            { v: "lb", label: "Pounds (lb)" },
          ]}
        />
        <div className="fm-spacer-sm" />
        <Label>Height</Label>
        <Seg
          value={hUnit}
          onChange={setHUnit}
          options={[
            { v: "cm", label: "Centimetres" },
            { v: "ft", label: "Feet / inches" },
          ]}
        />
        <Foot onNext={goNext} />
      </Frame>
    );
  }

  if (screen === "sex") {
    const options: { v: SexKey; t: string; ic: React.ReactNode }[] = [
      { v: "female", t: "Female", ic: <UserRound /> },
      { v: "male", t: "Male", ic: <PersonStanding /> },
      { v: "other", t: "Other / prefer not to say", ic: <CircleUser /> },
    ];

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">What&apos;s your gender?</h1>
        <p className="fm-sub">This sets your calorie and training targets, since the math differs by physiology.</p>
        <div className="fm-spacer-md" />
        <div className="fm-tiles">
          {options.map((option) => (
            <Tile
              key={option.v}
              icon={option.ic}
              title={option.t}
              selected={sex === option.v}
              onClick={() => setSex(option.v)}
            />
          ))}
        </div>
        <Foot onNext={goNext} disabled={!sex} />
      </Frame>
    );
  }

  if (screen === "age") {
    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">How old are you?</h1>
        <p className="fm-sub">Age affects your metabolism and recovery needs.</p>
        <ScreenGrow />
        <ScrollPicker value={age} min={14} max={90} unit="yrs" onChange={setAge} />
        <ScreenGrow />
        <Foot onNext={goNext} />
      </Frame>
    );
  }

  if (screen === "body") {
    const heightDisplay = hUnit === "cm" ? Math.round(heightCm) : Math.round(cmToIn(heightCm));
    const weightDisplay = wUnit === "kg" ? Math.round(weightKg) : Math.round(kgToLb(weightKg));

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">Your height &amp; weight</h1>
        <p className="fm-sub">We use these for your BMI, daily energy needs and starting point.</p>
        <ScreenGrow />
        <Label center>Height</Label>
        <ScrollPicker
          value={heightDisplay}
          min={hUnit === "cm" ? 120 : Math.round(cmToIn(120))}
          max={hUnit === "cm" ? 230 : Math.round(cmToIn(230))}
          unit={hUnit === "cm" ? "cm" : "in"}
          onChange={(v) => setHeightCm(hUnit === "cm" ? v : inToCm(v))}
          // Imperial reads more naturally as feet'inches" than a raw inch count.
          formatValue={
            hUnit === "ft"
              ? (inches) => (
                  <>
                    {Math.floor(inches / 12)}
                    <small>&apos;</small>
                    {inches % 12}
                    <small>&quot;</small>
                  </>
                )
              : undefined
          }
          ariaLabel={
            hUnit === "ft"
              ? `Set height, ${Math.floor(heightDisplay / 12)} feet ${heightDisplay % 12} inches`
              : undefined
          }
        />
        <div className="fm-spacer-md" />
        <Label center>Current weight</Label>
        <ScrollPicker
          value={weightDisplay}
          min={wUnit === "kg" ? 35 : Math.round(kgToLb(35))}
          max={wUnit === "kg" ? 180 : Math.round(kgToLb(180))}
          unit={wUnit}
          onChange={(v) => setWeightKg(wUnit === "kg" ? v : lbToKg(v))}
        />
        <ScreenGrow />
        <Foot onNext={goNext} />
      </Frame>
    );
  }

  if (screen === "goal") {
    // Show the figure set that matches the gender picked on the sex screen;
    // "other" / unset falls back to the default set.
    const figSuffix = sex === "female" ? "-female" : "";
    const options: { v: GoalKey; t: string; d: string; img: string; ic: React.ReactNode }[] = [
      { v: "lose", t: "Lose weight", d: "Burn fat, keep your strength", img: `/onboarding/goal-lose${figSuffix}.png`, ic: <TrendingDown /> },
      { v: "gain", t: "Build muscle", d: "Add lean mass and power", img: `/onboarding/goal-gain${figSuffix}.png`, ic: <Dumbbell /> },
      { v: "keep", t: "Stay fit", d: "Maintain and feel your best", img: `/onboarding/goal-keep${figSuffix}.png`, ic: <HeartPulse /> },
    ];

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <p className="fm-eyebrow">Your goal</p>
        <h1 className="fm-title">What do you want to achieve?</h1>
        <p className="fm-sub">Pick the outcome you&apos;re after. It shapes your whole plan.</p>
        <div className="fm-spacer-md" />
        <div className="fm-goalfigs">
          {options.map((option) => (
            <button
              key={option.v}
              type="button"
              className={`fm-goalfig${goal === option.v ? " is-selected" : ""}`}
              onClick={() => {
                setGoal(option.v);
                setHasSetGoalWeightDefault(false);
              }}
            >
              <span className="fm-goalfig__img">
                <Image
                  src={option.img}
                  alt={option.t}
                  fill
                  sizes="(max-width: 440px) 33vw, 140px"
                  style={{ objectFit: "cover", objectPosition: "top center" }}
                />
              </span>
              <span className="fm-goalfig__label">{option.t}</span>
              {goal === option.v ? (
                <span className="fm-goalfig__check" aria-hidden="true">
                  <Check />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Foot onNext={goNext} disabled={!goal} />
      </Frame>
    );
  }

  if (screen === "place") {
    const options: { v: PlaceKey; t: string; d: string; img: string }[] = [
      { v: "gym", t: "At the gym", d: "Machine & free-weight plans", img: "/onboarding/place-gym.png" },
      { v: "home", t: "At home", d: "Equipment-free home sessions", img: "/onboarding/place-home.png" },
    ];

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">Where will you train?</h1>
        <p className="fm-sub">This shapes your whole plan. You can switch anytime.</p>
        <div className="fm-spacer-md" />
        <div className="fm-placecards">
          {options.map((option) => (
            <button
              key={option.v}
              type="button"
              className={`fm-placecard${place === option.v ? " is-selected" : ""}`}
              onClick={() => setPlace(option.v)}
            >
              <span className="fm-placecard__img">
                <Image
                  src={option.img}
                  alt={option.t}
                  fill
                  sizes="(max-width: 440px) 50vw, 210px"
                  style={{ objectFit: "cover", objectPosition: "center" }}
                />
              </span>
              <span className="fm-placecard__label">
                <span className="fm-placecard__t">{option.t}</span>
                <span className="fm-placecard__d">{option.d}</span>
              </span>
              {place === option.v ? (
                <span className="fm-goalfig__check" aria-hidden="true">
                  <Check />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Foot onNext={goNext} disabled={!place} />
      </Frame>
    );
  }

  if (screen === "diet") {
    const options: { v: DietaryPreference; t: string; d: string; img: string; ic: React.ReactNode }[] = [
      { v: "vegetarian", t: "Vegetarian", d: "No meat or fish; dairy is fine", img: "/onboarding/diet-vegetarian.png", ic: <Salad /> },
      { v: "eggetarian", t: "Eggetarian", d: "Vegetarian plus eggs", img: "/onboarding/diet-eggetarian.png", ic: <Egg /> },
      { v: "non-vegetarian", t: "Non-vegetarian", d: "Meat, fish, eggs and dairy", img: "/onboarding/diet-non-vegetarian.png", ic: <Drumstick /> },
      { v: "vegan", t: "Vegan", d: "No animal products at all", img: "/onboarding/diet-vegan.png", ic: <Sprout /> },
    ];

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">How do you eat?</h1>
        <p className="fm-sub">Your meal plan and coach suggestions are built around this.</p>
        <div className="fm-spacer-md" />
        <div className="fm-placecards">
          {options.map((option) => (
            <button
              key={option.v}
              type="button"
              className={`fm-placecard fm-placecard--diet${dietaryPreference === option.v ? " is-selected" : ""}`}
              onClick={() => setDietaryPreference(option.v)}
            >
              <span className="fm-placecard__img">
                <Image
                  src={option.img}
                  alt={option.t}
                  fill
                  sizes="(max-width: 440px) 50vw, 210px"
                  style={{ objectFit: "cover", objectPosition: "center" }}
                />
              </span>
              <span className="fm-placecard__label">
                <span className="fm-placecard__t">{option.t}</span>
                <span className="fm-placecard__d">{option.d}</span>
              </span>
              {dietaryPreference === option.v ? (
                <span className="fm-goalfig__check" aria-hidden="true">
                  <Check />
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Foot onNext={goNext} disabled={!dietaryPreference} />
      </Frame>
    );
  }

  if (screen === "goal-weight") {
    const target = wUnit === "kg" ? Math.round(goalWeightKg) : Math.round(kgToLb(goalWeightKg));
    const diff = weightKg - goalWeightKg;
    const verb = diff > 0 ? "lose" : diff < 0 ? "gain" : "maintain";
    const weeks = Math.max(1, Math.round(Math.abs(diff) / 0.6));
    const date = new Date(Date.now() + weeks * 7 * 864e5).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    const diffDisplay = wUnit === "kg" ? Math.round(Math.abs(diff)) : Math.round(kgToLb(Math.abs(diff)));
    const currentDisplay = wUnit === "kg" ? Math.round(weightKg) : Math.round(kgToLb(weightKg));
    const perWeek = weeks > 0 ? (diffDisplay / weeks).toFixed(1) : "0";
    const isMaintain = verb === "maintain";
    const DirectionIcon = verb === "lose" ? TrendingDown : verb === "gain" ? TrendingUp : Minus;

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">Set your goal weight</h1>
        <p className="fm-sub">A steady pace is the sweet spot for lasting results.</p>
        <ScreenGrow />
        <ScrollPicker
          value={target}
          min={wUnit === "kg" ? 30 : Math.round(kgToLb(30))}
          max={wUnit === "kg" ? 180 : Math.round(kgToLb(180))}
          unit={wUnit}
          onChange={(v) => setGoalWeightKg(wUnit === "kg" ? v : lbToKg(v))}
        />
        <div className="fm-spacer-md" />
        <div className="fm-journey">
          <div className="fm-journey__node">
            <span className="fm-journey__k">Now</span>
            <span className="fm-journey__v">
              {currentDisplay}
              <span className="fm-journey__u"> {wUnit}</span>
            </span>
          </div>
          <div className="fm-journey__arrow">{isMaintain ? <Minus /> : <ArrowRight />}</div>
          <div className="fm-journey__node fm-journey__node--goal">
            <span className="fm-journey__k">Goal</span>
            <span className="fm-journey__v">
              {target}
              <span className="fm-journey__u"> {wUnit}</span>
            </span>
          </div>
        </div>
        <div className="fm-spacer-sm" />
        <div className="fm-projcard">
          <span className="fm-projcard__icon">
            <DirectionIcon />
          </span>
          <div className="fm-projcard__body">
            <div className="fm-projcard__label">{isMaintain ? "Holding steady" : `Projected to ${verb}`}</div>
            <div className="fm-projcard__big">
              {isMaintain ? (
                "Maintain"
              ) : (
                <>
                  {diffDisplay}
                  <small> {wUnit}</small>
                </>
              )}
            </div>
            <div className="fm-projcard__by">
              {isMaintain
                ? "Keeping your current weight"
                : `by ${date}  ·  ~${perWeek} ${wUnit}/week`}
            </div>
          </div>
        </div>
        <ScreenGrow />
        <Foot onNext={goNext} />
      </Frame>
    );
  }

  if (screen === "projection") {
    const diff = weightKg - goalWeightKg;
    const verb = diff > 0 ? "lost" : diff < 0 ? "gained" : "maintained";
    const weeks = Math.max(2, Math.round(Math.abs(diff) / 0.6));
    const target = new Date(Date.now() + weeks * 7 * 864e5);
    const dateShort = target.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const S = wUnit === "kg" ? weightKg : kgToLb(weightKg);
    const E = wUnit === "kg" ? goalWeightKg : kgToLb(goalWeightKg);
    const diffDisplay = Math.round(Math.abs(S - E));
    // Direction picks the before/after pair; gender picks the figures.
    // "maintain" falls back to the single-hero treatment.
    const sexKey: "female" | "male" = sex === "female" ? "female" : "male";
    const dir: "lose" | "gain" | null = diff > 0 ? "lose" : diff < 0 ? "gain" : null;

    return (
      <Screen theme="dark">
        <ScreenBody className="pt-7">
          <p className="fm-eyebrow fm-rise">Your projection</p>
          <h1 className="fm-title fm-title--big fm-rise" style={{ animationDelay: "60ms" }}>
            {dir ? (
              <>
                On track to hit
                <br />
                <span style={{ color: "var(--mint-400)" }}>
                  {Math.round(E)} {wUnit}
                </span>{" "}
                by {dateShort}
              </>
            ) : (
              <>
                Holding steady at
                <br />
                <span style={{ color: "var(--mint-400)" }}>
                  {Math.round(E)} {wUnit}
                </span>
              </>
            )}
          </h1>
          <p className="fm-sub fm-rise" style={{ animationDelay: "120ms" }}>
            {dir
              ? `That's ${diffDisplay} ${wUnit} ${verb} in about ${weeks} weeks, a steady and sustainable pace.`
              : "You'll build strength and stamina while your weight stays right where you want it."}
          </p>
          <div className="fm-spacer-md" />
          {dir ? (
            <div className="fm-transform fm-rise" style={{ animationDelay: "160ms" }}>
              <div className="fm-transform__card fm-transform__card--before">
                <span className="fm-transform__tag">Now</span>
                <Image
                  src={`/onboarding/proj-${dir}-before-${sexKey}.png`}
                  alt="Your current build"
                  width={300}
                  height={450}
                  className="fm-transform__img"
                />
              </div>
              <div className="fm-transform__arrow" aria-hidden="true">
                <ArrowRight />
              </div>
              <div className="fm-transform__card fm-transform__card--after">
                <span className="fm-transform__tag fm-transform__tag--after">Goal</span>
                <Image
                  src={`/onboarding/proj-${dir}-after-${sexKey}.png`}
                  alt="Your future build"
                  width={300}
                  height={450}
                  className="fm-transform__img"
                />
              </div>
            </div>
          ) : (
            <div className="fm-projfig fm-rise" style={{ animationDelay: "160ms" }}>
              <span className="fm-projfig__tag">Stay strong</span>
              <Image
                src={sex === "female" ? "/onboarding/proj-female.png" : "/onboarding/proj-male.png"}
                alt="Your strongest self"
                width={280}
                height={400}
                className="fm-projfig__img"
              />
            </div>
          )}
        </ScreenBody>
        <ScreenFooter>
          <Btn variant="brand" onClick={goNext} icon={<Check />}>
            Let&apos;s do it
          </Btn>
        </ScreenFooter>
      </Screen>
    );
  }

  if (screen === "motivation") {
    const options: { v: string; t: string; ic: React.ReactNode }[] = [
      { v: "wedding", t: "A wedding", ic: <Heart /> },
      { v: "trip", t: "A trip / holiday", ic: <Plane /> },
      { v: "reunion", t: "A reunion", ic: <Users /> },
      { v: "summer", t: "Summer body", ic: <Sun /> },
      { v: "health", t: "Long-term health", ic: <HeartPulse /> },
      { v: "none", t: "No specific event", ic: <InfinityIcon /> },
    ];

    return (
      <Frame step={formStepIndexFor(screen)} total={FORM_SCREENS.length} onBack={goBack}>
        <h1 className="fm-title">Working toward something?</h1>
        <p className="fm-sub">People with a visible aim hit goals faster. Pick what drives you.</p>
        <div className="fm-spacer-md" />
        <div className="fm-tiles fm-tiles--grid" style={{ gap: 12 }}>
          {options.map((option) => (
            <Tile
              key={option.v}
              stack
              icon={option.ic}
              title={option.t}
              selected={anchor === option.v}
              onClick={() => setAnchor(option.v)}
            />
          ))}
        </div>
        <Foot onNext={goNext} disabled={!anchor} label="Build my plan" />
      </Frame>
    );
  }

  if (screen === "generating") {
    return <GeneratingScreen onComplete={goNext} buildInput={buildOnboardingInput} completeOnboarding={completeOnboarding} />;
  }

  // screen === "reveal"
  const profile = state.profile;
  const nutritionTargets = state.nutritionTargets;
  const workoutPlan = state.workoutPlan;

  if (!profile || !nutritionTargets || !workoutPlan) {
    return <AppLoader />;
  }

  const bmi = (profile.weightKg / Math.pow(profile.heightCm / 100, 2)).toFixed(1);
  const bmiNum = Number(bmi);
  const bmiDesc = bmiNum < 18.5 ? "Below range" : bmiNum < 25 ? "Healthy range" : bmiNum < 30 ? "Above range" : "High range";
  const bmiGood = bmiNum >= 18.5 && bmiNum < 25;
  const trainingDays = workoutPlan.dailySessions.filter((session) => !session.isRestDay).length;
  // goalTargetKg is the delta the user wants to move by (kg to lose or gain),
  // not an absolute goal weight — see getCycleTargetWeightKg in goal-cycle.ts
  // for the same semantics. The blueprint used to treat it as absolute and
  // ended up showing wildly wrong "kg to go" numbers (e.g. 38 for a 9 kg gain).
  const toGoKg = Math.round(profile.goalTargetKg ?? 0);

  return (
    <Screen theme="light">
      <ScreenBody className="pt-4">
        <div className="fm-revealfig fm-rise">
          <Image
            src="/onboarding/reveal.png"
            alt="You've got this"
            width={300}
            height={446}
            className="fm-revealfig__img"
            priority
          />
        </div>
        <div className="fm-rise" style={{ display: "flex", alignItems: "center", gap: 12, animationDelay: "60ms" }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: "var(--mint-100)",
              color: "var(--mint-600)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <Check />
          </span>
          <p className="fm-eyebrow" style={{ margin: 0 }}>
            Your plan is ready
          </p>
        </div>
        <h1 className="fm-title fm-title--big fm-rise">Here&apos;s your starting blueprint</h1>
        <div className="fm-bplist fm-rise" style={{ animationDelay: "120ms" }}>
          <div className="fm-bprow">
            <span className="fm-bprow__ic"><Scale /></span>
            <span className="fm-bprow__mid">
              <span className="fm-bprow__k">Body mass index</span>
              <span className={`fm-bprow__d${bmiGood ? " is-good" : ""}`}>{bmiDesc}</span>
            </span>
            <span className="fm-bprow__v">{bmi}</span>
          </div>
          <div className="fm-bprow">
            <span className="fm-bprow__ic"><Flame /></span>
            <span className="fm-bprow__mid">
              <span className="fm-bprow__k">Daily energy goal</span>
              <span className="fm-bprow__d">calories per day</span>
            </span>
            <span className="fm-bprow__v">
              {nutritionTargets.calories}
              <small> kcal</small>
            </span>
          </div>
          <div className="fm-bprow">
            <span className="fm-bprow__ic"><Dumbbell /></span>
            <span className="fm-bprow__mid">
              <span className="fm-bprow__k">Training days</span>
              <span className="fm-bprow__d">sessions a week</span>
            </span>
            <span className="fm-bprow__v">
              {trainingDays}
              <small>/week</small>
            </span>
          </div>
          <div className="fm-bprow fm-bprow--accent">
            <span className="fm-bprow__ic"><Target /></span>
            <span className="fm-bprow__mid">
              <span className="fm-bprow__k">Target weight</span>
              <span className="fm-bprow__d">{toGoKg > 0 ? "to reach your goal" : "you're at your goal"}</span>
            </span>
            <span className="fm-bprow__v">
              {toGoKg}
              <small> kg to go</small>
            </span>
          </div>
        </div>
      </ScreenBody>
      <ScreenFooter>
        <Btn variant="primary" onClick={() => router.push("/paywall")} icon={<TrendingDown style={{ transform: "rotate(-90deg)" }} />}>
          Unlock my plan
        </Btn>
      </ScreenFooter>
    </Screen>
  );
}

function GeneratingScreen({
  onComplete,
  buildInput,
  completeOnboarding,
}: {
  onComplete: () => void;
  buildInput: () => OnboardingInput;
  completeOnboarding: (input: OnboardingInput) => void;
}) {
  const steps = [
    "Analysing your body profile",
    "Calculating energy targets",
    "Designing your training split",
    "Tuning your nutrition",
  ];
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (done === 0) {
      const input = buildInput();
      const parsed = onboardingSchema.safeParse(input);

      if (parsed.success) {
        completeOnboarding(parsed.data);
      }
    }

    if (done >= steps.length) {
      const timeout = setTimeout(onComplete, 650);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => setDone(done + 1), 750);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <Screen theme="dark">
      <ScreenBody center>
        <ScreenGrow />
        <div className="text-mint-400">
          <LoaderCircle className="fm-spin" style={{ width: 44, height: 44 }} />
        </div>
        <div className="h-4" />
        <h1 className="fm-title fm-title--big text-center">
          Building your
          <br />
          Fitmonk plan
        </h1>
        <div className="h-4" />
        <div className="fm-loadlist self-stretch">
          {steps.map((label, index) => (
            <div key={label} className={`fm-loaditem${index < done ? " is-done" : ""}`}>
              <span className="fm-loaditem__dot">{index < done ? <Check /> : null}</span>
              {label}
            </div>
          ))}
        </div>
        <ScreenGrow />
      </ScreenBody>
    </Screen>
  );
}
