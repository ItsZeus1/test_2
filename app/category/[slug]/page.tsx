import type { Metadata } from "next";

import { CategoryView } from "@/components/storefront";
import { SEO_CATEGORY_COPY, seoBreadcrumbs, seoOpenGraph } from "@/lib/store/data";
import { isCategory } from "@/lib/store/types";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isCategory(slug)) return { title: "ZovaCharge", robots: { index: false, follow: true } };
  const copy = SEO_CATEGORY_COPY[slug];
  const title = `${copy.name} | ${copy.nameEn} — ZovaCharge زوفا شارج`;
  const path = `/category/${slug}`;
  return { title, description: copy.description, alternates: { canonical: path }, openGraph: seoOpenGraph(title, copy.description, path) };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const crumbs = isCategory(slug)
    ? seoBreadcrumbs([
        { name: "زوفا شارج", path: "/" },
        { name: SEO_CATEGORY_COPY[slug].name, path: `/category/${slug}` },
      ])
    : null;
  return (
    <>
      {crumbs ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} /> : null}
      <CategoryView slug={slug} />
    </>
  );
}
