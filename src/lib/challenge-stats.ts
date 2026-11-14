// Per-challenge participant counters stored in Firestore. These are added
// to a hardcoded seed in the UI so day-one devices don't show a lonely "4
// joined" card; the counter only ever moves up as real users enrol.
//
// Writes are atomic increments, deduplicated on the client via the user's
// `challengesEverEnrolled` state (persisted + merged across devices for the
// same account), so leave + re-enrol and new devices for the same user do
// not double-count.
//
// The Firestore rules need to allow authed users to increment this doc.
// Suggested rule:
//
//   match /challenge_stats/{challengeId} {
//     allow read: if true;
//     allow update: if request.auth != null
//       && request.resource.data.keys().hasOnly(['participants'])
//       && request.resource.data.participants is number;
//     allow create: if request.auth != null;
//   }

import { doc, getDoc, increment, setDoc } from "firebase/firestore";

import { createFirebaseDb } from "@/lib/firebase-browser";

const COLLECTION = "challenge_stats";
const PARTICIPANTS_FIELD = "participants";

export type ChallengeParticipantCounts = Record<string, number>;

export async function fetchChallengeStats(
  challengeIds: readonly string[],
): Promise<ChallengeParticipantCounts> {
  const db = createFirebaseDb();
  if (!db) return {};

  const results = await Promise.all(
    challengeIds.map(async (id) => {
      try {
        const snapshot = await getDoc(doc(db, COLLECTION, id));
        const value = snapshot.exists()
          ? Number(snapshot.data()?.[PARTICIPANTS_FIELD] ?? 0)
          : 0;
        return [id, Number.isFinite(value) && value > 0 ? value : 0] as const;
      } catch {
        return [id, 0] as const;
      }
    }),
  );

  return Object.fromEntries(results);
}

export async function incrementChallengeParticipants(
  challengeId: string,
): Promise<void> {
  const db = createFirebaseDb();
  if (!db) return;

  try {
    await setDoc(
      doc(db, COLLECTION, challengeId),
      { [PARTICIPANTS_FIELD]: increment(1) },
      { merge: true },
    );
  } catch (error) {
    // Silent: the display just shows the seed baseline if the write never
    // lands, which is strictly better than throwing and breaking enrolment.
    console.warn("Failed to increment challenge participants.", error);
  }
}
