import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:qonversion_flutter/qonversion_flutter.dart';

import '../bridge/web_channel.dart';
import '../config/env.dart';

class PurchasesService {
  PurchasesService._();
  static final PurchasesService instance = PurchasesService._();

  bool _initialized = false;
  StreamSubscription<Map<String, QEntitlement>>? _entitlementsSub;

  Future<void> init() async {
    if (_initialized) return;
    const key = Env.qonversionProjectKey;
    if (key.isEmpty) {
      debugPrint(
        'PurchasesService: QONVERSION_PROJECT_KEY not set; skipping init',
      );
      return;
    }
    try {
      final config = QonversionConfigBuilder(
        key,
        QLaunchMode.subscriptionManagement,
      ).build();
      Qonversion.initialize(config);
      _initialized = true;

      _entitlementsSub = Qonversion.getSharedInstance()
          .updatedEntitlementsStream
          .listen((entitlements) {
        WebChannel.instance.emit(
          'purchases.entitlementsChanged',
          _entitlementsToJson(entitlements),
        );
      });
    } catch (e, s) {
      debugPrint('PurchasesService init failed: $e\n$s');
    }
  }

  Future<Map<String, Object?>> getOfferings() async {
    if (!_initialized) return {'main': null, 'available': const <Object>[]};
    final offerings = await Qonversion.getSharedInstance().offerings();
    return {
      'main': _offeringToJson(offerings.main),
      'available': offerings.availableOfferings.map(_offeringToJson).toList(),
    };
  }

  Future<Map<String, Object?>> getEntitlements() async {
    if (!_initialized) return {'entitlements': const <String, Object>{}};
    final entitlements =
        await Qonversion.getSharedInstance().checkEntitlements();
    return _entitlementsToJson(entitlements);
  }

  Future<Map<String, Object?>> purchase(String productId) async {
    if (!_initialized) {
      throw StateError('Purchases not initialized');
    }
    final model = QPurchaseModel(productId);
    final entitlements =
        await Qonversion.getSharedInstance().purchase(model);
    return _entitlementsToJson(entitlements);
  }

  Future<Map<String, Object?>> restore() async {
    if (!_initialized) return {'entitlements': const <String, Object>{}};
    final entitlements = await Qonversion.getSharedInstance().restore();
    return _entitlementsToJson(entitlements);
  }

  Future<void> identify(String userId) async {
    if (!_initialized) return;
    await Qonversion.getSharedInstance().identify(userId);
  }

  Future<void> logout() async {
    if (!_initialized) return;
    await Qonversion.getSharedInstance().logout();
  }

  Map<String, Object?>? _offeringToJson(QOffering? offering) {
    if (offering == null) return null;
    return {
      'id': offering.id,
      'tag': offering.tag.name,
      'products': offering.products
          .map((p) => {
                'id': p.qonversionId,
                'storeId': p.storeId,
                'prettyPrice': p.prettyPrice,
                'type': p.type.name,
              })
          .toList(),
    };
  }

  Map<String, Object?> _entitlementsToJson(Map<String, QEntitlement> map) {
    return {
      'entitlements': map.map(
        (key, e) => MapEntry(key, {
          'id': e.id,
          'active': e.isActive,
          'productId': e.productId,
          'startedAt': e.startedDate?.millisecondsSinceEpoch,
          'expiresAt': e.expirationDate?.millisecondsSinceEpoch,
          'renewState': e.renewState.name,
        }),
      ),
    };
  }

  void dispose() {
    _entitlementsSub?.cancel();
    _entitlementsSub = null;
  }
}
