import { describe, expect, it } from "vitest";
import {
  classifyMicPermission,
  ensureMicPermission,
  micBlockedMessage,
  MIC_BLOCKED_IN_APP,
  MIC_BLOCKED_IN_BROWSER,
} from "@/lib/mic-permission";
import type { PermissionStatus } from "@/lib/native-bridge";

function fakeBridge(isNative: boolean, result: PermissionStatus | Error) {
  const calls: string[] = [];
  return {
    calls,
    bridge: {
      isNative,
      permissions: {
        request: async (permission: "microphone") => {
          calls.push(permission);
          if (result instanceof Error) throw result;
          return result;
        },
      },
    },
  };
}

describe("mic permission", () => {
  it("asks the native shell for the microphone before voice input", async () => {
    const { bridge, calls } = fakeBridge(true, "granted");
    await expect(ensureMicPermission(bridge)).resolves.toBe("granted");
    expect(calls).toEqual(["microphone"]);
  });

  it("doesn't ask in a regular browser, which prompts on its own", async () => {
    const { bridge, calls } = fakeBridge(false, "denied");
    await expect(ensureMicPermission(bridge)).resolves.toBe("granted");
    expect(calls).toEqual([]);
  });

  it("reports a permanent block so the app can offer its settings", async () => {
    await expect(ensureMicPermission(fakeBridge(true, "permanentlyDenied").bridge)).resolves.toBe(
      "blocked",
    );
    await expect(ensureMicPermission(fakeBridge(true, "restricted").bridge)).resolves.toBe(
      "blocked",
    );
  });

  it("treats a dismissed prompt or a failed request as try-again, not blocked", async () => {
    await expect(ensureMicPermission(fakeBridge(true, "denied").bridge)).resolves.toBe("dismissed");
    await expect(
      ensureMicPermission(fakeBridge(true, new Error("bridge down")).bridge),
    ).resolves.toBe("dismissed");
  });

  it("classifies every permission status", () => {
    const cases: [PermissionStatus, string][] = [
      ["granted", "granted"],
      ["limited", "granted"],
      ["provisional", "granted"],
      ["denied", "dismissed"],
      ["notDetermined", "dismissed"],
      ["unknown", "dismissed"],
      ["permanentlyDenied", "blocked"],
      ["restricted", "blocked"],
    ];
    for (const [status, outcome] of cases) {
      expect(classifyMicPermission(status)).toBe(outcome);
    }
  });

  it("points to app settings in the app and browser settings on the web", () => {
    expect(micBlockedMessage(true)).toBe(MIC_BLOCKED_IN_APP);
    expect(micBlockedMessage(false)).toBe(MIC_BLOCKED_IN_BROWSER);
  });
});
