import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Delete your account · Fitmonk",
  description:
    "How to delete your Fitmonk account and the data linked to it.",
};

// Public on purpose: Google Play requires a web page where people can find
// out how to delete their account without having the app installed.
const EFFECTIVE_DATE = "30 October 2026";
const CONTACT_EMAIL = "contact@fitmonk.online";

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      effectiveDate={EFFECTIVE_DATE}
      lead={
        <>
          You can delete your Fitmonk account and its data at any time, from
          inside the app or by email. Deleting it can&rsquo;t be undone.
        </>
      }
    >
      <LegalSection heading="Delete it in the app">
        <ol>
          <li>Open Fitmonk and sign in with the Google or Apple account you use for it.</li>
          <li>Go to your profile (the avatar at the top of the Challenges screen).</li>
          <li>Scroll to the bottom and tap <strong>Delete account</strong>.</li>
          <li>
            Confirm. Google or Apple may ask you to confirm your account again to
            make sure it&rsquo;s you.
          </li>
        </ol>
        <p>Your account and data are deleted straight away and you&rsquo;re signed out.</p>
      </LegalSection>

      <LegalSection heading="Ask us to delete it">
        <p>
          If you can&rsquo;t open the app, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Delete%20my%20Fitmonk%20account`}>
            {CONTACT_EMAIL}
          </a>{" "}
          from the email address on your Fitmonk account (for Sign in with Apple,
          the address Apple shared with us), with the subject
          &ldquo;Delete my Fitmonk account&rdquo;. We&rsquo;ll delete it within
          30 days and reply to confirm.
        </p>
      </LegalSection>

      <LegalSection heading="What gets deleted">
        <ul>
          <li>Your account and its Google or Apple sign-in link with Fitmonk (for Apple, we also revoke Fitmonk&rsquo;s access to your Apple ID)</li>
          <li>Your profile: goal, body metrics, diet preferences and injuries</li>
          <li>Your plan, meal logs, workout logs, water logs and readiness check-ins</li>
          <li>Your Coach chats, including any photos you attached</li>
          <li>Your streaks, challenges and progress</li>
        </ul>
      </LegalSection>

      <LegalSection heading="What we may keep">
        <p>
          If you bought a subscription, the purchase receipt may be kept for as
          long as tax and accounting law requires, and nothing else with it.
          Deleting your account doesn&rsquo;t cancel a subscription bought
          through Google Play or the App Store; cancel it in your store account
          settings.
        </p>
        <p>
          Usage analytics from the mobile app aren&rsquo;t linked to your name or
          email, and Firebase removes them automatically under its retention
          settings.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
