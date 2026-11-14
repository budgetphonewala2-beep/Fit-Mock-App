import 'package:permission_handler/permission_handler.dart' as ph;

class PermissionsService {
  PermissionsService._();
  static final PermissionsService instance = PermissionsService._();

  static const Map<String, ph.Permission> _map = {
    // Only what the app actually uses and both platforms declare
    // (AndroidManifest.xml + Info.plist usage strings + the PERMISSION_*
    // macros in ios/Podfile). Contacts, bluetooth, motion, photos and
    // location were listed before but never declared, so they could only
    // ever come back denied, and Apple rejects builds that link permission
    // APIs without a matching usage string.
    'camera': ph.Permission.camera,
    'microphone': ph.Permission.microphone,
    'notifications': ph.Permission.notification,
  };

  Future<Map<String, Object?>> request(String name) async {
    final permission = _map[name];
    if (permission == null) {
      return {'status': 'unknown', 'error': 'unknown_permission'};
    }
    final status = await permission.request();
    return {'status': _statusName(status)};
  }

  Future<Map<String, Object?>> check(String name) async {
    final permission = _map[name];
    if (permission == null) {
      return {'status': 'unknown', 'error': 'unknown_permission'};
    }
    final status = await permission.status;
    return {'status': _statusName(status)};
  }

  Future<Map<String, Object?>> openAppSettings() async {
    final opened = await ph.openAppSettings();
    return {'opened': opened};
  }

  String _statusName(ph.PermissionStatus status) {
    switch (status) {
      case ph.PermissionStatus.granted:
        return 'granted';
      case ph.PermissionStatus.denied:
        return 'denied';
      case ph.PermissionStatus.restricted:
        return 'restricted';
      case ph.PermissionStatus.limited:
        return 'limited';
      case ph.PermissionStatus.permanentlyDenied:
        return 'permanentlyDenied';
      case ph.PermissionStatus.provisional:
        return 'provisional';
    }
  }
}
