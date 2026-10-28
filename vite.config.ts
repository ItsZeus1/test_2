import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

function scriptExists(relativePath: string): boolean {
  return existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));
}

/** Keeps the virtual OG module resolvable if the sandbox PWA plugin is absent. */
function identityFallback(): Plugin {
  return {
    name: "grok-og-identity-fallback",
    resolveId(id) {
      if (id === "virtual:grok-og-identity") return "\0virtual:grok-og-identity";
    },
    load(id) {
      if (id !== "\0virtual:grok-og-identity") return;
      return "export const grokOgIdentity = { site: {} };";
    },
  };
}

async function sandboxPlugins(): Promise<Plugin[]> {
  const loaded: Plugin[] = [];
  if (scriptExists("./scripts/app-env-plugin.mjs")) {
    try {
      const mod = (await import("./scripts/app-env-plugin.mjs")) as { appEnvPlugin?: () => Plugin };
      if (typeof mod.appEnvPlugin === "function") loaded.push(mod.appEnvPlugin());
    } catch {
      /* optional sandbox plugin */
    }
  }
  if (scriptExists("./scripts/grok-pwa-plugin.mjs")) {
    try {
      const mod = (await import("./scripts/grok-pwa-plugin.mjs")) as { grokPwaPlugin?: () => Plugin };
      if (typeof mod.grokPwaPlugin === "function") {
        loaded.push(mod.grokPwaPlugin());
        return loaded;
      }
    } catch {
      /* fall through to the identity stub */
    }
  }
  loaded.push(identityFallback());
  return loaded;
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
export default defineConfig(async ({ command, isPreview }) => ({
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
    ...(await sandboxPlugins()),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
