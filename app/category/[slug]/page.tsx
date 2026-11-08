"use client";

import { useParams } from "next/navigation";

import { Link } from "@/lib/nav";
import { Storefront } from "@/components/storefront";
import { useI18n } from "@/lib/i18n";
import { isCategory } from "@/lib/store/types";

export default function Page() {
  const slug = String(useParams<{ slug: string }>().slug ?? "");
  const { t } = useI18n();
  if (!isCategory(slug)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-extrabold">{t.unknownLane}</h1>
        <Link to="/" className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-violet">
          {t.allServices}
        </Link>
      </main>
    );
  }
  return <Storefront category={slug} />;
}
