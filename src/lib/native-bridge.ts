// Typed client for the Flutter shell (mobile/).
//
// On mobile, `window.FitmonkBridge` is injected by the shell before the app
// runs. On web, `nativeBridge` returns null-safe defaults so callers can
// use the same call sites without branching on `isNative` every time.

export type Platform = "ios" | "android";

export type PermissionName =
  | "camera"
  | "microphone"
  | "photos"
  | "notifications"
  | "location"
  | "locationAlways"
  | "contacts"
  | "bluetooth"
  | "motion";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "restricted"
  | "limited"
  | "permanentlyDenied"
  | "provisional"
  | "notDetermined"
  | "unknown";

export type NotificationAuth =
  | "granted"
  | "denied"
  | "notDetermined"
  | "provisional"
  | "error";

export interface EntitlementSnapshot {
  id: string;
  active: boolean;
  productId?: string;
  startedAt?: number;
  expiresAt?: number;
  renewState?: string;
}

export interface EntitlementsPayload {
  entitlements: Record<string, EntitlementSnapshot>;
}

export interface DeviceInfo {
  platform: string;
  app: {
    name: string;
    packageName: string;
    version: string;
    buildNumber: string;
  };
  device: Record<string, unknown>;
  connectivity: string[];
}

export interface NotificationTap {
  source: "local" | "remote";
  coldStart?: boolean;
  payload?: unknown;
  actionId?: string | null;
}

export interface GoogleSignInResult {
  idToken: string;
  accessToken?: string | null;
  email?: string | null;
  displayName?: string | null;
  photoUrl?: string | null;
}

export interface RemoteNotification {
  messageId?: string;
  from?: string;
  sentTime?: number;
  data?: Record<string, string>;
  notification?: { title?: string; body?: string } | null;
}

type BridgeEventMap = {
  "app.foreground": undefined;
  "app.background": undefined;
  "notification.received": RemoteNotification;
  "notification.opened": NotificationTap;
  "notification.tokenRefreshed": { token: string };
  "purchases.entitlementsChanged": EntitlementsPayload;
};

type BridgeEvent = keyof BridgeEventMap;
type BridgeListener<E extends BridgeEvent> = (payload: BridgeEventMap[E]) => void;
type Unsubscribe = () => void;

interface RawBridge {
  isNative: true;
  platform: Platform;
  version: string;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  on<E extends BridgeEvent>(event: E, handler: BridgeListener<E>): Unsubscribe;
}

declare global {
  interface Window {
    FitmonkBridge?: RawBridge;
  }
}

async function dataUrlToFile(dataUrl: string, basename: string): Promise<File> {
  const mimeMatch = /^data:([^;]+);/.exec(dataUrl);
  const mime = mimeMatch?.[1] ?? "image/jpeg";
  const ext = mime.split("/")[1] === "png" ? "png" : "jpg";
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], `${basename}.${ext}`, { type: mime });
}

function raw(): RawBridge | null {
  if (typeof window === "undefined") return null;
  return window.FitmonkBridge ?? null;
}

export const nativeBridge = {
  get isNative(): boolean {
    return !!raw();
  },

  get platform(): Platform | null {
    return raw()?.platform ?? null;
  },

  on<E extends BridgeEvent>(event: E, handler: BridgeListener<E>): Unsubscribe {
    const r = raw();
    if (!r) return () => {};
    return r.on(event, handler);
  },

  analytics: {
    logEvent(name: string, params?: Record<string, string | number | boolean>) {
      return raw()?.request("analytics.logEvent", { name, params }) ?? Promise.resolve();
    },
    setUserId(userId: string | null) {
      return raw()?.request("analytics.setUserId", { userId }) ?? Promise.resolve();
    },
    setUserProperty(name: string, value: string | null) {
      return raw()?.request("analytics.setUserProperty", { name, value }) ?? Promise.resolve();
    },
  },

  purchases: {
    async getOfferings(): Promise<unknown> {
      return (await raw()?.request("purchases.getOfferings")) ?? null;
    },
    async getEntitlements(): Promise<EntitlementsPayload> {
      const result = await raw()?.request("purchases.getEntitlements");
      return (result as EntitlementsPayload) ?? { entitlements: {} };
    },
    async purchase(productId: string): Promise<EntitlementsPayload> {
      const result = await raw()?.request("purchases.purchase", { productId });
      return (result as EntitlementsPayload) ?? { entitlements: {} };
    },
    async restore(): Promise<EntitlementsPayload> {
      const result = await raw()?.request("purchases.restore");
      return (result as EntitlementsPayload) ?? { entitlements: {} };
    },
    identify(userId: string) {
      return raw()?.request("purchases.identify", { userId }) ?? Promise.resolve();
    },
    logout() {
      return raw()?.request("purchases.logout") ?? Promise.resolve();
    },
  },

  notifications: {
    async requestPermission(): Promise<{ status: NotificationAuth }> {
      const result = await raw()?.request("notifications.requestPermission");
      return (result as { status: NotificationAuth }) ?? { status: "denied" };
    },
    async getFcmToken(): Promise<string | null> {
      const result = await raw()?.request("notifications.getFcmToken");
      return ((result as { token?: string })?.token as string | null) ?? null;
    },
    subscribeTopic(topic: string) {
      return raw()?.request("notifications.subscribeTopic", { topic }) ?? Promise.resolve();
    },
    unsubscribeTopic(topic: string) {
      return raw()?.request("notifications.unsubscribeTopic", { topic }) ?? Promise.resolve();
    },
    showLocal(input: { title: string; body?: string; payload?: string }) {
      return raw()?.request("notifications.showLocal", input) ?? Promise.resolve({ id: 0 });
    },
    scheduleLocal(input: {
      title: string;
      body?: string;
      epochMillis: number;
      payload?: string;
    }) {
      return raw()?.request("notifications.scheduleLocal", input) ?? Promise.resolve({ id: 0 });
    },
    cancelLocal(id: number) {
      return raw()?.request("notifications.cancelLocal", { id }) ?? Promise.resolve();
    },
  },

  permissions: {
    async request(permission: PermissionName): Promise<PermissionStatus> {
      const result = await raw()?.request("permissions.request", { permission });
      return ((result as { status?: PermissionStatus })?.status ?? "unknown") as PermissionStatus;
    },
    async check(permission: PermissionName): Promise<PermissionStatus> {
      const result = await raw()?.request("permissions.check", { permission });
      return ((result as { status?: PermissionStatus })?.status ?? "unknown") as PermissionStatus;
    },
    openSettings() {
      return raw()?.request("permissions.openSettings") ?? Promise.resolve();
    },
  },

  device: {
    async info(): Promise<DeviceInfo | null> {
      const result = await raw()?.request("device.info");
      return (result as DeviceInfo) ?? null;
    },
    openExternal(url: string) {
      if (!raw()) {
        if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
        return Promise.resolve({ opened: true });
      }
      return raw()!.request("device.openExternal", { url }) as Promise<{ opened: boolean }>;
    },
    share(input: { text: string; subject?: string }) {
      if (!raw()) {
        if (typeof navigator !== "undefined" && "share" in navigator) {
          return (navigator as unknown as { share: (d: ShareData) => Promise<void> })
            .share({ text: input.text, title: input.subject })
            .then(() => ({ status: "success" }));
        }
        return Promise.resolve({ status: "unavailable" });
      }
      return raw()!.request("device.share", input) as Promise<{ status: string }>;
    },
    /**
     * Share an image (as a JPEG/PNG data URL) alongside caption text through
     * the OS share sheet. Falls back to text-only when the shell hasn't shipped
     * the image handler yet, so an older native build never breaks the caller.
     */
    async shareImage(input: {
      text: string;
      subject?: string;
      /** data:image/(jpeg|png);base64,… */
      image: string;
      /** Suggested filename for the shared file, no extension. */
      filename?: string;
    }) {
      const filename = input.filename ?? "fitmonk-streak";

      // Web: use the Files variant of Web Share when available.
      if (!raw()) {
        if (typeof navigator !== "undefined" && "share" in navigator) {
          try {
            const file = await dataUrlToFile(input.image, filename);
            const canShareFiles =
              typeof (navigator as unknown as { canShare?: (d: ShareData) => boolean }).canShare === "function"
                ? (navigator as unknown as { canShare: (d: ShareData) => boolean }).canShare({ files: [file] })
                : true;
            const data: ShareData = canShareFiles
              ? { files: [file], text: input.text, title: input.subject }
              : { text: input.text, title: input.subject };
            await (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share(data);
            return { status: "success" };
          } catch {
            return { status: "cancelled" };
          }
        }
        return { status: "unavailable" };
      }

      // Native: try the image handler, fall back to text-only if the shell is
      // an older build that doesn't know about it.
      try {
        return (await raw()!.request("device.shareImage", {
          text: input.text,
          subject: input.subject,
          image: input.image,
          filename,
        })) as { status: string };
      } catch {
        return (await raw()!.request("device.share", {
          text: input.text,
          subject: input.subject,
        })) as { status: string };
      }
    },
  },

  auth: {
    /**
     * Runs the native Google Sign-In flow (avoids Google's WebView block).
     * Returns the id token the web app can hand to `signInWithCredential`,
     * plus a few profile hints. `null` on web builds — callers must gate
     * on `isNative` before using it.
     */
    async googleSignIn(): Promise<GoogleSignInResult | null> {
      const result = await raw()?.request("auth.googleSignIn");
      return (result as GoogleSignInResult) ?? null;
    },
    googleSignOut() {
      return raw()?.request("auth.googleSignOut") ?? Promise.resolve();
    },
  },

  haptics: {
    impact(style: "light" | "medium" | "heavy" = "light") {
      return raw()?.request("haptics.impact", { style }) ?? Promise.resolve();
    },
    selection() {
      return raw()?.request("haptics.selection") ?? Promise.resolve();
    },
    notification(type: "success" | "warning" | "error" = "success") {
      return raw()?.request("haptics.notification", { type }) ?? Promise.resolve();
    },
  },
};

export type NativeBridge = typeof nativeBridge;
