/// An error a service throws on purpose so the web side gets a stable `code`
/// (e.g. `cancelled`, `purchase_pending`) instead of a stringified exception.
/// The bridge forwards `code` and `message` verbatim.
class BridgeError implements Exception {
  BridgeError(this.code, this.message);
  final String code;
  final String message;

  @override
  String toString() => 'BridgeError($code): $message';
}
