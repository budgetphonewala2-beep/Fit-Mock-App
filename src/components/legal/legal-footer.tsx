import Link from "next/link";

interface LegalFooterProps {
  // Copy shown before the links. Defaults to the sign-in/paywall wording
  // App Review looks for on any screen that gates the account or a purchase.
  lead?: string;
}

// Small dark-theme footer used on sign-in and paywall to link the two
// legal pages. Both surfaces sit on Fitmonk's dark stage, so the muted
// sand-100/66 tone matches the existing captions already on those screens.
export function LegalFooter({
  lead = "By continuing, you agree to our",
}: LegalFooterProps) {
  return (
    <p className="text-center text-caption text-sand-100/60">
      {lead}{" "}
      <Link
        href="/terms"
        className="font-semibold text-sand-100/80 underline underline-offset-2 hover:text-sand-100"
      >
        Terms
      </Link>{" "}
      &middot;{" "}
      <Link
        href="/privacy"
        className="font-semibold text-sand-100/80 underline underline-offset-2 hover:text-sand-100"
      >
        Privacy Policy
      </Link>
    </p>
  );
}
