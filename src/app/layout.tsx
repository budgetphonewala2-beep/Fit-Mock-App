import type { Metadata } from "next";
import { Hanken_Grotesk, Archivo, Urbanist } from "next/font/google";
import { DietFitProvider } from "@/components/providers/dietfit-provider";
import { AiConsentSheet } from "@/components/ai-consent-sheet";
import "./globals.css";

// CSS variable names kept as --font-manrope/--font-space-grotesk (matching
// globals.css's @theme mapping) even though the fonts loaded are now
// Hanken Grotesk/Archivo — the Fitmonk brand fonts used in onboarding.
const bodyFont = Hanken_Grotesk({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const displayFont = Archivo({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

// Glass-reskin face: light geometric numerals, scoped to .diet-glass for now.
const glassFont = Urbanist({
  variable: "--font-glass",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Fitmonk",
  description:
    "AI-guided workouts, nutrition tracking, and a focused onboarding flow for fitness goals.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // App screens are laid out for the phone; pinch zoom only knocks them
  // off-screen, especially inside the Android shell.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#fbf9f3",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bodyFont.variable} ${displayFont.variable} ${glassFont.variable} h-full antialiased`}
      // The inline script below adds "native-shell" before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* Inside the Fitmonk app the shell already reserves the status bar,
            so drop the web's own top inset (--safe-top) before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'if(/FitmonkShell/.test(navigator.userAgent))document.documentElement.classList.add("native-shell")',
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <DietFitProvider>
          {children}
          <AiConsentSheet />
        </DietFitProvider>
      </body>
    </html>
  );
}
