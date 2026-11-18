const V = "orbit-v4";
const FILES = ["./", "index.html", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())));
// Network first (so updates arrive), cache as the offline fallback.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));
});

// Reminders: periodic background check (only where the browser allows it) and click handling.
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open("orbit", 1);
  r.onupgradeneeded = () => r.transaction.abort(); // never create an empty DB from here
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const rd = async k => { const db = await open(); return new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); };
const wr = async (k, v) => { const db = await open(); return new Promise(res => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(); t.onerror = () => res(); }); };
const pad = n => String(n).padStart(2, "0");
const ymd = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const days = s => Math.max(0, Math.round((Date.now() - new Date(s + "T00:00:00").getTime()) / 864e5));
self.addEventListener("periodicsync", e => {
  if (e.tag !== "orbit-check") return;
  e.waitUntil((async () => {
    try {
      const d = await rd("data");
      if (!d || !d.set || !d.set.nt || !d.set.nt.on) return;
      const today = ymd(new Date());
      if ((await rd("notified")) === today) return;
      const P = d.people || [], n = d.set.nt;
      const b = n.bd ? P.filter(p => p.bd && p.bd.slice(5) === today.slice(5)).map(p => p.name) : [];
      const due = n.due ? P.filter(p => days(p.last) / p.every >= 1).sort((x, y) => days(y.last) / y.every - days(x.last) / x.every) : [];
      const t = [];
      if (b.length) t.push("🎂 День рождения: " + b.join(", "));
      if (due.length) t.push("Пора написать: " + due.slice(0, 5).map(p => p.name).join(", ") + (due.length > 5 ? " и ещё " + (due.length - 5) : ""));
      if (!t.length) return;
      await self.registration.showNotification("Орбита", { body: t.join("\n"), icon: "icon-192.png", badge: "icon-192.png", tag: "orbit" });
      await wr("notified", today);
    } catch (x) {}
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(l => l.length ? l[0].focus() : clients.openWindow("./")));
});
