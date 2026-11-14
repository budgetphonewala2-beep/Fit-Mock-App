import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service · Fitmonk",
  description:
    "The terms that govern your use of the Fitmonk website and mobile app.",
};

// TODO(legal): Fitmonk is not a registered legal entity yet — the operator
// (individual) is currently the responsible party. Before App Store / Play
// submission with real billing, register an entity and swap ENTITY, and have
// this reviewed by counsel (India: consumer-law + IT-rules review).
const EFFECTIVE_DATE = "14 November 2026";
const ENTITY = "Fitmonk";
const JURISDICTION = "India";
const CONTACT_EMAIL = "contact@fitmonk.online";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate={EFFECTIVE_DATE}
      lead={
        <>
          These terms are an agreement between you and {ENTITY}{" "}
          (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;). They apply
          when you use the Fitmonk website at fitmonk.online, our mobile apps,
          or any related service. Read them carefully. By using Fitmonk, you
          accept them. Questions? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </>
      }
    >
      <LegalSection heading="1. Who can use Fitmonk">
        <p>
          You must be at least 16 years old to use Fitmonk. If you&rsquo;re
          between 16 and the age of majority in your country, you confirm
          that a parent or legal guardian has reviewed these terms and agreed
          on your behalf. Fitmonk is not designed for children under 16, and
          we don&rsquo;t knowingly allow them to sign up.
        </p>
      </LegalSection>

      <LegalSection heading="2. Your account">
        <p>
          You can use Fitmonk in demo mode without an account. If you sign in
          with Google or Apple, you&rsquo;re responsible for keeping that
          account secure. You can delete your Fitmonk account at any time from
          Profile in the app or at{" "}
          <Link href="/delete-account">fitmonk.online/delete-account</Link>. Tell us right away at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you
          believe your account has been accessed without your permission.
        </p>
        <p>
          You may not create an account for anyone else, share your account,
          or use Fitmonk on behalf of a third party without our written
          permission.
        </p>
      </LegalSection>

      <LegalSection heading="3. Important health disclaimer">
        <p>
          <strong>
            Fitmonk is a general fitness tool, not medical advice.
          </strong>{" "}
          The workouts, calorie and macronutrient targets, meal suggestions,
          and coach replies inside Fitmonk are educational and informational.
          They are not medical advice, diagnosis, or treatment, and they are
          not a substitute for professional guidance from a qualified
          doctor, dietitian, or trainer.
        </p>
        <p>
          Before starting any exercise or nutrition program, and especially
          if you are pregnant, breastfeeding, under 18, over 65, injured,
          managing a chronic condition (including diabetes, cardiovascular
          disease, or an eating disorder), or taking prescription medication,
          consult a qualified healthcare professional.
        </p>
        <p>
          You use Fitmonk at your own risk. If you feel pain, dizziness,
          shortness of breath, or any other worrying symptom during a
          workout, stop immediately and seek medical attention. We are not
          responsible for injuries, health outcomes, or losses that result
          from using the app.
        </p>
      </LegalSection>

      <LegalSection heading="4. AI-generated content">
        <p>
          Parts of Fitmonk, including the meal parser, the in-app coach, and
          workout variations, use artificial intelligence. AI output can be
          incorrect, incomplete, or outdated, especially for nutrition
          numbers and exercise guidance. Always apply your own judgment, and
          consult a professional for anything that matters. Do not rely on
          AI output for medical, legal, or financial decisions. AI features
          are optional: they run only after you allow them, and you can turn
          them off in Profile at any time. See our{" "}
          <Link href="/privacy">Privacy Policy</Link> for what is shared with
          our AI provider.
        </p>
      </LegalSection>

      <LegalSection heading="5. Subscriptions and payments">
        <p>
          Fitmonk offers free features and paid subscriptions. Paid plans
          renew automatically at the price and interval shown when you
          subscribe, unless you cancel before the renewal date.
        </p>
        <ul>
          <li>
            <strong>Mobile purchases</strong> are billed by Apple App Store
            or Google Play under their terms. Plans are Starter, Pro and
            Elite, each billed every 3 months or every year at the price
            shown on the paywall before you confirm.
          </li>
          <li>
            <strong>Auto-renewal.</strong> Payment is charged to your Apple
            ID or Google account when you confirm the purchase. Your
            subscription renews automatically unless auto-renew is turned
            off at least 24 hours before the end of the current period, and
            your account is charged for renewal within 24 hours before the
            end of the current period. Manage or cancel your subscription in
            your App Store or Google Play account settings, not inside
            Fitmonk. Deleting the app or your Fitmonk account does not cancel
            your subscription.
          </li>
          <li>
            <strong>Refunds</strong> are handled by the store you purchased
            from (Apple or Google). We can&rsquo;t issue refunds directly for
            store purchases.
          </li>
          <li>
            <strong>Trials, if offered,</strong> will convert to a paid
            subscription at the end of the trial unless you cancel at least
            24 hours before it ends. Any unused portion of a free trial is
            forfeited when you purchase a subscription.
          </li>
          <li>
            <strong>Price changes</strong> take effect at your next renewal.
            We&rsquo;ll notify you before a material increase.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>Copy, resell, or redistribute the app or its content;</li>
          <li>Reverse-engineer, decompile, or extract source code, except where local law expressly permits it;</li>
          <li>Scrape, mass-download, or overload our servers;</li>
          <li>Bypass paywalls, trials, or usage limits;</li>
          <li>Use Fitmonk to harass, harm, or deceive other people;</li>
          <li>Upload content that infringes intellectual property, is unlawful, defamatory, hateful, sexual, or harmful, or that contains malware;</li>
          <li>Use the coach or any AI feature to generate content that violates the OpenAI usage policies we&rsquo;re bound by.</li>
        </ul>
        <p>
          We can suspend or close your account without notice if you break
          these rules.
        </p>
      </LegalSection>

      <LegalSection heading="7. Your content">
        <p>
          You keep ownership of the meals, notes, and messages you enter into
          Fitmonk. You grant us a worldwide, royalty-free license to store,
          process, and display that content <em>only</em> to run Fitmonk for
          you (for example, to save your meal history, generate summaries,
          and share your workouts across your own devices). We don&rsquo;t
          use your content to train AI models.
        </p>
      </LegalSection>

      <LegalSection heading="8. Our content">
        <p>
          Fitmonk&rsquo;s software, design, brand, workout library, and
          content are owned by {ENTITY} and its licensors. You may use them
          only through the app as intended. Nothing in these terms transfers
          any intellectual property to you.
        </p>
      </LegalSection>

      <LegalSection heading="9. Third-party services">
        <p>
          Fitmonk relies on services from Google (Firebase), OpenAI,
          Qonversion, Apple, and Google Play. Your use of those services
          through Fitmonk is also subject to their terms. We&rsquo;re not
          responsible for their availability or their content.
        </p>
      </LegalSection>

      <LegalSection heading="10. Termination">
        <p>
          You can stop using Fitmonk at any time. You can delete your account
          from inside the app or by emailing{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We can
          suspend or terminate your access if you violate these terms, if
          required by law, or if we discontinue the service. Sections that
          by their nature should survive termination (disclaimers, limits
          on liability, ownership, dispute rules) do survive.
        </p>
      </LegalSection>

      <LegalSection heading="11. Disclaimers">
        <p>
          Fitmonk is provided <strong>&ldquo;as is&rdquo; and &ldquo;as
          available.&rdquo;</strong> To the maximum extent permitted by law,
          we disclaim all warranties, express or implied, including
          merchantability, fitness for a particular purpose, and
          non-infringement. We don&rsquo;t warrant that the app will be
          uninterrupted, error-free, secure, or accurate, or that any result
          you get from using it will meet your goals.
        </p>
      </LegalSection>

      <LegalSection heading="12. Limitation of liability">
        <p>
          To the maximum extent permitted by law, {ENTITY} and its officers,
          employees, and agents will not be liable for any indirect,
          incidental, special, consequential, or punitive damages, or for
          any loss of profits, revenues, data, or goodwill, arising out of
          or in connection with your use of Fitmonk. Our total liability for
          any claim relating to Fitmonk will not exceed the greater of the
          amount you paid us in the 12 months before the claim, or USD $50.
        </p>
        <p>
          Some jurisdictions don&rsquo;t allow certain limitations, so parts
          of this section may not apply to you. Nothing here limits liability
          that cannot be limited under applicable law (such as fraud, gross
          negligence, or personal injury caused by our negligence).
        </p>
      </LegalSection>

      <LegalSection heading="13. Indemnity">
        <p>
          You agree to indemnify and hold {ENTITY} harmless from claims,
          damages, and expenses (including reasonable legal fees) arising
          out of your misuse of Fitmonk, your violation of these terms, or
          your violation of any third party&rsquo;s rights.
        </p>
      </LegalSection>

      <LegalSection heading="14. Governing law and disputes">
        <p>
          These terms are governed by the laws of {JURISDICTION}, without
          regard to conflict-of-laws rules. Any dispute will be resolved by
          the competent courts of {JURISDICTION}, unless mandatory local
          consumer law in your country gives you the right to bring
          proceedings elsewhere.
        </p>
      </LegalSection>

      <LegalSection heading="15. Changes to these terms">
        <p>
          We may update these terms as Fitmonk evolves. If a change is
          material, we&rsquo;ll notify you inside the app and update the
          effective date above. Continued use after a change means you
          accept the updated terms. If you don&rsquo;t agree, stop using
          Fitmonk and cancel any active subscription.
        </p>
      </LegalSection>

      <LegalSection heading="16. Additional terms for Apple users">
        <p>
          If you downloaded Fitmonk from the Apple App Store, the following
          also applies:
        </p>
        <ul>
          <li>
            These terms are between you and {ENTITY} only, not Apple. {ENTITY},
            not Apple, is solely responsible for the app and its content.
          </li>
          <li>
            Your licence to use the app is limited to a non-transferable
            licence to use it on Apple-branded products you own or control, as
            permitted by the Usage Rules in the Apple Media Services Terms and
            Conditions.
          </li>
          <li>
            {ENTITY} is solely responsible for maintenance and support of the
            app (contact {CONTACT_EMAIL}). Apple has no obligation to provide
            any maintenance or support.
          </li>
          <li>
            If the app fails to conform to any applicable warranty, you may
            notify Apple and Apple will refund the purchase price (if any) for
            the app. To the maximum extent permitted by law, Apple has no other
            warranty obligation with respect to the app.
          </li>
          <li>
            {ENTITY}, not Apple, is responsible for addressing any claims by
            you or a third party relating to the app, including product
            liability claims, claims that the app fails to meet any legal or
            regulatory requirement, and consumer protection or privacy claims.
          </li>
          <li>
            If a third party claims the app or your use of it infringes their
            intellectual property rights, {ENTITY}, not Apple, is solely
            responsible for the investigation, defence, settlement and
            discharge of that claim.
          </li>
          <li>
            You confirm that you are not located in a country subject to a
            U.S. Government embargo or designated as a &ldquo;terrorist
            supporting&rdquo; country, and that you are not on any U.S.
            Government list of prohibited or restricted parties.
          </li>
          <li>
            You must comply with applicable third-party terms (for example,
            your mobile carrier&rsquo;s) when using the app.
          </li>
          <li>
            Apple and its subsidiaries are third-party beneficiaries of these
            terms and, once you accept them, Apple has the right to enforce
            them against you as a third-party beneficiary.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="17. Contact">        <p>
          {ENTITY}
          <br />
          Governed by the laws of {JURISDICTION}
          <br />
          Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          See also our{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
