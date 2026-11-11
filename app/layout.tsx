import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import "@/styles.css";

const SITE_URL = "https://zovacharge.com";
const SEO_TITLE = "ZovaCharge | متجر زوفا شارج — شحن ألعاب وبطاقات رقمية فوري في سوريا (شام كاش، سيريتل كاش، MTN كاش)";
const SEO_DESCRIPTION =
  "زوفا شارج: شحن فوري لشدات ببجي، جواهر فري فاير، بطاقات الهدايا، الاشتراكات ورصيد الموبايل في سوريا. ادفع عبر شام كاش، سيريتل كاش أو MTN كاش. ZovaCharge — instant game top-ups, gift cards and mobile balance in Syria.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SEO_TITLE, template: "%s" },
  description: SEO_DESCRIPTION,
  applicationName: "ZovaCharge",
  keywords: ["ZovaCharge", "زوفا شارج", "شحن ألعاب", "شحن ببجي", "شدات ببجي", "جواهر فري فاير", "بطاقات رقمية", "شام كاش", "سيريتل كاش", "MTN كاش", "سوريا", "game top up Syria"],
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ZovaCharge", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "ZovaCharge | زوفا شارج",
    title: SEO_TITLE,
    description: SEO_DESCRIPTION,
    locale: "ar_SY",
    alternateLocale: ["en_US"],
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "ZovaCharge" }],
  },
  twitter: { card: "summary_large_image", title: SEO_TITLE, description: SEO_DESCRIPTION, images: ["/icons/icon-512.png"] },
  robots: { index: true, follow: true },
};

/** schema.org structured data: the store + the site with a search action (sitelinks search box). */
const JSON_LD = JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE_URL}/#store`,
    name: "ZovaCharge",
    alternateName: "زوفا شارج",
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    image: `${SITE_URL}/icons/icon-512.png`,
    description: SEO_DESCRIPTION,
    areaServed: { "@type": "Country", name: "Syria" },
    currenciesAccepted: "USD, SYP",
    paymentAccepted: "ShamCash, Syriatel Cash, MTN Cash",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "ZovaCharge",
    alternateName: "زوفا شارج",
    inLanguage: ["ar", "en"],
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  },
]);

export const viewport: Viewport = { themeColor: "#F8FAFC", width: "device-width", initialScale: 1 };

/** Runs before first paint so there is no theme flash. New visitors start in Light mode. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem("novacharge-theme")==="dark"?"dark":"light";var r=document.documentElement;r.classList.remove("dark","light");r.classList.add(t);r.dataset.theme=t;r.style.colorScheme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
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
