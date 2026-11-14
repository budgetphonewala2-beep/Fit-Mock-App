import 'package:flutter/services.dart';

class HapticsService {
  HapticsService._();
  static final HapticsService instance = HapticsService._();

  Future<void> impact(String? style) async {
    switch (style) {
      case 'heavy':
        await HapticFeedback.heavyImpact();
        break;
      case 'medium':
        await HapticFeedback.mediumImpact();
        break;
      case 'light':
      default:
        await HapticFeedback.lightImpact();
    }
  }

  Future<void> selection() => HapticFeedback.selectionClick();

  Future<void> notification(String? type) async {
    // No cross-platform notification-style haptic in Flutter yet; treat as
    // a medium impact to give an equivalent thump on both platforms.
    await HapticFeedback.mediumImpact();
  }
}
