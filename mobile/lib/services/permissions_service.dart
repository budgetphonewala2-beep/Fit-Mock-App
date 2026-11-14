import 'package:permission_handler/permission_handler.dart' as ph;

class PermissionsService {
  PermissionsService._();
  static final PermissionsService instance = PermissionsService._();

  static const Map<String, ph.Permission> _map = {
    // No photos or location: the manifest doesn't declare them (see
    // AndroidManifest.xml), so asking would only ever come back denied.
    'camera': ph.Permission.camera,
    'microphone': ph.Permission.microphone,
    'notifications': ph.Permission.notification,
    'contacts': ph.Permission.contacts,
    'bluetooth': ph.Permission.bluetoothConnect,
    'motion': ph.Permission.sensors,
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
