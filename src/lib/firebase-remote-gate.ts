// Tracks whether a signed-in user's Firestore state has been fetched, and
// whether the app may stop waiting for it.
//
// Two separate answers, on purpose:
//  - `synced`: the remote fetch for the current sign-in actually finished.
//    Only this allows writing local state back to Firestore; writing before
//    it would overwrite a returning user's cloud data with a fresh device.
//  - the gate (`isRemoteGateOpen`): synced, or the safety timeout passed.
//    Only this releases the loader and the onboarding/paywall redirects, so
//    a fetch that never settles can't leave the app on the loader forever.

export const FIREBASE_REMOTE_LOAD_TIMEOUT_MS = 10_000;

export type RemoteGateState = {
  userId: string | null;
  // Bumped whenever a fresh fetch is needed. The fetch effect keys on it, so
  // signing in again as the same user still fetches: Firebase only reports
  // auth changes when the uid changes, so no auth event arrives then.
  syncRequest: number;
  synced: boolean;
  timedOut: boolean;
};

export type RemoteGateEvent =
  | { type: "auth-changed"; userId: string | null }
  | { type: "signed-in" }
  | { type: "sync-finished"; userId: string; syncRequest: number }
  | { type: "timed-out"; syncRequest: number };

export const initialRemoteGateState: RemoteGateState = {
  userId: null,
  syncRequest: 0,
  synced: false,
  timedOut: false,
};

export function reduceRemoteGate(
  state: RemoteGateState,
  event: RemoteGateEvent,
): RemoteGateState {
  switch (event.type) {
    case "auth-changed":
      // Signed out: there is nothing remote to wait for.
      if (!event.userId) {
        return { ...state, userId: null, synced: true, timedOut: false };
      }
      return {
        userId: event.userId,
        syncRequest: state.syncRequest + 1,
        synced: false,
        timedOut: false,
      };
    case "signed-in":
      return {
        ...state,
        syncRequest: state.syncRequest + 1,
        synced: false,
        timedOut: false,
      };
    case "sync-finished":
      // A fetch for an older sign-in or another user must not open the gate
      // for the current one.
      if (event.userId !== state.userId || event.syncRequest !== state.syncRequest) {
        return state;
      }
      return { ...state, synced: true };
    case "timed-out":
      if (state.synced || event.syncRequest !== state.syncRequest) {
        return state;
      }
      return { ...state, timedOut: true };
  }
}

export function isRemoteGateOpen(state: RemoteGateState) {
  return state.synced || state.timedOut;
}

export function shouldFetchRemote(state: RemoteGateState) {
  return Boolean(state.userId) && !state.synced;
}
