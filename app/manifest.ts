import type { MetadataRoute } from "next";

/** Lets the site be installed as an app (required for push notifications on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NovaCharge",
    short_name: "NovaCharge",
    description: "Instant game & app top-ups",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#4F46E5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
