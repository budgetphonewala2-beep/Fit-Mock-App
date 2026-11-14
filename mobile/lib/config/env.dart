class Env {
  const Env._();

  // Straight to the app's home screen on the canonical host: the bare domain
  // 308s to www and / redirects again, which cost every app open a couple of
  // extra round trips. Anyone not onboarded yet is sent on to /onboarding.
  static const String shellUrl = String.fromEnvironment(
    'FITMONK_SHELL_URL',
    defaultValue: 'https://www.fitmonk.online/workout',
  );

  static const String qonversionProjectKey = String.fromEnvironment(
    'QONVERSION_PROJECT_KEY',
    defaultValue: '',
  );

  static const bool debugBridge = bool.fromEnvironment('DEBUG_BRIDGE');

  /// iOS OAuth client id (CLIENT_ID in GoogleService-Info.plist). Without it
  /// Google Sign-In on iOS has no configuration, and the plugin re-raises
  /// GIDSignIn's exception, which crashes the app. CI fills it from the plist.
  static const String googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
    defaultValue: '',
  );

  static const List<String> allowedHosts = [
    'fitmonk.online',
    'www.fitmonk.online',
  ];

  /// The host the shell was built to load (e.g. a staging or LAN dev server
  /// passed with --dart-define=FITMONK_SHELL_URL) is always internal.
  static final String _shellHost = Uri.parse(shellUrl).host;

  static bool isInternalUrl(Uri uri) {
    if (uri.host.isEmpty) return true;
    return uri.host == _shellHost || allowedHosts.contains(uri.host);
  }
}
