import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../bridge/web_channel.dart';

/// Combines FCM (remote push) and flutter_local_notifications (local push).
///
/// Emits to the web via WebChannel:
///   'notification.received'  — foreground remote push arrived
///   'notification.opened'    — user tapped a push (remote or local)
///   'notification.tokenRefreshed' — FCM registration token rotated
class NotificationsService {
  NotificationsService._();
  static final NotificationsService instance = NotificationsService._();

  final FlutterLocalNotificationsPlugin _local =
      FlutterLocalNotificationsPlugin();

  final _tapController = StreamController<Map<String, dynamic>>.broadcast();
  Stream<Map<String, dynamic>> get notificationTaps => _tapController.stream;

  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;

    // ---- Local notifications --------------------------------------------
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await _local.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        _tapController.add({
          'source': 'local',
          'payload': payload,
          'actionId': response.actionId,
        });
      },
    );

    // ---- Firebase Messaging (remote) ------------------------------------
    try {
      FirebaseMessaging.onMessage.listen((message) {
        WebChannel.instance.emit(
          'notification.received',
          _messageToJson(message),
        );
      });

      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _tapController.add({
          'source': 'remote',
          'payload': _messageToJson(message),
        });
      });

      final initialMessage =
          await FirebaseMessaging.instance.getInitialMessage();
      if (initialMessage != null) {
        _tapController.add({
          'source': 'remote',
          'coldStart': true,
          'payload': _messageToJson(initialMessage),
        });
      }

      FirebaseMessaging.instance.onTokenRefresh.listen((token) {
        WebChannel.instance
            .emit('notification.tokenRefreshed', {'token': token});
      });
    } catch (e, s) {
      debugPrint('FirebaseMessaging init failed: $e\n$s');
    }
  }

  Future<Map<String, Object?>> requestPermission() async {
    NotificationSettings settings;
    try {
      settings = await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
        provisional: false,
      );
    } catch (e) {
      debugPrint('requestPermission failed: $e');
      return {'status': 'error', 'error': e.toString()};
    }

    if (Platform.isAndroid) {
      final androidImpl = _local.resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin>();
      await androidImpl?.requestNotificationsPermission();
    }

    return {'status': _authName(settings.authorizationStatus)};
  }

  Future<Map<String, Object?>> getFcmToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      return {'token': token};
    } catch (e) {
      return {'token': null, 'error': e.toString()};
    }
  }

  Future<void> subscribeTopic(String topic) =>
      FirebaseMessaging.instance.subscribeToTopic(topic);

  Future<void> unsubscribeTopic(String topic) =>
      FirebaseMessaging.instance.unsubscribeFromTopic(topic);

  Future<Map<String, Object?>> showLocal({
    required String title,
    required String body,
    String? payload,
  }) async {
    final id = DateTime.now().millisecondsSinceEpoch.remainder(1 << 31);
    await _local.show(id, title, body, _defaultDetails(), payload: payload);
    return {'id': id};
  }

  Future<Map<String, Object?>> scheduleLocal({
    required String title,
    required String body,
    required int epochMillis,
    String? payload,
  }) async {
    // Delegated to a plain delayed .show — full zonedSchedule adds a
    // timezone dependency. Callers wanting cross-boot persistence should
    // schedule server-side and deliver via FCM.
    final id = epochMillis.remainder(1 << 31);
    final delay = Duration(
      milliseconds: epochMillis - DateTime.now().millisecondsSinceEpoch,
    );
    if (delay.isNegative) {
      return showLocal(title: title, body: body, payload: payload);
    }
    Future.delayed(delay, () {
      _local.show(id, title, body, _defaultDetails(), payload: payload);
    });
    return {'id': id};
  }

  Future<void> cancelLocal(int id) => _local.cancel(id);

  NotificationDetails _defaultDetails() => const NotificationDetails(
        android: AndroidNotificationDetails(
          'fitmonk_default',
          'Fitmonk',
          channelDescription: 'General app notifications',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      );

  Map<String, Object?> _messageToJson(RemoteMessage message) => {
        'messageId': message.messageId,
        'from': message.from,
        'sentTime': message.sentTime?.millisecondsSinceEpoch,
        'data': message.data,
        'notification': message.notification == null
            ? null
            : {
                'title': message.notification!.title,
                'body': message.notification!.body,
              },
      };

  String _authName(AuthorizationStatus status) {
    switch (status) {
      case AuthorizationStatus.authorized:
        return 'granted';
      case AuthorizationStatus.denied:
        return 'denied';
      case AuthorizationStatus.notDetermined:
        return 'notDetermined';
      case AuthorizationStatus.provisional:
        return 'provisional';
    }
  }
}
