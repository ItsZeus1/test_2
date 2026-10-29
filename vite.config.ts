import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

/**
 * `/auth/popup` is a platform path. NovaCharge signs in on its own pages,
 * so this request must not fall through and paint the app inside a popup.
 */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?", 1)[0] ?? "";
        if (pathOnly !== "/auth/popup") {
          next();
          return;
        }
        res.statusCode = 404;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("Not found");
      });
    },
  };
}

async function optionalPlugin(specifier: string, exportName: string): Promise<Plugin | null> {
  const file = fileURLToPath(new URL(specifier, import.meta.url));
  if (!existsSync(file)) return null;
  // Absolute file URL so Vite's config bundler does not rewrite this to
  // node_modules/.vite-temp/scripts (which breaks `vite build` on Vercel).
  const mod = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as Record<string, unknown>;
  const factory = mod[exportName];
  return typeof factory === "function" ? (factory as () => Plugin)() : null;
}

// Grok preview plugins are dev-only. A production `vite build` (Vercel) must
// not import scripts/grok-pwa-plugin.mjs, virtual:grok-og-identity, or PGLite.
export default defineConfig(async ({ command, isPreview }) => {
  const sandboxDev = command === "serve" && !isPreview;
  const grok = sandboxDev ? await optionalPlugin("./scripts/grok-pwa-plugin.mjs", "grokPwaPlugin") : null;
  const appEnv = sandboxDev ? await optionalPlugin("./scripts/app-env-plugin.mjs", "appEnvPlugin") : null;
  return {
    server: {
      host: "0.0.0.0",
      port: 8080,
      strictPort: true,
    },
    preview: {
      host: "127.0.0.1",
      port: 8081,
      strictPort: true,
    },
    resolve: { tsconfigPaths: true },
    plugins: [
      authPopupPlugin(),
      ...(appEnv ? [appEnv] : []),
      ...(grok ? [grok] : []),
      tailwindcss(),
      tanstackStart(),
      ...(command === "build" || isPreview
        ? [
            nitro({
              preset: "vercel",
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
