# Fitmonk

Fitmonk is a mobile-first `Next.js + Tailwind` fitness MVP focused on three things:

- personalized onboarding
- daily workout guidance and logging
- calorie, macro, and micronutrient-aware meal tracking

The app is designed to feel useful immediately in local demo mode, with Firebase-ready Google sign-in for live users.

## Features

- Multi-step onboarding that captures goals, experience, workout setup, injuries, and food preferences
- Daily readiness check-in for sleep, energy, soreness, and stress before workout guidance
- Rules-based workout plan generation for home or gym users
- Calorie and macro target calculation from body metrics and goals
- Text-first, India-aware meal logging with deterministic parsing
- `Today`, `Workout`, `Diet`, and `Profile` app sections
- Lightweight streaks, points, and achievements
- Firebase-ready Google sign-in

## Run locally

```bash
npm install
npm run catalog:build
npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

## Live Firebase Setup

Use Firebase for the current live Google sign-in flow. Add these environment variables to `.env.local` and to the live deployment environment:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

Daily readiness logs are saved inside the existing Firestore user state document, so no Firestore schema migration is required.

Without Firebase configured, the app still works in local demo mode and persists data in browser storage.

## Tests

```bash
npm run catalog:build
npm run test
```

## Food catalog dataset

The nutrition catalog now uses `data/food-catalog.csv` as the source of truth and generates
`src/lib/generated/food-catalog-data.ts` for the app runtime.

- Each CSV row represents one portion for one canonical food id.
- Repeated `id` rows are grouped into a single food with multiple portions.
- Pipe-separated fields are supported for `aliases`, `tags`, and `portion_aliases`.

Columns:

```text
id,name,aliases,source,reference_url,tags,calories_per100g,protein_g_per100g,carbs_g_per100g,fats_g_per100g,fiber_g_per100g,calcium_mg_per100g,iron_mg_per100g,vitamin_b12_mcg_per100g,portion_label,portion_quantity,portion_unit,portion_grams,portion_aliases
```

Rebuild the runtime catalog after editing the CSV:

```bash
npm run catalog:build
```
