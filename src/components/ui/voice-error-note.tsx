"use client";

import { MIC_BLOCKED_IN_APP, openMicSettings } from "@/lib/mic-permission";

// A voice-input error line. The in-app "Microphone is blocked. Tap to open app
// settings." message is a button that does what it says; every other message
// is plain text.
export function VoiceErrorNote({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  if (message === MIC_BLOCKED_IN_APP) {
    return (
      <button
        type="button"
        onClick={openMicSettings}
        className={`${className ?? ""} block w-full underline underline-offset-2`}
      >
        {message}
      </button>
    );
  }

  return <p className={className}>{message}</p>;
}
