/**
 * Capture the paywall upgrade views at 393x852 (iPhone 14 Pro) at 2x DPR,
 * one file per upgrade feature. Reuses the local dev server on :4000 and the
 * system Chrome.
 *
 * Run
 *   node --experimental-strip-types scripts/capture-paywall.mts
 *   # or filter to one feature:
 *   PAYWALL_ONLY=home-workouts node --experimental-strip-types scripts/capture-paywall.mts
 *
 * Outputs
 *   play-store/screenshots/paywall-<feature>.png
 */
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE_URL = process.env.PAYWALL_BASE_URL ?? "http://localhost:4000";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR = path.resolve(process.cwd(), "play-store", "screenshots");
const ONLY = process.env.PAYWALL_ONLY ?? null;

const SEED = {
  onboardingCompleted: true,
  paywallCompleted: true,
  subscriptionTier: "starter",
  profile: { workoutEnvironment: "home" },
};

type Target = {
  feature: string;
  returnTo: string;
  outFile: string;
};

const TARGETS: Target[] = [
  { feature: "diet-plan", returnTo: "/diet", outFile: "07-paywall-diet-plan.png" },
  { feature: "home-workouts", returnTo: "/workout", outFile: "08-paywall-home-workouts.png" },
  { feature: "adaptive-coach", returnTo: "/workout", outFile: "09-paywall-adaptive-coach.png" },
  { feature: "trainer-call", returnTo: "/coach-on-demand", outFile: "10-paywall-trainer-call.png" },
];

async function captureOne(page: import("puppeteer-core").Page, t: Target) {
  const url = `${BASE_URL}/paywall?upgrade=1&feature=${t.feature}&return=${encodeURIComponent(t.returnTo)}`;
  await page.goto(url, { waitUntil: "networkidle0" });
  // Hide the Next dev indicator so it isn't baked into the marketing capture.
  await page.addStyleTag({
    content:
      "nextjs-portal, [data-nextjs-dev-tools-button], [data-nextjs-toast] { display: none !important; }",
  });
  // Wait for the hero image, if any, to resolve before snapping.
  const hero = await page.$("img[alt]");
  if (hero) {
    await page.evaluate(
      (img) =>
        new Promise<void>((resolve) => {
          if ((img as HTMLImageElement).complete) return resolve();
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
      hero,
    );
  }
  await new Promise((r) => setTimeout(r, 300));
  const outPath = path.join(OUT_DIR, t.outFile);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`wrote ${outPath}`);
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    defaultViewport: { width: 393, height: 852, deviceScaleFactor: 2 },
  });
  try {
    const page = await browser.newPage();
    // Seed localStorage once on the dev origin.
    await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate((seed) => {
      const existing = JSON.parse(localStorage.getItem("dietfit-state") || "{}");
      localStorage.setItem(
        "dietfit-state",
        JSON.stringify({
          ...existing,
          ...seed,
          profile: { ...(existing.profile || {}), ...seed.profile },
        }),
      );
    }, SEED);

    for (const t of TARGETS) {
      if (ONLY && ONLY !== t.feature) continue;
      await captureOne(page, t);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
