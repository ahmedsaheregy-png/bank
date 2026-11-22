// SAWYAN Programmatic SVG Brand Logo (D24 Compliant — SAWYAN default, BANK gated per country)
(function () {
    const BRAND_CONFIG = window.SAWYAN_BRAND_CONFIG || { showBank: false, countryTitle: 'SAWYAN' };
    let gradSeq = 0;

    function resolveHomeHref() {
        const p = String((typeof window !== 'undefined' && window.location && window.location.pathname) || '').toLowerCase();
        const isSubdir = /\/(member-dashboard|merchant-dashboard|admin-dashboard|public|landing-page)\//.test(p);
        return isSubdir ? '../index.html' : 'index.html';
    }

    function renderBrandSvg(variant = 'default', opts = {}) {
        const isDarkBg = variant === 'light-on-dark';
        const isCompact = Boolean(opts && opts.compact);
        const primaryFill = isDarkBg ? '#ffffff' : '#0f2744';
        const accentFill = '#10b981';
        const subColor = isDarkBg ? '#cbd5e1' : '#475569';
        const gradId = `swGrad_${variant}_${++gradSeq}`;
        const iconSize = isCompact ? 28 : 34;
        const wordFontSize = isCompact ? '1.12rem' : '1.38rem';
        const wordPadTop = isCompact ? '4px' : '6px';
        const diacriticTop = isCompact ? '-9px' : '-11px';
        const diacriticSize = isCompact ? '0.98rem' : '1.15rem';
        const bankBadge = BRAND_CONFIG.showBank
            ? '<span style="font-size:0.78rem;font-weight:800;background:#1d4ed8;color:#fff;padding:2px 7px;border-radius:6px;margin-right:6px;">BANK</span>'
            : '';
        const subtitleHtml = isCompact
            ? ''
            : `<span style="font-family:'Tajawal',sans-serif;font-size:0.68rem;font-weight:700;color:${subColor};letter-spacing:0;text-align:right;" dir="rtl">منصة الاستهلاك الاستثماري العالمية</span>`;

        return `
        <span class="sawyan-brand-mark" dir="ltr" style="display:inline-flex;align-items:center;gap:${isCompact ? '6px' : '8px'};vertical-align:middle;">
            <svg width="${iconSize}" height="${iconSize}" viewBox="0 0 40 40" aria-hidden="true" style="flex-shrink:0;">
                <defs>
                    <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#10b981"/>
                        <stop offset="100%" stop-color="#1d4ed8"/>
                    </linearGradient>
                </defs>
                <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#${gradId})"/>
                <path d="M12 25 C15 16, 25 16, 28 25" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round"/>
                <circle cx="20" cy="14" r="3.2" fill="#ffffff"/>
            </svg>
            <span style="display:inline-flex;flex-direction:column;line-height:1.05;">
                <span style="position:relative;font-family:'Poppins',sans-serif;font-weight:800;font-size:${wordFontSize};letter-spacing:0.6px;color:${primaryFill};display:inline-block;padding-top:${wordPadTop};">
                    SAW<span style="position:relative;display:inline-block;color:${accentFill};">Y<span aria-hidden="true" style="position:absolute;top:${diacriticTop};left:50%;transform:translateX(-50%);font-family:'Tajawal',sans-serif;font-size:${diacriticSize};line-height:1;color:${accentFill};font-weight:800;">&#x0651;&#x064E;</span></span>AN${bankBadge}
                </span>
                ${subtitleHtml}
            </span>
        </span>`;
    }

    function resolveAutoVariant(attrVal) {
        if (!attrVal || attrVal === 'auto') {
            const theme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || 'light';
            return theme === 'dark' ? 'light-on-dark' : 'default';
        }
        return attrVal;
    }

    const SawyanLogo = {
        homeHref: resolveHomeHref,
        svg: (variant = 'default', opts = {}) => renderBrandSvg(variant, opts),
        link: (variant = 'default', opts = {}) => {
            const href = (opts && opts.href) || resolveHomeHref();
            return `<a href="${href}" class="logo-link sawyan-home-logo" aria-label="SAWYAN — الصفحة الرئيسية" title="العودة للصفحة الرئيسية">${renderBrandSvg(variant, opts)}</a>`;
        },
        full: (variant = 'default', opts = {}) => SawyanLogo.link(variant, opts),
        icon: (variant = 'default', opts = {}) => SawyanLogo.link(variant, opts),
        hydrateAll: function () {
            if (typeof document === 'undefined') return;
            const homeHref = resolveHomeHref();

            document.querySelectorAll('[data-sawyan-logo]').forEach((el) => {
                const variant = resolveAutoVariant(el.getAttribute('data-sawyan-logo'));
                const compact = el.getAttribute('data-sawyan-compact') === '1';
                if (el.tagName === 'A') {
                    const curHref = el.getAttribute('href');
                    if (!curHref || curHref === '#') el.setAttribute('href', homeHref);
                    el.classList.add('logo-link', 'sawyan-home-logo');
                    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'SAWYAN — الصفحة الرئيسية');
                    if (!el.getAttribute('title')) el.setAttribute('title', 'العودة للصفحة الرئيسية');
                    el.innerHTML = renderBrandSvg(variant, { compact });
                } else {
                    el.innerHTML = SawyanLogo.link(variant, { compact, href: homeHref });
                }
            });

            const logoContainer = document.getElementById('logoContainer');
            if (logoContainer && !logoContainer.querySelector('.sawyan-brand-mark')) {
                const inSidebar = Boolean(logoContainer.closest('.sidebar'));
                logoContainer.innerHTML = SawyanLogo.link(inSidebar ? 'light-on-dark' : 'default', { href: homeHref });
            }

            const navLogo = document.getElementById('navBrandLogo');
            if (navLogo && !navLogo.querySelector('.sawyan-brand-mark')) {
                const variant = resolveAutoVariant('auto');
                if (navLogo.tagName === 'A') {
                    if (!navLogo.getAttribute('href')) navLogo.setAttribute('href', homeHref);
                    navLogo.innerHTML = renderBrandSvg(variant);
                } else {
                    navLogo.innerHTML = SawyanLogo.link(variant, { href: homeHref });
                }
            }

            const footerLogo = document.getElementById('footerBrandLogo');
            if (footerLogo && !footerLogo.querySelector('a .sawyan-brand-mark')) {
                footerLogo.innerHTML = SawyanLogo.link('light-on-dark', { href: homeHref });
            }
        }
    };

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.Logo = SawyanLogo;
    window.SAWYAN_BRAND_CONFIG = BRAND_CONFIG;

    if (typeof document !== 'undefined') {
        if (document.readyState !== 'loading') {
            SawyanLogo.hydrateAll();
        } else {
            document.addEventListener('DOMContentLoaded', () => SawyanLogo.hydrateAll());
        }
    }
})();
