import { describe, expect, it, vi } from "vitest";
import {
  CAMERA_TAP_WINDOW_MS,
  ensureCameraPermission,
  needsSecondCameraTap,
} from "@/lib/camera-permission";
import type { PermissionStatus } from "@/lib/native-bridge";

function bridge(checked: PermissionStatus, requested: PermissionStatus = checked) {
  return {
    isNative: true,
    permissions: {
      check: vi.fn(async () => checked),
      request: vi.fn(async () => requested),
    },
  };
}

describe("camera permission", () => {
  // The reported bug: the camera button opened the gallery because nothing
  // ever asked Android for camera access.
  it("asks for camera access when the app doesn't have it yet", async () => {
    const shell = bridge("denied", "granted");

    await expect(ensureCameraPermission(shell)).resolves.toEqual({
      outcome: "granted",
      prompted: true,
    });
    expect(shell.permissions.request).toHaveBeenCalledWith("camera");
  });

  it("goes straight to the camera once access is granted", async () => {
    const shell = bridge("granted");

    await expect(ensureCameraPermission(shell)).resolves.toEqual({
      outcome: "granted",
      prompted: false,
    });
    expect(shell.permissions.request).not.toHaveBeenCalled();
  });

  it("reports a dismissed prompt and a permanent block apart", async () => {
    await expect(ensureCameraPermission(bridge("denied"))).resolves.toMatchObject({
      outcome: "dismissed",
    });
    await expect(ensureCameraPermission(bridge("permanentlyDenied"))).resolves.toMatchObject({
      outcome: "blocked",
    });
  });

  it("treats a bridge failure as a dismissed prompt", async () => {
    const shell = bridge("denied");
    shell.permissions.request.mockRejectedValueOnce(new Error("bridge gone"));

    await expect(ensureCameraPermission(shell)).resolves.toMatchObject({
      outcome: "dismissed",
    });
  });

  it("does nothing in a regular browser, which prompts on its own", async () => {
    const browser = { ...bridge("denied"), isNative: false };

    await expect(ensureCameraPermission(browser)).resolves.toEqual({
      outcome: "granted",
      prompted: false,
    });
    expect(browser.permissions.check).not.toHaveBeenCalled();
  });

  it("asks for a second tap only after a slow prompt", () => {
    expect(needsSecondCameraTap(false, 60_000)).toBe(false);
    expect(needsSecondCameraTap(true, 1_500)).toBe(false);
    expect(needsSecondCameraTap(true, CAMERA_TAP_WINDOW_MS + 1)).toBe(true);
  });
});
