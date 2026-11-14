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
    try {
      await Firebase.initializeApp();
    } catch (e, s) {
      debugPrint('Firebase init failed: $e\n$s');
    }

    await AnalyticsService.instance.init();
    await PurchasesService.instance.init();
    await NotificationsService.instance.init();
  } finally {
    if (!_servicesReady.isCompleted) _servicesReady.complete();
  }
}
