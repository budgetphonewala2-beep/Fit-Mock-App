"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Close-on-back for full-screen overlays.
 *
 * The Flutter shell wraps this site as a WebView, and its Android back handler
 * runs `webview.goBack()` — which walks browser history, not React state. An
 * overlay that lives only in state (like the home-session player or a modal)
 * is invisible to that history, so back skips the overlay and jumps to the
 * previous URL — usually a different bottom-tab.
 *
 * When the overlay opens we push a marker history entry, and treat `popstate`
 * as "close me". If the user closes via a UI control instead, the cleanup
 * pops that marker back off so the URL stays clean.
 */
export function useHardwareBackClose(open: boolean, onClose: () => void) {
  // Callers usually pass an inline lambda, which is a fresh reference on every
  // render. Keep it in a ref so the effect below runs off `open` alone —
  // otherwise every parent re-render tore the effect down and back-navigated
  // its own marker off the stack, which delivered a popstate to the freshly-
  // attached handler and closed the overlay a beat after it opened.
  const onCloseRef = useRef(onClose);
  // Refs must not be written during render; sync it right after each commit.
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;

    const marker = { __overlayBack: true };
    window.history.pushState(marker, "");

    const handlePop = () => {
      onCloseRef.current();
    };
    window.addEventListener("popstate", handlePop);

    return () => {
      window.removeEventListener("popstate", handlePop);
      // If our marker is still on top when the effect tears down (the user
      // closed via a UI control rather than back), consume it — otherwise
      // the next back tap would fire our stale popstate handler.
      if ((window.history.state as { __overlayBack?: boolean } | null)?.__overlayBack) {
        window.history.back();
      }
    };
  }, [open]);
}
