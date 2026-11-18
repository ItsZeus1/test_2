import type { Metadata } from "next";

import { ServicePage } from "@/components/service-page";
import { SEO_CATEGORY_COPY, seoBreadcrumbs, seoCatalog, seoOpenGraph } from "@/lib/store/data";

type Props = { params: Promise<{ slug: string }> };

/**
 * v27: every seeded service is pre-built at deploy time, so opening one is an instant static
 * page again (v26 made each visit a fresh server render). Services added later in the admin are
 * built on their first visit and then cached.
 */
export function generateStaticParams() {
  return seoCatalog().map((service) => ({ slug: service.slug }));
}
export const dynamicParams = true;

function lookup(slug: string) {
  return seoCatalog().find((service) => service.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const path = `/service/${slug}`;
  const service = lookup(slug);
  // Services the admin added later are not in the seed list: still self-canonical, generic copy.
  const title = service ? `شحن ${service.nameAr} | ${service.name} — ZovaCharge زوفا شارج` : "شحن فوري — ZovaCharge زوفا شارج";
  const description = service
    ? `${service.descriptionAr} ادفع عبر شام كاش، سيريتل كاش أو MTN كاش.`
    : "شحن فوري للألعاب والتطبيقات في سوريا عبر شام كاش وسيريتل كاش وMTN كاش.";
  return { title, description, alternates: { canonical: path }, openGraph: seoOpenGraph(title, description, path) };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const service = lookup(slug);
  const crumbs = service
    ? seoBreadcrumbs([
        { name: "زوفا شارج", path: "/" },
        { name: SEO_CATEGORY_COPY[service.category].name, path: `/category/${service.category}` },
        { name: service.nameAr, path: `/service/${slug}` },
      ])
    : null;
  return (
    <>
      {crumbs ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} /> : null}
      <ServicePage />
    </>
  );
}
