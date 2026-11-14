"use client";

import { useEffect } from "react";
import { nativeBridge } from "@/lib/native-bridge";

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

/**
 * Blurred colour fields the `.glass` surfaces pick their tint up from. Pinned
 * to the viewport so the backdrop never ends mid-scroll; render it first
 * inside a `.glass-ui` screen.
 *
 * It also flags `data-glass="solid"` on <html>, which swaps every glass
 * surface to near-solid with no backdrop blur. Backdrop blur stutters
 * scrolling in Android WebView categorically — not just on cheap phones —
 * so we flip the whole platform to solid; iOS keeps the blur unless its own
 * low-memory heuristic trips.
 */
export function GlassBackdrop() {
  useEffect(() => {
    const nav = navigator as NavigatorWithMemory;
    const lowMemory = (nav.deviceMemory ?? 8) <= 3;
    const fewCores = (nav.hardwareConcurrency ?? 8) <= 4;
    const isAndroidWebView = nativeBridge.isNative && nativeBridge.platform === "android";
    if (lowMemory || fewCores || isAndroidWebView) {
      document.documentElement.dataset.glass = "solid";
    }
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden bg-[#dcd6cc]/55"
    >
      <div className="absolute -right-16 -top-10 h-60 w-60 rounded-full bg-[#7fb8a0]/70 blur-[56px]" />
      <div className="absolute -left-20 top-[26%] h-64 w-64 rounded-full bg-[#f2a65a]/60 blur-[60px]" />
      <div className="absolute -right-16 top-[58%] h-56 w-56 rounded-full bg-[#8ec5e8]/55 blur-[56px]" />
      <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-[#f0c987]/55 blur-[56px]" />
    </div>
  );
}
