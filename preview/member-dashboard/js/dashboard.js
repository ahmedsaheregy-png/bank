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
let activeLensCountry = null;
let liveCatalog = [];
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

    const fallbackFx = { EGP: 50, TRY: 50, SAR: 3.75, AED: 3.6725, EUR: 0.92, USD: 1 }[src.currency_code || p.currency_code || 'USD'] || 1;
    const rawFx = Number(src.admin_fx_rate || src.fx_rate_to_usd || 0);
    const currencyCode = src.currency_code || (cc === p.country_code ? p.currency_code : null) || ({ EG: 'EGP', TR: 'TRY', SA: 'SAR', AE: 'AED', DE: 'EUR', US: 'USD' }[cc] || 'USD');
    const fx = (rawFx > 0 && !(rawFx === 1 && currencyCode !== 'USD')) ? rawFx : fallbackFx;

    return { countryCode: cc, currencyCode, fx, targetUsd, s02, s01, idealNodes, unitShareUsd, stopperUsd, defaultStopperUsd };
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
            const ribbonGreet = document.getElementById('sawyanMemberRibbonGreeting');
            if (ribbonGreet) ribbonGreet.textContent = `👋 أهلاً، ${memberBundle.profile.full_name || 'عضو SAWYAN'}`;
        }

        if (window.SAWYAN && window.SAWYAN.Notifications && Array.isArray(memberBundle.notifications)) {
            window.SAWYAN.Notifications.hydrateFromBundle(memberBundle.notifications);
        }

        renderHomePage();
        renderActiveTabIfOpen();
    } catch (err) {
        console.error('Bundle load error:', err);
        if (String(err.message || '').includes('UNAUTHORIZED_MEMBER_SESSION')) {
            window.SAWYAN.API.clearMemberSession();
            window.location.href = 'login.html';
        }
    }
}

async function loadPublicMerchantsCatalogSafe() {
    try {
        const rows = await window.SAWYAN.API.getPublicMerchantsCatalog({});
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
            alert('❌ ' + err.message);
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
        home: 'لوحة التحكم الرئيسية',
        myPending: 'طلباتي المعلقة وطابور FIFO',
        transactions: 'العمليات المكتملة والمراجعة (D5)',
        tree: 'الشجرة الدولية وتقارير القيادة (S01)',
        wallet: 'المحفظة والسحوبات الموثقة',
        academy: 'أكاديمية سويا التدريبية',
        merchants: 'التجار المتاحون حولي والخريطة الجغرافية',
        favorites: 'متاجري المفضلة',
        crm: 'دفتر المعارف الميداني (Mini CRM)',
        referrals: 'رابط الإحالة ومؤشر الإسقاط التلقائي',
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
    alert(`✅ تم نسخ رمز الهوية الثابت للكاشير: ${txt}`);
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
        if (periodYm && String(t.created_at || '').slice(0, 7) !== periodYm) return;
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
    if (txCntEl) txCntEl.textContent = txs.length;
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

    homeEnhBox.innerHTML = `
        <!-- 1. الصندوق الأبيض للهدف الشهري (يدمج الشهر + المرحل في العداد تلقائياً) -->
        <div class="target-box-card ${stateCls}" data-spec-id="member-home-target-box" style="background:#ffffff;border:1.5px solid #e2e8f0;border-top:4px solid ${stateBadgeBg};border-radius:16px;padding:18px;margin:14px 0;box-shadow:0 4px 16px rgba(15,23,42,0.06);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                <strong style="font-size:1.08rem;color:#0f172a;">🎯 الهدف الشهري لشهر (${monthNum})</strong>
                <div style="display:inline-flex;align-items:center;gap:7px;flex-wrap:wrap;">
                    <span style="font-size:0.84rem;font-weight:800;color:#475569;">الحالة:</span>
                    <span style="padding:4px 12px;border-radius:999px;font-size:0.82rem;font-weight:800;background:${stateBadgeBg};color:#ffffff;white-space:nowrap;">${stateBadgeText}</span>
                </div>
            </div>

            <div style="height:12px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:10px;">
                <div style="width:${pct}%;height:100%;background:${stateBadgeBg};border-radius:999px;transition:width 0.35s;"></div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;font-size:0.95rem;color:#0f172a;">
                <div>تم تحقيق <strong>${fmtBiDi(fmtLocalFromUsd(combinedNetUsd))}</strong> من <strong>${fmtBiDi(fmtLocalFromUsd(req))}</strong></div>
                <span style="background:#f1f5f9;color:#0f172a;padding:2px 10px;border-radius:999px;font-size:0.82rem;font-weight:900;">${pct}%</span>
            </div>

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;margin-bottom:12px;">
                <div style="font-size:0.82rem;font-weight:800;color:#475569;margin-bottom:8px;">عبارة عن:</div>
                <div style="display:grid;gap:6px;font-size:0.86rem;color:#1e293b;">
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span>أ) هذا الشهر <small style="color:#64748b;">(ما دخل لخطة الدخل حتى اللحظة)</small>:</span>
                        <strong>${fmtBiDi(fmtLocalFromUsd(monthUsd))}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span>ب) مرحّل من أشهر سابقة <small style="color:#64748b;">(Carry On)</small>:</span>
                        <strong>${fmtBiDi(fmtLocalFromUsd(carryUsd))}</strong>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px dashed #cbd5e1;padding-top:7px;margin-top:2px;">
                        <span style="font-weight:800;color:${isQual ? '#047857' : '#b45309'};">باقي للتأهل:</span>
                        <strong style="color:${isQual ? '#047857' : '#b45309'};">${isQual ? 'مكتمل 100% ✅' : fmtBiDi(fmtLocalFromUsd(remainingUsd))}</strong>
                    </div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span style="font-size:0.81rem;font-weight:700;color:#166534;">🛒 إجمالي مشترياتك بهذا الشهر</span>
                    <strong style="font-size:0.9rem;color:#064e3b;">${fmtBiDi(grossMonthFormatted)}</strong>
                </div>
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
                    <span style="font-size:0.81rem;font-weight:700;color:#1e40af;">📊 متوسط نسبة الهدف من المشتريات</span>
                    <strong style="font-size:0.9rem;color:#1e3a8a;">${avgPctFormatted}</strong>
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
                    <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">يعرض أعضاء فريقك في نطاق عمولتك (2Me–11Me) الذين بدأوا الشراء هذا الشهر (البرتقاليون أولاً ثم الخضر) لمتابعتهم وتشجيعهم بضغطة زر.</div>
                </div>
                <button type="button" onclick="goToPage('tree')" class="btn btn-outline btn-sm" style="padding:4px 11px;font-size:0.76rem;white-space:nowrap;">عرض الشجرة كاملة</button>
            </div>
            ${teamRadar.length === 0
                ? `<div style="padding:12px;background:#f8fafc;border-radius:10px;color:#64748b;font-size:0.83rem;">لا يوجد أعضاء بدأوا الشراء ضمن نطاق 2Me–11Me هذا الشهر حتى الآن.</div>`
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

    renderPendingReturnRequestsCard(homeEnhBox);

    // كود QR الثابت للهوية عند الكاشير (البند المجمّد #1: بدون TOTP 60s)
    const qrContainer = document.getElementById('qrCode');
    if (qrContainer && window.QRCode) {
        qrContainer.innerHTML = '';
        const barcodePayload = (window.SAWYAN && window.SAWYAN.PaymentService)
            ? window.SAWYAN.PaymentService.generateOfflineQR(profile.id, profile.member_code)
            : `SAWYAN:MEMBER:${profile.member_code}`;
        new QRCode(qrContainer, {
            text: barcodePayload,
            width: 180,
            height: 180,
            colorDark: '#047857',
            colorLight: '#ffffff'
        });
    }

    const list = document.getElementById('recentTransactionsList');
    if (list) {
        if (!txs.length) {
            list.innerHTML = '<p class="empty-state">لا توجد عمليات مسجلة حتى الآن.</p>';
        } else {
            list.innerHTML = txs.slice(0, 5).map(t => `
                <div class="transaction-item">
                    <div class="transaction-info">
                        <div class="transaction-merchant">${esc(t.merchant_name)} — <small>${esc(t.sw_short_code)}</small></div>
                        <div class="transaction-date">${new Date(t.created_at).toLocaleDateString('ar-EG')} • ${esc(t.status)}</div>
                    </div>
                    <div class="transaction-amount">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                </div>
            `).join('');
        }
    }
}

// ---------------------------------------------------------------------------
// Screen 2: My Pending & Awaiting Top-Up (Path B + FIFO + Cancel Pending)
// ---------------------------------------------------------------------------
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
    const totalPendingUsd = pending.reduce((s, t) => s + Number(t.income_plan_share_usd || 0), 0);

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
            <h2>⏳ طلباتي المعلقة وطابور الشحن (FIFO)</h2>
            <button type="button" class="btn btn-primary btn-sm" onclick="goToPage('merchants')">+ طلب توثيق فاتورة جديدة</button>
        </div>
        <div data-spec-id="member-pending-limit-meter" style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:14px;padding:14px 16px;margin-bottom:16px;font-size:0.86rem;color:#1e3a8a;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
                ℹ️ <strong>مقياس السقف التشغيلي للطلبات المعلقة:</strong> الحد الأقصى عند نفس التاجر هو <strong>طلبان (2)</strong>؛ وعند نفاد رصيد التاجر يدخل الطلب في طابور <code>FIFO</code> تلقائياً.
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
                    ${pending.map(t => `
                        <div style="background:#fff;border:1.5px solid ${t.status === 'awaiting_merchant_topup' ? '#ef4444' : '#f59e0b'};border-radius:14px;padding:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                            <div>
                                <strong style="font-size:1rem;">${esc(t.merchant_name)}</strong> (${esc(t.branch_name || 'الفرع الرئيسي')})
                                <div style="font-size:0.84rem;color:#64748b;">الكود: <code>${esc(t.sw_short_code)}</code> • ${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                                <div style="font-size:0.8rem;color:#047857;margin-top:3px;">العائد المتوقع لخطة الدخل: ${Number(t.income_plan_share_local || 0).toFixed(2)} ${esc(t.currency_code)}</div>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                                <div style="text-align:left;">
                                    <div style="font-weight:900;font-size:1.05rem;">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                                    <span style="font-size:0.78rem;font-weight:800;padding:2px 8px;border-radius:999px;background:${t.status === 'awaiting_merchant_topup' ? '#fee2e2' : '#fef3c7'};color:${t.status === 'awaiting_merchant_topup' ? '#991b1b' : '#92400e'};">
                                        ${t.status === 'awaiting_merchant_topup' ? '⏸️ بانتظار شحن التاجر (FIFO)' : '⏳ بانتظار موافقة التاجر'}
                                    </span>
                                </div>
                                ${t.status === 'pending' ? `<button type="button" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;" onclick="cancelPendingPurchaseAction('${esc(t.id)}','${esc(t.sw_short_code)}')">✖ إلغاء الطلب</button>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `}
        </div>
    `;
}

window.cancelPendingPurchaseAction = async function (txId, shortCode) {
    if (!confirm(`هل تريد إلغاء طلب التوثيق المعلق (${shortCode})؟ سيتم تحرير القيد المبدئي فوراً.`)) return;
    try {
        await window.SAWYAN.API.cancelMemberPendingPurchase({
            memberId: currentMember.id,
            transactionId: txId
        });
        alert(`✅ تم إلغاء الطلب المعلق (${shortCode}) بنجاح.`);
        await refreshDashboardBundle();
    } catch (err) {
        alert('❌ تعذر إلغاء الطلب: ' + err.message);
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
            🔒 <strong>قاعدة الإقفال والمراجعة الدستورية (D5):</strong> جميع الفواتير تخضع لنافذة <strong>14 يوماً</strong> لمصافحة المرتجع عبر OTP/الموافقة قبل اعتماد الإقفال وصرف يوم <strong>15</strong> نهائياً بلا استرداد سلبي على الأعضاء.
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
                            <td><strong>${esc(a.period_ym)}</strong></td>
                            <td>${esc(a.country_code)} (${esc(a.currency_code)})</td>
                            <td>${fmtUsd(a.target_consumed_usd)} / ${fmtUsd(a.target_required_usd)}</td>
                            <td><strong style="color:#047857;">${fmtUsd(Number(a.commission_earned_usd || 0) + Number(a.surplus_earned_usd || 0))}</strong></td>
                            <td>${fmtUsd(a.carry_on_out_usd)}</td>
                            <td>${a.is_hard_locked ? '🔒 مقفل ومصروف' : `مرحلة ${a.step_status}/6`}</td>
                        </tr>`).join('')}</tbody></table></div>`)
                : (filteredTxs.length === 0 ? '<p class="empty-state">لا توجد معاملات مسجلة مطابقة للفلتر.</p>' : `
                    <div style="display:grid;gap:12px;">
                        ${filteredTxs.map(t => {
                            const invPct = Number(t.total_amount || 0) > 0
                                ? ((Number(t.income_plan_share_local || 0) / Number(t.total_amount)) * 100).toFixed(1)
                                : '0.0';
                            return `
                            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:16px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                    <div>
                                        <strong>${esc(t.merchant_name)}</strong> — <small>${esc(t.branch_name)}</small>
                                        <div style="font-size:0.82rem;color:#64748b;"><code>${esc(t.sw_short_code)}</code> • ${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                                    </div>
                                    <div style="text-align:left;">
                                        <div style="font-weight:800;">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                                        <div style="font-size:0.8rem;color:#047857;">عائد خطة الدخل المضاف: ${Number(t.income_plan_share_local || 0).toFixed(2)} ${esc(t.currency_code)} <strong style="color:#1e40af;">(${invPct}% للهدف)</strong></div>
                                    </div>
                                </div>
                                <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                    <span style="font-size:0.8rem;font-weight:800;padding:3px 10px;border-radius:999px;background:${t.status === 'completed' ? '#d1fae5' : '#fee2e2'};color:${t.status === 'completed' ? '#065f46' : '#991b1b'};">${esc(t.status)}</span>
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
        alert(decision === 'approve'
            ? '✅ تم تأكيد المرتجع وإلغاء الفاتورة وتحديث صندوق هدفك.'
            : 'ℹ️ تم تسجيل رفضك لطلب المرتجع.');
        if (res) await refreshDashboardBundle();
    } catch (err) {
        alert('❌ ' + err.message);
    }
};

function openDisputeModal(txId, shortCode) {
    openMemberModal(`⚠️ فتح تذكرة نزاع ثلاثي للفاتورة ${esc(shortCode)}`, `
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px;font-size:0.82rem;color:#9a3412;">
            تُمنح مهلة حل ودي <strong>48 ساعة</strong> للتاجر قبل التصعيد التلقائي لفريق التحكيم (<code>D6</code>).
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">تصنيف النزاع *</label>
            <select name="category" id="dmDisputeCat" class="form-control" onchange="document.getElementById('dmEvidenceUrl').required = (this.value === 'return_stalled');">
                <option value="general">نزاع عام / جودة خدمة</option>
                <option value="return_stalled">↩️ تعثر تنفيذ مرتجع خلال الـ 14 يوماً</option>
                <option value="pending_rejected">رفض فاتورة معلقة صحيحة</option>
                <option value="amount_mismatch">اختلاف قيمة الفاتورة</option>
            </select>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">رابط إثبات / إيصال إرجاع (إلزامي عند تعثر المرتجع)</label>
            <input type="url" name="evidenceUrl" id="dmEvidenceUrl" class="form-control" placeholder="https://...">
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">تفاصيل المشكلة *</label>
            <textarea name="reason" required rows="3" class="form-control" placeholder="اشرح سبب الاعتراض أو خطأ القيمة..."></textarea>
        </div>
    `, async (form, close) => {
        await window.SAWYAN.API.submitMemberDispute({
            memberId: currentMember.id,
            transactionId: txId,
            reason: form.reason.value.trim(),
            category: form.category.value,
            evidenceUrl: (form.evidenceUrl.value || '').trim() || null
        });
        close();
        await refreshDashboardBundle();
    });
}

function openPriceGougingModal(txId, merchantName, txAmount) {
    openMemberModal(`🚨 بلاغ رفع سعر تمييزي — ${esc(merchantName)} (S10)`, `
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px;font-size:0.82rem;color:#991b1b;">
            يُحظر على التاجر رفع السعر على عضو SAWYAN مقارنة بالسعر المعلن للجمهور (<code>S10</code>). عند توثيق 3 بلاغات يُطلق النظام إشارة رقابية آلية.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
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
            <label style="font-weight:700;font-size:0.84rem;">رابط صورة سعر الرف المعلن *</label>
            <input type="url" name="shelfPhotoUrl" required class="form-control" placeholder="https://...">
        </div>
        <div>
            <label style="font-weight:700;font-size:0.84rem;">رابط صورة الإيصال المدفوع *</label>
            <input type="url" name="receiptUrl" required class="form-control" placeholder="https://...">
        </div>
    `, async (form, close) => {
        await window.SAWYAN.API.submitPriceGougingReport({
            memberId: currentMember.id,
            transactionId: txId,
            declaredPrice: Number(form.declaredPrice.value),
            chargedPrice: Number(form.chargedPrice.value),
            shelfPhotoUrl: form.shelfPhotoUrl.value.trim(),
            receiptUrl: form.receiptUrl.value.trim()
        });
        close();
        await refreshDashboardBundle();
    });
}

// ---------------------------------------------------------------------------
// Screen 4: International Binary Tree + Google Earth 2D Pan/Zoom + HUD + Country Reports + 10-Gen Radar + Smart Table
// ---------------------------------------------------------------------------
function loadTree() {
    const page = document.getElementById('treePage');
    if (!page || !memberBundle) return;

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
                    <h2 style="margin:0;font-size:1.12rem;font-weight:900;color:#34d399;">🌐 الشجرة الدولية التفاعلية (${lensPlan.s01} جيلاً • S01)</h2>
                    <div style="font-size:0.79rem;color:#cbd5e1;margin-top:2px;">
                        أنت: <strong style="color:#ffffff;">${esc((memberBundle.profile && memberBundle.profile.full_name) || '')} (#${esc((memberBundle.profile && memberBundle.profile.member_code) || '')})</strong>
                        • حصتك عن كل مؤهل في فريقك: <strong style="color:#fde047;">${esc(fmtCountryLocal(lensPlan.unitShareUsd, lensPlan))}</strong>
                    </div>
                </div>
                <div style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.22);padding:5px 12px;border-radius:10px;font-family:monospace;font-weight:900;font-size:0.86rem;color:#fef08a;direction:ltr;">
                    ${treeTotalIncludingSelf}M (You + ${leftArmCnt}L / ${rightArmCnt}R)
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
                    <div style="font-size:0.78rem;color:#cbd5e1;font-weight:800;">3️⃣ الفريق الرديف (D26 مجمّع)</div>
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
                    🟠 إبراز البرتقالي (2Me–11Me)
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
                <strong>🔘 الفريق الرديف المجمع (D26):</strong> يظهر هنا الأعضاء بعد إغلاق الستوبر (${lensPlan.s01}/${lensPlan.s01}) كدوائر رمادية وعداد مجمّع لحماية الخصوصية.
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
                <strong style="color:#92400e;">🔥 رادار القائد المتخصص للـ 10 أجيال (2Me–11Me — نسب الإنجاز فقط)</strong>
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
                            <th>التواصل (D26)</th>
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
                                        <td><strong>#${n.member_code} ${esc(n.full_name)}</strong></td>
                                        <td>${esc(n.structural_me)} (${esc(n.placement_side)})</td>
                                        <td><span style="font-weight:800;">${n.stopper_slot ? esc(n.stopper_slot) : `${pal.icon} ${pal.label}`}</span></td>
                                        <td>${esc(n.residency_country_code || '')}</td>
                                        <td><strong>${Number(n.target_pct || 0)}%</strong></td>
                                        <td style="font-size:0.78rem;">${esc(n.placement_type_label || '')}</td>
                                        <td onclick="event.stopPropagation();">${wa ? `<a href="https://wa.me/${wa}" target="_blank" style="color:#047857;font-weight:800;">💬 ${esc(n.phone)}</a>` : '🔒 محجوب D26'}</td>
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
        : '🔒 مقنّع خارج نطاق 2Me–11Me (D26)';

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
        ${isSelfModal ? '<div style="text-align:center;color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0;padding:8px;border-radius:10px;font-size:0.84rem;font-weight:700;">👑 هذه عقدتك الشخصية في قمة شجرتك — يمكنك متابعة فريقك من الدوائر أدناه</div>' : (wa ? `<a href="https://wa.me/${wa}" target="_blank" class="btn btn-primary btn-block" style="text-align:center;">💬 مراسلة العضو عبر واتساب (${esc(node.phone)})</a>` : '<div style="text-align:center;color:#64748b;font-size:0.82rem;">🔒 رقم الهاتف محجوب دستورياً خارج نطاق 2Me–11Me (القرار D26)</div>')}
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
                    <div style="font-size:0.8rem;color:#065f46;">2️⃣ صافي المحفظة القابل للصرف (حساب 2302)</div>
                    <strong style="font-size:1.15rem;color:#047857;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(availableUsd))}</strong>
                    <small style="color:#065f46;">الصافي الدولاري: ${fmtUsd(availableUsd)}</small>
                </div>
            </div>

            <div data-spec-id="member-wallet-s03-meter" style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px;margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
                    <strong style="color:#92400e;">⚖️ مقياس سقف S03 وتسوية حساب المعلق Pro-Rata (2303)</strong>
                    <span style="font-weight:800;color:#b45309;">${fmtUsd(suspenseUsd)} معلق • السقف: ${fmtUsd(hp.stopperUsd)} (${esc(fmtLocalFromUsd(hp.stopperUsd))})</span>
                </div>
                <div style="height:8px;background:#fde68a;border-radius:999px;overflow:hidden;">
                    <div style="width:${s03Pct}%;height:100%;background:#d97706;"></div>
                </div>
            </div>

            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin:14px 0;font-size:0.85rem;color:#334155;">
                🛡️ <strong>ضوابط الأمان المالية (D24 / W07 / D7):</strong> يُحظر تماماً التحويل المباشر بين الأعضاء (<code>No P2P</code>)، وتخضع كل وسيلة استلام مضافة لفترة تهدئة إجبارية <code>72 ساعة</code> مع اشتراط توثيق الهوية <code>KYC = verified</code> قبل السحب.
            </div>

            <div data-spec-id="member-wallet-methods-section">
                <h3 style="margin:18px 0 10px;">🏦 وسائل استلام الأرباح المسجلة (${methods.length})</h3>
                ${methods.length === 0 ? '<p class="empty-state">لم تقم بإضافة وسيلة استلام بعد. أضف حسابك البنكي أو المحفظة لبدء عداد الـ 72 ساعة.</p>' : `
                    <div style="display:grid;gap:8px;margin-bottom:18px;">
                        ${methods.map(m => `
                            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                                <div>
                                    <strong>${esc(String(m.provider || '').toUpperCase())}</strong> — ${esc(m.account_holder_name)} (<code>****${esc(m.last_four)}</code>)
                                    <div style="font-size:0.78rem;color:#64748b;">انتهاء التهدئة: ${new Date(m.cooldown_expires_at).toLocaleString('ar-EG')}</div>
                                </div>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <span style="font-size:0.76rem;font-weight:800;padding:3px 9px;border-radius:999px;background:${m.in_cooldown ? '#fef3c7' : '#d1fae5'};color:${m.in_cooldown ? '#92400e' : '#065f46'};">
                                        ${m.in_cooldown ? '⏳ تهدئة 72 ساعة نشطة' : '✅ جاهزة للسحب'}
                                    </span>
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
                        ${wTxs.map(t => `
                            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;">
                                <div>
                                    <strong>${esc(t.transaction_type)}</strong>
                                    <div style="font-size:0.78rem;color:#64748b;">${new Date(t.created_at).toLocaleString('ar-EG')} • ${esc(t.status)}</div>
                                </div>
                                <div style="text-align:left;">
                                    <strong style="color:${t.transaction_type === 'withdrawal' ? '#dc2626' : '#047857'};">${esc(fmtLocalFromUsd(t.amount_usd))}</strong>
                                    <div style="font-size:0.75rem;color:#64748b;">${fmtUsd(t.amount_usd)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        </div>
    `;
}

function openAddPayoutMethodModal() {
    openMemberModal('🏦 إضافة وسيلة استلام أرباح (تهدئة 72 ساعة — W07)', `
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
            <label style="font-weight:700;font-size:0.86rem;">رقم الحساب / IBAN / المحفظة (يُشفّر بـ PGP في الخادم) *</label>
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
    try {
        await window.SAWYAN.API.manageMemberPayoutMethod({ memberId: currentMember.id, action: 'delete', methodId });
        await refreshDashboardBundle();
    } catch (err) {
        alert('❌ ' + err.message);
    }
}

function openRequestWithdrawalModal() {
    const methods = (memberBundle && memberBundle.payment_methods) || [];
    const readyMethods = methods.filter(m => !m.in_cooldown);
    const profile = (memberBundle && memberBundle.profile) || {};
    const avail = Number(memberBundle?.wallet?.balance_usd || 0);

    if (profile.kyc_status !== 'verified') {
        alert('⛔ يشترط النظام توثيق الهوية الوطنية (KYC = verified) قبل سحب الأرباح (القرار D7). ارفع وثيقتك من شاشة الإعدادات.');
        return;
    }
    if (readyMethods.length === 0) {
        alert('⏳ يجب وجود وسيلة استلام أرباح واحدة على الأقل أتمت فترة التهدئة الأمنية (72 ساعة — W07).');
        return;
    }

    openMemberModal('💸 طلب سحب أرباح موثق (قيد مزدوج Dr 2302 / Cr 1102)', `
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
            <label style="font-weight:700;font-size:0.86rem;">المبلغ المطلوب سحبه بالدولار المحاسبي (USD) *</label>
            <input type="number" step="0.01" min="10" max="${Math.max(10, avail)}" name="amountUsd" required class="form-control" value="${Math.min(avail, 25).toFixed(2)}">
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
        alert('🔒 يرجى إتمام المادة السابقة أولاً لفتح هذه المادة المتسلسلة.');
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
        alert('❌ ' + err.message);
        if (btn) { btn.disabled = false; }
    }
}
window.selectMemberAcademyTrack = selectMemberAcademyTrack;
window.openMemberAcademyPlayer = openMemberAcademyPlayer;
window.toggleMemberAcademyLessonComplete = toggleMemberAcademyLessonComplete;

// ---------------------------------------------------------------------------
// Screen 7 & 8: Nearby Merchants + Leaflet Map + Haversine + Google Maps + Path B Live Calc
// ---------------------------------------------------------------------------
async function loadNearbyMerchants() {
    const page = document.getElementById('merchantsPage');
    if (!page) return;
    if (liveCatalog.length === 0) {
        await loadPublicMerchantsCatalogSafe();
    }

    const myCoords = getMemberGeoCoords();
    const baseSource = (Array.isArray(radarCatalogOverride) ? radarCatalogOverride : liveCatalog).map(m => {
        const dist = (m.distance_km !== undefined && m.distance_km !== null)
            ? Number(m.distance_km)
            : haversineKm(myCoords.lat, myCoords.lng, m.latitude, m.longitude);
        return { ...m, _distanceKm: dist };
    });

    const filtered = baseSource.filter(m => {
        if (merchantFilterState.country !== 'ALL' && String(m.country_code || '').toUpperCase() !== merchantFilterState.country) return false;
        if (merchantFilterState.category !== 'all' && String(m.category_code || '') !== merchantFilterState.category) return false;
        if (merchantFilterState.q) {
            const hay = `${m.business_name || ''} ${m.branch_name || ''} ${m.address || ''} ${m.merchant_code || ''}`.toLowerCase();
            if (!hay.includes(merchantFilterState.q.toLowerCase())) return false;
        }
        return true;
    }).sort((a, b) => {
        if (merchantFilterState.sort === 'cashback_desc') return Number(b.plan_cashback_pct || 0) - Number(a.plan_cashback_pct || 0);
        if (merchantFilterState.sort === 'name') return String(a.business_name || '').localeCompare(String(b.business_name || ''), 'ar');
        const da = a._distanceKm !== null ? a._distanceKm : 999999;
        const db = b._distanceKm !== null ? b._distanceKm : 999999;
        return da - db;
    });

    const favIds = new Set(((memberBundle?.profile?.metadata?.favorite_merchant_ids) || []).map(String));

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
            <div>
                <h2 style="margin:0;">🏪 التجار المعتمدون والخريطة الجغرافية (${filtered.length})</h2>
                <small style="color:#64748b;">يعرض صافي نسبة عائدات خطة الدخل فقط (F01 / S01) • إحداثياتك المرجعية: ${myCoords.lat.toFixed(4)}, ${myCoords.lng.toFixed(4)}</small>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-sm" onclick="triggerGpsRadarSearch()">📍 تحديث الأقرب مني (GPS)</button>
                ${radarCatalogOverride ? `<button type="button" class="btn btn-outline btn-sm" onclick="resetRadarFilter()">إلغاء فلتر المسافة</button>` : ''}
            </div>
        </div>

        <div data-spec-id="member-merchants-leaflet-map" style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:16px;padding:8px;margin-bottom:14px;">
            <div id="memberMerchantsMap" style="height:260px;width:100%;border-radius:12px;background:#e2e8f0;display:flex;align-items:center;justify-content:center;color:#475569;font-weight:700;">
                🗺️ جاري تهيئة خريطة التجار حولك...
            </div>
        </div>

        <div data-spec-id="member-merchants-filters" style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:12px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
            <input type="search" id="memberMerchSearch" class="form-control" placeholder="ابحث باسم المتجر أو العنوان..." value="${esc(merchantFilterState.q)}">
            <select id="memberMerchCountry" class="form-control">
                <option value="ALL" ${merchantFilterState.country === 'ALL' ? 'selected' : ''}>🌍 كل الدول</option>
                <option value="EG" ${merchantFilterState.country === 'EG' ? 'selected' : ''}>🇪🇬 مصر</option>
                <option value="TR" ${merchantFilterState.country === 'TR' ? 'selected' : ''}>🇹🇷 تركيا</option>
                <option value="SA" ${merchantFilterState.country === 'SA' ? 'selected' : ''}>🇸🇦 السعودية</option>
                <option value="AE" ${merchantFilterState.country === 'AE' ? 'selected' : ''}>🇦🇪 الإمارات</option>
            </select>
            <select id="memberMerchCategory" class="form-control">
                <option value="all" ${merchantFilterState.category === 'all' ? 'selected' : ''}>📂 كل الفئات</option>
                <option value="supermarket" ${merchantFilterState.category === 'supermarket' ? 'selected' : ''}>🛒 سوبرماركت</option>
                <option value="restaurant" ${merchantFilterState.category === 'restaurant' ? 'selected' : ''}>🍽️ مطاعم</option>
                <option value="pharmacy" ${merchantFilterState.category === 'pharmacy' ? 'selected' : ''}>💊 صيدليات</option>
                <option value="clothing" ${merchantFilterState.category === 'clothing' ? 'selected' : ''}>👗 ملابس وأزياء</option>
                <option value="electronics" ${merchantFilterState.category === 'electronics' ? 'selected' : ''}>📱 إلكترونيات</option>
            </select>
            <select id="memberMerchSort" data-spec-id="member-merchants-sort-select" class="form-control">
                <option value="distance" ${merchantFilterState.sort === 'distance' ? 'selected' : ''}>📍 الأقرب مسافة (كم)</option>
                <option value="cashback_desc" ${merchantFilterState.sort === 'cashback_desc' ? 'selected' : ''}>💎 أعلى عائد خطة دخل (%)</option>
                <option value="name" ${merchantFilterState.sort === 'name' ? 'selected' : ''}>🔤 الترتيب الأبجدي</option>
            </select>
        </div>

        <div data-spec-id="member-merchants-grid">
            ${filtered.length === 0 ? '<p class="empty-state">لا توجد متاجر نشطة مطابقة لخيارات البحث الحالية.</p>' : `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(275px,1fr));gap:14px;">
                    ${filtered.map(m => {
                        const isFav = favIds.has(String(m.merchant_id));
                        const hasCoords = Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude));
                        const gmapsUrl = hasCoords
                            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(m.latitude + ',' + m.longitude)}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((m.business_name || '') + ' ' + (m.address || ''))}`;
                        return `
                            <div style="background:#fff;border:1.5px solid #cbd5e1;border-radius:16px;padding:16px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
                                <div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                        <strong>${esc(m.business_name)}</strong>
                                        <button type="button" onclick="toggleMerchantFavorite('${m.merchant_id}')" style="border:none;background:transparent;font-size:1.25rem;cursor:pointer;" title="المفضلة">${isFav ? '❤️' : '🤍'}</button>
                                    </div>
                                    <div style="font-size:0.84rem;color:#475569;margin-top:4px;">🏢 ${esc(m.branch_name)} • ${esc(m.country_code || '')}</div>
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
                                    <a href="${esc(gmapsUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">🗺️ خرائط جوجل</a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;

    document.getElementById('memberMerchSearch')?.addEventListener('input', (e) => { merchantFilterState.q = e.target.value; loadNearbyMerchants(); });
    document.getElementById('memberMerchCountry')?.addEventListener('change', (e) => { merchantFilterState.country = e.target.value; loadNearbyMerchants(); });
    document.getElementById('memberMerchCategory')?.addEventListener('change', (e) => { merchantFilterState.category = e.target.value; loadNearbyMerchants(); });
    document.getElementById('memberMerchSort')?.addEventListener('change', (e) => { merchantFilterState.sort = e.target.value; loadNearbyMerchants(); });

    renderMemberMerchantsLeafletMap(myCoords, filtered);
}

function renderMemberMerchantsLeafletMap(myCoords, merchants) {
    const mapDiv = document.getElementById('memberMerchantsMap');
    if (!mapDiv) return;
    if (window.__sawyanMerchantsMap) {
        try { window.__sawyanMerchantsMap.remove(); } catch (_) {}
        window.__sawyanMerchantsMap = null;
    }
    if (typeof L === 'undefined') {
        mapDiv.innerHTML = `<div style="padding:16px;text-align:center;">🗺️ خريطة التجار المعتمدين (${merchants.length} فرع حول ${myCoords.lat.toFixed(3)}, ${myCoords.lng.toFixed(3)})</div>`;
        return;
    }
    try {
        mapDiv.innerHTML = '';
        const map = L.map(mapDiv).setView([myCoords.lat, myCoords.lng], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        L.circleMarker([myCoords.lat, myCoords.lng], { radius: 8, color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 })
            .addTo(map).bindPopup('📍 موقعي المرجعي');
        const bounds = [[myCoords.lat, myCoords.lng]];
        merchants.forEach(m => {
            if (Number.isFinite(Number(m.latitude)) && Number.isFinite(Number(m.longitude))) {
                const lat = Number(m.latitude);
                const lng = Number(m.longitude);
                L.marker([lat, lng]).addTo(map)
                    .bindPopup(`<b>${esc(m.business_name)}</b><br>${esc(m.branch_name || '')}<br>عائد خطة الدخل: ${Number(m.plan_cashback_pct || 0).toFixed(2)}%`);
                bounds.push([lat, lng]);
            }
        });
        if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
        window.__sawyanMerchantsMap = map;
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
            alert('❌ تعذر تشغيل الرادار الجغرافي: ' + err.message);
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

function submitPendingPurchasePrompt(merchantId, branchId, name, currencyCode = '', planPct = 7.5) {
    const plan = getCountryPlanInfo(memberBundle?.profile?.country_code);
    openMemberModal(`📝 توثيق فاتورة مشتريات — ${esc(name)}`, `
        <div>
            <label style="font-weight:700;font-size:0.86rem;">قيمة الفاتورة الإجمالية ${currencyCode ? `(${esc(currencyCode)})` : ''} *</label>
            <input type="number" step="0.01" min="1" name="amount" id="pendingInvoiceAmtInput" required class="form-control" placeholder="500.00">
        </div>
        <div id="pendingLiveCalcPreview" style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px;font-size:0.82rem;color:#065f46;">
            💡 نسبة عائد خطة الدخل بهذا المتجر: <strong>${Number(planPct || 7.5).toFixed(2)}%</strong> — اكتب مبلغ الفاتورة لمعاينة الإضافة الفورية لصندوق هدفك.
        </div>
        <div>
            <label style="font-weight:700;font-size:0.86rem;">طريقة الدفع للتاجر *</label>
            <select name="paymentType" class="form-control">
                <option value="cash">نقدي عند الكاشير (Cash)</option>
                <option value="pos_card">بطاقة بنكية (POS Card)</option>
                <option value="instant_transfer">تحويل فوري / محفظة</option>
            </select>
        </div>
        <div>
            <label style="font-weight:700;font-size:0.86rem;">رابط صورة الإيصال الورقي (اختياري)</label>
            <input type="url" name="receiptUrl" class="form-control" placeholder="https://...">
        </div>
    `, async (form, close) => {
        const res = await window.SAWYAN.API.submitMemberPendingPurchase({
            memberId: currentMember.id,
            merchantId,
            branchId,
            amount: Number(form.amount.value),
            paymentType: form.paymentType.value,
            receiptUrl: form.receiptUrl.value.trim() || null
        });
        close();
        alert(`✅ تم إرسال الطلب بنجاح!\nكود الفاتورة: ${res.sw_short_code}\nالحالة: ${res.status}`);
        await refreshDashboardBundle();
    });

    const amtIn = document.getElementById('pendingInvoiceAmtInput');
    const prevEl = document.getElementById('pendingLiveCalcPreview');
    if (amtIn && prevEl) {
        amtIn.addEventListener('input', () => {
            const v = parseFloat(amtIn.value) || 0;
            const addLocal = v * (Number(planPct || 7.5) / 100);
            const targetLocal = plan.targetUsd * plan.fx;
            const covPct = Math.min(100, Math.round((addLocal / Math.max(targetLocal, 0.01)) * 100));
            prevEl.innerHTML = `✨ يُضاف لصندوق هدفك بعد الاعتماد: <strong>${addLocal.toFixed(2)} ${esc(currencyCode || plan.currencyCode)}</strong> (يغطي نحو <strong>${covPct}%</strong> من الهدف الشهري ${targetLocal.toFixed(2)})`;
        });
    }
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
        alert('❌ تعذر تحديث المفضلة: ' + e.message);
    }
}

function loadFavorites() {
    const page = document.getElementById('favoritesPage');
    if (!page) return;
    const favIds = new Set(((memberBundle?.profile?.metadata?.favorite_merchant_ids) || []).map(String));
    const favMerchants = liveCatalog.filter(m => favIds.has(String(m.merchant_id)));

    page.innerHTML = `
        <h2>❤️ متاجري المفضلة (${favMerchants.length})</h2>
        <div data-spec-id="member-favorites-grid">
            ${favMerchants.length === 0 ? `
                <p class="empty-state">لم تضف أي متاجر للمفضلة بعد. استعرض التجار واضغط على ❤️ للحفظ السريع.</p>
                <button type="button" class="btn btn-primary btn-sm" onclick="goToPage('merchants')">استعراض التجار</button>
            ` : `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;margin-top:12px;">
                    ${favMerchants.map(m => `
                        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:14px;">
                            <strong>${esc(m.business_name)}</strong> (${esc(m.branch_name)})
                            <div style="margin:8px 0;color:#047857;font-weight:700;">عائدات خطة الدخل: ${Number(m.plan_cashback_pct).toFixed(2)}%</div>
                            <div style="display:flex;gap:8px;">
                                <button type="button" class="btn btn-primary btn-sm" onclick="submitPendingPurchasePrompt('${m.merchant_id}', '${m.branch_id}', '${esc(m.business_name)}', '${esc(m.currency_code || '')}', ${Number(m.plan_cashback_pct || 7.5)})">توثيق</button>
                                <button type="button" class="btn btn-outline btn-sm" onclick="toggleMerchantFavorite('${m.merchant_id}')">إزالة</button>
                            </div>
                        </div>
                    `).join('')}
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
            <h2>📇 دفتر المعارف الميداني (Mini CRM — Point 10)</h2>
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
            alert('❌ خطأ: ' + err.message);
        }
    });
}
window.setCrmFilter = function (f) { crmFilterState = f; loadCRM(); };

async function crmAction(action, contactId) {
    try {
        await window.SAWYAN.API.manageMemberCrmContact({ memberId: currentMember.id, action, contactId });
        await refreshDashboardBundle();
    } catch (err) {
        alert('❌ خطأ: ' + err.message);
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

    const all = Array.from(mergedMap.values());
    const activeList = all.filter(c => c.is_active).sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    const globalList = all.filter(c => !c.is_active).sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    const selUpper = String(selectedCode || '').toUpperCase();

    let html = includeAutoOption
        ? `<option value="" ${!selUpper ? 'selected' : ''}>🌍 تلقائي (يختاره المدعو عند التسجيل)</option>`
        : '';

    if (activeList.length) {
        html += `<optgroup label="🟢 الدول النشطة حالياً">` +
            activeList.map(c => `<option value="${esc(c.code)}" ${selUpper === c.code ? 'selected' : ''}>${c.flag} ${esc(c.nameAr)} (${esc(c.code)}) — نشطة</option>`).join('') +
            `</optgroup>`;
    }
    if (globalList.length) {
        html += `<optgroup label="🌍 باقي دول العالم">` +
            globalList.map(c => `<option value="${esc(c.code)}" ${selUpper === c.code ? 'selected' : ''}>${c.flag} ${esc(c.nameAr)} (${esc(c.code)})</option>`).join('') +
            `</optgroup>`;
    }
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

        <div data-spec-id="member-referrals-qr" style="background:#fff;border:1.5px solid #10b981;border-radius:16px;padding:18px;margin-top:14px;display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center;">
            <div>
                <p style="margin:0 0 10px;">كود الراعي الخاص بك: <strong style="color:#047857;font-size:1.05rem;">#${esc(currentMember.member_code)}</strong> — كل من يسجل عبر هذا الرابط يتأكد من اسمك الثلاثي قبل التسكين الذري التلقائي في أضعف ذراع (G01–G05).</p>
                <div style="margin-bottom:10px;">
                    <label for="referralTargetCountrySelect" style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;color:#065f46;">🌍 الدولة المستهدفة للمدعو (كل دول العالم):</label>
                    <select id="referralTargetCountrySelect" class="form-control" style="max-width:340px;" onchange="updateReferralTargetCountry(this.value)">
                        ${buildWorldCountryOptions({ selectedCode: selectedCountry, includeAutoOption: true })}
                    </select>
                </div>
                <div class="referral-link" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    <input type="text" id="myReferralLinkInput" class="form-control" style="flex:1;direction:ltr;" value="${esc(url)}" readonly>
                    <button type="button" class="btn btn-primary" onclick="copyReferralLink()">📋 نسخ الرابط</button>
                    <a id="myReferralWaLink" href="https://wa.me/?text=${encodeURIComponent('سجل مجاناً في SAWYAN مع فريقي (كود #' + currentMember.member_code + '): ' + url)}" target="_blank" class="btn btn-outline">💬 واتساب</a>
                </div>
            </div>
            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:10px;text-align:center;">
                <div id="referralQrCanvas"></div>
                <div style="font-size:0.74rem;font-weight:800;color:#065f46;margin-top:6px;">امسح للتسجيل تحت #${esc(currentMember.member_code)}</div>
            </div>
        </div>

        <div data-spec-id="member-referrals-y06-share" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:14px 16px;margin-top:14px;font-size:0.84rem;color:#1e3a8a;">
            <strong>📣 إفصاح الدعوة الملتزم بضوابط Y06:</strong> شارك مشروع SAWYAN كنظام استهلاك استثماري حقيقي مرتبط بالمشتريات الفعلية لدى التجار (بلا وعود بدخل مضمون أو أرباح بلا شراء).
        </div>

        <div data-spec-id="member-referrals-spillover-predictor" style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:14px;padding:14px 16px;margin-top:14px;">
            <strong style="color:#065f46;">⚖️ متنبئ موقع الإسقاط المتوازن القادم (Balanced Spillover BFS — G01–G05):</strong>
            ${nextPrev
                ? `<div style="margin-top:6px;font-size:0.86rem;color:#0f172a;">
                    المقعد القادم لمباشرك الجديد سيكون تلقائياً تحت العضو <strong>#${esc(nextPrev.next_parent_code)} ${esc(nextPrev.next_parent_name)}</strong> في الجهة <strong>${nextPrev.next_side === 'right' ? 'اليمنى ⬅️ (Right First)' : 'اليسرى ➡️'}</strong>
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
            <h3 style="margin:0 0 10px;font-size:1rem;">👥 سجل المدعوين المسجلين بكودك (${regRefs.length})</h3>
            <div class="table-responsive-wrap">
                <table class="data-table">
                    <thead>
                        <tr><th>الكود</th><th>الاسم</th><th>الجيل</th><th>التموضع</th><th>الدولة</th><th>حالة الهدف هذا الشهر</th><th>التواصل (D26)</th></tr>
                    </thead>
                    <tbody>
                        ${regRefs.length === 0
                            ? '<tr><td colspan="7" style="text-align:center;padding:16px;color:#64748b;">لا يوجد مدعوون مسجلون مباشرة بكودك حتى الآن.</td></tr>'
                            : regRefs.map(r => {
                                const wa = r.phone_visible && r.phone ? `https://wa.me/${String(r.phone).replace(/\D/g, '')}` : '';
                                return `
                                    <tr>
                                        <td><strong>#${r.member_code}</strong></td>
                                        <td>${esc(r.full_name)}</td>
                                        <td>${esc(r.structural_me || '-')}</td>
                                        <td>تحت #${esc(r.parent_member_code || '-')} (${esc(r.placement_side || '')})</td>
                                        <td>${esc(r.residency_country_code || '')}</td>
                                        <td>${r.is_qualified_this_month ? '🟢 مؤهل' : '⏳ قيد التجميع'}</td>
                                        <td>${wa ? `<a href="${esc(wa)}" target="_blank" style="color:#047857;font-weight:800;">💬 ${esc(r.phone)}</a>` : '🔒 مقنّع D26'}</td>
                                    </tr>
                                `;
                            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    updateReferralTargetCountry(selectedCountry);

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
                alert(`✅ تم تسجيل المباشر الجديد (#${res.member.member_code} — ${res.member.full_name}) وتسكينه تلقائياً في أضعف ذراع!`);
                await refreshDashboardBundle();
            }
        } catch (err) {
            alert('❌ تعذر التسجيل: ' + err.message);
            if (btn) { btn.disabled = false; btn.textContent = '+ تسجيل وإدراج تلقائي بالشبكة'; }
        }
    });
}

function copyReferralLink() {
    const input = document.getElementById('myReferralLinkInput');
    if (!input) return;
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
    alert('✅ تم نسخ رابط الإحالة!');
}

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

    page.innerHTML = `
        <h2>⚙️ الملف الشخصي، الإقامة، الهوية (KYC)، الدعم والأمان</h2>

        <div data-spec-id="member-settings-residency-lock" style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:16px;padding:18px;margin-top:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <div>
                    <strong style="color:#92400e;font-size:1.02rem;">🌍 دولة الإقامة المقيدة حسابياً حالياً: ${esc(curCountryAr)} — العملة: ${esc(p.currency_code)}</strong>
                    <div style="font-size:0.84rem;color:#78350f;margin-top:4px;"><strong>⚠️ لحماية أرباحك: دولة إقامتك مقفلة طوال الشهر المفتوح (D9).</strong> استخدم هذا القسم <u>فقط إذا انتقلت للإقامة الفعلية في دولة أخرى</u> ليسري النقل مطلع الشهر القادم مع حفظ رصيد Carry On السابق كاملاً.</div>
                </div>
                <span style="background:#ffffff;border:1px solid #f59e0b;color:#92400e;padding:4px 12px;border-radius:999px;font-weight:800;font-size:0.8rem;">🔒 قفل الشهر المفتوح</span>
            </div>
            ${moveReqs.length ? `<div style="margin-top:10px;background:#ffffff;border:1px solid #fcd34d;border-radius:10px;padding:10px;font-size:0.82rem;">✈️ طلب نقل إقامة مسجل إلى <strong>${esc(moveReqs[0].target_country_code)}</strong> — الحالة: <strong>${esc(moveReqs[0].status)}</strong> • يسري من: ${esc(String(moveReqs[0].effective_from || '').slice(0, 10))}</div>` : ''}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px;align-items:end;">
                <div>
                    <label for="setMoveTargetCountry" style="display:block;font-size:0.78rem;font-weight:800;color:#92400e;margin-bottom:4px;">1️⃣ دولة الإقامة الجديدة (كل دول العالم)</label>
                    <select id="setMoveTargetCountry" class="form-control">
                        ${buildWorldCountryOptions({ selectedCode: '', includeAutoOption: false, excludeCode: curCc })}
                    </select>
                </div>
                <div>
                    <label for="setMoveDocNum" style="display:block;font-size:0.78rem;font-weight:800;color:#92400e;margin-bottom:4px;">2️⃣ رقم إثبات الإقامة بالبلد الجديد (إقامة / تأشيرة عمل / عقد سكن)</label>
                    <input type="text" id="setMoveDocNum" class="form-control" placeholder="أدخل رقم مستند الإقامة في الدولة الجديدة">
                </div>
                <div>
                    <label for="setMoveFileInput" style="display:block;font-size:0.78rem;font-weight:800;color:#92400e;margin-bottom:4px;">3️⃣ صورة مستند الإقامة (اختياري الآن)</label>
                    <input type="file" id="setMoveFileInput" accept="image/*" class="form-control">
                </div>
                <div>
                    <button type="button" data-spec-id="member-settings-residency-move-btn" class="btn btn-primary btn-block" onclick="submitSettingsResidencyMove()">✈️ تقديم طلب نقل دولة الإقامة (الشهر القادم)</button>
                </div>
            </div>
        </div>

        <div data-spec-id="member-settings-kyc" style="background:#ffffff;border:1.5px solid ${isKycVerified ? '#10b981' : '#cbd5e1'};border-radius:16px;padding:18px;margin-top:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <div>
                    <h3 style="margin:0;font-size:1rem;">🪪 توثيق الهوية الشخصية — KYC (مرة واحدة قبل أول سحب)</h3>
                    <small style="color:#64748b;">لتأكيد شخصيتك بالبطاقة القومية أو جواز السفر عند سحب الأرباح (منفصل تماماً عن طلب الانتقال لدولة أخرى أعلاه).</small>
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
                        <label for="setKycFileInput" style="display:block;font-size:0.78rem;font-weight:800;color:#334155;margin-bottom:4px;">صورة وثيقة الهوية (وجه واضح)</label>
                        <input type="file" id="setKycFileInput" accept="image/*" class="form-control">
                    </div>
                </div>
                <button type="button" class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="submitSettingsKycUpload()">📤 إرسال مستند الهوية للاعتماد</button>
            </div>
        </div>

        <div data-spec-id="member-settings-home-gps" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin-top:14px;">
            <h3 style="margin:0 0 8px;font-size:1rem;">📍 موقع المنزل الافتراضي للخريطة والرادار (Home GPS)</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;align-items:center;">
                <input type="number" step="0.000001" id="setHomeLat" class="form-control" value="${esc(homeGps.lat ?? '')}" placeholder="خط العرض (Latitude)">
                <input type="number" step="0.000001" id="setHomeLng" class="form-control" value="${esc(homeGps.lng ?? '')}" placeholder="خط الطول (Longitude)">
                <button type="button" class="btn btn-outline btn-sm" onclick="captureBrowserHomeGps()">📡 التقط إحداثياتي الآن</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="saveHomeGpsCoords()">💾 حفظ إحداثيات المنزل</button>
            </div>
        </div>

        <form id="memberSettingsForm" data-spec-id="member-settings-password" style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;margin-top:14px;display:grid;gap:14px;">
            <h3 style="margin:0;font-size:1rem;">🔐 بيانات الحساب وكلمة المرور</h3>
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
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
                <input type="password" id="setCurrPass" class="form-control" placeholder="كلمة المرور الحالية (عند التغيير)">
                <input type="password" id="setNewPass" class="form-control" minlength="8" placeholder="كلمة المرور الجديدة (8+ أحرف)">
            </div>
            <button type="submit" class="btn btn-primary">💾 حفظ الإعدادات في الخادم</button>
        </form>

        <div data-spec-id="member-settings-support" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;padding:18px;margin-top:14px;">
            <h3 id="memberSupportTicketsHeader" style="margin:0 0 10px;font-size:1rem;">🎫 مركز الدعم الفني والتواصل المباشر</h3>
            <div style="display:grid;gap:8px;margin-bottom:12px;">
                <input type="text" id="setSupSubject" class="form-control" placeholder="موضوع التذكرة *">
                <textarea id="setSupBody" rows="2" class="form-control" placeholder="اكتب رسالتك أو استفسارك للإدارة... *"></textarea>
                <button type="button" class="btn btn-primary btn-sm" onclick="submitMemberSupportTicket()">📨 إرسال التذكرة</button>
            </div>
            <div id="memberSupportTicketsListSlot"><p style="font-size:0.84rem;color:#64748b;margin:0;">جاري تحميل تذاكر الدعم...</p></div>
        </div>
    `;

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

    document.getElementById('memberSettingsForm')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            await window.SAWYAN.API.updateMemberProfileSettings({
                memberId: currentMember.id,
                fullName: document.getElementById('setFullName').value,
                email: document.getElementById('setEmail').value,
                manualDistrict: document.getElementById('setDistrict').value,
                currentPassword: document.getElementById('setCurrPass').value || null,
                newPassword: document.getElementById('setNewPass').value || null
            });
            alert('✅ تم حفظ التحديثات بنجاح!');
            await refreshDashboardBundle();
        } catch (err) {
            alert('❌ تعذر الحفظ: ' + err.message);
        }
    });
}

function readCompressedKycImage(inputEl) {
    return new Promise((resolve) => {
        if (!inputEl || !inputEl.files || !inputEl.files[0]) return resolve(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, 700 / Math.max(img.width, img.height));
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.65));
            };
            img.onerror = () => resolve(null);
            img.src = e.target.result;
        };
        reader.readAsDataURL(inputEl.files[0]);
    });
}

window.submitSettingsKycUpload = async function () {
    try {
        const imgData = await readCompressedKycImage(document.getElementById('setKycFileInput'));
        await window.SAWYAN.API.submitMemberKycOrResidencyMove({
            memberId: currentMember.id,
            requestKind: 'kyc_verification',
            legalFullName: document.getElementById('setKycLegalName').value.trim(),
            documentType: document.getElementById('setKycDocType').value,
            documentNumber: document.getElementById('setKycDocNumber').value.trim(),
            documentImageData: imgData
        });
        alert('✅ تم رفع مستند الهوية (KYC) للمراجعة!');
        await refreshDashboardBundle();
    } catch (err) {
        alert('❌ ' + err.message);
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
            alert('⚠️ يرجى اختيار دولة الإقامة الجديدة أولاً.');
            return;
        }
        if (docNum.length < 4) {
            alert('⚠️ يرجى إدخال رقم مستند إثبات الإقامة بالبلد الجديد (4 أحرف/أرقام على الأقل).');
            return;
        }
        const imgData = await readCompressedKycImage(document.getElementById('setMoveFileInput'));
        await window.SAWYAN.API.submitMemberKycOrResidencyMove({
            memberId: currentMember.id,
            requestKind: 'residency_move',
            legalFullName: currentMember.full_name || 'عضو SAWYAN',
            documentType: 'residency_permit',
            documentNumber: docNum,
            documentImageData: imgData,
            targetCountryCode: tgt
        });
        alert(`✅ تم تسجيل طلب نقل دولة الإقامة إلى ${tgt} ليسري مطلع الشهر المحاسبي القادم!`);
        await refreshDashboardBundle();
    } catch (err) {
        const msg = String(err?.message || '');
        if (msg.includes('ALREADY_IN_TARGET_COUNTRY')) {
            alert('⚠️ أنت مسجل حالياً على هذه الدولة بالفعل — اختر دولة جديدة مختلفة.');
        } else if (msg.includes('KYC_FULL_NAME_AND_DOC_NUMBER_REQUIRED')) {
            alert('⚠️ يرجى إدخال رقم مستند الإقامة الجديد (4 خانات على الأقل).');
        } else {
            alert('❌ ' + msg);
        }
    }
};

window.captureBrowserHomeGps = function () {
    if (!navigator.geolocation) {
        alert('المتصفح لا يدعم التقاط GPS التلقائي، يمكنك إدخال الإحداثيات يدوياً.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const latEl = document.getElementById('setHomeLat');
            const lngEl = document.getElementById('setHomeLng');
            if (latEl) latEl.value = pos.coords.latitude.toFixed(6);
            if (lngEl) lngEl.value = pos.coords.longitude.toFixed(6);
        },
        () => alert('تعذر الوصول لمستشعر GPS — أدخل الإحداثيات يدوياً.')
    );
};

window.saveHomeGpsCoords = async function () {
    const lat = Number(document.getElementById('setHomeLat')?.value);
    const lng = Number(document.getElementById('setHomeLng')?.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert('❌ أدخل إحداثيات Latitude و Longitude صحيحة.');
        return;
    }
    try {
        await window.SAWYAN.API.updateMemberProfileSettings({
            memberId: currentMember.id,
            homeLat: lat,
            homeLng: lng
        });
        alert('✅ تم حفظ موقع المنزل الافتراضي لرادار المتاجر بنجاح!');
        await refreshDashboardBundle();
    } catch (err) {
        alert('❌ ' + err.message);
    }
};

window.submitMemberSupportTicket = async function () {
    const subj = document.getElementById('setSupSubject')?.value.trim();
    const body = document.getElementById('setSupBody')?.value.trim();
    if (!subj || !body) {
        alert('❌ يرجى إدخال موضوع التذكرة والتفاصيل.');
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
            contactPhone: currentMember.phone
        });
        alert(`✅ تم إرسال تذكرة الدعم برقم: ${res.ticket_ref}`);
        await loadSettings();
    } catch (err) {
        alert('❌ ' + err.message);
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
    if (window.SAWYAN && window.SAWYAN.API) {
        window.SAWYAN.API.clearMemberSession();
    }
    window.location.href = '../index.html';
}
