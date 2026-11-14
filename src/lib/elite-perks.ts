// Edit this list to tell Elite members what is coming next. Keep each entry
// short — the profile card shows title plus one line of context. Clear the
// list to show the empty "you are all caught up" state.
export type EliteUpcomingFeature = {
  id: string;
  title: string;
  blurb: string;
  // Optional ETA copy, e.g. "This month", "Early December", "Soon".
  eta?: string;
};

export const ELITE_UPCOMING_FEATURES: EliteUpcomingFeature[] = [];

const WHATSAPP_NUMBER = "918957225934";
const SUPPORT_EMAIL = "contact@fitmonk.online";

export function buildEliteWhatsAppUrl(userEmail: string | null | undefined) {
  const greeting = userEmail
    ? `Hi Fitmonk team, I'm an Elite member (${userEmail}) and I'd like help with`
    : "Hi Fitmonk team, I'm an Elite member and I'd like help with";
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(greeting + " ")}`;
}

export function buildEliteMailtoUrl(userEmail: string | null | undefined) {
  const subject = "[Elite] Priority support request";
  const body = userEmail
    ? `Elite member: ${userEmail}\n\nHow can we help?`
    : "How can we help?";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
