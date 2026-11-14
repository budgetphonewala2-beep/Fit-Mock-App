import { FitmonkTheme } from "@/components/onboarding/fitmonk-theme";

export default function PaywallLayout({ children }: { children: React.ReactNode }) {
  return <FitmonkTheme>{children}</FitmonkTheme>;
}
