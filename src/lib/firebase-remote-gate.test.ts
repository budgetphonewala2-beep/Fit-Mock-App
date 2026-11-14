import { describe, expect, it } from "vitest";
import {
  initialRemoteGateState,
  isRemoteGateOpen,
  reduceRemoteGate,
  shouldFetchRemote,
  type RemoteGateEvent,
  type RemoteGateState,
} from "@/lib/firebase-remote-gate";

function run(events: RemoteGateEvent[], start: RemoteGateState = initialRemoteGateState) {
  return events.reduce(reduceRemoteGate, start);
}

describe("firebase remote gate", () => {
  it("opens straight away when nobody is signed in", () => {
    const state = run([{ type: "auth-changed", userId: null }]);
    expect(isRemoteGateOpen(state)).toBe(true);
    expect(shouldFetchRemote(state)).toBe(false);
  });

  it("holds for a signed-in user until their fetch finishes", () => {
    const signedIn = run([{ type: "auth-changed", userId: "u1" }]);
    expect(isRemoteGateOpen(signedIn)).toBe(false);
    expect(shouldFetchRemote(signedIn)).toBe(true);

    const synced = run(
      [{ type: "sync-finished", userId: "u1", syncRequest: signedIn.syncRequest }],
      signedIn,
    );
    expect(synced.synced).toBe(true);
    expect(isRemoteGateOpen(synced)).toBe(true);
  });

  // The bug: the user was already signed in (session kept in the WebView), then
  // signed in again with the same account. Firebase sends no auth event for the
  // same uid, so the only signal is our own sign-in. It must ask for a new fetch
  // instead of waiting on an auth event that never comes.
  it("asks for a fresh fetch when the same user signs in again", () => {
    const loaded = run([
      { type: "auth-changed", userId: "u1" },
      { type: "sync-finished", userId: "u1", syncRequest: 1 },
    ]);
    expect(isRemoteGateOpen(loaded)).toBe(true);

    const signedInAgain = run([{ type: "signed-in" }], loaded);
    expect(isRemoteGateOpen(signedInAgain)).toBe(false);
    expect(shouldFetchRemote(signedInAgain)).toBe(true);
    expect(signedInAgain.syncRequest).toBeGreaterThan(loaded.syncRequest);

    const reopened = run(
      [{ type: "sync-finished", userId: "u1", syncRequest: signedInAgain.syncRequest }],
      signedInAgain,
    );
    expect(isRemoteGateOpen(reopened)).toBe(true);
  });

  it("ignores a fetch that finishes for an older sign-in", () => {
    const state = run([
      { type: "auth-changed", userId: "u1" },
      { type: "signed-in" },
      { type: "sync-finished", userId: "u1", syncRequest: 1 },
    ]);
    expect(state.synced).toBe(false);
    expect(isRemoteGateOpen(state)).toBe(false);
  });

  it("ignores a fetch that finishes for a different user", () => {
    const state = run([
      { type: "auth-changed", userId: "u1" },
      { type: "auth-changed", userId: "u2" },
      { type: "sync-finished", userId: "u1", syncRequest: 2 },
    ]);
    expect(isRemoteGateOpen(state)).toBe(false);
  });

  it("opens on timeout but still counts as not synced, so nothing is saved", () => {
    const pending = run([{ type: "auth-changed", userId: "u1" }]);
    const timedOut = run([{ type: "timed-out", syncRequest: pending.syncRequest }], pending);

    expect(isRemoteGateOpen(timedOut)).toBe(true);
    expect(timedOut.synced).toBe(false);
    // The fetch may still land later and is still wanted.
    expect(shouldFetchRemote(timedOut)).toBe(true);
  });

  it("ignores a timeout left over from an earlier sign-in", () => {
    const state = run([
      { type: "auth-changed", userId: "u1" },
      { type: "signed-in" },
      { type: "timed-out", syncRequest: 1 },
    ]);
    expect(isRemoteGateOpen(state)).toBe(false);
  });

  it("starts waiting again after a new sign-in even if the last one timed out", () => {
    const state = run([
      { type: "auth-changed", userId: "u1" },
      { type: "timed-out", syncRequest: 1 },
      { type: "signed-in" },
    ]);
    expect(state.timedOut).toBe(false);
    expect(isRemoteGateOpen(state)).toBe(false);
  });
});
