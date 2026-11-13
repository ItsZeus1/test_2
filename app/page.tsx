"use client";

import { ArrowRight, Sparkles } from "lucide-react";

import { useProfileState } from "@/components/profile";
import { Storefront } from "@/components/storefront";
import { useI18n } from "@/lib/i18n";
import { Link } from "@/lib/nav";

/** `/` is always the storefront. Guests get a slim link to the full welcome journey at /welcome. */
export default function Page() {
  const { profile, ready } = useProfileState();
  const { t, language } = useI18n();
  return (
    <>
      {ready && !profile ? (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <Link
            to="/welcome"
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-indigo-400/30 bg-gradient-to-r from-indigo-500/10 via-cyan-500/5 to-transparent px-4 text-sm font-semibold"
          >
            <Sparkles className="size-4 shrink-0 text-indigo-500" />
            <span className="min-w-0 flex-1 truncate">{language === "ar" ? "جديد هنا؟ شاهد كيف يعمل الشحن في 4 خطوات" : "New here? See how it works in 4 steps"}</span>
            <span className="hidden shrink-0 text-indigo-500 sm:inline">{t.createAccount}</span>
            <ArrowRight className="size-4 shrink-0 text-indigo-500 rtl:rotate-180" />
          </Link>
        </div>
      ) : null}
      <Storefront />
    </>
  );
}
