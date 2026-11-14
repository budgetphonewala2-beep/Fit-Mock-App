# Fitmonk: App Store submission pack

Everything App Store Connect asks for, matched to how the app actually
behaves. Build setup (certificates, Firebase, Xcode) is in
[`README.md`](README.md). Researched against the App Review Guidelines and
Apple developer news, November 2026.

---

## 0. Before you upload: blockers

1. **Deploy the web app first.** The iOS app loads
   `https://www.fitmonk.online`, so App Review sees whatever is live. These
   changes must be in production before review: Sign in with Apple, real
   StoreKit paywall, AI consent sheet, legal pages, native speech.
2. **Build with Xcode 26 / iOS 26 SDK or later.** Required for every upload
   since 28 April 2026.
3. **Qonversion key set** in `mobile/env.json` and all 6 subscriptions
   approved for sale (or submitted with the build). The paywall must show
   real store prices.
4. **`GoogleService-Info.plist`** added and `GOOGLE_REVERSED_CLIENT_ID` set
   (see README), or Google sign-in fails on iOS. Reviewers *will* tap it.
5. **Firebase → Authentication → Apple** enabled **with** Services ID, Apple
   Team ID, Key ID and private key filled in. Sign-in works without them, but
   the token revocation Apple requires on account deletion does not.
6. Test on a real iPhone via TestFlight with a **sandbox tester**: buy, cancel
   the sheet, restore, delete account, voice log a meal, snap a meal photo,
   receive a push.

---

## 1. App information

| Field | Value |
|---|---|
| Name | Fitmonk |
| Subtitle (≤30) | AI workout & diet coach |
| Bundle ID | app.fitmonk.shell |
| SKU | fitmonk-ios |
| Primary category | Health & Fitness |
| Secondary category | Food & Drink (optional) |
| Privacy Policy URL | https://fitmonk.online/privacy |
| Terms of Use (EULA) | https://fitmonk.online/terms (custom EULA: it carries the Apple-required terms, section 16) |
| Support URL | https://fitmonk.online (shows contact@fitmonk.online) |
| Marketing URL | https://fitmonk.online |
| Account deletion | In app (Profile → Delete account) and https://fitmonk.online/delete-account |
| Copyright | 2026 Fitmonk |

Add the Terms link to the **App Description** too (Apple wants the EULA
reachable from the listing for subscription apps):

> Terms of Use: https://fitmonk.online/terms · Privacy: https://fitmonk.online/privacy

### Age rating: use 16+, not 4+

Your own Terms (section 1) and Privacy Policy (section 9) say Fitmonk is
**not for anyone under 16**. Listing it as 4+ contradicts them. A 4+ rating
also has to be justified for an open-ended AI chat and calorie/weight
targets. Answer the questionnaire honestly (2.3.6):

- Medical / treatment information: **Infrequent/Mild** (general fitness and
  nutrition guidance; the app tells users to consult a doctor).
- Unrestricted web access: **No** (only fitmonk.online loads in-app;
  everything else opens in Safari).
- User-generated content shared with others / social feed: **No** (Coach
  chats are private).
- AI / chatbot: **Yes**, if asked.
- In-app controls (parental): **No**.
- Then set **Age Rating Override → 16+** to match the Terms. If you'd
  rather target 13+, change the age in Terms §1 and Privacy §9 first.

From 16 Nov 2026 App Store Connect adds new content descriptors (e.g. sharing
real-world location: **No**). Complete them before **12 Jan 2027** or
updates are blocked.

---

## 2. App Privacy ("nutrition label")

Matches `Runner/PrivacyInfo.xcprivacy` and the Privacy Policy.
**Tracking: No** (no IDFA, no ad SDKs, so no App Tracking Transparency
prompt is needed).

| Data type | Linked to user | Tracking | Purposes |
|---|---|---|---|
| Contact info → Email address | Yes | No | App functionality |
| Contact info → Name | Yes | No | App functionality |
| Health & Fitness → Health (weight, height, age, sex, injuries, readiness) | Yes | No | App functionality, Product personalization |
| Health & Fitness → Fitness (workout logs) | Yes | No | App functionality, Product personalization |
| User content → Photos or videos (meal photos, Coach attachments) | Yes | No | App functionality |
| User content → Other user content (meal logs, Coach messages) | Yes | No | App functionality, Product personalization |
| Purchases → Purchase history | Yes | No | App functionality |
| Identifiers → User ID | Yes | No | App functionality |
| Identifiers → Device ID | No | No | Analytics, App functionality |
| Usage data → Product interaction | No | No | Analytics |

Not collected: location, contacts, audio (speech is turned into text on the
device/Apple and only text reaches us), browsing history, financial info,
sensitive info, diagnostics beyond the above.

---

## 3. Subscriptions (In-App Purchases)

**Subscription group:** `Fitmonk` (one group so users can't hold two plans,
guideline 3.1.2(b)). Rank from highest to lowest: Elite yearly, Elite
quarterly, Pro yearly, Pro quarterly, Starter yearly, Starter quarterly.

| Product ID | Reference name | Duration | India price | Intro offer |
|---|---|---|---|---|
| fitmonk_starter_quarterly | Starter Quarterly | 3 months | ₹599 | none |
| fitmonk_starter_yearly | Starter Yearly | 1 year | ₹1,999 | 1-week free trial |
| fitmonk_pro_quarterly | Pro Quarterly | 3 months | ₹1,719 | none |
| fitmonk_pro_yearly | Pro Yearly | 1 year | ₹5,499 | 1-week free trial |
| fitmonk_elite_quarterly | Elite Quarterly | 3 months | ₹7,499 | none |
| fitmonk_elite_yearly | Elite Yearly | 1 year | ₹24,999 | 1-week free trial |

App Store product IDs can be the same strings as the Qonversion product IDs
(simplest). Link each in Qonversion. For every subscription, add a display
name and description (e.g. "Pro: adaptive home workouts and a personalised
diet plan"), plus a **review screenshot of the paywall**.

The paywall already meets 3.1.2(c) and Schedule 2: plan name, length and
price per period, what each tier includes, trial length and the price
after it, an auto-renew statement, Restore Purchases, and Terms + Privacy
links.

Elite's "1-on-1 trainer call" is booked through Calendly in Safari. That's a
service *included* in the subscription, not a separate purchase, so it's
fine under 3.1.1. Don't add any "buy on our website" link anywhere in the
app (3.1.1 / 3.1.3).

---

## 4. App Review information

- **Sign-in required?** No. Reviewers can use **"Use demo mode"** on the
  sign-in screen. Still provide a Google test account if you have one.
- **Contact:** your name, phone, contact@fitmonk.online.
- **Notes for review** (paste and edit):

> Fitmonk is a fitness and nutrition coach. The iOS app is a native shell around
> our web app with native iOS features:
> • Sign in with Apple and native Google Sign-In (onboarding and Sign-in screens)
> • Subscriptions sold only through In-App Purchase (StoreKit, via Qonversion);
>   Restore Purchases is on the paywall; Profile → Manage subscription opens
>   the App Store subscription page
> • Native speech recognition for voice meal logging and the AI Coach
> • Camera capture for meal photos, push notifications (optional, never required),
>   haptics, native share sheet
> • Account deletion: Profile → Delete account (also revokes Sign in with Apple)
>
> AI: meal analysis and the Coach use OpenAI. Before any data is sent, the app
> shows a consent sheet naming OpenAI and what is shared (guideline 5.1.2(i)).
> Users can decline (meals are then estimated on-device) and change it later in
> Profile → AI features.
>
> To test without an account: tap "Use demo mode" on the sign-in screen, then
> complete onboarding. To test purchases use a sandbox account. The 7-day trial
> applies to yearly plans.
>
> Health: guidance is general fitness information, not medical advice. The app
> and Terms tell users to consult a doctor.

---

## 5. Screenshots

iPhone only (the app doesn't support iPad), PNG/JPEG, no transparency,
1–10 each:

- **6.9" (required set): 1320 × 2868** portrait (1290 × 2796 also accepted),
  or provide the 6.5" set at 1284 × 2778.
- Suggested set: Workout today, Exercise player, Diet log with photo result,
  AI Coach chat, Progress/streak, Paywall. No real user data (2.3.9), and
  only show prices that match the store.

`npm run landing:screenshots` can capture web screens. Frame them at the
sizes above.

---

## 6. Other checks

- **Export compliance:** answered in Info.plist
  (`ITSAppUsesNonExemptEncryption = NO`; HTTPS only).
- **Content rights:** you own or license the workout videos and images.
- **EU Digital Services Act:** if you distribute in the EU you must declare
  trader status. Traders show an address, phone and email on the listing.
  Or limit availability (e.g. India first) under Pricing & Availability.
- **Seller name:** an individual developer account lists your legal name.
  The legal pages say "Fitmonk"; when you register a company, update `ENTITY`
  in `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`.
- **Minimum functionality (4.2):** the native features above are what lift
  this beyond a repackaged website. Keep them working; a reviewer finding a
  dead mic or broken sign-in is the most likely rejection.
