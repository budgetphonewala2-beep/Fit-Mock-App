import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:qonversion_flutter/qonversion_flutter.dart';

import '../bridge/bridge_error.dart';
import '../bridge/web_channel.dart';
import '../config/env.dart';
import 'ios_store_service.dart';

/// In-app subscriptions through the platform's own billing: StoreKit (App
/// Store) on iOS and Google Play Billing on Android. Qonversion sits on top
/// of both so receipts are validated server-side and entitlements are the
/// same shape on either platform.
///
/// Product ids passed in from the web are **Qonversion product ids** (set up
/// in the Qonversion dashboard, each linked to an App Store product id and a
/// Play product + base plan). Entitlement ids are `starter`, `pro`, `elite`.
class PurchasesService {
  PurchasesService._();
  static final PurchasesService instance = PurchasesService._();

  bool _initialized = false;
  StreamSubscription<Map<String, QEntitlement>>? _entitlementsSub;

  bool get isAvailable => _initialized;

  // iOS goes straight to StoreKit 2 (IosStoreService); Android keeps Play
  // Billing through Qonversion.
  static final bool _ios = Platform.isIOS;

  Future<void> init() async {
    if (_ios) return IosStoreService.instance.init();
    if (_initialized) return;
    const key = Env.qonversionProjectKey;
    if (key.isEmpty) {
      debugPrint(
        'PurchasesService: QONVERSION_PROJECT_KEY not set; in-app purchases are disabled',
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

  void _requireInitialized() {
    if (!_initialized) {
      throw BridgeError(
        'purchases_unavailable',
        'In-app purchases are not set up in this build.',
      );
    }
  }

  Future<Map<String, Object?>> getOfferings() async {
    if (_ios) return {'main': null, 'available': const <Object>[]};
    if (!_initialized) return {'main': null, 'available': const <Object>[]};
    // Kept for older web builds; the paywall now uses getProducts.
    // ignore: deprecated_member_use
    final offerings = await Qonversion.getSharedInstance().offerings();
    return {
      'main': _offeringToJson(offerings.main),
      'available': offerings.availableOfferings.map(_offeringToJson).toList(),
    };
  }

  /// Every product configured in Qonversion with its localized store price,
  /// keyed by Qonversion product id. The paywall shows these prices so the
  /// amount on screen always matches what the store sheet will charge.
  Future<Map<String, Object?>> getProducts() async {
    if (_ios) return IosStoreService.instance.getProducts();
    if (!_initialized) return {'available': false, 'products': const <String, Object>{}};
    final products = await Qonversion.getSharedInstance().products();
    return {
      'available': true,
      'products': products.map((id, p) => MapEntry(id, _productToJson(p))),
    };
  }

  Future<Map<String, Object?>> getEntitlements() async {
    if (_ios) return IosStoreService.instance.getEntitlements();
    if (!_initialized) return {'entitlements': const <String, Object>{}};
    final entitlements =
        await Qonversion.getSharedInstance().checkEntitlements();
    return _entitlementsToJson(entitlements);
  }

  Future<Map<String, Object?>> purchase(String productId) async {
    if (_ios) return IosStoreService.instance.purchase(productId);
    _requireInitialized();
    final q = Qonversion.getSharedInstance();
    final products = await q.products();
    final product = products[productId];
    if (product == null) {
      throw BridgeError(
        'product_not_found',
        'Product "$productId" is not configured in Qonversion.',
      );
    }
    // purchaseWithResult reports cancel/pending/error as a status instead of
    // throwing, so each outcome maps to its own bridge code.
    final result = await q.purchaseWithResult(product);
    if (result.isSuccess) {
      return _entitlementsToJson(result.entitlements ?? const {});
    }
    if (result.isCanceled) {
      throw BridgeError('purchase_cancelled', 'Purchase cancelled.');
    }
    if (result.isPending) {
      // Slow payment methods (UPI on Play, Ask to Buy on iOS) finish later;
      // the entitlement then arrives through updatedEntitlementsStream.
      throw BridgeError(
        'purchase_pending',
        'Your payment is pending. Access unlocks as soon as it completes.',
      );
    }
    throw BridgeError(
      'purchase_failed',
      result.error?.message ?? 'The store could not complete the purchase.',
    );
  }

  Future<Map<String, Object?>> restore() async {
    if (_ios) return IosStoreService.instance.restore();
    _requireInitialized();
    final entitlements = await Qonversion.getSharedInstance().restore();
    return _entitlementsToJson(entitlements);
  }

  Future<void> identify(String userId) async {
    if (_ios) return; // StoreKit purchases belong to the Apple ID.
    if (!_initialized) return;
    await Qonversion.getSharedInstance().identify(userId);
  }

  Future<void> logout() async {
    if (_ios) return;
    if (!_initialized) return;
    await Qonversion.getSharedInstance().logout();
  }

  Map<String, Object?> _productToJson(QProduct p) => {
        'id': p.qonversionId,
        'storeId': p.storeId,
        'basePlanId': p.basePlanId,
        'prettyPrice': p.prettyPrice,
        'type': p.type.name,
      };

  Map<String, Object?>? _offeringToJson(QOffering? offering) {
    if (offering == null) return null;
    return {
      'id': offering.id,
      'tag': offering.tag.name,
      'products': offering.products.map(_productToJson).toList(),
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
