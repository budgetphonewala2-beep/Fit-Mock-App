"use client";

import { useEffect, useState } from "react";

type KeyboardViewport = {
  /** Pixels of the layout viewport currently covered by the on-screen keyboard. */
  inset: number;
  /** Height actually visible to the user, i.e. excluding the keyboard. */
  height: number | null;
  isOpen: boolean;
};

// iOS resizes the *visual* viewport when the keyboard opens but leaves the layout
// viewport (and therefore 100dvh) at full height, so a full-screen flex layout
// keeps rendering behind the keyboard and Safari force-scrolls to reveal the
// focused input. Tracking visualViewport lets the layout shrink to what the user
// can actually see, the way a native app does.
export function useKeyboardInset(): KeyboardViewport {
  const [inset, setInset] = useState(0);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const viewport = window.visualViewport;

    if (!viewport) {
      return;
    }

    let wasOpen = false;
    let scrollBeforeKeyboard = 0;

    const update = () => {
      // innerHeight is the layout viewport, which iOS leaves at full height while
      // the keyboard is up; visualViewport.height is what the user can actually see,
      // so the difference is the keyboard. offsetTop must NOT be subtracted here: it
      // is how far iOS scrolled to reveal the focused input, and subtracting it
      // cancels out the keyboard height and defeats the detection entirely.
      const covered = window.innerHeight - viewport.height;
      // Small deltas are the collapsing browser toolbar, not a keyboard.
      const nextInset = Math.max(0, Math.round(covered));
      const isOpen = nextInset > 120;

      setInset(nextInset);
      setHeight(Math.round(viewport.height));

      if (isOpen && !wasOpen) {
        scrollBeforeKeyboard = window.scrollY;
        // Collapse the scroll iOS applied to reveal the input, so a container sized
        // to the visible height lines up with the visible area instead of hanging
        // below it. The position above is restored on dismiss.
        window.scrollTo(0, 0);
      }

      // iOS often leaves the page scrolled after the keyboard dismisses, which is
      // what makes it feel like the screen never returns to where it started.
      // Restore where the user actually was rather than jumping to the top, which
      // would be wrong on long scrolling screens like Diet.
      if (wasOpen && !isOpen) {
        window.scrollTo(0, scrollBeforeKeyboard);
      }

      wasOpen = isOpen;
    };

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return { inset, height, isOpen: inset > 120 };
}
