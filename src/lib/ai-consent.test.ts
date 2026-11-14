// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal browser globals: the module only needs window.localStorage.
function installWindow() {
  const store = new Map<string, string>();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
}

describe("ai consent gate", () => {
  beforeEach(() => {
    vi.resetModules();
    installWindow();
    globalThis.fetch = vi.fn(async () => new Response("{}")) as unknown as typeof fetch;
  });
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it("asks before the first AI request and sends nothing until allowed", async () => {
    const consent = await import("@/lib/ai-consent");
    const request = consent.aiFetch("/api/meal", { method: "POST" });
    expect(consent.isAiConsentPromptOpen()).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    consent.answerAiConsent(true);
    await request;
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(consent.getAiConsent()).toBe("granted");
  });

  it("never calls the AI endpoint when the user declines", async () => {
    const consent = await import("@/lib/ai-consent");
    const request = consent.aiFetch("/api/coach");
    consent.answerAiConsent(false);
    await expect(request).rejects.toSatisfy(consent.isAiConsentDeclined);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(consent.getAiConsent()).toBe("declined");
  });

  it("remembers a yes and shares one prompt between parallel requests", async () => {
    const consent = await import("@/lib/ai-consent");
    const a = consent.ensureAiConsent();
    const b = consent.ensureAiConsent();
    consent.answerAiConsent(true);
    await expect(Promise.all([a, b])).resolves.toEqual([true, true]);
    await consent.aiFetch("/api/meal");
    expect(consent.isAiConsentPromptOpen()).toBe(false);
  });

  it("can be withdrawn from settings", async () => {
    const consent = await import("@/lib/ai-consent");
    consent.setAiConsent("granted");
    consent.setAiConsent("declined");
    const pending = consent.ensureAiConsent();
    expect(consent.isAiConsentPromptOpen()).toBe(true);
    consent.answerAiConsent(false);
    await expect(pending).resolves.toBe(false);
  });
});
