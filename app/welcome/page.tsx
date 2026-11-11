import type { Metadata } from "next";

import { WelcomeWizard } from "@/components/welcome-wizard";

export const metadata: Metadata = { title: "How it works · ZovaCharge" };

export default function Page() {
  return <WelcomeWizard />;
}
