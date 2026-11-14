import 'package:flutter_test/flutter_test.dart';

import 'package:fitmonk_shell/config/env.dart';
import 'package:fitmonk_shell/webview/bridge_bootstrap.dart';

void main() {
  group('Env.isInternalUrl', () {
    test('keeps fitmonk hosts inside the shell', () {
      expect(Env.isInternalUrl(Uri.parse('https://www.fitmonk.online/diet')), isTrue);
      expect(Env.isInternalUrl(Uri.parse('https://fitmonk.online/')), isTrue);
    });

    test('sends other hosts to the OS browser', () {
      expect(Env.isInternalUrl(Uri.parse('https://calendly.com/x')), isFalse);
      expect(Env.isInternalUrl(Uri.parse('https://evil-fitmonk.online/')), isFalse);
    });
  });

  test('bridge bootstrap is stamped with platform and version', () {
    final js = bridgeBootstrapFor(platform: 'ios', version: '1.2.3');
    expect(js, contains("platform: 'ios'"));
    expect(js, contains("version: '1.2.3'"));
    expect(js, isNot(contains('__PLATFORM__')));
  });
}
