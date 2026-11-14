/// JavaScript injected into every page load to expose `window.FitmonkBridge`.
///
/// The web-side contract is:
///   FitmonkBridge.request(method, params?) -> Promise<result>
///   FitmonkBridge.on(event, handler)       -> unsubscribe fn
///   FitmonkBridge.isNative === true
///   FitmonkBridge.platform ('ios' | 'android')
///
/// Native pushes events with WebChannel.emit() which calls
/// `FitmonkBridge._emit(event, payload)` under the hood.
const String bridgeBootstrapJs = r'''
(function () {
  if (window.FitmonkBridge && window.FitmonkBridge.isNative) return;

  var listeners = new Map();

  // This script runs at document start, which can be before the plugin's own
  // channel is wired up (it announces itself with
  // `flutterInAppWebViewPlatformReady`). Calls made that early wait for it
  // instead of failing.
  var channelReady = null;
  function hasChannel() {
    return !!(window.flutter_inappwebview && window.flutter_inappwebview.callHandler);
  }
  function waitForChannel() {
    if (hasChannel()) return Promise.resolve();
    if (!channelReady) {
      channelReady = new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
          window.removeEventListener('flutterInAppWebViewPlatformReady', onReady);
          channelReady = null;
          reject(new Error('FitmonkBridge: native channel not ready'));
        }, 10000);
        function onReady() {
          clearTimeout(timer);
          window.removeEventListener('flutterInAppWebViewPlatformReady', onReady);
          resolve();
        }
        window.addEventListener('flutterInAppWebViewPlatformReady', onReady);
      });
    }
    return channelReady;
  }

  function call(method, params) {
    return waitForChannel().then(function () {
      return window.flutter_inappwebview.callHandler('_fitmonkBridge', method, params || {});
    })
      .then(function (result) {
        if (result && typeof result === 'object' && result.__bridge_error) {
          var err = new Error(result.message || 'Bridge error');
          err.code = result.code || 'unknown';
          throw err;
        }
        return result;
      });
  }

  function on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    var set = listeners.get(event);
    set.add(handler);
    return function () { set.delete(handler); };
  }

  function emit(event, payload) {
    var set = listeners.get(event);
    if (!set) return;
    set.forEach(function (h) {
      try { h(payload); } catch (e) { console.error('[FitmonkBridge] listener for ' + event, e); }
    });
  }

  window.FitmonkBridge = {
    isNative: true,
    platform: '__PLATFORM__',
    version: '__VERSION__',
    request: call,
    on: on,
    _emit: emit,
  };

  // iOS: WKWebView exposes webkitSpeechRecognition but it never works in an
  // embedded web view (WebKit bug 239816). Swap in a standard-shaped
  // SpeechRecognition backed by the native Speech framework, so the page's
  // voice code runs unchanged. One result slot per session: interim results
  // replace it, the final one closes the session, and `continuous` callers
  // simply start the next session from onend, as they do in Safari.
  if ('__PLATFORM__' === 'ios') {
    var activeRecognition = null;
    var sessionCounter = 0;

    function fire(target, name, event) {
      var handler = target[name];
      if (typeof handler === 'function') {
        try { handler.call(target, event); } catch (e) { console.error('[FitmonkBridge] ' + name, e); }
      }
    }

    function NativeSpeechRecognition() {
      this.continuous = false;
      this.interimResults = false;
      this.lang = '';
      this.maxAlternatives = 1;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.onstart = null;
      this._session = null;
    }
    NativeSpeechRecognition.prototype.start = function () {
      if (this._session !== null) return;
      var self = this;
      var id = ++sessionCounter;
      self._session = id;
      activeRecognition = self;
      call('speech.start', { sessionId: id, lang: self.lang || navigator.language || 'en-US' })
        .then(function () {
          if (self._session === id) fire(self, 'onstart', { type: 'start' });
        }, function (err) {
          if (self._session !== id) return;
          self._session = null;
          fire(self, 'onerror', { type: 'error', error: (err && err.code === 'not-allowed') ? 'not-allowed' : 'aborted' });
          fire(self, 'onend', { type: 'end' });
        });
    };
    NativeSpeechRecognition.prototype.stop = function () {
      if (this._session !== null) call('speech.stop').catch(function () {});
    };
    NativeSpeechRecognition.prototype.abort = function () {
      if (this._session !== null) call('speech.abort').catch(function () {});
    };
    NativeSpeechRecognition.prototype.addEventListener = function (name, handler) {
      this['on' + name] = handler;
    };

    function current(payload) {
      var r = activeRecognition;
      return r && payload && r._session === payload.sessionId ? r : null;
    }
    on('speech.result', function (p) {
      var r = current(p);
      if (!r || (!p.isFinal && !r.interimResults)) return;
      var result = { isFinal: !!p.isFinal, length: 1, 0: { transcript: p.transcript || '', confidence: p.confidence || 0 } };
      result.item = function (i) { return this[i]; };
      var results = { length: 1, 0: result, item: function (i) { return this[i]; } };
      fire(r, 'onresult', { type: 'result', resultIndex: 0, results: results });
    });
    on('speech.error', function (p) {
      var r = current(p);
      if (r) fire(r, 'onerror', { type: 'error', error: p.error || 'aborted' });
    });
    on('speech.end', function (p) {
      var r = current(p);
      if (!r) return;
      r._session = null;
      fire(r, 'onend', { type: 'end' });
    });

    try {
      Object.defineProperty(window, 'SpeechRecognition', { value: NativeSpeechRecognition, configurable: true, writable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: NativeSpeechRecognition, configurable: true, writable: true });
    } catch (e) {
      window.SpeechRecognition = NativeSpeechRecognition;
      window.webkitSpeechRecognition = NativeSpeechRecognition;
    }
  }

  window.dispatchEvent(new Event('fitmonk-bridge-ready'));
})();
''';

String bridgeBootstrapFor({required String platform, required String version}) {
  return bridgeBootstrapJs
      .replaceAll('__PLATFORM__', platform)
      .replaceAll('__VERSION__', version);
}
