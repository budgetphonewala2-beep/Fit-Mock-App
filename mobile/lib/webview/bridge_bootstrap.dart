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

  function call(method, params) {
    if (!window.flutter_inappwebview || !window.flutter_inappwebview.callHandler) {
      return Promise.reject(new Error('FitmonkBridge: native channel not ready'));
    }
    return window.flutter_inappwebview
      .callHandler('_fitmonkBridge', method, params || {})
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

  window.dispatchEvent(new Event('fitmonk-bridge-ready'));
})();
''';

String bridgeBootstrapFor({required String platform, required String version}) {
  return bridgeBootstrapJs
      .replaceAll('__PLATFORM__', platform)
      .replaceAll('__VERSION__', version);
}
