# iOS build checklist

The Xcode project is generated and configured (bundle id `app.fitmonk.shell`,
iPhone only, iOS 15+, entitlements, privacy manifest, Info.plist, Podfile,
icons, splash). Building needs a
Mac with **Xcode 26+** (App Store uploads must use the iOS 26 SDK since
28 April 2026) and CocoaPods. Everything below is a one-time setup that
needs your Apple / Firebase accounts.

## 1. Apple Developer

1. Certificates, IDs & Profiles → Identifiers → register App ID
   **`app.fitmonk.shell`** with capabilities:
   - Push Notifications
   - Sign in with Apple
   - In-App Purchase (on by default)
2. Keys → create an **APNs auth key** (.p8). It's needed for Firebase below.
3. App Store Connect → create the app with that bundle id, then the
   subscriptions (see `mobile/README.md` → Payments).

## 2. Firebase

1. Firebase console → project `dietfit-f1353` → Add app → iOS, bundle id
   `app.fitmonk.shell`.
2. Download **`GoogleService-Info.plist`**. In Xcode, drag it into
   `Runner/` (tick "Copy items" and the Runner target). Without it Firebase,
   push and Google sign-in are off on iOS; the app still runs.
3. Open the plist, copy **`REVERSED_CLIENT_ID`** into
   `ios/Flutter/GoogleSignIn.xcconfig`:
   ```
   GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.892922968455-xxxx
   ```
   That is the URL scheme Google sign-in returns to.
4. Project settings → Cloud Messaging → Apple app configuration → upload the
   APNs auth key (Key ID + Team ID).
5. Authentication → Sign-in method → enable **Apple**. Fill in the Services
   ID, Apple Team ID, Key ID and private key (a Sign in with Apple key from
   Apple Developer → Keys). Native sign-in works without them, but the token
   revocation Apple requires when an account is deleted needs them.

## 3. Build

```bash
cd mobile
flutter pub get
cd ios && pod install && cd ..
open ios/Runner.xcworkspace        # set your Team under Signing & Capabilities
flutter run --dart-define-from-file=env.json          # device / simulator
flutter build ipa --release --dart-define-from-file=env.json
```

Upload the `.ipa` with Xcode Organizer or Transporter, then test purchases
on TestFlight with a sandbox tester.

## App Store Connect

Metadata, age rating, App Privacy answers, subscription products, review
notes and screenshot sizes: **[APP_STORE_SUBMISSION.md](APP_STORE_SUBMISSION.md)**.

## App Review notes (summary)

- **4.8 Login services**: Sign in with Apple is offered next to Google
  (onboarding splash and `/sign-in`, iOS app only).
- **3.1.1 In-app purchase**: every plan in the app is sold through StoreKit.
  The paywall has Restore Purchases, Terms and Privacy links, and the
  renewal terms.
- **5.1.1(v) Account deletion**: `/delete-account` in the app.
- Give the reviewer a demo account, or mention "Use demo mode" on the
  sign-in screen.
- Privacy "nutrition label": camera (meal photos), microphone and speech
  (voice logging), email/name (account), purchase history, analytics
  (Firebase), user content (meals and workouts).
