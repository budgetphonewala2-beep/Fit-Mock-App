import Flutter
import UIKit
import UserNotifications

// Classic (non-scene) app lifecycle, on purpose.
//
// Flutter's UIScene template registers plugins only when the scene connects,
// which is after UIApplicationDidFinishLaunching has been posted. Plugins
// that hook that moment then never see it: firebase_messaging waits for it
// before answering getInitialMessage() (so it never answered, the native
// services never finished starting, and every bridge call — Sign in with
// Apple, Google, purchases — spun forever) and also wires up APNs there.
// Registering plugins here, inside didFinishLaunching, fixes all of them.
@main
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // flutter_local_notifications + firebase_messaging: route notification
    // presentation and taps through FlutterAppDelegate so foreground alerts
    // show and taps reach Dart. Firebase itself is configured from Dart.
    UNUserNotificationCenter.current().delegate = self
    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
