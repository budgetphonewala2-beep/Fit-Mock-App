"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import {
  Auth,
  GoogleAuthProvider,
  OAuthProvider,
  User,
  UserCredential,
  getAuth,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  revokeAccessToken,
  signInWithCredential,
  updateProfile,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { hasFirebaseEnv } from "@/lib/env";
import { nativeBridge } from "@/lib/native-bridge";

function createFirebaseApp() {
  if (!hasFirebaseEnv()) {
    return null;
  }

  return getApps().length > 0
    ? getApp()
    : initializeApp({
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      });
}

export function createFirebaseAuth() {
  const app = createFirebaseApp();

  if (!app) {
    return null;
  }

  return getAuth(app);
}

export function createFirebaseDb() {
  const app = createFirebaseApp();

  if (!app) {
    return null;
  }

  return getFirestore(app);
}

export function createGoogleAuthProvider() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  return provider;
}

/**
 * Native Google sign-in path for the Flutter WebView shell. Google refuses
 * OAuth inside WebViews, so the shell runs the native picker and hands us an
 * id token; we exchange it for a Firebase credential the same way the web
 * popup flow does. Callers should gate on `nativeBridge.isNative` before use.
 */
export async function signInWithGoogleNative(auth: Auth): Promise<UserCredential> {
  const result = await nativeBridge.auth.googleSignIn();
  if (!result?.idToken) {
    throw new Error("Native Google sign-in did not return an id token.");
  }
  const credential = GoogleAuthProvider.credential(
    result.idToken,
    result.accessToken ?? undefined,
  );
  return signInWithCredential(auth, credential);
}

/** Sign in with Apple is offered only inside the iOS app. */
export function canSignInWithApple(): boolean {
  return nativeBridge.isNative && nativeBridge.platform === "ios";
}

async function appleCredential() {
  const result = await nativeBridge.auth.appleSignIn();
  if (!result?.idToken || !result.rawNonce) {
    throw new Error("Sign in with Apple did not return an identity token.");
  }
  const credential = new OAuthProvider("apple.com").credential({
    idToken: result.idToken,
    rawNonce: result.rawNonce,
  });
  return { result, credential };
}

/**
 * Native Sign in with Apple (iOS shell). Apple only shares the user's name
 * on the very first authorization, so it is saved onto the Firebase profile
 * right away; later sign-ins come back without it.
 */
export async function signInWithAppleNative(auth: Auth): Promise<UserCredential> {
  const { result, credential } = await appleCredential();
  const userCredential = await signInWithCredential(auth, credential);
  if (result.displayName && !userCredential.user.displayName) {
    await updateProfile(userCredential.user, { displayName: result.displayName }).catch(
      () => null,
    );
  }
  return userCredential;
}

export function isAppleUser(user: User) {
  return user.providerData.some((p) => p.providerId === "apple.com");
}

/**
 * For deleting an Apple account: re-confirms the user with Apple (Firebase
 * needs a recent sign-in) and revokes Fitmonk's Apple tokens, which Apple
 * requires when an account created with Sign in with Apple is deleted. The
 * fresh authorization code is what Firebase revokes with.
 */
export async function reauthenticateAndRevokeApple(auth: Auth, user: User): Promise<void> {
  const { result, credential } = await appleCredential();
  await reauthenticateWithCredential(user, credential);
  if (result.authorizationCode) {
    await revokeAccessToken(auth, result.authorizationCode);
  }
}

/**
 * Confirms the signed-in user again, which Firebase requires shortly before
 * sensitive actions like deleting the account. Uses the native picker inside
 * the app shell and the Google popup on the web. Apple accounts re-confirm
 * through Sign in with Apple.
 */
export async function reauthenticateWithGoogle(user: User): Promise<void> {
  if (isAppleUser(user) && canSignInWithApple()) {
    const { credential } = await appleCredential();
    await reauthenticateWithCredential(user, credential);
    return;
  }
  if (nativeBridge.isNative) {
    const result = await nativeBridge.auth.googleSignIn();
    if (!result?.idToken) {
      throw new Error("Native Google sign-in did not return an id token.");
    }
    await reauthenticateWithCredential(
      user,
      GoogleAuthProvider.credential(result.idToken, result.accessToken ?? undefined),
    );
    return;
  }
  await reauthenticateWithPopup(user, createGoogleAuthProvider());
}
