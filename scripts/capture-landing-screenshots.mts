/**
 * Captures mobile-viewport screenshots of the ten feature surfaces used on the
 * public landing page (src/app/page.tsx).
 *
 * Prereqs
 *   - `npm run dev` running on http://localhost:4000
 *   - System Chrome at the usual macOS path (see CHROME_PATH below)
 *
 * Run
 *   node scripts/capture-landing-screenshots.mts
 *
 * Outputs
 *   public/landing/<slug>.png (375x812 device pixels, 2x DPR for crispness)
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { onboardingToPlan } from "../src/lib/recommendations";
import type { OnboardingInput } from "../src/lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "public", "landing");
const BASE_URL = process.env.LANDING_BASE_URL ?? "http://localhost:4000";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// A single self-contained snapshot of the app state that makes every page
// render with real-looking content — a completed goal cycle in progress, a
// day's worth of meals, an active streak, an Elite subscription.
function makeSeed() {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const startDay = new Date(today.getTime() - 21 * 86_400_000);
  const yesterday = new Date(today.getTime() - 86_400_000);
  const twoDaysAgo = new Date(today.getTime() - 2 * 86_400_000);

  // Re-use the app's own onboarding pipeline so the profile / plan / nutrition
  // targets are all valid — the same shape a real user would generate after
  // completing the wizard. Anything hand-rolled here would drift.
  const onboardingInput = {
    name: "Alex Kim",
    email: "alex@fitmonk.online",
    weightKg: 78,
    heightCm: 178,
    age: 29,
    sex: "male",
    primaryGoal: "build-muscle",
    goalTargetKg: 82,
    goalDurationMonths: 3,
    activityLevel: "moderate",
    fitnessExperience: "intermediate",
    commitmentLevel: "committed",
    workoutEnvironment: "gym",
    exerciseFrequency: "4-5 days",
    preferredWorkoutDays: 4,
    preferredWorkoutTime: "morning",
    equipmentAccess: [],
    secondaryFocus: "chest",
    injuries: [],
    dietaryPreference: "non-vegetarian",
    foodFlags: { vegetarianOk: false, veganOk: false, eggetarianOk: true },
    allergies: [],
    dislikedFoods: [],
  } as unknown as OnboardingInput;

  const plan = onboardingToPlan(onboardingInput);

  return {
    achievements: [],
    authMode: "demo",
    challengeEnrollments: [
      {
        challengeId: "protein-72",
        enrolledOn: iso(startDay),
        progress: 5,
        completed: false,
      },
    ],
    coachNote: plan.coachNote,
    coachThreads: [
      {
        id: "t1",
        title: "Protein on veg days",
        createdAt: today.toISOString(),
        messages: [
          {
            id: "m-user-1",
            role: "user",
            content: "How do I hit 160g protein on vegetarian days?",
            createdAt: today.toISOString(),
          },
          {
            id: "m-asst-1",
            role: "assistant",
            content:
              "Anchor each meal on a high-protein base — paneer, tofu, dal, curd — and use a scoop of whey for the gap.",
            createdAt: today.toISOString(),
          },
        ],
      },
    ],
    goalReviews: [],
    mealLogs: [],
    mealSuggestions: plan.mealSuggestions,
    onboardingCompleted: true,
    paywallCompleted: true,
    points: 1180,
    streak: 12,
    subscriptionTier: "elite",
    userEmail: "alex@fitmonk.online",
    waterLogs: [],
    workoutLoadLogs: [],
    workoutLogs: [
      {
        id: "w1",
        sessionId: "w1",
        sessionDate: iso(twoDaysAgo),
        exercisesCompleted: [],
        completedSession: true,
        effort: "steady",
        notes: "",
      },
      {
        id: "w2",
        sessionId: "w2",
        sessionDate: iso(yesterday),
        exercisesCompleted: [],
        completedSession: true,
        effort: "steady",
        notes: "",
      },
    ],
    workoutPlan: plan.workoutPlan,
    workoutPreferences: {
      customGymWorkoutsByDate: {},
      draftGymRoutinesByDate: {},
      homeSessionMinutesByDate: {},
      savedCustomRoutines: [],
      savedGymRoutineNamesByFocus: {},
      savedGymRoutinesByFocus: {},
      selectedCustomRoutineByDate: {},
      selectedMuscleFocusByDate: {},
    },
    nutritionTargets: plan.nutritionTargets,
    progression: { history: [], lastAppliedWeekStart: null },
    readinessLogs: [],
    profile: {
      ...plan.profile,
      appStartedAt: iso(startDay),
    },
  };
}

type Shot = {
  slug: string;
  route: string;
  waitFor?: string; // CSS selector to wait for before shooting
  waitMs?: number;
};

// Ten shots, one per feature we highlight on the landing page. Order matches
// the FEATURES array in src/app/page.tsx so it's easy to keep in sync.
const SHOTS: Shot[] = [
  { slug: "onboarding", route: "/onboarding", waitMs: 900 },
  { slug: "workout-home", route: "/workout", waitMs: 900 },
  { slug: "muscle-coverage", route: "/workout", waitMs: 1200 }, // same page, scroll happens below
  { slug: "diet-log", route: "/diet", waitMs: 900 },
  { slug: "ai-diet-plan", route: "/diet", waitMs: 1200 }, // scrolled
  { slug: "coach-chat", route: "/ai-chat", waitMs: 900 },
  { slug: "challenges", route: "/challenges", waitMs: 900 },
  { slug: "profile", route: "/profile", waitMs: 900 },
  { slug: "trainer-call", route: "/coach-on-demand", waitMs: 900 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 375, height: 812, deviceScaleFactor: 2 },
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );

    const seed = makeSeed();

    // Onboarding shot needs an EMPTY state so /onboarding doesn't redirect
    // to /workout for a completed user. Everything else needs the seed set
    // BEFORE any client script runs — otherwise the app-shell layout gate
    // reads empty state on first hydration and redirects to /onboarding
    // before we can populate localStorage.
    let seedRegistered = false;

    for (const shot of SHOTS) {
      if (shot.slug !== "onboarding" && !seedRegistered) {
        await page.evaluateOnNewDocument((data) => {
          window.localStorage.setItem("dietfit-state", JSON.stringify(data));
        }, seed);
        seedRegistered = true;
      }
      const url = `${BASE_URL}${shot.route}`;
      console.log(`→ ${shot.slug} (${url})`);
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });

      // Wait until the shell has actually replaced its "Loading Fitmonk…"
      // placeholder with real content. If the fallback text is gone we know
      // hydration ran and the layout gate let us through.
      await page
        .waitForFunction(
          () => !document.body.innerText.includes("Loading Fitmonk"),
          { timeout: 10_000 },
        )
        .catch(() => null);

      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 15_000 }).catch(() => null);
      }
      if (shot.waitMs) {
        await new Promise((r) => setTimeout(r, shot.waitMs));
      }

      // Muscle coverage lives collapsed inside the workout page. Click the
      // pill to expand the drawer with the semantic-body visualisation.
      if (shot.slug === "muscle-coverage") {
        await page
          .evaluate(() => {
            const btn = Array.from(document.querySelectorAll("button")).find(
              (b) => b.textContent?.includes("Muscle coverage"),
            ) as HTMLButtonElement | undefined;
            btn?.click();
          })
          .catch(() => null);
        await new Promise((r) => setTimeout(r, 700));
        // Now scroll to the coverage panel so it fills the frame.
        await page
          .evaluate(() => {
            const el = Array.from(document.querySelectorAll("*")).find((e) =>
              e.textContent?.trim().startsWith("Muscle coverage"),
            );
            (el as HTMLElement | undefined)?.scrollIntoView({ block: "start" });
            window.scrollBy(0, -20);
          })
          .catch(() => null);
        await new Promise((r) => setTimeout(r, 300));
      }
      if (shot.slug === "ai-diet-plan") {
        // Open the "Plan" drawer for the AI diet plan takeover.
        await page
          .evaluate(() => {
            const btn = Array.from(document.querySelectorAll("button, a")).find((b) =>
              b.textContent?.trim().startsWith("Plan"),
            ) as HTMLElement | undefined;
            btn?.click();
          })
          .catch(() => null);
        await new Promise((r) => setTimeout(r, 700));
      }

      const out = path.join(OUT_DIR, `${shot.slug}.png`);
      await page.screenshot({ path: out as `${string}.png`, type: "png" });
      console.log(`   saved ${path.relative(process.cwd(), out)}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
