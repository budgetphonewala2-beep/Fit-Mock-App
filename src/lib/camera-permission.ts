import { nativeBridge, type PermissionStatus } from "@/lib/native-bridge";
import { classifyMicPermission, type MicPermissionOutcome } from "@/lib/mic-permission";

// The meal camera is a file input with capture="environment". In the native
// shell the WebView plugin only opens the camera for it once the OS has
// granted the app camera access; without that it silently falls back to the
// gallery picker, and nothing ever asks for the permission. So the camera
// button asks the shell first, like the voice buttons do for the mic.

export type CameraPermissionOutcome = MicPermissionOutcome;

type CameraBridge = {
  isNative: boolean;
  permissions: {
    check(permission: "camera"): Promise<PermissionStatus>;
    request(permission: "camera"): Promise<PermissionStatus>;
  };
};

export async function ensureCameraPermission(
  bridge: CameraBridge = nativeBridge,
): Promise<{ outcome: CameraPermissionOutcome; prompted: boolean }> {
  if (!bridge.isNative) {
    return { outcome: "granted", prompted: false };
  }
  // Check first: once granted, the tap goes straight to the camera with no
  // prompt in between.
  const current = await bridge.permissions
    .check("camera")
    .catch(() => "unknown" as const);
  if (classifyMicPermission(current) === "granted") {
    return { outcome: "granted", prompted: false };
  }
  const status = await bridge.permissions
    .request("camera")
    .catch(() => "unknown" as const);
  return { outcome: classifyMicPermission(status), prompted: true };
}

// The WebView only opens a file picker within a few seconds of the tap that
// asked for it (Chromium's user-activation window is 5s). If the user took
// longer than that on the system prompt, opening the camera would silently do
// nothing, so ask for one more tap instead.
export const CAMERA_TAP_WINDOW_MS = 4_000;

export function needsSecondCameraTap(prompted: boolean, elapsedMs: number) {
  return prompted && elapsedMs > CAMERA_TAP_WINDOW_MS;
}

export const CAMERA_BLOCKED_IN_APP = "Camera is blocked. Tap to open app settings.";
export const CAMERA_DISMISSED = "Allow camera access to snap your meal.";
export const CAMERA_TAP_AGAIN = "Camera allowed. Tap the camera again to snap your meal.";

export function openCameraSettings() {
  void nativeBridge.permissions.openSettings();
}
