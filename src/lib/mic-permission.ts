import { nativeBridge, type PermissionStatus } from "@/lib/native-bridge";

// Voice input runs on the WebView's SpeechRecognition. In the native shell that
// only works once the OS has granted the app microphone access, and the WebView
// never asks for it itself: it just fails with "not-allowed". So every voice
// button asks the shell first, which is what shows the system mic prompt. In a
// regular browser there's nothing to do; the browser prompts on its own.

export type MicPermissionOutcome = "granted" | "dismissed" | "blocked";

export function classifyMicPermission(status: PermissionStatus): MicPermissionOutcome {
  if (status === "permanentlyDenied" || status === "restricted") {
    return "blocked";
  }
  if (status === "granted" || status === "limited" || status === "provisional") {
    return "granted";
  }
  // Denied once, prompt dismissed, or unknown: the user can simply tap again.
  return "dismissed";
}

type MicBridge = {
  isNative: boolean;
  permissions: { request(permission: "microphone"): Promise<PermissionStatus> };
};

export async function ensureMicPermission(
  bridge: MicBridge = nativeBridge,
): Promise<MicPermissionOutcome> {
  if (!bridge.isNative) {
    return "granted";
  }
  const status = await bridge.permissions
    .request("microphone")
    .catch(() => "unknown" as const);
  return classifyMicPermission(status);
}

export const MIC_BLOCKED_IN_APP = "Microphone is blocked. Tap to open app settings.";
export const MIC_BLOCKED_IN_BROWSER =
  "Microphone access is blocked. Enable it in your browser settings.";

// In the app there's no browser to change settings in, so point at the app's
// own settings page instead.
export function micBlockedMessage(isNative: boolean = nativeBridge.isNative) {
  return isNative ? MIC_BLOCKED_IN_APP : MIC_BLOCKED_IN_BROWSER;
}

export function openMicSettings() {
  void nativeBridge.permissions.openSettings();
}
