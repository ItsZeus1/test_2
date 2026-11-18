import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { SEO_SECTIONS, SITE_URL } from "@/lib/store/data";
import "@/styles.css";

const SEO_TITLE = "ZovaCharge | متجر زوفا شارج — شحن ألعاب وبطاقات رقمية فوري في سوريا (شام كاش، سيريتل كاش، MTN كاش)";
const SEO_DESCRIPTION =
  "زوفا شارج: شحن فوري لشدات ببجي، جواهر فري فاير، بطاقات الهدايا، الاشتراكات ورصيد الموبايل في سوريا. ادفع عبر شام كاش، سيريتل كاش أو MTN كاش. ZovaCharge — instant game top-ups, gift cards and mobile balance in Syria.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SEO_TITLE, template: "%s" },
  description: SEO_DESCRIPTION,
  applicationName: "ZovaCharge",
  keywords: ["ZovaCharge", "زوفا شارج", "شحن ألعاب", "شحن ببجي", "شدات ببجي", "جواهر فري فاير", "بطاقات رقمية", "شام كاش", "سيريتل كاش", "MTN كاش", "سوريا", "game top up Syria"],
  // v26: no site-wide canonical here — every page declares its own (the root one made every
  // service page claim to be a copy of the homepage).
  // v30: Google Search favicon guidelines — a 48px multiple at a stable URL, plus SVG and 192px PNG.
  // Navy (#0F172A) → ice-blue (#0284C7) Z crest everywhere; ?v=30 busts the old cached icon.
  icons: {
    icon: [
      { url: "/favicon.ico?v=30", sizes: "48x48" },
      { url: "/favicon.svg?v=30", type: "image/svg+xml", sizes: "any" },
      { url: "/icons/icon-192.png?v=30", type: "image/png", sizes: "192x192" },
      { url: "/logo-icon.png?v=30", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico?v=30",
    apple: [{ url: "/apple-touch-icon.png?v=30", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "ZovaCharge", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ZovaCharge | زوفا شارج",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    locale: "ar_SY",
    alternateLocale: ["en_US"],
    // Square logo only (WhatsApp / Telegram / X show it beside the title); ?v=3 busts old cached previews.
    images: [{ url: `${SITE_URL}/logo-icon.png?v=30`, type: "image/png", width: 512, height: 512, alt: "ZovaCharge" }],
  },
  twitter: { card: "summary", title: SEO_TITLE, description: SEO_DESCRIPTION, images: [`${SITE_URL}/logo-icon.png?v=30`] },
  robots: { index: true, follow: true },
};

/** schema.org @graph: organization, online store, website + search, and the site navigation. */
const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "ZovaCharge | متجر زوفا شارج",
      alternateName: ["ZovaCharge", "زوفا شارج"],
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo-icon.png`, width: 512, height: 512 },
      image: `${SITE_URL}/logo-icon.png`,
    },
    {
      "@type": "OnlineStore",
      "@id": `${SITE_URL}/#store`,
      name: "ZovaCharge | متجر زوفا شارج",
      url: SITE_URL,
      image: `${SITE_URL}/logo-icon.png`,
      description: SEO_DESCRIPTION,
      parentOrganization: { "@id": `${SITE_URL}/#organization` },
      areaServed: { "@type": "Country", name: "Syria" },
      currenciesAccepted: "USD, SYP",
      paymentAccepted: "ShamCash, Syriatel Cash, MTN Cash",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "ZovaCharge | متجر زوفا شارج",
      inLanguage: ["ar", "en"],
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}` },
        "query-input": "required name=search_term_string",
      },
    },
    {
      // The store's main sections (the same six links the page renders in a real <nav>).
      "@type": "ItemList",
      "@id": `${SITE_URL}/#sections`,
      name: "أقسام متجر زوفا شارج",
      itemListElement: SEO_SECTIONS.map((section, index) => ({
        "@type": "SiteNavigationElement",
        position: index + 1,
        name: section.name,
        alternateName: section.nameEn,
        url: `${SITE_URL}${section.path}`,
      })),
    },
  ],
});

export const viewport: Viewport = { themeColor: "#F8FAFC", width: "device-width", initialScale: 1 };

/** Runs before first paint so there is no theme flash. New visitors start in Light mode. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("novacharge-theme")==="dark"?"dark":"light";var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
