# Fitmonk mobile shell (Android + iOS)

Flutter WebView shell that wraps the production web app at `fitmonk.online` and
exposes native capabilities to it through one JavaScript bridge
(`window.FitmonkBridge`): in-app subscriptions (App Store / Google Play
Billing via Qonversion), native Google and Apple sign-in, push and local
notifications, permissions, haptics, share and device info.

| | Android | iOS |
|---|---|---|
| App id | `app.fitmonk.fitmonk_shell` | `app.fitmonk.shell` |
| Min OS | Android 6 (API 23) | iOS 15 |
| Payments | Google Play Billing | App Store In-App Purchase (StoreKit) |
| Sign-in | Google | Sign in with Apple + Google |

## Layout

```
mobile/
├── pubspec.yaml
├── env.example.json              # copy to env.json (git-ignored)
├── lib/
│   ├── main.dart                 # runApp, then services in the background
│   ├── config/env.dart           # URL, Qonversion key, allowed hosts
│   ├── webview/
│   │   ├── shell_webview.dart    # InAppWebView + bridge wiring
│   │   └── bridge_bootstrap.dart # JS installed at document start
│   ├── bridge/
│   │   ├── bridge.dart           # method → service router
│   │   ├── bridge_error.dart     # typed error codes for the web side
│   │   └── web_channel.dart      # native → web events (queued until ready)
│   └── services/                 # analytics, auth, purchases, notifications,
│                                 # permissions, device, haptics
├── android/                      # Gradle project (checked in)
└── ios/                          # Xcode project (checked in), see ios/README.md
```

## Run

```bash
cd mobile
cp env.example.json env.json      # then fill in QONVERSION_PROJECT_KEY
flutter pub get
flutter run --dart-define-from-file=env.json
```

`env.json` keys:

| Key | What |
|---|---|
| `FITMONK_SHELL_URL` | Page the shell opens. Default `https://www.fitmonk.online/workout`. Use `http://<your-LAN-ip>:4000/workout` only with an allowed host added in `lib/config/env.dart`. |
| `QONVERSION_PROJECT_KEY` | Qonversion project key. Empty = purchases disabled (the paywall says subscriptions are unavailable). |
| `DEBUG_BRIDGE` | `true` logs every bridge call. |

Release builds:

```bash
flutter build appbundle --release --dart-define-from-file=env.json   # Play
flutter build ipa       --release --dart-define-from-file=env.json   # App Store (macOS only)
```

Android release signing reads `android/key.properties` (git-ignored); without
it release builds are debug-signed and Play rejects them. iOS has its own
checklist in [`ios/README.md`](ios/README.md).

Requires JDK 17 for Android builds (`flutter config --jdk-dir=<jdk17>`);
Gradle 8.14 does not run on Java 21+.

## Payments: App Store and Google Play only

Inside the app every plan is sold through the platform store (Apple and
Google require this for digital subscriptions; Apple Pay cannot be used for
them). Qonversion wraps StoreKit and Play Billing, validates receipts and
gives both platforms the same entitlements.

### 1. Store products

Create auto-renewing subscriptions with the same prices as
`src/lib/pricing.ts`:

| Tier | Quarterly | Yearly (7-day free trial) |
|---|---|---|
| Starter | ₹599 | ₹1,999 |
| Pro | ₹1,719 | ₹5,499 |
| Elite | ₹7,499 | ₹24,999 |

- **App Store Connect** → your app → Subscriptions: one subscription group
  "Fitmonk", six subscriptions (e.g. `fitmonk_pro_yearly`). Add the free-trial
  introductory offer to the yearly ones. Rank them Elite > Pro > Starter so
  upgrades work.
- **Play Console** → Monetize → Subscriptions: three subscriptions
  (`fitmonk_starter`, `fitmonk_pro`, `fitmonk_elite`), each with base plans
  `quarterly` (3 months) and `yearly` (1 year, free-trial offer).

### 2. Qonversion dashboard

- Connect the App Store (App Store Connect API key + shared secret) and Google
  Play (service account) to the project.
- **Products**: create these six **Qonversion product ids**. The web app
  sends exactly these (`src/lib/store-billing.ts`):
  `fitmonk_starter_quarterly`, `fitmonk_starter_yearly`,
  `fitmonk_pro_quarterly`, `fitmonk_pro_yearly`,
  `fitmonk_elite_quarterly`, `fitmonk_elite_yearly`.
  Link each to its App Store product id and its Play product + base plan.
- **Entitlements**: `starter`, `pro`, `elite`, each granted by both products
  of its tier (ideally higher tiers also grant the lower ones).
- Copy the project key into `env.json` → `QONVERSION_PROJECT_KEY`.

### 3. How the app uses it

- Paywall → `purchases.purchase(<product id>)` → store sheet. Only an active
  entitlement unlocks the plan. Cancelling the sheet does nothing, a pending
  payment (UPI, Ask to Buy) unlocks later, and failures show an error.
- The paywall shows the store's own localized price once it loads.
- **Restore Purchases** re-reads entitlements from the store.
- On launch and on every store update the app re-reads entitlements, and
  signing in links purchases to the Fitmonk account (`purchases.identify`).

Test with an App Store **sandbox tester** / TestFlight, and on Android with a
**license tester** account and an internal-testing track build.

## Firebase (Analytics, FCM, sign-in)

Firebase project `dietfit-f1353`.

- Android: `android/app/google-services.json` is checked in.
- iOS: register `app.fitmonk.shell` and add `GoogleService-Info.plist`; see
  `ios/README.md`.
- Enable sign-in providers: **Google** and **Apple** (Authentication → Sign-in
  method).
- FCM on iOS needs an APNs auth key uploaded under Project settings → Cloud
  Messaging.

Firebase is initialised from Dart (`Firebase.initializeApp()`), so no native
`FirebaseApp.configure()` call is needed.

## The bridge (web-side API)

The Next.js app talks to native through
[`src/lib/native-bridge.ts`](../src/lib/native-bridge.ts). The bridge is
installed at document start, so `nativeBridge.isNative` is already true on the
first render inside the app. Read it in effects or handlers, not during
render, to keep SSR hydration identical.

| Method | Purpose |
|---|---|
| `analytics.logEvent` / `setUserId` / `setUserProperty` | Firebase Analytics |
| `purchases.getProducts` | Store products with localized prices |
| `purchases.getEntitlements` / `purchase` / `restore` | Subscriptions |
| `purchases.identify` / `logout` | Attach/detach the Qonversion user |
| `notifications.requestPermission` / `getFcmToken` | Push |
| `notifications.subscribeTopic` / `unsubscribeTopic` | FCM topics |
| `notifications.showLocal` / `scheduleLocal` / `cancelLocal` | Local notifications (scheduled with the OS, so they survive the app being killed) |
| `permissions.request` / `check` | `camera`, `microphone`, `notifications` |
| `permissions.openSettings` | OS app settings |
| `device.info` / `openExternal` / `share` / `shareImage` | Device |
| `auth.googleSignIn` / `googleSignOut` | Native Google sign-in |
| `auth.appleSignIn` | Sign in with Apple (iOS) |
| `haptics.impact` / `selection` / `notification` | Haptics |

Error codes (`err.code`): `cancelled` (sign-in closed),
`purchase_cancelled`, `purchase_pending`, `purchase_failed`,
`purchases_unavailable`, `product_not_found`, `unknown_method`,
`handler_failed`.

Events (`nativeBridge.on(event, handler)`), queued until the page is ready:
`app.foreground`, `app.background`, `notification.received`,
`notification.opened` (`coldStart: true` if the tap launched the app),
`notification.tokenRefreshed`, `purchases.entitlementsChanged`.

## Notes

- `flutter_inappwebview` (not `webview_flutter`) for Promise-returning JS
  handlers and inline camera/mic permission grants.
- The shell auto-grants WebView camera/mic prompts: the content is trusted,
  HTTPS-only, from the allowlisted host. Revisit `onPermissionRequest` if
  third-party content is ever loaded.
- Android hardware back walks WebView history first; iOS gets the native
  edge-swipe back gesture.
- The UA carries `FitmonkShell/1.0 FitmonkPlatform/<ios|android>`. The server
  uses it for store-specific paywall copy.
