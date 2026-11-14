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

  static const List<String> allowedHosts = [
    'fitmonk.online',
    'www.fitmonk.online',
  ];

  static bool isInternalUrl(Uri uri) {
    if (uri.host.isEmpty) return true;
    return allowedHosts.contains(uri.host);
  }
}
