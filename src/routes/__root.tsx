import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { PreviewHostBridge } from "@/components/preview-host-bridge";

import appCss from "../styles.css?url";

/** Runs before first paint: saved theme wins, every new visitor starts in Light mode. */
const THEME_BOOT = `(function(){try{var t=null;try{t=localStorage.getItem('novacharge.theme')}catch(e){}if(t!=='light'&&t!=='dark'){var m=document.cookie.match(/(?:^|; )novacharge\\.theme=(light|dark)/);t=m?m[1]:'light'}var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);d.setAttribute('data-theme',t);d.style.colorScheme=t}catch(e){}})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "NovaCharge" },
      {
        name: "description",
        content: "Instant top-ups for games, apps, subscriptions, and mobile data.",
      },
      { name: "theme-color", content: "#F8FAFC" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="en" className="light" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
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
