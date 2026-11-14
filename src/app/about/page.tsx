import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Dumbbell, Salad, Sparkles } from "lucide-react";

export const metadata = {
  title: "Fitmonk | Your fitness plan, made for you",
  description:
    "Two-minute setup. One app for workouts, meals, and a coach that adapts as you log. Built around your body, your schedule, your goal.",
};

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Features />
      <Showcase />
      <Cta />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="bg-teal-950 text-sand-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2" aria-label="Fitmonk home">
          <Image
            src="/fitmonk-logo.png"
            alt="Fitmonk"
            width={140}
            height={54}
            priority
            className="h-8 w-auto"
          />
        </Link>
        <Link
          href="/sign-in"
          className="font-display text-body-s font-semibold text-mint-300 hover:text-mint-200 transition"
        >
          Sign in
        </Link>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-24 pt-12 sm:px-10 sm:pt-20">
        <p className="font-display text-overline uppercase tracking-[0.14em] text-mint-300">
          Coach + diet + workout in one
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-[40px] font-extrabold leading-[1.04] tracking-tight text-balance sm:text-[56px]">
          Your fitness plan,
          <br className="hidden sm:block" /> made for you.
        </h1>
        <p className="mt-6 max-w-xl text-body-l text-sand-100/78">
          Two-minute setup. One app for workouts, meals, and a coach that adapts as you log. Built around your body,
          your schedule, and the goal you actually care about.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-pill bg-mint-500 px-7 py-3.5 font-display text-body-l font-bold text-ink-900 shadow-brand transition hover:bg-mint-400"
          >
            Start your plan
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
          </Link>
          <Link
            href="/sign-in"
            className="font-display text-body-m font-semibold text-sand-100/70 hover:text-sand-100 transition"
          >
            I already have an account
          </Link>
        </div>
        <p className="mt-6 text-body-s text-sand-100/56">
          Free to start · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    {
      icon: Sparkles,
      title: "Built around you",
      body: "Ten questions and Fitmonk maps a workout split, macro targets, and daily calories to your body, your goal, and how many days you can actually train.",
    },
    {
      icon: Salad,
      title: "Meals and workouts, one place",
      body: "Log a meal in seconds, watch your macros land, follow today's session with video demos. No spreadsheet, no second app.",
    },
    {
      icon: Dumbbell,
      title: "A coach that keeps up",
      body: "Miss a workout, hit a plateau, change your goal. Your plan reshapes as you log, so tomorrow always makes sense.",
    },
  ];

  return (
    <section className="bg-sand-100 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-10">
        <div className="max-w-2xl">
          <p className="font-display text-overline uppercase tracking-[0.14em] text-mint-600">
            What&apos;s inside
          </p>
          <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.08] tracking-tight text-ink-900 text-balance sm:text-[40px]">
            Everything the plan needs. Nothing else.
          </h2>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-hero border border-sand-300/60 bg-white p-8 shadow-card"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-pill bg-mint-100 text-mint-600">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <h3 className="mt-6 font-display text-title-l font-bold text-ink-900">{title}</h3>
              <p className="mt-3 text-body-m text-ink-700">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section className="bg-teal-950 text-sand-100 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 sm:px-10 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <p className="font-display text-overline uppercase tracking-[0.14em] text-mint-300">
            The reveal
          </p>
          <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.08] tracking-tight text-balance sm:text-[40px]">
            Two minutes to your starting blueprint.
          </h2>
          <p className="mt-6 max-w-lg text-body-l text-sand-100/78">
            Ten quick questions and Fitmonk shows the exact plan built for you: daily calories, training split, and
            the version of you it&apos;s aiming at.
          </p>
          <ul className="mt-8 space-y-4 text-body-m text-sand-100/82">
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-mint-400" />
              BMI, energy needs, and starting point set the ground truth.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-mint-400" />
              A training week matched to how many days you can commit.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-mint-400" />
              A target weight and honest pace. No crash diets, no magic.
            </li>
          </ul>
        </div>

        <div className="relative flex items-center justify-center">
          <div className="absolute inset-x-8 top-1/2 -z-0 h-64 -translate-y-1/2 rounded-full bg-mint-400/20 blur-3xl" />
          <div className="relative rounded-hero border border-sand-100/12 bg-teal-900/40 p-4 shadow-hero">
            <Image
              src="/onboarding/reveal.png"
              alt="Your Fitmonk plan revealed"
              width={520}
              height={780}
              className="w-full max-w-[440px] rounded-card"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="bg-sand-100 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-6 text-center sm:px-10">
        <p className="font-display text-overline uppercase tracking-[0.14em] text-mint-600">
          Ready when you are
        </p>
        <h2 className="mt-3 font-display text-[32px] font-extrabold leading-[1.08] tracking-tight text-ink-900 text-balance sm:text-[44px]">
          Your road to fitness starts here.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-body-l text-ink-700">
          Answer ten questions. Get a plan tuned to your body and your schedule. Change it any time you like.
        </p>
        <div className="mt-10 flex justify-center">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-pill bg-mint-500 px-8 py-4 font-display text-body-l font-bold text-ink-900 shadow-brand transition hover:bg-mint-400"
          >
            Start your plan
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-teal-950 text-sand-100/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="flex items-center gap-3">
          <Image
            src="/fitmonk-logo.png"
            alt="Fitmonk"
            width={110}
            height={40}
            className="h-7 w-auto opacity-90"
          />
          <span className="text-body-s">© {new Date().getFullYear()} Fitmonk</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-7 gap-y-2 text-body-s">
          <Link href="/privacy" className="hover:text-sand-100 transition">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-sand-100 transition">
            Terms
          </Link>
          <a
            href="mailto:hello@fitmonk.online"
            className="hover:text-sand-100 transition"
          >
            hello@fitmonk.online
          </a>
        </nav>
      </div>
    </footer>
  );
}
