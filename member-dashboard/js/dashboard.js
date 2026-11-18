/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — V3.0 MEMBER DASHBOARD (11 SCREENS + 60FPS VERTICAL TREE)
 * All financial state & tree analytics originate strictly from PostgreSQL RPCs (D21)
 * Enforces:
 *   - D10 Schema-Namespaced Sessions (No / vs /preview/ Collision)
 *   - Ch. 6.2 #3 Local Currency on Screens 1,2,3,6 & 3-Way USD/Local Reconciliation on Screen 5
 *   - D24 No P2P + W07 72h Payout Cooldown + D7 KYC Withdrawal
 *   - D26 2Me-11Me Phone Masking + Aggregated Reserve Team + Non-Crossing Tree Order
 *   - S10 Price-Gouging Radar Reports + D6 Tri-Party Disputes + GPS Haversine Radar
 * ============================================================================
 */

let currentMember = null;
let memberBundle = null;
let activeLensCountry = null;
let liveCatalog = [];
let liveCountriesPlanMap = new Map();
let radarCatalogOverride = null;
let merchantFilterState = { q: '', country: 'ALL', category: 'all' };

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
    return `${localAmt.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${info.currencyCode}`;
}

function fmtLocalFromUsd(usdVal) {
    const { fx, code } = getMemberFxContext();
    const localAmt = Number(usdVal || 0) * fx;
    return `${localAmt.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${code}`;
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
        if (logoBox) logoBox.innerHTML = window.SAWYAN.Logo.icon();
    }

    await waitForApiReady();
    const ok = await ensureAuthenticatedSession();
    if (!ok) return;

    wireNavigationHandlers();
    await refreshDashboardBundle(null);
    await loadPublicMerchantsCatalogSafe();
});

async function ensureAuthenticatedSession() {
    let saved = (window.SAWYAN && window.SAWYAN.API) ? window.SAWYAN.API.getSavedMember() : null;

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
// Clean In-App Action Modal (Replaces raw browser window.prompt)
// ---------------------------------------------------------------------------
function openMemberModal(titleText, bodyHtml, onSubmit) {
    let overlay = document.getElementById('sawyanMemberModalOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sawyanMemberModalOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.62);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10000;';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div style="background:#ffffff;border-radius:18px;max-width:480px;width:100%;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,0.28);direction:rtl;font-family:Tajawal,sans-serif;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="margin:0;color:#0f172a;font-size:1.1rem;">${titleText}</h3>
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
        btn.textContent = '⏳ جاري الإرسال...';
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
        transactions: 'العمليات المكتملة والمراجعة',
        tree: 'شجرتي الهيكلية وعدسات الدول',
        wallet: 'المحفظة والسحوبات الموثقة',
        academy: 'أكاديمية سويا التدريبية',
        merchants: 'التجار المتاحون حولك',
        favorites: 'متاجري المفضلة',
        crm: 'دفتر المعارف الميداني (Mini CRM)',
        referrals: 'رابط الإحالة والدعوات',
        settings: 'الملف الشخصي والأمان'
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

function renderActiveTabIfOpen() {
    const active = document.querySelector('.page.active');
    if (!active) return;
    const id = active.id.replace(/Page$/, '');
    if (id !== 'home') {
        const activeNav = document.querySelector(`.nav-item[data-page="${id}"]`);
        if (activeNav) goToPage(id);
    }
}

// ---------------------------------------------------------------------------
// Screen 1: Home (Local Currency Primary per Ch. 6.2 #3 + Static Barcode)
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
    if (balEl) balEl.textContent = fmtLocalFromUsd(w.balance_usd);
    if (txCntEl) txCntEl.textContent = txs.length;
    if (teamEl) teamEl.textContent = Math.max(0, (tree.nodes ? tree.nodes.length - 1 : 0));

    // صندوق الهدف الشهري للعضو بالعملة المحلية لدولة الإقامة (Ch. 6.2 #3)
    let boxCard = document.getElementById('memberTargetBoxSummary');
    if (!boxCard) {
        boxCard = document.createElement('div');
        boxCard.id = 'memberTargetBoxSummary';
        const statsGrid = document.querySelector('#homePage .stats-grid');
        if (statsGrid && statsGrid.parentNode) {
            statsGrid.parentNode.insertBefore(boxCard, statsGrid.nextSibling);
        }
    }
    const homePlan = getCountryPlanInfo(profile.country_code);
    const homeBox = boxes.find(b => b.country_code === profile.country_code && b.period_ym === memberBundle.period_ym) || boxes[0];
    const req = Number((homeBox && homeBox.target_required_usd) || homePlan.targetUsd || 24.75);
    const net = Number((homeBox && homeBox.net_accumulated_usd) || 0);
    const carryUsd = Number((homeBox && homeBox.carry_on_in_usd) || 0);
    const monthUsd = Number((homeBox && homeBox.current_month_purchases_usd) || 0);
    const isQual = Boolean(homeBox && homeBox.is_qualified);
    const boxCountry = (homeBox && homeBox.country_code) || profile.country_code || 'EG';
    const boxPeriod = (homeBox && homeBox.period_ym) || memberBundle.period_ym || '';
    const unitShareUsd = calcMemberUnitShareUsd(req, homePlan.s02);
    const pct = Math.max(0, Math.min(100, Math.round((net / Math.max(req, 0.01)) * 100)));

    boxCard.innerHTML = `
        <div style="background:#ffffff;border:1.5px solid ${isQual ? '#10b981' : '#f59e0b'};border-radius:16px;padding:18px;margin:16px 0;box-shadow:0 4px 12px rgba(15,23,42,0.05);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <strong style="font-size:1.05rem;color:#0f172a;">🎯 صندوق الهدف الشهري (${esc(boxPeriod)} — ${esc(boxCountry)})</strong>
                <span style="padding:4px 10px;border-radius:999px;font-size:0.82rem;font-weight:800;background:${isQual ? '#d1fae5' : '#fef3c7'};color:${isQual ? '#065f46' : '#92400e'};">
                    ${isQual ? '✅ مؤهل للتوزيع' : `⏳ قيد الاستكمال (${pct}%)`}
                </span>
            </div>
            <div style="height:10px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin-bottom:10px;">
                <div style="width:${pct}%;height:100%;background:${isQual ? '#10b981' : '#f59e0b'};"></div>
            </div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;font-size:0.86rem;color:#334155;align-items:center;">
                <span>المحقق الصافي: <strong>${esc(fmtLocalFromUsd(net))} / ${esc(fmtLocalFromUsd(req))}</strong></span>
                <span>المرحّل (Carry On): <strong>${esc(fmtLocalFromUsd(carryUsd))}</strong></span>
                <span>مشتريات الشهر: <strong>${esc(fmtLocalFromUsd(monthUsd))}</strong></span>
                <span style="background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:4px 10px;border-radius:8px;font-weight:800;">
                    💎 حصة الفرد المؤهل (الهدف ÷ ${homePlan.s02}): <strong>${esc(fmtLocalFromUsd(unitShareUsd))}</strong> <small>(${fmtUsd(unitShareUsd)})</small>
                </span>
            </div>
        </div>
    `;
    if (typeof window.recalcMemberHomeCalculator === 'function') {
        window.recalcMemberHomeCalculator();
    }

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

    // آخر 5 معاملات بالعملة المحلية
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
// Screen 2: My Pending & Awaiting Top-Up (Path B + FIFO)
// ---------------------------------------------------------------------------
function loadMyPendingRequests() {
    const page = document.getElementById('myPendingPage');
    if (!page || !memberBundle) return;
    const pending = (memberBundle.transactions || []).filter(t => t.status === 'pending' || t.status === 'awaiting_merchant_topup');

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
            <h2>⏳ طلباتي المعلقة وطابور الشحن (FIFO)</h2>
            <button type="button" class="btn btn-primary btn-sm" onclick="goToPage('merchants')">+ طلب توثيق فاتورة جديدة</button>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px;margin-bottom:16px;font-size:0.86rem;color:#1e3a8a;">
            ℹ️ الحد الأقصى للطلبات المعلقة لدى نفس التاجر هو <strong>طلبان (2)</strong>؛ وعند نفاد رصيد التاجر يدخل الطلب في طابور الشحن بالترتيب (<code>FIFO</code>).
        </div>
        ${pending.length === 0 ? '<p class="empty-state">لا توجد فواتير معلقة حالياً.</p>' : `
            <div style="display:grid;gap:12px;">
                ${pending.map(t => `
                    <div style="background:#fff;border:1.5px solid ${t.status === 'awaiting_merchant_topup' ? '#ef4444' : '#f59e0b'};border-radius:14px;padding:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                        <div>
                            <strong style="font-size:1rem;">${esc(t.merchant_name)}</strong> (${esc(t.branch_name)})
                            <div style="font-size:0.84rem;color:#64748b;">الكود: <code>${esc(t.sw_short_code)}</code> • ${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                        </div>
                        <div style="text-align:left;">
                            <div style="font-weight:900;font-size:1.05rem;">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                            <span style="font-size:0.78rem;font-weight:800;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;">
                                ${t.status === 'awaiting_merchant_topup' ? '⏸️ بانتظار شحن التاجر (FIFO)' : '⏳ بانتظار موافقة التاجر'}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
    `;
}

// ---------------------------------------------------------------------------
// Screen 3: Completed & Reversed Transactions + Disputes (D6) + S10 Price Gouging
// ---------------------------------------------------------------------------
function loadAllTransactions() {
    const page = document.getElementById('transactionsPage');
    if (!page || !memberBundle) return;
    const txs = memberBundle.transactions || [];
    const disputes = memberBundle.disputes || [];
    const gouging = memberBundle.price_gouging_reports || [];

    page.innerHTML = `
        <h2>💳 سجل العمليات والفواتير (${txs.length})</h2>
        ${txs.length === 0 ? '<p class="empty-state">لا توجد معاملات مسجلة حتى الآن.</p>' : `
            <div style="display:grid;gap:12px;margin-top:14px;">
                ${txs.map(t => `
                    <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:16px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div>
                                <strong>${esc(t.merchant_name)}</strong> — <small>${esc(t.branch_name)}</small>
                                <div style="font-size:0.82rem;color:#64748b;"><code>${esc(t.sw_short_code)}</code> • ${new Date(t.created_at).toLocaleString('ar-EG')}</div>
                            </div>
                            <div style="text-align:left;">
                                <div style="font-weight:800;">${Number(t.total_amount).toFixed(2)} ${esc(t.currency_code)}</div>
                                <div style="font-size:0.8rem;color:#047857;">عائد خطة الدخل المضاف: ${Number(t.income_plan_share_local || 0).toFixed(2)} ${esc(t.currency_code)}</div>
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
                    </div>
                `).join('')}
            </div>
        `}
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

function openDisputeModal(txId, shortCode) {
    openMemberModal(`⚠️ فتح تذكرة نزاع ثلاثي للفاتورة ${esc(shortCode)}`, `
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:10px;font-size:0.82rem;color:#9a3412;">
            تُمنح مهلة حل ودي <strong>48 ساعة</strong> للتاجر قبل التصعيد التلقائي لفريق التحكيم (<code>D6</code>).
        </div>
        <div>
            <label style="font-weight:700;font-size:0.88rem;">تفاصيل المشكلة *</label>
            <textarea name="reason" required rows="3" class="form-control" placeholder="اشرح سبب الاعتراض أو خطأ القيمة..."></textarea>
        </div>
    `, async (form, close) => {
        await window.SAWYAN.API.submitMemberDispute({
            memberId: currentMember.id,
            transactionId: txId,
            reason: form.reason.value.trim()
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
                <input type="number" step="0.01" min="0.01" name="declaredPrice" required class="form-control" placeholder="مثال: 100.00">
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
// Screen 4: 60fps Vertical Binary Tree + Non-Crossing Parent Subtree Order + D26
// ---------------------------------------------------------------------------
function loadTree() {
    const page = document.getElementById('treePage');
    if (!page || !memberBundle) return;

    const tree = memberBundle.tree_analytics || { nodes: [], commission_team_count: 0, reserve_team_aggregated_count: 0, lens_country_code: 'ALL' };
    const topology = memberBundle.tree_topology || [];
    const nodes = tree.nodes || [];
    const topoMap = new Map(topology.map(t => [Number(t.member_code), t]));

    const lensCountries = [
        { code: 'ALL', label: '🌍 كل الدول' },
        { code: 'EG', label: '🇪🇬 مصر' },
        { code: 'TR', label: '🇹🇷 تركيا' },
        { code: 'SA', label: '🇸🇦 السعودية' },
        { code: 'DE', label: '🇩🇪 ألمانيا' },
        { code: 'US', label: '🇺🇸 أمريكا' }
    ];

    const colorStyles = {
        GREEN: { bg: '#ecfdf5', border: '#10b981', badge: '#047857', text: '#064e3b', label: 'مؤهل' },
        ORANGE: { bg: '#fffbeb', border: '#f59e0b', badge: '#d97706', text: '#78350f', label: 'نصف صندوق' },
        WHITE: { bg: '#ffffff', border: '#94a3b8', badge: '#64748b', text: '#334155', label: 'بدون شراء' },
        BLACK: { bg: '#1e293b', border: '#475569', badge: '#334155', text: '#e2e8f0', label: 'خارج العدسة' }
    };

    const visibleNodes = nodes.filter(n => n.team_bucket !== 'RESERVE_TEAM');

    // ترتيب هرمي غير متقاطع (RTL: اليمين أولاً ثم اليسار تحت كل أب) لمنع تقاطع خطوط SVG
    const childrenByParent = new Map();
    for (const n of visibleNodes) {
        const topo = topoMap.get(Number(n.member_code)) || {};
        const pCode = topo.parent_member_code;
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
    const rootNode = visibleNodes.find(n => String(n.structural_me) === '1Me') || visibleNodes[0];
    if (rootNode) assignDfsOrder(Number(rootNode.member_code));

    const byDepth = {};
    for (const n of visibleNodes) {
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
    const orangeFilterOnly = Boolean(window.__treeOrangeFilterOnly);
    const orangeRadarTargets = visibleNodes.filter(n => {
        const d = parseInt(String(n.structural_me || '1').replace(/\D/g, ''), 10) || 1;
        return n.node_color === 'ORANGE' && d >= 2 && d <= 11;
    });

    const activeLensCode = (tree.lens_country_code && tree.lens_country_code !== 'ALL')
        ? tree.lens_country_code
        : ((memberBundle.profile && memberBundle.profile.country_code) || 'EG');
    const lensPlan = getCountryPlanInfo(activeLensCode);
    const homePlanForTree = getCountryPlanInfo(memberBundle.profile && memberBundle.profile.country_code);

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
            <div>
                <h2 style="margin:0;">🌳 شجرتي العمودية الثنائية (S01 = ${lensPlan.s01} مؤهلاً)</h2>
                <small style="color:#64748b;">العدسة النشطة: <strong>${esc(tree.lens_country_code || 'ALL')}</strong> • ترتيب شجري غير متقاطع (يمين ← يسار)</small>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <button type="button" class="btn btn-sm ${orangeFilterOnly ? 'btn-primary' : 'btn-outline'}"
                        style="${orangeFilterOnly ? 'background:#d97706;border-color:#d97706;' : 'border-color:#f59e0b;color:#b45309;'}"
                        onclick="toggleTreeOrangeFilter()">
                    🔥 الأقرب لإغلاق الهدف (🟠 برتقالي 2Me–11Me: ${orangeRadarTargets.length})
                </button>
                ${lensCountries.map(lc => {
                    const isAct = (tree.lens_country_code || 'ALL') === lc.code;
                    return `<button type="button" class="btn btn-sm ${isAct ? 'btn-primary' : 'btn-outline'}" onclick="switchTreeCountryLens('${lc.code === 'ALL' ? '' : lc.code}')">${lc.label}</button>`;
                }).join('')}
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:16px;">
            <div style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:14px;padding:14px;">
                <div style="font-size:0.8rem;color:#065f46;">فريق العمولة النشط (1/${lensPlan.s01} .. ${lensPlan.s01}/${lensPlan.s01})</div>
                <strong style="font-size:1.5rem;color:#047857;">${tree.commission_team_count || 0}</strong>
            </div>
            <div style="background:#f0fdf4;border:1.5px solid #059669;border-radius:14px;padding:14px;">
                <div style="font-size:0.8rem;color:#065f46;">💎 حصة الفرد المؤهل (${esc(activeLensCode)} • الهدف ÷ ${lensPlan.s02})</div>
                <strong style="font-size:1.22rem;color:#047857;display:block;margin-top:2px;">${esc(fmtCountryLocal(lensPlan.unitShareUsd, lensPlan))}</strong>
                <small style="color:#065f46;font-weight:700;">${fmtUsd(lensPlan.unitShareUsd)} لكل متأهل • S03 دولتي: ${fmtUsd(homePlanForTree.stopperUsd)}</small>
            </div>
            <div style="background:#eff6ff;border:1.5px solid #3b82f6;border-radius:14px;padding:14px;">
                <div style="font-size:0.8rem;color:#1e40af;">الفريق الرديف (D26 إجمالي مجمّع فقط)</div>
                <strong style="font-size:1.5rem;color:#1d4ed8;">+${tree.reserve_team_aggregated_count || 0} عضو</strong>
            </div>
            <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:14px;">
                <div style="font-size:0.8rem;color:#475569;">نطاق الهواتف المصرح به (D26)</div>
                <strong style="font-size:1rem;color:#0f172a;">أول 10 أجيال (2Me–11Me)</strong>
            </div>
        </div>

        ${(orangeFilterOnly || orangeRadarTargets.length > 0) ? `
            <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:12px 14px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                    <strong style="color:#92400e;font-size:0.9rem;">🎯 رادار القائد (N01/N02): الأعضاء البرتقاليون الأقرب لإغلاق الهدف (2Me–11Me)</strong>
                    <small style="color:#b45309;">${orangeRadarTargets.length} عضو مرشح للتشجيع الفوري</small>
                </div>
                ${orangeRadarTargets.length ? `
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        ${orangeRadarTargets.map(n => {
                            const waPhone = n.phone_visible && n.phone ? String(n.phone).replace(/[^0-9]/g, '') : '';
                            const msg = encodeURIComponent(`أهلاً ${n.full_name} 🌟 أنت قريب جداً من إغلاق هدفك الشهري في سويًا وتحويل حالتك للأخضر! تواصل معي لأي مساعدة في متاجر منطقتك.`);
                            return `
                                <div style="background:#fff;border:1px solid #fcd34d;border-radius:10px;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:0.8rem;">
                                    <span><strong>#${n.member_code}</strong> ${esc(n.full_name)} <small style="color:#b45309;">(${esc(n.structural_me || '')})</small></span>
                                    ${waPhone ? `<a href="https://wa.me/${waPhone}?text=${msg}" target="_blank" style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:6px;text-decoration:none;font-weight:700;">💬 شجّعه واتساب</a>` : '<span style="color:#64748b;">🔒 مقنّع</span>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : '<div style="font-size:0.82rem;color:#92400e;">لا يوجد أعضاء بحالة برتقالية ضمن أجيال المتابعة (2Me–11Me) في هذه العدسة حالياً.</div>'}
            </div>
        ` : ''}

        <div id="verticalTreeViewport" style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:16px;padding:16px;overflow:auto;max-height:620px;position:relative;">
            <svg id="treeSvgOverlay" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;"></svg>
            <div id="treeLevelsContainer" style="position:relative;z-index:1;display:flex;flex-direction:column;gap:24px;min-width:max-content;">
                ${depthKeys.map(d => `
                    <div class="tree-gen-row" style="display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:nowrap;">
                        <span style="background:#0f172a;color:#fff;font-size:0.72rem;font-weight:800;padding:4px 8px;border-radius:8px;min-width:42px;text-align:center;">${d}Me</span>
                        ${byDepth[d].map(n => {
                            const st = colorStyles[n.node_color] || colorStyles.WHITE;
                            const topo = topoMap.get(Number(n.member_code)) || {};
                            const waPhone = n.phone_visible && n.phone ? String(n.phone).replace(/[^0-9]/g, '') : '';
                            const isOrangeHighlight = n.node_color === 'ORANGE' && d >= 2 && d <= 11;
                            const cardFilterStyle = orangeFilterOnly
                                ? (isOrangeHighlight ? 'box-shadow:0 0 0 3px #f59e0b;' : 'opacity:0.35;')
                                : '';
                            return `
                                <div class="tree-node-card" data-code="${n.member_code}" data-parent="${topo.parent_member_code ?? ''}"
                                     style="background:${st.bg};border:2px solid ${st.border};color:${st.text};border-radius:12px;padding:8px 10px;min-width:168px;max-width:190px;box-shadow:0 2px 6px rgba(0,0,0,0.06);${cardFilterStyle}">
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
                                        <strong style="font-size:0.84rem;">#${n.member_code} ${topo.residency_country_code ? `[${esc(topo.residency_country_code)}]` : ''}</strong>
                                        <span style="background:${st.badge};color:#fff;font-size:0.68rem;padding:1px 6px;border-radius:999px;">
                                            ${n.stopper_slot ? esc(n.stopper_slot) : st.label}
                                        </span>
                                    </div>
                                    <div style="font-size:0.8rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;">${esc(n.full_name)}</div>
                                    <div style="font-size:0.72rem;opacity:0.85;display:flex;justify-content:space-between;margin-top:4px;">
                                        <span>${esc(n.placement_side)}</span>
                                        <span>${n.phone_visible && n.phone ? `<a href="https://wa.me/${waPhone}" target="_blank" style="color:inherit;font-weight:800;text-decoration:underline;">💬 ${esc(n.phone)}</a>` : '🔒 مقنّع D26'}</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    requestAnimationFrame(drawVerticalTreeConnectors);
}

function toggleTreeOrangeFilter() {
    window.__treeOrangeFilterOnly = !window.__treeOrangeFilterOnly;
    loadTree();
}

function drawVerticalTreeConnectors() {
    const viewport = document.getElementById('verticalTreeViewport');
    const svg = document.getElementById('treeSvgOverlay');
    const container = document.getElementById('treeLevelsContainer');
    if (!viewport || !svg || !container) return;

    svg.setAttribute('width', container.scrollWidth);
    svg.setAttribute('height', container.scrollHeight);
    svg.innerHTML = '';

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
        const x1 = pr.left - vpRect.left + pr.width / 2;
        const y1 = pr.bottom - vpRect.top;
        const x2 = cr.left - vpRect.left + cr.width / 2;
        const y2 = cr.top - vpRect.top;
        const midY = (y1 + y2) / 2;

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`);
        path.setAttribute('stroke', '#94a3b8');
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('fill', 'none');
        svg.appendChild(path);
    });
}

async function switchTreeCountryLens(countryCode) {
    await refreshDashboardBundle(countryCode || null);
    goToPage('tree');
}

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

    const grossNetworkUsd = Number(w.total_earned_usd || 0) + Number(w.s03_suspense_balance_usd || 0);
    const suspenseUsd = Number(w.s03_suspense_balance_usd || 0);
    const availableUsd = Number(w.balance_usd || 0);

    page.innerHTML = `
        <div class="wallet-page">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                <h2 style="margin:0;">💰 المحفظة والمطابقة الثلاثية (Ch. 6.2 #3)</h2>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" class="btn btn-outline btn-sm" onclick="openAddPayoutMethodModal()">+ إضافة وسيلة استلام (تهدئة 72h)</button>
                    <button type="button" class="btn btn-primary btn-sm" onclick="openRequestWithdrawalModal()">💸 طلب سحب أرباح موثق</button>
                </div>
            </div>

            <div class="wallet-main-card">
                <div class="balance-info">
                    <span class="balance-label">الرصيد المتاح للسحب بالعملة المحلية (ومرجعه المحاسبي USD)</span>
                    <span class="balance-amount">${esc(fmtLocalFromUsd(availableUsd))}</span>
                    <small style="opacity:0.9;">الرصيد المحاسبي المرجعي: <strong>${fmtUsd(availableUsd)}</strong> • حالة KYC: <strong>${esc(profile.kyc_status || 'unverified')}</strong></small>
                </div>
            </div>

            <!-- بطاقة المطابقة الثلاثية USD + العملة المحلية + ستوبر S03 + حصة الفرد المؤهل -->
            ${(() => {
                const hp = getCountryPlanInfo(profile.country_code);
                return `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));gap:12px;margin:16px 0;">
                    <div style="background:#f0fdf4;border:1.5px solid #10b981;border-radius:14px;padding:14px;">
                        <div style="font-size:0.8rem;color:#065f46;">💎 حصة الفرد المؤهل بدولتك (${esc(hp.countryCode)})</div>
                        <strong style="font-size:1.15rem;color:#047857;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(hp.unitShareUsd))}</strong>
                        <small style="color:#065f46;">${fmtUsd(hp.unitShareUsd)} = الهدف (${fmtUsd(hp.targetUsd)}) ÷ ${hp.s02}</small>
                    </div>
                    <div style="background:#fff;border:1.5px solid #cbd5e1;border-radius:14px;padding:14px;">
                        <div style="font-size:0.8rem;color:#475569;">1️⃣ إجمالي عائدات الشبكة المحتسبة</div>
                        <strong style="font-size:1.15rem;color:#0f172a;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(grossNetworkUsd))}</strong>
                        <small style="color:#64748b;">مرجع الدفتر: ${fmtUsd(grossNetworkUsd)}</small>
                    </div>
                    <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px;">
                        <div style="font-size:0.8rem;color:#92400e;">2️⃣ تسوية سقف S03 Pro-Rata (حساب 2303)</div>
                        <strong style="font-size:1.15rem;color:#b45309;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(suspenseUsd))}</strong>
                        <small style="color:#92400e;">سقف S03 المعتمد: ${esc(fmtLocalFromUsd(hp.stopperUsd))} (${fmtUsd(hp.stopperUsd)})</small>
                    </div>
                    <div style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:14px;padding:14px;">
                        <div style="font-size:0.8rem;color:#065f46;">3️⃣ صافي المحفظة القابل للصرف (حساب 2302)</div>
                        <strong style="font-size:1.15rem;color:#047857;display:block;margin-top:4px;">${esc(fmtLocalFromUsd(availableUsd))}</strong>
                        <small style="color:#065f46;">الصافي الدولاري: ${fmtUsd(availableUsd)}</small>
                    </div>
                </div>`;
            })()}

            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;margin:14px 0;font-size:0.85rem;color:#334155;">
                🛡️ <strong>ضوابط الأمان المالية (D24 / W07 / D7):</strong> يُحظر تماماً التحويل المباشر بين الأعضاء (<code>No P2P</code>)، وتخضع كل وسيلة استلام مضافة لفترة تهدئة إجبارية <code>72 ساعة</code> مع اشتراط توثيق الهوية <code>KYC = verified</code> قبل السحب.
            </div>

            <h3 style="margin:18px 0 10px;">🏦 وسائل استلام الأرباح المسجلة (${methods.length})</h3>
            ${methods.length === 0 ? '<p class="empty-state">لم تقم بإضافة وسيلة استلام بعد. أضف حسابك البنكي أو المحفظة لبدء عداد الـ 72 ساعة.</p>' : `
                <div style="display:grid;gap:8px;margin-bottom:18px;">
                    ${methods.map(m => `
                        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div>
                                <strong>${esc(String(m.provider || '').toUpperCase())}</strong> — ${esc(m.account_holder_name)} (<code>****${esc(m.last_four)}</code>)
                                <div style="font-size:0.78rem;color:#64748b;">تاريخ انتهاء التهدئة: ${new Date(m.cooldown_expires_at).toLocaleString('ar-EG')}</div>
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

            <h3>📋 سجل حركات المحفظة</h3>
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
        await window.SAWYAN.API.manageMemberPayoutMethod({
            memberId: currentMember.id,
            action: 'delete',
            methodId
        });
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
        alert('⛔ يشترط النظام توثيق الهوية الوطنية (KYC = verified) قبل سحب الأرباح (القرار D7).');
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
// Screen 6: Academy
// ---------------------------------------------------------------------------
function loadAcademy() {
    const page = document.getElementById('academyPage');
    if (!page || !memberBundle) return;
    const dbCourses = memberBundle.academy_courses || [];
    const { code } = getMemberFxContext();
    const targetLocalTxt = fmtLocalFromUsd(24.75);
    const defaults = [
        { slug: 'g01-tree', title_i18n: { ar: 'قواعد الشجرة الثنائية والتسكين التلقائي (G01–G05)' }, content_i18n: { ar: 'شرح كيفية موازنة الذراعين يميناً أولاً والفرق بين الراعي والأب المباشر.' } },
        { slug: 'd23-box', title_i18n: { ar: `صندوق الهدف الشهري (${targetLocalTxt}) والترحيل المستمر Carry On` }, content_i18n: { ar: `كيف تتراكم العوائد بعملة بلدك (${code}) وتفتح التأهل المحلي والتعويضي الدولي.` } },
        { slug: 's01-s03', title_i18n: { ar: 'فهم الستوبر العددي (11 جيل) والمالي Pro-Rata (S03)' }, content_i18n: { ar: 'نظام العمل عبر دول متعددة وضبط العدالة الاكتوارية للفريق.' } }
    ];
    const items = dbCourses.length > 0 ? dbCourses : defaults;

    page.innerHTML = `
        <h2>📚 أكاديمية SAWYAN التدريبية</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:16px;">
            ${items.map(c => `
                <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:18px;">
                    <h3 style="margin:0 0 8px;color:#065f46;font-size:1.05rem;">🎓 ${esc((c.title_i18n && (c.title_i18n.ar || c.title_i18n.en)) || c.slug)}</h3>
                    <p style="margin:0;color:#475569;font-size:0.9rem;line-height:1.6;">${esc((c.content_i18n && (c.content_i18n.ar || c.content_i18n.en)) || '')}</p>
                </div>
            `).join('')}
        </div>
    `;
}

// ---------------------------------------------------------------------------
// Screen 7 & 8: Nearby Merchants + Search/Filters + GPS Radar + Path B Modal
// ---------------------------------------------------------------------------
async function loadNearbyMerchants() {
    const page = document.getElementById('merchantsPage');
    if (!page) return;
    if (liveCatalog.length === 0) {
        await loadPublicMerchantsCatalogSafe();
    }

    const baseSource = Array.isArray(radarCatalogOverride) ? radarCatalogOverride : liveCatalog;
    const filtered = baseSource.filter(m => {
        if (merchantFilterState.country !== 'ALL' && String(m.country_code || '').toUpperCase() !== merchantFilterState.country) return false;
        if (merchantFilterState.category !== 'all' && String(m.category_code || '') !== merchantFilterState.category) return false;
        if (merchantFilterState.q) {
            const hay = `${m.business_name || ''} ${m.branch_name || ''} ${m.address || ''} ${m.merchant_code || ''}`.toLowerCase();
            if (!hay.includes(merchantFilterState.q.toLowerCase())) return false;
        }
        return true;
    });

    const favIds = new Set(((memberBundle?.profile?.metadata?.favorite_merchant_ids) || []).map(String));

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
            <div>
                <h2 style="margin:0;">🏪 التجار المعتمدون المتاحون (${filtered.length})</h2>
                <small style="color:#64748b;">يعرض هذا الدليل صافي عائدات خطة الدخل لعضوية فريقك فقط وفق قواعد الشفافية (F01 / S01).</small>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn btn-primary btn-sm" onclick="triggerGpsRadarSearch()">📍 القريبين مني (GPS Haversine)</button>
                ${radarCatalogOverride ? `<button type="button" class="btn btn-outline btn-sm" onclick="resetRadarFilter()">إلغاء فلتر المسافة</button>` : ''}
            </div>
        </div>

        <div style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:12px;margin-bottom:16px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">
            <input type="search" id="memberMerchSearch" class="form-control" placeholder="ابحث باسم المتجر أو العنوان..." value="${esc(merchantFilterState.q)}">
            <select id="memberMerchCountry" class="form-control">
                <option value="ALL" ${merchantFilterState.country === 'ALL' ? 'selected' : ''}>🌍 كل الدول</option>
                <option value="EG" ${merchantFilterState.country === 'EG' ? 'selected' : ''}>🇪🇬 مصر</option>
                <option value="TR" ${merchantFilterState.country === 'TR' ? 'selected' : ''}>🇹🇷 تركيا</option>
                <option value="SA" ${merchantFilterState.country === 'SA' ? 'selected' : ''}>🇸🇦 السعودية</option>
            </select>
            <select id="memberMerchCategory" class="form-control">
                <option value="all" ${merchantFilterState.category === 'all' ? 'selected' : ''}>📂 كل الفئات</option>
                <option value="supermarket" ${merchantFilterState.category === 'supermarket' ? 'selected' : ''}>🛒 سوبرماركت</option>
                <option value="restaurants" ${merchantFilterState.category === 'restaurants' ? 'selected' : ''}>🍽️ مطاعم</option>
                <option value="fashion" ${merchantFilterState.category === 'fashion' ? 'selected' : ''}>👗 أزياء</option>
                <option value="electronics" ${merchantFilterState.category === 'electronics' ? 'selected' : ''}>📱 إلكترونيات</option>
            </select>
        </div>

        ${filtered.length === 0 ? '<p class="empty-state">لا توجد متاجر نشطة مطابقة لخيارات البحث الحالية.</p>' : `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;">
                ${filtered.map(m => {
                    const isFav = favIds.has(String(m.merchant_id));
                    return `
                        <div style="background:#fff;border:1.5px solid #cbd5e1;border-radius:16px;padding:16px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                                <strong>${esc(m.business_name)}</strong>
                                <button type="button" onclick="toggleMerchantFavorite('${m.merchant_id}')" style="border:none;background:transparent;font-size:1.25rem;cursor:pointer;" title="المفضلة">${isFav ? '❤️' : '🤍'}</button>
                            </div>
                            <div style="font-size:0.84rem;color:#475569;margin-top:4px;">🏢 ${esc(m.branch_name)} • ${esc(m.country_code || '')}</div>
                            <div style="font-size:0.8rem;color:#64748b;margin-top:2px;">📍 ${esc(m.address)} ${m.distance_km !== undefined ? `• <strong>${Number(m.distance_km).toFixed(2)} كم</strong>` : ''}</div>
                            <div style="margin:10px 0;display:flex;justify-content:space-between;align-items:center;">
                                <span style="background:#ecfdf5;color:#047857;font-weight:800;font-size:0.82rem;padding:4px 10px;border-radius:999px;">✨ عائدات خطة الدخل: ${Number(m.plan_cashback_pct).toFixed(2)}%</span>
                                <small>${esc(m.currency_code || '')}</small>
                            </div>
                            <button type="button" class="btn btn-primary btn-block btn-sm" onclick="submitPendingPurchasePrompt('${m.merchant_id}', '${m.branch_id}', '${esc(m.business_name)}', '${esc(m.currency_code || '')}')">
                                📝 تقديم طلب توثيق شراء معلق
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `}
    `;

    const sInput = document.getElementById('memberMerchSearch');
    const cSel = document.getElementById('memberMerchCountry');
    const catSel = document.getElementById('memberMerchCategory');
    if (sInput) sInput.oninput = (e) => { merchantFilterState.q = e.target.value; loadNearbyMerchants(); };
    if (cSel) cSel.onchange = (e) => { merchantFilterState.country = e.target.value; loadNearbyMerchants(); };
    if (catSel) catSel.onchange = (e) => { merchantFilterState.category = e.target.value; loadNearbyMerchants(); };
}

async function triggerGpsRadarSearch() {
    const fallbackCoords = (memberBundle?.profile?.country_code === 'TR')
        ? { lat: 41.0082, lng: 28.9784 }
        : { lat: 30.0444, lng: 31.2357 };

    const runWithCoords = async (lat, lng) => {
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

function submitPendingPurchasePrompt(merchantId, branchId, name, currencyCode = '') {
    openMemberModal(`📝 توثيق فاتورة مشتريات — ${esc(name)}`, `
        <div>
            <label style="font-weight:700;font-size:0.86rem;">قيمة الفاتورة الإجمالية ${currencyCode ? `(${esc(currencyCode)})` : ''} *</label>
            <input type="number" step="0.01" min="1" name="amount" required class="form-control" placeholder="مثال: 500.00">
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
            <label style="font-weight:700;font-size:0.86rem;">رابط صورة الإيصال الورقي (اختياري للتسريع)</label>
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
                            <button type="button" class="btn btn-primary btn-sm" onclick="submitPendingPurchasePrompt('${m.merchant_id}', '${m.branch_id}', '${esc(m.business_name)}', '${esc(m.currency_code || '')}')">توثيق</button>
                            <button type="button" class="btn btn-outline btn-sm" onclick="toggleMerchantFavorite('${m.merchant_id}')">إزالة</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `}
    `;
}

// ---------------------------------------------------------------------------
// Screen 9: Field Mini CRM (Point 10)
// ---------------------------------------------------------------------------
function loadCRM() {
    const page = document.getElementById('crmPage');
    if (!page || !memberBundle) return;
    const contacts = memberBundle.contacts || [];
    const refLink = buildReferralUrl();

    page.innerHTML = `
        <h2>📇 دفتر المعارف الميداني (Mini CRM — Point 10)</h2>
        <form id="crmAddForm" style="background:#fff;border:1px solid #cbd5e1;border-radius:14px;padding:16px;margin:14px 0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;">
            <input type="text" id="crmName" required class="form-control" placeholder="اسم الشخص المرشح *">
            <input type="tel" id="crmPhone" class="form-control" placeholder="رقم الواتساب (+20...)">
            <input type="text" id="crmNotes" class="form-control" placeholder="ملاحظة (صديق / قريب / جار)">
            <button type="submit" class="btn btn-primary">+ إضافة لقائمة المعارف</button>
        </form>
        ${contacts.length === 0 ? '<p class="empty-state">لا يوجد جهات اتصال مضافة في قائمة معارفك حتى الآن.</p>' : `
            <div style="display:grid;gap:10px;">
                ${contacts.map(c => {
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
    `;

    const form = document.getElementById('crmAddForm');
    if (form) {
        form.addEventListener('submit', async function (e) {
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
}

async function crmAction(action, contactId) {
    try {
        await window.SAWYAN.API.manageMemberCrmContact({ memberId: currentMember.id, action, contactId });
        await refreshDashboardBundle();
    } catch (err) {
        alert('❌ خطأ: ' + err.message);
    }
}

// ---------------------------------------------------------------------------
// Screen 10: Referral Link (Auto-routed for Original / vs Parallel /preview/)
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
    if (waLink) {
        waLink.href = `https://wa.me/?text=${encodeURIComponent('سجل مجاناً في SAWYAN مع فريقي: ' + url)}`;
    }
}

function loadReferrals() {
    const page = document.getElementById('referralsPage');
    if (!page) return;
    const selectedCountry = window.__referralTargetCountry || '';
    const url = buildReferralUrl(selectedCountry);
    const countryChoices = [
        { code: '', label: '🌍 تلقائي (يختاره المدعو عند التسجيل)' },
        { code: 'EG', label: '🇪🇬 مصر (EG)' },
        { code: 'TR', label: '🇹🇷 تركيا (TR)' },
        { code: 'SA', label: '🇸🇦 السعودية (SA)' },
        { code: 'DE', label: '🇩🇪 ألمانيا (DE)' },
        { code: 'US', label: '🇺🇸 أمريكا (US)' },
        { code: 'GB', label: '🇬🇧 بريطانيا (GB)' }
    ];
    page.innerHTML = `
        <h2>🔗 رابط الإحالة الشخصي المباشر (دولي N01/N02)</h2>
        <div style="background:#fff;border:1.5px solid #10b981;border-radius:16px;padding:20px;margin-top:14px;">
            <p style="margin:0 0 12px;">كود الراعي الخاص بك: <strong>#${esc(currentMember.member_code)}</strong> — كل من يسجل عبر هذا الرابط يتأكد من اسمك الثلاثي قبل التسكين الذري التلقائي في أضعف ذراع (G01–G05).</p>
            <div style="margin-bottom:12px;">
                <label for="referralTargetCountrySelect" style="display:block;font-weight:700;font-size:0.85rem;margin-bottom:6px;color:#065f46;">🌍 الدولة المستهدفة للمدعو (توجيه الرابط لدولة أخرى):</label>
                <select id="referralTargetCountrySelect" class="form-control" style="max-width:340px;" onchange="updateReferralTargetCountry(this.value)">
                    ${countryChoices.map(c => `<option value="${c.code}" ${selectedCountry === c.code ? 'selected' : ''}>${c.label}</option>`).join('')}
                </select>
            </div>
            <div class="referral-link" style="display:flex;gap:8px;flex-wrap:wrap;">
                <input type="text" id="myReferralLinkInput" class="form-control" style="flex:1;direction:ltr;" value="${esc(url)}" readonly>
                <button type="button" class="btn btn-primary" onclick="copyReferralLink()">📋 نسخ الرابط</button>
                <a id="myReferralWaLink" href="https://wa.me/?text=${encodeURIComponent('سجل مجاناً في SAWYAN مع فريقي: ' + url)}" target="_blank" class="btn btn-outline">💬 مشاركة واتساب</a>
            </div>
        </div>
    `;
}

function copyReferralLink() {
    const input = document.getElementById('myReferralLinkInput');
    if (!input) return;
    input.select();
    navigator.clipboard?.writeText(input.value).catch(() => document.execCommand('copy'));
    alert('✅ تم نسخ رابط الإحالة!');
}

// ---------------------------------------------------------------------------
// Screen 11: Settings & Strong Password Update
// ---------------------------------------------------------------------------
function loadSettings() {
    const page = document.getElementById('settingsPage');
    if (!page || !memberBundle) return;
    const p = memberBundle.profile || currentMember;

    page.innerHTML = `
        <h2>⚙️ الملف الشخصي وإعدادات الأمان</h2>
        <form id="memberSettingsForm" style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;margin-top:14px;display:grid;gap:14px;">
            <div>
                <label>الاسم الكامل</label>
                <input type="text" id="setFullName" class="form-control" value="${esc(p.full_name || '')}" required>
            </div>
            <div>
                <label>البريد الإلكتروني</label>
                <input type="email" id="setEmail" class="form-control" value="${esc(p.email || '')}">
            </div>
            <div>
                <label>الحي / المنطقة</label>
                <input type="text" id="setDistrict" class="form-control" value="${esc(p.manual_district_fallback || '')}">
            </div>
            <hr>
            <h3 style="margin:0;font-size:1rem;">🔐 تغيير كلمة المرور (اختياري — يُحظر 123456)</h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
                <input type="password" id="setCurrPass" class="form-control" placeholder="كلمة المرور الحالية">
                <input type="password" id="setNewPass" class="form-control" minlength="8" placeholder="كلمة المرور الجديدة (8+ أحرف)">
            </div>
            <button type="submit" class="btn btn-primary">💾 حفظ الإعدادات في الخادم</button>
        </form>
    `;

    const form = document.getElementById('memberSettingsForm');
    if (form) {
        form.addEventListener('submit', async function (e) {
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
}

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
