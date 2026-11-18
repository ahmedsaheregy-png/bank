// SAWYAN Programmatic SVG Brand Logo (D24 Compliant — SAWYAN default, BANK gated per country)
(function () {
    const BRAND_CONFIG = window.SAWYAN_BRAND_CONFIG || { showBank: false, countryTitle: 'SAWYAN' };

    function renderBrandSvg(variant) {
        const isDarkBg = variant === 'light-on-dark';
        const primaryFill = isDarkBg ? '#ffffff' : '#0f2744';
        const accentFill = '#10b981';
        const subColor = isDarkBg ? '#cbd5e1' : '#475569';
        const bankBadge = BRAND_CONFIG.showBank
            ? '<span style="font-size:0.78rem;font-weight:800;background:#1d4ed8;color:#fff;padding:2px 7px;border-radius:6px;margin-right:6px;">BANK</span>'
            : '';

        return `
        <span class="sawyan-brand-mark" dir="ltr" style="display:inline-flex;align-items:center;gap:8px;vertical-align:middle;">
            <svg width="34" height="34" viewBox="0 0 40 40" aria-hidden="true" style="flex-shrink:0;">
                <defs>
                    <linearGradient id="swGrad_${variant}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stop-color="#10b981"/>
                        <stop offset="100%" stop-color="#1d4ed8"/>
                    </linearGradient>
                </defs>
                <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#swGrad_${variant})"/>
                <path d="M12 25 C15 16, 25 16, 28 25" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round"/>
                <circle cx="20" cy="14" r="3.2" fill="#ffffff"/>
            </svg>
            <span style="display:inline-flex;flex-direction:column;line-height:1.05;">
                <span style="position:relative;font-family:'Poppins',sans-serif;font-weight:800;font-size:1.38rem;letter-spacing:0.6px;color:${primaryFill};display:inline-block;padding-top:6px;">
                    SAW<span style="position:relative;display:inline-block;color:${accentFill};">Y<span aria-hidden="true" style="position:absolute;top:-11px;left:50%;transform:translateX(-50%);font-family:'Tajawal',sans-serif;font-size:1.15rem;line-height:1;color:${accentFill};font-weight:800;">&#x0651;&#x064E;</span></span>AN${bankBadge}
                </span>
                <span style="font-family:'Tajawal',sans-serif;font-size:0.68rem;font-weight:700;color:${subColor};letter-spacing:0;text-align:right;" dir="rtl">منصة الاستهلاك الاستثماري العالمية</span>
            </span>
        </span>`;
    }

    const SawyanLogo = {
        full: () => `<a href="../index.html" class="logo-link">${renderBrandSvg('default')}</a>`,
        icon: () => `<a href="../index.html" class="logo-link">${renderBrandSvg('default')}</a>`,
        svg: (variant = 'default') => renderBrandSvg(variant)
    };

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.Logo = SawyanLogo;
    window.SAWYAN_BRAND_CONFIG = BRAND_CONFIG;
})();
