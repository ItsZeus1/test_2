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
  icons: {
    icon: [{ url: "/favicon.svg?v=5", type: "image/svg+xml" }],
    shortcut: "/favicon.svg?v=5",
    apple: "/apple-touch-icon.png?v=5",
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
    images: [{ url: `${SITE_URL}/logo-icon.png?v=4`, type: "image/png", width: 512, height: 512, alt: "ZovaCharge" }],
  },
  twitter: { card: "summary", title: SEO_TITLE, description: SEO_DESCRIPTION, images: [`${SITE_URL}/logo-icon.png?v=4`] },
  robots: { index: true, follow: true },
};

/** Sections & top services, listed for search-engine sitelinks. */
const NAV_LINKS: Array<[string, string]> = [
  ["شحن الألعاب الفوري", "/category/games"],
  ["شحن شدات ببجي موبايل", "/service/pubg-mobile"],
  ["شحن جواهر فري فاير", "/service/free-fire"],
  ["تطبيقات واشتراكات", "/category/subscriptions"],
  ["مزودات الإنترنت ADSL/Fiber", "/service/isp-internet"],
  ["شحن المحفظة - شام كاش وسيريتل كاش وMTN كاش", "/wallet"],
  ["طلباتي ومحفظتي", "/orders"],
];

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
      "@type": "ItemList",
      "@id": `${SITE_URL}/#sections`,
      name: "أقسام زوفا شارج",
      itemListElement: NAV_LINKS.map(([name, path], index) => ({
        "@type": "SiteNavigationElement",
        position: index + 1,
        name,
        url: `${SITE_URL}${path}`,
      })),
    },
  ],
});

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
