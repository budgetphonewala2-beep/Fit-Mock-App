import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// One-way channel for pushing events from native → web.
///
/// The web side subscribes with `FitmonkBridge.on(event, handler)`.
/// Payloads must be JSON-serializable.
class WebChannel {
  WebChannel._();
  static final WebChannel instance = WebChannel._();

  InAppWebViewController? _controller;

  void attach(InAppWebViewController controller) {
    _controller = controller;
  }

  void detach(InAppWebViewController controller) {
    if (_controller == controller) _controller = null;
  }

  Future<void> emit(String event, [Object? payload]) async {
    final controller = _controller;
    if (controller == null) return;
    final encodedEvent = jsonEncode(event);
    final encodedPayload = jsonEncode(payload);
    try {
      await controller.evaluateJavascript(
        source:
            'window.FitmonkBridge && window.FitmonkBridge._emit($encodedEvent, $encodedPayload);',
      );
    } catch (e, s) {
      debugPrint('WebChannel.emit($event) failed: $e\n$s');
    }
  }
}
