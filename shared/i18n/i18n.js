/**
 * SAWYAN V3.0 — Native Curated i18n Engine (AR / EN / TR), RTL/LTR Switcher,
 * Unified Dark Mode & Field Accessibility (A+) Controller.
 * Zero Google Translate dependency: serves native curated dictionaries at 0ms latency.
 */
(function () {
    'use strict';

    const LANG_KEY = 'sawyan_lang';
    const THEME_KEY = 'sawyan_theme';
    const FONT_KEY = 'sawyan_font_scale';
    const SUPPORTED = ['ar', 'en', 'tr'];

    const META = {
        ar: { dir: 'rtl', locale: 'ar-EG', label: 'العربية', short: 'AR' },
        en: { dir: 'ltr', locale: 'en-US', label: 'English', short: 'EN' },
        tr: { dir: 'ltr', locale: 'tr-TR', label: 'Türkçe', short: 'TR' }
    };

    // Instant inline baseline dictionary (eliminates flash-of-untranslated-text while full JSON loads)
    const CACHE = { ar: null, en: null, tr: null };
    let currentLang = 'ar';
    const listeners = [];

    function detectBaseUrl() {
        try {
            const scripts = document.getElementsByTagName('script');
            for (let i = scripts.length - 1; i >= 0; i--) {
                const src = scripts[i].getAttribute('src') || '';
                if (src.indexOf('i18n.js') !== -1) {
                    return src.replace(/i18n\.js(\?.*)?$/, '');
                }
            }
        } catch (_e) {}
        const p = window.location.pathname || '';
        if (p.includes('/member-dashboard/') || p.includes('/merchant-dashboard/') || p.includes('/admin-dashboard/') || p.includes('/public/')) {
            return '../shared/i18n/';
        }
        return 'shared/i18n/';
    }

    const BASE_URL = detectBaseUrl();

    function getNested(obj, path) {
        if (!obj || !path) return undefined;
        const parts = String(path).split('.');
        let cur = obj;
        for (let i = 0; i < parts.length; i++) {
            if (cur && Object.prototype.hasOwnProperty.call(cur, parts[i])) {
                cur = cur[parts[i]];
            } else {
                return undefined;
            }
        }
        return typeof cur === 'string' ? cur : undefined;
    }

    function t(key, fallbackOrVars, maybeVars) {
        let fallback = '';
        let vars = null;
        if (typeof fallbackOrVars === 'string') {
            fallback = fallbackOrVars;
            vars = maybeVars || null;
        } else if (fallbackOrVars && typeof fallbackOrVars === 'object') {
            vars = fallbackOrVars;
        }
        let val = getNested(CACHE[currentLang], key);
        if (val === undefined) val = getNested(CACHE.ar, key);
        if (val === undefined) val = fallback || key;
        if (vars) {
            Object.keys(vars).forEach(function (k) {
                val = val.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), String(vars[k]));
            });
        }
        return val;
    }

    async function loadDict(lang) {
        const l = SUPPORTED.includes(lang) ? lang : 'ar';
        if (CACHE[l]) return CACHE[l];
        try {
            const resp = await fetch(BASE_URL + l + '.json?v=20261121_launch_s27', { cache: 'default' });
            if (resp.ok) {
                CACHE[l] = await resp.json();
                return CACHE[l];
            }
        } catch (_e) {}
        return CACHE[l] || {};
    }

    function applyDirAndLang(lang) {
        const m = META[lang] || META.ar;
        document.documentElement.setAttribute('lang', lang);
        document.documentElement.setAttribute('dir', m.dir);
        document.documentElement.dataset.sawyanLang = lang;
    }

    const ORIG_TEXT_MAP = new WeakMap();
    const ORIG_PLACEHOLDER_MAP = new WeakMap();
    let _phraseObserver = null;
    let _phraseTimer = null;
    let _translating = false;

    function lookupCuratedPhrase(rawStr, phrases) {
        if (!phrases || !rawStr) return null;
        const trimmed = rawStr.trim();
        if (!trimmed || trimmed.length > 140) return null;
        if (Object.prototype.hasOwnProperty.call(phrases, trimmed)) {
            return rawStr.replace(trimmed, phrases[trimmed]);
        }
        // Preserve leading emoji/symbol + optional trailing numeric counter like "(3)" or "←"
        const m = trimmed.match(/^([^\u0600-\u06FFa-zA-Z0-9]{1,4}\s*)?(.+?)(\s*\(\d+\)|\s*[▾▴←→↗])?$/);
        if (m) {
            const pre = m[1] || '';
            const core = (m[2] || '').trim();
            const suf = m[3] || '';
            if (core && Object.prototype.hasOwnProperty.call(phrases, core)) {
                return rawStr.replace(trimmed, pre + phrases[core] + suf);
            }
        }
        return null;
    }

    function translateCuratedPhrases() {
        if (_translating || !document.body) return;
        _translating = true;
        try {
            const phrases = (CACHE[currentLang] && CACHE[currentLang].phrases) || null;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode: function (node) {
                    const p = node.parentElement;
                    if (!p) return NodeFilter.FILTER_REJECT;
                    const tag = p.tagName;
                    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'NOSCRIPT') {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (p.closest('[data-i18n], [data-i18n-skip], .sawyan-lang-switcher, .sawyan-brand-mark')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            const nodes = [];
            let cur;
            while ((cur = walker.nextNode())) nodes.push(cur);

            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (currentLang === 'ar') {
                    if (ORIG_TEXT_MAP.has(n)) {
                        const orig = ORIG_TEXT_MAP.get(n);
                        if (n.nodeValue !== orig) n.nodeValue = orig;
                    }
                } else if (phrases) {
                    const base = ORIG_TEXT_MAP.has(n) ? ORIG_TEXT_MAP.get(n) : n.nodeValue;
                    const tr = lookupCuratedPhrase(base, phrases);
                    if (tr && tr !== n.nodeValue) {
                        if (!ORIG_TEXT_MAP.has(n)) ORIG_TEXT_MAP.set(n, base);
                        n.nodeValue = tr;
                    }
                }
            }

            // Translate placeholders cleanly
            document.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(function (inp) {
                if (inp.hasAttribute('data-i18n-placeholder')) return;
                if (currentLang === 'ar') {
                    if (ORIG_PLACEHOLDER_MAP.has(inp)) {
                        inp.setAttribute('placeholder', ORIG_PLACEHOLDER_MAP.get(inp));
                    }
                } else if (phrases) {
                    const basePh = ORIG_PLACEHOLDER_MAP.has(inp) ? ORIG_PLACEHOLDER_MAP.get(inp) : inp.getAttribute('placeholder');
                    const trPh = lookupCuratedPhrase(basePh, phrases);
                    if (trPh) {
                        if (!ORIG_PLACEHOLDER_MAP.has(inp)) ORIG_PLACEHOLDER_MAP.set(inp, basePh);
                        inp.setAttribute('placeholder', trPh);
                    }
                }
            });
        } finally {
            _translating = false;
        }
    }

    function ensurePhraseObserver() {
        if (_phraseObserver || !document.body || typeof MutationObserver === 'undefined') return;
        _phraseObserver = new MutationObserver(function () {
            if (currentLang === 'ar' || _translating) return;
            clearTimeout(_phraseTimer);
            _phraseTimer = setTimeout(function () {
                translateDom();
            }, 140);
        });
        _phraseObserver.observe(document.body, { childList: true, subtree: true });
    }

    function translateDom() {
        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            const key = el.getAttribute('data-i18n');
            if (!el.dataset.i18nOrig) el.dataset.i18nOrig = el.textContent;
            const tr = getNested(CACHE[currentLang], key);
            if (tr !== undefined) el.textContent = tr;
            else if (currentLang === 'ar' && el.dataset.i18nOrig) el.textContent = el.dataset.i18nOrig;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-placeholder');
            const tr = getNested(CACHE[currentLang], key);
            if (tr !== undefined) el.setAttribute('placeholder', tr);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-title');
            const tr = getNested(CACHE[currentLang], key);
            if (tr !== undefined) el.setAttribute('title', tr);
        });
        document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            const key = el.getAttribute('data-i18n-aria');
            const tr = getNested(CACHE[currentLang], key);
            if (tr !== undefined) el.setAttribute('aria-label', tr);
        });
        translateCuratedPhrases();
        ensurePhraseObserver();
        // Update active state on all mounted language buttons
        document.querySelectorAll('.sawyan-lang-btn').forEach(function (btn) {
            const active = btn.getAttribute('data-lang') === currentLang;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    async function setLang(lang, persist) {
        const next = SUPPORTED.includes(lang) ? lang : 'ar';
        currentLang = next;
        if (persist !== false) {
            try { localStorage.setItem(LANG_KEY, next); } catch (_e) {}
        }
        applyDirAndLang(next);
        await loadDict(next);
        translateDom();
        listeners.forEach(function (fn) {
            try { fn(next, META[next]); } catch (_e) {}
        });
        document.dispatchEvent(new CustomEvent('sawyan:langchange', { detail: { lang: next, dir: META[next].dir } }));
    }

    function applyTheme(theme) {
        const isDark = theme === 'dark';
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
        try {
            localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
            localStorage.setItem('sawyan-theme', isDark ? 'dark' : 'light');
        } catch (_e) {}
        document.querySelectorAll('.sawyan-theme-btn').forEach(function (b) {
            b.textContent = isDark ? '☀️' : '🌙';
            b.setAttribute('title', t(isDark ? 'common.light_mode' : 'common.dark_mode', isDark ? 'الوضع النهاري' : 'الوضع الليلي'));
        });
    }

    function toggleTheme() {
        const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        applyTheme(cur === 'dark' ? 'light' : 'dark');
    }

    function applyFontScale(scale) {
        const large = scale === 'large';
        document.documentElement.setAttribute('data-font-scale', large ? 'large' : 'normal');
        try { localStorage.setItem(FONT_KEY, large ? 'large' : 'normal'); } catch (_e) {}
        document.querySelectorAll('.sawyan-font-btn').forEach(function (b) {
            b.classList.toggle('active', large);
            b.setAttribute('aria-pressed', large ? 'true' : 'false');
        });
    }

    function toggleFontScale() {
        const cur = document.documentElement.getAttribute('data-font-scale') === 'large' ? 'large' : 'normal';
        applyFontScale(cur === 'large' ? 'normal' : 'large');
    }

    function flagHtml(lang) {
        if (window.SAWYAN && window.SAWYAN.Flags && typeof window.SAWYAN.Flags.forLang === 'function') {
            return window.SAWYAN.Flags.forLang(lang, 16);
        }
        return '';
    }

    function createControlsEl() {
        const wrap = document.createElement('div');
        wrap.className = 'sawyan-global-controls';
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'Language and display settings');

        const langGroup = document.createElement('div');
        langGroup.className = 'sawyan-lang-switcher';
        SUPPORTED.forEach(function (l) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sawyan-lang-btn' + (l === currentLang ? ' active' : '');
            btn.setAttribute('data-lang', l);
            btn.setAttribute('title', META[l].label);
            btn.setAttribute('aria-pressed', l === currentLang ? 'true' : 'false');
            btn.innerHTML = flagHtml(l) + '<span>' + META[l].short + '</span>';
            btn.addEventListener('click', function () { setLang(l, true); });
            langGroup.appendChild(btn);
        });
        wrap.appendChild(langGroup);

        const fontBtn = document.createElement('button');
        fontBtn.type = 'button';
        fontBtn.className = 'sawyan-ctrl-icon-btn sawyan-font-btn' + (document.documentElement.getAttribute('data-font-scale') === 'large' ? ' active' : '');
        fontBtn.textContent = 'A+';
        fontBtn.setAttribute('title', 'تكبير الخط / Larger Text');
        fontBtn.addEventListener('click', toggleFontScale);
        wrap.appendChild(fontBtn);

        if (!document.getElementById('themeToggleBtn')) {
            const themeBtn = document.createElement('button');
            themeBtn.type = 'button';
            themeBtn.className = 'sawyan-ctrl-icon-btn sawyan-theme-btn';
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            themeBtn.textContent = isDark ? '☀️' : '🌙';
            themeBtn.setAttribute('title', isDark ? 'الوضع النهاري' : 'الوضع الليلي');
            themeBtn.addEventListener('click', toggleTheme);
            wrap.appendChild(themeBtn);
        }

        return wrap;
    }

    function autoMountControls() {
        if (document.querySelector('.sawyan-global-controls')) return;
        const targets = [
            document.getElementById('sawyanGlobalControlsMount'),
            document.querySelector('.dashboard-header .header-actions'),
            document.querySelector('.dashboard-header'),
            document.querySelector('.emp-header-actions'),
            document.querySelector('.nav-right-controls'),
            document.querySelector('.nav-actions'),
            document.querySelector('.auth-top-nav-inner')
        ];
        const host = targets.find(Boolean);
        if (host) {
            host.appendChild(createControlsEl());
        }
    }

    function getLocale() {
        return (META[currentLang] || META.ar).locale;
    }

    function fmtNum(val, dec) {
        const n = Number(val || 0);
        const d = dec === undefined ? 2 : dec;
        return n.toLocaleString(getLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });
    }

    function fmtDate(val, opts) {
        if (!val) return '—';
        try {
            return new Date(val).toLocaleDateString(getLocale(), opts || { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (_e) {
            return String(val).slice(0, 10);
        }
    }

    function init() {
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        let savedLang = 'ar';
        try { savedLang = localStorage.getItem(LANG_KEY) || 'ar'; } catch (_e) {}
        const chosen = SUPPORTED.includes(urlLang) ? urlLang : (SUPPORTED.includes(savedLang) ? savedLang : 'ar');
        currentLang = chosen;
        applyDirAndLang(chosen);

        let savedTheme = 'light';
        let savedFont = 'normal';
        try {
            savedTheme = localStorage.getItem(THEME_KEY) || localStorage.getItem('sawyan-theme') || 'light';
            savedFont = localStorage.getItem(FONT_KEY) || 'normal';
        } catch (_e) {}
        applyTheme(savedTheme);
        applyFontScale(savedFont);

        const boot = function () {
            autoMountControls();
            loadDict(chosen).then(function () {
                translateDom();
                // Preload Arabic fallback silently if currentLang !== ar
                if (chosen !== 'ar') loadDict('ar');
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', boot);
        } else {
            boot();
        }
    }

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.I18n = {
        t: t,
        setLang: setLang,
        getLang: function () { return currentLang; },
        getDir: function () { return (META[currentLang] || META.ar).dir; },
        getLocale: getLocale,
        fmtNum: fmtNum,
        fmtDate: fmtDate,
        toggleTheme: toggleTheme,
        toggleFontScale: toggleFontScale,
        onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
        translateDom: translateDom,
        mountInto: function (el) {
            if (!el) return;
            const existing = el.querySelector('.sawyan-global-controls');
            if (existing) existing.remove();
            el.appendChild(createControlsEl());
        }
    };

    init();
})();
