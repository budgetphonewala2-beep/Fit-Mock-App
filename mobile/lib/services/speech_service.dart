import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_recognition_error.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../bridge/bridge_error.dart';
import '../bridge/web_channel.dart';

/// Native speech-to-text (Apple Speech framework on iOS) for the web app's
/// voice buttons. WKWebView exposes `webkitSpeechRecognition` but it never
/// works in embedded web views (WebKit bug 239816), so on iOS the bridge
/// bootstrap swaps in a `SpeechRecognition` that drives this service.
///
/// Each listen is a session with an id from the page. Events:
///   speech.result {sessionId, transcript, isFinal, confidence}
///   speech.error  {sessionId, error}   (Web Speech error names)
///   speech.end    {sessionId}
class SpeechService {
  SpeechService._();
  static final SpeechService instance = SpeechService._();

  final SpeechToText _stt = SpeechToText();
  bool _initialized = false;
  int? _session;
  int? _endedSession;

  Future<bool> _ensureInitialized() async {
    if (_initialized) return true;
    _initialized = await _stt.initialize(
      onError: _onError,
      onStatus: _onStatus,
    );
    return _initialized;
  }

  Future<Map<String, Object?>> start({required int sessionId, String? lang}) async {
    final ok = await _ensureInitialized();
    if (!ok) {
      // Speech or microphone permission denied, or recognition unavailable.
      throw BridgeError('not-allowed', 'Speech recognition is not allowed.');
    }
    if (_stt.isListening) {
      await _stt.cancel();
    }
    _session = sessionId;
    _endedSession = null;
    await _stt.listen(
      onResult: _onResult,
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
        listenMode: ListenMode.dictation,
        autoPunctuation: true,
        // Mirrors the web's continuous dictation: a pause ends this session
        // and the page starts the next one.
        pauseFor: const Duration(seconds: 3),
        listenFor: const Duration(minutes: 1),
        localeId: _localeId(lang),
      ),
    );
    return {'started': true};
  }

  Future<void> stop() => _stt.stop();

  Future<void> abort() async {
    await _stt.cancel();
    _emitEnd();
  }

  void _onResult(SpeechRecognitionResult result) {
    final session = _session;
    if (session == null) return;
    WebChannel.instance.emit('speech.result', {
      'sessionId': session,
      'transcript': result.recognizedWords,
      'isFinal': result.finalResult,
      'confidence': result.confidence,
    });
    if (result.finalResult) _emitEnd();
  }

  void _onError(SpeechRecognitionError error) {
    final session = _session;
    if (session == null) return;
    debugPrint('[speech] error ${error.errorMsg} permanent=${error.permanent}');
    WebChannel.instance.emit('speech.error', {
      'sessionId': session,
      'error': _webErrorName(error.errorMsg),
    });
    if (error.permanent) _emitEnd();
  }

  void _onStatus(String status) {
    if (status == SpeechToText.doneStatus) _emitEnd();
  }

  void _emitEnd() {
    final session = _session;
    if (session == null || _endedSession == session) return;
    _endedSession = session;
    WebChannel.instance.emit('speech.end', {'sessionId': session});
  }

  /// BCP-47 ("en-IN") → the platform's locale id ("en_IN").
  String? _localeId(String? lang) {
    if (lang == null || lang.trim().isEmpty) return null;
    return lang.trim().replaceAll('-', '_');
  }

  String _webErrorName(String nativeError) {
    final e = nativeError.toLowerCase();
    if (e.contains('permission') || e.contains('denied') || e.contains('restricted')) {
      return 'not-allowed';
    }
    if (e.contains('no_match') || e.contains('timeout') || e.contains('speech')) {
      return 'no-speech';
    }
    if (e.contains('network') || e.contains('server')) return 'network';
    if (e.contains('audio') || e.contains('busy')) return 'audio-capture';
    return 'aborted';
  }
}
