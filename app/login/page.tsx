import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginPage } from "@/components/login-page";

export const metadata: Metadata = {
  title: "تسجيل الدخول وإنشاء حساب | Sign in — ZovaCharge زوفا شارج",
  alternates: { canonical: "/login" },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
