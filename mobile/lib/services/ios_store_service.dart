import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:in_app_purchase_storekit/store_kit_2_wrappers.dart';

import '../bridge/bridge_error.dart';
import '../bridge/web_channel.dart';

/// iOS subscriptions straight through Apple's StoreKit 2: no third-party
/// account or key. Products are the auto-renewable subscriptions set up in
/// App Store Connect (group "Fitmonk"); their ids are what the web paywall
/// sends. Active subscriptions come from `Transaction.currentEntitlements`,
/// which lists only verified, unexpired, unrefunded purchases.
///
/// Returns the same JSON shapes as the Qonversion-based service, so the web
/// side is identical on both platforms.
class IosStoreService {
  IosStoreService._();
  static final IosStoreService instance = IosStoreService._();

  static const productIds = {
    'fitmonk_starter_quarterly',
    'fitmonk_starter_yearly',
    'fitmonk_pro_quarterly',
    'fitmonk_pro_yearly',
    'fitmonk_elite_quarterly',
    'fitmonk_elite_yearly',
  };

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _sub;
  final Map<String, ProductDetails> _products = {};
  Completer<Map<String, Object?>>? _pendingPurchase;
  String? _pendingProductId;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    // Listening also delivers transactions that finished while the app was
    // closed (renewals, Ask to Buy approvals, interrupted purchases).
    _sub = _iap.purchaseStream.listen(_onPurchases, onError: (Object e) {
      debugPrint('[store] purchase stream error: $e');
    });
  }

  Future<void> _onPurchases(List<PurchaseDetails> purchases) async {
    var changed = false;
    for (final p in purchases) {
      final mine = _pendingPurchase != null && p.productID == _pendingProductId;
      switch (p.status) {
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          changed = true;
          if (mine) {
            final completer = _pendingPurchase!;
            _pendingPurchase = null;
            completer.complete(await getEntitlements());
          }
        case PurchaseStatus.pending:
          if (mine) {
            _failPending(BridgeError(
              'purchase_pending',
              'Your payment is pending. Your plan unlocks as soon as it is approved.',
            ));
          }
        case PurchaseStatus.canceled:
          if (mine) _failPending(BridgeError('purchase_cancelled', 'Purchase cancelled.'));
        case PurchaseStatus.error:
          if (mine) {
            _failPending(BridgeError(
              'purchase_failed',
              p.error?.message ?? 'The App Store could not complete the purchase.',
            ));
          }
      }
      if (p.pendingCompletePurchase) {
        try {
          await _iap.completePurchase(p);
        } catch (e) {
          debugPrint('[store] completePurchase failed: $e');
        }
      }
    }
    if (changed) {
      WebChannel.instance.emit('purchases.entitlementsChanged', await getEntitlements());
    }
  }

  void _failPending(BridgeError error) {
    final completer = _pendingPurchase;
    _pendingPurchase = null;
    completer?.completeError(error);
  }

  Future<bool> _loadProducts() async {
    if (_products.length == productIds.length) return true;
    if (!await _iap.isAvailable()) return false;
    final response = await _iap.queryProductDetails(productIds);
    for (final p in response.productDetails) {
      _products[p.id] = p;
    }
    if (response.notFoundIDs.isNotEmpty) {
      debugPrint('[store] products not found: ${response.notFoundIDs}');
    }
    return _products.isNotEmpty;
  }

  Future<Map<String, Object?>> getProducts() async {
    final ok = await _loadProducts();
    return {
      'available': ok,
      'products': {
        for (final p in _products.values)
          p.id: {
            'id': p.id,
            'storeId': p.id,
            'prettyPrice': p.price,
            'type': 'subscription',
          },
      },
    };
  }

  Future<Map<String, Object?>> purchase(String productId) async {
    if (!await _loadProducts()) {
      throw BridgeError('purchases_unavailable', 'The App Store is not available right now.');
    }
    final product = _products[productId];
    if (product == null) {
      throw BridgeError('product_not_found', 'Product "$productId" is not available in the App Store.');
    }
    if (_pendingPurchase != null) {
      throw BridgeError('purchase_failed', 'Another purchase is already in progress.');
    }
    final completer = Completer<Map<String, Object?>>();
    _pendingPurchase = completer;
    _pendingProductId = productId;
    try {
      final started = await _iap.buyNonConsumable(purchaseParam: PurchaseParam(productDetails: product));
      if (!started) {
        _failPending(BridgeError('purchase_failed', 'The App Store could not start the purchase.'));
      }
    } catch (e) {
      // StoreKit reports a user cancel of the payment sheet as an exception
      // on some iOS versions rather than through the stream.
      final text = e.toString().toLowerCase();
      _failPending(text.contains('cancel')
          ? BridgeError('purchase_cancelled', 'Purchase cancelled.')
          : BridgeError('purchase_failed', 'The App Store could not complete the purchase.'));
    }
    // A purchase waits on the user (Face ID, password, Ask to Buy); give up
    // the bridge call eventually so the page is never stuck spinning.
    return completer.future.timeout(const Duration(minutes: 10), onTimeout: () {
      if (identical(_pendingPurchase, completer)) _pendingPurchase = null;
      throw BridgeError('purchase_failed', 'The purchase timed out. Tap Restore Purchases if you were charged.');
    });
  }

  Future<Map<String, Object?>> getEntitlements() async {
    List<SK2Transaction> active = const [];
    try {
      active = await SK2Transaction.currentEntitlements();
    } catch (e) {
      debugPrint('[store] currentEntitlements failed: $e');
    }
    final entitlements = <String, Object?>{};
    for (final t in active) {
      final tier = _tierOf(t.productId);
      if (tier == null) continue;
      entitlements[tier] = {
        'id': tier,
        'active': true,
        'productId': t.productId,
        'startedAt': int.tryParse(t.purchaseDate),
        'expiresAt': t.expirationDate == null ? null : int.tryParse(t.expirationDate!),
        'renewState': 'active',
      };
    }
    return {'entitlements': entitlements};
  }

  /// Restore Purchases: syncs with the App Store (may ask for the Apple ID
  /// password, which is expected for this button), then reads what's active.
  Future<Map<String, Object?>> restore() async {
    try {
      await _iap.restorePurchases();
    } catch (e) {
      debugPrint('[store] restorePurchases failed: $e');
    }
    return getEntitlements();
  }

  String? _tierOf(String productId) {
    for (final tier in const ['elite', 'pro', 'starter']) {
      if (productId.contains(tier)) return tier;
    }
    return null;
  }

  void dispose() {
    _sub?.cancel();
    _sub = null;
  }
}
