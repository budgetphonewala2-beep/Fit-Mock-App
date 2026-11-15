import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

import 'analytics_service.dart';
import 'notifications_service.dart';
import 'purchases_service.dart';

final _servicesReady = Completer<void>();

/// Completes once the native services below have finished setting up,
/// successfully or not. The bridge waits on it so a call the web app makes
/// while the shell is still starting behaves the same as before startup
/// stopped waiting for these.
Future<void> get servicesReady => _servicesReady.future;

/// Runs in the background after runApp, so the WebView can start loading
/// immediately. Same order as before: each service needs Firebase.
Future<void> initServices() async {
  try {
    await _step('Firebase', Firebase.initializeApp());
    await _step('Analytics', AnalyticsService.instance.init());
    await _step('Purchases', PurchasesService.instance.init());
    await _step('Notifications', NotificationsService.instance.init());
  } finally {
    if (!_servicesReady.isCompleted) _servicesReady.complete();
  }
}

/// One startup step, bounded in time. A plugin call that never answers (as
/// firebase_messaging's getInitialMessage did under the iOS scene lifecycle)
/// must not hold every bridge call — sign-in, purchases — hostage.
Future<void> _step(String name, Future<Object?> work) async {
  try {
    await work.timeout(const Duration(seconds: 6));
  } on TimeoutException {
    debugPrint('Startup: $name did not finish within 6s; continuing');
  } catch (e, s) {
    debugPrint('Startup: $name failed: $e\n$s');
  }
}
