import { FitmonkTheme } from "@/components/onboarding/fitmonk-theme";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <FitmonkTheme>{children}</FitmonkTheme>;
}
