/**
 * App Store screenshots (iPhone 6.7"/6.9" display, 1290x2796) of the main
 * app surfaces, rendered the way the iOS app shows them.
 *
 * Prereqs: the app running locally (`npm run build && npm start`, port 4000)
 * and Chrome or Edge installed (CHROME_PATH overrides the path).
 *
 * Run: npx tsx scripts/capture-app-store-screenshots.mts
 * Out: play-store/../app-store/screenshots/<nn>-<slug>.png
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { createMealLog, onboardingToPlan } from "../src/lib/recommendations";
import { parseMealText } from "../src/lib/meal-parser";
import type { MealType, OnboardingInput } from "../src/lib/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "..", "app-store", "screenshots");
const BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:4000";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => existsSync(p));

// The iOS shell's user agent, so the page renders in its in-app mode.
const IOS_APP_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FitmonkShell/1.0 FitmonkPlatform/ios";

function makeSeed(tier: "starter" | "pro" | "elite") {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);

  const plan = onboardingToPlan({
    name: "Aarav",
    email: "aarav@example.com",
    weightKg: 78,
    heightCm: 176,
    age: 29,
    sex: "male",
    primaryGoal: "build-muscle",
    goalTargetKg: 4,
    goalDurationMonths: 3,
    fitnessExperience: "intermediate",
    commitmentLevel: "committed",
    workoutEnvironment: "gym",
    exerciseFrequency: "4 days / week",
    preferredWorkoutDays: 4,
    preferredWorkoutTime: "Morning",
    equipmentAccess: ["Dumbbells", "Barbell"],
    secondaryFocus: "General consistency",
    injuries: [],
    dietaryPreference: "non-vegetarian",
    foodFlags: { eatsMeat: true, eatsDairy: true, eatsEggs: true },
    allergies: [],
    dislikedFoods: [],
  } as unknown as OnboardingInput);

  const workoutLog = (n: number) => ({
    id: `w${n}`,
    sessionId: `w${n}`,
    sessionDate: iso(daysAgo(n)),
    exercisesCompleted: [],
    completedSession: true,
    effort: "steady",
    notes: "",
  });

  // Today's meals, parsed by the app's own deterministic parser.
  const meal = (rawText: string, mealType: MealType, hour: number) => {
    const parsed = parseMealText(rawText, mealType);
    const at = new Date(today);
    at.setHours(hour, 15, 0, 0);
    return {
      ...createMealLog({
        rawText,
        mealType,
        parsedItems: parsed.parsedItems,
        estimatedNutrition: parsed.estimatedNutrition,
        confidence: parsed.confidence,
        coachTip: parsed.coachTip,
      }),
      id: `${mealType}-${hour}`,
      loggedAt: at.toISOString(),
    };
  };
  const mealLogs = [
    meal("2 eggs, 2 roti and a glass of milk", "breakfast", 8),
    meal("1 bowl rice, dal and chicken curry", "lunch", 13),
    meal("1 banana and a handful of almonds", "snack", 17),
  ];

  return {
    achievements: [],
    coachIntroSeen: true,
    authMode: "demo",
    challengeEnrollments: [{ challengeId: "protein-72", enrolledOn: iso(daysAgo(6)), progress: 5, completed: false }],
    coachNote: plan.coachNote,
    coachThreads: [
      {
        id: "t1",
        title: "Protein on busy days",
        createdLabel: "Today",
        messages: [
          { id: "u1", role: "user", text: "How do I hit 140 g protein on a busy office day?" },
          {
            id: "a1",
            role: "assistant",
            text:
              "Anchor every meal on protein: eggs or paneer bhurji at breakfast, dal + chicken or rajma at lunch, Greek curd as a snack, and fish or tofu at dinner. A whey scoop closes any gap.",
          },
        ],
      },
    ],
    goalReviews: [],
    mealLogs,
    mealSuggestions: plan.mealSuggestions,
    onboardingCompleted: true,
    paywallCompleted: true,
    points: 1180,
    streak: 12,
    subscriptionTier: tier,
    userEmail: "aarav@example.com",
    waterLogs: Array.from({ length: 12 }, (_, n) => ({ date: iso(daysAgo(n)), amountMl: n === 0 ? 1500 : 2500 })),
    workoutLoadLogs: [],
    workoutLogs: Array.from({ length: 12 }, (_, n) => workoutLog(n + 1)),
    workoutPlan: plan.workoutPlan,
    nutritionTargets: plan.nutritionTargets,
    progression: { history: [], lastAppliedWeekStart: null },
    readinessLogs: [],
    profile: { ...plan.profile, appStartedAt: iso(daysAgo(21)) },
  };
}

type Shot = { slug: string; route: string; tier?: "starter" | "pro" | "elite"; waitMs?: number; keepOverlay?: boolean };
const SHOTS: Shot[] = [
  { slug: "workout", route: "/workout" },
  { slug: "diet", route: "/diet" },
  { slug: "coach", route: "/ai-chat" },
  { slug: "challenges", route: "/challenges" },
  { slug: "streak", route: "/workout", keepOverlay: true },
  { slug: "profile", route: "/profile" },
  { slug: "paywall", route: "/paywall?upgrade=1&feature=diet-plan&return=/diet", tier: "starter" },
];

async function main() {
  if (!CHROME_PATH) throw new Error("Chrome/Edge not found; set CHROME_PATH");
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  });
  try {
    for (const [i, shot] of SHOTS.entries()) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      await page.setUserAgent(IOS_APP_UA);
      await page.evaluateOnNewDocument(
        (state) => {
          window.localStorage.setItem("dietfit-state", JSON.stringify(state));
          window.localStorage.setItem("fitmonk.aiConsent.v1", "granted");
        },
        makeSeed(shot.tier ?? "elite"),
      );
      await page.goto(`${BASE_URL}${shot.route}`, { waitUntil: "networkidle2", timeout: 60_000 });
      await page
        .waitForFunction(() => !document.body.innerText.includes("Loading Fitmonk"), { timeout: 15_000 })
        .catch(() => null);
      await new Promise((r) => setTimeout(r, shot.waitMs ?? 1500));
      if (!shot.keepOverlay) {
        // Close celebration overlays (streak milestones, etc.) the way a user
        // would, so the screen underneath is what gets captured.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const closed = await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label]")).find(
              (b) => /close|dismiss/i.test(b.getAttribute("aria-label") ?? "") && b.closest('[class*="fixed"]'),
            );
            btn?.click();
            return Boolean(btn);
          });
          if (!closed) break;
          await new Promise((r) => setTimeout(r, 900));
        }
      }
      const file = path.join(OUT_DIR, `${String(i + 1).padStart(2, "0")}-${shot.slug}.png`);
      await page.screenshot({ path: file, type: "png" });
      console.log(`saved ${path.relative(process.cwd(), file)}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
