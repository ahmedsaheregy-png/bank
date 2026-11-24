/* ============================================================================
 * SAWYAN V3.0 — Unified Service Worker (Stage 15: PWA + Web Push + Google Play TWA)
 * Scope: / (Production) and /preview/ (Parallel Demo)
 * ============================================================================ */
'use strict';

const SW_VERSION = 'sawyan-sw-v20261123-s15';

self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Network-first passthrough (required for PWA installability & Google Play TWA compliance)
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request).then((r) => r || Response.error()))
    );
});

// High-priority Web Push handler (Lock-screen banner + Sound + Vibration)
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (_e) {
        payload = { title: 'SAWYAN', body: event.data ? event.data.text() : 'لديك إشعار جديد في سويا' };
    }

    const scopeUrl = self.registration.scope || '/';
    const title = payload.title || '🔔 إشعار جديد — SAWYAN';
    const options = {
        body: payload.body || 'افتح تطبيق SAWYAN للمتابعة.',
        icon: payload.icon || (scopeUrl + 'shared/assets/icon-192.png'),
        badge: payload.badge || (scopeUrl + 'shared/assets/icon-192.png'),
        tag: payload.tag || ('sawyan-push-' + Date.now()),
        dir: 'rtl',
        lang: 'ar',
        vibrate: Array.isArray(payload.vibrate) ? payload.vibrate : [220, 100, 220],
        renotify: payload.renotify !== false,
        requireInteraction: Boolean(payload.requireInteraction),
        silent: false,
        data: {
            url: payload.url || (scopeUrl + 'index.html'),
            event_name: payload.event_name || 'push',
            extra: payload.data || {}
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || (self.registration.scope || '/');
    const fullTarget = new URL(targetUrl, self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (const client of windowClients) {
                try {
                    if (client.url && (client.url === fullTarget || client.url.startsWith(fullTarget.split('?')[0]))) {
                        client.postMessage({ type: 'SAWYAN_PUSH_CLICK', data: event.notification.data || {} });
                        return client.focus();
                    }
                } catch (_e) {}
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(fullTarget);
            }
            return null;
        })
    );
});
