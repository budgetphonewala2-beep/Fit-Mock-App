import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Fitmonk",
  description:
    "How Fitmonk collects, uses, shares, and protects your personal information.",
};

// TODO(legal): Fitmonk is not a registered legal entity yet — the operator
// (individual) is currently the responsible party. Before App Store / Play
// submission with real billing, register an entity and swap ENTITY, and have
// this reviewed by counsel (India: DPDP Act compliance is the priority).
const EFFECTIVE_DATE = "30 October 2026";
const ENTITY = "Fitmonk";
const JURISDICTION = "India";
const CONTACT_EMAIL = "contact@fitmonk.online";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate={EFFECTIVE_DATE}
      lead={
        <>
          This policy explains what {ENTITY}{" "}(&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; &ldquo;our&rdquo;) collects when you use the
          Fitmonk website and mobile app, why we collect it, who we share it
          with, and the choices you have. If anything here is unclear, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </>
      }
    >
      <LegalSection heading="1. Who this policy applies to">
        <p>
          This policy applies to the Fitmonk web app at fitmonk.online, the
          Fitmonk iOS and Android apps, and any content or feature that links
          to this policy. It does not apply to third-party services we
          integrate with, which each have their own policies (listed in
          section 5).
        </p>
      </LegalSection>

      <LegalSection heading="2. Information you give us">
        <p>To make Fitmonk useful, we ask you to share:</p>
        <ul>
          <li>
            <strong>Account information:</strong> when you sign in with
            Google, we receive your email address, display name, and profile
            photo URL from your Google account. You can instead use demo mode,
            which stores everything locally in your browser and requires no
            account.
          </li>
          <li>
            <strong>Onboarding answers:</strong> your fitness goal, experience
            level, workout setup (home or gym), injuries or limitations, and
            food preferences.
          </li>
          <li>
            <strong>Body metrics:</strong> height, weight, age, and sex, used
            to calculate calorie and macronutrient targets.
          </li>
          <li>
            <strong>Daily activity:</strong> readiness check-ins (sleep,
            energy, soreness, stress), workout logs, meal descriptions you
            type in, and progress data (streaks, points, achievements).
          </li>
          <li>
            <strong>Coach messages:</strong> anything you type to the in-app
            coach.
          </li>
          <li>
            <strong>Photos you choose to share:</strong> a meal photo you take
            is sent to our server and OpenAI to estimate its nutrition, and is
            not stored. A photo or video you attach to a Coach message is saved
            with that chat in your account until you delete it or your
            account; attached photos are also sent to OpenAI so the coach can
            look at them.
          </li>
          <li>
            <strong>Voice input:</strong> when you use the microphone to log a
            meal or ask the coach, your device&rsquo;s speech service turns it
            into text. We receive only the text, never the audio.
          </li>
        </ul>
        <p>
          You can use most of the app without an account by staying in demo
          mode. In demo mode, this data lives only in your browser and is not
          sent to our servers.
        </p>
      </LegalSection>

      <LegalSection heading="3. Information collected automatically">
        <ul>
          <li>
            <strong>Analytics events:</strong> on our mobile apps, Firebase
            Analytics records events like screen views, workout completions,
            and paywall interactions along with an anonymous installation
            identifier. You can opt out in your device settings.
          </li>
          <li>
            <strong>Push notification tokens:</strong> if you enable
            notifications, Firebase Cloud Messaging assigns a token to your
            device so we can send reminders and coach nudges. You can revoke
            this in your device settings at any time.
          </li>
          <li>
            <strong>Device information:</strong> on mobile, we read the
            platform (iOS/Android), app version, and build number for
            diagnostics.
          </li>
          <li>
            <strong>Subscription state:</strong> on mobile, our subscription
            partner Qonversion records which entitlements are active for your
            device and account so we know whether to unlock paid features.
          </li>
          <li>
            <strong>Local storage:</strong> the web app uses your browser&rsquo;s
            local storage to keep your data available offline. Clearing your
            browser data will remove it.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect your location, contacts,
          microphone audio, or health-kit data, and we never access your photo
          library: a photo only reaches us when you take or pick it yourself.
          If a future feature needs more, we will ask for permission at the
          point of use and update this policy first.
        </p>
      </LegalSection>

      <LegalSection heading="4. How we use your information">
        <ul>
          <li>Personalize your workout plan, macro targets, and meal suggestions.</li>
          <li>Parse the meals you type and estimate their nutrition.</li>
          <li>Adapt each day&rsquo;s workout to your readiness check-in.</li>
          <li>Answer your questions in the in-app coach.</li>
          <li>Send reminders and updates through push notifications (only if you enable them).</li>
          <li>Debug crashes and improve the product.</li>
          <li>Provide paid features to subscribers and prevent abuse.</li>
        </ul>
        <p>
          We do not sell your personal information. We do not use your data
          for cross-context behavioral advertising.
        </p>
      </LegalSection>

      <LegalSection heading="5. Who we share information with">
        <p>
          We use a small number of processors to run Fitmonk. Each receives
          only what it needs, and each is bound by its own privacy terms.
        </p>
        <ul>
          <li>
            <strong>Google / Firebase:</strong> Authentication, Firestore
            (your profile, logs, and progress), Analytics, Cloud Messaging.
            See <a href="https://firebase.google.com/support/privacy" target="_blank" rel="noopener">Firebase&rsquo;s privacy page</a>.
          </li>
          <li>
            <strong>OpenAI:</strong> meal descriptions you type, meal photos
            you analyse, coach messages and the photos you attach to them, and
            workout-planning context are sent to OpenAI&rsquo;s API
            to generate nutrition estimates, coach replies, and workout
            variations. Per OpenAI&rsquo;s policy, API data is not used to train
            their models. See <a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener">OpenAI&rsquo;s policy</a>.
          </li>
          <li>
            <strong>Qonversion:</strong> manages your subscription state on
            iOS and Android and reads receipts from the app stores. See{" "}
            <a href="https://qonversion.io/privacy" target="_blank" rel="noopener">Qonversion&rsquo;s policy</a>.
          </li>
          <li>
            <strong>Apple App Store &amp; Google Play:</strong> process your
            in-app purchases and subscriptions. We never see your card
            details. See <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener">Apple</a> and{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google</a>.
          </li>
        </ul>
        <p>
          We may also disclose information if required by law, to protect
          rights and safety, or as part of a merger, acquisition, or sale of
          assets, in which case we will notify you before your information
          becomes subject to a different policy.
        </p>
      </LegalSection>

      <LegalSection heading="6. International data transfers">
        <p>
          Fitmonk is a global product. Our processors (Google, OpenAI,
          Qonversion) store and process data in the United States and other
          countries. Where required by law, we rely on Standard Contractual
          Clauses or equivalent transfer mechanisms.
        </p>
      </LegalSection>

      <LegalSection heading="7. How long we keep information">
        <p>
          We keep your account data for as long as your account is active.
          You can delete your account at any time from your profile in the
          app (it&rsquo;s removed straight away) or by email, as described on{" "}
          <Link href="/delete-account">fitmonk.online/delete-account</Link>.
          Email requests are completed within 30 days. Either way we delete
          your profile, logs, progress, and Coach chats from Firestore, except where we must keep
          records for legal or accounting reasons (for example, subscription
          receipts), in which case we keep only what is required, for as
          long as required, and delete the rest.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your rights">
        <p>
          Depending on where you live, you may have the right to access,
          correct, export, or delete your personal information; to object to
          or restrict certain processing; and to withdraw consent. You can
          exercise these rights inside the app for most data (profile,
          onboarding answers, logs) or by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We&rsquo;ll
          respond within the timeframe required by your local law.
        </p>
        <p>
          <strong>EEA/UK residents:</strong> the legal bases we rely on are
          performance of our contract with you (to deliver the app),
          legitimate interests (product improvement and abuse prevention),
          consent (push notifications, optional analytics), and legal
          obligation.
        </p>
        <p>
          <strong>California residents:</strong> we do not sell your personal
          information or share it for cross-context behavioral advertising.
          You have the right to know, delete, correct, and not be
          discriminated against for exercising these rights.
        </p>
      </LegalSection>

      <LegalSection heading="9. Children">
        <p>
          Fitmonk is not intended for children under 16. We do not knowingly
          collect information from children under 16. If you believe a child
          has provided us with personal information, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we will
          delete it.
        </p>
      </LegalSection>

      <LegalSection heading="10. Health information disclaimer">
        <p>
          The information Fitmonk generates (workout plans, calorie and
          macronutrient targets, coach replies) is for general fitness
          guidance only. It is not medical advice, diagnosis, or treatment,
          and it is not a substitute for consultation with a qualified
          healthcare professional. Do not rely on Fitmonk for medical
          decisions. See our{" "}
          <Link href="/terms">Terms of Service</Link> for the full
          disclaimer.
        </p>
      </LegalSection>

      <LegalSection heading="11. Security">
        <p>
          Your data is encrypted in transit (HTTPS/TLS) and at rest within
          Firestore. No system is perfectly secure, so we cannot guarantee
          absolute security, but we take reasonable steps to protect your
          information and to notify you if a breach affects it.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to this policy">
        <p>
          When we make material changes, we&rsquo;ll notify you inside the app
          and update the effective date above. Continued use of Fitmonk after
          a change means you accept the updated policy.
        </p>
      </LegalSection>

      <LegalSection heading="13. Contact">
        <p>
          {ENTITY}
          <br />
          Governed by the laws of {JURISDICTION}
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
