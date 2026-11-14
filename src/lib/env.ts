export function hasFirebaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  );
}

export function hasOpenAiMealEnv() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function hasOpenAiCoachEnv() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getOpenAiMealModel() {
  return process.env.OPENAI_MEAL_MODEL || "gpt-4o-mini";
}

export function getOpenAiCoachModel() {
  return process.env.OPENAI_COACH_MODEL || process.env.OPENAI_MEAL_MODEL || "gpt-4o-mini";
}
