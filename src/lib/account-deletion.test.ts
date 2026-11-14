import { describe, expect, it } from "vitest";
import type { User } from "firebase/auth";
import { deletionErrorMessage, needsFreshSignIn } from "@/lib/account-deletion";

function userSignedInAt(iso: string | undefined) {
  return { metadata: { lastSignInTime: iso } } as unknown as User;
}

describe("needsFreshSignIn", () => {
  const now = Date.parse("2026-10-30T12:00:00Z");

  it("skips the extra Google step right after signing in", () => {
    expect(needsFreshSignIn(userSignedInAt("Fri, 30 Oct 2026 11:58:00 GMT"), now)).toBe(false);
  });

  it("asks again when the last sign-in is older than a few minutes", () => {
    expect(needsFreshSignIn(userSignedInAt("Fri, 30 Oct 2026 11:50:00 GMT"), now)).toBe(true);
  });

  it("asks again when the sign-in time is unknown", () => {
    expect(needsFreshSignIn(userSignedInAt(undefined), now)).toBe(true);
  });
});

describe("deletionErrorMessage", () => {
  it("explains picking the wrong Google account", () => {
    expect(deletionErrorMessage({ code: "auth/user-mismatch" })).toContain("different Google account");
  });

  it("treats a closed popup or cancelled native picker as not confirmed", () => {
    for (const code of ["cancelled", "auth/popup-closed-by-user", "auth/cancelled-popup-request"]) {
      expect(deletionErrorMessage({ code })).toBe("Confirm with Google to delete your account.");
    }
  });

  it("falls back to retry or email for anything else", () => {
    expect(deletionErrorMessage(new Error("network down"))).toContain("contact@fitmonk.online");
  });
});
