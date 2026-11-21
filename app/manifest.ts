import type { MetadataRoute } from "next";

/** Lets the site be installed as an app (required for push notifications on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZovaCharge | متجر زوفا شارج",
    short_name: "ZovaCharge",
    description: "Instant game & app top-ups",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#0F172A",
    icons: [
      { src: "/favicon.ico?v=30", sizes: "48x48", type: "image/x-icon" },
      { src: "/icons/icon-192.png?v=30", sizes: "192x192", type: "image/png" },
      { src: "/logo-icon.png?v=30", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png?v=30", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
