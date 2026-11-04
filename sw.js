// Service worker do painel: recebe as notificações de pedido novo.
// Não guarda páginas em cache, para o painel estar sempre na versão mais nova.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: "Cacio & Pepe", body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Novo pedido", {
    body: d.body || "",
    icon: "/icon-192.png",
    badge: "/badge.png",
    tag: d.tag || "pedido",
    renotify: true,
    vibrate: [120, 60, 120],
    data: { url: d.url || "/painel.html#pedidos" },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data && e.notification.data.url || "/painel.html#pedidos", self.location.origin).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) {
      if (c.url.includes("/painel")) { await c.focus(); c.postMessage({ abrir: url.split("#")[1] || "pedidos" }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
