/**
 * SAWYAN V3.0 — Crisp Inline SVG Country Flags Engine (`SAWYAN.Flags`)
 * Eliminates broken Windows country-code emoji rendering (`EG`, `TR`, `SA` gray letters).
 */
(function () {
    'use strict';

    const SVG_FLAGS = {
        EG: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#CE1126"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#111827"/><circle cx="12" cy="8" r="1.45" fill="#C09300"/></svg>',
        TR: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#E30A17"/><circle cx="10.2" cy="8" r="3.8" fill="#FFFFFF"/><circle cx="11.3" cy="8" r="3.0" fill="#E30A17"/><polygon points="14.9,8 16.2,8.45 15.4,7.3 15.4,8.7 16.2,7.55" fill="#FFFFFF"/></svg>',
        SA: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#006C35"/><rect x="5" y="6" width="14" height="2" rx="1" fill="#FFFFFF"/><rect x="6.5" y="10" width="11" height="1.2" rx="0.6" fill="#FFFFFF"/></svg>',
        AE: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect x="6" width="18" height="5.33" fill="#00732F"/><rect x="6" y="5.33" width="18" height="5.34" fill="#FFFFFF"/><rect x="6" y="10.67" width="18" height="5.33" fill="#111827"/><rect width="6" height="16" fill="#FF0000"/></svg>',
        GB: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#012169"/><path d="M0,0 L24,16 M24,0 L0,16" stroke="#FFFFFF" stroke-width="3"/><path d="M0,0 L24,16 M24,0 L0,16" stroke="#C8102E" stroke-width="1.4"/><path d="M12,0 V16 M0,8 H24" stroke="#FFFFFF" stroke-width="4.5"/><path d="M12,0 V16 M0,8 H24" stroke="#C8102E" stroke-width="2.6"/></svg>',
        US: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#FFFFFF"/><g fill="#B22234"><rect y="0" width="24" height="2.2"/><rect y="4.4" width="24" height="2.2"/><rect y="8.8" width="24" height="2.2"/><rect y="13.2" width="24" height="2.8"/></g><rect width="10.5" height="8.8" fill="#3C3B6E"/><circle cx="3" cy="2.6" r="0.8" fill="#FFFFFF"/><circle cx="6.2" cy="2.6" r="0.8" fill="#FFFFFF"/><circle cx="4.6" cy="5.4" r="0.8" fill="#FFFFFF"/><circle cx="7.8" cy="5.4" r="0.8" fill="#FFFFFF"/></svg>',
        DE: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#111827"/><rect y="5.33" width="24" height="5.34" fill="#DD0000"/><rect y="10.67" width="24" height="5.33" fill="#FFCE00"/></svg>',
        FR: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="8" height="16" fill="#002395"/><rect x="8" width="8" height="16" fill="#FFFFFF"/><rect x="16" width="8" height="16" fill="#ED2939"/></svg>',
        KW: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#007A3D"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#CE1126"/><polygon points="0,0 6.5,5.33 6.5,10.67 0,16" fill="#111827"/></svg>',
        QA: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#8D1B3D"/><polygon points="0,0 7,0 9,2 7,4 9,6 7,8 9,10 7,12 9,14 7,16 0,16" fill="#FFFFFF"/></svg>',
        BH: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#CE1126"/><polygon points="0,0 7,0 9.5,2.6 7,5.3 9.5,8 7,10.6 9.5,13.3 7,16 0,16" fill="#FFFFFF"/></svg>',
        OM: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect x="6" width="18" height="5.33" fill="#FFFFFF"/><rect x="6" y="5.33" width="18" height="5.34" fill="#DB161B"/><rect x="6" y="10.67" width="18" height="5.33" fill="#008000"/><rect width="6.5" height="16" fill="#DB161B"/></svg>',
        JO: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#111827"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#007A3D"/><polygon points="0,0 10,8 0,16" fill="#CE1126"/><circle cx="3.4" cy="8" r="1.2" fill="#FFFFFF"/></svg>',
        PS: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#111827"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#007A3D"/><polygon points="0,0 10,8 0,16" fill="#CE1126"/></svg>',
        MA: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#C1272D"/><circle cx="12" cy="8" r="2.7" fill="none" stroke="#006233" stroke-width="1.2"/></svg>',
        TN: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#E70013"/><circle cx="12" cy="8" r="4" fill="#FFFFFF"/><circle cx="12.4" cy="8" r="2.6" fill="#E70013"/><circle cx="13.2" cy="8" r="2.1" fill="#FFFFFF"/></svg>',
        DZ: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="12" height="16" fill="#006233"/><rect x="12" width="12" height="16" fill="#FFFFFF"/><circle cx="12" cy="8" r="3" fill="#D21034"/><circle cx="12.9" cy="8" r="2.3" fill="#FFFFFF"/></svg>',
        IQ: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#CE1126"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#111827"/><rect x="8.5" y="7.1" width="7" height="1.8" rx="0.6" fill="#007A3D"/></svg>',
        LB: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="4" fill="#EE161F"/><rect y="4" width="24" height="8" fill="#FFFFFF"/><rect y="12" width="24" height="4" fill="#EE161F"/><polygon points="12,5 9.2,10.8 14.8,10.8" fill="#00A651"/></svg>',
        YE: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#CE1126"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#111827"/></svg>',
        SD: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="5.33" fill="#D21034"/><rect y="5.33" width="24" height="5.34" fill="#FFFFFF"/><rect y="10.67" width="24" height="5.33" fill="#111827"/><polygon points="0,0 9,8 0,16" fill="#007229"/></svg>',
        LY: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="4" fill="#E70013"/><rect y="4" width="24" height="8" fill="#111827"/><rect y="12" width="24" height="4" fill="#239E46"/><circle cx="11.6" cy="8" r="2" fill="#FFFFFF"/><circle cx="12.2" cy="8" r="1.6" fill="#111827"/></svg>',
        EU: '<svg viewBox="0 0 24 16" aria-hidden="true"><rect width="24" height="16" fill="#003399"/><circle cx="12" cy="8" r="4.5" fill="none" stroke="#FFCC00" stroke-width="1.3" stroke-dasharray="1.3 1.8"/></svg>'
    };

    const LANG_TO_CC = { ar: 'EG', en: 'GB', tr: 'TR' };

    function svg(code, size) {
        const cc = String(code || '').trim().toUpperCase().slice(0, 2);
        const w = Number(size) || 20;
        const h = Math.round(w * 0.68);
        const raw = SVG_FLAGS[cc];
        if (raw) {
            return '<span class="sawyan-flag-svg" style="display:inline-flex;align-items:center;justify-content:center;width:' + w + 'px;height:' + h + 'px;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(15,23,42,0.14);vertical-align:middle;flex-shrink:0;" title="' + cc + '">' + raw + '</span>';
        }
        const safe = cc.replace(/[^A-Z0-9]/g, '') || 'GL';
        return '<span class="sawyan-flag-svg sawyan-flag-iso" style="display:inline-flex;align-items:center;justify-content:center;min-width:' + w + 'px;height:' + h + 'px;padding:0 3px;border-radius:3px;background:#e2e8f0;color:#0f172a;font-family:Poppins,sans-serif;font-size:' + Math.max(8, Math.round(h * 0.65)) + 'px;font-weight:800;line-height:1;vertical-align:middle;flex-shrink:0;">' + safe + '</span>';
    }

    function forLang(lang, size) {
        return svg(LANG_TO_CC[String(lang || 'ar').toLowerCase()] || 'EG', size);
    }

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.Flags = { svg: svg, forLang: forLang, MAP: SVG_FLAGS };
})();
