import { getOpenAiCoachModel } from "@/lib/env";
import { getWeightDeltaKg } from "@/lib/goal-cycle";
import { getNutritionForDate, getTodaysSession } from "@/lib/recommendations";
import {
  getAdaptedWorkoutSession,
  getReadinessAdjustment,
  getReadinessForDate,
} from "@/lib/readiness";
import { isProTier, startOfTodayIso } from "@/lib/utils";
import type { DietFitState } from "@/lib/types";

type CoachMediaInput = {
  name: string;
  type: "image" | "video";
  url: string;
};

type CoachChatMessageInput = {
  role: "user" | "assistant";
  text: string;
};

export type CoachAnswerInput = {
  question: string;
  includeContext?: boolean;
  media?: CoachMediaInput | null;
  previousMessages?: CoachChatMessageInput[];
  state: DietFitState;
};

function getOutputText(responseJson: unknown) {
  if (
    typeof responseJson === "object" &&
    responseJson !== null &&
    "output_text" in responseJson &&
    typeof responseJson.output_text === "string"
  ) {
    return responseJson.output_text;
  }

  if (
    typeof responseJson !== "object" ||
    responseJson === null ||
    !("output" in responseJson) ||
    !Array.isArray(responseJson.output)
  ) {
    return null;
  }

  for (const outputItem of responseJson.output) {
    if (
      typeof outputItem === "object" &&
      outputItem !== null &&
      "content" in outputItem &&
      Array.isArray(outputItem.content)
    ) {
      for (const contentItem of outputItem.content) {
        if (
          typeof contentItem === "object" &&
          contentItem !== null &&
          "text" in contentItem &&
          typeof contentItem.text === "string"
        ) {
          return contentItem.text;
        }
      }
    }
  }

  return null;
}

function round(value: number | undefined) {
  return Math.round(value ?? 0);
}

export function buildCoachContext(state: DietFitState) {
  const profile = state.profile;
  const targets = state.nutritionTargets;
  const todayIso = startOfTodayIso();
  const todayNutrition = getNutritionForDate(state.mealLogs, todayIso);
  const todaySession = getTodaysSession(state.workoutPlan);
  const todayReadiness = getReadinessForDate(state.readinessLogs, todayIso);
  const readinessAdjustment = todayReadiness
    ? getReadinessAdjustment(todayReadiness)
    : null;
  const adaptedTodaySession = getAdaptedWorkoutSession({
    environment: state.profile?.workoutEnvironment,
    readinessLog: todayReadiness,
    session: todaySession,
    subscriptionTier: state.subscriptionTier,
  });
  const recentMeals = state.mealLogs.slice(0, 6).map((meal) => ({
    text: meal.rawText,
    mealType: meal.mealType,
    calories: round(meal.estimatedNutrition.calories),
    proteinG: round(meal.estimatedNutrition.proteinG),
    carbsG: round(meal.estimatedNutrition.carbsG),
    fatsG: round(meal.estimatedNutrition.fatsG),
  }));
  const recentWorkouts = state.workoutLogs.slice(0, 6).map((log) => ({
    date: log.sessionDate,
    sessionId: log.sessionId,
    completed: log.completedSession,
    effort: log.effort,
    notes: log.notes,
  }));
  // The wrap-up tells the user their coach will lead with whatever they said
  // was hardest. That promise is only kept if the answer reaches the coach.
  const lastReview = (state.goalReviews ?? [])[0] ?? null;

  return {
    profile: profile
      ? {
          name: profile.name,
          age: profile.age,
          sex: profile.sex,
          heightCm: profile.heightCm,
          weightKg: profile.weightKg,
          primaryGoal: profile.primaryGoal,
          secondaryFocus: profile.secondaryFocus,
          fitnessExperience: profile.fitnessExperience,
          commitmentLevel: profile.commitmentLevel,
          workoutEnvironment: profile.workoutEnvironment,
          preferredWorkoutDays: profile.preferredWorkoutDays,
          preferredWorkoutTime: profile.preferredWorkoutTime,
          equipmentAccess: profile.equipmentAccess,
          injuries: profile.injuries,
          // Undefined means the user was never asked, which the coach treats as a
          // prompt to ask rather than as permission to assume.
          dietaryPreference: profile.dietaryPreference,
          foodFlags: profile.foodFlags,
          allergies: profile.allergies,
          dislikedFoods: profile.dislikedFoods,
        }
      : null,
    subscriptionTier: state.subscriptionTier,
    nutritionTargets: targets
      ? {
          calories: round(targets.calories),
          proteinG: round(targets.proteinG),
          carbsG: round(targets.carbsG),
          fatsG: round(targets.fatsG),
          keyMicros: targets.keyMicros.map((micro) => ({
            name: micro.name,
            target: micro.target,
            unit: micro.unit,
          })),
        }
      : null,
    todayNutrition: {
      calories: round(todayNutrition.calories),
      proteinG: round(todayNutrition.proteinG),
      carbsG: round(todayNutrition.carbsG),
      fatsG: round(todayNutrition.fatsG),
    },
    todaySession: todaySession
      ? {
          title: todaySession.title,
          focus: todaySession.focus,
          durationMin: todaySession.durationMin,
          note: todaySession.note,
          exercises: todaySession.exercises.map((exercise) => ({
            name: exercise.name,
            type: exercise.type,
            reps: exercise.reps,
            guidance: exercise.guidance,
            equipment: exercise.equipment,
          })),
        }
      : null,
    adaptedTodaySession:
      isProTier(state.subscriptionTier) && adaptedTodaySession
        ? {
            title: adaptedTodaySession.title,
            focus: adaptedTodaySession.focus,
            durationMin: adaptedTodaySession.durationMin,
            note: adaptedTodaySession.note,
            isAdaptedForReadiness: adaptedTodaySession.isAdaptedForReadiness,
            adjustment: adaptedTodaySession.readinessAdjustment,
            exercises: adaptedTodaySession.exercises.map((exercise) => ({
              name: exercise.name,
              type: exercise.type,
              reps: exercise.reps,
              guidance: exercise.guidance,
              equipment: exercise.equipment,
            })),
          }
        : null,
    todayReadiness: todayReadiness
      ? {
          sleepHours: todayReadiness.sleepHours,
          energyLevel: todayReadiness.energyLevel,
          muscleSoreness: todayReadiness.muscleSoreness,
          stressLevel: todayReadiness.stressLevel,
          adjustment: readinessAdjustment,
        }
      : null,
    lastGoalCycle: lastReview
      ? {
          endedOn: lastReview.cycleEndedOn,
          totalDays: lastReview.totalDays,
          primaryGoal: lastReview.primaryGoal,
          startWeightKg: lastReview.startWeightKg,
          // null means they skipped the weigh-in, not that nothing changed.
          endWeightKg: lastReview.endWeightKg,
          weightChangeKg: getWeightDeltaKg(lastReview),
          activeDays: lastReview.stats.activeDays,
          workoutsCompleted: lastReview.stats.workoutsCompleted,
          adherencePercent: lastReview.stats.adherencePercent,
          hardestPart: lastReview.hardestPart,
          satisfaction: lastReview.satisfaction,
          userNote: lastReview.note || null,
          stoppedReason: lastReview.stoppedReason,
          wasEngaged: lastReview.wasEngaged,
        }
      : null,
    streak: state.streak,
    points: state.points,
    coachNote: state.coachNote,
    recentMeals,
    recentWorkouts,
    mealSuggestions: state.mealSuggestions.slice(0, 5).map((meal) => ({
      title: meal.title,
      description: meal.description,
      proteinG: meal.proteinG,
      calories: meal.calories,
      tags: meal.tags,
    })),
  };
}

function buildSystemPrompt() {
  return [
    "You are Fitmonk Coach, a friendly, motivating fitness, nutrition, and health assistant inside a consumer fitness app.",
    "Use the user's profile, nutrition targets, workouts, meal logs, and recent chat flow to answer like a human coach who remembers context.",
    "If subscriptionTier is starter, mention adaptive workout changes as a Pro/Elite feature when useful. If subscriptionTier is pro or elite and adaptedTodaySession is present, use the adapted workout instead of the base session.",
    "If the user attached an image, actually inspect it and use what is visible. Be honest about uncertainty.",
    "For meal photos: identify likely visible foods, estimate portions conservatively, connect the advice to protein/calorie goals, and ask for missing portion details if needed.",
    "For body-part images or pain/injury concerns: do not diagnose. Mention urgent red flags clearly, advise medical care for severe/worsening symptoms, and ask concise follow-up questions before giving firm training guidance.",
    "For exercise form images: give practical cues and safety checks, but do not overclaim if a single image is not enough.",
    "For video attachments, explain that the current Coach can use the user's text and saved data, but needs a clear screenshot/key frame or description to inspect movement visually.",
    "Keep the tone warm, friendly, and motivating. Prefer short paragraphs. Ask cross-questions when more info is needed before concrete advice.",
    "Do not expose raw internal context like 'I am using your profile'. Use that data silently unless a short summary helps the user.",
    "Write the way a person talks. Plain sentences and short paragraphs only. Never use markdown: no asterisks, no bold or italic markers, no headings, no bullet or numbered lists, no tables. If you need to walk through several items, say them in flowing prose or across short paragraphs instead of formatting them as a list. Do not label things like 'Description:' or 'Protein:' as if filling in a form. Never use em dashes; use a comma, a period, or a new sentence instead.",
    "If profile.dietaryPreference is missing, the user has never told us how they eat. Before giving any meal, recipe, or food suggestion, ask whether they are vegetarian, eggetarian, non-vegetarian, or vegan, and wait for the answer. Never assume they eat meat.",
    "When profile.dietaryPreference is present, respect it strictly and silently: never suggest meat or fish to a vegetarian or eggetarian, never suggest eggs to a vegetarian, and never suggest any animal product, dairy included, to a vegan.",
    "You are in an ongoing conversation. Read the earlier turns before answering and reply to what the user actually just said. If they answered a question you asked, engage with their answer specifically: tell them what it means for their goals and what you would change. Never re-ask something they already answered.",
    "Never repeat a suggestion you already gave in this conversation. If earlier advice still stands, say so briefly and build on it rather than listing it again. Repeating yourself makes the coach feel broken.",
    "lastGoalCycle, when present, is how the user's previous plan actually went plus what they told us when it ended. Treat hardestPart as the thing to lead with: if it is diet, put food first in your advice and keep meal changes small and specific; if it is motivation, check in on how they are feeling and make the next step smaller; if it is workouts or time, acknowledge that their plan was already lightened for this cycle. Use stoppedReason and userNote the same way. Bring this up naturally when it is relevant, never as a recap of their stats, and never more than once unless they raise it.",
    "mealSuggestions in the context is a small catalog you may draw from, not a script. Do not recite it. Prefer concrete advice shaped by what the user just told you, and only mention a catalog item when it genuinely answers their question.",
  ].join(" ");
}

export async function answerCoachQuestionWithAi(input: CoachAnswerInput) {
  // Earlier turns used to ride along inside the JSON payload as a "previousMessages"
  // field, which the model treated as inert data rather than a conversation: it would
  // answer the opening question again instead of responding to what the user had just
  // said. Real user/assistant turns carry the conversation properly.
  const historyTurns = (input.previousMessages ?? []).slice(-8).map((message) => ({
    role: message.role,
    content: [
      message.role === "assistant"
        ? { type: "output_text", text: message.text }
        : { type: "input_text", text: message.text },
    ],
  }));

  const content: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text: JSON.stringify({
        question: input.question,
        includeFirstUseContext: Boolean(input.includeContext),
        media: input.media
          ? {
              name: input.media.name,
              type: input.media.type,
              note:
                input.media.type === "video"
                  ? "Video was attached, but no video frames are sent for visual analysis."
                  : "Image is attached below for visual analysis.",
            }
          : null,
        userData: buildCoachContext(input.state),
      }),
    },
  ];

  if (input.media?.type === "image") {
    content.push({
      type: "input_image",
      image_url: input.media.url,
      detail: "auto",
    });
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAiCoachModel(),
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildSystemPrompt(),
            },
          ],
        },
        ...historyTurns,
        {
          role: "user",
          content,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI coach answer failed with status ${response.status}.`);
  }

  const responseJson = (await response.json()) as unknown;
  const outputText = getOutputText(responseJson);

  if (!outputText) {
    throw new Error("OpenAI coach answer returned no text.");
  }

  return removeEmDashes(outputText).trim();
}

/**
 * The prompt asks for no em dashes, but models still slip them in, and they
 * make replies read as machine-written. Swaps each one (and a spaced en dash
 * used the same way) for a comma. Number ranges like "3–5" are left alone.
 */
export function removeEmDashes(text: string) {
  return text
    .replace(/[ \t]*—[ \t]*/g, ", ")
    .replace(/[ \t]+–[ \t]+/g, ", ")
    .replace(/,\s*([,.!?;:])/g, "$1")
    .replace(/^,\s*/gm, "")
    .replace(/,[ \t]*$/gm, ",");
}
