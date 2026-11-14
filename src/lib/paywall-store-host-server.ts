import "server-only";
import { headers } from "next/headers";
import { detectStoreHost, type StoreHost } from "@/lib/paywall-store-host";

export async function getStoreHost(): Promise<StoreHost> {
  const h = await headers();
  return detectStoreHost(h.get("user-agent"));
}
