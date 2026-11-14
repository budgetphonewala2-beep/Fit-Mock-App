# FitMonk mobile shell

Flutter WebView shell that wraps the production web app at `fitmonk.online` and exposes native capabilities (permissions, notifications, IAP via Qonversion, Firebase Analytics, haptics, share, device info) to the web through a single JavaScript bridge.

The web app is unchanged; it just gets `window.FitmonkBridge` at load time when running inside the shell.

## Layout

```
mobile/
├── pubspec.yaml
├── lib/
│   ├── main.dart                          # Firebase + services init, runApp
│   ├── app.dart                           # MaterialApp
│   ├── config/env.dart                    # URL, project key, allowed hosts
│   ├── webview/
│   │   ├── shell_webview.dart             # InAppWebView + bridge wiring
│   │   └── bridge_bootstrap.dart          # JS injected into every page
│   ├── bridge/
│   │   ├── bridge.dart                    # method → service router
│   │   └── web_channel.dart               # native → web event emitter
│   └── services/                          # analytics, purchases, notifications,
│                                            permissions, device, haptics
├── android/app/src/main/AndroidManifest.template.xml
└── ios/Runner/Info.template.plist
```

## First-time setup

The Dart source and pubspec are checked in; the platform scaffolding is not (it's Flutter-generated boilerplate that changes with the SDK version).

```bash
cd mobile
flutter create --project-name fitmonk_shell --org app.fitmonk --platforms=ios,android .
flutter pub get
```

Then merge the two template files into the generated project:

- Copy the relevant entries from `android/app/src/main/AndroidManifest.template.xml` into the generated `android/app/src/main/AndroidManifest.xml`.
- Copy the relevant entries from `ios/Runner/Info.template.plist` into the generated `ios/Runner/Info.plist`.

## Building on an exFAT/HFS+ volume (this project's default)

If the repo lives on an exFAT drive (the case here — the project is on `/Volumes/PortableSSD`), macOS writes AppleDouble `._*` sidecars on every file operation, and AGP's resource parser rejects them. `noappledouble` is HFS+-only and doesn't help on exFAT.

The workaround is a one-time APFS sparse disk image on the same drive — one big file on exFAT, APFS internally:

```bash
# One-time create (20 GB grows as needed; won't actually claim 20 GB until used)
hdiutil create -type SPARSE -fs APFS -size 20g -volname fitmonk-build \
    /Volumes/PortableSSD/fitmonk-build.sparseimage

# Attach whenever you want to build (needed after every reboot / eject)
hdiutil attach /Volumes/PortableSSD/fitmonk-build.sparseimage
```

The gradle config in [`android/build.gradle.kts`](android/build.gradle.kts) routes all build intermediates to `/Volumes/fitmonk-build/gradle` when that mount exists, and falls back to the on-tree `build/` folder when it doesn't (so nothing changes for anyone building on APFS-native storage). `mobile/build/` is a symlink into the sparse image for the `flutter` tool's benefit.

To rebuild fresh after mounting:

```bash
cd mobile && ln -sfn /Volumes/fitmonk-build/gradle build
flutter build apk --debug
```

To detach when done:

```bash
hdiutil detach /Volumes/fitmonk-build
```

## Firebase (Analytics + FCM)

1. Create a Firebase project.
2. Register an Android app (`app.fitmonk.shell` or your chosen applicationId) → download `google-services.json` → drop into `mobile/android/app/`.
3. Register an iOS app (`app.fitmonk.shell`) → download `GoogleService-Info.plist` → drop into `mobile/ios/Runner/` (via Xcode so it's added to the target).
4. Enable Cloud Messaging in the Firebase console. Upload your APNs auth key (Project settings → Cloud Messaging → Apple app configuration).
5. On Android, add the google-services Gradle plugin — in `android/build.gradle`:
   ```gradle
   dependencies { classpath 'com.google.gms:google-services:4.4.2' }
   ```
   and in `android/app/build.gradle`:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
6. On iOS, in `ios/Runner/AppDelegate.swift`:
   ```swift
   import FirebaseCore
   // in application(_:didFinishLaunchingWithOptions:)
   FirebaseApp.configure()
   ```

## Qonversion

1. Create a project at https://qonversion.io.
2. Wire your App Store Connect and Google Play products into Qonversion offerings.
3. Get the project key from the Qonversion dashboard.
4. Build with the key:
   ```bash
   flutter run --dart-define=QONVERSION_PROJECT_KEY=q_xxxxxxxxxxx
   ```
   Or, for release, add to `--dart-define-from-file=env.json`:
   ```json
   {
     "FITMONK_SHELL_URL": "https://fitmonk.online",
     "QONVERSION_PROJECT_KEY": "q_xxxxxxxxxxx"
   }
   ```

Product IDs passed to `purchases.purchase(productId)` must match the storeId (App Store product identifier / Play Store SKU) you configured in Qonversion.

## Overriding the URL for staging

```bash
flutter run --dart-define=FITMONK_SHELL_URL=https://staging.fitmonk.online
```

Also update `Env.allowedHosts` in `lib/config/env.dart` if the staging host is different — anything outside that list opens in the OS browser rather than inside the WebView.

## The bridge — web-side API

The Next.js app talks to native via [`src/lib/native-bridge.ts`](../src/lib/native-bridge.ts):

```ts
import { nativeBridge } from "@/lib/native-bridge";

if (nativeBridge.isNative) {
  await nativeBridge.analytics.logEvent("workout_completed", { minutes: 42 });
  const { status } = await nativeBridge.notifications.requestPermission();
  const entitlements = await nativeBridge.purchases.getEntitlements();
  const unsub = nativeBridge.on("purchases.entitlementsChanged", (payload) => {
    // update your subscription state
  });
}
```

On the web (no bridge injected), every method returns a null-safe default so call sites don't have to branch on `isNative` for logging-shaped things.

### Methods

| Method                          | Purpose                                            |
|--------------------------------|----------------------------------------------------|
| `analytics.logEvent`           | Firebase Analytics event                           |
| `analytics.setUserId`          | Firebase Analytics user id                         |
| `analytics.setUserProperty`    | Firebase Analytics user property                   |
| `purchases.getOfferings`       | Qonversion offerings                               |
| `purchases.getEntitlements`    | Current entitlements                               |
| `purchases.purchase`           | Buy a productId                                    |
| `purchases.restore`            | Restore purchases                                  |
| `purchases.identify` / `logout`| Attach/detach the Qonversion user                  |
| `notifications.requestPermission` | Prompt for notification permission              |
| `notifications.getFcmToken`    | Current FCM registration token                     |
| `notifications.subscribeTopic` / `unsubscribeTopic` | FCM topic sub          |
| `notifications.showLocal` / `scheduleLocal` / `cancelLocal` | Local push |
| `permissions.request` / `check`| Camera, mic, photos, location, notifications, …    |
| `permissions.openSettings`     | Open OS app settings                               |
| `device.info`                  | Platform, app version, device, connectivity        |
| `device.openExternal`          | Hand a URL to the OS browser                       |
| `device.share`                 | Native share sheet                                 |
| `haptics.impact` / `selection` / `notification` | Haptic feedback           |

### Events (native → web)

Subscribe with `nativeBridge.on(event, handler)`:

- `app.foreground` / `app.background` — lifecycle
- `notification.received` — foreground remote push
- `notification.opened` — user tapped a push (remote or local); includes `coldStart: true` if the tap launched the app
- `notification.tokenRefreshed` — FCM token rotated
- `purchases.entitlementsChanged` — Qonversion pushed an update

## Running

```bash
cd mobile
flutter run --dart-define-from-file=env.json
```

For device builds against a physical iPhone/iPad, open `ios/Runner.xcworkspace` in Xcode, set the team and bundle id, and run from there — the Dart code doesn't change.

## Notes

- We use `flutter_inappwebview` (not the official `webview_flutter`) because it has first-class Promise-returning JS handlers and a `PermissionResponse` API for granting camera/mic prompts inline.
- The shell auto-grants inline permission prompts from the WebView — the web app is trusted content served over HTTPS from an allowlisted host. If you ever load third-party content, revisit `onPermissionRequest` in `shell_webview.dart`.
- Hardware back on Android walks WebView history first, then pops the Flutter route.
- Local scheduled notifications use `Future.delayed`, which is process-local. For cross-boot reminders (streaks, daily nudges), send them from your server via FCM instead.
