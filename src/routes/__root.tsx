import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { PreviewHostBridge } from "@/components/preview-host-bridge";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "NovaCharge" },
      {
        name: "description",
        content: "Instant top-ups for games, apps, subscriptions, and mobile data.",
      },
      { name: "theme-color", content: "#07080D" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AppShell>
          <Outlet />
        </AppShell>
        <Scripts />
      </body>
    </html>
  ),
});
