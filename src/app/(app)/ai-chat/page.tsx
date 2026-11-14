"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  Dumbbell,
  HeartPulse,
  ImagePlus,
  MessageCircle,
  Mic,
  Pencil,
  Plus,
  Salad,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { CoachIntro } from "@/components/coach/coach-intro";
import { VoiceErrorNote } from "@/components/ui/voice-error-note";
import { ensureMicPermission, micBlockedMessage } from "@/lib/mic-permission";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { IconBadge } from "@/components/glass/icon-badge";
import { getNutritionForDate, getTodaysSession } from "@/lib/recommendations";
import { getAdaptedWorkoutSession, getReadinessForDate } from "@/lib/readiness";
import { cn, isProTier, startOfTodayIso } from "@/lib/utils";
import { aiFetch } from "@/lib/ai-consent";
import { useKeyboardInset } from "@/lib/use-keyboard-inset";
import type {
  CoachChatMessage,
  CoachChatThread,
  CoachMediaAttachment,
  DietFitState,
  MealLog,
  NutritionSummary,
  UserProfile,
} from "@/lib/types";

// Sit at one line while the user is reading and grow with what they type, up to a
// cap, the way native iOS composers behave.
const COMPOSER_MAX_HEIGHT = 128;

function autoSizeComposer(element: HTMLTextAreaElement | null) {
  if (!element) {
    return;
  }

  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
}

// The prompt asks for plain prose, but models still slip into markdown. Nothing
// renders it, so "**Protein**" would reach the user as literal asterisks.
function stripMarkdown(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(?!\s)([^*\n]+?)\*(?=\s|[.,!?;:]|$)/g, "$1$2")
    .replace(/(^|\n)\s*#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1");
}

// These now live in lib/types so the persisted store can hold them.
type ChatMessage = CoachChatMessage;
type MediaAttachment = CoachMediaAttachment;
type ChatThread = CoachChatThread;

type SpeechRecognitionAlternative = { transcript: string };
type SpeechRecognitionResult = { isFinal: boolean; 0: SpeechRecognitionAlternative };
type SpeechRecognitionEvent = { resultIndex: number; results: ArrayLike<SpeechRecognitionResult> };
type SpeechRecognitionErrorEvent = { error: string };
type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

const suggestions = [
  {
    text: "What should I eat tonight to hit my protein goal?",
    topic: "Nutrition",
    Icon: Salad,
    color: "var(--brand)",
    tint: "rgba(55,201,166,0.12)",
  },
  {
    text: "Can you adjust today's workout for low energy?",
    topic: "Training",
    Icon: Dumbbell,
    color: "var(--primary)",
    tint: "rgba(21,133,122,0.10)",
  },
  {
    text: "I’m feeling severe pain in my calves after leg workout. What should I do?",
    topic: "Recovery",
    Icon: HeartPulse,
    color: "var(--accent)",
    tint: "rgba(242,132,58,0.12)",
  },
];

const goalLabels: Record<UserProfile["primaryGoal"], string> = {
  "lose-weight": "fat loss",
  maintain: "maintenance",
  "build-muscle": "muscle gain",
  "improve-endurance": "endurance",
  "target-body-area": "body recomposition",
  "competition-prep": "competition prep",
};

function formatMacroLine(nutrition: NutritionSummary) {
  return `${Math.round(nutrition.calories)} kcal, ${Math.round(nutrition.proteinG)}g protein, ${Math.round(nutrition.carbsG)}g carbs, ${Math.round(nutrition.fatsG)}g fats`;
}

function summarizeMeals(mealLogs: MealLog[]) {
  if (mealLogs.length === 0) {
    return "You have not logged meals yet, so keep the next step simple and log one normal meal before making big changes.";
  }

  const recentMeals = mealLogs
    .slice(0, 4)
    .map((meal) => meal.rawText)
    .join("; ");

  return `Recent meals I can see: ${recentMeals}.`;
}

function prepareCoachImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      const maxDimension = 1400;
      const scale = Math.min(1, maxDimension / image.width, maxDimension / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Couldn't prepare the image."));
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Couldn't read the image."));
    };

    image.src = objectUrl;
  });
}

function readMediaDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the media."));
    reader.readAsDataURL(file);
  });
}

// Coach mark: a voice waveform in the brand colours with the sparkle badge,
// so the coach reads as something you can talk to. The bars move while voice
// input is listening.
const COACH_MARK_BARS = [
  { height: 14, className: "bg-brand" },
  { height: 28, className: "bg-forest" },
  { height: 40, className: "bg-primary-strong" },
  { height: 24, className: "bg-forest" },
  { height: 12, className: "bg-accent" },
];

function CoachMark({ listening }: { listening: boolean }) {
  return (
    <div className="relative">
      <div className="glass flex h-24 w-24 items-center justify-center gap-[3px] rounded-full">
        {COACH_MARK_BARS.map((bar, index) => (
          <span
            key={bar.height + bar.className}
            className={cn("w-1 rounded-full", bar.className, listening && "coach-wave-bar")}
            style={{ height: bar.height, animationDelay: `${index * 120}ms` }}
          />
        ))}
      </div>
      <span className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[#07332C] shadow-[0_6px_14px_rgba(55,201,166,0.4)]">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function MediaPreview({
  media,
  compact = false,
}: {
  media: MediaAttachment;
  compact?: boolean;
}) {
  if (media.type === "video") {
    return (
      <video
        src={media.url}
        className={cn(
          "rounded-chip border border-black/8 object-cover",
          compact ? "h-14 w-16" : "mb-2 h-36 w-full",
        )}
        controls={!compact}
        muted={compact}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-chip border border-black/8 bg-cover bg-center",
        compact ? "h-14 w-16" : "mb-2 h-36 w-full",
      )}
      style={{ backgroundImage: `url(${media.url})` }}
      role="img"
      aria-label="Attached image"
    />
  );
}

function buildCoachAnswer(
  question: string,
  state: DietFitState,
  options: { includeContext?: boolean; previousMessages?: ChatMessage[] } = {},
) {
  const normalizedQuestion = question.toLowerCase();
  const previousMessages = options.previousMessages ?? [];
  const previousText = previousMessages
    .map((message) => `${message.role}: ${message.text}`)
    .join(" ")
    .toLowerCase();
  const lastAssistantText =
    [...previousMessages]
      .reverse()
      .find((message) => message.role === "assistant")
      ?.text.toLowerCase() ?? "";
  const profile = state.profile;
  const targets = state.nutritionTargets;
  const todayIso = startOfTodayIso();
  const todayNutrition = getNutritionForDate(state.mealLogs, todayIso);
  const baseTodaySession = getTodaysSession(state.workoutPlan);
  const todayReadiness = getReadinessForDate(state.readinessLogs, todayIso);
  const todaySession =
    getAdaptedWorkoutSession({
      environment: state.profile?.workoutEnvironment,
      readinessLog: todayReadiness,
      session: baseTodaySession,
      subscriptionTier: state.subscriptionTier,
    }) ?? baseTodaySession;
  const completedToday = state.workoutLogs.some(
    (log) => log.sessionDate === todayIso && log.completedSession,
  );
  const mentionsPain =
    normalizedQuestion.includes("pain") ||
    normalizedQuestion.includes("hurt") ||
    normalizedQuestion.includes("injury") ||
    normalizedQuestion.includes("sore") ||
    normalizedQuestion.includes("cramp") ||
    normalizedQuestion.includes("calf") ||
    normalizedQuestion.includes("calves");
  const mentionsSeverePain =
    normalizedQuestion.includes("severe") ||
    normalizedQuestion.includes("sharp") ||
    normalizedQuestion.includes("can't walk") ||
    normalizedQuestion.includes("cannot walk") ||
    normalizedQuestion.includes("unable to walk") ||
    normalizedQuestion.includes("swelling") ||
    normalizedQuestion.includes("red") ||
    normalizedQuestion.includes("warm") ||
    normalizedQuestion.includes("dark urine") ||
    normalizedQuestion.includes("numb");
  const mentionsCalvesAfterLegWorkout =
    (normalizedQuestion.includes("calf") || normalizedQuestion.includes("calves")) &&
    (normalizedQuestion.includes("leg") || normalizedQuestion.includes("workout"));
  const energyMatch = normalizedQuestion.match(/\b(10|[1-9])\b/);
  const energyLevel = energyMatch ? Number(energyMatch[1]) : null;
  const timeMatch = normalizedQuestion.match(
    /\b(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*(?:min|mins|minute|minutes)\b/,
  );
  const timeLabel = timeMatch
    ? timeMatch[2]
      ? `${timeMatch[1]}-${timeMatch[2]} minutes`
      : `${timeMatch[1]} minutes`
    : "20 minutes";
  const followsWorkoutClarifier =
    lastAssistantText.includes("energy level from 1-10") &&
    lastAssistantText.includes("how much time");
  const previousWorkoutIntent =
    previousText.includes("workout") ||
    previousText.includes("exercise") ||
    previousText.includes("routine") ||
    previousText.includes("low energy") ||
    previousText.includes("motivation");
  const followsMealClarifier =
    lastAssistantText.includes("food options") ||
    lastAssistantText.includes("light meal") ||
    lastAssistantText.includes("proper dinner");

  if (!profile || !targets) {
    return "Complete onboarding first so I can personalize answers around your goal, meals, training setup, injuries, and nutrition targets.";
  }

  const proteinGap = Math.max(0, targets.proteinG - todayNutrition.proteinG);
  const calorieGap = targets.calories - todayNutrition.calories;
  const goal = goalLabels[profile.primaryGoal];
  const dietaryLane = !profile.foodFlags.eatsMeat
    ? profile.foodFlags.eatsDairy
      ? "vegetarian"
      : "vegan"
    : "flexible";
  const injuryNote =
    profile.injuries.length > 0
      ? `Keep your ${profile.injuries.join(", ")} history in mind and avoid anything that creates sharp pain.`
      : "Keep reps controlled and stop if a movement causes sharp pain.";

  const personalContext = `I am using your ${goal} goal, ${profile.workoutEnvironment} training setup, ${profile.preferredWorkoutDays}-day workout rhythm, ${dietaryLane} food pattern, today's nutrition (${formatMacroLine(todayNutrition)}), and your ${state.streak}-day streak.`;
  const contextIntro = options.includeContext ? `${personalContext}\n\n` : "";
  const mediaQuestions =
    "Tell me what you want me to check in it: meal calories/protein, portion size, exercise form, posture, swelling, or pain location.";

  if (normalizedQuestion.includes("attached media")) {
    return `${contextIntro}Got the media. ${mediaQuestions}\n\nAlso tell me what happened and when it started. If this is a body-part photo or video with severe pain, swelling, redness, numbness, weakness, or trouble walking, please get medical help promptly.`;
  }

  if (mentionsCalvesAfterLegWorkout || (mentionsPain && mentionsSeverePain)) {
    return `Ouch, severe calf pain after leg day is something to take seriously. Do not train legs today, and do not try to push through it.\n\nFirst, check red flags. Please get medical help urgently if one calf is swollen, red, warm, very tender, or much bigger than the other; if you cannot walk or put weight on the leg; if the pain is sharp, constant, or worsening; if you have numbness, major weakness, fever, dark/brown urine, chest pain, shortness of breath, or dizziness.\n\nIf none of those are happening, treat it like a recovery day: light walking only, gentle ankle circles, rest, fluids/electrolytes, protein with your next meals, and sleep. You can use ice for pain early on or heat later if it feels stiff. Avoid hard stretching, deep massage, foam rolling, sprints, calf raises, or another leg workout until it clearly improves.\n\nTell me 3 things so I can guide you better: is it one calf or both, can you walk normally, and do you see swelling/redness/warmth? Good luck with recovery. Let's get you pain-free first, then ease back into legs safely.`;
  }

  if ((followsWorkoutClarifier || previousWorkoutIntent) && (energyLevel !== null || timeMatch)) {
    const mainMoves =
      todaySession?.exercises
        .filter((exercise) => exercise.type !== "warmup")
        .slice(0, 2)
        .map((exercise) => exercise.name) ?? [];
    const moveText =
      mainMoves.length > 0
        ? mainMoves.join(" + ")
        : "two easy strength moves from your plan";
    const intensity =
      energyLevel !== null && energyLevel <= 4
        ? "keep this as a low-intensity session"
        : "keep it steady, not all-out";

    return `Perfect, thanks. With ${energyLevel ?? "moderate"} energy and ${timeLabel}, ${intensity}.\n\nDo this:\n1. 3 minutes easy warm-up: marching, arm circles, hip hinges.\n2. 12-15 minutes main work: 2 relaxed rounds of ${moveText}. Stop 2-3 reps before failure.\n3. 4-5 minutes cooldown: slow walking and gentle mobility.\n\nSkip conditioning today. If anything hurts, stop that movement and switch to walking or mobility. Good luck with it. This is still a win because you are matching the workout to your real energy, not forcing a bad session.\n\nQuick check before you start: is anything hurting today, or is it only low energy?`;
  }

  if (
    normalizedQuestion.includes("protein") ||
    normalizedQuestion.includes("eat") ||
    normalizedQuestion.includes("meal") ||
    normalizedQuestion.includes("dinner") ||
    normalizedQuestion.includes("food")
  ) {
    const mealIdeas = !profile.foodFlags.eatsMeat
      ? profile.foodFlags.eatsDairy
        ? "paneer or tofu with roti/rice, dal with curd, or Greek yogurt with fruit"
        : "tofu, dal, chana, soy chunks, sprouts, or peanut curd bowls"
      : "eggs, chicken, fish, paneer, dal, Greek yogurt, or a whey shake if you use one";

    return `${contextIntro}Good luck with tonight's meal. Let's make it an easy protein win and keep this streak going.\n\nAim for roughly ${Math.round(Math.min(Math.max(proteinGap, 25), 45))}g protein. Good fits: ${mealIdeas}. ${calorieGap < 250 ? "Keep carbs and fats moderate because you are already close to today's calorie target." : "You still have room for a steady carb source, so add rice, roti, oats, potatoes, or fruit around training."}\n\n${summarizeMeals(state.mealLogs)} We need to hit your protein goal consistently this week, not perfectly in one meal.\n\nTell me what food options you have right now, how hungry you are, and whether you want a light meal or a proper dinner.`;
  }

  if (followsMealClarifier) {
    return `Nice, that helps. Based on what you shared, choose the option that gives you the easiest protein first, then add carbs only if you are still hungry or training later.\n\nA simple plate: one solid protein portion, one carb portion, and vegetables/fruit on the side. Keep oils, fried extras, and sweets light tonight so the meal supports your weekly protein target without overshooting calories.\n\nTell me the exact foods and rough portions you have, and I will turn it into one clean meal suggestion.`;
  }

  if (
    normalizedQuestion.includes("health") ||
    normalizedQuestion.includes("sick") ||
    normalizedQuestion.includes("sleep") ||
    mentionsPain
  ) {
    return `Let's keep today steady and kind to your body. If pain is sharp, severe, getting worse, stopping you from walking normally, or comes with swelling, redness, warmth, numbness, fever, chest pain, shortness of breath, or dark urine, please get medical help promptly.\n\nIf it feels like normal soreness, keep movement gentle, hydrate well, eat protein at each meal, and sleep properly tonight. ${injuryNote}\n\nTell me where exactly you feel it, how long it has been happening, and what makes it better or worse. Good luck with this. Recovery still counts as training when your body needs it.`;
  }

  if (
    normalizedQuestion.includes("workout") ||
    normalizedQuestion.includes("exercise") ||
    normalizedQuestion.includes("routine") ||
    normalizedQuestion.includes("low energy") ||
    normalizedQuestion.includes("motivation")
  ) {
    const sessionLine = todaySession
      ? `Today's plan is ${todaySession.title}, focused on ${todaySession.focus.toLowerCase()}, for about ${todaySession.durationMin} minutes.`
      : "I do not see a workout plan for today yet.";
    const adjustment = completedToday
      ? "Since today's session is already complete, use a 10-minute walk and mobility as recovery instead of adding more intensity."
      : isProTier(state.subscriptionTier) &&
          todaySession &&
          "isAdaptedForReadiness" in todaySession &&
          todaySession.isAdaptedForReadiness
        ? "Because you are on Pro, today's session is already adapted from your readiness check."
        : !isProTier(state.subscriptionTier)
          ? "Starter keeps the standard workout. Pro and Elite can shorten or lighten today based on your readiness check."
          : "If energy is low, do the warm-up, then complete the first two main exercises at a steady pace and skip conditioning.";

    return `${contextIntro}${sessionLine} ${adjustment} ${injuryNote}\n\nGood luck with it. The win today is consistency: finish a smaller version cleanly, feel proud of showing up, and come back stronger tomorrow.\n\nTell me your energy level from 1-10, how much time you have, and if anything hurts today.`;
  }

  if (
    normalizedQuestion.includes("weight") ||
    normalizedQuestion.includes("fat") ||
    normalizedQuestion.includes("lose") ||
    normalizedQuestion.includes("gain") ||
    normalizedQuestion.includes("muscle")
  ) {
    return `${contextIntro}You've got a clear target: ${targets.calories} kcal with ${targets.proteinG}g protein. For ${goal}, let's keep it simple this week: hit protein most days, repeat meals that work, and finish your planned workouts.\n\nToday you are at ${formatMacroLine(todayNutrition)}. ${proteinGap > 20 ? `Protein is the main gap: add about ${Math.round(proteinGap)}g across one or two meals.` : "Protein is in a useful range, so keep the next meal balanced rather than chasing extra food."} Good luck with it, consistency is the real win here.\n\nTell me your current weight trend, how your hunger feels, and whether your workouts feel easy, steady, or too hard.`;
  }

  return `${contextIntro}Good luck with that. Let's keep the next step small and doable: ${proteinGap > 20 ? `close your protein gap with about ${Math.round(proteinGap)}g protein` : "keep your next meal balanced"}, ${completedToday ? "protect recovery after your completed workout" : "get a scaled version of your workout done"}, and log the result.\n\nWe need to hit your protein goal consistently this week and keep the workout rhythm alive. You do not need a perfect day, just a solid next move.\n\nTell me your main goal for this question, what you already tried, and what constraint matters most right now: time, energy, food options, pain, or motivation.`;
}

function buildCoachFallbackAnswer(
  question: string,
  state: DietFitState,
  options: { includeContext?: boolean; previousMessages?: ChatMessage[]; media?: MediaAttachment | null },
) {
  if (!options.media) {
    return buildCoachAnswer(question, state, options);
  }

  if (options.media.type === "video") {
    return "I got the video, but full video review is not available in Coach yet. Send me a clear screenshot/key frame or describe the exact moment you want checked, and I will guide you from there.\n\nIf this is about pain, swelling, numbness, weakness, trouble walking, chest pain, shortness of breath, or symptoms getting worse, please get medical help promptly.";
  }

  return "I got the image, but image analysis is unavailable right now. Tell me what you want checked in it: meal calories/protein, portion size, exercise form, posture, swelling, or pain location.\n\nIf this is a body-part photo with severe pain, swelling, redness, warmth, numbness, weakness, or trouble walking, please get medical help promptly.";
}

// The per-session counter restarts at 0 on every page load, so "thread-1" collided
// with the first thread the user ever created and silently merged the two chats.
// Skipping ids already in the store keeps new conversations separate without
// reaching for a timestamp, which the compiler rightly rejects as impure.
function createThreadId(existingThreads: ChatThread[], sequence: number) {
  const taken = new Set(existingThreads.map((thread) => thread.id));
  let attempt = sequence;

  while (taken.has(`thread-${attempt}`)) {
    attempt += 1;
  }

  return `thread-${attempt}`;
}

export default function AiChatPage() {
  const {
    state,
    hydrated,
    firebaseRemoteLoaded,
    updateCoachThreads,
    dismissCoachIntro,
  } = useDietFit();
  // Threads live in the persisted store, so history survives tab switches and
  // reloads the same way meals and workouts do. Memoized because the `?? []`
  // fallback would otherwise hand out a fresh array on every render, re-running
  // every hook that depends on it.
  const threads = useMemo(() => state.coachThreads ?? [], [state.coachThreads]);
  const setThreads = (updater: (previous: ChatThread[]) => ChatThread[]) => {
    updateCoachThreads(updater);
  };
  // "auto" means nothing has been picked yet, so the newest thread shows once the
  // store has finished loading. Every explicit action -- New, opening a thread from
  // history, sending a message -- switches to "picked" and stays there.
  const [threadSelection, setThreadSelection] = useState<
    { mode: "auto" } | { mode: "picked"; id: string | null }
  >({ mode: "auto" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [hasSharedCoachContext, setHasSharedCoachContext] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedMedia, setAttachedMedia] = useState<MediaAttachment | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // Safari ends a recognition session on every pause in speech and whenever the
  // screen dims. Track whether the user still wants to dictate so those stops can
  // be resumed, and keep the transcript pieces so resuming never wipes earlier text.
  const { height: keyboardHeight, isOpen: keyboardIsOpen } = useKeyboardInset();
  const voiceShouldListenRef = useRef(false);
  const voiceBaseRef = useRef("");
  const voiceFinalRef = useRef("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const threadCounterRef = useRef(0);
  const responseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived rather than synced through an effect: threads arrive from localStorage
  // and then from Firebase a beat later, and writing the resumed id into state on
  // that second pass used to drop the user out of the greeting and into an old chat.
  const isStoreLoaded = hydrated && firebaseRemoteLoaded;
  const activeThreadId =
    threadSelection.mode === "picked"
      ? threadSelection.id
      : isStoreLoaded
        ? threads[0]?.id ?? null
        : null;

  const todayLabel = useMemo(() => format(new Date(), "EEE, MMM d"), []);
  const messages = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId)?.messages ?? [],
    [activeThreadId, threads],
  );
  const hasPendingCoachReply = pendingThreadId !== null;
  const isCoachThinking = pendingThreadId !== null && pendingThreadId === activeThreadId;

  // Collapse the composer back to one line once the draft clears, otherwise it
  // stays tall after sending a long message.
  useEffect(() => {
    if (!draft) {
      autoSizeComposer(draftInputRef.current);
    }
  }, [draft]);

  useEffect(() => {
    return () => {
      if (responseTimerRef.current) {
        clearTimeout(responseTimerRef.current);
      }
    };
  }, []);

  async function requestCoachAnswer({
    userText,
    includeContext,
    media,
    previousMessages,
  }: {
    userText: string;
    includeContext: boolean;
    media: MediaAttachment | null;
    previousMessages: ChatMessage[];
  }) {
    try {
      const response = await aiFetch("/api/coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userText,
          includeContext,
          media,
          previousMessages: previousMessages.map((message) => ({
            role: message.role,
            text: message.text,
          })),
          state,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const responseJson = (await response.json()) as { answer?: unknown };
      return typeof responseJson.answer === "string" ? responseJson.answer : null;
    } catch (error) {
      console.error("AI coach request failed; using local fallback.", error);
      return null;
    }
  }

  function askCoach(prompt: string) {
    const trimmed = prompt.trim();
    if ((!trimmed && !attachedMedia) || hasPendingCoachReply) return;

    threadCounterRef.current += 1;
    const sequence = threadCounterRef.current;
    // The greeting and its suggestion buttons show whenever the open thread has no
    // messages, so a tap there has to start a genuinely new conversation. Falling
    // back to activeThreadId appended the question to whatever was last open.
    const threadId =
      messages.length > 0 && activeThreadId
        ? activeThreadId
        : createThreadId(threads, sequence);
    const includeContext = !hasSharedCoachContext;
    const userText = trimmed || "Please review the attached media.";
    const mediaForMessage = attachedMedia;
    const previousMessages = messages;
    const userMessage: ChatMessage = {
      id: `user-${sequence}`,
      role: "user",
      text: userText,
      media: mediaForMessage,
    };
    const fallbackAnswer = buildCoachFallbackAnswer(userText, state, {
      includeContext,
      previousMessages,
      media: mediaForMessage,
    });
    const answerPromise = requestCoachAnswer({
      userText,
      includeContext,
      media: mediaForMessage,
      previousMessages,
    }).then((answer) => answer ?? fallbackAnswer);

    setThreads((previous) => {
      const existingThread = previous.find((thread) => thread.id === threadId);

      if (!existingThread) {
        return [
          {
            id: threadId,
            title: userText,
            createdLabel: todayLabel,
            messages: [userMessage],
          },
          ...previous,
        ];
      }

      return previous.map((thread) =>
        thread.id === threadId
          ? { ...thread, messages: [...thread.messages, userMessage] }
          : thread,
      );
    });
    setThreadSelection({ mode: "picked", id: threadId });
    setHasSharedCoachContext(true);
    setPendingThreadId(threadId);
    setHistoryOpen(false);
    setEditingMessageId(null);
    setDraft("");
    setAttachedMedia(null);

    const responseDelayMs = 2200 + (sequence % 3) * 300;
    if (responseTimerRef.current) {
      clearTimeout(responseTimerRef.current);
    }
    responseTimerRef.current = setTimeout(() => {
      void (async () => {
        const answer = await answerPromise;
        const assistantMessage: ChatMessage = {
          id: `assistant-${sequence}`,
          role: "assistant",
          text: answer,
          sharedContext: includeContext,
        };

        setThreads((previous) =>
          previous.map((thread) =>
            thread.id === threadId
              ? { ...thread, messages: [...thread.messages, assistantMessage] }
              : thread,
          ),
        );
        setPendingThreadId((current) => (current === threadId ? null : current));
        responseTimerRef.current = null;
      })();
    }, responseDelayMs);
  }

  function handleNewChat() {
    // Starting a blank chat is an explicit choice, so it has to leave "auto" --
    // otherwise the newest thread would immediately resolve back into view.
    setThreadSelection({ mode: "picked", id: null });
    setDraft("");
    setAttachedMedia(null);
    setEditingMessageId(null);
    setHistoryOpen(false);
  }

  function handleOpenThread(threadId: string) {
    setThreadSelection({ mode: "picked", id: threadId });
    setDraft("");
    setAttachedMedia(null);
    setEditingMessageId(null);
    setHistoryOpen(false);
  }

  function handleMediaChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const type = file.type.startsWith("video/") ? "video" : "image";
    event.target.value = "";

    void (async () => {
      try {
        const url = type === "image" ? await prepareCoachImage(file) : await readMediaDataUrl(file);
        setAttachedMedia({
          name: file.name,
          type,
          url,
        });
      } catch (error) {
        console.error("Coach media preparation failed.", error);
      }
    })();
  }

  function handleStartEdit(message: ChatMessage) {
    setEditingMessageId(message.id);
    setEditingText(message.text);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditingText("");
  }

  function handleSaveEdit(messageId: string) {
    const trimmed = editingText.trim();
    if (!trimmed || !activeThreadId) return;

    setThreads((previous) =>
      previous.map((thread) => {
        if (thread.id !== activeThreadId) return thread;

        const messageIndex = thread.messages.findIndex((message) => message.id === messageId);
        if (messageIndex === -1) return thread;

        const nextMessages = thread.messages.map((message, index) => {
          if (message.id === messageId) {
            return { ...message, text: trimmed };
          }

          const isFollowingAssistant =
            index === messageIndex + 1 && message.role === "assistant";
          if (isFollowingAssistant) {
            return {
              ...message,
              text: buildCoachAnswer(trimmed, state, {
                includeContext: message.sharedContext,
                previousMessages: thread.messages.slice(0, messageIndex),
              }),
            };
          }

          return message;
        });

        return {
          ...thread,
          title: messageIndex === 0 ? trimmed : thread.title,
          messages: nextMessages,
        };
      }),
    );
    handleCancelEdit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    askCoach(draftInputRef.current?.value ?? draft);
  }

  function getRecognition() {
    if (recognitionRef.current) return recognitionRef.current;

    const Api = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Api) return null;

    const recognition = new Api();
    // continuous keeps the session alive across natural pauses; without it Safari
    // stops at the first breath and dictation dies mid-sentence.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];

        if (result.isFinal) {
          voiceFinalRef.current += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setDraft(`${voiceBaseRef.current}${voiceFinalRef.current}${interim}`.trimStart());
    };
    recognition.onerror = (event) => {
      // Permission failures are terminal; the rest (no-speech, aborted, network)
      // are transient and onend will resume from them.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        voiceShouldListenRef.current = false;
        setVoiceError(micBlockedMessage());
      }
    };
    recognition.onend = () => {
      if (voiceShouldListenRef.current) {
        try {
          recognition.start();
          return;
        } catch {
          voiceShouldListenRef.current = false;
          setVoiceError("Voice input stopped. Tap the mic to continue.");
        }
      }

      setIsListening(false);
    };
    recognitionRef.current = recognition;

    return recognition;
  }

  async function handleVoice() {
    const recognition = getRecognition();

    if (!recognition) {
      setVoiceError("Voice input isn't supported in this browser.");
      return;
    }

    if (isListening) {
      voiceShouldListenRef.current = false;
      recognition.stop();
      return;
    }

    // In the app the OS has to grant the mic first, or the WebView refuses
    // silently. This is what shows the system mic prompt.
    const permission = await ensureMicPermission();
    if (permission === "blocked") {
      setVoiceError(micBlockedMessage());
      return;
    }
    if (permission === "dismissed") {
      setVoiceError(null);
      return;
    }

    // Keep whatever is already typed so dictation appends rather than replaces.
    voiceBaseRef.current = draft.trim() ? `${draft.trimEnd()} ` : "";
    voiceFinalRef.current = "";
    voiceShouldListenRef.current = true;
    setVoiceError(null);
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      voiceShouldListenRef.current = false;
      setIsListening(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="min-h-screen px-4 pt-8">
        <div className="rounded-hero border border-white/50 bg-white/40 p-6 text-center text-foreground/50 backdrop-blur-xl">
          Loading coach...
        </div>
      </div>
    );
  }

  // First-time gate: show the intro sheet before anything else. Dismissing it
  // (skip ✕ or Start chatting) sets coachIntroSeen so this never re-fires
  // unless the user manually re-opens it from a "What is this?" link.
  if (!state.coachIntroSeen) {
    return <CoachIntro onDismiss={dismissCoachIntro} />;
  }

  return (
    <div
      className="overflow-hidden pt-0"
      // Shrink to what the keyboard leaves visible; 100dvh ignores the keyboard.
      style={{ height: keyboardIsOpen && keyboardHeight ? `${keyboardHeight}px` : "100dvh" }}
    >
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleMediaChange}
      />
      <section
        className={cn(
          "glass-ui relative h-full overflow-hidden px-4 pt-[calc(0.75rem+var(--safe-top))] sm:px-5",
          // The bottom nav hides while typing, so its reserved space goes with it.
          // Clears the floating tab bar: its bottom offset plus its height.
          keyboardIsOpen ? "pb-2" : "pb-[calc(var(--screen-pad-bottom)+5rem)]",
        )}
      >
        <GlassBackdrop />

        <div className="relative flex h-full min-h-0 flex-col">
          <div className="mb-2 flex shrink-0 items-center justify-between">
            <button
              type="button"
              className="glass flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-foreground transition active:scale-[0.97]"
              onClick={() => setHistoryOpen(true)}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chats
            </button>
            <button
              type="button"
              className="flex h-10 items-center gap-1.5 rounded-full bg-primary-strong px-3.5 text-[12px] font-semibold text-white shadow-[0_12px_24px_rgba(12,39,35,0.18)] transition active:scale-[0.97]"
              onClick={handleNewChat}
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </button>
          </div>

          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Everything above the composer scrolls as one, so on short
                  screens the last suggestion isn't stuck behind the composer.
                  Padded so the scroll edge doesn't cut the cards' shadows. */}
              <div className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="mx-auto flex max-w-sm flex-col items-center pt-2 text-center">
                  <CoachMark listening={isListening} />
                  <p className="mt-4 text-[12px] font-medium text-primary-strong">
                    Fitmonk Coach
                  </p>
                  <h1 className="mt-1.5 text-[25px] font-medium leading-[1.12] tracking-[-0.02em] text-foreground">
                    Hey 👋🏻, how can I<br />help you today?
                  </h1>
                  <p className="mt-1.5 text-[12px] font-medium text-foreground/50">
                    {todayLabel}
                  </p>
                </div>

                <div className="mt-6 pb-3">
                  <p className="px-1 text-[15px] font-medium text-foreground">
                    Try asking
                  </p>
                  <div className="mt-2.5 grid gap-2">
                    {suggestions.map(({ text, topic, Icon, color }) => (
                      <button
                        key={text}
                        type="button"
                        className="glass flex items-center gap-3 rounded-[20px] px-3 py-2.5 text-left transition active:scale-[0.99] disabled:opacity-60"
                        onClick={() => askCoach(text)}
                        disabled={hasPendingCoachReply}
                      >
                        <IconBadge className="h-9 w-9" style={{ color }}>
                          <Icon className="h-[17px] w-[17px]" />
                        </IconBadge>
                        <span className="min-w-0 flex-1">
                          <span
                            className="block text-[11px] font-medium"
                            style={{ color }}
                          >
                            {topic}
                          </span>
                          <span className="mt-0.5 block line-clamp-2 text-[13px] leading-[1.3] text-foreground">
                            {text}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              <form className="shrink-0 pt-3" onSubmit={handleSubmit}>
                <div className="glass grid gap-2 rounded-[24px] p-3">
                  {attachedMedia ? (
                    <div className="glass-inset flex items-center justify-between gap-2 rounded-[16px] p-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <MediaPreview media={attachedMedia} compact />
                        <span className="truncate text-[12px] font-semibold text-foreground/70">
                          {attachedMedia.type === "video" ? "Video" : "Image"}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove attached media"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/50 transition hover:text-foreground/80"
                        onClick={() => setAttachedMedia(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    ref={draftInputRef}
                    rows={1}
                    className="max-h-32 min-h-[24px] w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-[14px] leading-5 text-foreground/85 outline-none transition-[height] duration-150 placeholder:text-foreground/40"
                    onFocus={(event) => autoSizeComposer(event.currentTarget)}
                    placeholder="Ask about fitness, diet, or health"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onInput={(event) => {
                      setDraft(event.currentTarget.value);
                      autoSizeComposer(event.currentTarget);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        askCoach(event.currentTarget.value);
                      }
                    }}
                  />
                  {voiceError ? (
                    <VoiceErrorNote
                      message={voiceError}
                      className="pb-1 text-left text-[11px] font-medium leading-4 text-accent"
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label="Attach image or video"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/55 transition hover:text-foreground active:scale-[0.97]"
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={isListening ? "Stop voice input" : "Start voice input"}
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.97]",
                          isListening
                            ? "border-accent bg-accent text-white"
                            : "border-foreground/15 text-foreground/55 hover:text-foreground",
                        )}
                        onClick={handleVoice}
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="submit"
                        aria-label="Send question"
                        aria-disabled={hasPendingCoachReply || (!draft.trim() && !attachedMedia)}
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-strong text-white shadow-[0_10px_20px_rgba(12,39,35,0.18)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35",
                          !draft.trim() && !attachedMedia && "opacity-45",
                        )}
                        disabled={hasPendingCoachReply}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <p className="text-[12px] font-medium text-foreground/55">
                    {todayLabel}
                  </p>
                  <h1 className="mt-1 text-[30px] font-medium leading-none tracking-[-0.03em] text-foreground">
                    Coach
                  </h1>
                </div>
              </div>

              {/* No panel around the thread: glass bubbles inside a glass card
                  would nest backdrop blur, which renders see-through. */}
              <div className="mt-2 min-h-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex-1 overflow-y-auto px-0.5 py-3">
                <div className="grid gap-3">
                  {messages.map((message) => {
                    const isUser = message.role === "user";
                    const Icon = isUser ? UserRound : Sparkles;

                    return (
                      <div
                        key={message.id}
                        className={cn(
                          "flex items-start gap-2",
                          isUser && "flex-row-reverse",
                        )}
                      >
                        <div
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                            isUser
                              ? "bg-primary-strong text-white"
                              : "border border-foreground/20 text-primary-strong",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div
                          className={cn(
                            "max-w-[82%] whitespace-pre-line rounded-[20px] px-3.5 py-3 text-justify text-[13.5px] leading-5",
                            isUser
                              ? "glass-dark rounded-tr-[8px]"
                              : "glass rounded-tl-[8px] text-foreground",
                          )}
                        >
                          {isUser && editingMessageId === message.id ? (
                            <div className="grid gap-2">
                              <textarea
                                className="min-h-[72px] w-full resize-none rounded-[12px] border border-white/15 bg-white/8 px-3 py-2 text-[13px] leading-5 text-white outline-none placeholder:text-white/40"
                                value={editingText}
                                onChange={(event) => setEditingText(event.target.value)}
                                onInput={(event) => setEditingText(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    handleSaveEdit(message.id);
                                  }
                                }}
                                autoFocus
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  aria-label="Cancel edit"
                                  className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white/10 text-white/72 transition hover:bg-white/16"
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  aria-label="Save edit"
                                  className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white text-foreground transition active:scale-[0.97]"
                                  onClick={() => handleSaveEdit(message.id)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ) : isUser ? (
                            <div className="grid gap-2">
                              {message.media ? <MediaPreview media={message.media} /> : null}
                              <div className="flex items-start gap-2">
                                <span className="min-w-0 flex-1">{message.text}</span>
                                <button
                                  type="button"
                                  aria-label="Edit message"
                                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[9px] bg-white/10 text-white/65 transition hover:bg-white/16 hover:text-white"
                                  onClick={() => handleStartEdit(message)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            stripMarkdown(message.text)
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {isCoachThinking ? (
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-foreground/20 text-primary-strong">
                        <Sparkles className="h-4 w-4" />
                      </div>
                      <div className="glass rounded-[20px] rounded-tl-[8px] px-3.5 py-3 text-[13px] leading-5 text-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/65" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/50 [animation-delay:120ms]" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary/35 [animation-delay:240ms]" />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <form className="pt-2" onSubmit={handleSubmit}>
                <div className="glass grid gap-2 rounded-[24px] p-3">
                  {attachedMedia ? (
                    <div className="glass-inset flex items-center justify-between gap-2 rounded-[16px] p-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <MediaPreview media={attachedMedia} compact />
                        <span className="truncate text-[12px] font-semibold text-foreground/70">
                          {attachedMedia.type === "video" ? "Video" : "Image"}
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove attached media"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/50 transition hover:text-foreground/80"
                        onClick={() => setAttachedMedia(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                  <textarea
                    ref={draftInputRef}
                    rows={1}
                    className="max-h-32 min-h-[24px] w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-[14px] leading-5 text-foreground/85 outline-none transition-[height] duration-150 placeholder:text-foreground/40"
                    onFocus={(event) => autoSizeComposer(event.currentTarget)}
                    placeholder="Ask about fitness, diet, or health"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onInput={(event) => {
                      setDraft(event.currentTarget.value);
                      autoSizeComposer(event.currentTarget);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        askCoach(event.currentTarget.value);
                      }
                    }}
                  />
                  {voiceError ? (
                    <VoiceErrorNote
                      message={voiceError}
                      className="pb-1 text-left text-[11px] font-medium leading-4 text-accent"
                    />
                  ) : null}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      aria-label="Attach image or video"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-foreground/15 text-foreground/55 transition hover:text-foreground active:scale-[0.97]"
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={isListening ? "Stop voice input" : "Start voice input"}
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition active:scale-[0.97]",
                          isListening
                            ? "border-accent bg-accent text-white"
                            : "border-foreground/15 text-foreground/55 hover:text-foreground",
                        )}
                        onClick={handleVoice}
                      >
                        <Mic className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="submit"
                        aria-label="Send question"
                        aria-disabled={hasPendingCoachReply || (!draft.trim() && !attachedMedia)}
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-strong text-white shadow-[0_10px_20px_rgba(12,39,35,0.18)] transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35",
                          !draft.trim() && !attachedMedia && "opacity-45",
                        )}
                        disabled={hasPendingCoachReply}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
            </>
          )}
        </div>
      </section>

      {historyOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/24 px-4 pt-5 backdrop-blur-sm"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="glass-sheet glass-ui mx-auto w-full max-w-[430px] overflow-hidden rounded-hero"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/[0.04] px-4 py-3">
              <p className="text-[15px] font-medium text-foreground">Chats</p>
              <button
                type="button"
                aria-label="Close chat history"
                className="glass-inset flex h-8 w-8 items-center justify-center rounded-full text-foreground/55 transition hover:text-foreground/80"
                onClick={() => setHistoryOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {threads.length === 0 ? (
                <div className="glass-inset rounded-[18px] px-4 py-5 text-center text-[12px] text-foreground/50">
                  No chats yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className={cn(
                        "block w-full min-w-0 rounded-[18px] px-4 py-3 text-left transition active:scale-[0.99]",
                        thread.id === activeThreadId
                          ? "glass-dark-inset"
                          : "glass-inset text-foreground hover:bg-white/80",
                      )}
                      onClick={() => handleOpenThread(thread.id)}
                    >
                      <span className="block truncate text-[13px] font-semibold">
                        {thread.title}
                      </span>
                      <span className="mt-1 block text-[11px] font-medium opacity-55">
                        {thread.createdLabel}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
