import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// One-way channel for pushing events from native → web.
///
/// The web side subscribes with `FitmonkBridge.on(event, handler)`.
/// Payloads must be JSON-serializable.
///
/// Events emitted before the page has its bridge (cold-start notification
/// taps, entitlement updates during the first load) are queued and flushed
/// once [markPageReady] is called, instead of being dropped.
class WebChannel {
  WebChannel._();
  static final WebChannel instance = WebChannel._();

  static const int _maxQueued = 50;

  InAppWebViewController? _controller;
  bool _pageReady = false;
  final List<(String, Object?)> _queue = [];

  void attach(InAppWebViewController controller) {
    _controller = controller;
  }

  void detach(InAppWebViewController controller) {
    if (_controller == controller) {
      _controller = null;
      _pageReady = false;
    }
  }

  /// A new document is loading; its bridge isn't there yet.
  void markPageLoading() {
    _pageReady = false;
  }

  /// The bridge script is installed in the current document.
  Future<void> markPageReady() async {
    _pageReady = true;
    if (_queue.isEmpty) return;
    final pending = List.of(_queue);
    _queue.clear();
    for (final (event, payload) in pending) {
      await _send(event, payload);
    }
  }

  Future<void> emit(String event, [Object? payload]) async {
    if (_controller == null || !_pageReady) {
      if (_queue.length >= _maxQueued) _queue.removeAt(0);
      _queue.add((event, payload));
      return;
    }
    await _send(event, payload);
  }

  Future<void> _send(String event, Object? payload) async {
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
