import { describe, expect, it } from "vitest";
import { activeTierFromEntitlements, productIdFor } from "@/lib/store-billing";
import { detectStoreHost } from "@/lib/paywall-store-host";

describe("productIdFor", () => {
  it("sends a distinct product per tier and duration", () => {
    expect(productIdFor("pro", "quarterly")).toBe("fitmonk_pro_quarterly");
    expect(productIdFor("pro", "yearly")).toBe("fitmonk_pro_yearly");
    expect(productIdFor("elite", "yearly")).toBe("fitmonk_elite_yearly");
  });
});

describe("activeTierFromEntitlements", () => {
  it("returns null when nothing is active", () => {
    expect(activeTierFromEntitlements(null)).toBeNull();
    expect(activeTierFromEntitlements({ entitlements: {} })).toBeNull();
    expect(
      activeTierFromEntitlements({
        entitlements: { pro: { id: "pro", active: false } },
      }),
    ).toBeNull();
  });

  it("picks the highest active tier", () => {
    expect(
      activeTierFromEntitlements({
        entitlements: {
          starter: { id: "starter", active: true },
          elite: { id: "elite", active: true },
          pro: { id: "pro", active: true },
        },
      }),
    ).toBe("elite");
  });

  it("falls back to the product id when the entitlement id is custom", () => {
    expect(
      activeTierFromEntitlements({
        entitlements: {
          premium: { id: "premium", active: true, productId: "fitmonk_pro_yearly" },
        },
      }),
    ).toBe("pro");
  });
});

describe("detectStoreHost", () => {
  it("treats plain browsers as web", () => {
    expect(detectStoreHost("Mozilla/5.0 (iPhone) Safari")).toBe("web");
    expect(detectStoreHost(null)).toBe("web");
  });

  it("uses the platform the shell declares", () => {
    expect(detectStoreHost("Mozilla/5.0 (Macintosh) FitmonkShell/1.0 FitmonkPlatform/ios")).toBe(
      "appleStore",
    );
    expect(detectStoreHost("Mozilla/5.0 (Linux; Android 14) FitmonkShell/1.0 FitmonkPlatform/android")).toBe(
      "googlePlay",
    );
  });

  it("still recognises older shells", () => {
    expect(detectStoreHost("Mozilla/5.0 (iPhone) FitmonkShell/1.0")).toBe("appleStore");
    expect(detectStoreHost("Mozilla/5.0 (Macintosh) FitmonkShell/1.0")).toBe("appleStore");
    expect(detectStoreHost("Mozilla/5.0 (Linux; Android 14) FitmonkShell/1.0")).toBe("googlePlay");
  });
});
