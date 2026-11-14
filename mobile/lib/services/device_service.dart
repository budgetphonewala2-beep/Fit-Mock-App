import 'dart:convert';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:cross_file/cross_file.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

class DeviceService {
  DeviceService._();
  static final DeviceService instance = DeviceService._();

  final _deviceInfo = DeviceInfoPlugin();

  Future<Map<String, Object?>> info() async {
    final pkg = await PackageInfo.fromPlatform();
    final Map<String, Object?> device = {};

    if (Platform.isIOS) {
      final ios = await _deviceInfo.iosInfo;
      device.addAll({
        'model': ios.utsname.machine,
        'systemName': ios.systemName,
        'systemVersion': ios.systemVersion,
        'name': ios.name,
        'identifierForVendor': ios.identifierForVendor,
      });
    } else if (Platform.isAndroid) {
      final android = await _deviceInfo.androidInfo;
      device.addAll({
        'model': android.model,
        'manufacturer': android.manufacturer,
        'brand': android.brand,
        'sdkInt': android.version.sdkInt,
        'release': android.version.release,
      });
    }

    final connectivity = await Connectivity().checkConnectivity();

    return {
      'platform': Platform.operatingSystem,
      'app': {
        'name': pkg.appName,
        'packageName': pkg.packageName,
        'version': pkg.version,
        'buildNumber': pkg.buildNumber,
      },
      'device': device,
      'connectivity': connectivity.map((c) => c.name).toList(),
    };
  }

  Future<Map<String, Object?>> openExternal(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return {'opened': false, 'error': 'invalid_url'};
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    return {'opened': ok};
  }

  Future<Map<String, Object?>> share({
    required String text,
    String? subject,
  }) async {
    final result = await Share.share(text, subject: subject);
    return {'status': result.status.name};
  }

  /// Share an in-memory image (passed as a `data:image/...;base64,...` URL from
  /// the web layer) as a file attachment, with `text` becoming the caption in
  /// apps that support it.
  Future<Map<String, Object?>> shareImage({
    required String image,
    required String text,
    String? subject,
    String filename = 'fitmonk-streak',
  }) async {
    final commaIdx = image.indexOf(',');
    if (!image.startsWith('data:') || commaIdx == -1) {
      return {'status': 'invalid'};
    }
    final header = image.substring(5, commaIdx); // e.g. image/jpeg;base64
    final payload = image.substring(commaIdx + 1);
    final mime = header.split(';').first;
    final ext = mime.endsWith('png') ? 'png' : 'jpg';
    final Uint8List bytes = base64Decode(payload);

    final file = XFile.fromData(
      bytes,
      name: '$filename.$ext',
      mimeType: mime,
    );

    final result = await Share.shareXFiles(
      [file],
      text: text,
      subject: subject,
    );
    return {'status': result.status.name};
  }
}
