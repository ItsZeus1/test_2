import type { Metadata } from "next";

import { WelcomeWizard } from "@/components/welcome-wizard";

export const metadata: Metadata = {
  title: "كيف يعمل الشحن | How it works — ZovaCharge زوفا شارج",
  alternates: { canonical: "/welcome" },
};

export default function Page() {
  return <WelcomeWizard />;
}
