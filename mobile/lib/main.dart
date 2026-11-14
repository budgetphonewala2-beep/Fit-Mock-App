import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'services/startup.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Edge-to-edge so the web app can read the real system-bar heights via
  // `env(safe-area-inset-*)` and keep its own footer clear of the Android
  // navigation bar instead of parking it right on top of it.
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  // Start the WebView first: the web app is what the user is waiting for,
  // and it doesn't need Firebase, analytics, purchases or notifications to
  // load. Those used to run one after another before runApp, holding the
  // first page request back. Bridge calls wait for them (see startup.dart).
  runApp(const FitmonkShellApp());
  unawaited(initServices());
}
