/**
 * Which store the renewal copy on the paywall should name. Resolved server-
 * side so the first paint has the right wording and we never flash "your
 * account" on an iOS shell during hydration. Both the server header reader
 * and the client renderer import from this file, so no "server-only" guard
 * here — the server-only piece lives in paywall-store-host-server.ts.
 */
export type StoreHost = "googlePlay" | "appleStore" | "web";

/**
 * Fitmonk's Flutter shell tags its WebView UA with "FitmonkShell". iOS
 * WebViews additionally carry "iPhone" or "iPad"; Android ones carry
 * "Android" and no iOS marker. Anything without the shell marker is a plain
 * desktop or mobile browser.
 */
export function detectStoreHost(userAgent: string | null | undefined): StoreHost {
  if (!userAgent || !userAgent.includes("FitmonkShell")) {
    return "web";
  }
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return "appleStore";
  }
  return "googlePlay";
}

/**
 * Phrase that fills `{store}` in the renewal sentence. Design handoff spec
 * fixes these three strings exactly.
 */
export function storePhrase(host: StoreHost): string {
  switch (host) {
    case "googlePlay":
      return "Google Play";
    case "appleStore":
      return "your Apple ID settings";
    case "web":
      return "your account";
  }
}
