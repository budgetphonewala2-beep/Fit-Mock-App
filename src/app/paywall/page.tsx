import { Suspense } from "react";
import { getStoreHost } from "@/lib/paywall-store-host-server";
import PaywallClient from "./paywall-client";

// Server component so the first paint has the right {store} wording for the
// renewal line. The client reads `useSearchParams()` so it must sit under a
// Suspense boundary — the boundary belongs here, not inside the client, or
// the page fails to prerender at build time.
export default async function PaywallPage() {
  const storeHost = await getStoreHost();
  return (
    <Suspense fallback={null}>
      <PaywallClient storeHost={storeHost} />
    </Suspense>
  );
}
