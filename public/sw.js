/* ZovaCharge service worker — OS notifications, background catch-up, tap-to-open.
 *  - push:          server-sent Web Push (works with the browser closed)
 *  - sync / periodicsync: wake-up catch-up — asks the server for events missed while closed
 *  - message:       the page hands over the session token (kept in this worker's cache)
 *  - notificationclick: focus an open ZovaCharge tab or open the right page
 */
const META_CACHE = "zovacharge-meta";
const ICON = "/logo-icon.png";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function readMeta(key) {
  const cache = await caches.open(META_CACHE);
  const hit = await cache.match(`/__meta/${key}`);
  return hit ? hit.text() : null;
}
async function writeMeta(key, value) {
  const cache = await caches.open(META_CACHE);
  if (value === null || value === undefined) await cache.delete(`/__meta/${key}`);
  else await cache.put(`/__meta/${key}`, new Response(String(value)));
}

function show(alert) {
  return self.registration.showNotification(alert.title || "ZovaCharge", {
    body: alert.body || "",
    icon: ICON,
    badge: ICON,
    vibrate: [200, 100, 200],
    tag: alert.tag || undefined,
    renotify: true,
    timestamp: Date.now(),
    data: { url: alert.url || "/" },
  });
}

/** Ask the server for this user's events since the last check and show them. */
async function catchUp() {
  const token = await readMeta("token");
  if (!token) return;
  // Skip when a ZovaCharge tab is open: the page handles alerts itself (instantly).
  const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (open.some((client) => client.visibilityState === "visible")) return;
  const since = (await readMeta("since")) || new Date(Date.now() - 60 * 60 * 1000).toISOString();
  try {
    const response = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "catch-up", token, since }),
    });
    const result = await response.json();
    await writeMeta("since", result.now || new Date().toISOString());
    for (const alert of (result.events || []).slice(0, 4)) await show(alert);
  } catch {
    /* offline: the next sync will try again */
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "ZovaCharge", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(show(data));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "zovacharge-catchup") event.waitUntil(catchUp());
});
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "zovacharge-catchup") event.waitUntil(catchUp());
});

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "auth") {
    event.waitUntil(
      Promise.all([writeMeta("token", message.token || null), message.since ? writeMeta("since", message.since) : Promise.resolve()]),
    );
  } else if (message.type === "catch-up") {
    event.waitUntil(catchUp());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
