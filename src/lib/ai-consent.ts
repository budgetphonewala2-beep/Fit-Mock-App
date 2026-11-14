/**
 * Consent before personal data goes to a third-party AI (OpenAI).
 *
 * App Store Review Guideline 5.1.2(i) requires apps to "clearly disclose
 * where personal data will be shared with third parties, including with
 * third-party AI, and obtain explicit permission before doing so". India's
 * DPDP Act asks for the same kind of informed consent. So every request that
 * carries meal text, meal photos, profile details or coach messages to an AI
 * endpoint goes through `aiFetch`, which asks once and remembers the answer.
 * The user can change it any time under Profile → AI features.
 */

export type AiConsent = "granted" | "declined";

const STORAGE_KEY = "fitmonk.aiConsent.v1";

/** Endpoints that forward user data to OpenAI. */
export const AI_ENDPOINTS = [
  "/api/meal",
  "/api/meal-photo",
  "/api/meal-plan/suggest",
  "/api/coach",
] as const;

export class AiConsentDeclinedError extends Error {
  readonly code = "ai_consent_declined";
  constructor() {
    super("AI features are turned off. You can turn them on in Profile → AI features.");
    this.name = "AiConsentDeclinedError";
  }
}

export function isAiConsentDeclined(error: unknown): error is AiConsentDeclinedError {
  return (
    error instanceof AiConsentDeclinedError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "ai_consent_declined")
  );
}

type Listener = () => void;
const listeners = new Set<Listener>();

// A prompt the dialog should currently show, resolved by the user's answer.
let pending: { promise: Promise<boolean>; resolve: (granted: boolean) => void } | null = null;
let memoryConsent: AiConsent | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeAiConsent(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAiConsent(): AiConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "granted" || stored === "declined") return stored;
  } catch {
    // Storage unavailable (private mode): fall back to this session only.
  }
  return memoryConsent;
}

export function setAiConsent(value: AiConsent) {
  memoryConsent = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Keep the in-memory answer.
  }
  emit();
}

/** True while the consent sheet should be on screen. */
export function isAiConsentPromptOpen() {
  return pending !== null;
}

/** Called by the consent sheet with the user's answer. */
export function answerAiConsent(granted: boolean) {
  setAiConsent(granted ? "granted" : "declined");
  const current = pending;
  pending = null;
  emit();
  current?.resolve(granted);
}

/**
 * Resolves `true` when the user has agreed to AI processing. Asks if they
 * haven't agreed yet. A user who declined earlier is asked again, but only
 * when they tap an AI feature themselves, never in the background.
 */
export function ensureAiConsent(): Promise<boolean> {
  if (getAiConsent() === "granted") return Promise.resolve(true);
  if (typeof window === "undefined") return Promise.resolve(false);
  if (pending) return pending.promise;
  let resolve!: (granted: boolean) => void;
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  pending = { promise, resolve };
  emit();
  return promise;
}

/** `fetch` for AI endpoints: asks for consent first, throws if declined. */
export async function aiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!(await ensureAiConsent())) {
    throw new AiConsentDeclinedError();
  }
  return fetch(input, init);
}
