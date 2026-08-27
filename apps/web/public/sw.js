self.addEventListener("push", (event) => {
  let payload = { title: "WorkMesh", body: "A new approval needs your attention.", url: "/?scope=inbox&queue=needs-you" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {}
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    data: { url: payload.url },
    tag: payload.url,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/?scope=inbox&queue=needs-you", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
