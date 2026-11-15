import 'package:flutter/foundation.dart';

import '../config/env.dart';
import '../services/analytics_service.dart';
import 'bridge_error.dart';
import '../services/auth_service.dart';
import '../services/device_service.dart';
import '../services/haptics_service.dart';
import '../services/notifications_service.dart';
import '../services/permissions_service.dart';
import '../services/purchases_service.dart';
import '../services/speech_service.dart';
import '../services/startup.dart';

typedef BridgeHandler = Future<Object?> Function(Map<String, dynamic> params);

/// Routes typed method calls coming from the WebView to the appropriate
/// native service. Anything a handler returns must be JSON-serializable —
/// InAppWebView will hand it back to the web-side Promise verbatim.
class Bridge {
  Bridge._() {
    _register();
  }
  static final Bridge instance = Bridge._();

  final Map<String, BridgeHandler> _handlers = {};

  void _register() {
    // ---- Analytics -------------------------------------------------------
    _handlers['analytics.logEvent'] = (p) async {
      await AnalyticsService.instance.logEvent(
        p['name'] as String,
        (p['params'] as Map?)?.cast<String, Object>(),
      );
      return null;
    };
    _handlers['analytics.setUserId'] = (p) async {
      await AnalyticsService.instance.setUserId(p['userId'] as String?);
      return null;
    };
    _handlers['analytics.setUserProperty'] = (p) async {
      await AnalyticsService.instance.setUserProperty(
        p['name'] as String,
        p['value'] as String?,
      );
      return null;
    };

    // ---- Purchases (Qonversion) -----------------------------------------
    _handlers['purchases.getOfferings'] = (_) =>
        PurchasesService.instance.getOfferings();
    _handlers['purchases.getProducts'] = (_) =>
        PurchasesService.instance.getProducts();
    _handlers['purchases.getEntitlements'] = (_) =>
        PurchasesService.instance.getEntitlements();
    _handlers['purchases.purchase'] = (p) =>
        PurchasesService.instance.purchase(p['productId'] as String);
    _handlers['purchases.restore'] = (_) =>
        PurchasesService.instance.restore();
    _handlers['purchases.identify'] = (p) async {
      await PurchasesService.instance.identify(p['userId'] as String);
      return null;
    };
    _handlers['purchases.logout'] = (_) async {
      await PurchasesService.instance.logout();
      return null;
    };

    // ---- Notifications ---------------------------------------------------
    _handlers['notifications.requestPermission'] = (_) =>
        NotificationsService.instance.requestPermission();
    _handlers['notifications.getFcmToken'] = (_) =>
        NotificationsService.instance.getFcmToken();
    _handlers['notifications.subscribeTopic'] = (p) async {
      await NotificationsService.instance.subscribeTopic(p['topic'] as String);
      return null;
    };
    _handlers['notifications.unsubscribeTopic'] = (p) async {
      await NotificationsService.instance
          .unsubscribeTopic(p['topic'] as String);
      return null;
    };
    _handlers['notifications.showLocal'] = (p) =>
        NotificationsService.instance.showLocal(
          title: p['title'] as String,
          body: p['body'] as String? ?? '',
          payload: p['payload'] as String?,
        );
    _handlers['notifications.scheduleLocal'] = (p) =>
        NotificationsService.instance.scheduleLocal(
          title: p['title'] as String,
          body: p['body'] as String? ?? '',
          epochMillis: (p['epochMillis'] as num).toInt(),
          payload: p['payload'] as String?,
        );
    _handlers['notifications.cancelLocal'] = (p) async {
      await NotificationsService.instance
          .cancelLocal((p['id'] as num).toInt());
      return null;
    };

    // ---- Permissions -----------------------------------------------------
    _handlers['permissions.request'] = (p) =>
        PermissionsService.instance.request(p['permission'] as String);
    _handlers['permissions.check'] = (p) =>
        PermissionsService.instance.check(p['permission'] as String);
    _handlers['permissions.openSettings'] = (_) =>
        PermissionsService.instance.openAppSettings();

    // ---- Device ----------------------------------------------------------
    _handlers['device.info'] = (_) => DeviceService.instance.info();
    _handlers['device.openExternal'] = (p) =>
        DeviceService.instance.openExternal(p['url'] as String);
    _handlers['device.share'] = (p) => DeviceService.instance.share(
          text: p['text'] as String,
          subject: p['subject'] as String?,
        );
    _handlers['device.shareImage'] = (p) => DeviceService.instance.shareImage(
          image: p['image'] as String,
          text: p['text'] as String,
          subject: p['subject'] as String?,
          filename: (p['filename'] as String?) ?? 'fitmonk-streak',
        );

    // ---- Auth ------------------------------------------------------------
    _handlers['auth.googleSignIn'] = (_) =>
        AuthService.instance.signInGoogle();
    _handlers['auth.appleSignIn'] = (_) =>
        AuthService.instance.signInApple();
    _handlers['auth.googleSignOut'] = (_) async {
      await AuthService.instance.signOutGoogle();
      return null;
    };

    // ---- Speech (iOS: replaces the WebView's broken Web Speech API) -----
    _handlers['speech.start'] = (p) => SpeechService.instance.start(
          sessionId: (p['sessionId'] as num).toInt(),
          lang: p['lang'] as String?,
        );
    _handlers['speech.stop'] = (_) async {
      await SpeechService.instance.stop();
      return null;
    };
    _handlers['speech.abort'] = (_) async {
      await SpeechService.instance.abort();
      return null;
    };

    // ---- Haptics ---------------------------------------------------------
    _handlers['haptics.impact'] = (p) async {
      await HapticsService.instance.impact(p['style'] as String?);
      return null;
    };
    _handlers['haptics.selection'] = (_) async {
      await HapticsService.instance.selection();
      return null;
    };
    _handlers['haptics.notification'] = (p) async {
      await HapticsService.instance.notification(p['type'] as String?);
      return null;
    };
  }

  /// Never throws — bridge errors are returned as
  /// `{__bridge_error: true, code, message}` so the web-side wrapper can
  /// convert them to a rejected Promise without depending on the WebView
  /// runtime's exception forwarding.
  Future<Object?> handle(String method, Map<String, dynamic> params) async {
    if (Env.debugBridge) {
      debugPrint('[bridge] → $method $params');
    }
    final handler = _handlers[method];
    if (handler == null) {
      return _error('unknown_method', 'Unknown bridge method: $method');
    }
    try {
      // The page can call in before the native services finish starting.
      // Never more than a few seconds: a stuck service must not freeze
      // sign-in or purchases (each handler copes with an unready service).
      await servicesReady.timeout(const Duration(seconds: 8), onTimeout: () {});
      final result = await handler(params);
      if (Env.debugBridge) debugPrint('[bridge] ← $method $result');
      return result;
    } catch (e, s) {
      debugPrint('[bridge] ✗ $method: $e\n$s');
      if (e is BridgeError) return _error(e.code, e.message);
      return _error('handler_failed', e.toString());
    }
  }

  Map<String, Object?> _error(String code, String message) => {
        '__bridge_error': true,
        'code': code,
        'message': message,
      };
}
