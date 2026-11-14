"use client";

import { deleteUser, type User } from "firebase/auth";
import { deleteDoc, doc } from "firebase/firestore";
import {
  createFirebaseAuth,
  createFirebaseDb,
  reauthenticateWithGoogle,
} from "@/lib/firebase-browser";

// Firebase only lets an account be deleted within a few minutes of signing
// in. Confirm the user up front past this age, instead of failing after the
// data is already gone.
const RECENT_SIGN_IN_MS = 4 * 60 * 1000;

const CANCELLED_CODES = new Set([
  "cancelled",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

/** What to tell the user when deletion stops partway. */
export function deletionErrorMessage(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";

  if (code === "auth/user-mismatch") {
    return "That's a different Google account. Pick the one you signed in with.";
  }
  if (CANCELLED_CODES.has(code)) {
    return "Confirm with Google to delete your account.";
  }
  return "Couldn't delete your account. Try again, or email contact@fitmonk.online and we'll do it for you.";
}

export function needsFreshSignIn(user: User, now = Date.now()) {
  const lastSignIn = Date.parse(user.metadata.lastSignInTime ?? "");
  return !Number.isFinite(lastSignIn) || now - lastSignIn > RECENT_SIGN_IN_MS;
}

/**
 * Permanently deletes the signed-in user's Fitmonk data and login.
 *
 * Order matters: the Firestore record goes first, because once the login is
 * deleted the app no longer has permission to remove it. Signed-out (demo)
 * users have nothing stored remotely, so this is a no-op for them; the
 * caller clears local data either way.
 */
export async function deleteFirebaseAccount() {
  const auth = createFirebaseAuth();
  const user = auth?.currentUser;

  if (!user) {
    return;
  }

  if (needsFreshSignIn(user)) {
    await reauthenticateWithGoogle(user);
  }

  const db = createFirebaseDb();
  if (db) {
    await deleteDoc(doc(db, "users", user.uid));
  }

  await deleteUser(user);
}
