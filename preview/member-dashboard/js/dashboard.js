/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — V3.1 MEMBER DASHBOARD (11 SCREENS • 1:1 SHOWCASE PARITY)
 * Strictly bound to live PostgreSQL RPCs (`sawyan` & `sawyan_demo` schemas):
 *   - Zero hardcoded financial numbers or mock operational records (D21/D29)
 *   - 3-State Target Box & Local Currency Primary Display (Screens 1,2,3,7)
 *   - Google-Earth 2D Pan/Zoom Binary Tree + HUD D-Pad + Circle/Card Toggle
 *     + Reserve Gray Nodes + Reverse Ceiling 11 + D26 Phone/Sponsor Masking
 *   - Foreign Compensatory Country Protection (GREATEST(0, ...) — D1/T03)
 *   - Stage 8 Sequential Academy LMS Preserved 100%
 *   - Leaflet Geo Map + Haversine Distance + Google Maps + Live Path B Calc
 *   - Balanced Spillover Predictor + Direct Referral Registration (Session Safe)
 *   - KYC + Next-Month Residency Move + Home GPS + 2-Way Support Tickets
 * ============================================================================
 */

let currentMember = null;
let memberBundle = null;

function swMemToast(msg, type = null) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
        window.SAWYAN.UI.toast(msg, type);
    } else {
        console.info('[SAWYAN Member Notice]', msg);
    }
}

async function swMemAlert(title, message, type = 'info', actions = []) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.alertModal === 'function') {
        return await window.SAWYAN.UI.alertModal({ title, message, type, actions });
    }
    swMemToast(message, type);
    return true;
}

async function swMemConfirm(title, message, danger = false) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.confirmModal === 'function') {
        return await window.SAWYAN.UI.confirmModal({ title, message, danger });
    }
    return true;
}

function swMemErrText(err) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.humanizeError === 'function') {
        return window.SAWYAN.UI.humanizeError(err);
    }
    return String(err?.message || err || 'حدث خطأ غير متوقع');
}
let activeLensCountry = null;
let liveCatalog = [];
let liveFlashOffers = [];
let liveFlashOffersByMerchant = new Map();
let __flashOfferPopupChecked = false;
let liveCountriesPlanMap = new Map();
let radarCatalogOverride = null;
let merchantFilterState = { q: '', country: 'ALL', category: 'all', sort: 'distance' };
let txFilterState = { country: 'ALL', period: 'open' };
let treeUiState = {
    viewMode: 'circles', // 'circles' | 'cards'
    orangeOnly: false,
    searchQuery: '',
    tableColorFilter: 'ALL',
    radarMode: 'near_target_50_99',
    radarRows: null,
    zoom: 1,
    panX: 0,
    panY: 10
};
let crmFilterState = 'all';
let memberAcademyState = { catalog: null, trackId: 'ALL' };

function esc(val) {
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fmtUsd(v) {
    return `$${Number(v || 0).toFixed(2)}`;
}

function calcMemberUnitShareUsd(targetUsd, s02Slots = 11) {
    const tgtCents = Math.max(0, Math.round(Number(targetUsd || 0) * 100));
    const slots = Math.max(1, parseInt(s02Slots || 11, 10) || 11);
    return Math.floor(tgtCents / slots) / 100;
}

function getCountryPlanInfo(countryCode) {
    const p = (memberBundle && memberBundle.profile) || currentMember || {};
    const cc = String(countryCode || p.country_code || 'EG').toUpperCase();
    const matrixArr = (memberBundle && Array.isArray(memberBundle.countries_plan_matrix)) ? memberBundle.countries_plan_matrix : [];
    const fromMatrix = matrixArr.find(x => String(x.country_code || '').toUpperCase() === cc);
    const fromPub = liveCountriesPlanMap.get(cc);
    const src = fromPub || fromMatrix || (cc === String(p.country_code || '').toUpperCase() ? p : null) || {};

    const s02 = Math.max(1, parseInt(src.upline_ceiling_s02 || p.upline_ceiling_s02 || 11, 10) || 11);
    const s01 = Math.max(1, Math.min(40, parseInt(src.numerical_stopper_s01 || p.numerical_stopper_s01 || 11, 10) || 11));
    const idealNodes = Math.pow(2, s01) - 1;
    const targetUsd = Number(src.monthly_target_usd || (cc === p.country_code ? p.monthly_target_usd : 24.75) || 24.75);
    const unitShareUsd = src.unit_share_usd !== undefined ? Number(src.unit_share_usd) : calcMemberUnitShareUsd(targetUsd, s02);
    const defaultStopperUsd = (Math.round(unitShareUsd * 100) * idealNodes) / 100;
    const rawStopper = Number(src.financial_stopper_usd || (cc === p.country_code ? p.financial_stopper_usd : 0) || 0);
    const wasLegacyUnlinked = (Math.abs(rawStopper - 4605.75) < 0.005 && Math.abs(targetUsd - 24.75) > 0.005);
    const stopperUsd = (rawStopper > 0 && !wasLegacyUnlinked) ? rawStopper : defaultStopperUsd;

    const currencyCode = src.currency_code || (cc === p.country_code ? p.currency_code : null) || ({ EG: 'EGP', TR: 'TRY', SA: 'SAR', AE: 'AED', DE: 'EUR', FR: 'EUR', GB: 'GBP', KW: 'KWD', QA: 'QAR', JO: 'JOD', US: 'USD' }[cc] || 'USD');
    const fallbackFx = { EGP: 50, TRY: 38, SAR: 3.75, AED: 3.6725, EUR: 0.92, GBP: 0.79, KWD: 0.31, QAR: 3.64, JOD: 0.71, USD: 1 }[currencyCode] || 1;
    const rawFx = Number(src.admin_fx_rate || src.fx_rate_to_usd || 0);
    const fx = (rawFx > 0 && !(rawFx === 1 && currencyCode !== 'USD')) ? rawFx : fallbackFx;

    return { countryCode: cc, currencyCode, fx, targetUsd, s02, s01, idealNodes, unitShareUsd, stopperUsd, defaultStopperUsd };
}

function getMemLocale() {
    return (window.SAWYAN && window.SAWYAN.I18n && typeof window.SAWYAN.I18n.getLocale === 'function')
        ? window.SAWYAN.I18n.getLocale()
        : 'ar-EG';
}

function resolveCurrencyFx(countryCode, currencyCode) {
    if (countryCode) {
        const info = getCountryPlanInfo(countryCode);
        if (info && info.fx > 0 && (!currencyCode || String(info.currencyCode).toUpperCase() === String(currencyCode).toUpperCase())) {
            return info.fx;
        }
    }
    const cur = String(currencyCode || 'USD').toUpperCase();
    for (const row of liveCountriesPlanMap.values()) {
        if (String(row.currency_code || '').toUpperCase() === cur && Number(row.admin_fx_rate || row.fx_rate_to_usd || 0) > 0) {
            return Number(row.admin_fx_rate || row.fx_rate_to_usd);
        }
    }
    return { EGP: 50, TRY: 38, SAR: 3.75, AED: 3.6725, EUR: 0.92, GBP: 0.79, KWD: 0.31, QAR: 3.64, JOD: 0.71, USD: 1 }[cur] || 1;
}

function getMemberFxContext() {
    const p = (memberBundle && memberBundle.profile) || currentMember || {};
    const info = getCountryPlanInfo(p.country_code);
    return { fx: info.fx, code: info.currencyCode };
}

function fmtCountryLocal(usdVal, planInfo) {
    const info = planInfo || getCountryPlanInfo();
    const localAmt = Number(usdVal || 0) * info.fx;
    return `${localAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${info.currencyCode}`;
}

function fmtLocalFromUsd(usdVal) {
    const { fx, code } = getMemberFxContext();
    const localAmt = Number(usdVal || 0) * fx;
    return `${localAmt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
}

function getMemberGeoCoords() {
    const homeGps = memberBundle?.profile?.metadata?.home_gps;
    if (homeGps && Number.isFinite(Number(homeGps.lat)) && Number.isFinite(Number(homeGps.lng))) {
        return { lat: Number(homeGps.lat), lng: Number(homeGps.lng), source: 'home_gps' };
    }
    if (window.__liveDeviceGps && Number.isFinite(window.__liveDeviceGps.lat)) {
        return { lat: window.__liveDeviceGps.lat, lng: window.__liveDeviceGps.lng, source: 'browser' };
    }
    const cc = String(memberBundle?.profile?.country_code || 'EG').toUpperCase();
    if (cc === 'TR') return { lat: 41.0082, lng: 28.9784, source: 'city_default' };
    if (cc === 'SA') return { lat: 24.7136, lng: 46.6753, source: 'city_default' };
    if (cc === 'AE') return { lat: 25.2048, lng: 55.2708, source: 'city_default' };
    return { lat: 30.0444, lng: 31.2357, source: 'city_default' };
}

function haversineKm(lat1, lng1, lat2, lng2) {
    if (![lat1, lng1, lat2, lng2].every(v => v !== null && v !== undefined && Number.isFinite(Number(v)))) return null;
    const R = 6371;
    const toRad = (deg) => (Number(deg) * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function waitForApiReady() {
    for (let i = 0; i < 20; i++) {
        if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.supabase) return true;
        await new Promise(r => setTimeout(r, 100));
    }
    return Boolean(window.SAWYAN && window.SAWYAN.API);
}

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        const logoBox = document.getElementById('logoContainer');
        if (logoBox) {
            logoBox.innerHTML = `<a href="../index.html" class="logo-link" style="text-decoration:none;">${window.SAWYAN.Logo.svg('light-on-dark')}</a>`;
        }
    }

    await waitForApiReady();
    const ok = await ensureAuthenticatedSession();
    if (!ok) return;

    wireNavigationHandlers();
    await refreshDashboardBundle(null);
    await loadPublicMerchantsCatalogSafe();
});

async function ensureAuthenticatedSession() {
    const saved = (window.SAWYAN && window.SAWYAN.API) ? window.SAWYAN.API.getSavedMember() : null;
    if (!saved || !saved.id || saved.member_code === 0) {
        window.location.href = 'login.html';
        return false;
    }
    currentMember = saved;
    const nameEl = document.getElementById('userName');
    const codeEl = document.getElementById('memberCode');
    if (nameEl) nameEl.textContent = saved.full_name || 'عضو';
    if (codeEl) codeEl.textContent = `كود العضوية: #${saved.member_code}`;
    return true;
}

async function refreshDashboardBundle(lensCountry = activeLensCountry) {
    activeLensCountry = lensCountry || null;
    try {
        if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getPublicActiveCountriesAndCities) {
            try {
                const pubCty = await window.SAWYAN.API.getPublicActiveCountriesAndCities();
                if (pubCty && Array.isArray(pubCty.countries)) {
                    liveCountriesPlanMap.clear();
                    pubCty.countries.forEach(c => {
                        if (c && c.country_code) liveCountriesPlanMap.set(String(c.country_code).toUpperCase(), c);
                    });
                }
            } catch (_) {}
        }

        memberBundle = await window.SAWYAN.API.getMemberDashboardBundle({
            memberId: currentMember.id,
            lensCountryCode: activeLensCountry
        });
        window.__memberBundleCache = memberBundle;
        window.getSawyanMemberCountryPlan = getCountryPlanInfo;

        if (memberBundle.profile) {
            currentMember = { ...currentMember, ...memberBundle.profile };
            window.SAWYAN.API.saveMemberSession(currentMember, null);
            const nameEl = document.getElementById('userName');
            const codeEl = document.getElementById('memberCode');
            if (nameEl) nameEl.textContent = memberBundle.profile.full_name || 'عضو';
            if (codeEl) codeEl.textContent = `كود العضوية: #${memberBundle.profile.member_code} • ${memberBundle.profile.country_code}`;
            const userBox = document.querySelector('.user-profile');
            if (userBox && window.SAWYAN?.ImageUpload) {
                let avEl = document.getElementById('memberSidebarAvatarWrap');
                if (!avEl) {
                    avEl = document.createElement('div');
                    avEl.id = 'memberSidebarAvatarWrap';
                    avEl.style.marginBottom = '8px';
                    userBox.insertBefore(avEl, userBox.firstChild);
                }
                const avUrl = memberBundle.profile.avatar_url;
                avEl.innerHTML = window.SAWYAN.ImageUpload.isSafeMediaUrl(avUrl)
                    ? `<img src="${esc(avUrl)}" alt="الصورة الشخصية" style="width:54px;height:54px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,0.45);margin:0 auto;display:block;">`
                    : '';
            }
            const ribbonGreet = document.getElementById('sawyanMemberRibbonGreeting');
            if (ribbonGreet) ribbonGreet.textContent = `👋 أهلاً، ${memberBundle.profile.full_name || 'عضو SAWYAN'}`;
        }

        if (window.SAWYAN && window.SAWYAN.Notifications && Array.isArray(memberBundle.notifications)) {
            window.SAWYAN.Notifications.hydrateFromBundle(memberBundle.notifications);
        }

        renderHomePage();
        renderActiveTabIfOpen();
        scheduleMemberAdaptivePoll();
    } catch (err) {
        console.error('Bundle load error:', err);
        if (String(err.message || '').includes('UNAUTHORIZED_MEMBER_SESSION')) {
            window.SAWYAN.API.clearMemberSession();
            window.location.href = 'login.html';
        }
    }
}

let __memberPollTimer = null;
function scheduleMemberAdaptivePoll() {
    if (__memberPollTimer) { clearTimeout(__memberPollTimer); __memberPollTimer = null; }
    if (!currentMember || !memberBundle) return;
    const hasPendingTx = (memberBundle.transactions || []).some(t => t.status === 'pending' || t.status === 'awaiting_merchant_topup');
    const hasOpenReturn = (memberBundle.return_requests || []).some(r => r.status === 'pending_member_otp' || r.status === 'pending');
    if (!hasPendingTx && !hasOpenReturn) return;
    __memberPollTimer = setTimeout(async () => {
        if (document.hidden || !currentMember?.id) {
            scheduleMemberAdaptivePoll();
            return;
        }
        try { await refreshDashboardBundle(activeLensCountry); } catch (_) {}
    }, 6000);
}

function formatMemberOfferRemainingAr(sec) {
    const s = Math.max(0, Number(sec || 0));
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} دقيقة`;
    const hrs = Math.floor(s / 3600);
    if (hrs < 24) return `${hrs} ساعة`;
    const days = Math.floor(hrs / 24);
    const remH = hrs % 24;
    return remH > 0 ? `${days} يوم و${remH} س` : `${days} يوم`;
}

function getPrioritizedMemberFlashOffers() {
    const all = Array.isArray(liveFlashOffers) ? liveFlashOffers.slice() : [];
    if (!all.length) return [];
    const myCc = String(memberBundle?.profile?.country_code || '').toUpperCase();
    return all.sort((a, b) => {
        const aLocal = String(a.country_code || '').toUpperCase() === myCc ? 1 : 0;
        const bLocal = String(b.country_code || '').toUpperCase() === myCc ? 1 : 0;
        if (aLocal !== bLocal) return bLocal - aLocal;
        return Number(b.remaining_seconds || 0) - Number(a.remaining_seconds || 0);
    });
}

function renderMemberHomeFlashOffersBanner() {
    const slot = document.getElementById('memberHomeFlashOffersSlot');
    if (!slot) return;
    const list = getPrioritizedMemberFlashOffers();
    if (!list.length) {
        slot.style.display = 'none';
        slot.innerHTML = '';
        return;
    }
    slot.style.display = 'block';
    slot.innerHTML = `
        <div style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 55%,#ecfdf5 100%);border:2px solid #f59e0b;border-radius:16px;padding:15px 16px;margin:12px 0;box-shadow:0 6px 20px rgba(245,158,11,0.14);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <strong style="font-size:0.98rem;color:#0f172a;">🔥 عروض وحملات حصرية نشطة الآن (${list.length})</strong>
                <button type="button" onclick="goToPage('merchants')" class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:0.76rem;background:#fff;">عرض جميع المتاجر ↗</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:10px;">
                ${list.slice(0, 4).map(o => {
                    const flag = (window.SAWYAN?.Flags?.svg) ? window.SAWYAN.Flags.svg(o.country_code, 15) : esc(o.country_code || '');
                    const rem = formatMemberOfferRemainingAr(o.remaining_seconds);
                    return `
                        <div style="background:#fff;border:1.5px solid #fcd34d;border-radius:12px;padding:11px 13px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
                            <div>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                                    <strong style="font-size:0.9rem;color:#0f172a;display:inline-flex;align-items:center;gap:5px;">🏪 ${esc(o.business_name)} ${flag}</strong>
                                    <span style="background:#fef2f2;color:#b91c1c;padding:2px 7px;border-radius:999px;font-size:0.7rem;font-weight:800;">⏳ ${esc(rem)}</span>
                                </div>
                                <div style="margin-top:6px;font-size:0.85rem;font-weight:800;color:#92400e;background:#fffbeb;border-right:3px solid #f59e0b;padding:6px 9px;border-radius:7px;line-height:1.5;">
                                    🔥 ${esc(o.title)}
                                </div>
                            </div>
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                                <span style="font-size:0.74rem;font-weight:800;color:#047857;">✨ عائدات فريقك ${Number(o.plan_cashback_pct || 0).toFixed(2)}%</span>
                                <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:0.75rem;" onclick="openMemberPurchaseModal('${esc(o.merchant_id)}', '${esc(o.branch_id || '')}', '${esc(o.business_name)}', '${esc(o.currency_code || '')}', ${Number(o.plan_cashback_pct || 0)})">📝 استفد ووثّق شراء</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function maybeShowFlashOfferSpotlightPopup() {
    if (__flashOfferPopupChecked) return;
    const list = getPrioritizedMemberFlashOffers();
    if (!list.length) return;
    __flashOfferPopupChecked = true;

    const storageKey = 'sawyan_seen_flash_offers_v1';
    let seen = [];
    try {
        const raw = localStorage.getItem(storageKey);
        seen = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(seen)) seen = [];
    } catch (_) { seen = []; }

    const unseen = list.find(o => o && o.offer_id && !seen.includes(String(o.offer_id)));
    if (!unseen) return;

    seen.push(String(unseen.offer_id));
    try { localStorage.setItem(storageKey, JSON.stringify(seen.slice(-40))); } catch (_) {}

    const flag = (window.SAWYAN?.Flags?.svg) ? window.SAWYAN.Flags.svg(unseen.country_code, 18) : esc(unseen.country_code || '');
    const rem = formatMemberOfferRemainingAr(unseen.remaining_seconds);
    const bodyHtml = `
        <div style="text-align:right;line-height:1.7;">
            <div style="background:linear-gradient(135deg,#0f172a,#064e3b);color:#fff;border-radius:14px;padding:14px 16px;margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
                    <span style="background:#dc2626;color:#fff;font-size:0.72rem;font-weight:900;padding:3px 9px;border-radius:999px;">🔥 عرض حصري جديد</span>
                    <span style="background:rgba(255,255,255,0.14);color:#fde68a;font-size:0.75rem;font-weight:800;padding:3px 9px;border-radius:999px;">⏳ متبقي ${esc(rem)}</span>
                </div>
                <div style="font-size:1.12rem;font-weight:900;display:flex;align-items:center;gap:7px;">🏪 ${esc(unseen.business_name)} ${flag}</div>
                <div style="font-size:0.8rem;color:#a7f3d0;margin-top:2px;">✨ عائدات خطة الدخل لفريقك: <strong>${Number(unseen.plan_cashback_pct || 0).toFixed(2)}%</strong></div>
            </div>
            <div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:12px;padding:12px 14px;margin-bottom:14px;">
                <div style="font-size:1.02rem;font-weight:900;color:#92400e;">${esc(unseen.title)}</div>
                ${unseen.body && unseen.body !== unseen.title ? `<div style="font-size:0.86rem;color:#475569;margin-top:6px;">${esc(unseen.body)}</div>` : ''}
                ${unseen.discount_hint ? `<div style="font-size:0.78rem;color:#b45309;font-weight:800;margin-top:6px;">${esc(unseen.discount_hint)}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary" style="flex:1;" onclick="closeMemberModal(); openMemberPurchaseModal('${esc(unseen.merchant_id)}', '${esc(unseen.branch_id || '')}', '${esc(unseen.business_name)}', '${esc(unseen.currency_code || '')}', ${Number(unseen.plan_cashback_pct || 0)});">📝 الذهاب للمتجر وتوثيق شراء</button>
                <button type="button" class="btn btn-outline" onclick="closeMemberModal(); goToPage('merchants');">🏪 تصفح المتاجر</button>
            </div>
        </div>
    `;
    setTimeout(() => {
        if (!document.getElementById('sawyanMemberModalOverlay')) {
            openMemberModal('🔥 عرض ترويجي مميز معتمد لك الآن', bodyHtml, null);
        }
    }, 650);
}

async function loadPublicFlashOffersSafe() {
    try {
        if (window.SAWYAN?.API && typeof window.SAWYAN.API.getPublicActiveFlashOffers === 'function') {
            const offers = await window.SAWYAN.API.getPublicActiveFlashOffers({});
            liveFlashOffers = Array.isArray(offers) ? offers : [];
            liveFlashOffersByMerchant = new Map();
            liveFlashOffers.forEach(o => {
                if (o && o.merchant_id && !liveFlashOffersByMerchant.has(String(o.merchant_id))) {
                    liveFlashOffersByMerchant.set(String(o.merchant_id), o);
                }
            });
            renderMemberHomeFlashOffersBanner();
            maybeShowFlashOfferSpotlightPopup();
            const merchPg = document.getElementById('merchantsPage');
            if (merchPg && merchPg.classList.contains('active')) {
                updateMemberMerchantsResults();
            }
        }
    } catch (err) {
        console.warn('Flash offers load warning:', err && err.message);
    }
}

async function loadPublicMerchantsCatalogSafe() {
    try {
        const [rows] = await Promise.all([
            window.SAWYAN.API.getPublicMerchantsCatalog({}),
            loadPublicFlashOffersSafe()
        ]);
        liveCatalog = Array.isArray(rows) ? rows : [];
    } catch (err) {
        console.warn('Catalog load warning:', err.message);
        liveCatalog = [];
    }
}

// ---------------------------------------------------------------------------
// Clean In-App Modal
// ---------------------------------------------------------------------------
function openMemberModal(titleText, bodyHtml, onSubmit) {
    let overlay = document.getElementById('sawyanMemberModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sawyanMemberModalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.68);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10050;';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div style="background:#ffffff;border-radius:18px;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.28);direction:rtl;font-family:Tajawal,sans-serif;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="margin:0;color:#0f172a;font-size:1.08rem;">${titleText}</h3>
                <button type="button" id="sawyanModalCloseX" style="border:none;background:#f1f5f9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-weight:800;">✕</button>
            </div>
            <form id="sawyanMemberModalForm" style="display:grid;gap:12px;">
                ${bodyHtml}
                <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px;">
                    <button type="button" id="sawyanModalCancelBtn" class="btn btn-outline btn-sm">إلغاء</button>
                    <button type="submit" id="sawyanModalSubmitBtn" class="btn btn-primary btn-sm">تأكيد وإرسال</button>
                </div>
            </form>
        </div>
    `;
    const close = () => { overlay.style.display = 'none'; };
    document.getElementById('sawyanModalCloseX').onclick = close;
    document.getElementById('sawyanModalCancelBtn').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const form = document.getElementById('sawyanMemberModalForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('sawyanModalSubmitBtn');
        btn.disabled = true;
        btn.textContent = '⏳ جاري التنفيذ...';
        try {
            await onSubmit(form, close);
        } catch (err) {
            swMemToast(swMemErrText(err), 'error');
            btn.disabled = false;
            btn.textContent = 'تأكيد وإرسال';
        }
    };
}

function wireNavigationHandlers() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            goToPage(this.dataset.page);
        });
    });
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', function (e) {
            const p = this.dataset.page;
            if (p === 'more') return;
            e.preventDefault();
            goToPage(p);
        });
    });
}

function goToPage(page) {
    if (!page) return;
    closeMoreMenu();

    document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    const targetPage = document.getElementById(page + 'Page');
    if (targetPage) targetPage.classList.add('active');

    const titleMap = {
        home: 'لوحة العضو',
        myPending: 'طلباتي المعلقة',
        transactions: 'العمليات المكتملة والمراجعة',
        tree: 'شجرتي',
        wallet: 'المحفظة والسحوبات الموثقة',
        academy: 'أكاديمية سويا التدريبية',
        merchants: 'التجار المتاحون حولي والخريطة الجغرافية',
        favorites: 'متاجري المفضلة',
        crm: 'دفتر المعارف والدعوات',
        referrals: 'رابط الإحالة وبناء الفريق',
        settings: 'الملف الشخصي والهوية والدعم والأمان'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titleMap[page] || 'لوحة العضو';

    const loaders = {
        home: renderHomePage,
        myPending: loadMyPendingRequests,
        transactions: loadAllTransactions,
        tree: loadTree,
        wallet: loadWalletDetails,
        academy: loadAcademy,
        merchants: loadNearbyMerchants,
        favorites: loadFavorites,
        crm: loadCRM,
        referrals: loadReferrals,
        settings: loadSettings
    };
    if (loaders[page]) loaders[page]();
}
window.goToPage = goToPage;

function renderActiveTabIfOpen() {
    const active = document.querySelector('.page.active');
    if (!active) return;
    const id = active.id.replace(/Page$/, '');
    if (id !== 'home') {
        goToPage(id);
    }
}

window.copyMemberStaticBarcode = function () {
    const code = memberBundle?.profile?.member_code || currentMember?.member_code || '';
    const txt = `SAWYAN:MEMBER:${code}`;
    navigator.clipboard?.writeText(txt).catch(() => {});
    swMemToast(`تم نسخ رمز الهوية الثابت للكاشير: ${txt}`, 'success');
};

window.openQuickMemberQrModal = function () {
    const profile = memberBundle?.profile || currentMember || {};
    const code = profile.member_code || '';
    const fullName = profile.full_name || 'عضو SAWYAN';
    const barcodePayload = (window.SAWYAN && window.SAWYAN.PaymentService)
        ? window.SAWYAN.PaymentService.generateOfflineQR(profile.id, code)
        : `SAWYAN:MEMBER:${code}`;

    let ov = document.getElementById('sawyanQuickMemberQrOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'sawyanQuickMemberQrOverlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.78);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10060;';
        ov.onclick = (e) => { if (e.target === ov) ov.style.display = 'none'; };
        document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    ov.innerHTML = `
        <div style="background:#ffffff;border-radius:20px;max-width:360px;width:100%;padding:20px;text-align:center;border:2.5px solid #10b981;box-shadow:0 24px 60px rgba(0,0,0,0.45);direction:rtl;font-family:Tajawal,sans-serif;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <strong style="font-size:1.02rem;color:#065f46;">📲 كود هويتك للكاشير</strong>
                <button type="button" onclick="document.getElementById('sawyanQuickMemberQrOverlay').style.display='none'" style="border:none;background:#f1f5f9;border-radius:8px;width:30px;height:30px;cursor:pointer;font-weight:800;">✕</button>
            </div>
            <div style="font-weight:800;color:#0f172a;font-size:0.95rem;">${esc(fullName)}</div>
            <div style="font-weight:900;color:#047857;font-size:1.15rem;margin:2px 0 12px;" dir="ltr">#${esc(code)}</div>
            <div id="quickMemberQrCanvas" style="display:inline-flex;align-items:center;justify-content:center;padding:12px;background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;min-width:210px;min-height:210px;"></div>
            <div style="font-size:0.78rem;color:#475569;margin:10px 0 14px;">أظهر هذا الرمز الثابت للكاشير لمسح الفاتورة فوراً</div>
            <div style="display:grid;gap:8px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="copyMemberStaticBarcode()">📋 نسخ كود العضوية</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="downloadMemberQrCardPng()">💾 حفظ بطاقة العضوية كصورة</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('sawyanQuickMemberQrOverlay').style.display='none'">إغلاق</button>
            </div>
        </div>
    `;
    const box = document.getElementById('quickMemberQrCanvas');
    if (box && window.QRCode) {
        box.innerHTML = '';
        new window.QRCode(box, { text: barcodePayload, width: 204, height: 204, colorDark: '#047857', colorLight: '#ffffff' });
    }
};

window.downloadMemberQrCardPng = function () {
    const profile = memberBundle?.profile || currentMember || {};
    const code = profile.member_code || '';
    const fullName = profile.full_name || 'عضو SAWYAN';
    const qrBox = document.getElementById('qrCode');
    const qrCanvas = qrBox ? qrBox.querySelector('canvas') : null;
    const qrImg = qrBox ? qrBox.querySelector('img') : null;
    if (!qrCanvas && !qrImg) {
        swMemToast('لم يجهز رمز الـ QR بعد، أعد تحميل الصفحة.', 'warning');
        return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 720;
    canvas.height = 460;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, 720, 460);
    grad.addColorStop(0, '#064e3b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 720, 460);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, 688, 428);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('SAWYAN', 42, 66);

    ctx.fillStyle = '#ecfdf5';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('بطاقة العضوية المعتمدة', 678, 66);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(42, 105, 240, 240, 18) : ctx.fillRect(42, 105, 240, 240);
    ctx.fill();

    const qrSource = qrCanvas || qrImg;
    try {
        ctx.drawImage(qrSource, 62, 125, 200, 200);
    } catch (_e) {}

    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('الاسم', 678, 150);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(String(fullName).slice(0, 28), 678, 192);

    ctx.fillStyle = '#a7f3d0';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('كود العضوية الثابت للكاشير', 678, 256);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 38px monospace';
    ctx.fillText(`#${code}`, 678, 305);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px sans-serif';
    ctx.fillText('اعرض هذا الرمز للكاشير عند الشراء لإضافة العائد تلقائياً', 678, 405);

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `SAWYAN-Member-Card-${code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    swMemToast('تم حفظ بطاقة العضوية في جهازك للاستخدام في أي وقت!', 'success');
};

function fmtBiDi(val) {
    return `<span dir="ltr" style="display:inline-block;unicode-bidi:isolate;white-space:nowrap;">${esc(val)}</span>`;
}

function computeMonthlyPurchaseStats(txs, periodYm, homePlan) {
    const plan = homePlan || getCountryPlanInfo();
    const fx = Number(plan.fx || 1) > 0 ? Number(plan.fx || 1) : 1;
    const targetCur = String(plan.currencyCode || 'USD').toUpperCase();
    let count = 0;
    let grossLocal = 0;
    let planShareLocal = 0;

    (Array.isArray(txs) ? txs : []).forEach(t => {
        if (!t || t.status !== 'completed') return;
        const effPeriod = String(t.effective_period_ym || t.created_at || '').slice(0, 7);
        if (periodYm && effPeriod !== periodYm) return;
        const rawAmt = Number(t.total_amount || 0);
        const rawPlanLocal = Number(t.income_plan_share_local || 0);
        const rawPlanUsd = Number(t.income_plan_share_usd || 0);
        const txCur = String(t.currency_code || targetCur).toUpperCase();

        let amtLocal = rawAmt;
        let planLocal = rawPlanLocal;
        if (txCur !== targetCur) {
            planLocal = rawPlanUsd * fx;
            const ratio = (rawAmt > 0 && rawPlanLocal > 0) ? (rawPlanLocal / rawAmt) : 0;
            amtLocal = ratio > 0 ? (planLocal / ratio) : rawAmt;
        }
        grossLocal += amtLocal;
        planShareLocal += planLocal;
        count += 1;
    });

    const weightedAvgPct = grossLocal > 0 ? (planShareLocal / grossLocal) * 100 : 0;
    return { count, grossLocal, planShareLocal, weightedAvgPct };
}
window.computeSawyanMonthlyPurchaseStats = computeMonthlyPurchaseStats;

// ---------------------------------------------------------------------------
// Screen 1: Home (3-State Target Box, Dark Earnings Card, Team Radar, Static QR, Recent)
// ---------------------------------------------------------------------------
function fmtMemberTxStatusBadge(t) {
    const st = String(t?.status || '');
    if (st === 'completed') return { label: '✅ مكتملة ومعتمدة', bg: '#d1fae5', color: '#065f46' };
    if (st === 'awaiting_merchant_topup') {
        return { label: '⏸️ بانتظار استكمال اعتماد التاجر', bg: '#fee2e2', color: '#991b1b' };
    }
    if (st === 'pending') return { label: '⏳ بانتظار اعتماد التاجر', bg: '#fef3c7', color: '#92400e' };
    if (st === 'reversed') return { label: '↩️ مسترجعة', bg: '#f1f5f9', color: '#475569' };
    if (st === 'rejected') return { label: '❌ مرفوضة', bg: '#fee2e2', color: '#991b1b' };
    return { label: esc(st || '—'), bg: '#f1f5f9', color: '#334155' };
}

function renderHomePage() {
    if (!memberBundle) return;
    const w = memberBundle.wallet || {};
    const txs = memberBundle.transactions || [];
    const tree = memberBundle.tree_analytics || {};
    const boxes = memberBundle.target_boxes || [];
    const profile = memberBundle.profile || {};

    const balEl = document.getElementById('walletBalance');
    const txCntEl = document.getElementById('totalTransactions');
    const teamEl = document.getElementById('teamSize');
    const teamSubEl = document.getElementById('teamSizeSub');
    const downlineCount = tree.total_team_count !== undefined
        ? Number(tree.total_team_count)
        : Math.max(0, (tree.nodes ? tree.nodes.length - 1 : 0));
    const treeTotalIncludingSelf = downlineCount + 1;
    if (balEl) balEl.textContent = fmtLocalFromUsd(w.balance_usd);
    if (txCntEl) txCntEl.textContent = profile.completed_tx_count !== undefined
        ? Number(profile.completed_tx_count)
        : txs.filter(t => t.status === 'completed').length;
    if (teamEl) teamEl.textContent = String(treeTotalIncludingSelf);
    if (teamSubEl) teamSubEl.textContent = `أنت + ${downlineCount} بالفريق`;

    let homeEnhBox = document.getElementById('memberHomeInteractiveDeck');
    if (!homeEnhBox) {
        homeEnhBox = document.createElement('div');
        homeEnhBox.id = 'memberHomeInteractiveDeck';
        const statsGrid = document.querySelector('#homePage .stats-grid');
        if (statsGrid && statsGrid.parentNode) {
            statsGrid.parentNode.insertBefore(homeEnhBox, statsGrid.nextSibling);
        }
    }

    const homePlan = getCountryPlanInfo(profile.country_code);
    const homeBox = boxes.find(b => b.country_code === profile.country_code && b.period_ym === memberBundle.period_ym) || boxes[0];
    const req = Number((homeBox && homeBox.target_required_usd) || homePlan.targetUsd || 24.75);
    const carryUsd = Number((homeBox && homeBox.carry_on_in_usd) || 0);
    const monthUsd = Number((homeBox && homeBox.current_month_purchases_usd) || 0);
    const rawNet = Number((homeBox && homeBox.net_accumulated_usd) || 0);
    const combinedNetUsd = homeBox ? Math.max(0, rawNet) : Math.max(0, monthUsd + carryUsd);
    const isQual = Boolean((homeBox && homeBox.is_qualified) || combinedNetUsd >= req);
    const boxPeriod = (homeBox && homeBox.period_ym) || memberBundle.period_ym || '';
    const monthNum = (() => {
        const m = parseInt(String(boxPeriod || '').split('-')[1] || '', 10);
        return (m >= 1 && m <= 12) ? m : (new Date().getMonth() + 1);
    })();
    const unitShareUsd = calcMemberUnitShareUsd(req, homePlan.s02);
    const pct = Math.max(0, Math.min(100, Math.round((combinedNetUsd / Math.max(req, 0.01)) * 100)));
    const remainingUsd = Math.max(0, req - combinedNetUsd);
    const stateCls = isQual ? 'green-state' : (combinedNetUsd > 0 ? 'orange-state' : 'white-state');
    const stateBadgeBg = isQual ? '#10b981' : (combinedNetUsd > 0 ? '#f59e0b' : '#64748b');
    const stateBadgeText = isQual
        ? '🟢 مؤهل أخضر (100%)'
        : (combinedNetUsd > 0 ? `🟠 جاري التجميع (${pct}%)` : '⚪ بانتظار أول شراء');

    const monthStats = computeMonthlyPurchaseStats(txs, boxPeriod, homePlan);
    const grossMonthFormatted = `${monthStats.grossLocal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${homePlan.currencyCode}`;
    const avgPctFormatted = monthStats.grossLocal > 0 ? `${monthStats.weightedAvgPct.toFixed(1)}%` : '0%';

    const actualMonthUsd = Number(tree.actual_earnings_usd || 0);
    const expectedOrangeUsd = Number(tree.expected_orange_earnings_usd || 0);
    const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];

    const greenTeamCount = nodes.filter(n => {
        const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
        return d >= 2 && n.team_bucket === 'COMMISSION_TEAM';
    }).length;
    const orangeTeamCount = nodes.filter(n => {
        const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
        return d >= 2 && n.team_bucket !== 'RESERVE_TEAM' && n.visual_color !== 'GRAY' && n.visual_color !== 'BLACK' && n.node_color === 'ORANGE';
    }).length;

    const selfActualUsd = isQual ? unitShareUsd : 0;
    const actualTotalUsd = actualMonthUsd + selfActualUsd;
    const greenQualifiedTotalCount = greenTeamCount + (isQual ? 1 : 0);
    const expectedTotalInclAllUsd = actualMonthUsd + expectedOrangeUsd + unitShareUsd;

    const teamRadar = nodes
        .filter(n => {
            const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
            return d >= 2 && d <= 11 && (n.node_color === 'ORANGE' || n.node_color === 'GREEN');
        })
        .sort((a, b) => {
            const aOrd = a.node_color === 'ORANGE' ? 0 : 1;
            const bOrd = b.node_color === 'ORANGE' ? 0 : 1;
            if (aOrd !== bOrd) return aOrd - bOrd;
            return Number(b.target_pct || 0) - Number(a.target_pct || 0);
        })
        .slice(0, 6);

    const queuedOrPendTxs = (memberBundle.transactions || []).filter(t => t.status === 'awaiting_merchant_topup' || t.status === 'pending');
    const dayOfMonth = new Date().getDate();
    const isReviewPhase = dayOfMonth >= 1 && dayOfMonth <= 14;
    const isPayoutDay = dayOfMonth === 15;
    const topOrangeNudge = teamRadar.find(n => n.node_color === 'ORANGE' && Number(n.target_pct || 0) >= 60) || teamRadar.find(n => n.node_color === 'ORANGE') || null;
    const nudgeWa = topOrangeNudge && topOrangeNudge.phone_visible && topOrangeNudge.phone
        ? `https://wa.me/${String(topOrangeNudge.phone).replace(/\D/g, '')}?text=${encodeURIComponent(`أهلاً ${topOrangeNudge.full_name} 🌟 وصلت إلى ${Number(topOrangeNudge.target_pct || 0)}% من هدفك الشهري على SAWYAN — خطوة بسيطة وتكتمل عمولتك هذا الشهر!`)}`
        : '';

    const todayActionHtml = !isQual
        ? `<div style="font-size:0.86rem;color:#0f172a;line-height:1.55;">
                متبقي لك <strong style="color:#b45309;">${fmtBiDi(fmtLocalFromUsd(remainingUsd))}</strong> لإكمال تأهلك هذا الشهر وتفعيل صرف عمولات فريقك.
           </div>
           <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                <button type="button" class="btn btn-primary btn-sm" onclick="openMemberPurchaseModal()">🧾 وثّق فاتورة الآن</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="goToPage('merchants')">🏪 أقرب التجار</button>
           </div>`
        : (topOrangeNudge
            ? `<div style="font-size:0.86rem;color:#0f172a;line-height:1.55;">
                    أنت مؤهل 100% ✅! العضو <strong>#${topOrangeNudge.member_code} ${esc(topOrangeNudge.full_name)}</strong> وصل إلى <strong>${Number(topOrangeNudge.target_pct || 0)}%</strong> ويحتاج دفعة بسيطة لإكمال هدفه.
               </div>
               <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                    ${nudgeWa ? `<a href="${nudgeWa}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" style="background:#16a34a;border-color:#16a34a;">💬 شجّعه عبر واتساب</a>` : ''}
                    <button type="button" class="btn btn-outline btn-sm" onclick="goToPage('tree')">🌳 افتح غرفة المتابعة</button>
               </div>`
            : `<div style="font-size:0.86rem;color:#0f172a;line-height:1.55;">
                    تأهلك مكتمل 100% ✅! شارك رابط إحالتك لتنمية ذراعك الأضعف ومضاعفة عائدك الشهري.
               </div>
               <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                    <button type="button" class="btn btn-primary btn-sm" onclick="goToPage('referrals')">🔗 مشاركة رابط الإحالة</button>
                    <button type="button" class="btn btn-outline btn-sm" onclick="goToPage('tree')">🌳 استوديو الشجرة</button>
               </div>`);

    const showNewMemberChecklist = txs.length === 0 && combinedNetUsd <= 0;
    const newMemberChecklistHtml = !showNewMemberChecklist ? '' : `
        <div style="background:#ffffff;border:1.5px solid #86efac;border-radius:16px;padding:14px 16px;margin:10px 0;box-shadow:0 3px 12px rgba(6,78,59,0.06);">
            <div style="font-weight:900;font-size:0.96rem;color:#065f46;margin-bottom:8px;">🚀 ابدأ رحلتك في SAWYAN خلال 3 خطوات سريعة</div>
            <div style="display:grid;gap:8px;font-size:0.83rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 11px;">
                    <span><strong>1.</strong> اختر متجراً شريكاً قريباً منك أو متجراً إلكترونياً معتمداً</span>
                    <button type="button" class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:0.76rem;" onclick="goToPage('merchants')">🏪 التجار حولي</button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:8px 11px;">
                    <span><strong>2.</strong> وثّق أول فاتورة شراء (بالـ QR أو برقم الفاتورة) لإضاءة هدفك الشهري</span>
                    <button type="button" class="btn btn-primary btn-sm" style="padding:4px 10px;font-size:0.76rem;" onclick="openMemberPurchaseModal()">🧾 وثّق الآن</button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 11px;">
                    <span><strong>3.</strong> شارك رابط دعوتك مع معارفك لبناء شجرتك وتنمية عائداتك الشهرية</span>
                    <button type="button" class="btn btn-outline btn-sm" style="padding:4px 10px;font-size:0.76rem;" onclick="goToPage('referrals')">🔗 رابط الدعوة</button>
                </div>
            </div>
        </div>
    `;

    homeEnhBox.innerHTML = `
        <!-- 1. الصندوق الأبيض للهدف الشهري فوق الطيّة (إجابة: كم بقي لي لأتأهل؟) -->
        <div class="target-box-card ${stateCls}" data-spec-id="member-home-target-box" style="background:#ffffff;border:1.5px solid #e2e8f0;border-top:4px solid ${stateBadgeBg};border-radius:16px;padding:16px 18px;margin:0 0 12px;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
                <strong style="font-size:1.05rem;color:#0f172a;">🎯 الهدف الشهري لشهر (${monthNum})</strong>
                <div style="display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;">
                    <span style="font-size:0.82rem;font-weight:800;color:#475569;">الحالة:</span>
                    <span style="padding:4px 12px;border-radius:999px;font-size:0.8rem;font-weight:800;background:${stateBadgeBg};color:#ffffff;white-space:nowrap;">${stateBadgeText}</span>
                </div>
            </div>

            <div style="height:12px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:10px;">
                <div style="width:${pct}%;height:100%;background:${stateBadgeBg};border-radius:999px;transition:width 0.35s;"></div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;font-size:0.94rem;color:#0f172a;">
                <div>تم تحقيق <strong>${fmtBiDi(fmtLocalFromUsd(combinedNetUsd))}</strong> من <strong>${fmtBiDi(fmtLocalFromUsd(req))}</strong></div>
                <span style="background:#f1f5f9;color:#0f172a;padding:2px 10px;border-radius:999px;font-size:0.82rem;font-weight:900;">${pct}%</span>
            </div>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:11px 13px;margin-bottom:10px;">
                <div style="font-size:0.8rem;font-weight:800;color:#475569;margin-bottom:6px;">عبارة عن:</div>
                <div style="display:grid;gap:5px;font-size:0.84rem;color:#1e293b;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span>أ) هذا الشهر <small style="color:#64748b;">(ما دخل لخطة الدخل حتى اللحظة)</small>:</span>
                        <strong>${fmtBiDi(fmtLocalFromUsd(monthUsd))}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span>ب) مرحّل من أشهر سابقة <small style="color:#64748b;">(Carry On)</small>:</span>
                        <strong>${fmtBiDi(fmtLocalFromUsd(carryUsd))}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px dashed #cbd5e1;padding-top:6px;margin-top:2px;">
                        <span style="font-weight:800;color:${isQual ? '#047857' : '#b45309'};">باقي للتأهل:</span>
                        <strong style="color:${isQual ? '#047857' : '#b45309'};">${isQual ? 'مكتمل 100% ✅' : fmtBiDi(fmtLocalFromUsd(remainingUsd))}</strong>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:9px 11px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span style="font-size:0.8rem;font-weight:700;color:#166534;">🛒 إجمالي مشترياتك بهذا الشهر</span>
                    <strong style="font-size:0.88rem;color:#064e3b;">${fmtBiDi(grossMonthFormatted)}</strong>
                </div>
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:9px 11px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span style="font-size:0.8rem;font-weight:700;color:#1e40af;">📊 متوسط نسبة الهدف من المشتريات</span>
                    <strong style="font-size:0.88rem;color:#1e3a8a;">${avgPctFormatted}</strong>
                </div>
            </div>
        </div>

        ${queuedOrPendTxs.length > 0 ? `
            <div style="background:#fef2f2;border:1.5px solid #f87171;border-radius:14px;padding:11px 14px;margin:10px 0;color:#7f1d1d;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="font-size:0.9rem;display:block;">⏸️ لديك ${queuedOrPendTxs.length} فاتورة محفوظة بانتظار اعتماد التاجر</strong>
                        <div style="font-size:0.79rem;margin-top:3px;line-height:1.55;">
                            ${queuedOrPendTxs.slice(0, 3).map(qt => `<code dir="ltr">${esc(qt.sw_short_code)}</code> — <b>${esc(qt.merchant_name)}</b> (<span dir="ltr" style="white-space:nowrap;">${Number(qt.total_amount || 0).toFixed(2)} ${esc(qt.currency_code || '')}</span>)`).join(' • ')}
                        </div>
                    </div>
                    <button type="button" onclick="goToPage('myPending')" style="background:#b91c1c;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:800;font-size:0.78rem;cursor:pointer;white-space:nowrap;">⏳ عرض طلباتي المعلقة</button>
                </div>
            </div>
        ` : ''}

        ${newMemberChecklistHtml}

        <!-- شريط العروض الترويجية والحملات الحصرية النشطة (يظهر فقط عند وجود عرض حي) -->
        <div id="memberHomeFlashOffersSlot" style="display:none;"></div>

        <!-- خط سير الدورة الشهرية (1-30 تجميع → 1-14 مراجعة → 15 صرف) -->
        <div class="cycle-timeline-bar" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:8px 12px;margin:10px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;font-size:0.78rem;">
            <span style="font-weight:800;color:#047857;">🟢 1–30 الشهر: تجميع المشتريات والهدف</span>
            <span style="color:#94a3b8;">←</span>
            <span style="font-weight:${isReviewPhase ? '900' : '600'};color:${isReviewPhase ? '#1d4ed8' : '#475569'};">${isReviewPhase ? '🔵' : '⚪'} 1–14 الشهر التالي: المراجعة والمطابقة</span>
            <span style="color:#94a3b8;">←</span>
            <span style="font-weight:${isPayoutDay ? '900' : '600'};color:${isPayoutDay ? '#047857' : '#475569'};">${isPayoutDay ? '💰' : '📅'} يوم 15: إتاحة صرف الأرباح</span>
        </div>

        <!-- 1.5 خطوة اليوم + نبض شجرتي (إجابة سؤالي: ماذا أفعل اليوم؟ + ما الجديد في شجرتي؟) -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:12px;margin:12px 0;">
            <div data-spec-id="member-home-today-action" style="background:#ffffff;border:1.5px solid #cbd5e1;border-top:4px solid #0284c7;border-radius:16px;padding:16px;box-shadow:0 4px 12px rgba(15,23,42,0.04);">
                <div style="font-weight:900;color:#0c4a6e;font-size:0.96rem;margin-bottom:8px;">⚡ خطوة اليوم المقترحة لك</div>
                ${todayActionHtml}
            </div>

            <div data-spec-id="member-home-tree-pulse" id="memberHomeTreePulseCard" style="background:linear-gradient(135deg,#f0fdf4 0%,#ffffff 100%);border:1.5px solid #86efac;border-top:4px solid #10b981;border-radius:16px;padding:16px;box-shadow:0 4px 12px rgba(16,185,129,0.08);">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;">
                    <strong style="color:#065f46;font-size:0.96rem;">🌱 نبض شجرتي — ما الجديد؟</strong>
                    <button type="button" class="btn btn-outline btn-sm" style="padding:3px 10px;font-size:0.74rem;" onclick="goToPage('tree')">🌳 فتح الشجرة</button>
                </div>
                <div id="memberHomeTreePulseBody" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:0.8rem;">
                    <div style="background:#ffffff;border:1px solid #d1fae5;border-radius:10px;padding:8px 10px;">
                        <div style="color:#64748b;font-size:0.72rem;">🆕 منضمون جدد (7 أيام)</div>
                        <strong id="pulseNew7d" style="font-size:1.05rem;color:#047857;">—</strong>
                        <span id="pulseNewMonth" style="font-size:0.72rem;color:#64748b;"></span>
                    </div>
                    <div style="background:#ffffff;border:1px solid #d1fae5;border-radius:10px;padding:8px 10px;">
                        <div style="color:#64748b;font-size:0.72rem;">🛍️ نشطون بعمليات هذا الشهر</div>
                        <strong id="pulseActiveTx" style="font-size:1.05rem;color:#0284c7;">—</strong>
                        <span id="pulseTxCount" style="font-size:0.72rem;color:#64748b;"></span>
                    </div>
                    <div style="background:#ffffff;border:1px solid #d1fae5;border-radius:10px;padding:8px 10px;">
                        <div style="color:#64748b;font-size:0.72rem;">📈 تطور عمولات الشهر</div>
                        <strong id="pulseEstComm" style="font-size:0.98rem;color:#0f172a;">${fmtBiDi(fmtLocalFromUsd(actualTotalUsd))}</strong>
                        <span id="pulseCommDelta" style="font-size:0.72rem;font-weight:800;"></span>
                    </div>
                    <div style="background:#ffffff;border:1px solid #fde68a;border-radius:10px;padding:8px 10px;">
                        <div style="color:#92400e;font-size:0.72rem;">🔥 قريبون من التأهل</div>
                        <strong id="pulseNearQual" style="font-size:1.05rem;color:#d97706;">${orangeTeamCount}</strong>
                        <span style="font-size:0.72rem;color:#64748b;"> عضو</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 2. بطاقة ملخص الأرباح الزمردية الفاخرة (تستبدل البطاقة الصفراء + الحاسبة) -->
        <div data-spec-id="member-home-pending-card" style="background:linear-gradient(135deg,#064e3b 0%,#0f172a 100%);color:#ffffff;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 8px 24px rgba(6,78,59,0.22);border:1px solid rgba(16,185,129,0.38);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
                <strong style="font-size:1.05rem;color:#6ee7b7;">💰 ملخص أرباحك لهذا الشهر (شهر ${monthNum})</strong>
                <button type="button" onclick="goToPage('tree')" style="background:rgba(255,255,255,0.14);color:#ffffff;border:1px solid rgba(255,255,255,0.3);border-radius:999px;padding:5px 14px;font-family:Tajawal,sans-serif;font-size:0.8rem;font-weight:800;cursor:pointer;">🌳 استعرض شجرة العمولات</button>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;">
                <div style="background:rgba(16,185,129,0.14);border:1px solid rgba(52,211,153,0.42);border-radius:12px;padding:14px;">
                    <div style="font-size:0.8rem;color:#a7f3d0;font-weight:800;">💵 أرباح فعلية لهذا الشهر</div>
                    <div style="font-size:1.38rem;font-weight:900;color:#ffffff;margin:6px 0 4px;">
                        ${fmtBiDi(fmtLocalFromUsd(actualTotalUsd))}
                        <span style="font-size:0.78rem;font-weight:700;color:#a7f3d0;">(${fmtBiDi(fmtUsd(actualTotalUsd))})</span>
                    </div>
                    <div style="font-size:0.8rem;color:#e2e8f0;">عن المؤهلين حتى الآن وعددهم: <strong style="color:#6ee7b7;">${greenQualifiedTotalCount}</strong> <small style="color:#cbd5e1;">(الخضر فقط${isQual ? ` — أنت + ${greenTeamCount} بفريقك` : ''})</small></div>
                    ${!isQual && greenTeamCount > 0 ? `<div style="font-size:0.74rem;color:#fde68a;margin-top:4px;">⏳ عمولاتهم (${fmtBiDi(fmtLocalFromUsd(actualMonthUsd))}) تُصرف فور إكمال هدفك</div>` : ''}
                </div>

                <div style="background:rgba(245,158,11,0.14);border:1px solid rgba(251,191,36,0.42);border-radius:12px;padding:14px;">
                    <div style="font-size:0.8rem;color:#fde68a;font-weight:800;">🚀 أرباح متوقعة شاملة الذين بدأوا</div>
                    <div style="font-size:1.38rem;font-weight:900;color:#ffffff;margin:6px 0 4px;">
                        ${fmtBiDi(fmtLocalFromUsd(expectedTotalInclAllUsd))}
                        <span style="font-size:0.78rem;font-weight:700;color:#fde68a;">(${fmtBiDi(fmtUsd(expectedTotalInclAllUsd))})</span>
                    </div>
                    <div style="font-size:0.8rem;color:#e2e8f0;">وعددهم: <strong style="color:#fde68a;">${orangeTeamCount}</strong> <small style="color:#cbd5e1;">(البرتقاليون فقط)</small></div>
                    <div style="font-size:0.73rem;color:#cbd5e1;margin-top:4px;">تشمل أرباح الخضر + البرتقاليين + عمولتك عند إكمال هدفك</div>
                </div>

                <div style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:14px;">
                    <div style="font-size:0.8rem;color:#cbd5e1;font-weight:800;">💎 حصتك عن كل مؤهل في فريقك:</div>
                    <div style="font-size:1.38rem;font-weight:900;color:#6ee7b7;margin:6px 0 4px;">
                        ${fmtBiDi(fmtLocalFromUsd(unitShareUsd))}
                        <span style="font-size:0.78rem;font-weight:700;color:#e2e8f0;">(${fmtBiDi(fmtUsd(unitShareUsd))})</span>
                    </div>
                    <div style="font-size:0.78rem;color:#cbd5e1;">قيمة الهدف الشهري ÷ ${homePlan.s02} أجيال</div>
                </div>
            </div>
        </div>

        <!-- 3. رادار متابعة فريقك (القريبون من التأهل في نطاق عمولتك) -->
        <div data-spec-id="member-home-team-radar" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 4px 14px rgba(15,23,42,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
                <div>
                    <strong style="font-size:0.98rem;color:#0f172a;display:block;">📡 رادار متابعة فريقك (القريبون من التأهل)</strong>
                    <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">يعرض أعضاء فريقك ضمن أول 10 أجيال في نطاق عمولتك الذين بدأوا الشراء هذا الشهر (القريبون من التأهل أولاً ثم المؤهلون) لتشجيعهم بضغطة زر.</div>
                </div>
                <button type="button" onclick="goToPage('tree')" class="btn btn-outline btn-sm" style="padding:4px 11px;font-size:0.76rem;white-space:nowrap;">عرض الشجرة كاملة</button>
            </div>
            ${teamRadar.length === 0
                ? `<div style="padding:12px;background:#f8fafc;border-radius:10px;color:#64748b;font-size:0.83rem;">لا يوجد أعضاء بدأوا الشراء ضمن أول 10 أجيال في شجرتك هذا الشهر حتى الآن.</div>`
                : `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px;">
                    ${teamRadar.map(n => {
                        const wa = n.phone_visible && n.phone ? String(n.phone).replace(/\D/g, '') : '';
                        const msg = encodeURIComponent(`أهلاً ${n.full_name} 🌟 تقدمك في الهدف الشهري على SAWYAN ممتاز (${Number(n.target_pct || 0)}%).`);
                        return `
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:${n.node_color === 'GREEN' ? '#ecfdf5' : '#fffbeb'};border:1px solid ${n.node_color === 'GREEN' ? '#a7f3d0' : '#fde68a'};border-radius:10px;padding:8px 11px;font-size:0.81rem;">
                                <div>
                                    <strong>#${n.member_code} ${esc(n.full_name)}</strong>
                                    <div style="color:#475569;font-size:0.75rem;">${n.node_color === 'GREEN' ? '🟢 مؤهل' : '🟠 جاري التجميع'} • ${esc(n.structural_me)} • ${Number(n.target_pct || 0)}%</div>
                                </div>
                                ${wa ? `<a href="https://wa.me/${wa}?text=${msg}" target="_blank" style="background:#16a34a;color:#fff;padding:4px 10px;border-radius:8px;text-decoration:none;font-weight:800;font-size:0.75rem;white-space:nowrap;">💬 واتساب</a>` : '<span style="color:#64748b;font-size:0.74rem;white-space:nowrap;">🔒 محمي</span>'}
                            </div>
                        `;
                    }).join('')}
                </div>`}
        </div>
    `;

    // ترطيب شريط العروض الترويجية الحصرية النشطة + بوب-أب التنبيه لمرة واحدة
    renderMemberHomeFlashOffersBanner();
    if (!liveFlashOffers.length) {
        loadPublicFlashOffersSafe();
    } else {
        maybeShowFlashOfferSpotlightPopup();
    }

    // ترطيب حي لبطاقة «نبض شجرتي» من الخادم دون إبطاء تحميل الصفحة الرئيسية
    if (window.SAWYAN?.TreeStudio?.fetchPulseOnly) {
        window.SAWYAN.TreeStudio.fetchPulseOnly().then(res => {
            const p = res && res.tree_pulse;
            if (!p) return;
            const n7 = document.getElementById('pulseNew7d');
            const nm = document.getElementById('pulseNewMonth');
            const act = document.getElementById('pulseActiveTx');
            const txc = document.getElementById('pulseTxCount');
            const est = document.getElementById('pulseEstComm');
            const del = document.getElementById('pulseCommDelta');
            const nq = document.getElementById('pulseNearQual');
            if (n7) n7.textContent = String(Number(p.new_members_7d || 0));
            if (nm) nm.textContent = ` (الشهر: ${Number(p.new_members_month || 0)})`;
            if (act) act.textContent = String(Number(p.active_transactors_month || 0));
            if (txc) txc.textContent = ` (${Number(p.tx_count_month || 0)} عملية)`;
            const estUsd = Number(p.estimated_month_commission_usd || 0);
            if (est && estUsd > 0) est.innerHTML = fmtBiDi(fmtLocalFromUsd(estUsd));
            if (del) {
                const dp = Number(p.commission_delta_pct || 0);
                if (dp > 0) { del.style.color = '#059669'; del.textContent = ` ▲ +${dp}%`; }
                else if (dp < 0) { del.style.color = '#dc2626'; del.textContent = ` ▼ ${dp}%`; }
                else { del.style.color = '#64748b'; del.textContent = ' • مستقر'; }
            }
            if (nq && p.near_qualification_count !== undefined) nq.textContent = String(Number(p.near_qualification_count || 0));
        }).catch(() => {});
    }

    renderPendingReturnRequestsCard(homeEnhBox);
    renderMemberProfileCompletionBanner();

    // كود QR الثابت للهوية عند الكاشير (البند المجمّد #1: بدون TOTP 60s)
    const qrContainer = document.getElementById('qrCode');
    if (qrContainer && window.QRCode) {
        qrContainer.innerHTML = '';
        const barcodePayload = (window.SAWYAN && window.SAWYAN.PaymentService)
            ? window.SAWYAN.PaymentService.generateOfflineQR(profile.id, profile.member_code)
            : `SAWYAN:MEMBER:${profile.member_code}`;
        new QRCode(qrContainer, {
            text: barcodePayload,
            width: 112,
            height: 112,
            colorDark: '#047857',
            colorLight: '#ffffff'
        });
    }

    const list = document.getElementById('recentTransactionsList');
    if (list) {
        if (!txs.length) {
            list.innerHTML = '<p class="empty-state">لا توجد عمليات مسجلة حتى الآن.</p>';
        } else {
            list.innerHTML = txs.slice(0, 5).map(t => {
                const stBadge = fmtMemberTxStatusBadge(t);
                return `
                <div class="transaction-item" style="flex-wrap:wrap;gap:8px;">
                    <div class="transaction-info">
                        <div class="transaction-merchant">${esc(t.merchant_name)} — <small>${esc(t.sw_short_code)}</small></div>
                        <div class="transaction-date">${new Date(t.created_at).toLocaleDateString(getMemLocale())} • <span style="padding:1px 7px;border-radius:999px;font-size:0.74rem;font-weight:800;background:${stBadge.bg};color:${stBadge.color};">${stBadge.label}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <div class="transaction-amount">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                        ${t.merchant_id ? `<button type="button" class="btn btn-outline btn-sm" style="padding:3px 9px;font-size:0.74rem;white-space:nowrap;" onclick="openQuickRepeatPurchase('${esc(t.merchant_id)}', '${esc(t.merchant_name || '')}', '${esc(t.currency_code || '')}')">🧾 توثيق جديد</button>` : ''}
                    </div>
                </div>
            `; }).join('');
        }
    }
}

window.openQuickRepeatPurchase = async function (merchantId, merchantName = '', currencyCode = '') {
    if (!merchantId) {
        openMemberPurchaseModal();
        return;
    }
    if (!Array.isArray(liveCatalog) || liveCatalog.length === 0) {
        await loadPublicMerchantsCatalogSafe();
    }
    const match = (Array.isArray(liveCatalog) ? liveCatalog : []).find(m => String(m.merchant_id) === String(merchantId));
    openMemberPurchaseModal(
        merchantId,
        match ? (match.branch_id || null) : null,
        (match && match.business_name) || merchantName || '',
        (match && match.currency_code) || currencyCode || '',
        match ? Number(match.plan_cashback_pct || 7.5) : null
    );
};

// ---------------------------------------------------------------------------
// Screen 2: My Pending & Awaiting Top-Up (Path B + FIFO + Cancel Pending)
// ---------------------------------------------------------------------------
const SW_MEM_PAYMENT_TYPES = [
    { value: 'cash', label: '💵 نقدي في المحل (Cash)', needsRef: false, deferred: false },
    { value: 'pos_card', label: '💳 بطاقة بنكية POS (RRN)', needsRef: true, deferred: false },
    { value: 'instant_transfer', label: '⚡ تحويل فوري (FAST / InstaPay / STC)', needsRef: true, deferred: false },
    { value: 'iban_swift_sepa', label: '🏦 تحويل بنكي IBAN / SWIFT', needsRef: true, deferred: false },
    { value: 'digital_wallet', label: '📱 محفظة إلكترونية', needsRef: true, deferred: false },
    { value: 'payment_gateway', label: '🌐 بوابة دفع إلكتروني', needsRef: true, deferred: false },
    { value: 'bnpl', label: '🗓️ تقسيط (Tabby / Tamara)', needsRef: true, deferred: false },
    { value: 'cheque', label: '🧾 شيك بنكي (مؤجل التحصيل)', needsRef: true, deferred: true },
    { value: 'cod', label: '🚚 دفع عند الاستلام / دليفري (COD)', needsRef: true, deferred: true },
    { value: 'marketplace_escrow', label: '🛡️ ضامن سوق إلكتروني (Escrow)', needsRef: true, deferred: false }
];

function getMemberPayTypeMeta(pt) {
    return SW_MEM_PAYMENT_TYPES.find(x => x.value === pt) || SW_MEM_PAYMENT_TYPES[0];
}

function fmtMemberPayTypeLabel(pt) {
    return getMemberPayTypeMeta(pt).label;
}

function loadMyPendingRequests() {
    const page = document.getElementById('myPendingPage');
    if (!page || !memberBundle) return;
    const pending = (memberBundle.transactions || []).filter(t => t.status === 'pending' || t.status === 'awaiting_merchant_topup');
    const byMerchantCounts = {};
    pending.filter(t => t.status === 'pending').forEach(t => {
        const key = String(t.merchant_name || t.merchant_id || 'merchant');
        byMerchantCounts[key] = (byMerchantCounts[key] || 0) + 1;
    });
    const maxAtSingleMerchant = Object.values(byMerchantCounts).reduce((a, b) => Math.max(a, b), 0);
    const totalPendingUsd = pending.reduce((s, t) => s + Number(t.expected_income_plan_share_usd ?? t.income_plan_share_usd ?? 0), 0);

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
            <h2>⏳ طلباتي المعلقة</h2>
            <button type="button" class="btn btn-primary btn-sm" onclick="openMemberPurchaseModal()">+ توثيق فاتورة شراء جديدة</button>
        </div>
        <div data-spec-id="member-pending-limit-meter" style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:14px 16px;margin-bottom:16px;font-size:0.86rem;color:#1e3a8a;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
                ℹ️ <strong>سقف الطلبات قيد المراجعة:</strong> يمكنك إرسال حتى <strong>طلبين معلقين (2)</strong> عند نفس المتجر في الوقت نفسه لحين اعتماد التاجر.
                <div style="margin-top:4px;font-size:0.8rem;">صافي خطة الدخل المتوقع عند الاعتماد: <strong>${esc(fmtLocalFromUsd(totalPendingUsd))}</strong> (${fmtUsd(totalPendingUsd)})</div>
            </div>
            <div style="background:#ffffff;border:1.5px solid #93c5fd;border-radius:10px;padding:8px 14px;text-align:center;">
                <div style="font-size:0.74rem;color:#475569;">أعلى إشغال عند تاجر</div>
                <strong style="font-size:1.1rem;color:${maxAtSingleMerchant >= 2 ? '#dc2626' : '#1d4ed8'};">${maxAtSingleMerchant} / 2</strong>
            </div>
        </div>
        <div data-spec-id="member-pending-list">
            ${pending.length === 0 ? '<p class="empty-state">لا توجد فواتير معلقة حالياً.</p>' : `
                <div style="display:grid;gap:12px;">
                    ${pending.map(t => {
                        const expShare = Number(t.expected_income_plan_share_local ?? t.income_plan_share_local ?? 0);
                        const thumb = (t.receipt_media_url && window.SAWYAN?.ImageUpload)
                            ? window.SAWYAN.ImageUpload.renderThumbHtml(t.receipt_media_url, '🧾 إيصال ' + esc(t.sw_short_code))
                            : '';
                        return `
                        <div style="background:#fff;border:1.5px solid ${t.status === 'awaiting_merchant_topup' ? '#ef4444' : '#f59e0b'};border-radius:14px;padding:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                            <div>
                                <strong style="font-size:1rem;">${esc(t.merchant_name)}</strong> (${esc(t.branch_name || 'الفرع الرئيسي')})
                                <div style="font-size:0.84rem;color:#64748b;">الكود: <code>${esc(t.sw_short_code)}</code> • ${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                                <div style="font-size:0.78rem;color:#334155;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                                    <span style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-weight:700;">${esc(fmtMemberPayTypeLabel(t.payment_type))}</span>
                                    ${t.unique_payment_ref ? `<span>مرجع: <code dir="ltr">${esc(t.unique_payment_ref)}</code></span>` : ''}
                                </div>
                                <div style="font-size:0.8rem;color:#047857;margin-top:3px;">العائد المتوقع لخطة الدخل عند الاعتماد: ${expShare.toFixed(2)} ${esc(t.currency_code)}</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                ${thumb}
                                <div style="text-align:left;">
                                    <div style="font-weight:900;font-size:1.05rem;">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                                    <span style="font-size:0.78rem;font-weight:800;padding:2px 8px;border-radius:999px;background:${t.status === 'awaiting_merchant_topup' ? '#fee2e2' : '#fef3c7'};color:${t.status === 'awaiting_merchant_topup' ? '#991b1b' : '#92400e'};">
                                        ${t.status === 'awaiting_merchant_topup' ? '⏸️ بانتظار استكمال اعتماد التاجر' : '⏳ بانتظار موافقة التاجر'}
                                    </span>
                                </div>
                                ${t.status === 'pending' ? `<button type="button" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;" onclick="cancelPendingPurchaseAction('${esc(t.id)}','${esc(t.sw_short_code)}')">✖ إلغاء الطلب</button>` : ''}
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

window.cancelPendingPurchaseAction = async function (txId, shortCode) {
    const ok = await swMemConfirm('إلغاء الطلب المعلق', `هل تريد إلغاء طلب الفاتورة المعلقة (${shortCode})؟`, true);
    if (!ok) return;
    try {
        await window.SAWYAN.API.cancelMemberPendingPurchase({
            memberId: currentMember.id,
            transactionId: txId
        });
        swMemToast(`تم إلغاء الطلب المعلق (${shortCode}) بنجاح.`, 'success');
        await refreshDashboardBundle();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
};

// ---------------------------------------------------------------------------
// Screen 3: Completed & Reversed Transactions + Country & Period Tabs + D5 + Disputes (D6) + S10
// ---------------------------------------------------------------------------
function loadAllTransactions() {
    const page = document.getElementById('transactionsPage');
    if (!page || !memberBundle) return;
    const txs = memberBundle.transactions || [];
    const disputes = memberBundle.disputes || [];
    const gouging = memberBundle.price_gouging_reports || [];
    const archive = memberBundle.closed_months_archive || [];

    const currencies = Array.from(new Set(txs.map(t => String(t.currency_code || '')).filter(Boolean)));
    const filteredTxs = txs.filter(t => {
        if (txFilterState.country !== 'ALL' && String(t.currency_code || '') !== txFilterState.country) return false;
        return true;
    });
    const homePlan = getCountryPlanInfo(memberBundle?.profile?.country_code);
    const txPlan = txFilterState.country === 'ALL'
        ? homePlan
        : { ...homePlan, currencyCode: txFilterState.country };
    const txStats = computeMonthlyPurchaseStats(filteredTxs, null, txPlan);

    page.innerHTML = `
        <h2>💳 العمليات المكتملة والفواتير الموثقة (${txs.length})</h2>

        <div data-spec-id="member-tx-d5-banner" style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:14px;padding:12px 16px;margin:12px 0;font-size:0.84rem;color:#9a3412;">
            🔒 <strong>قاعدة المراجعة والإقفال الشهري:</strong> جميع الفواتير تخضع لنافذة <strong>14 يوماً</strong> لمصافحة المرتجع عبر رمز التحقق أو الموافقة قبل اعتماد الإقفال وصرف يوم <strong>15</strong> نهائياً بلا أي خصم سلبي على الأعضاء.
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
            <div data-spec-id="member-tx-period-tabs" style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="lens-pill-btn ${txFilterState.period === 'open' ? 'active' : ''}" onclick="setTxPeriodTab('open')">📅 الشهر المفتوح (${filteredTxs.length})</button>
                <button type="button" class="lens-pill-btn ${txFilterState.period === 'closed' ? 'active' : ''}" onclick="setTxPeriodTab('closed')">🗄️ أرشيف الشهور المغلقة (${archive.length})</button>
            </div>
            <div data-spec-id="member-tx-country-tabs" style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="lens-pill-btn ${txFilterState.country === 'ALL' ? 'active' : ''}" onclick="setTxCountryTab('ALL')">🌐 كل العملات</button>
                ${currencies.map(cur => `<button type="button" class="lens-pill-btn ${txFilterState.country === cur ? 'active' : ''}" onclick="setTxCountryTab('${esc(cur)}')">${esc(cur)}</button>`).join('')}
            </div>
        </div>

        ${txFilterState.period === 'open' ? `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-bottom:14px;">
                <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:11px 14px;">
                    <div style="font-size:0.78rem;color:#475569;font-weight:700;">🛒 إجمالي المشتريات المكتملة (${txStats.count} فاتورة)</div>
                    <strong style="font-size:1.02rem;color:#0f172a;display:block;margin-top:3px;">${fmtBiDi(`${txStats.grossLocal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${txPlan.currencyCode}`)}</strong>
                </div>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:11px 14px;">
                    <div style="font-size:0.78rem;color:#166534;font-weight:700;">🎯 ما دخل لخطة الدخل</div>
                    <strong style="font-size:1.02rem;color:#065f46;display:block;margin-top:3px;">${fmtBiDi(`${txStats.planShareLocal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${txPlan.currencyCode}`)}</strong>
                </div>
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:11px 14px;">
                    <div style="font-size:0.78rem;color:#1e40af;font-weight:700;">📊 متوسط نسبة الهدف من المشتريات</div>
                    <strong style="font-size:1.02rem;color:#1e3a8a;display:block;margin-top:3px;">${txStats.grossLocal > 0 ? `${txStats.weightedAvgPct.toFixed(1)}%` : '0%'}</strong>
                </div>
            </div>
        ` : ''}

        <div data-spec-id="member-tx-list">
            ${txFilterState.period === 'closed'
                ? (archive.length === 0
                    ? '<p class="empty-state">لا توجد دورات إقفال شهرية سابقة مغلقة حتى الآن.</p>'
                    : `<div class="table-responsive-wrap"><table class="data-table"><thead><tr><th>الشهر</th><th>الدولة</th><th>الهدف المحقق ($)</th><th>العمولة المصروفة ($)</th><th>كاري أون مرحّل ($)</th><th>الحالة</th></tr></thead><tbody>${archive.map(a => `
                        <tr>
                            <td data-label="الشهر"><strong>${esc(a.period_ym)}</strong></td>
                            <td data-label="الدولة">${esc(a.country_code)} (${esc(a.currency_code)})</td>
                            <td data-label="الهدف المحقق ($)">${fmtUsd(a.target_consumed_usd)} / ${fmtUsd(a.target_required_usd)}</td>
                            <td data-label="العمولة المصروفة ($)"><strong style="color:#047857;">${fmtUsd(Number(a.commission_earned_usd || 0) + Number(a.surplus_earned_usd || 0))}</strong></td>
                            <td data-label="كاري أون مرحّل ($)">${fmtUsd(a.carry_on_out_usd)}</td>
                            <td data-label="الحالة">${a.is_hard_locked ? '🔒 مقفل ومصروف' : `مرحلة ${a.step_status}/6`}</td>
                        </tr>`).join('')}</tbody></table></div>`)
                : (filteredTxs.length === 0 ? '<p class="empty-state">لا توجد معاملات مسجلة مطابقة للفلتر.</p>' : `
                    <div style="display:grid;gap:12px;">
                        ${filteredTxs.map(t => {
                            const shareLocal = t.status === 'completed'
                                ? Number(t.income_plan_share_local || 0)
                                : Number(t.expected_income_plan_share_local ?? t.income_plan_share_local ?? 0);
                            const invPct = Number(t.total_amount || 0) > 0
                                ? ((shareLocal / Number(t.total_amount)) * 100).toFixed(1)
                                : '0.0';
                            const thumb = (t.receipt_media_url && window.SAWYAN?.ImageUpload)
                                ? window.SAWYAN.ImageUpload.renderThumbHtml(t.receipt_media_url, '🧾 إيصال ' + esc(t.sw_short_code))
                                : '';
                            return `
                            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:16px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                    <div>
                                        <strong>${esc(t.merchant_name)}</strong> — <small>${esc(t.branch_name)}</small>
                                        <div style="font-size:0.82rem;color:#64748b;"><code>${esc(t.sw_short_code)}</code> • ${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                                        <div style="font-size:0.76rem;color:#475569;margin-top:3px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                                            <span style="background:#f1f5f9;padding:2px 7px;border-radius:6px;font-weight:700;">${esc(fmtMemberPayTypeLabel(t.payment_type))}</span>
                                            ${t.unique_payment_ref ? `<span>مرجع: <code dir="ltr">${esc(t.unique_payment_ref)}</code></span>` : ''}
                                        </div>
                                    </div>
                                    <div style="text-align:left;">
                                        <div style="font-weight:800;">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                                        <div style="font-size:0.8rem;color:#047857;">${t.status === 'completed' ? 'عائد خطة الدخل المضاف:' : 'العائد المتوقع عند الاعتماد:'} ${shareLocal.toFixed(2)} ${esc(t.currency_code)} <strong style="color:#1e40af;">(${invPct}% للهدف)</strong></div>
                                    </div>
                                </div>
                                <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                        ${(() => { const sb = fmtMemberTxStatusBadge(t); return `<span style="font-size:0.8rem;font-weight:800;padding:3px 10px;border-radius:999px;background:${sb.bg};color:${sb.color};">${sb.label}</span>`; })()}
                                        ${thumb}
                                    </div>
                                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                        ${t.status === 'completed' ? `<button type="button" class="btn btn-outline btn-sm" onclick="openReviewModal('${t.id}', '${esc(t.merchant_name)}')">⭐ تقييم</button>` : ''}
                                        <button type="button" class="btn btn-outline btn-sm" onclick="openDisputeModal('${t.id}', '${esc(t.sw_short_code)}')">⚠️ نزاع ثلاثي (48h)</button>
                                        <button type="button" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;" onclick="openPriceGougingModal('${t.id}', '${esc(t.merchant_name)}', '${Number(t.total_amount).toFixed(2)}')">🚨 بلاغ رفع سعر (S10)</button>
                                    </div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                `)}
        </div>
        ${disputes.length > 0 ? `
            <h3 style="margin-top:24px;">⚠️ تذاكر النزاعات المفتوحة (${disputes.length})</h3>
            <div style="display:grid;gap:8px;margin-top:8px;">
                ${disputes.map(d => `
                    <div style="background:#fff7ed;border:1px solid #fdba74;border-radius:10px;padding:12px;">
                        <strong>${esc(d.merchant_name)}</strong> — <small>${esc(d.status)}</small>
                        <div style="font-size:0.85rem;color:#7c2d12;">${esc(d.dispute_reason)}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
        ${gouging.length > 0 ? `
            <h3 style="margin-top:20px;">🚨 بلاغات رادار رفع الأسعار S10 (${gouging.length})</h3>
            <div style="display:grid;gap:8px;margin-top:8px;">
                ${gouging.map(g => `
                    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px;">
                        <strong>${esc(g.merchant_name)}</strong> — <small>${esc(g.verification_status)}</small>
                        <div style="font-size:0.84rem;color:#991b1b;">سعر الرف المعلن: ${Number(g.declared_price).toFixed(2)} | المحصّل: ${Number(g.charged_price).toFixed(2)}</div>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;
}

window.setTxPeriodTab = function (period) {
    txFilterState.period = period;
    loadAllTransactions();
};
window.setTxCountryTab = function (cc) {
    txFilterState.country = cc;
    loadAllTransactions();
};

function openReviewModal(txId, merchantName) {
    openMemberModal(`⭐ تقييم تجربة الشراء لدى ${esc(merchantName)}`, `
        <div>
            <label style="font-weight:700;font-size:0.88rem;">درجة التقييم (من 1 إلى 5 نجوم)</label>
            <select name="rating" class="form-control" style="margin-top:4px;">
                <option value="5" selected>⭐⭐⭐⭐⭐ ممتاز (5)</option>
                <option value="4">⭐⭐⭐⭐ جيد جداً (4)</option>
                <option value="3">⭐⭐⭐ متوسط (3)</option>
                <option value="2">⭐⭐ مقبول (2)</option>
                <option value="1">⭐ ضعيف (1)</option>
            </select>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">تعليقك (اختياري)</label>
            <textarea name="comment" rows="3" class="form-control" placeholder="اكتب ملاحظتك حول جودة الخدمة..."></textarea>
        </div>
    `, async (form, close) => {
        const rating = parseInt(form.rating.value, 10) || 5;
        const comment = form.comment.value.trim() || null;
        await window.SAWYAN.API.submitMemberReview({ memberId: currentMember.id, transactionId: txId, rating, comment });
        close();
        await refreshDashboardBundle();
    });
}

function renderPendingReturnRequestsCard(anchorEl) {
    let wrap = document.getElementById('memberPendingReturnRequestsCard');
    const reqs = Array.isArray(memberBundle && memberBundle.pending_return_requests) ? memberBundle.pending_return_requests : [];
    if (!reqs.length) {
        if (wrap) wrap.innerHTML = '';
        return;
    }
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'memberPendingReturnRequestsCard';
        if (anchorEl && anchorEl.parentNode) {
            anchorEl.parentNode.insertBefore(wrap, anchorEl.nextSibling);
        }
    }
    const notifs = Array.isArray(memberBundle.notifications) ? memberBundle.notifications : [];
    wrap.innerHTML = `
        <div style="background:#fff7ed;border:2px solid #f97316;border-radius:16px;padding:16px;margin:12px 0;box-shadow:0 4px 14px rgba(249,115,22,0.12);">
            <h3 style="margin:0 0 8px 0;color:#9a3412;font-size:1rem;">↩️ طلبات مصافحة مرتجع تنتظر تأكيدك (${reqs.length})</h3>
            <p style="font-size:0.82rem;color:#7c2d12;margin:0 0 10px 0;">لا توافق إلا بعد معاينة الأثر على صندوق هدفك الشهري واستلام قيمة الفاتورة المرتجعة فعلياً من التاجر.</p>
            <div style="display:grid;gap:10px;">
                ${reqs.map(r => {
                    const otpNotif = notifs.find(n => n.event_name === 'PosReturnOtpRequested' && n.payload && n.payload.return_request_id === r.id);
                    const otpCode = otpNotif && otpNotif.payload ? otpNotif.payload.otp_code : null;
                    return `
                        <div style="background:#ffffff;border:1px solid #fdba74;border-radius:12px;padding:12px;display:grid;gap:8px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div>
                                    <strong>${esc(r.merchant_name)}</strong> — <code>${esc(r.sw_short_code)}</code>
                                    <div style="font-size:0.8rem;color:#64748b;">السبب: ${esc(r.reason)}</div>
                                </div>
                                <div style="font-weight:900;color:#0f172a;">${Number(r.total_amount).toFixed(2)} ${esc(r.currency_code)}</div>
                            </div>
                            ${otpCode ? `<div style="background:#ecfdf5;border:1px dashed #10b981;border-radius:8px;padding:8px 12px;font-size:0.86rem;color:#065f46;">🔐 رمز <strong>OTP</strong> لتزويد الكاشير عند الموافقة: <strong style="font-size:1.1rem;letter-spacing:3px;">${esc(otpCode)}</strong></div>` : ''}
                            <div id="retImpactBox_${esc(r.id)}" style="font-size:0.82rem;color:#334155;"></div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button type="button" class="btn btn-outline btn-sm" onclick="svPreviewReturnImpact('${esc(r.transaction_id)}','${esc(r.id)}')">📊 معاينة الأثر على الهدف (S08)</button>
                                <button type="button" class="btn btn-primary btn-sm" onclick="svRespondReturnRequest('${esc(r.id)}','approve')">✅ موافقة وإلغاء الفاتورة</button>
                                <button type="button" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;" onclick="svRespondReturnRequest('${esc(r.id)}','reject')">❌ رفض المرتجع</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

window.svPreviewReturnImpact = async function (txId, reqId) {
    const box = document.getElementById(`retImpactBox_${reqId}`);
    try {
        const res = await window.SAWYAN.API.previewPosReturnImpact({ memberId: currentMember.id, transactionId: txId });
        if (!box) return;
        box.innerHTML = `
            <div style="background:${res.stays_qualified ? '#ecfdf5' : '#fef2f2'};border:1px solid ${res.stays_qualified ? '#6ee7b7' : '#fca5a5'};border-radius:8px;padding:8px 10px;">
                • الرصيد قبل/بعد: <strong>${fmtLocalFromUsd(res.box_before_usd)}</strong> ← <strong>${fmtLocalFromUsd(res.box_after_usd)}</strong>
                • التأهل: <strong>${res.stays_qualified ? '✅ يظل مؤهلاً' : `⚠️ يسقط التأهل (ينقص ${fmtLocalFromUsd(res.shortfall_to_requalify_usd)})`}</strong>
                ${res.carry_on_shield_used ? ' • 🛡️ <strong>درع الكاري أون يغطي العجز!</strong>' : ''}
            </div>
        `;
    } catch (err) {
        if (box) box.textContent = '❌ ' + err.message;
    }
};

window.svRespondReturnRequest = async function (reqId, decision) {
    try {
        const res = await window.SAWYAN.API.memberRespondPosReturn({ memberId: currentMember.id, returnRequestId: reqId, decision });
        swMemToast(decision === 'approve'
            ? 'تم تأكيد المرتجع وإلغاء الفاتورة وتحديث صندوق هدفك.'
            : 'تم تسجيل رفضك لطلب المرتجع.', 'info');
        if (res) await refreshDashboardBundle();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
};

function openDisputeModal(txId, shortCode) {
    let disputeUp = null;
    openMemberModal(`⚠️ فتح تذكرة نزاع ثلاثي للفاتورة ${esc(shortCode)}`, `
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px;font-size:0.82rem;color:#9a3412;">
            تُمنح مهلة حل ودي <strong>48 ساعة</strong> للتاجر قبل التصعيد التلقائي لفريق التحكيم (<code>D6</code>).
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">تصنيف النزاع *</label>
            <select name="category" id="dmDisputeCat" class="form-control">
                <option value="general">نزاع عام / جودة خدمة</option>
                <option value="return_stalled">↩️ تعثر تنفيذ مرتجع خلال الـ 14 يوماً</option>
                <option value="pending_rejected">رفض فاتورة معلقة صحيحة</option>
                <option value="amount_mismatch">اختلاف قيمة الفاتورة</option>
            </select>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">صورة إثبات / إيصال إرجاع (إلزامي عند تعثر المرتجع)</label>
            <div id="dmEvidenceUploader"></div>
            <input type="hidden" name="evidenceUrl" id="dmEvidenceUrl">
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">تفاصيل المشكلة *</label>
            <textarea name="reason" required rows="3" class="form-control" placeholder="اشرح سبب الاعتراض أو خطأ القيمة..."></textarea>
        </div>
    `, async (form, close) => {
        const cat = form.category.value;
        const evUrl = ((disputeUp && disputeUp.getValue()) || form.evidenceUrl.value || '').trim() || null;
        if (cat === 'return_stalled' && !evUrl) {
            throw new Error('يرجى رفع صورة إثبات / إيصال المرتجع لتوثيق نزاع المرتجع.');
        }
        await window.SAWYAN.API.submitMemberDispute({
            memberId: currentMember.id,
            transactionId: txId,
            reason: form.reason.value.trim(),
            category: cat,
            evidenceUrl: evUrl
        });
        close();
        await refreshDashboardBundle();
    });
    if (window.SAWYAN?.ImageUpload) {
        disputeUp = window.SAWYAN.ImageUpload.mountUploader(document.getElementById('dmEvidenceUploader'), {
            label: '📷 رفع صورة إثبات النزاع / المرتجع',
            maxDim: 1280,
            maxChars: 360000,
            onChange: (v) => { const el = document.getElementById('dmEvidenceUrl'); if (el) el.value = v || ''; }
        });
    }
}

function openPriceGougingModal(txId, merchantName, txAmount) {
    let shelfUp = null;
    let recUp = null;
    openMemberModal(`🚨 بلاغ رفع سعر تمييزي — ${esc(merchantName)} (S10)`, `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;font-size:0.82rem;color:#991b1b;">
            يُحظر على التاجر رفع السعر على عضو SAWYAN مقارنة بالسعر المعلن للجمهور (<code>S10</code>). عند توثيق 3 بلاغات يُطلق النظام إشارة رقابية آلية.
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;">
            <div>
                <label style="font-weight:700;font-size:0.84rem;">السعر المعلن على الرف *</label>
                <input type="number" step="0.01" min="0.01" name="declaredPrice" required class="form-control" placeholder="100.00">
            </div>
            <div>
                <label style="font-weight:700;font-size:0.84rem;">السعر المحصّل منك *</label>
                <input type="number" step="0.01" min="0.01" name="chargedPrice" required class="form-control" value="${esc(txAmount)}">
            </div>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.84rem;">صورة سعر الرف المعلن * (إلزامي)</label>
            <div id="pgShelfUploader"></div>
            <input type="hidden" name="shelfPhotoUrl" id="pgShelfUrl">
        </div>
        <div>
            <label style="font-weight:700;font-size:0.84rem;">صورة الإيصال المدفوع * (إلزامي)</label>
            <div id="pgReceiptUploader"></div>
            <input type="hidden" name="receiptUrl" id="pgReceiptUrl">
        </div>
    `, async (form, close) => {
        const shelfPhotoUrl = ((shelfUp && shelfUp.getValue()) || form.shelfPhotoUrl.value || '').trim();
        const receiptUrl = ((recUp && recUp.getValue()) || form.receiptUrl.value || '').trim();
        if (!shelfPhotoUrl || !receiptUrl) {
            throw new Error('يرجى رفع صورتَي سعر الرف والإيصال المدفوع أولاً.');
        }
        await window.SAWYAN.API.submitPriceGougingReport({
            memberId: currentMember.id,
            transactionId: txId,
            declaredPrice: Number(form.declaredPrice.value),
            chargedPrice: Number(form.chargedPrice.value),
            shelfPhotoUrl,
            receiptUrl
        });
        close();
        await refreshDashboardBundle();
    });
    if (window.SAWYAN?.ImageUpload) {
        shelfUp = window.SAWYAN.ImageUpload.mountUploader(document.getElementById('pgShelfUploader'), {
            label: '📸 رفع صورة سعر الرف / القائمة المعلنة *',
            maxDim: 1280,
            maxChars: 340000,
            onChange: (v) => { const el = document.getElementById('pgShelfUrl'); if (el) el.value = v || ''; }
        });
        recUp = window.SAWYAN.ImageUpload.mountUploader(document.getElementById('pgReceiptUploader'), {
            label: '🧾 رفع صورة الإيصال المدفوع *',
            maxDim: 1280,
            maxChars: 340000,
            onChange: (v) => { const el = document.getElementById('pgReceiptUrl'); if (el) el.value = v || ''; }
        });
    }
}

// ---------------------------------------------------------------------------
// Screen 4: International Binary Tree + Google Earth 2D Pan/Zoom + HUD + Country Reports + 10-Gen Radar + Smart Table
// ---------------------------------------------------------------------------
function loadTree() {
    const page = document.getElementById('treePage');
    if (!page || !memberBundle) return;

    // Phase 2 Adaptive Server-Side Tree Studio (Mobile 4-5 gens / Laptop 6-8 gens, Zero Scroll-Jacking)
    if (window.SAWYAN && window.SAWYAN.TreeStudio && typeof window.SAWYAN.TreeStudio.mount === 'function') {
        window.SAWYAN.TreeStudio.mount('treePage');
        return;
    }

    const tree = memberBundle.tree_analytics || { nodes: [], commission_team_count: 0, reserve_team_aggregated_count: 0, lens_country_code: 'ALL', country_reports: [] };
    const topology = memberBundle.tree_topology || [];
    const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
    const topoMap = new Map(topology.map(t => [Number(t.member_code), t]));

    const lensCountries = [
        { code: 'ALL', label: '🌐 كل الدول' },
        { code: 'EG', label: '🇪🇬 مصر' },
        { code: 'TR', label: '🇹🇷 تركيا' },
        { code: 'SA', label: '🇸🇦 السعودية' },
        { code: 'DE', label: '🇩🇪 ألمانيا' },
        { code: 'US', label: '🇺🇸 أمريكا' }
    ];

    const visualPalette = {
        GREEN: { bg: '#059669', softBg: '#ecfdf5', border: '#10b981', text: '#064e3b', circleText: '#ffffff', icon: '🟢', label: 'مؤهل' },
        ORANGE: { bg: '#d97706', softBg: '#fffbeb', border: '#f59e0b', text: '#78350f', circleText: '#ffffff', icon: '🟠', label: 'كاري أون' },
        WHITE: { bg: '#ffffff', softBg: '#ffffff', border: '#64748b', text: '#0f172a', circleText: '#0f172a', icon: '⚪', label: '0/100' },
        GRAY: { bg: '#475569', softBg: '#f1f5f9', border: '#94a3b8', text: '#334155', circleText: '#f1f5f9', icon: '🔘', label: 'فريق رديف' },
        BLACK: { bg: '#020617', softBg: '#0f172a', border: '#334155', text: '#cbd5e1', circleText: '#94a3b8', icon: '⬛', label: 'خارج العدسة' }
    };

    // عرض كل العقد الهيكلية بما فيها GRAY (فريق رديف) و BLACK (خارج العدسة) بترتيب ثنائي غير متقاطع
    const childrenByParent = new Map();
    for (const n of nodes) {
        const topo = topoMap.get(Number(n.member_code)) || {};
        const pCode = n.parent_member_code !== undefined && n.parent_member_code !== null ? n.parent_member_code : topo.parent_member_code;
        if (pCode !== undefined && pCode !== null) {
            if (!childrenByParent.has(Number(pCode))) childrenByParent.set(Number(pCode), []);
            childrenByParent.get(Number(pCode)).push(n);
        }
    }
    childrenByParent.forEach(arr => {
        arr.sort((a, b) => {
            const rank = (s) => (s === 'right' ? 0 : s === 'left' ? 1 : 2);
            const rDiff = rank(a.placement_side) - rank(b.placement_side);
            return rDiff !== 0 ? rDiff : Number(a.member_code) - Number(b.member_code);
        });
    });

    const xOrderMap = new Map();
    let seqCounter = 0;
    function assignDfsOrder(code) {
        if (xOrderMap.has(Number(code))) return;
        xOrderMap.set(Number(code), seqCounter++);
        const kids = childrenByParent.get(Number(code)) || [];
        for (const k of kids) assignDfsOrder(Number(k.member_code));
    }
    const rootNode = nodes.find(n => String(n.structural_me) === '1Me') || nodes[0];
    if (rootNode) assignDfsOrder(Number(rootNode.member_code));

    const byDepth = {};
    for (const n of nodes) {
        const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
        if (!byDepth[d]) byDepth[d] = [];
        byDepth[d].push(n);
    }
    Object.values(byDepth).forEach(levelArr => {
        levelArr.sort((a, b) => {
            const oa = xOrderMap.has(Number(a.member_code)) ? xOrderMap.get(Number(a.member_code)) : 999999 + Number(a.member_code);
            const ob = xOrderMap.has(Number(b.member_code)) ? xOrderMap.get(Number(b.member_code)) : 999999 + Number(b.member_code);
            return oa - ob;
        });
    });
    const depthKeys = Object.keys(byDepth).map(Number).sort((a, b) => a - b);

    const searchQ = String(treeUiState.searchQuery || '').trim().toLowerCase();
    const activeLensCode = (tree.lens_country_code && tree.lens_country_code !== 'ALL')
        ? tree.lens_country_code
        : ((memberBundle.profile && memberBundle.profile.country_code) || 'EG');
    const lensPlan = getCountryPlanInfo(activeLensCode);
    const actualEarnUsd = Number(tree.actual_earnings_usd || 0);
    const expOrangeUsd = Number(tree.expected_orange_earnings_usd || 0);
    const totalTeamCount = tree.total_team_count !== undefined ? tree.total_team_count : Math.max(0, nodes.length - 1);
    const treeTotalIncludingSelf = totalTeamCount + 1;
    const selfNode = nodes.find(n => (parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1) === 1) || null;
    const selfIsQualified = !!(selfNode && (selfNode.visual_color === 'GREEN' || selfNode.node_color === 'GREEN'));
    const teamCommCount = nodes.filter(n => {
        const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
        return d >= 2 && n.team_bucket === 'COMMISSION_TEAM';
    }).length;
    const rightArmCnt = Number(tree.right_arm_count || 0);
    const leftArmCnt = Number(tree.left_arm_count || 0);
    const reports = Array.isArray(tree.country_reports) ? tree.country_reports : [];

    const filteredTableNodes = nodes.filter(n => {
        const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
        if (d < 2) return false;
        const vColor = n.visual_color || (n.team_bucket === 'RESERVE_TEAM' ? 'GRAY' : n.node_color);
        if (treeUiState.tableColorFilter !== 'ALL' && vColor !== treeUiState.tableColorFilter) return false;
        if (searchQ) {
            const hay = `${n.member_code} ${n.full_name} ${n.structural_me} ${n.residency_country_code || ''}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
        }
        return true;
    });

    page.innerHTML = `
        <!-- شريط عدسات الدول الداكن — مطابق لمعرض الشاشات التفاعلي -->
        <div class="country-lens-bar-dark">
            <div style="color:#f8fafc;font-size:0.86rem;font-weight:800;">
                🔭 <strong>عدسة مشاهدة الشجرة:</strong>
                <span style="color:#94a3b8;font-weight:600;font-size:0.78rem;">العدسة الحالية (${esc(tree.lens_country_code || 'ALL')}) • اضغط أي عضو لعرض شجرة نسبه وسقفه الـ ${lensPlan.s01}</span>
            </div>
            <div data-spec-id="member-tree-lens-bar" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                ${lensCountries.map(lc => {
                    const isAct = (tree.lens_country_code || 'ALL') === lc.code;
                    return `<button type="button" class="lens-pill-btn ${isAct ? 'active' : ''}" onclick="switchTreeCountryLens('${lc.code === 'ALL' ? '' : lc.code}')">${lc.label}</button>`;
                }).join('')}
            </div>
        </div>

        <!-- رأس شاشة الشجرة الفاخر (تدرج زمردي كحلي — مطابق لمعرض الشاشات) -->
        <div data-spec-id="member-tree-kpis" style="background:linear-gradient(135deg, #064e3b 0%, #0f172a 100%);color:#ffffff;border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 8px 24px rgba(6,78,59,0.22);border:1px solid rgba(16,185,129,0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                <div>
                    <h2 style="margin:0;font-size:1.12rem;font-weight:900;color:#34d399;">🌐 الشجرة الدولية التفاعلية (سقف ${lensPlan.s01} جيلاً مؤهلاً)</h2>
                    <div style="font-size:0.79rem;color:#cbd5e1;margin-top:2px;">
                        أنت: <strong style="color:#ffffff;">${esc((memberBundle.profile && memberBundle.profile.full_name) || '')} (#${esc((memberBundle.profile && memberBundle.profile.member_code) || '')})</strong>
                        • حصتك عن كل مؤهل في فريقك: <strong style="color:#fde047;">${esc(fmtCountryLocal(lensPlan.unitShareUsd, lensPlan))}</strong>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.22);padding:5px 12px;border-radius:10px;font-weight:900;font-size:0.84rem;color:#fef08a;">
                    الإجمالي: ${treeTotalIncludingSelf} (يمين ${rightArmCnt} • يسار ${leftArmCnt})
                </div>
            </div>

            <!-- الأعداد الثلاثة المتسقة بدون أي تناقض (تشمل العضو نفسه كجيل 1) -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;text-align:center;margin-bottom:12px;">
                <div style="background:rgba(255,255,255,0.08);padding:10px;border-radius:12px;border:1px solid rgba(255,255,255,0.18);">
                    <div style="font-size:0.78rem;color:#e2e8f0;font-weight:800;">1️⃣ إجمالي أعضاء الشجرة</div>
                    <strong style="display:block;font-size:1.3rem;color:#ffffff;margin:3px 0;">${treeTotalIncludingSelf} ${treeTotalIncludingSelf === 1 ? 'عضو' : 'عضواً'}</strong>
                    <div style="font-size:0.73rem;color:#fde68a;">أنت + ${totalTeamCount} بالفريق (يمين ${rightArmCnt} • يسار ${leftArmCnt})</div>
                </div>
                <div style="background:rgba(16,185,129,0.16);padding:10px;border-radius:12px;border:1px solid rgba(52,211,153,0.45);">
                    <div style="font-size:0.78rem;color:#a7f3d0;font-weight:800;">2️⃣ فريق العمولات (قبل الستوبر)</div>
                    <strong style="display:block;font-size:1.3rem;color:#34d399;margin:3px 0;">${teamCommCount + (selfIsQualified ? 1 : 0)} مؤهل</strong>
                    <div style="font-size:0.72rem;color:#cbd5e1;">${selfIsQualified ? `أنت (1/${lensPlan.s01}) + ${teamCommCount} من فريقك` : `${teamCommCount} من فريقك • أنت غير مؤهل بعد`}</div>
                </div>
                <div style="background:rgba(148,163,184,0.14);padding:10px;border-radius:12px;border:1px solid rgba(148,163,184,0.38);">
                    <div style="font-size:0.78rem;color:#cbd5e1;font-weight:800;">3️⃣ الفريق الرديف المجمّع</div>
                    <strong style="display:block;font-size:1.3rem;color:#f1f5f9;margin:3px 0;">+${tree.reserve_team_aggregated_count || 0}</strong>
                    <div style="font-size:0.72rem;color:#94a3b8;">بعد امتلاء ${lensPlan.s01}/${lensPlan.s01}</div>
                </div>
            </div>

            <!-- خانتا الأرباح الحقيقية والمتوقعة بتباين عالٍ -->
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
                <div style="background:rgba(6,95,70,0.6);border:2px solid #10b981;border-radius:12px;padding:11px 14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span style="font-size:0.84rem;font-weight:900;color:#a7f3d0;">💵 أرباحي الفعلية المحققة:</span>
                        <strong style="font-size:1.22rem;color:#34d399;font-family:monospace;">${esc(fmtLocalFromUsd(actualEarnUsd))}</strong>
                    </div>
                    <div style="font-size:0.74rem;color:#ecfdf5;margin-top:4px;">${fmtUsd(actualEarnUsd)} مرجعي • مبنية على المؤهلين الخضر 🟢 في هذه العدسة</div>
                </div>
                <div style="background:rgba(120,53,15,0.6);border:2px solid #f59e0b;border-radius:12px;padding:11px 14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <span style="font-size:0.84rem;font-weight:900;color:#fde68a;">🚀 الأرباح المتوقعة (قيد التجميع):</span>
                        <strong style="font-size:1.22rem;color:#fde047;font-family:monospace;">+${esc(fmtLocalFromUsd(expOrangeUsd))}</strong>
                    </div>
                    <div style="font-size:0.74rem;color:#fef3c7;margin-top:4px;">${fmtUsd(expOrangeUsd)} محتمل • لو أكمل البرتقاليون 🟠 هدفهم الشهري</div>
                </div>
            </div>
        </div>

        <!-- شريط التحكم الداكن والمنظور ومفتاح الألوان -->
        <div class="tree-toolbar-dark">
            <div data-spec-id="member-tree-controls" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <input type="search" id="treeSearchInput" class="form-control" style="max-width:200px;padding:6px 10px;font-size:0.82rem;" placeholder="🔍 ابحث بالكود أو الاسم..." value="${esc(treeUiState.searchQuery)}">
                <button type="button" class="lens-pill-btn" onclick="adjustTreeZoom(0.14)">➕ تكبير</button>
                <button type="button" class="lens-pill-btn" onclick="adjustTreeZoom(-0.14)">➖ تصغير</button>
                <button type="button" class="lens-pill-btn" onclick="resetTreeViewport()">⌖ تمركز (${Math.round(treeUiState.zoom * 100)}%)</button>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <div data-spec-id="member-tree-view-toggle" id="treeViewModeToggle" style="display:inline-flex;gap:4px;">
                    <button type="button" class="lens-pill-btn ${treeUiState.viewMode === 'circles' ? 'active' : ''}" onclick="setTreeViewMode('circles')">⭕ دوائر</button>
                    <button type="button" class="lens-pill-btn ${treeUiState.viewMode === 'cards' ? 'active' : ''}" onclick="setTreeViewMode('cards')">🪪 بطاقات</button>
                </div>
                <button type="button" data-spec-id="member-tree-orange-filter" class="lens-pill-btn ${treeUiState.orangeOnly ? 'active' : ''}" style="${treeUiState.orangeOnly ? 'background:#f59e0b;color:#0f172a;border-color:#fde047;' : 'border-color:#f59e0b;color:#fde68a;'}" onclick="toggleTreeOrangeFilter()">
                    🟠 إبراز القريبين من التأهل
                </button>
            </div>
            <div style="width:100%;display:flex;gap:12px;flex-wrap:wrap;font-size:0.74rem;color:#cbd5e1;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);">
                <span>🟢 مؤهل (عمولات)</span>
                <span>🟠 برتقالي (كاري أون)</span>
                <span>⚪ أبيض (0/100)</span>
                <span>🔘 رمادي (رديف بعد 11)</span>
                <span>⬛ أسود (خارج العدسة)</span>
            </div>
        </div>

        <!-- عدسة جوجل إيرث ثنائية الأبعاد + أزرار HUD -->
        <div id="treeEarthViewport" data-spec-id="member-tree-earth-viewport" class="tree-earth-viewport" style="border-radius:0 0 16px 16px;border-top:none;">
            <div class="hud-dpad-panel" data-spec-id="member-tree-hud-dpad" aria-label="وحدة تحكم الكاميرا">
                <div></div>
                <button type="button" class="hud-dpad-btn" onclick="panTreeCamera(0, 80)" title="أعلى">▲</button>
                <button type="button" class="hud-dpad-btn" onclick="adjustTreeZoom(0.12)" title="تكبير">+</button>
                <button type="button" class="hud-dpad-btn" onclick="panTreeCamera(-90, 0)" title="يمين">◀</button>
                <button type="button" class="hud-dpad-btn" onclick="resetTreeViewport()" title="إعادة تمركز">⌖</button>
                <button type="button" class="hud-dpad-btn" onclick="panTreeCamera(90, 0)" title="يسار">▶</button>
                <div></div>
                <button type="button" class="hud-dpad-btn" onclick="panTreeCamera(0, -80)" title="أسفل">▼</button>
                <button type="button" class="hud-dpad-btn" onclick="adjustTreeZoom(-0.12)" title="تصغير">−</button>
            </div>

            <div id="treeEarthStage" class="tree-earth-stage" style="transform: translate(calc(-50% + ${Math.round(treeUiState.panX)}px), ${Math.round(treeUiState.panY)}px)${treeUiState.zoom !== 1 ? ` scale(${treeUiState.zoom})` : ''};">
                <svg id="treeSvgOverlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;"></svg>
                <div id="treeLevelsContainer" style="position:relative;z-index:1;display:flex;flex-direction:column;gap:28px;min-width:max-content;">
                    ${depthKeys.map(d => `
                        <div class="tree-gen-row" style="display:flex;align-items:center;gap:14px;justify-content:center;flex-wrap:nowrap;">
                            <span style="background:#0f172a;color:#34d399;border:1px solid #10b981;font-size:0.74rem;font-weight:800;padding:4px 10px;border-radius:8px;min-width:66px;text-align:center;">${d === 1 ? '👑 أنت' : ('الجيل ' + d)}</span>
                            ${byDepth[d].map(n => {
                                const topo = topoMap.get(Number(n.member_code)) || {};
                                const pCode = n.parent_member_code !== undefined && n.parent_member_code !== null ? n.parent_member_code : (topo.parent_member_code ?? '');
                                const vColor = n.visual_color || (n.team_bucket === 'RESERVE_TEAM' ? 'GRAY' : n.node_color);
                                const pal = visualPalette[vColor] || visualPalette.WHITE;
                                const isRootSelf = d === 1;
                                const pctVal = Math.round(Number(n.target_pct || 0));
                                const circleMainLabel = isRootSelf
                                    ? (vColor === 'GREEN' ? `👑 1/${lensPlan.s01}` : `👑 ${pctVal}%`)
                                    : (n.stopper_slot ? esc(n.stopper_slot) : `#${n.member_code}`);
                                const matchSearch = !searchQ || `${n.member_code} ${n.full_name}`.toLowerCase().includes(searchQ);
                                const isOrangeHit = (n.node_color === 'ORANGE' && d >= 2 && d <= 11);
                                let dimStyle = '';
                                if (searchQ && !matchSearch) dimStyle = 'opacity:0.25;';
                                else if (treeUiState.orangeOnly && !isOrangeHit && d >= 2) dimStyle = 'opacity:0.28;';
                                else if (treeUiState.orangeOnly && isOrangeHit) dimStyle = 'box-shadow:0 0 0 4px #f59e0b;border-radius:14px;';

                                if (treeUiState.viewMode === 'circles') {
                                    return `
                                        <div class="tree-circle-node tree-node-card" data-code="${n.member_code}" data-parent="${pCode}" style="${dimStyle}" onclick="openTreeNodeDetailModal(${n.member_code})">
                                            <div class="tree-circle-disc ${isRootSelf ? 'c-root-disc' : ''}" style="background:${pal.bg};border-color:${pal.border};color:${pal.circleText};">
                                                <span>${circleMainLabel}</span>
                                                <span style="font-size:0.64rem;opacity:0.9;">${esc(n.residency_country_code || '')}</span>
                                            </div>
                                            <div style="font-size:0.76rem;font-weight:800;color:#0f172a;white-space:nowrap;max-width:104px;overflow:hidden;text-overflow:ellipsis;margin-top:4px;">#${n.member_code} ${esc(n.full_name)}</div>
                                        </div>
                                    `;
                                }
                                const waPhone = n.phone_visible && n.phone ? String(n.phone).replace(/\D/g, '') : '';
                                return `
                                    <div class="tree-node-card" data-code="${n.member_code}" data-parent="${pCode}" onclick="openTreeNodeDetailModal(${n.member_code})"
                                         style="background:${pal.softBg};border:2px solid ${pal.border};color:${pal.text};border-radius:12px;padding:8px 10px;min-width:168px;max-width:190px;box-shadow:0 2px 6px rgba(0,0,0,0.06);${dimStyle}">
                                        <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                                            <strong style="font-size:0.84rem;">#${n.member_code} [${esc(n.residency_country_code || '')}]</strong>
                                            <span style="background:${pal.bg === '#ffffff' ? '#64748b' : pal.bg};color:${vColor === 'WHITE' ? '#ffffff' : pal.circleText};font-size:0.68rem;padding:1px 6px;border-radius:999px;">
                                                ${isRootSelf ? (vColor === 'GREEN' ? `👑 1/${lensPlan.s01}` : `👑 ${pctVal}%`) : (n.stopper_slot ? esc(n.stopper_slot) : pal.label)}
                                            </span>
                                        </div>
                                        <div style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${esc(n.full_name)}</div>
                                        <div style="font-size:0.72rem;opacity:0.9;display:flex;justify-content:space-between;margin-top:4px;">
                                            <span>${isRootSelf ? '👑 قمة شجرتك' : esc(n.placement_side)} • ${Number(n.target_pct || 0)}%</span>
                                            <span>${isRootSelf ? '👑 أنت' : (waPhone ? '💬 متاح' : '🔒 مقنّع')}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- عداد الفريق الرديف المجمع D26 -->
        <div data-spec-id="member-tree-reserve-counter" style="background:#f1f5f9;border:1.5px solid #94a3b8;border-radius:14px;padding:12px 16px;margin:14px 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
                <strong>🔘 الفريق الرديف المجمّع:</strong> يظهر هنا الأعضاء بعد الجيل ${lensPlan.s01} كدوائر رمادية وعداد مجمّع لحماية الخصوصية.
            </div>
            <span style="background:#334155;color:#ffffff;font-weight:900;padding:4px 14px;border-radius:999px;font-size:0.86rem;">
                الإجمالي الرديف: +${tree.reserve_team_aggregated_count || 0} عضو
            </span>
        </div>

        <!-- التقارير المالية لكل دولة وحماية الخصم التعويضي (GREATEST(0, ...) - D1/T03) -->
        <div data-spec-id="member-tree-country-reports" style="margin:16px 0;">
            <h3 style="margin:0 0 10px;">🌍 التقارير المالية التفصيلية حسب الدول (حماية الأرباح الأجنبية التعويضية D1)</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
                ${reports.map(r => {
                    const fx = Number(r.fx_rate || 1);
                    const netAct = Number(r.net_actual_usd || 0);
                    const netExp = Number(r.net_expected_orange_usd || 0);
                    return `
                        <div style="background:#ffffff;border:1.5px solid ${r.is_foreign ? '#0ea5e9' : '#10b981'};border-radius:14px;padding:14px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <strong style="font-size:0.98rem;">${esc(r.country_name_i18n?.ar || r.country_code)} (${esc(r.currency_code)})</strong>
                                <span style="font-size:0.74rem;font-weight:800;padding:2px 8px;border-radius:999px;background:${r.is_foreign ? '#eff6ff' : '#ecfdf5'};color:${r.is_foreign ? '#1d4ed8' : '#065f46'};">
                                    ${r.is_foreign ? (r.viewer_locally_qualified ? 'أجنبية مؤهل محلياً' : `تعويضية ≥ ${fmtUsd(r.compensatory_threshold_usd)}`) : 'دولة الإقامة الأم'}
                                </span>
                            </div>
                            <div style="font-size:0.82rem;color:#334155;line-height:1.7;">
                                <div>الأعضاء: <strong>${r.total_members}</strong> (يمين ${r.right_count} / يسار ${r.left_count})</div>
                                <div>الحالات: 🟢 ${r.green_comm_count} | 🟠 ${r.orange_count} | ⚪ ${r.white_count} | 🔘 ${r.reserve_count}</div>
                                <div>صافي المحقق الفعلي: <strong style="color:#047857;">${(netAct * fx).toFixed(2)} ${esc(r.currency_code)} (${fmtUsd(netAct)})</strong></div>
                                <div>المتوقع (البرتقالي): <strong style="color:#b45309;">+${(netExp * fx).toFixed(2)} ${esc(r.currency_code)} (${fmtUsd(netExp)})</strong></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>

        <!-- رادار القائد التخصصي للأجيال الـ 10 (N01/N02 + W09b) -->
        <div data-spec-id="member-tree-leader-radar" style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px 16px;margin:16px 0;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <strong style="color:#92400e;">🔥 رادار متابعة أول 10 أجيال (نسب الإنجاز فقط)</strong>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button type="button" class="lens-pill-btn ${treeUiState.radarMode === 'near_target_50_99' ? 'active' : ''}" onclick="loadInlineLeaderRadar('near_target_50_99')">🔥 50%–99%</button>
                    <button type="button" class="lens-pill-btn ${treeUiState.radarMode === 'zero_activity_new' ? 'active' : ''}" onclick="loadInlineLeaderRadar('zero_activity_new')">🆕 بدون شراء</button>
                    <button type="button" class="lens-pill-btn ${treeUiState.radarMode === 'qualified' ? 'active' : ''}" onclick="loadInlineLeaderRadar('qualified')">🟢 مؤهلون</button>
                    <button type="button" class="lens-pill-btn ${treeUiState.radarMode === 'all' ? 'active' : ''}" onclick="loadInlineLeaderRadar('all')">👥 كل الأجيال الـ 10</button>
                </div>
            </div>
            <div id="inlineLeaderRadarBody"></div>
        </div>

        <!-- الجدول الذكي القابل للفلترة بكل الألوان -->
        <div data-spec-id="member-tree-detail-table" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;padding:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <strong style="font-size:0.98rem;">📋 الجدول التفصيلي الذكي لأعضاء الشجرة (${filteredTableNodes.length})</strong>
                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    ${[
                        ['ALL', 'الكل'],
                        ['GREEN', '🟢 مؤهل'],
                        ['ORANGE', '🟠 قيد التجميع'],
                        ['WHITE', '⚪ أبيض'],
                        ['GRAY', '🔘 رديف'],
                        ['BLACK', '⬛ خارج العدسة']
                    ].map(([k, lbl]) => `<button type="button" class="lens-pill-btn ${treeUiState.tableColorFilter === k ? 'active' : ''}" onclick="setTreeTableFilter('${k}')">${lbl}</button>`).join('')}
                </div>
            </div>
            <div class="table-responsive-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>العضو</th>
                            <th>الجيل الهيكلي</th>
                            <th>مقعد الستوبر</th>
                            <th>الدولة</th>
                            <th>الإنجاز</th>
                            <th>طبيعة التسكين</th>
                            <th>التواصل</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredTableNodes.length === 0
                            ? '<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">لا توجد نتائج مطابقة للفلتر الحالي.</td></tr>'
                            : filteredTableNodes.slice(0, 60).map(n => {
                                const vColor = n.visual_color || n.node_color;
                                const pal = visualPalette[vColor] || visualPalette.WHITE;
                                const wa = n.phone_visible && n.phone ? String(n.phone).replace(/\D/g, '') : '';
                                return `
                                    <tr onclick="openTreeNodeDetailModal(${n.member_code})" style="cursor:pointer;">
                                        <td data-label="العضو"><strong>#${n.member_code} ${esc(n.full_name)}</strong></td>
                                        <td data-label="الجيل الهيكلي">${esc(n.structural_me)} (${esc(n.placement_side)})</td>
                                        <td data-label="مقعد الستوبر"><span style="font-weight:800;">${n.stopper_slot ? esc(n.stopper_slot) : `${pal.icon} ${pal.label}`}</span></td>
                                        <td data-label="الدولة">${esc(n.residency_country_code || '')}</td>
                                        <td data-label="الإنجاز"><strong>${Number(n.target_pct || 0)}%</strong></td>
                                        <td data-label="طبيعة التسكين" style="font-size:0.78rem;">${esc(n.placement_type_label || '')}</td>
                                        <td data-label="التواصل" onclick="event.stopPropagation();">${wa ? `<a href="https://wa.me/${wa}" target="_blank" style="color:#047857;font-weight:800;">💬 ${esc(n.phone)}</a>` : '🔒 محمي للخصوصية'}</td>
                                    </tr>
                                `;
                            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const sInput = document.getElementById('treeSearchInput');
    if (sInput) {
        sInput.addEventListener('input', (e) => {
            treeUiState.searchQuery = e.target.value;
            loadTree();
        });
    }

    initTreeEarthPanZoom();
    renderInlineLeaderRadarBody();
    requestAnimationFrame(drawVerticalTreeConnectors);
}

function initTreeEarthPanZoom() {
    const vp = document.getElementById('treeEarthViewport');
    const stage = document.getElementById('treeEarthStage');
    if (!vp || !stage) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let basePanX = treeUiState.panX;
    let basePanY = treeUiState.panY;

    const applyTransform = () => {
        stage.style.transform = `translate(calc(-50% + ${treeUiState.panX}px), ${treeUiState.panY}px) scale(${treeUiState.zoom})`;
    };

    vp.onpointerdown = (e) => {
        if (e.target.closest('.hud-dpad-panel, .tree-node-card, button, a')) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        basePanX = treeUiState.panX;
        basePanY = treeUiState.panY;
        vp.classList.add('panning');
    };
    vp.onpointermove = (e) => {
        if (!dragging) return;
        treeUiState.panX = basePanX + (e.clientX - startX);
        treeUiState.panY = basePanY + (e.clientY - startY);
        applyTransform();
    };
    vp.onpointerup = vp.onpointerleave = () => {
        dragging = false;
        vp.classList.remove('panning');
    };
    vp.onwheel = (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.07 : 0.07;
        treeUiState.zoom = Math.max(0.32, Math.min(1.65, Number((treeUiState.zoom + delta).toFixed(2))));
        applyTransform();
    };
}

window.adjustTreeZoom = function (delta) {
    treeUiState.zoom = Math.max(0.32, Math.min(1.65, Number((treeUiState.zoom + delta).toFixed(2))));
    loadTree();
};
window.panTreeCamera = function (dx, dy) {
    treeUiState.panX += dx;
    treeUiState.panY += dy;
    const stage = document.getElementById('treeEarthStage');
    if (stage) stage.style.transform = `translate(calc(-50% + ${Math.round(treeUiState.panX)}px), ${Math.round(treeUiState.panY)}px)${treeUiState.zoom !== 1 ? ` scale(${treeUiState.zoom})` : ''}`;
};
window.resetTreeViewport = function () {
    treeUiState.zoom = 1;
    treeUiState.panX = 0;
    treeUiState.panY = 10;
    loadTree();
};
window.setTreeViewMode = function (mode) {
    treeUiState.viewMode = mode;
    loadTree();
};
window.toggleTreeOrangeFilter = function () {
    treeUiState.orangeOnly = !treeUiState.orangeOnly;
    loadTree();
};
window.setTreeTableFilter = function (f) {
    treeUiState.tableColorFilter = f;
    loadTree();
};

window.loadInlineLeaderRadar = async function (mode) {
    treeUiState.radarMode = mode || 'near_target_50_99';
    try {
        const res = await window.SAWYAN.API.getLeader10GenFollowupRadar({
            memberId: currentMember.id,
            filterMode: treeUiState.radarMode
        });
        treeUiState.radarRows = res.team_members || [];
    } catch (_) {
        treeUiState.radarRows = [];
    }
    loadTree();
};

function renderInlineLeaderRadarBody() {
    const box = document.getElementById('inlineLeaderRadarBody');
    if (!box) return;
    if (treeUiState.radarRows === null) {
        box.innerHTML = `<button type="button" class="btn btn-outline btn-sm" onclick="loadInlineLeaderRadar('${esc(treeUiState.radarMode)}')">🔎 تحميل بيانات رادار الـ 10 أجيال المباشرة</button>`;
        return;
    }
    const rows = treeUiState.radarRows;
    if (!rows.length) {
        box.innerHTML = '<div style="font-size:0.84rem;color:#92400e;">لا يوجد أعضاء ضمن هذا الفلتر حالياً.</div>';
        return;
    }
    box.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${rows.slice(0, 12).map(r => {
                const wa = r.phone ? `https://wa.me/${String(r.phone).replace(/\D/g, '')}` : '';
                return `
                    <div style="background:#ffffff;border:1px solid #fcd34d;border-radius:10px;padding:7px 11px;font-size:0.8rem;display:flex;align-items:center;gap:8px;">
                        <span><strong>#${r.member_code} ${esc(r.full_name)}</strong> (${r.spatial_me_label}Me • ${Number(r.progress_pct)}%)</span>
                        ${wa ? `<a href="${esc(wa)}" target="_blank" style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;text-decoration:none;font-weight:800;">💬</a>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

window.openTreeNodeDetailModal = function (memberCode) {
    const nodes = memberBundle?.tree_analytics?.nodes || [];
    const node = nodes.find(n => Number(n.member_code) === Number(memberCode));
    if (!node) return;
    const modal = document.getElementById('memberDetailModal');
    const content = document.getElementById('memberModalContent');
    if (!modal || !content) return;

    const revRem = Number(node.reverse_ceiling_11 || 0);
    const wa = node.phone_visible && node.phone ? String(node.phone).replace(/\D/g, '') : '';
    const sponsorDisplay = node.real_sponsor_name
        ? `${esc(node.real_sponsor_name)} (#${node.real_sponsor_code})`
        : '🔒 محمي للخصوصية (خارج الأجيال العشرة الأولى)';

    const isSelfModal = (parseInt(String(node.structural_me || '1').replace(/\D/g, ''), 10) || 1) === 1;
    const modalVColor = node.visual_color || node.node_color || 'WHITE';
    const modalColorLabels = {
        GREEN: '🟢 مؤهل (100%)',
        ORANGE: `🟠 جاري التجميع (${Math.round(Number(node.target_pct || 0))}%)`,
        WHITE: '⚪ غير مؤهل بعد (0%)',
        GRAY: '🔘 فريق رديف (بعد الستوبر)',
        BLACK: '⬛ خارج العدسة الحالية'
    };
    const modalBadgeText = isSelfModal
        ? (modalVColor === 'GREEN' ? `👑 مؤهل • مقعد ${esc(node.stopper_slot || '1/11')}` : `👑 أنت • ${modalColorLabels[modalVColor] || 'غير مؤهل بعد'}`)
        : (node.stopper_slot ? `مقعد ${esc(node.stopper_slot)}` : (modalColorLabels[modalVColor] || esc(modalVColor)));
    const subTotalIncSelf = Number(node.subtree_total || 0) + 1;

    content.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;border-bottom:2px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px;">
            <div>
                <h3 style="margin:0;color:#0f172a;">👤 ${esc(node.full_name)} <small style="color:#059669;">(#${node.member_code})</small></h3>
                <div style="font-size:0.82rem;color:#64748b;">${isSelfModal ? '👑 قمة شجرتك (الجيل 1)' : esc(node.structural_me)} • الجيل العام #${node.company_gen || 1} • دولة الإقامة: ${esc(node.residency_country_code || '')}</div>
            </div>
            <span style="background:#0f172a;color:#fff;padding:4px 10px;border-radius:999px;font-size:0.78rem;font-weight:800;">
                ${modalBadgeText}
            </span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;font-size:0.84rem;margin-bottom:12px;">
            <div style="background:#f8fafc;padding:10px;border-radius:10px;border:1px solid #cbd5e1;">
                <div style="color:#64748b;">🧭 طبيعة التسكين</div>
                <strong>${esc(node.placement_type_label || node.placement_side)}</strong>
            </div>
            <div style="background:#f8fafc;padding:10px;border-radius:10px;border:1px solid #cbd5e1;">
                <div style="color:#64748b;">🤝 الداعي الحقيقي (Sponsor)</div>
                <strong>${sponsorDisplay}</strong>
            </div>
            <div style="background:#f0fdf4;padding:10px;border-radius:10px;border:1px solid #86efac;">
                <div style="color:#065f46;">🛡️ السقف العكسي للـ 11 (Reverse Ceiling)</div>
                <strong>متبقي ${revRem} مقعداً حتى ستوبر 11/11</strong>
            </div>
            <div style="background:#eff6ff;padding:10px;border-radius:10px;border:1px solid #bfdbfe;">
                <div style="color:#1e40af;">🌳 إجمالي شجرة هذا العضو</div>
                <strong>${subTotalIncSelf} ${subTotalIncSelf === 1 ? 'عضو' : 'عضواً'} (هو + ${Number(node.subtree_total || 0)} تحته: يمين ${Number(node.subtree_right || 0)} / يسار ${Number(node.subtree_left || 0)})</strong>
            </div>
            <div style="background:#fffbeb;padding:10px;border-radius:10px;border:1px solid #fde68a;">
                <div style="color:#92400e;">🎯 تقدم الصندوق هذا الشهر</div>
                <strong>${Number(node.target_pct || 0)}% (${fmtUsd(node.box_accumulated_usd)} / ${fmtUsd(node.target_required_usd)})</strong>
            </div>
            <div style="background:#ecfdf5;padding:10px;border-radius:10px;border:1px solid #a7f3d0;">
                <div style="color:#065f46;">💎 عائدك المباشر من مقعده</div>
                <strong>${fmtUsd(node.node_actual_share_usd)}</strong> (متوقع: ${fmtUsd(node.node_expected_share_usd)})
            </div>
        </div>
        ${isSelfModal ? '<div style="text-align:center;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:8px;border-radius:10px;font-size:0.84rem;font-weight:700;">👑 هذه عقدتك الشخصية في قمة شجرتك — يمكنك متابعة فريقك من الدوائر أدناه</div>' : (wa ? `<a href="https://wa.me/${wa}" target="_blank" class="btn btn-primary btn-block" style="text-align:center;">💬 مراسلة العضو عبر واتساب (${esc(node.phone)})</a>` : '<div style="text-align:center;color:#64748b;font-size:0.82rem;">🔒 رقم الهاتف محمي للخصوصية (متاح فقط لأول 10 أجيال مباشرة في شجرتك)</div>')}
    `;
    modal.style.display = 'flex';
};

function drawVerticalTreeConnectors() {
    const svg = document.getElementById('treeSvgOverlay');
    const container = document.getElementById('treeLevelsContainer');
    const stage = document.getElementById('treeEarthStage');
    if (!svg || !container || !stage) return;

    const w = container.scrollWidth || container.offsetWidth || 800;
    const h = container.scrollHeight || container.offsetHeight || 400;
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    svg.innerHTML = '';

    const scale = Math.max(0.1, Number(treeUiState.zoom || 1));
    const vpRect = container.getBoundingClientRect();
    const cardMap = new Map();
    container.querySelectorAll('.tree-node-card').forEach(el => {
        cardMap.set(el.dataset.code, el);
    });

    const ns = 'http://www.w3.org/2000/svg';
    cardMap.forEach((el) => {
        const parentCode = el.dataset.parent;
        if (!parentCode || !cardMap.has(parentCode)) return;
        const pEl = cardMap.get(parentCode);
        const cr = el.getBoundingClientRect();
        const pr = pEl.getBoundingClientRect();
        const x1 = (pr.left - vpRect.left + pr.width / 2) / scale;
        const y1 = (pr.bottom - vpRect.top) / scale;
        const x2 = (cr.left - vpRect.left + cr.width / 2) / scale;
        const y2 = (cr.top - vpRect.top) / scale;
        const midY = (y1 + y2) / 2;

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
        path.setAttribute('stroke', '#94a3b8');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
    });
}

async function switchTreeCountryLens(countryCode) {
    await refreshDashboardBundle(countryCode || null);
    goToPage('tree');
}
window.switchTreeCountryLens = switchTreeCountryLens;

// ---------------------------------------------------------------------------
// Screen 5: Wallet & 3-Way USD/Local Reconciliation + 72h Payout Methods + D7 KYC Withdrawal
// ---------------------------------------------------------------------------
function loadWalletDetails() {
    const page = document.getElementById('walletPage');
    if (!page || !memberBundle) return;
    const w = memberBundle.wallet || {};
    const wTxs = memberBundle.wallet_transactions || [];
    const methods = memberBundle.payment_methods || [];
    const profile = memberBundle.profile || {};
    const archive = memberBundle.closed_months_archive || [];

    const grossNetworkUsd = Number(w.total_earned_usd || 0) + Number(w.s03_suspense_balance_usd || 0);
    const suspenseUsd = Number(w.s03_suspense_balance_usd || 0);
    const availableUsd = Number(w.balance_usd || 0);
    const hp = getCountryPlanInfo(profile.country_code);
    const s03Pct = hp.stopperUsd > 0 ? Math.min(100, Math.round((grossNetworkUsd / hp.stopperUsd) * 100)) : 0;

    page.innerHTML = `
        <div class="wallet-page">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                <h2 style="margin:0;">💰 المحفظة والمطابقة الثلاثية الموثّقة</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-outline btn-sm" onclick="openAddPayoutMethodModal()">+ إضافة وسيلة استلام (تهدئة 72h)</button>
                    <button type="button" data-spec-id="member-wallet-withdraw-btn" class="btn btn-primary btn-sm" onclick="openRequestWithdrawalModal()">💸 طلب سحب أرباح موثق</button>
                </div>
            </div>

            <div class="wallet-main-card">
                <div class="balance-info">
                    <span class="balance-label" style="display:block;margin-bottom:4px;">الرصيد المتاح للسحب بالعملة المحلية (ومرجعه المحاسبي USD)</span>
                    <span class="balance-amount" style="display:block;margin:4px 0 6px;">${esc(fmtLocalFromUsd(availableUsd))}</span>
                    <small style="display:block;opacity:0.95;">الرصيد المحاسبي المرجعي: <strong>${fmtUsd(availableUsd)}</strong> • حالة توثيق الهوية: <strong>${profile.kyc_status === 'verified' ? 'موثّقة ✓' : profile.kyc_status === 'pending' ? 'قيد المراجعة' : 'غير موثّقة'}</strong></small>
                </div>
            </div>

            <div data-spec-id="member-wallet-fx-reconcile-card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:12px;margin:16px 0;">
                <div style="background:#f0fdf4;border:1.5px solid #10b981;border-radius:14px;padding:14px;">
                    <div style="font-size:0.8rem;color:#065f46;">💎 حصتك عن كل مؤهل في فريقك (${esc(hp.countryCode)})</div>
                    <strong style="font-size:1.15rem;color:#047857;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(hp.unitShareUsd))}</strong>
                    <small style="color:#065f46;">${fmtUsd(hp.unitShareUsd)} = الهدف (${fmtUsd(hp.targetUsd)}) ÷ ${hp.s02}</small>
                </div>
                <div style="background:#fff;border:1.5px solid #cbd5e1;border-radius:14px;padding:14px;">
                    <div style="font-size:0.8rem;color:#475569;">1️⃣ المرجع المحاسبي × سعر الصرف الإداري (${hp.fx})</div>
                    <strong style="font-size:1.15rem;color:#0f172a;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(grossNetworkUsd))}</strong>
                    <small style="color:#64748b;">مرجع الدفتر: ${fmtUsd(grossNetworkUsd)}</small>
                </div>
                <div style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:14px;padding:14px;">
                    <div style="font-size:0.8rem;color:#065f46;">2️⃣ صافي المحفظة القابل للصرف</div>
                    <strong style="font-size:1.15rem;color:#047857;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(availableUsd))}</strong>
                    <small style="color:#065f46;">الصافي الدولاري: ${fmtUsd(availableUsd)}</small>
                </div>
            </div>

            <div data-spec-id="member-wallet-s03-meter" style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px;margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
                    <strong style="color:#92400e;">⚖️ مقياس السقف الشهري للأرباح والفائض المعلق</strong>
                    <span style="font-weight:800;color:#b45309;">${fmtUsd(suspenseUsd)} معلق • السقف: ${fmtUsd(hp.stopperUsd)} (${esc(fmtLocalFromUsd(hp.stopperUsd))})</span>
                </div>
                <div style="height:8px;background:#fde68a;border-radius:999px;overflow:hidden;">
                    <div style="width:${s03Pct}%;height:100%;background:#d97706;"></div>
                </div>
            </div>

            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin:14px 0;font-size:0.85rem;color:#334155;">
                🛡️ <strong>ضوابط الأمان المالية:</strong> لحماية حسابك، يُصرف الرصيد لوسيلتك المسجّلة فقط (دون تحويل بين الأعضاء)، وتخضع كل وسيلة استلام جديدة لفترة أمان <code>72 ساعة</code> مع اشتراط توثيق الهوية قبل أول سحب.
            </div>

            <div data-spec-id="member-wallet-methods-section">
                <h3 style="margin:18px 0 10px;">🏦 وسائل استلام الأرباح المسجلة (${methods.length})</h3>
                ${methods.length === 0 ? '<p class="empty-state">لم تقم بإضافة وسيلة استلام بعد. أضف حسابك البنكي أو المحفظة لبدء عداد الـ 72 ساعة.</p>' : `
                    <div style="display:grid;gap:8px;margin-bottom:18px;">
                        ${methods.map(m => `
                            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div>
                                    <strong>${esc(String(m.provider || '').toUpperCase())}</strong> — ${esc(m.account_holder_name)} (<code>****${esc(m.last_four)}</code>)
                                    <div style="font-size:0.78rem;color:#64748b;">انتهاء التهدئة: ${new Date(m.cooldown_expires_at).toLocaleString(getMemLocale())}</div>
                                </div>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    ${(() => {
                                        const cooling = Boolean(m.is_cooldown_active ?? m.in_cooldown);
                                        return `<span style="font-size:0.76rem;font-weight:800;padding:3px 9px;border-radius:999px;background:${cooling ? '#fef3c7' : '#d1fae5'};color:${cooling ? '#92400e' : '#065f46'};">
                                            ${cooling ? '⏳ تهدئة 72 ساعة نشطة' : '✅ جاهزة للسحب'}
                                        </span>`;
                                    })()}
                                    <button type="button" class="btn btn-outline btn-sm" onclick="deletePayoutMethod('${m.id}')">حذف</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>

            <div data-spec-id="member-wallet-history">
                <h3>📋 سجل حركات المحفظة (${wTxs.length}) ${archive.length ? `• الإقفالات الشهرية (${archive.length})` : ''}</h3>
                ${wTxs.length === 0 ? '<p class="empty-state">لا توجد حركات مالية مسجلة حتى الآن.</p>' : `
                    <div style="display:grid;gap:8px;">
                        ${wTxs.map(t => {
                            const typeLabels = {
                                commission_credit: '💰 عمولة شهرية معتمدة',
                                monthly_payout: '💰 صرف أرباح شهرية',
                                surplus_credit: '✨ حصة فائض القمة',
                                withdrawal: '💸 طلب سحب أرباح',
                                withdrawal_fee: '🏦 رسوم تحويل بنكي',
                                refund: '↩️ تسوية واسترداد',
                                reversal: '↩️ عكس قيد',
                                s03_release: '🔓 تحرير فائض سقف شهري',
                                adjustment: '⚖️ تسوية محاسبية'
                            };
                            const statusLabels = {
                                completed: 'مكتملة ✅',
                                approved: 'معتمدة ✅',
                                paid: 'تم الصرف ✅',
                                pending: 'قيد المراجعة ⏳',
                                processing: 'قيد التنفيذ ⏳',
                                rejected: 'مرفوضة ❌',
                                cancelled: 'ملغاة ❌',
                                failed: 'فشلت ❌'
                            };
                            const tLabel = typeLabels[String(t.transaction_type || '').toLowerCase()] || esc(t.transaction_type || 'حركة مالية');
                            const sLabel = statusLabels[String(t.status || '').toLowerCase()] || esc(t.status || '');
                            return `
                            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                <div>
                                    <strong>${tLabel}</strong>
                                    <div style="font-size:0.78rem;color:#64748b;">${new Date(t.created_at).toLocaleString(getMemLocale())} • ${sLabel}</div>
                                </div>
                                <div style="text-align:left;">
                                    <strong style="color:${t.transaction_type === 'withdrawal' ? '#dc2626' : '#047857'};" dir="ltr">${esc(fmtLocalFromUsd(t.amount_usd))}</strong>
                                    <div style="font-size:0.75rem;color:#64748b;" dir="ltr">${fmtUsd(t.amount_usd)}</div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

function openAddPayoutMethodModal() {
    openMemberModal('🏦 إضافة وسيلة استلام أرباح (فترة أمان 72 ساعة)', `
        <div>
            <label style="font-weight:700;font-size:0.86rem;">القناة المالية *</label>
            <select name="provider" class="form-control">
                <option value="bank_iban">تحويل بنكي رسمي (IBAN)</option>
                <option value="instapay">InstaPay (مصر)</option>
                <option value="vodafone_cash">محفظة إلكترونية موثقة</option>
                <option value="wise">Wise الدولي</option>
            </select>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.86rem;">اسم صاحب الحساب المطابق للهوية *</label>
            <input type="text" name="holderName" required class="form-control" value="${esc(currentMember?.full_name || '')}">
        </div>
        <div>
            <label style="font-weight:700;font-size:0.86rem;">رقم الحساب / IBAN / المحفظة (مشفّر بالكامل) *</label>
            <input type="text" name="accountIdentifier" required minlength="6" class="form-control" placeholder="EG0000... أو 010...">
        </div>
    `, async (form, close) => {
        await window.SAWYAN.API.manageMemberPayoutMethod({
            memberId: currentMember.id,
            action: 'add',
            provider: form.provider.value,
            holderName: form.holderName.value.trim(),
            accountIdentifier: form.accountIdentifier.value.trim()
        });
        close();
        await refreshDashboardBundle();
    });
}

async function deletePayoutMethod(methodId) {
    const confirmed = (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.confirm === 'function')
        ? await window.SAWYAN.UI.confirm({
            title: 'تأكيد حذف وسيلة الاستلام',
            message: 'هل أنت متأكد من حذف وسيلة استلام الأرباح هذه؟ تنبيه مهم: إضافة أي وسيلة بديلة لاحقاً ستخضع لفترة تهدئة أمنية جديدة لمدة 72 ساعة قبل السحب.',
            confirmText: 'نعم، احذف الوسيلة',
            cancelText: 'تراجع',
            tone: 'danger'
        })
        : true;
    if (!confirmed) return;
    try {
        await window.SAWYAN.API.manageMemberPayoutMethod({ memberId: currentMember.id, action: 'delete', methodId });
        swMemToast('تم حذف وسيلة السحب بنجاح.', 'success');
        await refreshDashboardBundle();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
}

function openRequestWithdrawalModal() {
    const methods = (memberBundle && memberBundle.payment_methods) || [];
    const readyMethods = methods.filter(m => !(m.is_cooldown_active ?? m.in_cooldown));
    const profile = (memberBundle && memberBundle.profile) || {};
    const avail = Number(memberBundle?.wallet?.balance_usd || 0);

    if (profile.kyc_status !== 'verified') {
        swMemAlert('توثيق الهوية مطلوب أولاً', 'يشترط النظام توثيق الهوية الوطنية قبل أول سحب أرباح. يمكنك رفع وثيقتك من تبويب «الإعدادات».', 'warning');
        return;
    }
    if (readyMethods.length === 0) {
        swMemAlert('وسيلة السحب قيد التفعيل الأمني', 'يجب وجود وسيلة استلام أرباح واحدة على الأقل أتمت فترة الانتظار الأمنية (72 ساعة) قبل السحب.', 'warning');
        return;
    }
    if (avail < 10) {
        swMemAlert('الرصيد المتاح أقل من الحد الأدنى للسحب', `رصيدك المتاح حالياً هو ${fmtLocalFromUsd(avail)} (${fmtUsd(avail)})، والحد الأدنى لطلب السحب هو $10.00 (${fmtLocalFromUsd(10)}).`, 'info');
        return;
    }

    const defaultAmt = Math.min(avail, 25).toFixed(2);
    openMemberModal('💸 طلب سحب أرباح موثق', `
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px;font-size:0.84rem;color:#065f46;">
            الرصيد المتاح: <strong>${esc(fmtLocalFromUsd(avail))}</strong> (<code>${fmtUsd(avail)}</code>) • الحد الأدنى للسحب: <code>$10.00</code>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.86rem;">اختر وسيلة الاستلام الجاهزة *</label>
            <select name="methodId" class="form-control">
                ${readyMethods.map(m => `<option value="${m.id}">${esc(m.provider.toUpperCase())} — ****${esc(m.last_four)}</option>`).join('')}
            </select>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.86rem;">المبلغ المطلوب سحبه بالدولار (USD) *</label>
            <input type="number" step="0.01" min="10" max="${avail.toFixed(2)}" name="amountUsd" id="wdAmountUsdInput" required class="form-control" value="${defaultAmt}">
            <div id="wdLocalEquivPreview" style="margin-top:6px;font-size:0.82rem;font-weight:800;color:#047857;">≈ ${esc(fmtLocalFromUsd(Number(defaultAmt)))} بعملتك المحلية</div>
        </div>
    `, async (form, close) => {
        await window.SAWYAN.API.requestMemberWithdrawal({
            memberId: currentMember.id,
            paymentMethodId: form.methodId.value,
            amountUsd: Number(form.amountUsd.value)
        });
        close();
        await refreshDashboardBundle();
    });

    const wdIn = document.getElementById('wdAmountUsdInput');
    const wdPrev = document.getElementById('wdLocalEquivPreview');
    if (wdIn && wdPrev) {
        wdIn.addEventListener('input', () => {
            const v = Math.max(0, Number(wdIn.value || 0));
            wdPrev.textContent = `≈ ${fmtLocalFromUsd(v)} بعملتك المحلية`;
        });
    }
}

// ---------------------------------------------------------------------------
// Screen 6: Academy LMS (Stage 8 Preserved 100%)
// ---------------------------------------------------------------------------
function academyMediaBadge(mType) {
    const map = {
        video: ['🎬 فيديو', '#eff6ff', '#1d4ed8'],
        audio: ['🎧 صوتي', '#faf5ff', '#7e22ce'],
        article: ['📖 مقالة تدريبية', '#ecfdf5', '#065f46'],
        pdf: ['📄 ملف PDF', '#fff7ed', '#c2410c'],
        mixed: ['🧩 متعدد الوسائط', '#f1f5f9', '#334155']
    };
    const m = map[mType || 'article'] || ['📚 مادة', '#f1f5f9', '#334155'];
    return `<span style="display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-size:0.74rem;font-weight:800;background:${m[1]};color:${m[2]};">${m[0]}</span>`;
}

async function loadAcademy() {
    const page = document.getElementById('academyPage');
    if (!page || !currentMember) return;
    page.innerHTML = `<div data-spec-id="member-academy-lms" style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:28px;text-align:center;color:#64748b;font-weight:700;">جاري تحميل مسارات الأكاديمية وتقدمك التدريبي...</div>`;

    try {
        const cat = await window.SAWYAN.API.getMemberAcademyCatalog({ memberId: currentMember.id });
        memberAcademyState.catalog = cat || { tracks: [], lessons: [], summary: { total_lessons: 0, completed_lessons: 0, completion_pct: 0 } };
        renderMemberAcademyScreen();
    } catch (err) {
        page.innerHTML = `<div data-spec-id="member-academy-lms" style="background:#fef2f2;border:1.5px solid #fca5a5;border-radius:14px;padding:18px;color:#991b1b;font-weight:800;">⛔ تعذر تحميل الأكاديمية: ${esc(err.message)} <button type="button" class="btn btn-outline btn-sm" style="margin-right:10px;" onclick="loadAcademy()">إعادة المحاولة</button></div>`;
    }
}

function selectMemberAcademyTrack(trackId) {
    memberAcademyState.trackId = trackId || 'ALL';
    renderMemberAcademyScreen();
}

function renderMemberAcademyScreen() {
    const page = document.getElementById('academyPage');
    const cat = memberAcademyState.catalog;
    if (!page || !cat) return;

    const tracks = cat.tracks || [];
    const lessons = cat.lessons || [];
    const summary = cat.summary || { total_lessons: lessons.length, completed_lessons: 0, completion_pct: 0 };
    const activeTrackId = memberAcademyState.trackId || 'ALL';
    const visibleLessons = lessons.filter(l => activeTrackId === 'ALL' || String(l.track_id || '') === activeTrackId);

    page.innerHTML = `
        <div data-spec-id="member-academy-lms">
            <div style="background:linear-gradient(135deg,#0f172a,#065f46);color:#ffffff;border-radius:16px;padding:20px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                    <div>
                        <h2 style="margin:0;font-size:1.25rem;color:#ffffff;">🎓 أكاديمية SAWYAN التدريبية</h2>
                        <div style="font-size:0.84rem;color:#a7f3d0;margin-top:4px;">مسارات تعليمية متسلسلة لشرح المشروع والتدريبات الأساسية من الإدارة ومن قادة فريقك</div>
                    </div>
                    <div style="text-align:left;min-width:170px;">
                        <div style="font-size:0.8rem;color:#e2e8f0;font-weight:700;">تقدمك التدريبي: <b>${Number(summary.completed_lessons || 0)}</b> من <b>${Number(summary.total_lessons || 0)}</b> (${Number(summary.completion_pct || 0)}%)</div>
                        <div style="height:9px;background:rgba(255,255,255,0.18);border-radius:999px;overflow:hidden;margin-top:6px;">
                            <div style="height:100%;width:${Number(summary.completion_pct || 0)}%;background:linear-gradient(90deg,#10b981,#fbbf24);transition:width 0.3s;"></div>
                        </div>
                    </div>
                </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
                <button type="button" onclick="selectMemberAcademyTrack('ALL')" style="padding:8px 14px;border-radius:999px;border:1.5px solid ${activeTrackId === 'ALL' ? '#059669' : '#cbd5e1'};background:${activeTrackId === 'ALL' ? '#059669' : '#ffffff'};color:${activeTrackId === 'ALL' ? '#ffffff' : '#0f172a'};font-family:Tajawal,sans-serif;font-weight:800;font-size:0.84rem;cursor:pointer;">🌐 كل المسارات (${lessons.length})</button>
                ${tracks.map(t => {
                    const cnt = lessons.filter(l => String(l.track_id || '') === String(t.id)).length;
                    const done = lessons.filter(l => String(l.track_id || '') === String(t.id) && l.is_completed).length;
                    const act = activeTrackId === String(t.id);
                    return `<button type="button" onclick="selectMemberAcademyTrack('${esc(t.id)}')" style="padding:8px 14px;border-radius:999px;border:1.5px solid ${act ? '#059669' : '#cbd5e1'};background:${act ? '#059669' : '#ffffff'};color:${act ? '#ffffff' : '#0f172a'};font-family:Tajawal,sans-serif;font-weight:800;font-size:0.84rem;cursor:pointer;">${esc(t.icon || '🎓')} ${esc((t.title_i18n && (t.title_i18n.ar || t.title_i18n.en)) || t.slug)} (${done}/${cnt})</button>`;
                }).join('')}
            </div>

            ${visibleLessons.length === 0 ? `<div style="background:#fff;border:1px dashed #cbd5e1;border-radius:14px;padding:24px;text-align:center;color:#64748b;">لا توجد مواد منشورة ضمن هذا المسار حتى الآن.</div>` : `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px;">
                    ${visibleLessons.map((l, idx) => {
                        const titleAr = (l.title_i18n && (l.title_i18n.ar || l.title_i18n.en)) || l.slug;
                        const bodyAr = (l.content_i18n && (l.content_i18n.ar || l.content_i18n.en)) || '';
                        const trkTitle = (l.track_title_i18n && l.track_title_i18n.ar) || '';
                        const isLocked = Boolean(l.is_locked);
                        const isDone = Boolean(l.is_completed);
                        return `
                            <div style="background:#ffffff;border:1.5px solid ${isDone ? '#10b981' : isLocked ? '#e2e8f0' : '#cbd5e1'};border-radius:16px;padding:18px;display:flex;flex-direction:column;justify-content:space-between;opacity:${isLocked ? '0.8' : '1'};">
                                <div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                                        <span style="background:#0f172a;color:#ffffff;padding:2px 8px;border-radius:6px;font-size:0.74rem;font-weight:900;">${String(idx + 1).padStart(2, '0')}</span>
                                        ${academyMediaBadge(l.media_type)}
                                        ${l.duration_minutes ? `<span style="font-size:0.74rem;color:#64748b;font-weight:700;">⏱ ${Number(l.duration_minutes)} دقيقة</span>` : ''}
                                        ${isDone ? `<span class="badge badge-success">✅ مكتمل</span>` : isLocked ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:800;">🔒 أكمل السابق أولاً</span>` : ''}
                                    </div>
                                    ${trkTitle ? `<div style="font-size:0.74rem;color:#059669;font-weight:800;margin-bottom:4px;">${esc((l.track_icon || '🎓') + ' ' + trkTitle)}</div>` : ''}
                                    ${l.author_type === 'tree_leader' ? `<div style="font-size:0.74rem;color:#92400e;font-weight:800;margin-bottom:4px;">👑 مادة من قائد فريقك: ${esc(l.author_name || '')}</div>` : ''}
                                    <h3 style="margin:0 0 8px;color:#0f172a;font-size:1.02rem;line-height:1.45;">${esc(titleAr)}</h3>
                                    <p style="margin:0;color:#475569;font-size:0.86rem;line-height:1.65;">${esc(bodyAr.slice(0, 150))}${bodyAr.length > 150 ? '...' : ''}</p>
                                </div>
                                <div style="margin-top:14px;padding-top:10px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                    <button type="button" ${isLocked ? 'disabled' : ''} onclick="openMemberAcademyPlayer('${esc(l.id)}')" class="btn ${isDone ? 'btn-outline' : 'btn-primary'} btn-sm" style="flex:1;">
                                        ${isLocked ? '🔒 مغلق حتى إتمام المادة السابقة' : isDone ? '🔁 مراجعة المادة' : (l.media_type === 'video' ? '▶️ مشاهدة الدرس والتدريب' : '📖 قراءة وإتمام المادة')}
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

function openMemberAcademyPlayer(lessonId) {
    const cat = memberAcademyState.catalog;
    if (!cat) return;
    const lessons = cat.lessons || [];
    const idx = lessons.findIndex(l => String(l.id) === String(lessonId));
    if (idx === -1) return;
    const l = lessons[idx];
    if (l.is_locked) {
        swMemToast('يرجى إتمام المادة السابقة أولاً لفتح هذه المادة.', 'warning');
        return;
    }

    let ov = document.getElementById('sawyanAcademyPlayerOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'sawyanAcademyPlayerOverlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.68);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10020;overflow-y:auto;';
        document.body.appendChild(ov);
    }

    const titleAr = (l.title_i18n && (l.title_i18n.ar || l.title_i18n.en)) || l.slug;
    const bodyAr = (l.content_i18n && (l.content_i18n.ar || l.content_i18n.en)) || '';
    const trkTitle = (l.track_title_i18n && l.track_title_i18n.ar) || '';
    const playerHtml = (window.SAWYAN && window.SAWYAN.API) ? window.SAWYAN.API.buildAcademyMediaPlayerHtml(l.media_url, l.media_type) : '';
    const nextLesson = lessons[idx + 1] && !lessons[idx + 1].is_locked ? lessons[idx + 1] : null;
    const nextDisabledAfterComplete = lessons[idx + 1] || null;

    ov.style.display = 'flex';
    ov.innerHTML = `
        <div style="background:#ffffff;border-radius:18px;max-width:760px;width:100%;max-height:92vh;overflow-y:auto;padding:22px;box-shadow:0 24px 54px rgba(0,0,0,0.35);direction:rtl;font-family:Tajawal,sans-serif;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;border-bottom:1.5px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px;">
                <div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:6px;">
                        ${trkTitle ? `<span style="background:#f1f5f9;color:#065f46;padding:2px 9px;border-radius:999px;font-size:0.74rem;font-weight:800;">${esc((l.track_icon || '🎓') + ' ' + trkTitle)}</span>` : ''}
                        ${academyMediaBadge(l.media_type)}
                        ${l.duration_minutes ? `<span style="font-size:0.75rem;color:#64748b;font-weight:700;">⏱ ${Number(l.duration_minutes)} دقيقة</span>` : ''}
                    </div>
                    <h3 style="margin:0;color:#0f172a;font-size:1.15rem;">${esc(titleAr)}</h3>
                </div>
                <button type="button" onclick="document.getElementById('sawyanAcademyPlayerOverlay').style.display='none'" style="border:none;background:#f1f5f9;border-radius:8px;width:34px;height:34px;cursor:pointer;font-weight:900;flex-shrink:0;">✕</button>
            </div>
            ${playerHtml}
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;line-height:1.8;color:#1e293b;font-size:0.93rem;white-space:pre-line;margin-bottom:14px;">${esc(bodyAr)}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <button type="button" id="svMemAcadToggleBtn" onclick="toggleMemberAcademyLessonComplete('${esc(l.id)}', ${l.is_completed ? "'reset'" : "'complete'"})" class="btn ${l.is_completed ? 'btn-outline' : 'btn-primary'}" style="flex:1;min-width:210px;">
                    ${l.is_completed ? '↺ مكتمل — إلغاء علامة الإتمام' : '✅ أتممت هذه المادة (تسجيل الإنجاز)'}
                </button>
                ${nextLesson
                    ? `<button type="button" onclick="openMemberAcademyPlayer('${esc(nextLesson.id)}')" class="btn btn-outline">المادة التالية ←</button>`
                    : (nextDisabledAfterComplete ? `<span style="font-size:0.78rem;color:#64748b;font-weight:700;">🔒 أتمّ هذه المادة لفتح الدرس التالي</span>` : '')}
            </div>
        </div>
    `;
}

async function toggleMemberAcademyLessonComplete(lessonId, action) {
    const btn = document.getElementById('svMemAcadToggleBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري حفظ التقدم...'; }
    try {
        await window.SAWYAN.API.memberUpdateAcademyProgress({ memberId: currentMember.id, courseId: lessonId, action: action || 'complete' });
        const cat = await window.SAWYAN.API.getMemberAcademyCatalog({ memberId: currentMember.id });
        memberAcademyState.catalog = cat;
        renderMemberAcademyScreen();
        openMemberAcademyPlayer(lessonId);
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
        if (btn) { btn.disabled = false; }
    }
}
window.selectMemberAcademyTrack = selectMemberAcademyTrack;
window.openMemberAcademyPlayer = openMemberAcademyPlayer;
window.toggleMemberAcademyLessonComplete = toggleMemberAcademyLessonComplete;

// ---------------------------------------------------------------------------
// Screen 7 & 8: Nearby Merchants + Leaflet Map + Haversine + Google Maps + Path B Live Calc
// ---------------------------------------------------------------------------
function getFilteredMerchantsList(myCoords) {
    const baseSource = (Array.isArray(radarCatalogOverride) ? radarCatalogOverride : liveCatalog).map(m => {
        const dist = (m.distance_km !== undefined && m.distance_km !== null)
            ? Number(m.distance_km)
            : haversineKm(myCoords.lat, myCoords.lng, m.latitude, m.longitude);
        return { ...m, _distanceKm: dist };
    });

    return baseSource.filter(m => {
        if (merchantFilterState.country !== 'ALL' && String(m.country_code || '').toUpperCase() !== merchantFilterState.country) return false;
        if (merchantFilterState.category !== 'all' && String(m.category || m.category_code || '').toLowerCase() !== merchantFilterState.category) return false;
        if (merchantFilterState.q) {
            const cMeta = window.SAWYAN && typeof window.SAWYAN.getCountryByCode === 'function'
                ? window.SAWYAN.getCountryByCode(m.country_code) : null;
            const hay = `${m.business_name || ''} ${m.branch_name || ''} ${m.address || ''} ${m.merchant_code || ''} ${m.country_code || ''} ${cMeta ? cMeta.nameAr : ''} ${cMeta ? cMeta.nameEn : ''}`;
            if (window.SAWYAN && window.SAWYAN.SmartSearch && typeof window.SAWYAN.SmartSearch.matchesBilingualQuery === 'function') {
                if (!window.SAWYAN.SmartSearch.matchesBilingualQuery(hay, merchantFilterState.q)) return false;
            } else if (!hay.toLowerCase().includes(merchantFilterState.q.toLowerCase())) {
                return false;
            }
        }
        return true;
    }).sort((a, b) => {
        const oa = liveFlashOffersByMerchant.has(String(a.merchant_id)) ? 1 : 0;
        const ob = liveFlashOffersByMerchant.has(String(b.merchant_id)) ? 1 : 0;
        if (oa !== ob) return ob - oa;
        if (merchantFilterState.sort === 'cashback_desc') return Number(b.plan_cashback_pct || 0) - Number(a.plan_cashback_pct || 0);
        if (merchantFilterState.sort === 'name') {
            const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
            return ls ? ls.compareStrings(a.business_name || '', b.business_name || '', ls.getDocLang()) : String(a.business_name || '').localeCompare(String(b.business_name || ''), getMemLocale());
        }
        const da = a._distanceKm !== null ? a._distanceKm : 999999;
        const db = b._distanceKm !== null ? b._distanceKm : 999999;
        return da - db;
    });
}

function updateMemberMerchantsResults() {
    const myCoords = getMemberGeoCoords();
    const filtered = getFilteredMerchantsList(myCoords);
    const favIds = new Set(((memberBundle?.profile?.metadata?.favorite_merchant_ids) || []).map(String));

    const cntEl = document.getElementById('memberMerchantsCountBadge');
    if (cntEl) cntEl.textContent = `(${filtered.length})`;
    const radarResetBtn = document.getElementById('memberMerchResetRadarBtn');
    if (radarResetBtn) radarResetBtn.style.display = radarCatalogOverride ? 'inline-flex' : 'none';

    const gridSlot = document.getElementById('memberMerchantsGridSlot');
    if (gridSlot) {
        gridSlot.innerHTML = filtered.length === 0 ? '<p class="empty-state">لا توجد متاجر نشطة مطابقة لخيارات البحث الحالية.</p>' : `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:14px;">
                ${filtered.map(m => {
                    const isFav = favIds.has(String(m.merchant_id));
                    const hasCoords = Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude));
                    const gmapsUrl = hasCoords
                        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.latitude + ',' + m.longitude)}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((m.business_name || '') + ' ' + (m.address || ''))}`;
                    const up = window.SAWYAN?.ImageUpload;
                    const safeLogo = (up && up.isSafeMediaUrl(m.logo_url)) ? m.logo_url : null;
                    const safeCover = (up && up.isSafeMediaUrl(m.cover_image_url)) ? m.cover_image_url : null;
                    const coverKey = safeCover && up ? up.registerLightboxItem(safeCover, esc(m.business_name)) : null;
                    const flagHtml = (window.SAWYAN?.Flags?.svg) ? window.SAWYAN.Flags.svg(m.country_code, 16) : esc(m.country_code || '');
                    const activeOffer = liveFlashOffersByMerchant.get(String(m.merchant_id)) || null;
                    return `
                        <div style="background:#fff;border:${activeOffer ? '2px solid #f59e0b;box-shadow:0 6px 20px rgba(245,158,11,0.16)' : '1.5px solid #cbd5e1'};border-radius:16px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
                            <div>
                                ${activeOffer ? `<div style="background:linear-gradient(90deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:10px;padding:7px 10px;margin-bottom:9px;font-size:0.8rem;color:#78350f;font-weight:800;line-height:1.45;">🔥 عرض حصري الآن: ${esc(activeOffer.title)} <span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:999px;font-size:0.68rem;margin-right:4px;">⏳ ${esc(formatMemberOfferRemainingAr(activeOffer.remaining_seconds))}</span></div>` : ''}
                                ${safeCover ? `<img src="${esc(safeCover)}" data-sw-lightbox-key="${coverKey || ''}" alt="${esc(m.business_name)}" style="width:100%;height:110px;object-fit:cover;border-radius:10px;margin-bottom:10px;cursor:zoom-in;">` : ''}
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                    <div style="display:flex;align-items:center;gap:8px;min-width:0;">
                                        ${safeLogo ? `<img src="${esc(safeLogo)}" alt="" style="width:36px;height:36px;border-radius:10px;object-fit:cover;border:1px solid #cbd5e1;flex-shrink:0;">` : ''}
                                        <strong style="overflow:hidden;text-overflow:ellipsis;">${esc(m.business_name)}</strong>
                                    </div>
                                    <button type="button" onclick="toggleMerchantFavorite('${m.merchant_id}')" style="border:none;background:transparent;font-size:1.25rem;cursor:pointer;" title="المفضلة">${isFav ? '❤️' : '🤍'}</button>
                                </div>
                                <div style="font-size:0.84rem;color:#475569;margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">🏢 ${esc(m.branch_name)} • ${flagHtml} <span>${esc(m.country_code || '')}</span></div>
                                <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">📍 ${esc(m.address || 'غير محدد')} ${m._distanceKm !== null ? `• <strong style="color:#0f172a;">${m._distanceKm.toFixed(2)} كم</strong>` : ''}</div>
                                <div style="margin:10px 0;display:flex;justify-content:space-between;align-items:center;">
                                    <span style="background:#ecfdf5;color:#047857;font-weight:800;font-size:0.82rem;padding:4px 10px;border-radius:999px;">✨ عائدات خطة الدخل: ${Number(m.plan_cashback_pct).toFixed(2)}%</span>
                                    <small>${esc(m.currency_code || '')}</small>
                                </div>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button type="button" class="btn btn-primary btn-sm" style="flex:1;" onclick="submitPendingPurchasePrompt('${m.merchant_id}', '${m.branch_id}', '${esc(m.business_name)}', '${esc(m.currency_code || '')}', ${Number(m.plan_cashback_pct || 7.5)})">
                                    📝 توثيق فاتورة
                                </button>
                                <button type="button" class="btn btn-outline btn-sm" style="border-color:#fca5a5;color:#b91c1c;" onclick="openMerchantComplaintModal('${m.merchant_id}', '${esc(m.business_name)}')">📣 شكوى</button>
                                <a href="${esc(gmapsUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">🗺️ خرائط جوجل</a>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    renderMemberMerchantsLeafletMap(myCoords, filtered);
}

async function loadNearbyMerchants() {
    const page = document.getElementById('merchantsPage');
    if (!page) return;
    if (liveCatalog.length === 0) {
        await loadPublicMerchantsCatalogSafe();
    }

    const myCoords = getMemberGeoCoords();
    if (!document.getElementById('memberMerchantsShell')) {
        page.innerHTML = `
            <div id="memberMerchantsShell">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
                    <div>
                        <h2 style="margin:0;">🏪 التجار المعتمدون والخريطة الجغرافية <span id="memberMerchantsCountBadge"></span></h2>
                        <small style="color:#64748b;">تعرض البطاقات صافي عائدات فريقك من كل متجر • موقعك المرجعي: ${myCoords.lat.toFixed(4)}, ${myCoords.lng.toFixed(4)}</small>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary btn-sm" onclick="openMemberPurchaseModal()">🧾 توثيق فاتورة شراء</button>
                        <button type="button" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;" onclick="openMerchantComplaintModal()">📣 إبلاغ عن تاجر</button>
                        <button type="button" class="btn btn-outline btn-sm" onclick="triggerGpsRadarSearch()">📍 تحديث الأقرب مني (GPS)</button>
                        <button type="button" id="memberMerchResetRadarBtn" class="btn btn-outline btn-sm" style="display:none;" onclick="resetRadarFilter()">إلغاء فلتر المسافة</button>
                    </div>
                </div>

                <div data-spec-id="member-merchants-leaflet-map" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:8px;margin-bottom:14px;">
                    <div id="memberMerchantsMap" style="height:260px;width:100%;border-radius:12px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#475569;font-weight:700;">
                        🗺️ جاري تهيئة خريطة التجار حولك...
                    </div>
                </div>

                <div data-spec-id="member-merchants-filters" style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:12px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:10px;">
                    <input type="search" id="memberMerchSearch" class="form-control" placeholder="ابحث باسم المتجر أو العنوان..." value="${esc(merchantFilterState.q)}">
                    <select id="memberMerchCountry" class="form-control">
                        <option value="ALL" ${merchantFilterState.country === 'ALL' ? 'selected' : ''}>🌍 كل الدول</option>
                        ${buildWorldCountryOptions({ selectedCode: merchantFilterState.country === 'ALL' ? '' : merchantFilterState.country, includeAutoOption: false })}
                    </select>
                    <select id="memberMerchCategory" class="form-control">
                        <option value="all" ${merchantFilterState.category === 'all' ? 'selected' : ''}>📂 كل الفئات</option>
                        <option value="supermarket" ${merchantFilterState.category === 'supermarket' ? 'selected' : ''}>🛒 سوبرماركت ومواد غذائية</option>
                        <option value="restaurant" ${merchantFilterState.category === 'restaurant' ? 'selected' : ''}>🍽️ مطاعم</option>
                        <option value="cafe" ${merchantFilterState.category === 'cafe' ? 'selected' : ''}>☕ كافيهات ومخبوزات</option>
                        <option value="pharmacy" ${merchantFilterState.category === 'pharmacy' ? 'selected' : ''}>💊 صيدليات</option>
                        <option value="health" ${merchantFilterState.category === 'health' ? 'selected' : ''}>🏥 صحة وعيادات ومختبرات</option>
                        <option value="clothing" ${merchantFilterState.category === 'clothing' ? 'selected' : ''}>👗 ملابس وأزياء</option>
                        <option value="beauty" ${merchantFilterState.category === 'beauty' ? 'selected' : ''}>✨ تجميل وعناية</option>
                        <option value="electronics" ${merchantFilterState.category === 'electronics' ? 'selected' : ''}>📱 إلكترونيات</option>
                        <option value="automotive" ${merchantFilterState.category === 'automotive' ? 'selected' : ''}>🚗 سيارات وصيانة</option>
                        <option value="education" ${merchantFilterState.category === 'education' ? 'selected' : ''}>🎓 تعليم وتدريب</option>
                        <option value="travel" ${merchantFilterState.category === 'travel' ? 'selected' : ''}>✈️ سياحة وسفر</option>
                        <option value="services" ${merchantFilterState.category === 'services' ? 'selected' : ''}>🛠️ خدمات منزلية ومهنية</option>
                    </select>
                    <select id="memberMerchSort" data-spec-id="member-merchants-sort-select" class="form-control">
                        <option value="distance" ${merchantFilterState.sort === 'distance' ? 'selected' : ''}>📍 الأقرب مسافة (كم)</option>
                        <option value="cashback_desc" ${merchantFilterState.sort === 'cashback_desc' ? 'selected' : ''}>💎 أعلى عائد خطة دخل (%)</option>
                        <option value="name" ${merchantFilterState.sort === 'name' ? 'selected' : ''}>🔤 الترتيب الأبجدي</option>
                    </select>
                </div>

                <div data-spec-id="member-merchants-grid" id="memberMerchantsGridSlot"></div>
            </div>
        `;

        document.getElementById('memberMerchSearch')?.addEventListener('input', (e) => { merchantFilterState.q = e.target.value; updateMemberMerchantsResults(); });
        document.getElementById('memberMerchCountry')?.addEventListener('change', (e) => { merchantFilterState.country = e.target.value || 'ALL'; updateMemberMerchantsResults(); });
        document.getElementById('memberMerchCategory')?.addEventListener('change', (e) => { merchantFilterState.category = e.target.value; updateMemberMerchantsResults(); });
        document.getElementById('memberMerchSort')?.addEventListener('change', (e) => { merchantFilterState.sort = e.target.value; updateMemberMerchantsResults(); });

        if (window.SAWYAN && window.SAWYAN.SmartSearch) {
            const mcSel = document.getElementById('memberMerchCountry');
            if (mcSel) {
                window.SAWYAN.SmartSearch.attachToSelect(mcSel, {
                    kind: 'country',
                    compact: true,
                    placeholder: 'ابحث عن الدولة (عربي / English)...',
                    showLetterHeaders: true,
                    skipEmptyPlaceholder: false
                });
            }
        }
    }

    updateMemberMerchantsResults();
}

function renderMemberMerchantsLeafletMap(myCoords, merchants) {
    const mapDiv = document.getElementById('memberMerchantsMap');
    if (!mapDiv) return;
    if (typeof L === 'undefined') {
        mapDiv.innerHTML = `<div style="padding:16px;text-align:center;">🗺️ خريطة التجار المعتمدين (${merchants.length} فرع حول ${myCoords.lat.toFixed(3)}, ${myCoords.lng.toFixed(3)})</div>`;
        return;
    }
    try {
        let map = window.__sawyanMerchantsMap;
        if (!map || !mapDiv._leaflet_id) {
            if (map) { try { map.remove(); } catch (_) {} }
            mapDiv.innerHTML = '';
            // Zero Scroll-Jacking: scrollWheelZoom: false so page scrolls freely over the map
            map = L.map(mapDiv, { scrollWheelZoom: false }).setView([myCoords.lat, myCoords.lng], 11);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
            window.__sawyanMerchantsMap = map;
            window.__sawyanMerchantsMarkersLayer = L.layerGroup().addTo(map);
        }
        const layer = window.__sawyanMerchantsMarkersLayer || L.layerGroup().addTo(map);
        window.__sawyanMerchantsMarkersLayer = layer;
        layer.clearLayers();
        L.circleMarker([myCoords.lat, myCoords.lng], { radius: 8, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 })
            .addTo(layer).bindPopup('📍 موقعي المرجعي');
        const bounds = [[myCoords.lat, myCoords.lng]];
        merchants.forEach(m => {
            if (Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude))) {
                const lat = Number(m.latitude);
                const lng = Number(m.longitude);
                L.marker([lat, lng]).addTo(layer)
                    .bindPopup(`<b>${esc(m.business_name)}</b><br>${esc(m.branch_name || '')}<br>عائد خطة الدخل: ${Number(m.plan_cashback_pct || 0).toFixed(2)}%`);
                bounds.push([lat, lng]);
            }
        });
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
        setTimeout(() => { try { map.invalidateSize(); } catch (_) {} }, 150);
    } catch (_) {
        mapDiv.innerHTML = `<div style="padding:16px;text-align:center;">🗺️ متاح ${merchants.length} فرع معتمد.</div>`;
    }
}

async function triggerGpsRadarSearch() {
    const fallbackCoords = getMemberGeoCoords();
    const runWithCoords = async (lat, lng) => {
        window.__liveDeviceGps = { lat, lng };
        try {
            const rows = await window.SAWYAN.API.getMerchantsRadar({ lat, lng, radiusKm: 50 });
            radarCatalogOverride = Array.isArray(rows) ? rows : [];
            await loadNearbyMerchants();
        } catch (err) {
            swMemToast('تعذر تشغيل الرادار الجغرافي: ' + swMemErrText(err), 'error');
        }
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => runWithCoords(pos.coords.latitude, pos.coords.longitude),
            () => runWithCoords(fallbackCoords.lat, fallbackCoords.lng),
            { timeout: 4000 }
        );
    } else {
        await runWithCoords(fallbackCoords.lat, fallbackCoords.lng);
    }
}

function resetRadarFilter() {
    radarCatalogOverride = null;
    loadNearbyMerchants();
}

async function openMemberPurchaseModal(preMerchantId = null, preBranchId = null, preName = '', preCurr = '', prePlanPct = null) {
    if (!liveCatalog || liveCatalog.length === 0) {
        await loadPublicMerchantsCatalogSafe();
    }
    const catalog = Array.isArray(liveCatalog) ? liveCatalog : [];
    const plan = getCountryPlanInfo(memberBundle?.profile?.country_code);

    if (catalog.length === 0 && !preMerchantId) {
        openMemberModal('🧾 توثيق فاتورة شراء جديدة', `
            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:14px;color:#92400e;font-size:0.88rem;line-height:1.65;">
                ℹ️ لا توجد متاجر متاحة لتسجيل فاتورة جديدة في هذا النطاق حالياً.<br>
                <span style="display:block;margin-top:6px;">يمكنك تصفح كل الدول أو دعوة متجرك المفضل للانضمام لـ SAWYAN.</span>
            </div>
        `, async (_f, close) => { close(); });
        const subBtn = document.getElementById('sawyanModalSubmitBtn');
        if (subBtn) subBtn.style.display = 'none';
        return;
    }

    const initialRow = preMerchantId
        ? (catalog.find(m => String(m.merchant_id) === String(preMerchantId) && (!preBranchId || String(m.branch_id) === String(preBranchId))) || {
            merchant_id: preMerchantId,
            branch_id: preBranchId,
            business_name: preName || 'متجر SAWYAN',
            branch_name: 'الفرع الرئيسي',
            currency_code: preCurr || plan.currencyCode,
            plan_cashback_pct: prePlanPct || 7.5
        })
        : catalog[0];

    let mpReceiptUp = null;

    openMemberModal(`🧾 توثيق فاتورة مشتريات — ${preMerchantId ? esc(initialRow.business_name) : 'أرسل الفاتورة بسهولة'}`, `
        <input type="hidden" id="mpModeInput" value="unified_pending">
        <div id="mpModeExplainer" style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:8px 12px;font-size:0.8rem;color:#065f46;font-weight:700;line-height:1.5;">
            🧾 اختر المتجر وأدخل قيمة الفاتورة (صورة الإيصال اختيارية) — يصل الإشعار فوراً للمتجر للاعتماد.
        </div>

        <div id="mpMerchantSelectorWrap" style="${preMerchantId ? 'display:none;' : ''}">
            <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">🏪 المتجر والفرع المعتمد *</label>
            <input type="search" id="mpMerchantSearchInput" class="form-control" placeholder="ابحث باسم المتجر أو الكود أو المدينة..." style="margin-bottom:6px;">
            <select id="mpMerchantSelect" class="form-control" required>
                ${catalog.map(m => `<option value="${esc(m.merchant_id)}::${esc(m.branch_id || '')}" data-pct="${Number(m.plan_cashback_pct || 7.5)}" data-curr="${esc(m.currency_code || plan.currencyCode)}" data-cc="${esc(m.country_code || '')}" ${(String(m.merchant_id) === String(initialRow.merchant_id) && String(m.branch_id || '') === String(initialRow.branch_id || '')) ? 'selected' : ''}>${esc(m.business_name)} (${esc(m.branch_name || 'الفرع الرئيسي')}) — عائد ${Number(m.plan_cashback_pct || 7.5).toFixed(2)}% (${esc(m.currency_code || '')})</option>`).join('')}
            </select>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;">
            <div>
                <label style="font-weight:800;font-size:0.84rem;">💰 قيمة الفاتورة (<span id="mpCurrBadge">${esc(initialRow.currency_code || plan.currencyCode)}</span>) *</label>
                <input type="number" step="0.01" min="1" name="amount" id="pendingInvoiceAmtInput" required class="form-control" placeholder="500.00">
            </div>
            <div>
                <label style="font-weight:800;font-size:0.84rem;">💳 وسيلة الدفع *</label>
                <select name="paymentType" id="mpPaymentType" class="form-control">
                    ${SW_MEM_PAYMENT_TYPES.map(pt => `<option value="${pt.value}">${pt.label}</option>`).join('')}
                </select>
            </div>
        </div>

        <div id="mpPendingCalcPreview" style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:0.82rem;color:#065f46;">
            💡 نسبة عائد خطة الدخل: <strong>${Number(initialRow.plan_cashback_pct || 7.5).toFixed(2)}%</strong> — اكتب قيمة الفاتورة لمعاينة العائد المُضاف لصندوق الهدف.
        </div>

        <div id="mpUniqueRefGroup" style="display:none;">
            <label style="font-weight:800;font-size:0.84rem;">🔢 رقم مرجع العملية / التحويل (اختياري)</label>
            <input type="text" name="uniquePaymentRef" id="mpUniquePaymentRef" class="form-control" placeholder="مرجع الدفع الفريد (لمنع التكرار)">
        </div>

        <div>
            <label id="mpReceiptLabel" style="font-weight:800;font-size:0.84rem;">📷 صورة الفاتورة أو الإيصال (اختياري)</label>
            <div style="font-size:0.75rem;color:#64748b;margin:2px 0 6px;">اختياري — يُنصح بإرفاق صورة الإيصال/السلعة أو الاحتفاظ بها لحماية حقك في حال النزاع.</div>
            <div id="mpReceiptUploader"></div>
            <input type="hidden" name="receiptUrl" id="mpReceiptUrl">
        </div>
    `, async (_form, close) => {
        const selEl = document.getElementById('mpMerchantSelect');
        let merchId = preMerchantId;
        let brId = preBranchId;
        if (!preMerchantId && selEl && selEl.value) {
            const parts = selEl.value.split('::');
            merchId = parts[0] || null;
            brId = parts[1] || null;
        }
        if (!merchId) throw new Error('يرجى اختيار المتجر أولاً.');

        const amount = Number(document.getElementById('pendingInvoiceAmtInput')?.value || 0);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('أدخل قيمة فاتورة صالحة أكبر من صفر.');

        const pt = document.getElementById('mpPaymentType')?.value || 'cash';
        const refVal = (document.getElementById('mpUniquePaymentRef')?.value || '').trim() || null;
        const receiptVal = ((mpReceiptUp && mpReceiptUp.getValue()) || document.getElementById('mpReceiptUrl')?.value || '').trim() || null;

        try {
            const res = await window.SAWYAN.API.submitMemberPendingPurchase({
                memberId: currentMember.id,
                merchantId: merchId,
                branchId: brId || null,
                amount,
                paymentType: pt,
                receiptUrl: receiptVal,
                uniquePaymentRef: refVal
            });
            if (res && res.success === false) {
                throw new Error(swMemErrText(res.error_code || res.status || 'تعذر تسجيل طلب التوثيق.'));
            }
            close();
            const isCompleted = res.status === 'completed';
            const statusText = isCompleted
                ? 'تم اعتماد الفاتورة وإضافتها لصندوق هدفك الشهري فوراً!'
                : (res.status === 'awaiting_merchant_topup'
                    ? 'تم حفظ الفاتورة وستُعتمد تلقائياً فور استكمال التاجر.'
                    : 'وصل طلبك فوراً لموبايل التاجر وموظفي المتجر — أخبرهم بالكود أدناه إذا كنت داخل المحل، أو تابعه من «طلباتي المعلقة».');
            await swMemAlert(
                isCompleted ? 'تم اعتماد الفاتورة بنجاح' : 'تم إرسال طلب التوثيق بنجاح',
                `🧾 كود التوثيق القصير:\n${res.sw_short_code}\n\n📌 ${statusText}`,
                isCompleted ? 'success' : 'info',
                isCompleted ? [] : [{ label: '⏳ عرض طلباتي المعلقة', onClick: () => goToPage('myPending') }]
            );
            await refreshDashboardBundle();
        } catch (err) {
            throw new Error(swMemErrText(err));
        }
    });

    if (window.SAWYAN?.ImageUpload) {
        mpReceiptUp = window.SAWYAN.ImageUpload.mountUploader(document.getElementById('mpReceiptUploader'), {
            label: '📷 التقط أو ارفع صورة الفاتورة / الإيصال (اختياري)',
            maxDim: 1280,
            maxChars: 360000,
            onChange: (v) => { const el = document.getElementById('mpReceiptUrl'); if (el) el.value = v || ''; }
        });
    }

    const expEl = document.getElementById('mpModeExplainer');
    const ptSel = document.getElementById('mpPaymentType');
    const refGrp = document.getElementById('mpUniqueRefGroup');
    const amtIn = document.getElementById('pendingInvoiceAmtInput');
    const prevEl = document.getElementById('mpPendingCalcPreview');
    const merchSel = document.getElementById('mpMerchantSelect');
    const merchSearch = document.getElementById('mpMerchantSearchInput');
    const currBadge = document.getElementById('mpCurrBadge');

    function getSelectedMeta() {
        if (!preMerchantId && merchSel && merchSel.selectedOptions && merchSel.selectedOptions[0]) {
            const opt = merchSel.selectedOptions[0];
            const curr = opt.dataset.curr || plan.currencyCode;
            const cc = opt.dataset.cc || '';
            return {
                pct: Number(opt.dataset.pct || 7.5),
                curr,
                fx: resolveCurrencyFx(cc, curr)
            };
        }
        const curr = initialRow.currency_code || plan.currencyCode;
        return {
            pct: Number(initialRow.plan_cashback_pct || 7.5),
            curr,
            fx: resolveCurrencyFx(initialRow.country_code || '', curr)
        };
    }

    function updatePreview() {
        const sm = getSelectedMeta();
        if (currBadge) currBadge.textContent = sm.curr;
        if (!prevEl) return;
        const v = parseFloat(amtIn?.value || '0') || 0;
        if (v > 0) {
            const addLocal = v * (sm.pct / 100);
            const addUsd = addLocal / Math.max(Number(sm.fx || 1), 0.0001);
            const targetLocal = plan.targetUsd * plan.fx;
            const addHomeLocal = addUsd * plan.fx;
            const covPct = Math.min(100, Math.round((addUsd / Math.max(plan.targetUsd, 0.01)) * 100));
            const crossNote = String(sm.curr).toUpperCase() !== String(plan.currencyCode).toUpperCase()
                ? ` (≈ <strong>${addHomeLocal.toFixed(2)} ${esc(plan.currencyCode)}</strong> / <code>${fmtUsd(addUsd)}</code>)`
                : '';
            prevEl.innerHTML = `✨ العائد لخطة الدخل (${sm.pct.toFixed(2)}%): <strong>${addLocal.toFixed(2)} ${esc(sm.curr)}</strong>${crossNote} — يغطي نحو <strong>${covPct}%</strong> من هدفك الشهري (${targetLocal.toFixed(2)} ${esc(plan.currencyCode)})`;
        } else {
            prevEl.innerHTML = `💡 نسبة عائد خطة الدخل بهذا المتجر: <strong>${sm.pct.toFixed(2)}%</strong> — اكتب مبلغ الفاتورة لمعاينة الإضافة لصندوق هدفك.`;
        }
    }

    function syncPaymentUi() {
        const pt = ptSel?.value || 'cash';
        const ptMeta = getMemberPayTypeMeta(pt);
        if (refGrp) refGrp.style.display = ptMeta.needsRef ? 'block' : 'none';
        if (expEl) {
            if (ptMeta.deferred) {
                expEl.style.background = '#fffbeb';
                expEl.style.borderColor = '#fcd34d';
                expEl.style.color = '#92400e';
                expEl.innerHTML = '🚚 <strong>دفع عند الاستلام / شيك مؤجل:</strong> يصل طلبك للتاجر وموظفيه الآن، ويُعتمد فور الاستلام والتحصيل الفعلي لتغذية صندوق هدفك تلقائياً.';
            } else {
                expEl.style.background = '#f0fdf4';
                expEl.style.borderColor = '#86efac';
                expEl.style.color = '#065f46';
                expEl.innerHTML = '🧾 <strong>طلب توثيق موحّد (داخل المحل أو دليفري / أونلاين):</strong> أدخل قيمة الفاتورة وأرسل الطلب؛ سيصل إشعار فوري لموبايل التاجر وموظفي المتجر لاعتماده وإضافة العائد لصندوق هدفك.';
            }
        }
    }

    ptSel?.addEventListener('change', syncPaymentUi);
    amtIn?.addEventListener('input', updatePreview);
    merchSel?.addEventListener('change', updatePreview);

    if (merchSearch && merchSel) {
        merchSearch.addEventListener('input', () => {
            const q = merchSearch.value.trim().toLowerCase();
            const list = catalog.filter(m => !q || `${m.business_name} ${m.branch_name} ${m.merchant_code} ${m.address || ''}`.toLowerCase().includes(q));
            merchSel.innerHTML = list.length === 0
                ? '<option value="">لا توجد نتائج مطابقة</option>'
                : list.map(m => `<option value="${esc(m.merchant_id)}::${esc(m.branch_id || '')}" data-pct="${Number(m.plan_cashback_pct || 7.5)}" data-curr="${esc(m.currency_code || plan.currencyCode)}" data-cc="${esc(m.country_code || '')}">${esc(m.business_name)} (${esc(m.branch_name || 'الفرع الرئيسي')}) — عائد ${Number(m.plan_cashback_pct || 7.5).toFixed(2)}% (${esc(m.currency_code || '')})</option>`).join('');
            updatePreview();
        });
    }

    syncPaymentUi();
    updatePreview();
}
window.openMemberPurchaseModal = openMemberPurchaseModal;

function submitPendingPurchasePrompt(merchantId, branchId, name, currencyCode = '', planPct = 7.5) {
    openMemberPurchaseModal(merchantId, branchId, name, currencyCode, planPct);
}

async function toggleMerchantFavorite(merchantId) {
    try {
        await window.SAWYAN.API.updateMemberProfileSettings({
            memberId: currentMember.id,
            favoriteMerchantId: merchantId,
            favoriteAction: 'toggle'
        });
        await refreshDashboardBundle();
    } catch (e) {
        swMemToast('تعذر تحديث المفضلة: ' + swMemErrText(e), 'error');
    }
}

async function loadFavorites() {
    const page = document.getElementById('favoritesPage');
    if (!page) return;
    if (!Array.isArray(liveCatalog) || liveCatalog.length === 0) {
        page.innerHTML = '<h2>❤️ متاجري المفضلة</h2><p class="empty-state">⏳ جاري تحميل المتاجر المفضلة...</p>';
        await loadPublicMerchantsCatalogSafe();
    }
    const favIds = new Set(((memberBundle?.profile?.metadata?.favorite_merchant_ids) || []).map(String));
    const favMerchants = liveCatalog.filter(m => favIds.has(String(m.merchant_id)));

    page.innerHTML = `
        <h2>❤️ متاجري المفضلة (${favMerchants.length})</h2>
        <div data-spec-id="member-favorites-grid">
            ${favMerchants.length === 0 ? `
                <p class="empty-state">لم تضف أي متاجر للمفضلة بعد. استعرض التجار واضغط على ❤️ للحفظ السريع.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="goToPage('merchants')">استعراض التجار</button>
            ` : `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px;margin-top:12px;">
                    ${favMerchants.map(m => {
                        const up = window.SAWYAN?.ImageUpload;
                        const safeLogo = (up && up.isSafeMediaUrl(m.logo_url)) ? m.logo_url : null;
                        return `
                        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:14px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                ${safeLogo ? `<img src="${esc(safeLogo)}" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:cover;border:1px solid #cbd5e1;">` : ''}
                                <div><strong>${esc(m.business_name)}</strong> <small>(${esc(m.branch_name)})</small></div>
                            </div>
                            <div style="margin:8px 0;color:#047857;font-weight:700;">عائدات خطة الدخل: ${Number(m.plan_cashback_pct).toFixed(2)}%</div>
                            <div style="display:flex;gap:8px;">
                                <button type="button" class="btn btn-primary btn-sm" onclick="submitPendingPurchasePrompt('${m.merchant_id}', '${m.branch_id}', '${esc(m.business_name)}', '${esc(m.currency_code || '')}', ${Number(m.plan_cashback_pct || 7.5)})">توثيق</button>
                                <button type="button" class="btn btn-outline btn-sm" onclick="toggleMerchantFavorite('${m.merchant_id}')">إزالة</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Screen 9: Field Mini CRM (Point 10 + Status Filters)
// ---------------------------------------------------------------------------
function loadCRM() {
    const page = document.getElementById('crmPage');
    if (!page || !memberBundle) return;
    const contacts = memberBundle.contacts || [];
    const filtered = contacts.filter(c => {
        if (crmFilterState === 'registered') return Boolean(c.registered_member_id);
        if (crmFilterState === 'pending') return !c.registered_member_id && !c.opted_out;
        if (crmFilterState === 'opted_out') return Boolean(c.opted_out);
        return true;
    });
    const refLink = buildReferralUrl();

    page.innerHTML = `
        <div data-spec-id="member-crm-board">
            <h2>📇 دفتر المعارف والدعوات</h2>
            <form id="crmAddForm" style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:16px;margin:14px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
                <input type="text" id="crmName" required class="form-control" placeholder="اسم الشخص المرشح *">
                <input type="tel" id="crmPhone" class="form-control" placeholder="رقم الواتساب (+20...)">
                <input type="text" id="crmNotes" class="form-control" placeholder="ملاحظة (صديق / قريب / جار)">
                <button type="submit" class="btn btn-primary">+ إضافة لقائمة المعارف</button>
            </form>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
                ${[
                    ['all', `الكل (${contacts.length})`],
                    ['pending', '⏳ قيد المتابعة'],
                    ['registered', '✅ مسجل بالفعل'],
                    ['opted_out', '🔕 Opt-out']
                ].map(([k, l]) => `<button type="button" class="lens-pill-btn ${crmFilterState === k ? 'active' : ''}" onclick="setCrmFilter('${k}')">${l}</button>`).join('')}
            </div>
            ${filtered.length === 0 ? '<p class="empty-state">لا توجد جهات اتصال مطابقة حالياً.</p>' : `
                <div style="display:grid;gap:10px;">
                    ${filtered.map(c => {
                        const waNum = String(c.contact_phone_e164 || '').replace(/[^0-9]/g, '');
                        const waMsg = encodeURIComponent(`أهلاً ${c.contact_name}، أدعوك للانضمام معي في منصة SAWYAN عبر رابطي: ${refLink}`);
                        return `
                            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                                <div>
                                    <strong>${esc(c.contact_name)}</strong>
                                    ${c.registered_member_id ? '<span style="background:#d1fae5;color:#065f46;font-size:0.74rem;padding:2px 8px;border-radius:999px;font-weight:800;">✅ مسجل بالفعل</span>' : ''}
                                    ${c.opted_out ? '<span style="background:#fee2e2;color:#991b1b;font-size:0.74rem;padding:2px 8px;border-radius:999px;font-weight:800;">🔕 غير راغب (Opt-out)</span>' : ''}
                                    <div style="font-size:0.82rem;color:#64748b;">${esc(c.contact_phone_e164 || 'بدون هاتف')} • ${esc(c.notes || '')}</div>
                                </div>
                                <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                    ${waNum && !c.opted_out ? `<a href="https://wa.me/${waNum}?text=${waMsg}" target="_blank" onclick="crmAction('mark_reminded','${c.id}')" class="btn btn-primary btn-sm">💬 دعوة واتساب</a>` : ''}
                                    <button type="button" class="btn btn-outline btn-sm" onclick="crmAction('toggle_opt_out','${c.id}')">${c.opted_out ? 'تفعيل التذكير' : 'إيقاف (Opt-out)'}</button>
                                    <button type="button" class="btn btn-outline btn-sm" onclick="crmAction('delete','${c.id}')">حذف</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;

    document.getElementById('crmAddForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            await window.SAWYAN.API.manageMemberCrmContact({
                memberId: currentMember.id,
                action: 'add',
                contactName: document.getElementById('crmName').value.trim(),
                contactPhone: document.getElementById('crmPhone').value.trim(),
                notes: document.getElementById('crmNotes').value.trim()
            });
            await refreshDashboardBundle();
        } catch (err) {
            swMemToast(swMemErrText(err), 'error');
        }
    });
}
window.setCrmFilter = function (f) { crmFilterState = f; loadCRM(); };

async function crmAction(action, contactId) {
    try {
        await window.SAWYAN.API.manageMemberCrmContact({ memberId: currentMember.id, action, contactId });
        await refreshDashboardBundle();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
}

// ---------------------------------------------------------------------------
// Screen 10: Referrals + QR + Y06 Templates + Spillover Predictor + Direct Add + Registered Referrals
// ---------------------------------------------------------------------------
function buildReferralUrl(targetCountry = null) {
    const base = window.location.href.split('/member-dashboard/')[0];
    const baseUrl = `${base}/member-dashboard/register.html?ref=${currentMember?.member_code || ''}`;
    if (!targetCountry || targetCountry === 'ALL') return baseUrl;
    return `${baseUrl}&country=${encodeURIComponent(targetCountry)}`;
}

function updateReferralTargetCountry(countryCode) {
    window.__referralTargetCountry = countryCode || '';
    const url = buildReferralUrl(window.__referralTargetCountry);
    const input = document.getElementById('myReferralLinkInput');
    if (input) input.value = url;
    const waLink = document.getElementById('myReferralWaLink');
    if (waLink) waLink.href = `https://wa.me/?text=${encodeURIComponent('سجل مجاناً في SAWYAN مع فريقي (كود #' + currentMember.member_code + '): ' + url)}`;
    const qrBox = document.getElementById('referralQrCanvas');
    if (qrBox && window.QRCode) {
        qrBox.innerHTML = '';
        new QRCode(qrBox, { text: url, width: 150, height: 150, colorDark: '#065f46', colorLight: '#ffffff' });
    }
}

function buildWorldCountryOptions({ selectedCode = '', includeAutoOption = false, excludeCode = '' } = {}) {
    const worldList = (window.SAWYAN && Array.isArray(window.SAWYAN.Countries)) ? window.SAWYAN.Countries : [];
    const matrixArr = (memberBundle && Array.isArray(memberBundle.countries_plan_matrix)) ? memberBundle.countries_plan_matrix : [];
    const pubList = Array.from(liveCountriesPlanMap.values());
    const mergedMap = new Map();

    worldList.forEach(w => {
        const code = String(w.code || '').trim().toUpperCase();
        if (!code || code === String(excludeCode || '').toUpperCase()) return;
        mergedMap.set(code, {
            code,
            nameAr: w.nameAr || w.nameEn || code,
            flag: w.flag || '🌍',
            is_active: false
        });
    });

    [...matrixArr, ...pubList].forEach(c => {
        const code = String(c.country_code || '').trim().toUpperCase();
        if (!code || code === String(excludeCode || '').toUpperCase()) return;
        const prev = mergedMap.get(code) || { code, nameAr: code, flag: '🌍', is_active: false };
        mergedMap.set(code, {
            code,
            nameAr: (c.country_name_i18n && c.country_name_i18n.ar) || prev.nameAr || code,
            flag: prev.flag || '🌍',
            is_active: Boolean(c.is_active) || prev.is_active
        });
    });

    const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
    const docLang = ls ? ls.getDocLang() : 'ar';
    const cmp = (a, b) => {
        const na = docLang === 'en' ? (a.nameEn || a.nameAr) : a.nameAr;
        const nb = docLang === 'en' ? (b.nameEn || b.nameAr) : b.nameAr;
        return ls ? ls.compareStrings(na, nb, docLang) : na.localeCompare(nb, docLang);
    };

    const all = Array.from(mergedMap.values()).map(item => {
        const w = worldList.find(x => String(x.code || '').toUpperCase() === item.code);
        return { ...item, nameEn: (w && w.nameEn) || item.nameAr, dialCode: (w && w.dialCode) || '' };
    });
    const sortedAll = all.slice().sort(cmp);
    const selUpper = String(selectedCode || '').toUpperCase();

    let html = includeAutoOption
        ? `<option value="" ${!selUpper ? 'selected' : ''}>🌍 تلقائي (يختاره المدعو عند التسجيل)</option>`
        : '';

    html += sortedAll.map(c =>
        `<option value="${esc(c.code)}" data-name-ar="${esc(c.nameAr)}" data-name-en="${esc(c.nameEn)}" data-flag="${esc(c.flag)}" data-dial-code="${esc(c.dialCode)}" data-active="${c.is_active ? '1' : '0'}" ${selUpper === c.code ? 'selected' : ''}>${c.flag} ${esc(docLang === 'en' ? c.nameEn : c.nameAr)} (${esc(c.code)})${c.is_active ? ' ✓ (نشطة)' : ''}</option>`
    ).join('');
    return html;
}

function loadReferrals() {
    const page = document.getElementById('referralsPage');
    if (!page) return;
    const selectedCountry = window.__referralTargetCountry || '';
    const url = buildReferralUrl(selectedCountry);
    const nextPrev = memberBundle?.tree_analytics?.next_placement_preview || null;
    const regRefs = memberBundle?.registered_referrals || [];

    page.innerHTML = `
        <h2>🔗 بوابة الإحالة، التسكين المتوازن، وتسجيل المباشرين</h2>

        <div data-spec-id="member-referrals-qr" style="background:#fff;border:1.5px solid #10b981;border-radius:16px;padding:18px;margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:16px;align-items:center;">
            <div>
                <p style="margin:0 0 10px;">كود الراعي الخاص بك: <strong style="color:#047857;font-size:1.05rem;">#${esc(currentMember.member_code)}</strong> — كل من يسجل عبر هذا الرابط يتأكد من اسمك الثلاثي قبل التسكين التلقائي المتوازن في الذراع الأضعف بشجرتك.</p>
                <div style="margin-bottom:10px;">
                    <label for="referralTargetCountrySelect" style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;color:#065f46;">🌍 الدولة المستهدفة للمدعو (كل دول العالم):</label>
                    <select id="referralTargetCountrySelect" class="form-control" style="max-width:340px;" onchange="updateReferralTargetCountry(this.value)">
                        ${buildWorldCountryOptions({ selectedCode: selectedCountry, includeAutoOption: true })}
                    </select>
                </div>
                <div class="referral-link" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    <input type="text" id="myReferralLinkInput" class="form-control" style="flex:1;min-width:180px;direction:ltr;" value="${esc(url)}" readonly>
                    <button type="button" class="btn btn-primary" onclick="copyReferralLink()">📋 نسخ الرابط</button>
                    <a id="myReferralWaLink" href="https://wa.me/?text=${encodeURIComponent('سجل مجاناً في SAWYAN مع فريقي (كود #' + currentMember.member_code + '): ' + url)}" target="_blank" class="btn btn-outline">💬 واتساب</a>
                </div>
            </div>
            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:10px;text-align:center;">
                <div id="referralQrCanvas" style="display:flex;justify-content:center;"></div>
                <div style="font-size:0.74rem;font-weight:800;color:#065f46;margin-top:6px;">امسح للتسجيل تحت #${esc(currentMember.member_code)}</div>
            </div>
        </div>

        <div data-spec-id="member-referrals-y06-share" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:14px 16px;margin-top:14px;font-size:0.84rem;color:#1e3a8a;">
            <strong>📣 قاعدة الدعوة الشفافة:</strong> شارك مشروع SAWYAN كنظام استهلاك استثماري حقيقي مرتبط بالمشتريات الفعلية لدى التجار (بلا وعود بدخل مضمون أو أرباح بلا شراء).
        </div>

        <div id="memberInviteKitCard" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;margin-top:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <h3 style="margin:0;font-size:1rem;color:#0f2744;">🎒 حقيبة الدعوة الجاهزة (الفيديو الرسمي + رسائل سريعة)</h3>
                <span style="font-size:0.76rem;color:#047857;font-weight:800;">متوافقة مع ضوابط الدعوة الشفافة</span>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:12px;border-bottom:1px dashed #e2e8f0;">
                <a href="../shared/assets/sawyan-promo-official.mp4" download="SAWYAN_Official_Promo_1080p.mp4" class="btn btn-primary btn-sm">📥 تحميل الفيديو الرسمي (HD)</a>
                <a href="../index.html#promo-explainer" target="_blank" rel="noopener" class="btn btn-outline btn-sm">▶ مشاهدة الفيديو</a>
                <a href="https://wa.me/?text=${encodeURIComponent('شاهد فكرة منصة SAWYAN للاستهلاك الاستثماري وانضم مجاناً عبر رابطي (كود #' + currentMember.member_code + '): ' + url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm">💬 مشاركة الدعوة عبر واتساب</a>
            </div>
            <div style="font-size:0.8rem;font-weight:800;color:#334155;margin-bottom:6px;">📋 انسخ رسالة دعوة جاهزة بضغطة واحدة:</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px;">
                <button type="button" class="btn btn-outline btn-sm" onclick="copyInviteTemplate('shopper')">🛒 رسالة لمتسوق جديد</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="copyInviteTemplate('merchant')">🏪 رسالة لصاحب متجر</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="copyInviteTemplate('builder')">👥 رسالة لباحث عن دخل إضافي</button>
            </div>
        </div>

        <div data-spec-id="member-referrals-spillover-predictor" style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:14px;padding:14px 16px;margin-top:14px;">
            <strong style="color:#065f46;">⚖️ موقع تسكين العضو الجديد القادم في شجرتك:</strong>
            ${nextPrev
                ? `<div style="margin-top:6px;font-size:0.86rem;color:#0f172a;">
                    المقعد القادم لمباشرك الجديد سيكون تلقائياً تحت العضو <strong>#${esc(nextPrev.next_parent_code)} ${esc(nextPrev.next_parent_name)}</strong> في الجهة <strong>${nextPrev.next_side === 'right' ? 'اليمنى ⬅️' : 'اليسرى ➡️'}</strong>
                    <span style="color:#065f46;">(توازن الذراعين: يمين ${Number(nextPrev.right_arm_count || 0)} • يسار ${Number(nextPrev.left_arm_count || 0)})</span>
                  </div>`
                : '<div style="margin-top:6px;font-size:0.84rem;color:#475569;">سيُحدَّد المقعد تلقائياً عند تسجيل أول مباشر تحتك.</div>'}
        </div>

        <div data-spec-id="member-referrals-quick-add" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;margin-top:14px;">
            <h3 style="margin:0 0 8px;font-size:1rem;">⚡ تسجيل مباشر سريع تحت عضويتك (#${esc(currentMember.member_code)})</h3>
            <p style="margin:0 0 10px;font-size:0.8rem;color:#64748b;">يسجل العضو الجديد مباشرة في الخادم بالتسكين التلقائي متوازن الذراعين مع بقاء جلستك الحالية نشطة.</p>
            <form id="quickAddReferralForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
                <input type="text" id="qRefName" required class="form-control" placeholder="الاسم الكامل للمشترك *">
                <input type="tel" id="qRefPhone" required class="form-control" placeholder="الهاتف الدولي (+20...) *">
                <select id="qRefCountry" class="form-control">
                    ${buildWorldCountryOptions({ selectedCode: (currentMember && currentMember.country_code) || 'EG', includeAutoOption: false })}
                </select>
                <input type="password" id="qRefPass" required minlength="8" class="form-control" placeholder="كلمة المرور (8+ أحرف) *">
                <button type="submit" id="qRefSubmitBtn" class="btn btn-primary">+ تسجيل وإدراج تلقائي بالشبكة</button>
            </form>
        </div>

        <div data-spec-id="member-referrals-registered-table" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;padding:16px;margin-top:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <h3 style="margin:0;font-size:1rem;">👥 سجل المدعوين المسجلين بكودك (${regRefs.length})</h3>
                ${regRefs.length > 5 ? `<input type="search" id="referralsTableSearch" class="form-control" style="max-width:240px;padding:6px 10px;font-size:0.82rem;" placeholder="🔍 ابحث بالاسم أو الكود...">` : ''}
            </div>
            <div class="table-responsive-wrap">
                <table class="data-table">
                    <thead>
                        <tr><th>الكود</th><th>الاسم</th><th>الجيل</th><th>التموضع</th><th>الدولة</th><th>حالة الهدف هذا الشهر</th><th>التواصل</th></tr>
                    </thead>
                    <tbody id="referralsTableBodySlot"></tbody>
                </table>
            </div>
            <div id="referralsTablePagerSlot" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-top:10px;font-size:0.82rem;"></div>
        </div>
    `;

    const REF_PAGE_SIZE = 20;
    let refPage = 1;
    let refQuery = '';
    const renderReferralsTablePage = () => {
        const tbody = document.getElementById('referralsTableBodySlot');
        const pager = document.getElementById('referralsTablePagerSlot');
        if (!tbody) return;
        const filteredRefs = !refQuery ? regRefs : regRefs.filter(r =>
            `${r.member_code || ''} ${r.full_name || ''} ${r.residency_country_code || ''}`.toLowerCase().includes(refQuery)
        );
        const totalPages = Math.max(1, Math.ceil(filteredRefs.length / REF_PAGE_SIZE));
        if (refPage > totalPages) refPage = totalPages;
        const start = (refPage - 1) * REF_PAGE_SIZE;
        const slice = filteredRefs.slice(start, start + REF_PAGE_SIZE);
        tbody.innerHTML = slice.length === 0
            ? '<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">لا يوجد مدعوون مطابقون حالياً.</td></tr>'
            : slice.map(r => {
                const wa = r.phone_visible && r.phone ? `https://wa.me/${String(r.phone).replace(/\D/g, '')}` : '';
                const fl = (window.SAWYAN?.Flags?.svg) ? window.SAWYAN.Flags.svg(r.residency_country_code, 15) : '';
                return `
                    <tr>
                        <td data-label="الكود"><strong>#${r.member_code}</strong></td>
                        <td data-label="الاسم">${esc(r.full_name)}</td>
                        <td data-label="الجيل">${esc(r.structural_me || '-')}</td>
                        <td data-label="التموضع">تحت #${esc(r.parent_member_code || '-')} (${esc(r.placement_side || '')})</td>
                        <td data-label="الدولة">${fl} ${esc(r.residency_country_code || '')}</td>
                        <td data-label="حالة الهدف هذا الشهر">${r.is_qualified_this_month ? '🟢 مؤهل' : '⏳ قيد التجميع'}</td>
                        <td data-label="التواصل">${wa ? `<a href="${esc(wa)}" target="_blank" style="color:#047857;font-weight:800;">💬 ${esc(r.phone)}</a>` : '🔒 محمي للخصوصية'}</td>
                    </tr>
                `;
            }).join('');
        if (pager) {
            if (filteredRefs.length <= REF_PAGE_SIZE) {
                pager.innerHTML = filteredRefs.length > 0 ? `<span style="color:#64748b;">عرض ${filteredRefs.length} من ${regRefs.length} مدعو</span>` : '';
            } else {
                pager.innerHTML = `
                    <span style="color:#64748b;">صفحة <strong>${refPage}</strong> من <strong>${totalPages}</strong> (${filteredRefs.length} مدعو)</span>
                    <div style="display:flex;gap:6px;">
                        <button type="button" class="btn btn-outline btn-sm" id="refPrevBtn" ${refPage <= 1 ? 'disabled' : ''}>◀ السابق</button>
                        <button type="button" class="btn btn-outline btn-sm" id="refNextBtn" ${refPage >= totalPages ? 'disabled' : ''}>التالي ▶</button>
                    </div>
                `;
                document.getElementById('refPrevBtn')?.addEventListener('click', () => { refPage = Math.max(1, refPage - 1); renderReferralsTablePage(); });
                document.getElementById('refNextBtn')?.addEventListener('click', () => { refPage = Math.min(totalPages, refPage + 1); renderReferralsTablePage(); });
            }
        }
    };
    renderReferralsTablePage();
    document.getElementById('referralsTableSearch')?.addEventListener('input', (e) => {
        refQuery = String(e.target.value || '').trim().toLowerCase();
        refPage = 1;
        renderReferralsTablePage();
    });

    updateReferralTargetCountry(selectedCountry);

    if (window.SAWYAN && window.SAWYAN.SmartSearch) {
        const refSel = document.getElementById('referralTargetCountrySelect');
        if (refSel) {
            window.SAWYAN.SmartSearch.attachToSelect(refSel, {
                kind: 'country',
                compact: true,
                placeholder: 'ابحث عن الدولة المستهدفة بالعربية أو الإنجليزية...',
                showLetterHeaders: true,
                skipEmptyPlaceholder: false
            });
        }
        const qRefSel = document.getElementById('qRefCountry');
        if (qRefSel) {
            window.SAWYAN.SmartSearch.attachToSelect(qRefSel, {
                kind: 'country',
                compact: true,
                placeholder: 'ابحث عن الدولة (عربي / English)...',
                showLetterHeaders: true,
                skipEmptyPlaceholder: true
            });
        }
        window.SAWYAN.SmartSearch.attachAutoDigitNormalization(document.getElementById('qRefPhone'));
    }

    document.getElementById('quickAddReferralForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('qRefSubmitBtn');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التسجيل...'; }
        try {
            const res = await window.SAWYAN.API.registerNewMember({
                fullName: document.getElementById('qRefName').value.trim(),
                phone: document.getElementById('qRefPhone').value.trim(),
                sponsorCode: currentMember.member_code,
                password: document.getElementById('qRefPass').value,
                residencyCountryCode: document.getElementById('qRefCountry').value
            });
            if (res && res.member) {
                swMemToast(`تم تسجيل المباشر الجديد (#${res.member.member_code} — ${res.member.full_name}) وتسكينه تلقائياً!`, 'success');
                await refreshDashboardBundle();
            }
        } catch (err) {
            swMemToast('تعذر التسجيل: ' + swMemErrText(err), 'error');
            if (btn) { btn.disabled = false; btn.textContent = '+ تسجيل وإدراج تلقائي بالشبكة'; }
        }
    });
}

function copyReferralLink() {
    const input = document.getElementById('myReferralLinkInput');
    if (!input) return;
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
    swMemToast('تم نسخ رابط الإحالة!', 'success');
}

window.copyInviteTemplate = function (kind) {
    const url = buildReferralUrl(window.__referralTargetCountry || '');
    const base = window.location.href.split('/member-dashboard/')[0];
    const merchUrl = `${base}/merchant-dashboard/register.html`;
    const code = currentMember?.member_code || '';
    const templates = {
        shopper: `لا تدفع دون مقابل بعد الآن!\nتسوّق من السوبر ماركت والصيدليات والمطاعم المعتمدة بنفس السعر الطبيعي، ووثّق فاتورتك لتحصل على عائدات الاستهلاك الاستثماري عبر منصة SAWYAN مجاناً 100%.\nسجّل عبر رابطي (كود #${code}):\n${url}`,
        merchant: `ضاعف مبيعات متجرك دون مجازفة بميزانيات إعلانية مجهولة المردود — ادفع مقابل النتائج والمشتريات الفعلية فقط مع SAWYAN، وانضم مجاناً لتكون ضمن دليل التجار المعتمدين:\n${merchUrl}`,
        builder: `فرصة مجانية لبناء مشروع حقيقي يبدأ من مشترياتك اليومية المعتادة وفريقك عبر منصة SAWYAN (صفر رأس مال، وعائدات مرتبطة بالمشتريات الفعلية لدى التجار فقط).\nابدأ مجاناً بكودي (#${code}):\n${url}`
    };
    const text = templates[kind] || templates.shopper;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).catch(() => {});
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (_e) {}
        document.body.removeChild(ta);
    }
    swMemToast('تم نسخ رسالة الدعوة بنجاح!', 'success');
};

// ---------------------------------------------------------------------------
// Screen 11: Settings (Residency Lock + Next-Month Move + KYC + Home GPS + Support Tickets + Password)
// ---------------------------------------------------------------------------
async function loadSettings() {
    const page = document.getElementById('settingsPage');
    if (!page) return;
    if (!memberBundle && typeof refreshDashboardBundle === 'function') {
        try { await refreshDashboardBundle(); } catch (_) {}
    }
    if (!memberBundle) return;
    const p = memberBundle.profile || currentMember;
    const moveReqs = memberBundle.residency_move_requests || [];
    const homeGps = p.metadata?.home_gps || {};
    const curCc = String(p.country_code || 'EG').toUpperCase();
    const curCountryMeta = (window.SAWYAN && Array.isArray(window.SAWYAN.Countries))
        ? window.SAWYAN.Countries.find(c => String(c.code || '').toUpperCase() === curCc)
        : null;
    const curCountryAr = curCountryMeta ? `${curCountryMeta.flag} ${curCountryMeta.nameAr} (${curCc})` : curCc;
    const isKycVerified = p.kyc_status === 'verified';
    const activeTab = window.__memberSettingsTab || 'profile';

    page.innerHTML = `
        <h2>⚙️ الإعدادات والحساب الشخصي</h2>

        <div class="member-settings-tabs" role="tablist">
            <button type="button" class="member-settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}" data-set-tab="profile" onclick="switchMemberSettingsTab('profile')">👤 الملف الشخصي والموقع</button>
            <button type="button" class="member-settings-tab-btn ${activeTab === 'security' ? 'active' : ''}" data-set-tab="security" onclick="switchMemberSettingsTab('security')">🔐 الأمان وكلمة المرور</button>
            <button type="button" class="member-settings-tab-btn ${activeTab === 'kyc' ? 'active' : ''}" data-set-tab="kyc" onclick="switchMemberSettingsTab('kyc')">🪪 الهوية (KYC) والدعم</button>
            <button type="button" class="member-settings-tab-btn ${activeTab === 'residency' ? 'active' : ''}" data-set-tab="residency" onclick="switchMemberSettingsTab('residency')">✈️ نقل دولة الإقامة</button>
        </div>

        <form id="memberSettingsForm" data-spec-id="member-settings-password">
            <div class="member-settings-pane" data-pane="profile" style="display:${activeTab === 'profile' ? 'block' : 'none'};">
                <div style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;margin-top:10px;display:grid;gap:14px;">
                    <h3 style="margin:0;font-size:1rem;">👤 الصورة الشخصية وبيانات الحساب</h3>
                    <div>
                        <label style="font-weight:700;font-size:0.84rem;">🖼️ الصورة الشخصية (Avatar)</label>
                        <div id="setAvatarUploader"></div>
                        <input type="hidden" id="setAvatarUrl" value="${esc(p.avatar_url || '')}">
                    </div>
                    <div>
                        <label>الاسم الكامل</label>
                        <input type="text" id="setFullName" class="form-control" value="${esc(p.full_name || '')}" required>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
                        <div>
                            <label>البريد الإلكتروني</label>
                            <input type="email" id="setEmail" class="form-control" value="${esc(p.email || '')}">
                        </div>
                        <div>
                            <label>الحي / المنطقة</label>
                            <input type="text" id="setDistrict" class="form-control" value="${esc(p.manual_district_fallback || '')}">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">💾 حفظ بيانات الملف الشخصي</button>
                </div>

                <div data-spec-id="member-settings-home-gps" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin-top:14px;">
                    <h3 style="margin:0 0 8px;font-size:1rem;">📍 موقع المنزل الافتراضي للخريطة والرادار</h3>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;align-items:center;">
                        <input type="number" step="0.000001" id="setHomeLat" class="form-control" value="${esc(homeGps.lat ?? '')}" placeholder="خط العرض (Latitude)">
                        <input type="number" step="0.000001" id="setHomeLng" class="form-control" value="${esc(homeGps.lng ?? '')}" placeholder="خط الطول (Longitude)">
                        <button type="button" class="btn btn-outline btn-sm" onclick="captureBrowserHomeGps()">📡 التقط إحداثياتي الآن</button>
                        <button type="button" class="btn btn-primary btn-sm" onclick="saveHomeGpsCoords()">💾 حفظ إحداثيات المنزل</button>
                    </div>
                    <div id="memberSettingsGeoPickerHost" style="margin-top:10px;"></div>
                </div>

                <div id="memberPushSettingsCard" style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:16px;padding:18px;margin-top:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                        <div>
                            <h3 style="margin:0 0 4px;font-size:1rem;color:#065f46;">🔔 إشعارات شاشة القفل بالصوت</h3>
                            <div id="memberPushStatusNote" style="font-size:0.8rem;color:#047857;">استقبل تنبيهاً فورياً بالصوت لحظة اعتماد أو رفض فاتورتك حتى والهاتف مقفل.</div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button type="button" id="memberPushToggleBtn" class="btn btn-primary btn-sm" onclick="toggleMemberLockPush()">🔔 تفعيل إشعارات شاشة القفل</button>
                            <button type="button" id="memberInstallPwaBtn" class="btn btn-outline btn-sm" style="display:none;" onclick="installMemberPwaApp()">📲 تثبيت تطبيق SAWYAN</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="member-settings-pane" data-pane="security" style="display:${activeTab === 'security' ? 'block' : 'none'};">
                <div style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;margin-top:10px;display:grid;gap:14px;">
                    <h3 style="margin:0;font-size:1rem;">🔐 تغيير كلمة المرور وأمان الحساب</h3>
                    <div style="font-size:0.84rem;color:#475569;">اختر كلمة مرور قوية من 8 أحرف على الأقل لحماية حسابك ومحفظتك. يؤدي تغيير كلمة المرور تلقائياً إلى إنهاء أي جلسات قديمة.</div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;">
                        <div>
                            <label style="font-weight:700;font-size:0.84rem;">كلمة المرور الحالية</label>
                            <div class="pw-field-wrap">
                                <input type="password" id="setCurrPass" autocomplete="current-password" class="form-control" placeholder="كلمة المرور الحالية">
                                <button type="button" class="pw-toggle-btn" aria-label="إظهار/إخفاء" onclick="toggleSawyanPwInput('setCurrPass', this)">👁️</button>
                            </div>
                        </div>
                        <div>
                            <label style="font-weight:700;font-size:0.84rem;">كلمة المرور الجديدة (8+ أحرف)</label>
                            <div class="pw-field-wrap">
                                <input type="password" id="setNewPass" autocomplete="new-password" class="form-control" minlength="8" placeholder="كلمة المرور الجديدة">
                                <button type="button" class="pw-toggle-btn" aria-label="إظهار/إخفاء" onclick="toggleSawyanPwInput('setNewPass', this)">👁️</button>
                            </div>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">🔐 تحديث كلمة المرور وحفظ الأمان</button>
                </div>
            </div>
        </form>

        <div class="member-settings-pane" data-pane="kyc" style="display:${activeTab === 'kyc' ? 'block' : 'none'};">
            <div data-spec-id="member-settings-kyc" style="background:#ffffff;border:1.5px solid ${isKycVerified ? '#10b981' : '#cbd5e1'};border-radius:16px;padding:18px;margin-top:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                    <div>
                        <h3 style="margin:0;font-size:1rem;">🪪 توثيق الهوية الشخصية — KYC (مرة واحدة قبل أول سحب)</h3>
                        <small style="color:#64748b;">لتأكيد شخصيتك بالبطاقة القومية أو جواز السفر عند سحب الأرباح.</small>
                    </div>
                    <span style="padding:4px 12px;border-radius:999px;font-size:0.8rem;font-weight:800;background:${isKycVerified ? '#d1fae5' : p.kyc_status === 'pending' ? '#fef3c7' : '#fee2e2'};color:${isKycVerified ? '#065f46' : p.kyc_status === 'pending' ? '#92400e' : '#991b1b'};">
                        ${isKycVerified ? '✅ الهوية موثّقة' : p.kyc_status === 'pending' ? '⏳ قيد المراجعة' : '⚠️ غير موثّقة'}
                    </span>
                </div>
                ${isKycVerified ? `
                    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                        <span style="color:#065f46;font-weight:700;font-size:0.86rem;">✅ هويتك الوطنية موثّقة ومعتمدة بالكامل — يمكنك سحب أرباحك بحرية دون الحاجة لإعادة الرفع.</span>
                        <button type="button" class="btn btn-outline btn-sm" onclick="toggleKycReupload()">🔄 تحديث وثيقة الهوية</button>
                    </div>
                ` : ''}
                <div id="kycReuploadWrap" style="display:${isKycVerified ? 'none' : 'block'};margin-top:10px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
                        <div>
                            <label for="setKycLegalName" style="display:block;font-size:0.78rem;font-weight:800;color:#334155;margin-bottom:4px;">الاسم القانوني الرباعي (كما بالوثيقة)</label>
                            <input type="text" id="setKycLegalName" class="form-control" value="${esc(p.full_name || '')}" placeholder="الاسم القانوني الرباعي">
                        </div>
                        <div>
                            <label for="setKycDocType" style="display:block;font-size:0.78rem;font-weight:800;color:#334155;margin-bottom:4px;">نوع وثيقة الهوية</label>
                            <select id="setKycDocType" class="form-control">
                                <option value="national_id">بطاقة رقم قومي</option>
                                <option value="passport">جواز سفر ساري</option>
                                <option value="residency_permit">إقامة سارية</option>
                            </select>
                        </div>
                        <div>
                            <label for="setKycDocNumber" style="display:block;font-size:0.78rem;font-weight:800;color:#334155;margin-bottom:4px;">رقم البطاقة القومية / جواز السفر</label>
                            <input type="text" id="setKycDocNumber" class="form-control" placeholder="أدخل رقم البطاقة أو الجواز">
                        </div>
                        <div>
                            <label for="setKycFileUploader" style="display:block;font-size:0.78rem;font-weight:800;color:#334155;margin-bottom:4px;">صورة وثيقة الهوية (وجه واضح)</label>
                            <div id="setKycFileUploader"></div>
                            <input type="hidden" id="setKycFileUrl">
                        </div>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="submitSettingsKycUpload()">📤 إرسال مستند الهوية للاعتماد</button>
                </div>
            </div>

            <div data-spec-id="member-settings-support" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin-top:14px;">
                <h3 id="memberSupportTicketsHeader" style="margin:0 0 10px;font-size:1rem;">🎫 مركز الدعم الفني والتواصل المباشر</h3>
                <div style="display:grid;gap:8px;margin-bottom:12px;">
                    <input type="text" id="setSupSubject" class="form-control" placeholder="موضوع التذكرة *">
                    <textarea id="setSupBody" rows="2" class="form-control" placeholder="اكتب رسالتك أو استفسارك للإدارة... *"></textarea>
                    <button type="button" class="btn btn-primary btn-sm" onclick="submitMemberSupportTicket()">📨 إرسال التذكرة</button>
                </div>
                <div id="memberSupportTicketsListSlot"><p style="font-size:0.84rem;color:#64748b;margin:0;">جاري تحميل تذاكر الدعم...</p></div>
            </div>
        </div>

        <div class="member-settings-pane" data-pane="residency" style="display:${activeTab === 'residency' ? 'block' : 'none'};">
            <div data-spec-id="member-settings-residency-lock" style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:16px;padding:18px;margin-top:10px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div>
                        <strong style="color:#92400e;font-size:1.02rem;">🌍 دولة الإقامة الحالية: ${esc(curCountryAr)} — العملة: ${esc(p.currency_code)}</strong>
                        <div style="font-size:0.84rem;color:#78350f;margin-top:4px;"><strong>⚠️ لحماية أرباحك: دولة إقامتك ثابتة طوال الشهر المفتوح.</strong> استخدم هذا القسم <u>فقط إذا انتقلت للإقامة الفعلية في دولة أخرى</u> ليسري النقل مطلع الشهر القادم مع حفظ رصيد Carry On السابق كاملاً.</div>
                    </div>
                    <span style="background:#ffffff;border:1px solid #f59e0b;color:#92400e;padding:4px 12px;border-radius:999px;font-weight:800;font-size:0.8rem;">🔒 قفل الشهر المفتوح</span>
                </div>
                ${moveReqs.length ? `<div style="margin-top:10px;background:#ffffff;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:0.82rem;">✈️ طلب نقل إقامة مسجل إلى <strong>${esc(moveReqs[0].target_country_code)}</strong> — الحالة: <strong>${esc(moveReqs[0].status)}</strong> • يسري من: ${esc(String(moveReqs[0].effective_from || '').slice(0, 10))}</div>` : ''}
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px;align-items:end;">
                    <div>
                        <label for="setMoveTargetCountry" style="display:block;font-size:0.78rem;font-weight:800;color:#92400e;margin-bottom:4px;">1️⃣ دولة الإقامة الجديدة</label>
                        <select id="setMoveTargetCountry" class="form-control">
                            <option value="">-- اختر دولة الإقامة الجديدة --</option>
                            ${buildWorldCountryOptions({ selectedCode: '', includeAutoOption: false, excludeCode: curCc })}
                        </select>
                    </div>
                    <div>
                        <label for="setMoveDocNum" style="display:block;font-size:0.78rem;font-weight:800;color:#92400e;margin-bottom:4px;">2️⃣ رقم إثبات الإقامة بالبلد الجديد (إقامة / تأشيرة عمل / عقد سكن)</label>
                        <input type="text" id="setMoveDocNum" class="form-control" placeholder="أدخل رقم مستند الإقامة في الدولة الجديدة">
                    </div>
                    <div>
                        <label for="setMoveFileUploader" style="display:block;font-size:0.78rem;font-weight:800;color:#92400e;margin-bottom:4px;">3️⃣ صورة مستند الإقامة (اختياري الآن)</label>
                        <div id="setMoveFileUploader"></div>
                        <input type="hidden" id="setMoveFileUrl">
                    </div>
                    <div>
                        <button type="button" data-spec-id="member-settings-residency-move-btn" class="btn btn-primary btn-block" onclick="submitSettingsResidencyMove()">✈️ تقديم طلب نقل دولة الإقامة (الشهر القادم)</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    _syncMemberPushUi();

    (async function hydrateSettingsTickets() {
        const slot = document.getElementById('memberSupportTicketsListSlot');
        const hdr = document.getElementById('memberSupportTicketsHeader');
        if (!slot) return;
        let tickets = [];
        try {
            const tRes = await window.SAWYAN.API.getMySupportTickets({
                actorType: 'member',
                actorId: currentMember.id,
                sessionToken: window.SAWYAN.API.getMemberSessionToken()
            });
            tickets = tRes.tickets || [];
        } catch (_) {}
        if (hdr) hdr.textContent = `🎫 مركز الدعم الفني والتواصل المباشر (${tickets.length})`;
        slot.innerHTML = tickets.length === 0
            ? '<p style="font-size:0.84rem;color:#64748b;margin:0;">لا توجد تذاكر دعم مفتوحة حتى الآن.</p>'
            : `<div style="display:grid;gap:8px;">${tickets.map(t => `
                <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:0.84rem;">
                    <div><strong>${esc(t.ticket_ref)} — ${esc(t.subject)}</strong> <span class="badge">${esc(t.status)}</span></div>
                    <div style="color:#334155;margin-top:4px;">${esc(t.message_body)}</div>
                    ${t.admin_reply ? `<div style="margin-top:6px;background:#ecfdf5;color:#065f46;padding:6px 10px;border-radius:8px;"><strong>رد الإدارة:</strong> ${esc(t.admin_reply)}</div>` : ''}
                </div>
            `).join('')}</div>`;
    })();

    if (window.SAWYAN?.ImageUpload) {
        const up = window.SAWYAN.ImageUpload;
        window._memberSettingsUploaders = {
            moveFile: up.mountUploader(document.getElementById('setMoveFileUploader'), {
                label: '📄 رفع مستند الإقامة الجديدة',
                maxDim: 1200,
                maxChars: 340000,
                onChange: (v) => { const el = document.getElementById('setMoveFileUrl'); if (el) el.value = v || ''; }
            }),
            kycFile: up.mountUploader(document.getElementById('setKycFileUploader'), {
                label: '🪪 رفع صورة الهوية الوطنية / الجواز',
                maxDim: 1200,
                maxChars: 340000,
                onChange: (v) => { const el = document.getElementById('setKycFileUrl'); if (el) el.value = v || ''; }
            }),
            avatar: up.mountUploader(document.getElementById('setAvatarUploader'), {
                label: '🖼️ رفع أو تحديث الصورة الشخصية',
                initialValue: p.avatar_url || null,
                maxDim: 512,
                maxChars: 180000,
                onChange: (v) => { const el = document.getElementById('setAvatarUrl'); if (el) el.value = v || ''; }
            })
        };
    }

    if (window.SAWYAN && window.SAWYAN.SmartSearch) {
        const moveSel = document.getElementById('setMoveTargetCountry');
        if (moveSel) {
            window.SAWYAN.SmartSearch.attachToSelect(moveSel, {
                kind: 'country',
                compact: true,
                placeholder: 'ابحث عن دولة الإقامة الجديدة بالعربية أو الإنجليزية...',
                showLetterHeaders: true,
                skipEmptyPlaceholder: true
            });
        }
    }

    if (window.SAWYAN && window.SAWYAN.RegEngine) {
        const geoHostEl = document.getElementById('memberSettingsGeoPickerHost');
        if (geoHostEl) {
            window.SAWYAN.RegEngine.mountGeoPicker(geoHostEl, {
                latInput: document.getElementById('setHomeLat'),
                lngInput: document.getElementById('setHomeLng'),
                initialLat: homeGps.lat,
                initialLng: homeGps.lng,
                countryCode: curCc,
                compact: true
            });
        }
    }

    document.getElementById('memberSettingsForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const u = window._memberSettingsUploaders || {};
        const avatarVal = ((u.avatar ? u.avatar.getValue() : null) || document.getElementById('setAvatarUrl')?.value || '').trim();
        const rawEmail = (document.getElementById('setEmail')?.value || '').trim();
        if (rawEmail && window.SAWYAN && window.SAWYAN.RegEngine) {
            const emChk = window.SAWYAN.RegEngine.validateEmailStrict(rawEmail, false);
            if (!emChk.valid) {
                swMemToast(emChk.error, 'warning');
                return;
            }
        }
        try {
            await window.SAWYAN.API.updateMemberProfileSettings({
                memberId: currentMember.id,
                fullName: document.getElementById('setFullName').value,
                email: rawEmail,
                manualDistrict: document.getElementById('setDistrict').value,
                currentPassword: document.getElementById('setCurrPass').value || null,
                newPassword: document.getElementById('setNewPass').value || null,
                avatarUrl: avatarVal || ''
            });
            swMemToast('تم حفظ التحديثات بنجاح!', 'success');
            await refreshDashboardBundle();
        } catch (err) {
            swMemToast('تعذر الحفظ: ' + swMemErrText(err), 'error');
        }
    });
}

window.switchMemberSettingsTab = function (tab) {
    window.__memberSettingsTab = tab || 'profile';
    document.querySelectorAll('.member-settings-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.setTab === window.__memberSettingsTab);
    });
    document.querySelectorAll('.member-settings-pane').forEach(pane => {
        pane.style.display = pane.dataset.pane === window.__memberSettingsTab ? 'block' : 'none';
    });
};

window.toggleSawyanPwInput = function (inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    const isPw = inp.type === 'password';
    inp.type = isPw ? 'text' : 'password';
    if (btn) btn.textContent = isPw ? '🙈' : '👁️';
};

async function renderMemberProfileCompletionBanner() {
    const p = memberBundle?.profile || currentMember;
    const host = document.getElementById('homePage');
    const eng = window.SAWYAN && window.SAWYAN.RegEngine;
    if (!p || !host || !eng) return;
    if (sessionStorage.getItem('sawyan_member_profile_banner_dismissed') === '1') {
        const old = document.getElementById('memberProfileCompletionBanner');
        if (old) old.remove();
        return;
    }

    let cfg = { settings: [], fields: [] };
    try {
        cfg = await eng.loadFormConfig('member', false);
    } catch (_e) {
        return;
    }

    const homeGps = p.metadata?.home_gps || {};
    const valuesMap = {
        full_name: p.full_name,
        country_of_residence: p.country_code,
        phone: p.phone,
        city: p.city_geoname_id,
        district: p.manual_district_fallback,
        email: p.email,
        nationality: p.nationality_country_id,
        gender: p.metadata?.gender,
        home_gps: (homeGps.lat && homeGps.lng) ? `${homeGps.lat},${homeGps.lng}` : '',
        national_id_kyc: (p.kyc_status === 'verified' || p.kyc_status === 'pending') ? p.kyc_status : ''
    };

    const st = eng.computeCompletionStatus(cfg, 'member', valuesMap);
    let banner = document.getElementById('memberProfileCompletionBanner');
    if (st.percent >= 100 && st.missingRequired.length === 0) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'memberProfileCompletionBanner';
        const statsGrid = host.querySelector('.stats-grid');
        if (statsGrid && statsGrid.parentNode === host) {
            host.insertBefore(banner, statsGrid);
        } else {
            host.appendChild(banner);
        }
    }

    banner.innerHTML = `
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:7px 12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.8rem;">
            <span style="color:#1e3a8a;font-weight:800;">📋 اكتمال ملفك الشخصي: ${st.percent}% ${st.missingRequired.length ? `(${st.missingRequired.slice(0, 2).map(f => esc(f.label_ar)).join('، ')})` : ''}</span>
            <div style="display:flex;align-items:center;gap:6px;">
                <button type="button" onclick="goToPage('settings')" class="btn btn-primary btn-sm" style="padding:3px 10px;font-size:0.75rem;">استكمال</button>
                <button type="button" aria-label="إخفاء" onclick="sessionStorage.setItem('sawyan_member_profile_banner_dismissed','1');document.getElementById('memberProfileCompletionBanner')?.remove();" style="border:none;background:transparent;color:#64748b;cursor:pointer;font-weight:900;font-size:0.9rem;padding:2px 6px;">✕</button>
            </div>
        </div>
    `;
}

window.submitSettingsKycUpload = async function () {
    try {
        const u = window._memberSettingsUploaders || {};
        const imgData = ((u.kycFile ? u.kycFile.getValue() : null) || document.getElementById('setKycFileUrl')?.value || '').trim();
        await window.SAWYAN.API.submitMemberKycOrResidencyMove({
            memberId: currentMember.id,
            requestKind: 'kyc_verification',
            legalFullName: document.getElementById('setKycLegalName').value.trim(),
            documentType: document.getElementById('setKycDocType').value,
            documentNumber: document.getElementById('setKycDocNumber').value.trim(),
            documentImageData: imgData || null
        });
        swMemToast('تم رفع مستند الهوية (KYC) للمراجعة بنجاح!', 'success');
        await refreshDashboardBundle();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
};

window.toggleKycReupload = function () {
    const wrap = document.getElementById('kycReuploadWrap');
    if (wrap) {
        wrap.style.display = (wrap.style.display === 'none') ? 'block' : 'none';
    }
};

window.submitSettingsResidencyMove = async function () {
    try {
        const docNum = (document.getElementById('setMoveDocNum')?.value || '').trim();
        const tgt = (document.getElementById('setMoveTargetCountry')?.value || '').trim().toUpperCase();
        if (!tgt) {
            swMemToast('يرجى اختيار دولة الإقامة الجديدة أولاً.', 'warning');
            return;
        }
        if (docNum.length < 4) {
            swMemToast('يرجى إدخال رقم مستند إثبات الإقامة بالبلد الجديد (4 أحرف/أرقام على الأقل).', 'warning');
            return;
        }
        const u = window._memberSettingsUploaders || {};
        const imgData = ((u.moveFile ? u.moveFile.getValue() : null) || document.getElementById('setMoveFileUrl')?.value || '').trim() || await readCompressedKycImage(document.getElementById('setMoveFileInput'));
        await window.SAWYAN.API.submitMemberKycOrResidencyMove({
            memberId: currentMember.id,
            requestKind: 'residency_move',
            legalFullName: currentMember.full_name || 'عضو SAWYAN',
            documentType: 'residency_permit',
            documentNumber: docNum,
            documentImageData: imgData || null,
            targetCountryCode: tgt
        });
        swMemToast(`تم تسجيل طلب نقل دولة الإقامة إلى ${tgt} ليسري مطلع الشهر القادم!`, 'success');
        await refreshDashboardBundle();
    } catch (err) {
        const msg = String(err?.message || '');
        if (msg.includes('ALREADY_IN_TARGET_COUNTRY')) {
            swMemToast('أنت مسجل حالياً على هذه الدولة بالفعل — اختر دولة جديدة مختلفة.', 'warning');
        } else if (msg.includes('KYC_FULL_NAME_AND_DOC_NUMBER_REQUIRED')) {
            swMemToast('يرجى إدخال رقم مستند الإقامة الجديد (4 خانات على الأقل).', 'warning');
        } else {
            swMemToast(swMemErrText(msg), 'error');
        }
    }
};

window.captureBrowserHomeGps = function () {
    if (!navigator.geolocation) {
        swMemToast('المتصفح لا يدعم التقاط GPS التلقائي، يمكنك إدخال الإحداثيات يدوياً.', 'warning');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const latEl = document.getElementById('setHomeLat');
            const lngEl = document.getElementById('setHomeLng');
            if (latEl) latEl.value = pos.coords.latitude.toFixed(6);
            if (lngEl) lngEl.value = pos.coords.longitude.toFixed(6);
        },
        () => swMemToast('تعذر الوصول لمستشعر الموقع — أدخل الإحداثيات يدوياً.', 'warning')
    );
};

window.saveHomeGpsCoords = async function () {
    const lat = Number(document.getElementById('setHomeLat')?.value);
    const lng = Number(document.getElementById('setHomeLng')?.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        swMemToast('أدخل إحداثيات موقع صحيحة.', 'warning');
        return;
    }
    try {
        await window.SAWYAN.API.updateMemberProfileSettings({
            memberId: currentMember.id,
            homeLat: lat,
            homeLng: lng
        });
        swMemToast('تم حفظ موقع المنزل الافتراضي لرادار المتاجر بنجاح!', 'success');
        await refreshDashboardBundle();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
};

window.openMerchantComplaintModal = async function (preMerchantId = null, preMerchantName = '') {
    if (!currentMember || !currentMember.id) {
        swMemToast('يرجى تسجيل الدخول كعضو أولاً.', 'warning');
        return;
    }
    if (!liveCatalog || liveCatalog.length === 0) {
        await loadPublicMerchantsCatalogSafe();
    }
    const merchMap = new Map();
    (Array.isArray(liveCatalog) ? liveCatalog : []).forEach(m => {
        if (m && m.merchant_id && !merchMap.has(String(m.merchant_id))) {
            merchMap.set(String(m.merchant_id), m.business_name || m.merchant_code || String(m.merchant_id));
        }
    });
    ((memberBundle && Array.isArray(memberBundle.transactions)) ? memberBundle.transactions : []).forEach(tx => {
        const mid = tx.merchant_id;
        if (mid && !merchMap.has(String(mid))) {
            merchMap.set(String(mid), tx.merchant_name || tx.business_name || 'متجر SAWYAN');
        }
    });
    if (preMerchantId && !merchMap.has(String(preMerchantId))) {
        merchMap.set(String(preMerchantId), preMerchantName || 'متجر SAWYAN');
    }

    const opts = Array.from(merchMap.entries());
    if (opts.length === 0 && !preMerchantId) {
        swMemToast('لا توجد متاجر متاحة للاختيار حالياً — افتح دليل التجار أو تعامل مع متجر ثم أعد المحاولة.', 'info');
        return;
    }

    let compEvUp = null;
    openMemberModal(`📣 إبلاغ / شكوى ضد تاجر${preMerchantName ? ' — ' + esc(preMerchantName) : ''}`, `
        <div style="${preMerchantId ? 'display:none;' : ''}">
            <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">🏪 اختر المتجر المعني بالشكوى *</label>
            <select id="compMerchantSelect" class="form-control">
                ${opts.map(([id, name]) => `<option value="${esc(id)}" ${String(id) === String(preMerchantId) ? 'selected' : ''}>${esc(name)}</option>`).join('')}
            </select>
        </div>
        <div>
            <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">🏷️ تصنيف المخالفة *</label>
            <select id="compCategorySelect" class="form-control" required>
                <option value="evasion_excuse">🏃 تهرّب أو تسويف عن توثيق الفاتورة</option>
                <option value="refused_verification">🚫 رفض صريح لتوثيق العملية لعضو سويًا</option>
                <option value="hidden_fee">💸 طلب رسوم إضافية أو زيادة سعر بسبب البطاقة</option>
                <option value="bad_conduct">⚖️ سوء تعامل أو إخلال بالتزام المتجر</option>
                <option value="other">📝 مخالفة أخرى</option>
            </select>
        </div>
        <div>
            <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">📌 عنوان الشكوى (3 أحرف على الأقل) *</label>
            <input type="text" id="compSubjectInput" class="form-control" required minlength="3" placeholder="مثال: رفض الكاشير توثيق فاتورة بقيمة 350 جنيه">
        </div>
        <div>
            <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">📄 التفاصيل الكاملة للموقف (8 أحرف على الأقل) *</label>
            <textarea id="compDetailsInput" class="form-control" rows="3" required minlength="8" placeholder="اذكر التاريخ التقريبي، الفرع، ومبلغ الفاتورة وما حدث مع الكاشير..."></textarea>
        </div>
        <div>
            <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">📷 إرفاق صورة الفاتورة أو الدليل (اختياري)</label>
            <div id="compEvidenceUploader"></div>
            <input type="hidden" id="compEvidenceUrl">
        </div>
        <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-size:0.78rem;color:#475569;line-height:1.5;">
            ℹ️ تخضع البلاغات لمراجعة إدارة الامتثال قبل احتساب أي أثر تصعيدي على المتجر لحماية الطرفين من الشكاوى الكيدية.
        </div>
    `, async (_form, close) => {
        const merchantId = preMerchantId || document.getElementById('compMerchantSelect')?.value || '';
        const category = document.getElementById('compCategorySelect')?.value || 'evasion_excuse';
        const subject = (document.getElementById('compSubjectInput')?.value || '').trim();
        const details = (document.getElementById('compDetailsInput')?.value || '').trim();
        const evidenceUrl = ((compEvUp && compEvUp.getValue()) || document.getElementById('compEvidenceUrl')?.value || '').trim() || null;

        if (!merchantId) throw new Error('يرجى تحديد المتجر أولاً.');
        if (subject.length < 3) throw new Error('عنوان الشكوى يجب أن يكون 3 أحرف على الأقل.');
        if (details.length < 8) throw new Error('يرجى كتابة تفاصيل واضحة لا تقل عن 8 أحرف.');

        const res = await window.SAWYAN.API.submitMemberMerchantComplaint({
            memberId: currentMember.id,
            merchantId,
            category,
            subject,
            details,
            evidenceUrl
        });
        close();
        swMemToast(`تم تسجيل الشكوى بنجاح وإحالتها لمراجعة فريق الامتثال (مرجع: ${String(res?.complaint_id || '').slice(0, 8)}).`, 'success');
    });

    if (window.SAWYAN?.ImageUpload) {
        const host = document.getElementById('compEvidenceUploader');
        if (host) {
            compEvUp = window.SAWYAN.ImageUpload.mountUploader(host, {
                label: '📷 التقط أو ارفع صورة الفاتورة / الدليل (اختياري)',
                maxDim: 1280,
                maxChars: 360000,
                onChange: (v) => { const el = document.getElementById('compEvidenceUrl'); if (el) el.value = v || ''; }
            });
        }
    }
};

window.submitMemberSupportTicket = async function () {
    const subj = document.getElementById('setSupSubject')?.value.trim();
    const body = document.getElementById('setSupBody')?.value.trim();
    if (!subj || !body) {
        swMemToast('يرجى إدخال موضوع التذكرة والتفاصيل.', 'warning');
        return;
    }
    try {
        const res = await window.SAWYAN.API.submitSupportOrRecoveryTicket({
            requesterType: 'member',
            requesterId: currentMember.id,
            category: 'member_support',
            subject: subj,
            message: body,
            contactName: currentMember.full_name,
            contactPhone: currentMember.phone,
            sessionToken: window.SAWYAN.API.getMemberSessionToken ? window.SAWYAN.API.getMemberSessionToken() : null
        });
        swMemToast(`تم إرسال تذكرة الدعم بنجاح برقم: ${res.ticket_ref}`, 'success');
        await loadSettings();
    } catch (err) {
        swMemToast(swMemErrText(err), 'error');
    }
};

function toggleMoreMenu(e) {
    if (e) e.preventDefault();
    const menu = document.getElementById('moreMenu');
    if (menu) menu.classList.toggle('open');
}

function closeMoreMenu() {
    const menu = document.getElementById('moreMenu');
    if (menu) menu.classList.remove('open');
}

function logout() {
    if (__memberPollTimer) { clearTimeout(__memberPollTimer); __memberPollTimer = null; }
    if (window.SAWYAN && window.SAWYAN.API) {
        window.SAWYAN.API.clearMemberSession();
    }
    window.location.href = '../index.html';
}

async function _syncMemberPushUi() {
    if (!window.SAWYAN?.Push || !currentMember?.id) return;
    const btn = document.getElementById('memberPushToggleBtn');
    const note = document.getElementById('memberPushStatusNote');
    const inst = document.getElementById('memberInstallPwaBtn');
    if (inst) inst.style.display = window.SAWYAN.Push.canInstallApp() ? 'inline-block' : 'none';
    if (!btn) return;
    const st = await window.SAWYAN.Push.getStatus();
    if (st.subscribed) {
        btn.className = 'btn btn-outline btn-sm';
        btn.textContent = '🔕 إيقاف إشعارات شاشة القفل';
        if (note) note.textContent = '✅ إشعارات شاشة القفل بالصوت مفعّلة على هذا الهاتف.';
    } else {
        btn.className = 'btn btn-primary btn-sm';
        btn.textContent = '🔔 تفعيل إشعارات شاشة القفل';
        if (note) note.textContent = 'استقبل تنبيهاً فورياً بالصوت لحظة اعتماد أو رفض فاتورتك حتى والهاتف مقفل.';
    }
}

window.toggleMemberLockPush = async function () {
    if (!window.SAWYAN?.Push || !currentMember?.id) return;
    const btn = document.getElementById('memberPushToggleBtn');
    const st = await window.SAWYAN.Push.getStatus();
    if (st.subscribed) {
        await window.SAWYAN.Push.disablePush({ actorType: 'member', actorId: currentMember.id });
        swMemToast('تم إيقاف إشعارات شاشة القفل لهذا الهاتف.', 'info');
        await _syncMemberPushUi();
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التفعيل...'; }
    try {
        await window.SAWYAN.Push.enablePush({
            actorType: 'member',
            actorId: currentMember.id,
            sendWelcomeTest: true
        });
        swMemToast('✅ تم تفعيل إشعارات شاشة القفل بالصوت! أرسلنا لك إشعاراً تجريبياً الآن.', 'success');
    } catch (err) {
        swMemToast(swMemErrText(err), 'warning');
    } finally {
        if (btn) btn.disabled = false;
        await _syncMemberPushUi();
    }
};

window.installMemberPwaApp = async function () {
    if (!window.SAWYAN?.Push) return;
    const res = await window.SAWYAN.Push.promptInstallApp();
    if (res && res.installed) {
        swMemToast('🎉 تم تثبيت تطبيق SAWYAN على الشاشة الرئيسية بنجاح!', 'success');
    }
    _syncMemberPushUi();
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (currentMember?.id && window.SAWYAN?.Push) {
            window.SAWYAN.Push.syncIfAlreadyGranted({ actorType: 'member', actorId: currentMember.id }).then(() => _syncMemberPushUi());
            window.addEventListener('sawyan:pwa-install-ready', _syncMemberPushUi);
        }
    }, 1500);
});
