import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = { title: "Sign in · ZovaCharge" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
