"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { signInWithPopup, signInWithRedirect } from "firebase/auth";
import { hasFirebaseEnv } from "@/lib/env";
import {
  createFirebaseAuth,
  createGoogleAuthProvider,
  signInWithGoogleNative,
} from "@/lib/firebase-browser";
import { nativeBridge } from "@/lib/native-bridge";
import { useDietFit } from "@/components/providers/dietfit-provider";
import { LegalFooter } from "@/components/legal/legal-footer";
import { Button } from "@/components/ui/button";
import {
  Screen,
  ScreenBody,
  ScreenFooter,
  ScreenGrow,
} from "@/components/ui/screen";
import { Sub, Title } from "@/components/ui/text";

function getFirebaseErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
}

export default function SignInPage() {
  const router = useRouter();
  const { signInDemo, signInFirebase } = useDietFit();
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState("");

  async function handleGoogleSignIn() {
    setStatus("");

    if (!hasFirebaseEnv()) {
      signInDemo();
      setStatus("Firebase is not configured yet, so demo mode is active.");
      return;
    }

    const auth = createFirebaseAuth();

    if (!auth) {
      signInDemo();
      setStatus("Firebase client is unavailable. Demo mode is active.");
      return;
    }

    setIsLoading(true);
    try {
      // Inside the Flutter shell Google blocks OAuth in WebViews, so we run
      // the native picker via the bridge instead of a popup/redirect.
      const result = nativeBridge.isNative
        ? await signInWithGoogleNative(auth)
        : await signInWithPopup(auth, createGoogleAuthProvider());
      signInFirebase(result.user.email);
      router.push("/workout");
    } catch (signInError) {
      const code = getFirebaseErrorCode(signInError);
      if (code === "cancelled") return;
      if (!nativeBridge.isNative && code === "auth/popup-blocked") {
        setStatus("Opening Google sign-in...");
        await signInWithRedirect(auth, createGoogleAuthProvider());
        return;
      }

      setStatus(
        signInError instanceof Error
          ? signInError.message
          : "Google sign-in could not be completed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Screen theme="dark">
      <ScreenBody center className="pt-10">
        <ScreenGrow />
        <Image
          src="/fitmonk-logo.png"
          alt="Fitmonk"
          width={300}
          height={114}
          className="fm-rise block h-auto w-[68%] max-w-[250px] rounded-[12px]"
          priority
        />
        <div className="h-4" />
        <Title
          size="display-l"
          className="fm-rise text-center"
          style={{ animationDelay: "60ms" }}
        >
          Save your plan
          <br />
          and momentum
        </Title>
        <Sub
          className="fm-rise mx-auto max-w-[420px] text-center text-sand-100/66"
          style={{ animationDelay: "120ms" }}
        >
          Sign in with Google to sync your plan, meals and history across
          devices, or explore in demo mode, saved right here in this browser.
        </Sub>
        <div className="h-4" />
        <div
          className="fm-rise flex max-w-[360px] items-center gap-3 rounded-tile border border-sand-100/16 bg-sand-100/[0.08] px-4 py-3"
          style={{ animationDelay: "180ms" }}
        >
          <ShieldCheck className="h-4.5 w-4.5 flex-none text-mint-400" />
          <span className="text-left text-body-s text-sand-100/66">
            Google sign-in syncs across your devices. Demo mode keeps everything
            on this browser only.
          </span>
        </div>
        <ScreenGrow />
      </ScreenBody>

      <ScreenFooter>
        <Button
          variant="brand"
          size="lg"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          {isLoading ? <LoaderCircle className="fm-spin" /> : null}
          {isLoading ? "Opening Google..." : "Continue with Google"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => signInDemo()}
          disabled={isLoading}
          className="text-sand-100/66 hover:bg-white/10"
        >
          Use demo mode
        </Button>
        {status ? (
          <Sub className="mx-auto mt-1 text-center text-sand-100/66">
            {status}
          </Sub>
        ) : null}
        <LegalFooter lead="By continuing, you agree to our" />
      </ScreenFooter>
    </Screen>
  );
}
