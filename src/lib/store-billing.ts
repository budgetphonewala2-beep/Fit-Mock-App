import type { BillingDuration } from "@/lib/pricing";
import type { SubscriptionTier } from "@/lib/types";
import type { EntitlementsPayload } from "@/lib/native-bridge";

/**
 * In-app subscriptions are sold only through the platform stores, App Store
 * (StoreKit) on iOS and Google Play Billing on Android, via Qonversion in the
 * Flutter shell.
 *
 * Qonversion dashboard setup this file relies on:
 *
 * Products (Qonversion product id → store products):
 *   fitmonk_starter_quarterly  fitmonk_starter_yearly
 *   fitmonk_pro_quarterly      fitmonk_pro_yearly
 *   fitmonk_elite_quarterly    fitmonk_elite_yearly
 *   Each one is linked to an App Store auto-renewable subscription and a Play
 *   subscription + base plan (e.g. Play product `fitmonk_pro`, base plans
 *   `quarterly` / `yearly`). The yearly ones carry the 7-day free trial as an
 *   introductory offer (App Store) / free-trial offer (Play).
 *
 * Entitlements: `starter`, `pro`, `elite`, each granted by both durations of
 * its tier. Higher tiers should also grant the lower entitlements, but the
 * mapping below takes the highest active one either way.
 */
export function productIdFor(tier: SubscriptionTier, duration: BillingDuration): string {
  return `fitmonk_${tier}_${duration}`;
}

const TIER_ORDER: SubscriptionTier[] = ["elite", "pro", "starter"];

function tierFromId(id: string | undefined | null): SubscriptionTier | null {
  if (!id) return null;
  const lower = id.toLowerCase();
  return TIER_ORDER.find((tier) => lower === tier || lower.includes(tier)) ?? null;
}

/**
 * The highest tier the user currently has an active entitlement for, or
 * `null` when nothing is active.
 */
export function activeTierFromEntitlements(
  payload: EntitlementsPayload | null | undefined,
): SubscriptionTier | null {
  const entitlements = payload?.entitlements ?? {};
  const active = new Set<SubscriptionTier>();
  for (const [key, entitlement] of Object.entries(entitlements)) {
    if (!entitlement?.active) continue;
    const tier =
      tierFromId(entitlement.id) ?? tierFromId(key) ?? tierFromId(entitlement.productId);
    if (tier) active.add(tier);
  }
  return TIER_ORDER.find((tier) => active.has(tier)) ?? null;
}
