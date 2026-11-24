/**
 * ============================================================================
 * SAWYAN V3.0 — Unified Push & PWA Install Manager (Stage 15)
 * Works seamlessly across:
 *   - Web Push VAPID (Android Chrome, iOS 16.4+ PWA, Desktop, Google Play TWA)
 *   - Native Google Play / iOS Bridge (Capacitor / Android FCM token auto-handoff)
 * ============================================================================
 */
(function () {
    'use strict';

    window.SAWYAN = window.SAWYAN || {};

    let deferredInstallPrompt = null;
    let swRegistrationPromise = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
        try {
            window.dispatchEvent(new CustomEvent('sawyan:pwa-install-ready'));
        } catch (_e) {}
    });

    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    function arrayBufferToBase64Url(buf) {
        if (!buf) return '';
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
        return window.btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    function detectDeviceLabel() {
        const ua = navigator.userAgent || '';
        const os = /Android/i.test(ua) ? 'Android'
            : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
            : /Windows/i.test(ua) ? 'Windows'
            : /Mac/i.test(ua) ? 'macOS' : 'Device';
        const br = /Edg/i.test(ua) ? 'Edge'
            : /Chrome/i.test(ua) ? 'Chrome'
            : /Firefox/i.test(ua) ? 'Firefox'
            : /Safari/i.test(ua) ? 'Safari' : 'Browser';
        const mode = isStandaloneMode() ? 'PWA' : 'Web';
        return `${os} • ${br} (${mode})`;
    }

    function isIos() {
        return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    }

    function isStandaloneMode() {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
            || window.navigator.standalone === true
            || document.referrer.includes('android-app://');
    }

    function resolveServiceWorkerUrl() {
        // Pages inside /member-dashboard/, /merchant-dashboard/, /admin-dashboard/, /public/ -> ../sw.js
        // Pages at root or /preview/ -> ./sw.js
        const p = window.location.pathname || '/';
        if (/\/(member-dashboard|merchant-dashboard|admin-dashboard|public)\//.test(p)) {
            return { url: '../sw.js', scope: '../' };
        }
        return { url: './sw.js', scope: './' };
    }

    async function ensureServiceWorker() {
        if (!('serviceWorker' in navigator)) return null;
        if (!swRegistrationPromise) {
            const { url, scope } = resolveServiceWorkerUrl();
            swRegistrationPromise = navigator.serviceWorker
                .register(url, { scope })
                .then(() => navigator.serviceWorker.ready)
                .catch((err) => {
                    swRegistrationPromise = null;
                    throw err;
                });
        }
        return swRegistrationPromise;
    }

    function isWebPushSupported() {
        return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
    }

    function getNativeBridge() {
        if (window.SAWYAN_NATIVE_PUSH_BRIDGE && typeof window.SAWYAN_NATIVE_PUSH_BRIDGE.getToken === 'function') {
            return window.SAWYAN_NATIVE_PUSH_BRIDGE;
        }
        return null;
    }

    async function getCurrentSubscription() {
        if (!isWebPushSupported()) return null;
        try {
            const reg = await ensureServiceWorker();
            if (!reg || !reg.pushManager) return null;
            return await reg.pushManager.getSubscription();
        } catch (_e) {
            return null;
        }
    }

    async function getStatus() {
        const nativeBridge = getNativeBridge();
        if (nativeBridge) {
            return { supported: true, subscribed: true, channel: 'fcm', permission: 'granted', iosNeedsHomeScreen: false };
        }
        const iosHome = isIos() && !isStandaloneMode();
        if (!isWebPushSupported()) {
            return { supported: false, subscribed: false, channel: 'none', permission: 'denied', iosNeedsHomeScreen: iosHome };
        }
        const perm = Notification.permission;
        let sub = null;
        if (perm === 'granted') {
            sub = await getCurrentSubscription();
        }
        return {
            supported: true,
            subscribed: Boolean(sub),
            channel: 'web_push',
            permission: perm,
            iosNeedsHomeScreen: iosHome
        };
    }

    async function enablePush({ actorType, actorId, sendWelcomeTest = false }) {
        if (!actorType || !actorId) throw new Error('يرجى تسجيل الدخول أولاً لتفعيل إشعارات شاشة القفل.');

        // Path B: Future Native Google Play / iOS App Bridge (FCM/APNs)
        const nativeBridge = getNativeBridge();
        if (nativeBridge) {
            const nativeInfo = await nativeBridge.getToken();
            if (!nativeInfo || !nativeInfo.token) throw new Error('تعذر الحصول على رمز إشعارات التطبيق.');
            await window.SAWYAN.API.registerPushSubscription({
                actorType,
                actorId,
                channel: nativeInfo.channel || 'fcm',
                endpoint: nativeInfo.token,
                deviceLabel: detectDeviceLabel()
            });
            return { subscribed: true, channel: nativeInfo.channel || 'fcm' };
        }

        // iOS Safari browser guard (requires Home Screen PWA install on iOS 16.4+)
        if (isIos() && !isStandaloneMode()) {
            throw new Error('على آيفون: اضغط زر المشاركة (⬆️) في Safari ثم «إضافة إلى الشاشة الرئيسية»، وافتح التطبيق من الشاشة الرئيسية لتفعيل إشعارات شاشة القفل بالصوت.');
        }

        if (!isWebPushSupported()) {
            throw new Error('متصفحك الحالي لا يدعم إشعارات الخلفية (Web Push) — يُنصح باستخدام Chrome على أندرويد أو Safari بعد الإضافة للشاشة الرئيسية.');
        }

        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            throw new Error('تم رفض إذن الإشعارات — يمكنك تفعيله من إعدادات الموقع في المتصفح ليصلك التنبيه بالصوت.');
        }

        const keyRes = await window.SAWYAN.API.getPushVapidPublicKey();
        if (!keyRes || !keyRes.enabled || !keyRes.vapid_public_key) {
            throw new Error('خدمة إشعارات شاشة القفل غير مفعّلة على الخادم حالياً.');
        }

        const reg = await ensureServiceWorker();
        if (!reg || !reg.pushManager) {
            throw new Error('تعذر تسجيل خدمة الخلفية (Service Worker) على هذا المتصفح.');
        }

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyRes.vapid_public_key)
            });
        }

        const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
        const authSecret = arrayBufferToBase64Url(sub.getKey('auth'));

        await window.SAWYAN.API.registerPushSubscription({
            actorType,
            actorId,
            channel: 'web_push',
            endpoint: sub.endpoint,
            p256dh,
            authSecret,
            deviceLabel: detectDeviceLabel()
        });

        if (sendWelcomeTest) {
            try {
                await window.SAWYAN.API.sendMyTestPush({ actorType, actorId });
            } catch (_e) {}
        }

        return { subscribed: true, channel: 'web_push', endpoint: sub.endpoint };
    }

    async function disablePush({ actorType, actorId }) {
        const sub = await getCurrentSubscription();
        if (sub) {
            try {
                await window.SAWYAN.API.unregisterPushSubscription({
                    actorType,
                    actorId,
                    endpoint: sub.endpoint
                });
            } catch (_e) {}
            try {
                await sub.unsubscribe();
            } catch (_e) {}
        }
        return { subscribed: false };
    }

    async function sendTestPush({ actorType, actorId }) {
        return await window.SAWYAN.API.sendMyTestPush({ actorType, actorId });
    }

    // Silent background auto-sync if user ALREADY granted permission earlier (keeps subscription fresh!)
    async function syncIfAlreadyGranted({ actorType, actorId }) {
        try {
            if (!actorType || !actorId || !isWebPushSupported()) return false;
            if (Notification.permission !== 'granted') return false;
            const reg = await ensureServiceWorker();
            if (!reg || !reg.pushManager) return false;
            const sub = await reg.pushManager.getSubscription();
            if (!sub) return false;
            await window.SAWYAN.API.registerPushSubscription({
                actorType,
                actorId,
                channel: 'web_push',
                endpoint: sub.endpoint,
                p256dh: arrayBufferToBase64Url(sub.getKey('p256dh')),
                authSecret: arrayBufferToBase64Url(sub.getKey('auth')),
                deviceLabel: detectDeviceLabel()
            });
            return true;
        } catch (_e) {
            return false;
        }
    }

    function canInstallApp() {
        return Boolean(deferredInstallPrompt) && !isStandaloneMode();
    }

    async function promptInstallApp() {
        if (!deferredInstallPrompt) return { installed: false, reason: 'unavailable' };
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
        return { installed: choice && choice.outcome === 'accepted', outcome: choice?.outcome };
    }

    // Register Service Worker passively on page load for instant PWA / TWA readiness
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            ensureServiceWorker().catch(() => {});
        });
    }

    window.SAWYAN.Push = {
        enablePush,
        disablePush,
        sendTestPush,
        syncIfAlreadyGranted,
        getStatus,
        canInstallApp,
        promptInstallApp,
        isStandaloneMode,
        isIos
    };
})();
