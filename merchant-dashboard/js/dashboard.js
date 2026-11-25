// لوحة التاجر - مكتملة بكل الميزات
let currentMerchant = null;
let merchantData = null;

function swNotify(msg, type = null) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
        window.SAWYAN.UI.toast(msg, type);
    } else {
        console.info('[SAWYAN Merchant Notice]', msg);
    }
}

async function swAlertBox(title, message, type = 'info') {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.alertModal === 'function') {
        return await window.SAWYAN.UI.alertModal({ title, message, type });
    }
    swNotify(message, type);
    return true;
}

async function swConfirmBox(title, message, danger = false) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.confirmModal === 'function') {
        return await window.SAWYAN.UI.confirmModal({ title, message, danger });
    }
    return true;
}

async function swPromptBox(title, message, defaultValue = '', placeholder = '') {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.promptModal === 'function') {
        return await window.SAWYAN.UI.promptModal({ title, message, defaultValue, placeholder });
    }
    return defaultValue;
}

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = `<a href="../index.html" class="logo-link" style="text-decoration:none;">${window.SAWYAN.Logo.svg('light-on-dark')}</a>`;
    }

    await checkAuth();
    await loadStats();

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });

    // تفعيل Bottom Navigation
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const page = this.dataset.page;

            document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            showPage(page);
        });
    });

    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransaction);
    }

    initScanReceiptUploader();

    const memberCodeInput = document.getElementById('memberCodeInput');
    if (memberCodeInput) {
        memberCodeInput.addEventListener('input', function () {
            if (this.value.length > 0) {
                document.getElementById('transactionForm').style.display = 'block';
            }
        });
    }
});

async function checkAuth() {
    for (let i = 0; i < 20 && (!window.SAWYAN || !window.SAWYAN.API || !window.SAWYAN.supabase); i++) {
        await new Promise(r => setTimeout(r, 100));
    }

    let saved = (window.SAWYAN && window.SAWYAN.API) ? window.SAWYAN.API.getSavedMerchant() : null;

    // في الموقع الموازي للتجربة فقط: ربط تلقائي بالتاجر التجريبي M-EG-001 لتمكين المعاينة الحية بدون فرض تسجيل دخول يدوي
    if ((!saved || !saved.id) && window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.isDemoMode()) {
        try {
            const loginRes = await window.SAWYAN.API.authenticateMerchantLogin('M-EG-001', 'Demo@Merchant2026');
            if (loginRes && loginRes.success && loginRes.merchant) {
                window.SAWYAN.API.saveMerchantSession(loginRes.merchant, loginRes.session_token);
                saved = loginRes.merchant;
            }
        } catch (err) {
            console.warn('Demo merchant auto-session notice:', err.message);
        }
    }

    if (!saved || !saved.id) {
        window.location.href = 'login.html';
        return;
    }

    merchantData = saved;
    currentMerchant = { id: saved.id };
    const bn = document.getElementById('businessName');
    const mc = document.getElementById('merchantCode');
    if (bn) bn.textContent = merchantData.business_name || 'تاجر';
    if (mc) mc.textContent = 'كود التاجر: ' + (merchantData.merchant_code || '-');
}

let merchantBundle = null;
let posLookupDebounce = null;
let posLookupSeq = 0;
let scanPageMemberData = null;
let scanPageLookupDebounce = null;
let scanPageLookupSeq = 0;
let kioskMemberData = null;
let kioskLookupDebounce = null;
let kioskLookupSeq = 0;

/**
 * استخراج كود العضو الرقمي بأمان دون التهام أرقام الـ UUID بعد النقطتين في SAWYAN:MEMBER:<code>:<uuid>.
 */
function extractSawyanMemberCode(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return 0;
    const qrMatch = trimmed.match(/^SAWYAN:MEMBER:(\d{1,12})(?::|$)/i);
    if (qrMatch) {
        const n = Number(qrMatch[1]);
        return n > 0 ? n : 0;
    }
    const hashMatch = trimmed.match(/^#(\d{1,12})$/);
    if (hashMatch) {
        const n = Number(hashMatch[1]);
        return n > 0 ? n : 0;
    }
    if (/^[1-9]\d{0,7}$/.test(trimmed)) {
        return Number(trimmed);
    }
    return 0;
}
window.extractSawyanMemberCode = extractSawyanMemberCode;

/**
 * التحقق السيرفري من هوية العضو عند نقطة البيع (D26: اسم مقنّع دون هاتف).
 */
async function resolvePosMemberOnline(rawInput) {
    const clean = String(rawInput || '').trim();
    if (!clean || !currentMerchant?.id || !window.SAWYAN?.API) return null;
    const res = await window.SAWYAN.API.lookupMemberForPos({
        merchantId: currentMerchant.id,
        memberIdentifier: clean
    });
    if (res && res.found && Number(res.member_code) > 0) {
        return {
            id: res.member_id || null,
            code: Number(res.member_code),
            name: res.masked_name || res.full_name || (`عضو #${res.member_code}`),
            raw: clean,
            verified: true
        };
    }
    return null;
}

/**
 * حل هوية العضو قبل الاعتماد في شاشات الكاشير مع منع إرسال أي كود قديم أو تالف.
 */
async function ensurePosMemberBeforeSubmit(rawInput, cachedRecord, onResolvedPreview) {
    const clean = String(rawInput || '').trim();
    if (!clean) {
        swNotify('يرجى إدخال كود العضو أو مسح الباركود أولاً.', 'warning');
        return null;
    }
    const isOffline = forceDeadZoneSimulation || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
        const offlineCode = extractSawyanMemberCode(clean);
        if (!offlineCode || offlineCode <= 0) {
            swNotify('في وضع عدم الاتصال يرجى إدخال كود العضو الرقمي أو باركود SAWYAN:MEMBER:<كود>.', 'warning');
            return null;
        }
        return { id: null, code: offlineCode, name: `عضو #${offlineCode} (مؤقت)`, raw: clean, verified: false };
    }
    if (cachedRecord && cachedRecord.verified && cachedRecord.raw === clean && Number(cachedRecord.code) > 0) {
        return cachedRecord;
    }
    try {
        const resolved = await resolvePosMemberOnline(clean);
        if (resolved) {
            if (typeof onResolvedPreview === 'function') onResolvedPreview(resolved);
            return resolved;
        }
        swNotify('لا يوجد عضو نشط مطابق للكود أو الباركود المدخل — يرجى التأكد قبل المتابعة.', 'error');
        return null;
    } catch (err) {
        const msg = String(err?.message || '');
        if (msg.toLowerCase().includes('fetch')) {
            const offlineCode = extractSawyanMemberCode(clean);
            if (offlineCode > 0) {
                return { id: null, code: offlineCode, name: `عضو #${offlineCode} (مؤقت)`, raw: clean, verified: false };
            }
        }
        swNotify('تعذر التحقق من هوية العضو: ' + (window.SAWYAN?.UI?.humanizeError(msg) || msg || 'خطأ غير متوقع'), 'error');
        return null;
    }
}

/**
 * تنفيذ البحث المتزامن مع حراسة تسلسل الطلبات (يمنع Race Condition عبر إبطال القديم فوراً).
 */
async function runPosLookupRequest({ clean, isStale, onState }) {
    const isOffline = forceDeadZoneSimulation || (typeof navigator !== 'undefined' && !navigator.onLine);
    if (isOffline) {
        const parsedCode = extractSawyanMemberCode(clean);
        if (parsedCode > 0) {
            onState('offline', { id: null, code: parsedCode, name: `عضو #${parsedCode} (أوفلاين — سيُتحقق منه عند المزامنة)`, raw: clean, verified: false });
        } else {
            onState('not_found', null);
        }
        return;
    }
    try {
        const resolved = await resolvePosMemberOnline(clean);
        if (isStale()) return;
        if (resolved) {
            onState('found', resolved);
        } else {
            onState('not_found', null);
        }
    } catch (err) {
        if (isStale()) return;
        const msg = String(err?.message || '');
        if (msg.toLowerCase().includes('fetch')) {
            const parsedCode = extractSawyanMemberCode(clean);
            if (parsedCode > 0) {
                onState('offline', { id: null, code: parsedCode, name: `عضو #${parsedCode} (سيُتحقق منه عند المزامنة)`, raw: clean, verified: false });
                return;
            }
        }
        onState('error', msg || 'تعذر التحقق اللحظي');
    }
}

async function refreshMerchantBundle(shiftFilter = 'today', branchId = null) {
    if (!currentMerchant || !currentMerchant.id || !(window.SAWYAN && window.SAWYAN.API)) return null;
    try {
        merchantBundle = await window.SAWYAN.API.getMerchantDashboardBundle({
            merchantId: currentMerchant.id,
            shiftFilter,
            branchId
        });
        window.__merchantBundleCache = merchantBundle;
        if (merchantBundle && merchantBundle.profile) {
            merchantData = { ...merchantData, ...merchantBundle.profile };
            window.SAWYAN.API.saveMerchantSession(merchantData, null);
            const bn = document.getElementById('businessName');
            const mc = document.getElementById('merchantCode');
            if (bn) bn.textContent = merchantData.business_name || 'تاجر';
            if (mc) mc.textContent = `كود التاجر: ${merchantData.merchant_code} • ${merchantData.country_code || ''}`;
        }
        if (window.SAWYAN && window.SAWYAN.Notifications && Array.isArray(merchantBundle?.notifications)) {
            if (!window.SAWYAN.Notifications.userId && currentMerchant?.id) {
                window.SAWYAN.Notifications.init('merchant', currentMerchant.id);
            }
            window.SAWYAN.Notifications.hydrateFromBundle(merchantBundle.notifications);
        }
        renderLiveHomeStats();
        _syncOwnerLiveAlertsAndPoll(merchantBundle);
        if (currentMerchant?.id && window.SAWYAN?.API?.recordDeviceFraudFingerprint) {
            window.SAWYAN.API.recordDeviceFraudFingerprint({ actorType: 'merchant', actorId: currentMerchant.id });
        }
        return merchantBundle;
    } catch (err) {
        console.error('Merchant bundle error:', err);
        if (String(err.message || '').includes('UNAUTHORIZED_MERCHANT_SESSION')) {
            window.SAWYAN.API.clearMerchantSession();
            window.location.href = 'login.html';
        }
        return null;
    }
}

async function loadStats() {
    await refreshMerchantBundle('today', null);
    if (typeof SawyanOfflinePosVault !== 'undefined') {
        await SawyanOfflinePosVault.refreshHeaderBadge();
    }
}

function getMerLocale() {
    const lang = (window.SAWYAN && window.SAWYAN.I18n && typeof window.SAWYAN.I18n.getLang === 'function')
        ? window.SAWYAN.I18n.getLang()
        : (document.documentElement.lang || 'ar');
    return lang === 'en' ? 'en-US' : (lang === 'tr' ? 'tr-TR' : 'ar-EG');
}

function fmtMerchantMoney(val, curr) {
    const c = curr || merchantBundle?.profile?.currency_code || merchantData?.currency_code || 'EGP';
    const raw = Number(val || 0);
    const n = Math.abs(raw) < 0.005 ? 0 : raw;
    return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function getMerchantFifoBannerHtml(p, pendingList) {
    const fifoItems = (pendingList || []).filter(t => t.status === 'awaiting_merchant_topup');
    const cashBal = Number(p?.actual_cash_balance || 0);
    const credLim = Number(p?.credit_limit || 0);
    const freeBal = Number(p?.free_balance ?? (cashBal - Number(p?.soft_hold_balance || 0) + credLim));
    const effAcc = p?.effective_access || {};
    const posLocked = effAcc.can_accept_pos === false;
    if (fifoItems.length === 0 && !p?.is_isolated && freeBal > 0 && !posLocked) return '';
    if (fifoItems.length === 0 && posLocked && p?.pos_lock_reason_ar && p?.financial_status !== 'locked_queue_full') {
        const needsProfile = p?.onboarding_status && p.onboarding_status !== 'approved';
        const needsFunding = !needsProfile && (p?.financial_status === 'unfunded' || freeBal <= 0);
        const actionBtns = needsProfile
            ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                    <button type="button" onclick="showPage('settings')" style="background:#d97706;color:#fff;border:none;padding:8px 15px;border-radius:9px;font-weight:800;font-size:0.84rem;cursor:pointer;font-family:'Tajawal',sans-serif;">⚙️ استكمال بيانات المتجر الآن</button>
                    <button type="button" onclick="openMerchantTopupModal()" style="background:#059669;color:#fff;border:none;padding:8px 15px;border-radius:9px;font-weight:800;font-size:0.84rem;cursor:pointer;font-family:'Tajawal',sans-serif;">💳 شحن الرصيد الافتتاحي</button>
               </div>`
            : (needsFunding
                ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                        <button type="button" onclick="openMerchantTopupModal()" style="background:#059669;color:#fff;border:none;padding:9px 18px;border-radius:9px;font-weight:900;font-size:0.86rem;cursor:pointer;font-family:'Tajawal',sans-serif;box-shadow:0 3px 10px rgba(5,150,105,0.28);">💳 اشحن رصيدك الآن لتفعيل المتجر</button>
                        <button type="button" onclick="showPage('financial')" style="background:#ffffff;color:#065f46;border:1.5px solid #10b981;padding:8px 14px;border-radius:9px;font-weight:800;font-size:0.82rem;cursor:pointer;font-family:'Tajawal',sans-serif;">📊 الموقف المالي وطلبات الشحن</button>
                   </div>`
                : '');
        return `
            <div style="background:#fef2f2;border:2px solid #f87171;border-radius:14px;padding:13px 16px;margin-bottom:14px;color:#7f1d1d;">
                <div style="font-weight:900;font-size:0.95rem;margin-bottom:4px;">🔒 توثيق الفواتير مغلق مؤقتاً</div>
                <div style="font-size:0.84rem;line-height:1.65;">${escM(p.pos_lock_reason_ar)}</div>
                ${actionBtns}
            </div>
        `;
    }
    const curr = p?.currency_code || 'EGP';
    const fifoGross = fifoItems.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const fifoComm = fifoItems.reduce((s, t) => s + Number(t.commission_amount || 0), 0);
    const headline = fifoItems.length > 0
        ? `🔴 تنبيه هام: متجرك موقوف مؤقتاً بالظهور ولديك ${fifoItems.length} فاتورة بانتظار شحن الرصيد`
        : (freeBal < 0
            ? `🔴 رصيدك الحالي مديون (${fmtMerchantMoney(freeBal, curr)}) — يرجى السداد وشحن الرصيد`
            : (p?.is_isolated
                ? '🔴 تنبيه هام: متجرك مخفي مؤقتاً من دليل الأعضاء حتى إعادة الشحن'
                : '⚠️ رصيد الشحن المسبق الحالي (0.00) لا يكفي لتمرير المبيعات'));
    const balSummary = `رصيد الشحن المسبق: <b>${fmtMerchantMoney(cashBal, curr)}</b> • الحد الائتماني المعتمد: <b>${fmtMerchantMoney(credLim, curr)}</b> • الصافي المتاح: <b>${fmtMerchantMoney(freeBal, curr)}</b>`;
    const detail = fifoItems.length > 0
        ? `إجمالي قيمة الفواتير المحجوزة: <b>${fmtMerchantMoney(fifoGross, curr)}</b> • العمولة المطلوبة لتحريرها فوراً: <b>${fmtMerchantMoney(fifoComm, curr)}</b>. بمجرد شحن الرصيد تُعتمد هذه الفواتير تلقائياً بالترتيب وتظهر في مبيعاتك.<div style="margin-top:4px;font-size:0.78rem;">${balSummary}</div>`
        : `${balSummary}. أي عملية بيع تسجّلها الآن ستبقى بانتظار الشحن ولن تُعتمد إلا بعد شحن رصيدك المسبق.`;
    return `
        <div style="background:#fef2f2;border:2px solid #f87171;border-radius:14px;padding:14px 16px;margin-bottom:14px;color:#7f1d1d;">
            <div style="font-weight:900;font-size:0.96rem;margin-bottom:4px;">${headline}</div>
            <div style="font-size:0.83rem;line-height:1.6;margin-bottom:10px;">${detail}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${fifoItems.length > 0 ? `<button type="button" onclick="showPage('pending')" style="background:#b91c1c;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-weight:800;font-size:0.8rem;cursor:pointer;">⏸️ عرض فواتير انتظار الشحن (${fifoItems.length})</button>` : ''}
                <button type="button" onclick="showPage('financial')" style="background:#065f46;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-weight:800;font-size:0.8rem;cursor:pointer;">🏦 شحن الرصيد / الموقف المالي</button>
            </div>
        </div>
    `;
}

function syncMerchantBalanceWarnings() {
    const p = merchantBundle?.profile || merchantData;
    if (!p) return;
    const pendingList = merchantBundle?.pending_transactions || [];
    const html = getMerchantFifoBannerHtml(p, pendingList);
    const isOnboardingOrUnfunded = ((p.onboarding_status || 'approved') !== 'approved') || (p.financial_status === 'unfunded');
    [
        { hostId: 'homePage', bannerId: 'merchantFifoIsolationBanner' },
        { hostId: 'scanPage', bannerId: 'scanFifoBalanceWarning' },
        { hostId: 'qrScannerPage', bannerId: 'qrFifoBalanceWarning' },
        { hostId: 'kioskPage', bannerId: 'kioskFifoBalanceWarning' }
    ].forEach(({ hostId, bannerId }) => {
        const host = document.getElementById(hostId);
        if (!host) return;
        let box = document.getElementById(bannerId);
        // Prevent duplicating the red lock banner right above the 3-step activation card on homePage
        if (!html || (hostId === 'homePage' && isOnboardingOrUnfunded)) {
            if (box) box.remove();
            return;
        }
        if (!box) {
            box = document.createElement('div');
            box.id = bannerId;
            host.insertBefore(box, host.firstChild);
        }
        box.innerHTML = html;
    });
}

function formatMerchantErrorMessage(err) {
    if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.humanizeError === 'function') {
        return window.SAWYAN.UI.humanizeError(err);
    }
    return String((err && err.message) || err || 'حدث خطأ غير متوقع');
}

window.toggleMerchantSelfPause = async function () {
    const p = merchantBundle?.profile;
    if (!p || !currentMerchant?.id) return;
    const isPaused = p.governance_status === 'paused_by_merchant';
    const note = isPaused
        ? 'استئناف نشاط المتجر بطلب التاجر'
        : await swPromptBox('وضع المتجر في إجازة مؤقتة', 'اذكر سبب الإجازة أو الإغلاق المؤقت (اختياري):', 'إجازة / صيانة مؤقتة للمتجر', 'مثال: صيانة / جرد / إجازة أسبوعية');
    if (!isPaused && note === null) return;
    try {
        await window.SAWYAN.API.toggleMerchantPause({ merchantId: currentMerchant.id, note: note || '' });
        swNotify(isPaused ? 'تم استئناف تشغيل المتجر وإعادته لحالته السابقة بنجاح!' : 'تم وضع المتجر في إجازة مؤقتة وإخفاؤه من الدليل.', 'success');
        await loadStats();
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    }
};

window.shareMerchantStoreWhatsApp = function () {
    const p = merchantBundle?.profile || merchantData || {};
    const storeName = p.business_name || 'متجرنا';
    const storeCode = p.merchant_code || '';
    const cityLine = p.city ? ` (${p.city})` : '';
    const msg =
        `🛍️ أهلاً بأعضاء SAWYAN!\n` +
        `يسعدنا استقبالكم في «${storeName}»${cityLine} — متجر شريك معتمد في منصة SAWYAN` +
        (storeCode ? ` (كود المتجر: ${storeCode})` : '') +
        `.\n\n🧾 اطلب توثيق فاتورتك عند الكاشير فوراً للاستفادة من عائدات الاستهلاك الاستثماري وإغلاق هدفك الشهري بكل سهولة!`;
    const url = 'https://wa.me/?text=' + encodeURIComponent(msg);
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg).catch(() => {});
            swNotify('تم نسخ رسالة مشاركة المتجر — يمكنك لصقها مباشرة في واتساب.', 'success');
        } else {
            window.location.href = url;
        }
    }
};

function renderMerchantLifecycleAndD4Cards() {
    const p = merchantBundle?.profile;
    const homePage = document.getElementById('homePage');
    if (!p || !homePage) return;

    const acc = p.effective_access || {};
    const curr = p.currency_code || 'EGP';
    const warn1Pct = Number(p.warn1_pct || 30);
    const warn2Pct = Number(p.warn2_pct || 20);
    const onbLabels = {
        draft_incomplete: '⚠️ مسودة غير مكتملة',
        needs_correction: '✏️ مطلوب استيفاء وتصحيح',
        approved: '✅ مؤهل ومعتمد بياناتياً',
        rejected: '🚫 مرفوض إدارياً'
    };
    const finLabels = {
        unfunded: '⚪ بانتظار شحن الرصيد الافتتاحي',
        healthy_green: `🟢 سليم — أعلى من ${warn1Pct}%`,
        warning_yellow: `🟡 تنبيه مبكر — ${warn1Pct}% فأقل`,
        warning_red: `🟠 إنذار حرج — ${warn2Pct}% فأقل`,
        isolated_low_balance: '🔴 مخفي مؤقتاً لانخفاض الرصيد (التوثيق متاح)',
        depleted_fifo_grace: '⏸️ فواتير بانتظار شحن الرصيد (' + Number(p.fifo_queue_count || 0) + '/' + Number(p.effective_queue_cap ?? 3) + ')',
        locked_queue_full: '🔒 توثيق الفواتير متوقف لحين شحن الرصيد أو السداد'
    };
    const govLabels = {
        good_standing: '🟢 سليم ممتثل',
        probation_warning: '🟡 تنبيه التزام (ملاحظة أولى)',
        restricted_no_reject: '🟠 تقييد تشغيلي (الرفض عبر الإدارة)',
        paused_by_merchant: '⏸️ إجازة بطلب التاجر',
        paused_by_admin: '⏸️ موقوف إدارياً',
        suspended_compliance: '🔴 تعليق امتثال (' + Number(p.overdue_days || 0) + 'ي)',
        banned_permanent: '🚫 إيقاف نهائي للحساب'
    };

    const isApprovedOnb = (p.onboarding_status || 'approved') === 'approved';
    const isUnfunded = p.financial_status === 'unfunded';
    const canSelfPause = isApprovedOnb && !isUnfunded && ['good_standing', 'probation_warning', 'paused_by_merchant'].includes(p.governance_status || 'good_standing');
    const isSelfPaused = p.governance_status === 'paused_by_merchant';
    const pendTopups = Array.isArray(merchantBundle?.pending_topup_requests)
        ? merchantBundle.pending_topup_requests
        : (Array.isArray(merchantBundle?.pending_topups) ? merchantBundle.pending_topups : []);
    const requireTopupProof = Boolean(merchantBundle?.verification_settings?.require_topup_proof);
    const accessModeAr = {
        full: 'نشط ومفعّل',
        complete_profile_only: 'استكمال البيانات',
        topup_only: 'شحن الرصيد والسداد',
        appeal_and_repay_only: 'مراجعة وسداد',
        blocked: 'الحساب موقوف'
    }[acc.portal_access_mode || 'full'] || (acc.portal_access_mode || 'full');

    const anchor = homePage.querySelector('.stats-grid') || homePage.firstChild;
    let lcBox = document.getElementById('merchantLifecycleStatusCard');
    if (!lcBox) {
        lcBox = document.createElement('div');
        lcBox.id = 'merchantLifecycleStatusCard';
        homePage.insertBefore(lcBox, anchor);
    }

    const reasonText = p.hide_reason_ar || p.pos_lock_reason_ar || (p.onboarding_status === 'needs_correction' ? p.onboarding_notes : '') || '';
    const safeCap = Math.max(0, Number(p.safe_sales_capacity || 0));

    if (!isApprovedOnb || isUnfunded) {
        const step1Done = isApprovedOnb;
        const step2PendingReview = pendTopups.length > 0;
        const step2Instruction = requireTopupProof
            ? 'حوّل مبلغ شحن الرصيد لحساب SAWYAN البنكي وأرفق رقم المرجع أو الإيصال (أو اطلب بيانات الحساب بضغطة واتساب) — يفتح الكاشير ويظهر متجرك للأعضاء فور المطابقة.'
            : 'حوّل مبلغ شحن الرصيد لحساب SAWYAN البنكي ثم أرسل إشعاراً بالمبلغ من الزر أدناه (بدون الحاجة لمستند مؤقتاً) — يفتح الكاشير ويظهر متجرك للأعضاء فور اعتماد المالية.';
        const step2Html = step2PendingReview
            ? `<div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:10px 12px;">
                    <div style="font-weight:900;color:#92400e;font-size:0.86rem;">⏳ 2. طلب شحن الرصيد قيد المراجعة لدى المالية (${pendTopups.length})</div>
                    <div style="font-size:0.79rem;color:#78350f;margin-top:3px;">تم استلام إشعار تحويلك — بمجرد تأكيد المالية يُفعّل متجرك ويظهر في الدليل تلقائياً.</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                        <button type="button" onclick="showPage('financial')" class="btn btn-sm" style="background:#fff;border:1.5px solid #d97706;color:#92400e;font-weight:800;">📊 متابعة حالة الطلب</button>
                        <button type="button" onclick="openMerchantTopupModal()" class="btn btn-sm" style="background:#059669;color:#fff;border:none;font-weight:800;">➕ إرسال تحويل جديد</button>
                    </div>
               </div>`
            : `<div style="background:${step1Done ? '#ecfdf5' : '#f8fafc'};border:2px solid ${step1Done ? '#10b981' : '#cbd5e1'};border-radius:10px;padding:12px;">
                    <div style="font-weight:900;color:${step1Done ? '#065f46' : '#334155'};font-size:0.88rem;">${step1Done ? '👉 2. الخطوة المطلوبة الآن: اشحن رصيدك الافتتاحي' : '2. شحن الرصيد الافتتاحي'}</div>
                    <div style="font-size:0.8rem;color:#334155;margin-top:4px;line-height:1.55;">${step2Instruction}</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                        <button type="button" onclick="openMerchantTopupModal()" class="btn btn-primary" style="background:#059669;border-color:#047857;font-weight:900;font-size:0.88rem;padding:9px 18px;">💳 اشحن رصيدك الآن</button>
                        <button type="button" onclick="showPage('financial')" class="btn btn-outline btn-sm" style="font-weight:800;">📊 صفحة المالية</button>
                    </div>
               </div>`;

        lcBox.innerHTML = `
            <div style="background:#ffffff;border:2px solid ${step1Done ? '#10b981' : '#f59e0b'};border-radius:16px;padding:16px;margin-bottom:14px;box-shadow:0 4px 14px rgba(15,23,42,0.06);">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                    <div style="font-weight:900;font-size:1rem;color:#0f172a;">🚀 خطوات تفعيل متجرك للظهور للأعضاء</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                        <span style="padding:3px 9px;border-radius:999px;font-size:0.74rem;font-weight:800;background:#fee2e2;color:#991b1b;">🔴 مخفي عن الدليل مؤقتاً</span>
                        <span style="padding:3px 9px;border-radius:999px;font-size:0.74rem;font-weight:800;background:#fee2e2;color:#991b1b;">🔒 الكاشير بانتظار التفعيل</span>
                    </div>
                </div>
                <div style="display:grid;gap:10px;">
                    <div style="background:${step1Done ? '#f0fdf4' : '#fffbeb'};border:1.5px solid ${step1Done ? '#86efac' : '#f59e0b'};border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                        <div>
                            <div style="font-weight:900;color:${step1Done ? '#166534' : '#92400e'};font-size:0.86rem;">${step1Done ? '✅ 1. تم اعتماد بيانات متجرك بنجاح' : '⚠️ 1. استكمال ومراجعة بيانات المتجر'}</div>
                            <div style="font-size:0.78rem;color:#475569;margin-top:2px;">${step1Done ? 'بياناتك ونسبة العمولة (' + Number(p.deduction_percent || 0) + '%) معتمدة وجاهزة.' : escM(p.onboarding_notes || 'يرجى استكمال البيانات الناقصة من الإعدادات ليتم اعتماد المتجر.')}</div>
                        </div>
                        ${!step1Done ? `<button type="button" onclick="showPage('settings')" class="btn btn-sm" style="background:#d97706;color:#fff;border:none;font-weight:800;">⚙️ استكمال البيانات</button>` : ''}
                    </div>
                    ${step2Html}
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;font-size:0.8rem;color:#475569;">
                        <strong>🔓 3. الظهور في دليل الأعضاء وفتح الكاشير:</strong> يُفتح تلقائياً فور تأكيد المالية لطلب شحن الرصيد دون أي خطوات إضافية.
                    </div>
                </div>
            </div>
        `;
    } else {
        const isHealthyActive =
            p.financial_status === 'healthy_green' &&
            (p.governance_status || 'good_standing') === 'good_standing' &&
            acc.is_visible_on_radar !== false &&
            acc.can_accept_pos !== false &&
            !reasonText;

        if (isHealthyActive) {
            lcBox.innerHTML = `
                <div data-spec-id="merchant-active-action-bar" style="background:#ffffff;border:1.5px solid #a7f3d0;border-radius:14px;padding:12px 14px;margin-bottom:14px;box-shadow:0 3px 10px rgba(6,78,59,0.06);display:grid;gap:9px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="padding:3px 10px;border-radius:999px;font-size:0.78rem;font-weight:900;background:#d1fae5;color:#065f46;">🟢 المتجر نشط وظاهر</span>
                            <span style="font-size:0.78rem;font-weight:800;color:#334155;">تغطية المبيعات: حتى <strong style="color:#047857;display:inline-block;" dir="ltr">${fmtMerchantMoney(safeCap, curr)}</strong></span>
                        </div>
                        <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;">
                            <button type="button" onclick="openMerchantTopupModal()" class="btn btn-sm" style="background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;padding:5px 8px;font-size:0.74rem;font-weight:800;border-radius:8px;cursor:pointer;white-space:nowrap;">💳 شحن الرصيد</button>
                            <button type="button" onclick="shareMerchantStoreWhatsApp()" class="btn btn-sm" style="background:#f0fdf4;color:#15803d;border:1px solid #86efac;padding:5px 8px;font-size:0.74rem;font-weight:800;border-radius:8px;cursor:pointer;white-space:nowrap;">📲 شارك متجرك</button>
                            ${canSelfPause ? `<button type="button" onclick="toggleMerchantSelfPause()" class="btn btn-sm" style="background:#f8fafc;color:#475569;border:1px solid #cbd5e1;padding:5px 8px;font-size:0.74rem;font-weight:800;border-radius:8px;cursor:pointer;white-space:nowrap;">⏸️ إجازة</button>` : ''}
                        </div>
                    </div>
                    <button type="button" onclick="showPage('kiosk')" style="width:100%;background:linear-gradient(135deg,#059669,#047857);color:#ffffff;border:none;border-radius:10px;padding:11px 16px;font-weight:900;font-size:0.95rem;cursor:pointer;font-family:'Tajawal',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 12px rgba(5,150,105,0.24);">
                        <span>🧾</span>
                        <span>توثيق فاتورة عميل الآن</span>
                    </button>
                </div>
            `;
        } else {
            lcBox.innerHTML = `
                <div style="background:#ffffff;border:1.5px solid ${acc.is_visible_on_radar ? '#10b981' : (acc.can_accept_pos ? '#f59e0b' : '#ef4444')};border-radius:14px;padding:14px 16px;margin-bottom:14px;box-shadow:0 2px 8px rgba(15,23,42,0.04);">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:8px;">
                        <div style="font-weight:900;font-size:0.95rem;color:#0f172a;">🧭 حالة المتجر والتشغيل (${escM(accessModeAr)})</div>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                            <span style="padding:3px 9px;border-radius:999px;font-size:0.75rem;font-weight:800;background:${acc.is_visible_on_radar ? '#d1fae5' : '#fee2e2'};color:${acc.is_visible_on_radar ? '#065f46' : '#991b1b'};">${acc.is_visible_on_radar ? '🟢 ظاهر بالدليل والرادار' : '🔴 مخفي عن الدليل'}</span>
                            <span style="padding:3px 9px;border-radius:999px;font-size:0.75rem;font-weight:800;background:${acc.can_accept_pos ? '#d1fae5' : '#fee2e2'};color:${acc.can_accept_pos ? '#065f46' : '#991b1b'};">${acc.can_accept_pos ? '🟢 الكاشير مفتوح' : '🔒 الكاشير مغلق'}</span>
                            <button type="button" onclick="openMerchantTopupModal()" class="btn btn-sm" style="background:#059669;color:#fff;border:none;padding:4px 10px;font-size:0.76rem;font-weight:800;border-radius:8px;cursor:pointer;">💳 شحن الرصيد</button>
                            ${acc.is_visible_on_radar ? `<button type="button" onclick="shareMerchantStoreWhatsApp()" class="btn btn-sm" style="background:#f0fdf4;color:#15803d;border:1px solid #86efac;padding:4px 10px;font-size:0.76rem;font-weight:800;border-radius:8px;cursor:pointer;">📲 شارك متجرك</button>` : ''}
                            ${canSelfPause ? `<button type="button" onclick="toggleMerchantSelfPause()" class="btn btn-sm" style="background:${isSelfPaused ? '#059669' : '#f1f5f9'};color:${isSelfPaused ? '#fff' : '#334155'};border:1px solid #cbd5e1;padding:4px 10px;font-size:0.76rem;font-weight:800;border-radius:8px;cursor:pointer;">${isSelfPaused ? '▶️ إنهاء الإجازة وتفعيل المتجر' : '⏸️ وضع إجازة / إغلاق مؤقت'}</button>` : ''}
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,185px),1fr));gap:8px;font-size:0.8rem;">
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;">
                            <div style="color:#64748b;font-weight:700;font-size:0.72rem;">تأهيل الحساب والبيانات</div>
                            <div style="font-weight:800;color:#0f172a;margin-top:2px;">${escM(onbLabels[p.onboarding_status] || p.onboarding_status || 'approved')}</div>
                        </div>
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;">
                            <div style="color:#64748b;font-weight:700;font-size:0.72rem;">الرصيد والتغطية</div>
                            <div style="font-weight:800;color:#0f172a;margin-top:2px;">${escM(finLabels[p.financial_status] || p.financial_status || 'healthy_green')}</div>
                        </div>
                        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px;">
                            <div style="color:#64748b;font-weight:700;font-size:0.72rem;">حالة الحساب والالتزام</div>
                            <div style="font-weight:800;color:#0f172a;margin-top:2px;">${escM(govLabels[p.governance_status] || p.governance_status || 'good_standing')}</div>
                        </div>
                    </div>
                    ${reasonText ? `<div style="margin-top:8px;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:7px 10px;font-size:0.79rem;font-weight:700;color:#92400e;">ℹ️ ${escM(reasonText)}</div>` : ''}
                </div>
            `;
        }
    }

    let d4Box = document.getElementById('merchantD4SettlementCard');
    const credLim = Number(p.credit_limit || 0);
    const cashBal = Number(p.actual_cash_balance || 0);
    const dueStmt = Number(p.d4_statement_due_local || 0);
    if (credLim <= 0 || (cashBal >= 0 && dueStmt <= 0)) {
        if (d4Box) d4Box.remove();
        return;
    }
    if (!d4Box) {
        d4Box = document.createElement('div');
        d4Box.id = 'merchantD4SettlementCard';
        homePage.insertBefore(d4Box, anchor);
    }

    const openCycleComm = Number(p.d4_open_cycle_comm_local || 0);
    const closeMs = p.d4_cycle_close_at ? new Date(p.d4_cycle_close_at).getTime() : 0;
    const minsToClose = closeMs ? Math.round((closeMs - Date.now()) / 60000) : 9999;
    const isPreCutoffWarn = !p.d4_time_trigger_disabled && !p.d4_in_grace_window && !p.cutoff_breached && minsToClose > 0 && minsToClose <= 60;

    let d4BannerBg = '#eff6ff';
    let d4BannerBorder = '#60a5fa';
    let d4BannerTitle = '💳 جدول تسوية الحد الائتماني المعتمد';
    if (p.cutoff_breached) {
        d4BannerBg = '#fef2f2';
        d4BannerBorder = '#ef4444';
        d4BannerTitle = '🚨 انتهت مهلة السداد للحد الائتماني — تم إيقاف استقبال الفواتير لحين السداد';
    } else if (p.d4_in_grace_window) {
        d4BannerBg = '#fff7ed';
        d4BannerBorder = '#f97316';
        d4BannerTitle = '⏳ المتجر داخل مهلة السداد الإضافية — سدد المستحق قبل الإيقاف التلقائي';
    } else if (isPreCutoffWarn) {
        d4BannerBg = '#fffbeb';
        d4BannerBorder = '#f59e0b';
        d4BannerTitle = `🔔 تنبيه مسائي: تبقى نحو ${minsToClose} دقيقة على إغلاق دورة السداد اليوم`;
    }

    const closeTxt = p.d4_cycle_close_at ? new Date(p.d4_cycle_close_at).toLocaleString(getMerLocale()) : '—';
    const graceTxt = p.d4_grace_due_at ? new Date(p.d4_grace_due_at).toLocaleString(getMerLocale()) : '—';
    d4Box.innerHTML = `
        <div style="background:${d4BannerBg};border:2px solid ${d4BannerBorder};border-radius:14px;padding:13px 16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px;">
                <div style="font-weight:900;font-size:0.94rem;color:#0f172a;">${d4BannerTitle}</div>
                <button type="button" onclick="openMerchantTopupModal()" class="btn btn-primary btn-sm">💳 السداد والشحن الآن</button>
            </div>
            <div style="font-size:0.8rem;color:#334155;display:flex;gap:14px;flex-wrap:wrap;line-height:1.6;">
                <span>📌 مستحق الدورة المغلقة الواجب سداده: <strong style="color:#b91c1c;" dir="ltr">${fmtMerchantMoney(dueStmt, curr)}</strong></span>
                <span>📊 الجاري بالدورة المفتوحة: <strong dir="ltr">${fmtMerchantMoney(openCycleComm, curr)}</strong></span>
                ${p.d4_time_trigger_disabled
                    ? '<span>⚖️ النمط: <strong>سقف مبلغ فقط (بدون إغلاق زمني)</strong></span>'
                    : `<span>⏱️ الدورة: كل <strong>${Number(p.d4_effective_cycle_days || 1)}</strong> يوم • إغلاق <strong>${escM(String(p.d4_effective_cutoff_time || '23:59:00').slice(0, 5))}</strong> • سماح <strong>${Number(p.d4_effective_grace_hours ?? 2)}</strong> ساعة</span>`}
                ${!p.d4_time_trigger_disabled && p.d4_cycle_close_at ? `<span>🔚 الإغلاق: <strong>${escM(closeTxt)}</strong> • نهاية السماح: <strong>${escM(graceTxt)}</strong></span>` : ''}
            </div>
        </div>
    `;
}

function renderLiveHomeStats() {
    const p = merchantBundle?.profile;
    if (!p) return;
    const curr = p.currency_code || 'EGP';
    const pct = Number(p.deduction_percent || 10).toFixed(1);
    const pendingList = merchantBundle?.pending_transactions || [];
    const fifoCount = pendingList.filter(t => t.status === 'awaiting_merchant_topup').length;
    const pendCount = pendingList.filter(t => t.status === 'pending').length;

    const todaySalesEl = document.getElementById('todaySales');
    const todayTransEl = document.getElementById('todayTransactions');
    const commsDueEl = document.getElementById('totalCommissionsDue');
    const todayNetEl = document.getElementById('todayMerchantNet');
    const prepaidEl = document.getElementById('pendingPayment');
    const contractPctEl = document.getElementById('radarCardContractPct');
    const zoneEl = document.getElementById('radarCardZoneStatus');

    if (todaySalesEl) todaySalesEl.textContent = fmtMerchantMoney(p.today_sales_local, curr);
    if (todayTransEl) {
        const extra = [
            fifoCount > 0 ? `⏸️ ${fifoCount} بانتظار الشحن` : '',
            pendCount > 0 ? `⏳ ${pendCount} معلقة` : ''
        ].filter(Boolean).join(' • ');
        todayTransEl.textContent = `${p.today_completed_count || 0} عمليات مكتملة اليوم` + (extra ? ` • ${extra}` : '');
    }
    if (commsDueEl) {
        const tc = Number(p.today_commission_local || 0);
        commsDueEl.textContent = (tc > 0.004 ? '-' : '') + fmtMerchantMoney(Math.abs(tc), curr);
    }
    if (todayNetEl) todayNetEl.textContent = fmtMerchantMoney(p.today_merchant_net_local, curr);
    if (prepaidEl) {
        const cashBal = Number(p.actual_cash_balance || 0);
        const holdBal = Number(p.soft_hold_balance || 0);
        const credLim = Number(p.credit_limit || 0);
        const freeBal = Number(p.free_balance ?? (cashBal - holdBal + credLim));
        const safeCap = Math.max(0, Number(p.safe_sales_capacity || 0));

        prepaidEl.textContent = fmtMerchantMoney(freeBal, curr);
        prepaidEl.style.color = freeBal < 0 ? '#dc2626' : (freeBal === 0 ? '#b45309' : '#047857');

        const hint = document.getElementById('homePrepaidHint') || prepaidEl.nextElementSibling;
        if (hint) {
            if (freeBal < 0) {
                hint.textContent = '🔴 رصيد مديون — سعة المبيعات الآمنة 0.00 (معزول لحين السداد/التغطية)';
                hint.style.color = '#dc2626';
            } else if (p.is_isolated) {
                hint.textContent = '🔴 المتجر مخفي مؤقتاً — اشحن الرصيد لإعادة الظهور واعتماد الفواتير';
                hint.style.color = '#dc2626';
            } else {
                const zoneShortAr = {
                    GREEN: 'منطقة آمنة',
                    YELLOW: 'تنبيه مبكر',
                    RED: 'إنذار حرج',
                    ISOLATED: 'مخفي مؤقتاً'
                }[p.zone_status] || 'نشط';
                hint.textContent = `🟢 يكفي مبيعات حتى ${fmtMerchantMoney(safeCap, curr)} (${zoneShortAr})`;
                hint.style.color = '#059669';
            }
        }

        const brkEl = document.getElementById('homeBalanceBreakdown');
        if (brkEl) {
            const cashClr = cashBal < 0 ? '#dc2626' : (cashBal === 0 ? '#b45309' : '#059669');
            const credClr = credLim > 0 ? '#1d4ed8' : '#64748b';
            brkEl.innerHTML =
                `شحن مسبق: <span dir="ltr" style="color:${cashClr};font-weight:900;">${fmtMerchantMoney(cashBal, curr)}</span>${cashBal < 0 ? ' <span style="color:#dc2626;">(مديون)</span>' : ''}` +
                ` • حد ائتماني: <span dir="ltr" style="color:${credClr};font-weight:900;">${fmtMerchantMoney(credLim, curr)}</span>` +
                (holdBal > 0 ? ` • محجوز: <span dir="ltr" style="color:#b45309;font-weight:900;">${fmtMerchantMoney(holdBal, curr)}</span>` : '');
        }
    }
    if (contractPctEl) {
        contractPctEl.textContent = p.commission_pending ? 'غير محددة بعد' : `${pct}%`;
    }
    if (zoneEl) {
        const zoneMap = {
            GREEN: '🟢 المنطقة الآمنة — أعلى من 30%',
            YELLOW: '🟡 تنبيه شحن رصيد مبكر — 30% فأقل',
            RED: '🟠 إنذار حرج للرصيد — 20% فأقل',
            ISOLATED: '🔴 مخفي مؤقتاً لحين شحن الرصيد — 10% فأقل'
        };
        zoneEl.textContent = zoneMap[p.zone_status] || p.zone_status;
    }
    syncMerchantBalanceWarnings();
    renderMerchantLifecycleAndD4Cards();
    renderMerchantCompletionBanner();
}

async function renderMerchantCompletionBanner() {
    const p = merchantBundle?.profile;
    const homePage = document.getElementById('homePage');
    const eng = window.SAWYAN && window.SAWYAN.RegEngine;
    if (!p || !homePage || !eng) return;

    let cfg = { settings: [], fields: [] };
    try {
        cfg = await eng.loadFormConfig('merchant', false);
    } catch (_e) {
        return;
    }

    const kDocs = p.kyc_docs || {};
    const valuesMap = {
        business_name: p.business_name,
        owner_name: p.owner_name,
        email: p.email,
        merchant_type: p.merchant_type,
        business_category: p.category,
        country_code: p.country_code,
        city: p.city_geoname_id || p.city_name,
        district: p.district,
        phone: p.phone,
        commission_percent: p.commission_pending ? '' : p.deduction_percent,
        onboarded_by_code: p.onboarded_by_member_code ? String(p.onboarded_by_member_code) : (p.onboarded_by_member_id ? '1' : ''),
        business_description: p.description,
        address: p.address,
        geo_location: (p.latitude && p.longitude) ? `${p.latitude},${p.longitude}` : '',
        website_url: p.website_url,
        whatsapp: p.whatsapp,
        logo_url: p.logo_url,
        cover_image_url: p.cover_image_url,
        gallery_images: Array.isArray(p.images) && p.images.length > 0 ? '1' : '',
        working_hours: p.working_hours && typeof p.working_hours === 'object' ? JSON.stringify(p.working_hours) : p.working_hours,
        social_links: p.social && (p.social.facebook || p.social.instagram || p.social.tiktok) ? '1' : '',
        commercial_reg_no: p.commercial_reg_no,
        tax_id: p.tax_id,
        commercial_doc_url: kDocs.commercial_reg,
        tax_doc_url: kDocs.tax_card,
        webhook_url: p.webhook_url,
        initial_cashier_pin: Array.isArray(merchantBundle?.cashiers) && merchantBundle.cashiers.length > 0 ? '1' : ''
    };

    const st = eng.computeCompletionStatus(cfg, 'merchant', valuesMap);
    let banner = document.getElementById('merchantProfileCompletionBanner');
    if (
        (p.onboarding_status === 'approved' && !p.commission_pending && (p.profile_complete === true || st.missingRequired.length === 0))
        || (st.percent >= 100 && !p.commission_pending && st.missingRequired.length === 0)
    ) {
        if (banner) banner.remove();
        return;
    }

    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'merchantProfileCompletionBanner';
        homePage.insertBefore(banner, homePage.querySelector('.stats-grid') || homePage.firstChild);
    }

    const urgentNotice = p.commission_pending
        ? '<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:8px 12px;border-radius:8px;font-weight:800;font-size:0.84rem;margin-bottom:8px;">⚠️ تنبيه هام: لم تقم بتحديد نسبة المساهمة التسويقية أثناء التسجيل السريع — حددها الآن من الإعدادات لتفعيل ظهور متجرك للأعضاء وفتح نقطة البيع.</div>'
        : '';
    const missingBadges = st.missingRequired.slice(0, 5)
        .map(f => `<span style="background:#fff;border:1px solid #f59e0b;color:#92400e;padding:2px 8px;border-radius:999px;font-size:0.76rem;font-weight:700;">• ${escM(f.label_ar)}</span>`)
        .join(' ');

    banner.innerHTML = `
        <div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #f59e0b;border-radius:14px;padding:14px 18px;margin-bottom:16px;">
            ${urgentNotice}
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:240px;">
                    <div style="font-weight:900;color:#92400e;font-size:0.96rem;">📋 اكتمال ملف المتجر الاحترافي: ${st.percent}%</div>
                    <div style="font-size:0.83rem;color:#78350f;margin-top:3px;">${escM(st.bannerText || 'استكمل بيانات متجرك التالية ليظهر مشروعك بشكل متماسك أمام الأعضاء.')}</div>
                    ${missingBadges ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">${missingBadges}</div>` : ''}
                </div>
                <button type="button" onclick="showPage('settings')" class="btn btn-primary" style="background:#d97706;border-color:#b45309;white-space:nowrap;">
                    ⚙️ استكمال بيانات المتجر الآن
                </button>
            </div>
        </div>
    `;
}

const SW_PAYMENT_TYPES = [
    { value: 'cash', label: '💵 نقدي في المحل (Cash)', needsRef: false, deferred: false },
    { value: 'pos_card', label: '💳 بطاقة بنكية POS (RRN)', needsRef: true, deferred: false },
    { value: 'instant_transfer', label: '⚡ تحويل فوري (InstaPay / STC)', needsRef: true, deferred: false },
    { value: 'iban_swift_sepa', label: '🏦 تحويل بنكي IBAN / SWIFT', needsRef: true, deferred: false },
    { value: 'digital_wallet', label: '📱 محفظة إلكترونية', needsRef: true, deferred: false },
    { value: 'payment_gateway', label: '🌐 بوابة دفع إلكتروني', needsRef: true, deferred: false },
    { value: 'bnpl', label: '🗓️ تقسيط (Tabby / Tamara)', needsRef: true, deferred: false },
    { value: 'cheque', label: '🧾 شيك بنكي (مؤجل التحصيل)', needsRef: true, deferred: true },
    { value: 'cod', label: '🚚 دفع عند الاستلام / دليفري (COD)', needsRef: true, deferred: true },
    { value: 'marketplace_escrow', label: '🛡️ ضامن سوق إلكتروني (Escrow)', needsRef: true, deferred: false }
];

function buildMerchantPayTypeOptionsHtml(selected = 'cash') {
    return SW_PAYMENT_TYPES.map(pt =>
        `<option value="${pt.value}" ${pt.value === selected ? 'selected' : ''}>${pt.label}</option>`
    ).join('');
}

function getMerchantPayTypeMeta(pt) {
    return SW_PAYMENT_TYPES.find(x => x.value === pt) || SW_PAYMENT_TYPES[0];
}

function fmtMerchantPayTypeLabel(pt) {
    return getMerchantPayTypeMeta(pt).label;
}

function toggleScanPaymentRef() {
    const pt = document.getElementById('scanPaymentType')?.value || 'cash';
    const meta = getMerchantPayTypeMeta(pt);
    const refGrp = document.getElementById('scanUniqueRefGroup');
    const notice = document.getElementById('scanDeferredNotice');
    if (refGrp) refGrp.style.display = meta.needsRef ? 'block' : 'none';
    if (notice) notice.style.display = meta.deferred ? 'block' : 'none';
}

function initScanReceiptUploader() {
    const host = document.getElementById('scanReceiptUploader');
    if (!host || host.dataset.swMounted || !(window.SAWYAN && window.SAWYAN.ImageUpload)) return;
    host.dataset.swMounted = '1';
    window._scanReceiptUploader = window.SAWYAN.ImageUpload.mountUploader(host, {
        label: '🧾 رفع صورة الفاتورة أو إيصال الدفع (اختياري)',
        maxDim: 1280,
        maxChars: 360000,
        onChange: (v) => {
            const el = document.getElementById('scanReceiptUrl');
            if (el) el.value = v || '';
        }
    });
}

async function handleTransaction(e) {
    e.preventDefault();
    const rawCode = (document.getElementById('memberCodeInput')?.value || '').trim();
    const amount = parseFloat(document.getElementById('amount')?.value || '0');
    const paymentType = document.getElementById('scanPaymentType')?.value || 'cash';
    const uniquePaymentRef = (document.getElementById('scanUniquePaymentRef')?.value || '').trim() || null;
    const receiptMediaUrl = ((window._scanReceiptUploader && window._scanReceiptUploader.getValue()) || document.getElementById('scanReceiptUrl')?.value || '').trim() || null;

    if (!rawCode || !amount || amount <= 0) {
        swNotify('الرجاء إدخال كود العضو أو الباركود ومبلغ أكبر من صفر.', 'warning');
        return;
    }

    const resolved = await ensurePosMemberBeforeSubmit(rawCode, scanPageMemberData, (r) => {
        scanPageMemberData = r;
        renderScanPageMemberPreview('found', rawCode, r);
    });
    if (!resolved) return;

    const res = await submitLiveOrOfflinePosTransaction({
        memberCode: resolved.code,
        memberDisplayName: resolved.name,
        amount,
        paymentType,
        uniquePaymentRef,
        receiptMediaUrl,
        employeeCode: null,
        cashierPin: null
    });

    if (res) {
        scanPageMemberData = null;
        ++scanPageLookupSeq;
        if (scanPageLookupDebounce) clearTimeout(scanPageLookupDebounce);
        document.getElementById('transactionForm')?.reset();
        toggleScanPaymentRef();
        if (window._scanReceiptUploader) window._scanReceiptUploader.clear();
        const rUrlEl = document.getElementById('scanReceiptUrl');
        if (rUrlEl) rUrlEl.value = '';
        const mIn = document.getElementById('memberCodeInput');
        if (mIn) mIn.value = '';
        renderScanPageMemberPreview('idle', '', null);
        const fEl = document.getElementById('transactionForm');
        if (fEl) fEl.style.display = 'none';
    }
}

function handleNavigation(e) {
    e.preventDefault();
    const page = this.dataset.page;
    if (page === 'radar' || page === 'storeKit') return;
    showPage(page);
}

function showPage(page) {
    if (!page || page === 'more') return;
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === page);
    });

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) pageElement.classList.add('active');

    const titles = {
        home: 'لوحة تحكم التاجر',
        kiosk: '🧾 شاشة التوثيق السريعة',
        pending: 'طلبات التوثيق الواردة وطابور الشحن',
        scan: 'إنشاء عملية توثيق',
        qrScanner: 'توثيق بالـ QR أو كود العضو',
        transactions: 'العمليات المكتملة وتقفيل الوردية',
        financial: 'الموقف المالي والفواتير الضريبية المزدوجة',
        settings: 'الإعدادات وموظفو التوثيق'
    };
    const tEl = document.getElementById('pageTitle');
    if (tEl && titles[page]) tEl.textContent = titles[page];

    if (page === 'kiosk') loadKioskModePage();
    if (page === 'pending') loadPendingTransactions();
    if (page === 'transactions') loadAllTransactions();
    if (page === 'financial') loadFinancialReport();
    if (page === 'settings') loadSettings();
    if (page === 'qrScanner') loadQRScannerPage();
}

async function approveTransaction(transactionId) {
    await approvePendingTx(transactionId, 0);
}

async function rejectTransaction(transactionId) {
    await rejectPendingTx(transactionId);
}

// Live loadAllTransactions() & shift closing report defined at Stage 5 POS handler below.
function loadFinancialReport() {
    const page = document.getElementById('financialPage');
    if (!page) return;

    page.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
            <div>
                <h2 style="margin:0; font-size:1.25rem; color:#0f172a; font-weight:900;">📊 كشف الحساب والموقف المالي للتاجر</h2>
                <p style="margin:3px 0 0; color:#64748b; font-size:0.82rem;">متابعة تفصيلية لرصيد الشحن، أين صُرف، سجل عمليات الشحن، والإقفالات الشهرية السابقة</p>
            </div>
            <div style="display:flex; gap:8px;">
                <button onclick="promptTopupBalance()" style="background:#059669; color:white; border:none; padding:10px 18px; border-radius:8px; font-weight:800; font-size:0.88rem; cursor:pointer; font-family:'Tajawal'; box-shadow:0 3px 10px rgba(5,150,105,0.3); display:flex; align-items:center; gap:6px;">
                    <span>➕ شحن الرصيد الآن</span>
                </button>
                <button onclick="exportFinancialStatementPDF()" style="background:#0f172a; color:white; border:none; padding:10px 14px; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; font-family:'Tajawal';">
                    <span>📥 تحميل كشف الحساب (PDF)</span>
                </button>
            </div>
        </div>

        <!-- 1. بطاقة الرصيد المباشر ومؤشر الأمان المالي ضد العزل -->
        <div id="finPrepaidHeroCard" data-spec-id="merchant-financial-prepaid-card" style="background:linear-gradient(135deg, #064e3b, #0f172a); color:white; border-radius:14px; padding:18px 22px; margin-bottom:16px; box-shadow:0 4px 15px rgba(6,78,59,0.25); border:1px solid #10b981;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:12px;">
                <div>
                    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                        <span style="font-size:0.75rem; background:rgba(16,185,129,0.2); border:1px solid #10b981; color:#a7f3d0; padding:2px 8px; border-radius:10px; font-weight:700;">الرصيد المتاح لتغطية المبيعات</span>
                        <span id="liveDebtPill" style="display:none; font-size:0.72rem; background:#dc2626; color:#ffffff; padding:2px 8px; border-radius:10px; font-weight:900;">مديون</span>
                    </div>
                    <div id="livePrepaidBalance" dir="ltr" style="font-size:2.2rem; font-weight:900; margin-top:6px; font-family:monospace; color:#34d399; display:inline-block;">0.00 ج.م</div>
                </div>
                <div style="text-align:left;">
                    <span id="liveStoreRadarBadge" style="background:#ecfdf5; color:#047857; font-weight:800; font-size:0.8rem; padding:4px 12px; border-radius:8px; display:inline-block; border:1px solid #a7f3d0;">
                        🟢 حالة المتجر: جاري التحقق...
                    </span>
                    <div id="liveMinWarnLabel" style="font-size:0.74rem; color:#94a3b8; margin-top:5px;">تنبيه انخفاض الرصيد: وفق إعدادات الحساب</div>
                </div>
            </div>

            <!-- تفصيل مكونات رصيد التاجر -->
            <div id="merchantFinancialBreakdown" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 165px), 1fr)); gap:8px; margin-bottom:12px;">
                <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); border-radius:10px; padding:9px 12px;">
                    <div style="font-size:0.72rem; color:#cbd5e1; font-weight:700;">💵 رصيد الشحن المسبق</div>
                    <div id="finActualCashVal" dir="ltr" style="font-size:1.05rem; font-weight:900; color:#34d399; margin-top:3px; font-family:monospace;">0.00</div>
                </div>
                <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); border-radius:10px; padding:9px 12px;">
                    <div style="font-size:0.72rem; color:#cbd5e1; font-weight:700;">💳 الحد الائتماني المعتمد</div>
                    <div id="finCreditLimitVal" dir="ltr" style="font-size:1.05rem; font-weight:900; color:#93c5fd; margin-top:3px; font-family:monospace;">0.00</div>
                </div>
                <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); border-radius:10px; padding:9px 12px;">
                    <div style="font-size:0.72rem; color:#cbd5e1; font-weight:700;">⏳ محجوز للفواتير المعلقة</div>
                    <div id="finSoftHoldVal" dir="ltr" style="font-size:1.05rem; font-weight:900; color:#fcd34d; margin-top:3px; font-family:monospace;">0.00</div>
                </div>
                <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); border-radius:10px; padding:9px 12px;">
                    <div style="font-size:0.72rem; color:#cbd5e1; font-weight:700;">🛡️ الصافي المتاح للتغطية</div>
                    <div id="finFreeBalVal" dir="ltr" style="font-size:1.05rem; font-weight:900; color:#34d399; margin-top:3px; font-family:monospace;">0.00</div>
                </div>
            </div>

            <!-- شريط الأمان المالي الاستراتيجي -->
            <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:10px 14px; font-size:0.8rem; color:#e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span id="liveSafetyCapStrip">🛡️ <strong>سعة التغطية المتاحة:</strong> جاري حساب سعة التغطية المباشرة من رصيد الشحن المسبق...</span>
                <span id="liveDedRateBadge" style="color:#a7f3d0; font-weight:800; font-family:monospace;">نسبة العمولة التعاقدية: —%</span>
            </div>
        </div>

        <!-- 1a-pending: طلبات الشحن قيد المراجعة لدى الإدارة المالية -->
        <div id="finPendingTopupsHost" style="margin-bottom:16px;"></div>

        <!-- 1b. مؤشر أمان الرصيد والتنبيهات المبكرة -->
        <div id="finD15LadderCard" data-spec-id="merchant-financial-d15-ladder" style="background:white; border:1.5px solid #cbd5e1; border-radius:14px; padding:14px 18px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                <div style="font-weight:900; font-size:0.96rem; color:#0f172a;">🪜 مؤشر أمان الرصيد والتنبيهات المبكرة</div>
                <span id="finD15LadderZoneTag" style="background:#ecfdf5; color:#047857; padding:3px 10px; border-radius:999px; font-size:0.78rem; font-weight:800;">جاري فحص النطاق...</span>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 175px), 1fr)); gap:8px; font-size:0.78rem;">
                <div id="d15TierGREEN" style="border:1.5px solid #10b981; background:#f0fdf4; border-radius:10px; padding:9px 11px;">
                    <b style="color:#047857;">🟢 فوق 30% (منطقة خضراء)</b><div style="color:#334155;margin-top:2px;">ظهور كامل بالدليل + صلاحية بث العروض الترويجية</div>
                </div>
                <div id="d15TierYELLOW" style="border:1.5px solid #f59e0b; background:#fffbeb; border-radius:10px; padding:9px 11px;">
                    <b style="color:#b45309;">🟡 &le; 30% (إنذار أول)</b><div style="color:#334155;margin-top:2px;">تنبيه مبكر لإعادة شحن الرصيد وتوقيف البث الترويجي</div>
                </div>
                <div id="d15TierRED" style="border:1.5px solid #ea580c; background:#fff7ed; border-radius:10px; padding:9px 11px;">
                    <b style="color:#c2410c;">🟠 &le; 20% (إنذار حرج)</b><div style="color:#334155;margin-top:2px;">تحذير عاجل قبل الإخفاء المؤقت</div>
                </div>
                <div id="d15TierISOLATED" style="border:1.5px solid #dc2626; background:#fef2f2; border-radius:10px; padding:9px 11px;">
                    <b style="color:#991b1b;">🔴 &le; 10% (إخفاء مؤقت)</b><div style="color:#334155;margin-top:2px;">إخفاء وقائي من الدليل وتعليق الفواتير لحين إعادة الشحن</div>
                </div>
            </div>
        </div>

        <!-- 2. بطاقات إحصائيات الشهر الحالي السريعة -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap:14px; margin-bottom:16px;">
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px 18px; text-align:center;">
                <div style="font-size:0.78rem; color:#64748b; font-weight:700;">إجمالي مبيعات الدورة الحالية</div>
                <div id="finGrossGmvCard" style="font-size:1.35rem; font-weight:900; color:#0f172a; margin-top:4px;">0.00 ج.م</div>
            </div>
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px 18px; text-align:center;">
                <div id="finCommRateLbl" style="font-size:0.78rem; color:#64748b; font-weight:700;">عمولات سويًا المستقطعة</div>
                <div id="finCommDedCard" style="font-size:1.35rem; font-weight:900; color:#dc2626; margin-top:4px;">0.00 ج.م</div>
            </div>
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px 18px; text-align:center;">
                <div id="finNetRateLbl" style="font-size:0.78rem; color:#64748b; font-weight:700;">صافي مبيعات المتجر بعد العمولة</div>
                <div id="finNetSalesCard" style="font-size:1.35rem; font-weight:900; color:#059669; margin-top:4px;">0.00 ج.م</div>
            </div>
        </div>

        <!-- 3. شريط التبويبات المحاسبية الثلاثة -->
        <div data-spec-id="merchant-financial-ledger-tabs">
        <div style="display:flex; border-bottom:2px solid #e2e8f0; margin-bottom:14px; gap:8px; flex-wrap:wrap;">
            <button id="finTabBtn1" onclick="switchFinancialTab(1)" style="background:transparent; border:none; border-bottom:3px solid #059669; color:#059669; font-weight:900; font-size:0.9rem; padding:8px 16px; cursor:pointer; font-family:'Tajawal';">
                🧾 كشف استهلاك الشحن والمبيعات (أين صُرف؟)
            </button>
            <button id="finTabBtn2" onclick="switchFinancialTab(2)" style="background:transparent; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:700; font-size:0.9rem; padding:8px 16px; cursor:pointer; font-family:'Tajawal';">
                🔋 سجل عمليات شحن الرصيد (كم مرة وبكم؟)
            </button>
            <button id="finTabBtn3" onclick="switchFinancialTab(3)" style="background:transparent; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:700; font-size:0.9rem; padding:8px 16px; cursor:pointer; font-family:'Tajawal';">
                📅 الفواتير الضريبية والتسويات الشهرية
            </button>
        </div>

        <!-- التبويب 1: كشف استهلاك الشحن تفصيلياً مع كل فاتورة مبيعات -->
        <div id="finTabContent1" style="display:block;">
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden;">
                <table style="width:100%; border-collapse:collapse; text-align:right; font-size:0.84rem;">
                    <thead style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1; font-weight:800; color:#334155;">
                        <tr>
                            <th style="padding:10px 12px;">التاريخ والوقت</th>
                            <th style="padding:10px 12px;">رقم العملية</th>
                            <th style="padding:10px 12px;">العضو المشتري</th>
                            <th style="padding:10px 12px;">قيمة الفاتورة</th>
                            <th style="padding:10px 12px;">العمولة التعاقدية</th>
                            <th style="padding:10px 12px;">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="6" style="padding:16px;text-align:center;color:#64748b;">جاري تحميل كشف العمليات من قاعدة البيانات...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- التبويب 2: سجل عمليات شحن الرصيد السابقة -->
        <div id="finTabContent2" style="display:none;">
            <div id="merchantTopupProofStatusBox" style="margin-bottom:14px;"></div>
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden;">
                <table style="width:100%; border-collapse:collapse; text-align:right; font-size:0.84rem;">
                    <thead style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1; font-weight:800; color:#334155;">
                        <tr>
                            <th style="padding:10px 12px;">تاريخ الشحن</th>
                            <th style="padding:10px 12px;">رقم القيد</th>
                            <th style="padding:10px 12px;">المبلغ المشحون</th>
                            <th style="padding:10px 12px;">البيان والمرجع</th>
                            <th style="padding:10px 12px;">ملاحظات</th>
                            <th style="padding:10px 12px;">التوجيه المحاسبي</th>
                            <th style="padding:10px 12px;">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td colspan="7" style="padding:16px;text-align:center;color:#64748b;">جاري تحميل سجل الشحن من دفتر اليومية...</td></tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- التبويب 3: الفواتير الضريبية المزدوجة والتسويات -->
        <div id="finTabContent3" style="display:none;">
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:16px; text-align:center; color:#64748b;">
                جاري تحميل الفواتير الضريبية المزدوجة من قاعدة البيانات...
            </div>
        </div>
        </div>
    `;
}

function switchFinancialTab(tabNum) {
    // Buttons
    for (let i = 1; i <= 3; i++) {
        const btn = document.getElementById('finTabBtn' + i);
        const content = document.getElementById('finTabContent' + i);
        if (btn && content) {
            if (i === tabNum) {
                btn.style.color = '#059669';
                btn.style.borderBottom = '3px solid #059669';
                btn.style.fontWeight = '900';
                content.style.display = 'block';
            } else {
                btn.style.color = '#64748b';
                btn.style.borderBottom = '3px solid transparent';
                btn.style.fontWeight = '700';
                content.style.display = 'none';
            }
        }
    }
}

function promptTopupBalance() {
    // يُستبدل بالدالة الحية أسفل الملف (merchantInitiateTopup) بعد تحميل merchantBundle
    if (typeof loadFinancialReport === 'function') loadFinancialReport();
}

function exportFinancialStatementPDF() {
    window.print();
}

function changeSettlementMonth(val) {
    if (typeof loadFinancialReport === 'function') loadFinancialReport();
}
// Live loadSettings() defined at D25 Settings & Cashier section below.

async function saveSettings() {
    const businessName = document.getElementById('settingsBusinessName')?.value?.trim() || null;
    const ownerName = document.getElementById('settingsOwnerName')?.value?.trim() || null;
    const phone = document.getElementById('settingsPhone')?.value?.trim() || null;
    const address = document.getElementById('settingsAddress')?.value?.trim() || null;
    const latitude = document.getElementById('settingsLatitude')?.value || null;
    const longitude = document.getElementById('settingsLongitude')?.value || null;
    const workingHours = document.getElementById('settingsWorkingHours')?.value?.trim() || null;
    const currentPassword = document.getElementById('settingsCurrentPassword')?.value || null;
    const newPassword = document.getElementById('settingsNewPassword')?.value || null;

    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'update_profile',
            businessName,
            ownerName,
            phone,
            address,
            latitude,
            longitude,
            workingHours,
            currentPassword,
            newPassword
        });
        await refreshMerchantBundle();
        swNotify('تم حفظ إعدادات المتجر في الخادم بنجاح!', 'success');
    } catch (error) {
        swNotify('تعذر حفظ الإعدادات: ' + formatMerchantErrorMessage(error), 'error');
    }
}

function openScanner() {
    showPage('qrScanner');
    setTimeout(toggleQRCameraArea, 150);
}

async function logout() {
    if (window.SAWYAN && window.SAWYAN.API) {
        window.SAWYAN.API.clearMerchantSession();
    }
    window.location.href = '../index.html';
}

// ===== قائمة المزيد (More Menu) =====
function toggleMoreMenu(e) {
    e.preventDefault();
    const menu = document.getElementById('moreMenu');
    menu.classList.toggle('open');

    // إظهار/إخفاء التراكب
    let overlay = document.querySelector('.more-menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'more-menu-overlay';
        overlay.onclick = closeMoreMenu;
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('open');
}

function closeMoreMenu() {
    document.getElementById('moreMenu').classList.remove('open');
    const overlay = document.querySelector('.more-menu-overlay');
    if (overlay) overlay.classList.remove('open');
}

function goToPage(pageName) {
    closeMoreMenu();

    // تحديث الصفحة
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageElement = document.getElementById(pageName + 'Page');
    if (pageElement) pageElement.classList.add('active');

    // تحديث الأيقونات
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) item.classList.add('active');
    });
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // تحديث العنوان
    const titles = {
        'transactions': 'العمليات المكتملة',
        'financial': 'الموقف المالي',
        'settings': 'الإعدادات'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || 'لوحة التحكم';

    // تحميل المحتوى
    if (pageName === 'transactions') loadAllTransactions();
    if (pageName === 'financial') loadFinancialReport();
    if (pageName === 'settings') loadSettings();
}

// ===== توليد QR للواي فاي =====
function generateMerchantWifiQR() {
    const ssid = document.getElementById('settingsWifiSSID')?.value;
    const password = document.getElementById('settingsWifiPassword')?.value;

    if (!ssid) {
        swNotify('الرجاء إدخال اسم الشبكة (SSID)', 'warning');
        return;
    }

    // تهرب الأحرف الخاصة للصيغة القياسية
    const escape = (str) => str.replace(/[\\;,:\"]/g, '\\$&');

    // صيغة QR للواي فاي القياسية
    const wifiString = `WIFI:T:WPA;S:${escape(ssid)};P:${escape(password || '')};;`;

    // عرض الحاوية
    const container = document.getElementById('wifiQRContainer');
    const qrCodeDiv = document.getElementById('wifiQRCode');

    container.style.display = 'block';

    // استخدام مكتبة qrcode@1.5.1 (QRCode.toCanvas) أو qrcodejs
    qrCodeDiv.innerHTML = '';
    if (typeof QRCode !== 'undefined' && typeof QRCode.toCanvas === 'function') {
        const cvs = document.createElement('canvas');
        qrCodeDiv.appendChild(cvs);
        QRCode.toCanvas(cvs, wifiString, { width: 180, margin: 1, color: { dark: '#000000', light: '#ffffff' } }, function (err) {
            if (err) {
                qrCodeDiv.innerHTML = `<div style="padding:14px;background:#f8fafc;border-radius:8px;"><code>${escM(wifiString)}</code></div>`;
            }
        });
    } else if (typeof QRCode === 'function') {
        new QRCode(qrCodeDiv, {
            text: wifiString,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff'
        });
    } else {
        qrCodeDiv.innerHTML = `
            <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
                <p style="font-size: 0.85rem; margin-bottom: 8px;">نص QR للواي فاي:</p>
                <code style="word-break: break-all; font-size: 0.75rem;">${escM(wifiString)}</code>
            </div>
        `;
    }

    // حفظ البيانات في قاعدة البيانات
    saveWifiSettings(ssid, password);
}

// حفظ إعدادات الواي فاي عبر RPC آمن
async function saveWifiSettings(ssid, password) {
    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'update_profile',
            wifiSsid: ssid,
            wifiPassword: password
        });
        await refreshMerchantBundle();
    } catch (error) {
        console.error('خطأ في حفظ إعدادات الواي فاي:', error);
    }
}

// ============================================
// نظام مسح QR ودفع العميل غير المتصل (Scenario D)
// ============================================

let html5QRScanner = null;
let scannedMemberData = null;

/**
 * تحميل صفحة ماسح QR
 */
function loadQRScannerPage() {
    const page = document.getElementById('qrScannerPage');
    if (!page) {
        console.error('QR Scanner page element not found');
        return;
    }
    scannedMemberData = null;
    ++posLookupSeq;
    if (posLookupDebounce) clearTimeout(posLookupDebounce);
    const p = (typeof merchantBundle !== 'undefined' && merchantBundle?.profile) || (typeof merchantData !== 'undefined' && merchantData) || {};
    const storeTitle = escM(p.business_name || 'متجر SAWYAN');
    const storeCode = escM(p.merchant_code || '-');
    const dedPct = Number(p.deduction_percent || 10).toFixed(1);
    const storeCurr = escM(p.currency_code || 'EGP');

    page.innerHTML = `
        <div class="qr-scanner-page" style="max-width: 800px; margin: 0 auto;">
            
            <!-- 1. شريط هوية التاجر والمتجر المعتمد -->
            <div style="background: white; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem;">🏬</div>
                    <div>
                        <div style="font-weight: 900; font-size: 1.1rem; color: #0f172a;">${storeTitle}</div>
                        <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
                            كود التاجر: <strong style="color: #059669; font-family: monospace;">#${storeCode}</strong> • <span style="background: ${(p.effective_access && p.effective_access.can_accept_pos === false) ? '#fee2e2' : (p.is_isolated ? '#fef3c7' : '#ecfdf5')}; color: ${(p.effective_access && p.effective_access.can_accept_pos === false) ? '#991b1b' : (p.is_isolated ? '#92400e' : '#047857')}; padding: 1px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">${(p.effective_access && p.effective_access.can_accept_pos === false) ? '🔒 الكاشير مقفل' : (p.is_isolated ? '🟠 كاشير داخل المحل فقط (معزول عن الرادار)' : '🟢 متجر معتمد ونشط')}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align: left;">
                    <div style="font-size: 0.74rem; color: #64748b; font-weight: 700;">نسبة عمولات سويا:</div>
                    <div style="font-weight: 900; color: #059669; font-size: 1.2rem; font-family: monospace;">${dedPct}% معتمدة</div>
                </div>
            </div>

            <!-- 2. بطاقة تسجيل العملية وإدخال كود العميل -->
            <div style="background: white; border-radius: 16px; padding: 22px; border: 1.5px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.06); margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
                    <div>
                        <h2 style="margin: 0; font-size: 1.2rem; font-weight: 900; color: #0f172a;">📷 تسجيل عملية بالكاشير والتحقق من العميل</h2>
                        <p style="margin: 4px 0 0; font-size: 0.82rem; color: #64748b;">امسح باركود العميل أو أدخل كوده لعرض اسمه فوراً وتوثيق الفاتورة</p>
                    </div>
                    <button onclick="toggleQRCameraArea()" id="toggleCameraBtn" style="background: #f1f5f9; border: 1px solid #cbd5e1; color: #334155; padding: 8px 14px; border-radius: 8px; font-weight: 700; font-size: 0.82rem; cursor: pointer; font-family: 'Tajawal';">
                        📷 فتح الكاميرا
                    </button>
                </div>

                <!-- منطقة كاميرا QR (مخفية افتراضياً ويمكن فتحها بلمسة) -->
                <div id="qrCameraArea" style="display: none; background: #0f172a; border-radius: 12px; padding: 15px; margin-bottom: 20px; text-align: center;">
                    <div id="qr-reader" style="width: 100%; max-width: 320px; margin: 0 auto;"></div>
                    <div id="scannerStatus" style="color: #94a3b8; font-size: 0.85rem; margin-top: 10px;">📷 اضغط لبدء المسح</div>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
                        <button onclick="startQRScanner()" class="btn btn-primary" id="startScanBtn">بدء تشغيل الكاميرا</button>
                        <button onclick="stopQRScanner()" class="btn btn-secondary" id="stopScanBtn" style="display: none;">إيقاف الكاميرا</button>
                    </div>
                </div>

                <!-- نموذج الإدخال السريع للبيانات (يظهر اسم العميل فوراً من أول رقم) -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap: 14px; margin-bottom: 14px;">
                    <!-- حقل 1: كود العميل -->
                    <div>
                        <label style="display: block; font-size: 0.85rem; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
                            🔢 كود العميل / العضو: <span style="color: #ef4444;">*</span>
                        </label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="manualQRInput" value="" placeholder="أدخل كود العضو الرقمي" 
                                oninput="handleManualCodeInput(this.value)" 
                                onkeydown="if(event.key==='Enter') focusBillAmount()"
                                style="width: 100%; padding: 10px 14px; border: 2px solid #cbd5e1; border-radius: 10px; font-weight: 900; font-size: 1.1rem; font-family: monospace; outline: none; transition: border-color 0.2s;"
                                onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='#cbd5e1'">
                            <button onclick="processManualQRInput()" title="تحقق من العضو" style="background: #059669; color: white; border: none; padding: 0 16px; border-radius: 10px; font-weight: 900; font-size: 1.2rem; cursor: pointer;">
                                ✓
                            </button>
                        </div>
                        <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">يبحث لحظياً في قاعدة بيانات الأعضاء النشطين مع حماية خصوصية بيانات التواصل</div>
                    </div>

                    <!-- حقل 2: مكان اسم العميل الثابت والمحدد بوضوح -->
                    <div>
                        <label style="display: block; font-size: 0.85rem; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
                            👤 اسم العميل الرسمي المعتمد:
                        </label>
                        <div id="detectedMemberBox" style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 10px 14px; min-height: 48px; display: flex; align-items: center; justify-content: space-between; transition: all 0.25s ease;">
                            <div id="detectedMemberNameText" style="font-size: 1rem; font-weight: 900; color: #94a3b8;">
                                (اكتب كود العميل وسيظهر اسمه هنا فوراً)
                            </div>
                            <span id="detectedMemberBadge" style="display: none; background: #d1fae5; color: #065f46; font-size: 0.74rem; font-weight: 800; padding: 2px 8px; border-radius: 6px;">
                                🟢 عضو نشط
                            </span>
                        </div>
                        <div id="detectedMemberCodeText" style="font-size: 0.74rem; color: #059669; font-weight: 700; margin-top: 4px; display: none;"></div>
                    </div>
                </div>

                <!-- حقل 3: مبلغ الفاتورة الإجمالي -->
                <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr)); gap: 14px; align-items: center;">
                        <div>
                            <label style="display: block; font-size: 0.88rem; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
                                💰 إجمالي قيمة الفاتورة (${storeCurr}): <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="number" id="offlinePaymentAmount" step="0.01" min="1" placeholder="مثال: 500" 
                                oninput="calculateOfflineCommission()" 
                                onkeydown="if(event.key==='Enter') processOfflineCustomerPayment()"
                                style="width: 100%; padding: 12px 14px; border: 2px solid #cbd5e1; border-radius: 10px; font-weight: 900; font-size: 1.3rem; font-family: monospace; color: #0f172a; outline: none; background: white;"
                                onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='#cbd5e1'">
                        </div>

                        <!-- الحسبة اللحظية للعمولة ونقدية التاجر -->
                        <div id="offlineCommissionPreview" style="background: white; border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 14px; font-size: 0.84rem;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                                <span style="color: #64748b; font-weight: 700;">عمولات سويا (${dedPct}%):</span>
                                <strong id="previewSawyanComm" style="color: #dc2626; font-family: monospace;">-0.00 ${storeCurr}</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 4px;">
                                <span style="color: #065f46; font-weight: 800;">صافي نقدية المتجر:</span>
                                <strong id="previewMerchantNet" style="color: #059669; font-family: monospace; font-size: 0.95rem;">0.00 ${storeCurr}</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- زر الاعتماد الفوري وتوثيق الفاتورة -->
                ${(p.effective_access && p.effective_access.can_accept_pos === false) ? `<div style="background:#fef2f2;border:1.5px solid #ef4444;color:#991b1b;padding:10px 14px;border-radius:10px;font-size:0.84rem;font-weight:800;margin-bottom:10px;">🔒 ${escM(p.pos_lock_reason_ar || p.hide_reason_ar || 'توثيق الفواتير مغلق حالياً لحين الشحن أو استيفاء متطلبات التفعيل.')}</div>` : ''}
                <button onclick="processOfflineCustomerPayment()" id="submitPosPaymentBtn" ${(p.effective_access && p.effective_access.can_accept_pos === false) ? 'disabled' : ''}
                    style="width: 100%; background: ${(p.effective_access && p.effective_access.can_accept_pos === false) ? '#94a3b8' : 'linear-gradient(135deg, #059669, #047857)'}; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 900; font-size: 1.05rem; cursor: ${(p.effective_access && p.effective_access.can_accept_pos === false) ? 'not-allowed' : 'pointer'}; font-family: 'Tajawal'; box-shadow: 0 4px 15px rgba(5,150,105,0.3); display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span>${(p.effective_access && p.effective_access.can_accept_pos === false) ? '🔒 تسجيل الفواتير مقفل حالياً' : '💳 تسجيل العملية وتوثيق الفاتورة فوراً'}</span>
                </button>
            </div>

            <!-- شريط مشاركة الواي فاي للزبائن -->
            <div style="background: linear-gradient(135deg, #1e3a8a, #0f172a); color: white; border-radius: 12px; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.5rem;">📶</span>
                    <div>
                        <div style="font-weight: 800; font-size: 0.9rem;">الزبون معندوش نت؟ شارك واي فاي المتجر بلمسة واحدة</div>
                        <div style="font-size: 0.74rem; color: #bfdbfe;">يقوم العميل بمسح باركود الشبكة للاتصال بالإنترنت فوراً</div>
                    </div>
                </div>
                <button onclick="showWifiSharingModal()" style="background: rgba(255,255,255,0.2); border: 1px solid white; color: white; padding: 6px 14px; border-radius: 8px; font-weight: 700; font-size: 0.8rem; cursor: pointer; font-family: 'Tajawal';">
                    📶 عرض باركود Wi-Fi
                </button>
            </div>
        </div>

        <!-- Modal مشاركة الواي فاي -->
        <div id="wifiSharingModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 400px; padding: 20px; border-radius: 16px; direction: rtl; text-align: center;">
                <button onclick="closeWifiSharingModal()" class="close-btn" style="position: absolute; left: 15px; top: 15px; border: none; background: transparent; font-size: 1.5rem; cursor: pointer;">&times;</button>
                <h3 style="margin: 0 0 10px; color: #0f172a;">📶 واي فاي ضيوف المتجر</h3>
                <div id="wifiQRDisplay" style="margin: 15px auto; width: 180px; height: 180px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 2.5rem;">
                    📶
                </div>
                <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 12px;">اجعل العميل يمسح الكود بكاميرا هاتفه للاتصال بالواي فاي وتوثيق عمليته</p>
                <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; font-size: 0.85rem; text-align: right;">
                    <div><strong>الشبكة:</strong> <span id="displayWifiSSID">—</span></div>
                    <div style="margin-top: 4px;"><strong>كلمة المرور:</strong> <span id="displayWifiPassword">—</span></div>
                </div>
            </div>
        </div>
    `;
}

function toggleQRCameraArea() {
    const cam = document.getElementById('qrCameraArea');
    const btn = document.getElementById('toggleCameraBtn');
    if (cam) {
        if (cam.style.display === 'none') {
            cam.style.display = 'block';
            if (btn) btn.innerText = '❌ إغلاق الكاميرا';
            startQRScanner();
        } else {
            cam.style.display = 'none';
            if (btn) btn.innerText = '📷 فتح الكاميرا';
            stopQRScanner();
        }
    }
}

function focusBillAmount() {
    const amtInput = document.getElementById('offlinePaymentAmount');
    if (amtInput) amtInput.focus();
}

async function startQRScanner() {
    const scannerDiv = document.getElementById('qr-reader');
    const statusDiv = document.getElementById('scannerStatus');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');

    // التحقق من وجود مكتبة html5-qrcode
    if (typeof Html5Qrcode === 'undefined') {
        // تحميل المكتبة ديناميكياً
        statusDiv.innerHTML = '<p style="color: #f59e0b;">⏳ جاري تحميل ماسح QR...</p>';

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = () => {
            console.log('✅ html5-qrcode loaded');
            initializeScanner();
        };
        script.onerror = () => {
            statusDiv.innerHTML = '<p style="color: #ef4444;">❌ فشل تحميل ماسح QR. استخدم الإدخال اليدوي.</p>';
        };
        document.head.appendChild(script);
        return;
    }

    initializeScanner();

    function initializeScanner() {
        html5QRScanner = new Html5Qrcode("qr-reader");

        html5QRScanner.start(
            { facingMode: "environment" }, // الكاميرا الخلفية
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            onScanError
        ).then(() => {
            statusDiv.innerHTML = '<p style="color: #10B981;">📷 جاري المسح... وجّه الكاميرا نحو QR</p>';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
        }).catch(err => {
            console.error('Camera error:', err);
            statusDiv.innerHTML = '<p style="color: #ef4444;">❌ تعذر الوصول للكاميرا. استخدم الإدخال اليدوي.</p>';
        });
    }
}

/**
 * إيقاف ماسح QR
 */
function stopQRScanner() {
    if (html5QRScanner) {
        html5QRScanner.stop().then(() => {
            html5QRScanner.clear();
            html5QRScanner = null;

            document.getElementById('scannerStatus').innerHTML = '<p style="color: var(--text-secondary, #666);">📷 اضغط لبدء المسح</p>';
            document.getElementById('startScanBtn').style.display = 'inline-block';
            document.getElementById('stopScanBtn').style.display = 'none';
        });
    }
}

/**
 * معالجة نجاح المسح
 */
function onScanSuccess(decodedText, decodedResult) {
    console.log('QR Scanned:', decodedText);
    stopQRScanner();
    processQRData(decodedText);
}

/**
 * معالجة خطأ المسح (يُستدعى مع كل frame فاشل)
 */
function onScanError(errorMessage) {
    // لا نعرض شيء - طبيعي أثناء المسح
}

/**
 * معالجة الإدخال اليدوي (تعتمد كلياً على البحث السيرفري الآمن lookup_member_for_pos دون مصفوفات وهمية)
 */
function processManualQRInput() {
    const input = document.getElementById('manualQRInput');
    const qrData = input ? input.value.trim() : '';
    if (!qrData) {
        swNotify('الرجاء إدخال كود العضو أولاً', 'warning');
        return;
    }
    handleManualCodeInput(qrData);
    focusBillAmount();
}

async function processQRData(qrData) {
    const input = document.getElementById('manualQRInput');
    if (input) input.value = qrData;
    handleManualCodeInput(qrData);
    focusBillAmount();
}

function calculateOfflineCommission() {
    const amountInput = document.getElementById('offlinePaymentAmount');
    const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
    const pct = Number(merchantBundle?.profile?.deduction_percent || merchantData?.deduction_percent || 10);
    const curr = merchantBundle?.profile?.currency_code || merchantData?.currency_code || 'EGP';
    const pt = document.getElementById('qrPaymentType')?.value || 'cash';
    const deferred = getMerchantPayTypeMeta(pt).deferred;

    const sawyanCommEl = document.getElementById('previewSawyanComm');
    const merchantNetEl = document.getElementById('previewMerchantNet');
    const defNoteEl = document.getElementById('qrDeferredNotice');
    if (defNoteEl) defNoteEl.style.display = deferred ? 'block' : 'none';
    const refGrpEl = document.getElementById('qrUniqueRefGroup');
    if (refGrpEl) refGrpEl.style.display = getMerchantPayTypeMeta(pt).needsRef ? 'block' : 'none';

    if (amount > 0) {
        const comm = amount * (pct / 100);
        const net = amount - comm;
        if (sawyanCommEl) sawyanCommEl.innerText = deferred ? `-${comm.toFixed(2)} ${curr} (مؤجل التحصيل)` : `-${comm.toFixed(2)} ${curr}`;
        if (merchantNetEl) merchantNetEl.innerText = `${net.toFixed(2)} ${curr}`;
    } else {
        if (sawyanCommEl) sawyanCommEl.innerText = `-0.00 ${curr}`;
        if (merchantNetEl) merchantNetEl.innerText = `0.00 ${curr}`;
    }
}

function resetScanner() {
    scannedMemberData = null;
    ++posLookupSeq;
    if (posLookupDebounce) clearTimeout(posLookupDebounce);
    const resultEl = document.getElementById('scanResult');
    if (resultEl) resultEl.style.display = 'none';
    const amountEl = document.getElementById('offlinePaymentAmount');
    if (amountEl) amountEl.value = '';
    const refEl = document.getElementById('qrUniquePaymentRef');
    if (refEl) refEl.value = '';
    const ptEl = document.getElementById('qrPaymentType');
    if (ptEl) ptEl.value = 'cash';
    if (window._qrReceiptUploader) window._qrReceiptUploader.clear();
    const rUrlEl = document.getElementById('qrReceiptUrl');
    if (rUrlEl) rUrlEl.value = '';
    calculateOfflineCommission();
    const manualInput = document.getElementById('manualQRInput');
    if (manualInput) manualInput.value = '';
    handleManualCodeInput('');
}

function showWifiSharingModal() {
    const p = merchantBundle?.profile || merchantData || {};
    const ssid = p.wifi_ssid || merchantData?.wifi_ssid;
    const password = p.wifi_password || merchantData?.wifi_password || '';

    if (!ssid) {
        swNotify('لم تقم بإعداد الواي فاي بعد — اذهب إلى تبويب الإعدادات لإدخال اسم شبكة Wi-Fi المتجر.', 'warning');
        return;
    }

    const ssidEl = document.getElementById('displayWifiSSID');
    const passEl = document.getElementById('displayWifiPassword');
    if (ssidEl) ssidEl.textContent = ssid;
    if (passEl) passEl.textContent = password;

    const wifiString = `WIFI:T:WPA;S:${ssid};P:${password};;`;
    const qrDisplay = document.getElementById('wifiQRDisplay');

    if (qrDisplay) {
        renderSawyanQrBox(qrDisplay, wifiString, 180, '#000000');
    }

    const modal = document.getElementById('wifiSharingModal');
    if (modal) modal.style.display = 'flex';
}

/**
 * إغلاق modal مشاركة الواي فاي
 */
function closeWifiSharingModal() {
    document.getElementById('wifiSharingModal').style.display = 'none';
}

// تفعيل عند جاهزية نظام الدفع
window.addEventListener('sawyan:payment:ready', () => {
    console.log('🎉 Payment system ready in merchant dashboard');
});



// ============================================================================
// SAWYAN V3.0 LIVE ENGINE LAYER:
//   1. IndexedDB + WebCrypto AES-GCM Offline POS Queue (S05 / S08 Pillar 8)
//   2. 3-Button POS Kiosk Mode + Cashier 4-Digit PIN (D25 5-Attempt Lockout)
//   3. 1-Click Printable Store Kit Poster (Ch. 7.4 #1)
//   4. Live PostgreSQL Hydration for Pending, Completed, Shift CSV, Financials & Settings
// ============================================================================

function escM(val) {
    return String(val ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSawyanQrBox(container, text, size = 180, darkColor = '#064e3b') {
    if (!container) return;
    container.innerHTML = '';
    if (typeof QRCode !== 'undefined' && typeof QRCode.toCanvas === 'function') {
        const canvas = document.createElement('canvas');
        container.appendChild(canvas);
        QRCode.toCanvas(canvas, String(text), {
            width: size,
            margin: 1,
            color: { dark: darkColor, light: '#ffffff' }
        }, (err) => {
            if (err) console.warn('QRCode.toCanvas warning:', err);
        });
    } else if (typeof QRCode === 'function') {
        new QRCode(container, {
            text: String(text),
            width: size,
            height: size,
            colorDark: darkColor,
            colorLight: '#ffffff'
        });
    } else {
        container.innerHTML = `<code style="display:block;padding:12px;font-size:0.8rem;">${escM(text)}</code>`;
    }
}

const SawyanOfflinePosVault = (function () {
    const DB_NAME = 'sawyan_pos_vault_v3';
    const STORE_DRAFTS = 'encrypted_pos_drafts';
    const STORE_KEYS = 'vault_crypto_keys';

    function openDb() {
        return new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') {
                return reject(new Error('INDEXEDDB_UNAVAILABLE'));
            }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (ev) => {
                const db = ev.target.result;
                if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
                    db.createObjectStore(STORE_DRAFTS, { keyPath: 'idempotency_key' });
                }
                if (!db.objectStoreNames.contains(STORE_KEYS)) {
                    db.createObjectStore(STORE_KEYS, { keyPath: 'kid' });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async function getOrCreateAesKey() {
        const db = await openDb();
        const existing = await new Promise((resolve) => {
            const tx = db.transaction(STORE_KEYS, 'readonly');
            const getReq = tx.objectStore(STORE_KEYS).get('pos_aes_256_gcm');
            getReq.onsuccess = () => resolve(getReq.result ? getReq.result.cryptoKey : null);
            getReq.onerror = () => resolve(null);
        });
        if (existing) return existing;

        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_KEYS, 'readwrite');
            tx.objectStore(STORE_KEYS).put({ kid: 'pos_aes_256_gcm', cryptoKey: key });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
        return key;
    }

    async function enqueueEncryptedDraft(draftPayload) {
        const idemKey = draftPayload.idempotencyKey || window.SAWYAN.API.newIdempotencyKey();
        const shortCode = draftPayload.swShortCode || ('SW-' + idemKey.replace(/-/g, '').slice(0, 6).toUpperCase());
        const key = await getOrCreateAesKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify({
            ...draftPayload,
            idempotencyKey: idemKey,
            swShortCode: shortCode,
            queuedAtIso: new Date().toISOString()
        }));
        const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

        const db = await openDb();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_DRAFTS, 'readwrite');
            tx.objectStore(STORE_DRAFTS).put({
                idempotency_key: idemKey,
                merchant_id: draftPayload.merchantId,
                sw_short_code: shortCode,
                iv: Array.from(iv),
                ciphertext: Array.from(new Uint8Array(cipherBuf)),
                created_at: Date.now()
            });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
        await refreshHeaderBadge();
        return { idempotency_key: idemKey, sw_short_code: shortCode };
    }

    async function listEncryptedRecords(merchantId) {
        try {
            const db = await openDb();
            const all = await new Promise((resolve) => {
                const tx = db.transaction(STORE_DRAFTS, 'readonly');
                const req = tx.objectStore(STORE_DRAFTS).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
            return merchantId ? all.filter(r => r.merchant_id === merchantId) : all;
        } catch (e) {
            return [];
        }
    }

    async function decryptRecord(rec) {
        const key = await getOrCreateAesKey();
        const plainBuf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(rec.iv) },
            key,
            new Uint8Array(rec.ciphertext)
        );
        return JSON.parse(new TextDecoder().decode(plainBuf));
    }

    async function removeRecord(idemKey) {
        const db = await openDb();
        await new Promise((resolve) => {
            const tx = db.transaction(STORE_DRAFTS, 'readwrite');
            tx.objectStore(STORE_DRAFTS).delete(idemKey);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
        await refreshHeaderBadge();
    }

    async function syncAllQueued(merchantId) {
        const records = await listEncryptedRecords(merchantId);
        let synced = 0;
        let failed = 0;
        for (const rec of records) {
            try {
                const payload = await decryptRecord(rec);
                const res = await window.SAWYAN.API.authenticateAndSubmitPosTx({
                    merchantId: payload.merchantId,
                    memberCode: payload.memberCode,
                    amount: payload.amount,
                    paymentType: payload.paymentType || 'cash',
                    idempotencyKey: payload.idempotencyKey,
                    branchId: payload.branchId || null,
                    employeeCode: payload.employeeCode || null,
                    cashierPin: payload.cashierPin || null,
                    swShortCode: payload.swShortCode,
                    uniquePaymentRef: payload.uniquePaymentRef || null,
                    receiptMediaUrl: payload.receiptMediaUrl || null
                });
                if (res && (res.success || res.pos_result)) {
                    await removeRecord(rec.idempotency_key);
                    synced++;
                } else {
                    failed++;
                }
            } catch (err) {
                console.warn('Offline queue sync retry deferred:', err.message);
                failed++;
            }
        }
        if (synced > 0) await refreshMerchantBundle();
        return { synced, failed };
    }

    async function refreshHeaderBadge() {
        const badge = document.getElementById('posVaultStatusBadge');
        if (!badge) return;
        const mId = currentMerchant?.id || null;
        const list = await listEncryptedRecords(mId);
        const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
        badge.textContent = list.length > 0
            ? `${online ? '🟡 متصل' : '🟠 أوفلاين'} • ${list.length} عملية بانتظار المزامنة`
            : (online ? '🟢 متصل بالنظام' : '🟠 وضع الأوفلاين الآمن');
        badge.style.background = online ? (list.length > 0 ? '#fffbeb' : '#ecfdf5') : '#fef2f2';
        badge.style.color = online ? (list.length > 0 ? '#92400e' : '#047857') : '#991b1b';
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            refreshHeaderBadge();
            if (currentMerchant?.id) syncAllQueued(currentMerchant.id);
        });
        window.addEventListener('offline', refreshHeaderBadge);
    }

    return {
        enqueueEncryptedDraft,
        listEncryptedRecords,
        decryptRecord,
        syncAllQueued,
        refreshHeaderBadge
    };
})();
window.SawyanOfflinePosVault = SawyanOfflinePosVault;

let forceDeadZoneSimulation = false;

async function submitLiveOrOfflinePosTransaction({
    memberCode,
    memberDisplayName = null,
    amount,
    paymentType = 'cash',
    branchId = null,
    employeeCode = null,
    cashierPin = null,
    uniquePaymentRef = null,
    receiptMediaUrl = null
}) {
    const cleanCode = Number(memberCode);
    if (!cleanCode || cleanCode <= 0 || !Number.isFinite(cleanCode)) {
        swNotify('كود العضو غير صالح.', 'error');
        return null;
    }
    const curr = merchantBundle?.profile?.currency_code || merchantData?.currency_code || 'EGP';
    const whoLabel = memberDisplayName ? `${memberDisplayName} (#${cleanCode})` : `عضو #${cleanCode}`;
    const confirmMsg =
        `👤 العميل (العضو): ${whoLabel}\n` +
        `💰 قيمة الفاتورة: ${Number(amount).toFixed(2)} ${curr}\n` +
        `💳 وسيلة الدفع: ${fmtMerchantPayTypeLabel(paymentType)}\n\n` +
        `هل تؤكد صحة هوية العضو والمبلغ لإتمام تسجيل الفاتورة؟`;
    const confirmed = await swConfirmBox('تأكيد بيانات الفاتورة قبل التسجيل', confirmMsg, false);
    if (!confirmed) {
        return null;
    }

    const idemKey = window.SAWYAN.API.newIdempotencyKey();
    const shortCode = 'SW-' + idemKey.replace(/-/g, '').slice(0, 6).toUpperCase();
    const isOffline = forceDeadZoneSimulation || (typeof navigator !== 'undefined' && !navigator.onLine);

    if (isOffline) {
        const queued = await SawyanOfflinePosVault.enqueueEncryptedDraft({
            merchantId: currentMerchant.id,
            memberCode: cleanCode,
            amount: Number(amount),
            paymentType,
            branchId,
            employeeCode,
            cashierPin,
            uniquePaymentRef,
            receiptMediaUrl,
            idempotencyKey: idemKey,
            swShortCode: shortCode
        });
        await swAlertBox('حفظ مؤقت دون إنترنت', `تم حفظ الفاتورة بأمان في الجهاز برقم ${queued.sw_short_code} وستُرسل تلقائياً فور عودة الاتصال بالإنترنت.`, 'info');
        return queued;
    }

    try {
        const res = await window.SAWYAN.API.authenticateAndSubmitPosTx({
            merchantId: currentMerchant.id,
            memberCode: cleanCode,
            amount: Number(amount),
            paymentType,
            idempotencyKey: idemKey,
            branchId,
            employeeCode,
            cashierPin,
            swShortCode: shortCode,
            uniquePaymentRef,
            receiptMediaUrl
        });

        if (res && res.success === false) {
            if (res.error_code === 'CASHIER_PIN_LOCKED_15M') {
                swNotify('تم قفل رمز PIN لهذا الموظف لمدة 15 دقيقة بعد 5 محاولات خاطئة.', 'error');
                return null;
            }
            if (res.error_code === 'INVALID_CASHIER_PIN') {
                swNotify(`رمز PIN الكاشير غير صحيح — المحاولات المتبقية قبل القفل: ${res.remaining_attempts}`, 'error');
                return null;
            }
            if (res.error_code === 'CASHIER_TX_LIMIT_EXCEEDED') {
                swNotify('قيمة الفاتورة تتجاوز الحد الأقصى المسموح به لهذا الكاشير.', 'warning');
                return null;
            }
            if (res.pos_result?.status === 'rejected_self_cashier_pin') {
                swNotify('لا يجوز لموظف الكاشير توثيق فاتورة لحسابه الشخصي كعضو.', 'error');
                return null;
            }
            swNotify('تعذر إتمام العملية: ' + (window.SAWYAN?.UI?.humanizeError(res.error_code) || res.error_code || 'خطأ غير متوقع'), 'error');
            return null;
        }

        const st = res?.pos_result?.status || (res?.deferred_pending ? 'pending' : 'completed');
        if (st === 'awaiting_merchant_topup') {
            const fifoSeq = res.fifo_seq || res?.pos_result?.fifo_seq || 1;
            const reqComm = Number(res.required_commission_local || (Number(amount) * (Number(merchantBundle?.profile?.deduction_percent || 10) / 100))).toFixed(2);
            await swAlertBox(
                'تم حفظ الفاتورة بانتظار شحن الرصيد',
                `رقم الفاتورة: ${res.sw_short_code} (ترتيب #${fifoSeq})\nالعضو: ${res.member_name} (#${res.member_code})\nالقيمة: ${Number(amount).toFixed(2)} ${curr}\nالعمولة المطلوبة لاعتمادها: ${reqComm} ${curr}\n\nرصيد الشحن المتاح لا يكفي حالياً لخصم العمولة؛ بمجرد شحن رصيد المتجر ستُعتمد الفاتورة تلقائياً.`,
                'warning'
            );
        } else {
            const statusMsg = st === 'pending'
                ? 'دفع مؤجل — بانتظار تأكيد التوصيل والتحصيل من قائمة المعلقات.'
                : 'مكتملة ومُعتمدة بنجاح.';
            const commDisplay = st === 'pending'
                ? `${Number(res.commission_reserved_local || 0).toFixed(2)} ${curr} (مؤجلة لحين التحصيل)`
                : `${Number(res.commission_deducted_local || 0).toFixed(2)} ${curr}`;
            await swAlertBox(
                'تم تسجيل الفاتورة بنجاح',
                `🧾 الكود المختصر: ${res.sw_short_code}\n👤 العضو: ${res.member_name} (#${res.member_code})\n💳 وسيلة الدفع: ${fmtMerchantPayTypeLabel(paymentType)}\n💰 قيمة الفاتورة: ${Number(amount).toFixed(2)} ${curr}\n🏷️ العمولة: ${commDisplay}\n💵 صافي نقدية الدرج: ${Number(res.merchant_net_local).toFixed(2)} ${curr}\n📌 الحالة: ${statusMsg}`,
                'success'
            );
        }
        await refreshMerchantBundle();
        return res;
    } catch (err) {
        if (String(err.message || '').toLowerCase().includes('fetch')) {
            const queued = await SawyanOfflinePosVault.enqueueEncryptedDraft({
                merchantId: currentMerchant.id,
                memberCode: cleanCode,
                amount: Number(amount),
                paymentType,
                branchId,
                employeeCode,
                cashierPin,
                uniquePaymentRef,
                receiptMediaUrl,
                idempotencyKey: idemKey,
                swShortCode: shortCode
            });
            swNotify(`انقطع الاتصال — تم حفظ الفاتورة مشفرة على الجهاز (${queued.sw_short_code}) وستُرسل عند عودة الشبكة.`, 'warning');
            return queued;
        }
        swNotify(formatMerchantErrorMessage(err), 'error');
        return null;
    }
}

function renderDetectedMemberUi(state, clean, payload) {
    const box = document.getElementById('detectedMemberBox');
    const nameText = document.getElementById('detectedMemberNameText');
    const badge = document.getElementById('detectedMemberBadge');
    const codeText = document.getElementById('detectedMemberCodeText');

    if (state === 'idle') {
        if (box) { box.style.background = '#f8fafc'; box.style.borderColor = '#cbd5e1'; box.style.borderStyle = 'dashed'; }
        if (nameText) { nameText.textContent = '(اكتب كود العميل وسيظهر اسمه هنا فوراً)'; nameText.style.color = '#94a3b8'; }
        if (badge) badge.style.display = 'none';
        if (codeText) codeText.style.display = 'none';
    } else if (state === 'loading') {
        if (box) { box.style.background = '#f8fafc'; box.style.borderColor = '#94a3b8'; box.style.borderStyle = 'dashed'; }
        if (nameText) { nameText.textContent = '⏳ جاري التحقق من قاعدة البيانات...'; nameText.style.color = '#64748b'; }
        if (badge) badge.style.display = 'none';
        if (codeText) codeText.style.display = 'none';
    } else if (state === 'found' && payload) {
        if (box) { box.style.background = '#ecfdf5'; box.style.borderColor = '#10b981'; box.style.borderStyle = 'solid'; }
        if (nameText) { nameText.textContent = `👤 ${payload.name}`; nameText.style.color = '#047857'; }
        if (badge) { badge.style.display = 'inline-block'; badge.textContent = '🟢 عضو نشط'; }
        if (codeText) { codeText.style.display = 'block'; codeText.textContent = `كود العضوية الرسمي: #${payload.code} (الهاتف محجوب D26)`; }
    } else if (state === 'offline' && payload) {
        if (box) { box.style.background = '#fffbeb'; box.style.borderColor = '#f59e0b'; box.style.borderStyle = 'solid'; }
        if (nameText) { nameText.textContent = `🟠 ${payload.name}`; nameText.style.color = '#b45309'; }
        if (badge) { badge.style.display = 'inline-block'; badge.textContent = '📴 أوفلاين'; }
        if (codeText) { codeText.style.display = 'block'; codeText.textContent = `كود العضوية المستخرج: #${payload.code}`; }
    } else if (state === 'error') {
        if (box) { box.style.background = '#fef2f2'; box.style.borderColor = '#ef4444'; box.style.borderStyle = 'solid'; }
        if (nameText) { nameText.textContent = `⚠️ تعذر التحقق اللحظي: ${String(payload || '')}`; nameText.style.color = '#dc2626'; }
        if (badge) badge.style.display = 'none';
        if (codeText) codeText.style.display = 'none';
    } else {
        if (box) { box.style.background = '#fef2f2'; box.style.borderColor = '#ef4444'; box.style.borderStyle = 'solid'; }
        if (nameText) { nameText.textContent = `❌ لا يوجد عضو نشط مطابق (${clean})`; nameText.style.color = '#dc2626'; }
        if (badge) badge.style.display = 'none';
        if (codeText) codeText.style.display = 'none';
    }
}

function renderScanPageMemberPreview(state, clean, payload) {
    const preview = document.getElementById('scanPageMemberPreview');
    if (!preview) return;
    if (state === 'idle') {
        preview.style.display = 'none';
        preview.innerHTML = '';
        return;
    }
    preview.style.display = 'block';
    if (state === 'loading') {
        preview.style.background = '#f8fafc';
        preview.style.borderColor = '#94a3b8';
        preview.innerHTML = `<span style="color:#64748b;font-weight:700;">⏳ جاري التحقق من هوية العضو...</span>`;
    } else if (state === 'found' && payload) {
        preview.style.background = '#ecfdf5';
        preview.style.borderColor = '#10b981';
        preview.innerHTML = `<strong style="color:#047857;">✅ العضو: ${escM(payload.name)} (#${payload.code})</strong>`;
    } else if (state === 'offline' && payload) {
        preview.style.background = '#fffbeb';
        preview.style.borderColor = '#f59e0b';
        preview.innerHTML = `<strong style="color:#b45309;">🟠 ${escM(payload.name)}</strong>`;
    } else if (state === 'error') {
        preview.style.background = '#fef2f2';
        preview.style.borderColor = '#ef4444';
        preview.innerHTML = `<span style="color:#dc2626;font-weight:700;">⚠️ تعذر التحقق: ${escM(String(payload || ''))}</span>`;
    } else {
        preview.style.background = '#fef2f2';
        preview.style.borderColor = '#ef4444';
        preview.innerHTML = `<span style="color:#dc2626;font-weight:800;">❌ لا يوجد عضو نشط مطابق (${escM(clean)})</span>`;
    }
}

function renderKioskMemberPreview(state, clean, payload) {
    const preview = document.getElementById('kioskMemberPreview');
    if (!preview) return;
    if (state === 'idle') {
        preview.style.background = '#f8fafc';
        preview.style.borderColor = '#cbd5e1';
        preview.style.color = '#64748b';
        preview.innerHTML = '👤 اكتب كود العضو أو امسح الباركود ليظهر اسمه هنا للتحقق قبل الاعتماد';
    } else if (state === 'loading') {
        preview.style.background = '#f8fafc';
        preview.style.borderColor = '#94a3b8';
        preview.style.color = '#64748b';
        preview.innerHTML = '⏳ جاري التحقق من هوية العضو في قاعدة البيانات...';
    } else if (state === 'found' && payload) {
        preview.style.background = '#ecfdf5';
        preview.style.borderColor = '#10b981';
        preview.style.color = '#047857';
        preview.innerHTML = `✅ العضو المعتمد: <strong>${escM(payload.name)}</strong> (<span dir="ltr">#${payload.code}</span>)`;
    } else if (state === 'offline' && payload) {
        preview.style.background = '#fffbeb';
        preview.style.borderColor = '#f59e0b';
        preview.style.color = '#b45309';
        preview.innerHTML = `🟠 ${escM(payload.name)}`;
    } else if (state === 'error') {
        preview.style.background = '#fef2f2';
        preview.style.borderColor = '#ef4444';
        preview.style.color = '#dc2626';
        preview.innerHTML = `⚠️ تعذر التحقق: ${escM(String(payload || ''))}`;
    } else {
        preview.style.background = '#fef2f2';
        preview.style.borderColor = '#ef4444';
        preview.style.color = '#dc2626';
        preview.innerHTML = `❌ لا يوجد عضو نشط مطابق (${escM(clean)})`;
    }
}

// الكشف الحي الآمن عن العضو في شاشة الكاشير عبر lookup_member_for_pos (بدون هواتف D26)
function handleManualCodeInput(val) {
    const clean = (val || '').trim();
    if (posLookupDebounce) clearTimeout(posLookupDebounce);
    scannedMemberData = null; // تصفير فوري لمنع بقاء كود عميل سابق أثناء الكتابة (Race Condition Guard)
    const reqSeq = ++posLookupSeq;

    if (!clean) {
        renderDetectedMemberUi('idle', '', null);
        return;
    }

    renderDetectedMemberUi('loading', clean, null);
    posLookupDebounce = setTimeout(() => {
        runPosLookupRequest({
            clean,
            isStale: () => reqSeq !== posLookupSeq,
            onState: (state, payload) => {
                if (state === 'found' || state === 'offline') {
                    scannedMemberData = payload;
                } else {
                    scannedMemberData = null;
                }
                renderDetectedMemberUi(state, clean, payload);
            }
        });
    }, 260);
}

function handleScanPageMemberCode(val) {
    const form = document.getElementById('transactionForm');
    const clean = (val || '').trim();
    if (scanPageLookupDebounce) clearTimeout(scanPageLookupDebounce);
    scanPageMemberData = null;
    const reqSeq = ++scanPageLookupSeq;

    if (!clean) {
        renderScanPageMemberPreview('idle', '', null);
        if (form) form.style.display = 'none';
        return;
    }
    if (form) form.style.display = 'block';
    renderScanPageMemberPreview('loading', clean, null);
    scanPageLookupDebounce = setTimeout(() => {
        runPosLookupRequest({
            clean,
            isStale: () => reqSeq !== scanPageLookupSeq,
            onState: (state, payload) => {
                if (state === 'found' || state === 'offline') {
                    scanPageMemberData = payload;
                } else {
                    scanPageMemberData = null;
                }
                renderScanPageMemberPreview(state, clean, payload);
            }
        });
    }, 240);
}

function handleKioskMemberCodeInput(val) {
    const clean = (val || '').trim();
    if (kioskLookupDebounce) clearTimeout(kioskLookupDebounce);
    kioskMemberData = null;
    const reqSeq = ++kioskLookupSeq;

    if (!clean) {
        renderKioskMemberPreview('idle', '', null);
        return;
    }

    renderKioskMemberPreview('loading', clean, null);
    kioskLookupDebounce = setTimeout(() => {
        runPosLookupRequest({
            clean,
            isStale: () => reqSeq !== kioskLookupSeq,
            onState: (state, payload) => {
                if (state === 'found' || state === 'offline') {
                    kioskMemberData = payload;
                } else {
                    kioskMemberData = null;
                }
                renderKioskMemberPreview(state, clean, payload);
            }
        });
    }, 240);
}
window.handleKioskMemberCodeInput = handleKioskMemberCodeInput;

async function processOfflineCustomerPayment() {
    const rawInput = (document.getElementById('manualQRInput')?.value || '').trim();
    if (!rawInput) {
        swNotify('يرجى إدخال أو مسح كود عضو صالح أولاً.', 'warning');
        return;
    }
    const amount = parseFloat(document.getElementById('offlinePaymentAmount')?.value || '0');
    if (!amount || amount <= 0) {
        swNotify('الرجاء إدخال قيمة الفاتورة.', 'warning');
        return;
    }
    const resolved = await ensurePosMemberBeforeSubmit(rawInput, scannedMemberData, (r) => {
        scannedMemberData = r;
        renderDetectedMemberUi('found', rawInput, r);
    });
    if (!resolved) return;

    const empCode = document.getElementById('posCashierEmpCode')?.value?.trim() || null;
    const empPin = document.getElementById('posCashierPinInput')?.value?.trim() || null;
    const paymentType = document.getElementById('qrPaymentType')?.value || 'cash';
    const uniquePaymentRef = (document.getElementById('qrUniquePaymentRef')?.value || '').trim() || null;
    const receiptMediaUrl = ((window._qrReceiptUploader && window._qrReceiptUploader.getValue()) || document.getElementById('qrReceiptUrl')?.value || '').trim() || null;

    const ok = await submitLiveOrOfflinePosTransaction({
        memberCode: resolved.code,
        memberDisplayName: resolved.name,
        amount,
        paymentType,
        uniquePaymentRef,
        receiptMediaUrl,
        employeeCode: empCode || null,
        cashierPin: empPin || null
    });
    if (ok) resetScanner();
}

// حقن خانة موظف الكاشير والـ PIN المستقل (D25) داخل شاشة qrScannerPage عند فتحها
const _origLoadQRScannerPage = loadQRScannerPage;
loadQRScannerPage = function () {
    _origLoadQRScannerPage();
    const p = merchantBundle?.profile || merchantData || {};
    const curr = p.currency_code || 'EGP';
    const pct = Number(p.deduction_percent || 10).toFixed(1);
    const commLbl = document.querySelector('#offlineCommissionPreview span');
    if (commLbl && commLbl.textContent.includes('عمولات سويا')) {
        commLbl.textContent = `عمولات سويًا (${pct}%):`;
    }
    const cashiers = merchantBundle?.cashiers || [];
    const btn = document.getElementById('submitPosPaymentBtn');
    if (btn && !document.getElementById('posCashierAuthBlock')) {
        const payExtra = document.createElement('div');
        payExtra.id = 'qrExtraPaymentBlock';
        payExtra.style.cssText = 'background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:grid;gap:10px;';
        payExtra.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:10px;">
                <div>
                    <label style="display:block;font-size:0.8rem;font-weight:800;color:#0f172a;margin-bottom:4px;">💳 وسيلة الدفع *</label>
                    <select id="qrPaymentType" class="form-control" onchange="calculateOfflineCommission()" style="font-weight:700;">
                        ${buildMerchantPayTypeOptionsHtml('cash')}
                    </select>
                </div>
                <div id="qrUniqueRefGroup" style="display:none;">
                    <label style="display:block;font-size:0.8rem;font-weight:800;color:#0f172a;margin-bottom:4px;">🔢 رقم المرجع / RRN / الشيك / البوليصة</label>
                    <input type="text" id="qrUniquePaymentRef" class="form-control" placeholder="مرجع الدفع لمنع التكرار">
                </div>
            </div>
            <div id="qrDeferredNotice" style="display:none;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 10px;font-size:0.78rem;font-weight:700;color:#92400e;">
                ⏳ الدفع عند الاستلام (COD) أو الشيك يظل بحالة «معلق» لحين تأكيد التسليم/التحصيل من تبويب الطلبات المعلقة.
            </div>
            <div>
                <label style="display:block;font-size:0.8rem;font-weight:800;color:#0f172a;margin-bottom:4px;">🧾 صورة إيصال الفاتورة / الشبكة (اختياري)</label>
                <div id="qrReceiptUploader"></div>
                <input type="hidden" id="qrReceiptUrl">
            </div>
        `;
        btn.parentNode.insertBefore(payExtra, btn);

        const block = document.createElement('div');
        block.id = 'posCashierAuthBlock';
        block.style.cssText = 'background:#f0fdf4;border:1.5px solid #10b981;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:10px;';
        block.innerHTML = `
            <div>
                <label style="display:block;font-size:0.8rem;font-weight:800;color:#065f46;margin-bottom:4px;">👨‍💼 كود موظف الكاشير (اختياري D25)</label>
                <select id="posCashierEmpCode" class="form-control" style="font-weight:700;">
                    <option value="">المالك المباشر (بدون PIN موظف)</option>
                    ${cashiers.filter(c => c.is_active).map(c => `<option value="${escM(c.employee_code)}">${escM(c.employee_code)} — ${escM(c.full_name)}</option>`).join('')}
                </select>
            </div>
            <div>
                <label style="display:block;font-size:0.8rem;font-weight:800;color:#065f46;margin-bottom:4px;">🔢 رمز PIN الموظف (4 أرقام — قفل بعد 5 أخطاء)</label>
                <input type="password" id="posCashierPinInput" maxlength="4" inputmode="numeric" class="form-control" placeholder="${window.SAWYAN.API.isDemoMode() ? 'للتجربة مع EMP-01 أدخل: 2580' : '****'}">
            </div>
        `;
        btn.parentNode.insertBefore(block, btn);

        const qrHost = document.getElementById('qrReceiptUploader');
        if (qrHost && window.SAWYAN && window.SAWYAN.ImageUpload) {
            window._qrReceiptUploader = window.SAWYAN.ImageUpload.mountUploader(qrHost, {
                label: '📷 إرفاق صورة الإيصال (اختياري)',
                maxDim: 1280,
                maxChars: 360000,
                onChange: (v) => { const el = document.getElementById('qrReceiptUrl'); if (el) el.value = v || ''; }
            });
        }
    }
    calculateOfflineCommission();
    syncMerchantBalanceWarnings();
};

// ============================================================================
// 1. وضع الكاشير المعزول بـ 3 أزرار عملاقة فقط (POS Kiosk Mode — Ch. 7.4 #1)
// ============================================================================
async function loadKioskModePage() {
    const page = document.getElementById('kioskPage');
    if (!page) return;
    kioskMemberData = null;
    ++kioskLookupSeq;
    if (kioskLookupDebounce) clearTimeout(kioskLookupDebounce);
    if (!merchantBundle) await refreshMerchantBundle();
    const p = merchantBundle?.profile || merchantData || {};
    const cashiers = (merchantBundle?.cashiers || []).filter(c => c.is_active);
    const queuedList = await SawyanOfflinePosVault.listEncryptedRecords(currentMerchant?.id);

    page.innerHTML = `
        <div style="background:linear-gradient(135deg,#0f172a,#064e3b);color:#fff;border-radius:18px;padding:20px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
                <span style="background:rgba(16,185,129,0.22);border:1px solid #10b981;color:#a7f3d0;padding:3px 10px;border-radius:999px;font-size:0.76rem;font-weight:800;">⚡ وضع الكاشير الميداني المعزول (3-Button POS Kiosk)</span>
                <h2 style="margin:8px 0 2px;font-size:1.35rem;">${escM(p.business_name || 'متجر SAWYAN')} — <code>#${escM(p.merchant_code || '')}</code></h2>
                <small style="color:#cbd5e1;">صمم لسرعة طابور الكاشير في 5 ثوانٍ مع تشفير الأوفلاين التلقائي <code>AES-256-GCM</code></small>
            </div>
            ${(window.SAWYAN?.API?.isDemoMode && window.SAWYAN.API.isDemoMode()) ? `
            <label style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.12);padding:8px 14px;border-radius:10px;cursor:pointer;font-size:0.84rem;font-weight:700;">
                <input type="checkbox" id="deadZoneToggle" ${forceDeadZoneSimulation ? 'checked' : ''} onchange="toggleDeadZoneSim(this.checked)">
                <span>📴 محاكاة انقطاع الإنترنت (بيئة التجربة فقط)</span>
            </label>` : ''}
        </div>

        <!-- الأزرار الثلاثة العملاقة فقط وفق الباب 7.4 #1 -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px;margin-bottom:20px;">
            <button type="button" onclick="openKioskQuickSalePanel()" style="background:#059669;color:#fff;border:none;border-radius:18px;padding:28px 20px;cursor:pointer;text-align:center;box-shadow:0 10px 25px rgba(5,150,105,0.28);">
                <div style="font-size:2.6rem;margin-bottom:8px;">📷</div>
                <div style="font-size:1.2rem;font-weight:900;font-family:Tajawal,sans-serif;">1️⃣ عملية كاشير فورية (PIN)</div>
                <div style="font-size:0.82rem;opacity:0.9;margin-top:4px;">مسح باركود / كود العضو + المبلغ + PIN الموظف</div>
            </button>

            <button type="button" onclick="syncKioskOfflineVault()" style="background:#1d4ed8;color:#fff;border:none;border-radius:18px;padding:28px 20px;cursor:pointer;text-align:center;box-shadow:0 10px 25px rgba(29,78,216,0.25);">
                <div style="font-size:2.6rem;margin-bottom:8px;">🔐</div>
                <div style="font-size:1.2rem;font-weight:900;font-family:Tajawal,sans-serif;">2️⃣ مزامنة الفواتير المؤقتة (${queuedList.length})</div>
                <div style="font-size:0.82rem;opacity:0.9;margin-top:4px;">حفظ محلي آمن للعمليات عند انقطاع الإنترنت ومزامنتها تلقائياً</div>
            </button>

            <button type="button" onclick="downloadSafeShiftCsv('today')" style="background:#0f172a;color:#fff;border:none;border-radius:18px;padding:28px 20px;cursor:pointer;text-align:center;box-shadow:0 10px 25px rgba(15,23,42,0.25);">
                <div style="font-size:2.6rem;margin-bottom:8px;">🧾</div>
                <div style="font-size:1.2rem;font-weight:900;font-family:Tajawal,sans-serif;">3️⃣ تقفيل الوردية وتنزيل CSV</div>
                <div style="font-size:0.82rem;opacity:0.9;margin-top:4px;">تصدير كشف الوردية المحاسبي جاهز للطباعة</div>
            </button>
        </div>

        <div id="kioskWorkPanel" style="background:#fff;border:2px solid #10b981;border-radius:16px;padding:20px;">
            <h3 style="margin:0 0 12px;color:#065f46;">⚡ نافذة الإدخال السريع للكاشير</h3>
            <form id="kioskFastForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,185px),1fr));gap:12px;align-items:end;">
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">كود العضو أو الباركود *</label>
                    <input type="text" id="kioskMemberCode" required class="form-control" oninput="handleKioskMemberCodeInput(this.value)" placeholder="أدخل كود العضو أو امسح الباركود">
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">مبلغ الفاتورة (${escM(p.currency_code || 'EGP')}) *</label>
                    <input type="number" step="0.01" min="1" id="kioskAmount" required class="form-control" placeholder="500.00">
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">طريقة الدفع *</label>
                    <select id="kioskPayType" class="form-control" onchange="if(document.getElementById('kioskRefGroup')){document.getElementById('kioskRefGroup').style.display=getMerchantPayTypeMeta(this.value).needsRef?'block':'none';} if(document.getElementById('kioskDeferredNotice')){document.getElementById('kioskDeferredNotice').style.display=getMerchantPayTypeMeta(this.value).deferred?'block':'none';}">
                        ${buildMerchantPayTypeOptionsHtml('cash')}
                    </select>
                </div>
                <div id="kioskRefGroup" style="display:none;">
                    <label style="font-weight:800;font-size:0.84rem;">مرجع الدفع / RRN / الشيك</label>
                    <input type="text" id="kioskUniqueRef" class="form-control" placeholder="رقم المرجع الفريد">
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">موظف الكاشير (D25)</label>
                    <select id="kioskEmpCode" class="form-control">
                        <option value="">المالك المباشر</option>
                        ${cashiers.map(c => `<option value="${escM(c.employee_code)}">${escM(c.employee_code)} — ${escM(c.full_name)}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">PIN الموظف (4 أرقام)</label>
                    <input type="password" id="kioskEmpPin" maxlength="4" inputmode="numeric" class="form-control" placeholder="****">
                </div>
                <div id="kioskMemberPreview" style="grid-column:1 / -1;background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:10px;padding:8px 12px;font-size:0.84rem;font-weight:800;color:#64748b;">👤 اكتب كود العضو أو امسح الباركود ليظهر اسمه هنا للتحقق قبل الاعتماد</div>
                <div style="grid-column:1 / -1;">
                    <div id="kioskDeferredNotice" style="display:none;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 10px;font-size:0.78rem;font-weight:700;color:#92400e;margin-bottom:8px;">
                        ⏳ تنبيه: الدفع عند الاستلام (COD) أو الشيك يبقى بحالة «معلق» حتى تأكيد التسليم/التحصيل.
                    </div>
                    <div id="kioskReceiptUploader"></div>
                    <input type="hidden" id="kioskReceiptUrl">
                </div>
                <button type="submit" class="btn btn-primary" style="padding:12px;font-weight:900;grid-column:1 / -1;">✅ اعتماد الفاتورة فوراً</button>
            </form>
        </div>
    `;

    const kHost = document.getElementById('kioskReceiptUploader');
    if (kHost && window.SAWYAN && window.SAWYAN.ImageUpload) {
        window._kioskReceiptUploader = window.SAWYAN.ImageUpload.mountUploader(kHost, {
            label: '🧾 إرفاق صورة إيصال الفاتورة (اختياري)',
            maxDim: 1280,
            maxChars: 360000,
            onChange: (v) => { const el = document.getElementById('kioskReceiptUrl'); if (el) el.value = v || ''; }
        });
    }
    syncMerchantBalanceWarnings();

    document.getElementById('kioskFastForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rawVal = (document.getElementById('kioskMemberCode')?.value || '').trim();
        const amt = parseFloat(document.getElementById('kioskAmount')?.value || '0');
        if (!rawVal || !amt || amt <= 0) {
            swNotify('يرجى إدخال كود العضو ومبلغ أكبر من صفر.', 'warning');
            return;
        }
        const resolved = await ensurePosMemberBeforeSubmit(rawVal, kioskMemberData, (r) => {
            kioskMemberData = r;
            renderKioskMemberPreview('found', rawVal, r);
        });
        if (!resolved) return;

        const kioskRef = (document.getElementById('kioskUniqueRef')?.value || '').trim() || null;
        const kioskReceipt = ((window._kioskReceiptUploader && window._kioskReceiptUploader.getValue()) || document.getElementById('kioskReceiptUrl')?.value || '').trim() || null;
        const ok = await submitLiveOrOfflinePosTransaction({
            memberCode: resolved.code,
            memberDisplayName: resolved.name,
            amount: amt,
            paymentType: document.getElementById('kioskPayType').value,
            uniquePaymentRef: kioskRef,
            receiptMediaUrl: kioskReceipt,
            employeeCode: document.getElementById('kioskEmpCode').value || null,
            cashierPin: document.getElementById('kioskEmpPin').value || null
        });
        if (ok) await loadKioskModePage();
    });
}

function openKioskQuickSalePanel() {
    document.getElementById('kioskMemberCode')?.focus();
}

function toggleDeadZoneSim(checked) {
    forceDeadZoneSimulation = Boolean(checked);
    SawyanOfflinePosVault.refreshHeaderBadge();
}

async function syncKioskOfflineVault() {
    const res = await SawyanOfflinePosVault.syncAllQueued(currentMerchant.id);
    await swAlertBox('نتائج المزامنة', `• فواتير تم ترحيلها بنجاح: ${res.synced}\n• فواتير ما زالت بالانتظار: ${res.failed}`, res.failed > 0 ? 'warning' : 'success');
    await loadKioskModePage();
}

// ============================================================================
// 2. طقم المتجر بلمسة واحدة للطباعة (1-Click Store Kit Printable Poster)
// ============================================================================
function openStoreKitModal() {
    const p = merchantBundle?.profile || merchantData || {};
    let modal = document.getElementById('storeKitModalOverlay');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'storeKitModalOverlay';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.78);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;font-family:Tajawal,sans-serif;direction:rtl;';
        document.body.appendChild(modal);
    }
    if (!document.getElementById('storeKitPrintHideStyle')) {
        const ps = document.createElement('style');
        ps.id = 'storeKitPrintHideStyle';
        ps.textContent = '@media print { .store-kit-no-print { display: none !important; } }';
        document.head.appendChild(ps);
    }
    const closeStoreKit = () => { modal.style.display = 'none'; };
    modal.onclick = (e) => { if (e.target === modal) closeStoreKit(); };
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div id="storeKitPrintableCard" style="position:relative;background:#ffffff;border:4px solid #059669;border-radius:20px;max-width:520px;width:100%;padding:26px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.4);">
            <div style="position:relative;background:#064e3b;color:#fff;padding:12px 44px 12px 44px;border-radius:12px;margin-bottom:14px;">
                <button type="button" id="storeKitCloseX" class="store-kit-no-print" aria-label="إغلاق" title="إغلاق (Esc)" onclick="document.getElementById('storeKitModalOverlay').style.display='none'" style="position:absolute;top:10px;left:10px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.18);color:#ffffff;font-size:1.05rem;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button>
                <div style="font-size:0.8rem;color:#a7f3d0;font-weight:800;">نقطة بيع معتمدة رسمياً في شبكة SAWYAN العالمية</div>
                <h2 style="margin:4px 0 0;font-size:1.4rem;">🏪 ${escM(p.business_name || 'متجرك المعتمد')}</h2>
            </div>
            <p style="margin:0 0 12px;color:#334155;font-weight:700;">كود المتجر الرسمي: <code style="font-size:1.1rem;background:#ecfdf5;color:#047857;padding:3px 10px;border-radius:8px;">#${escM(p.merchant_code || '')}</code></p>
            <div id="storeKitMainQr" style="display:inline-block;padding:14px;background:#fff;border:2px dashed #10b981;border-radius:16px;margin-bottom:14px;"></div>
            <div style="text-align:right;background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px 16px;font-size:0.86rem;color:#0f172a;margin-bottom:16px;line-height:1.7;">
                <strong>✨ كيف توثّق مشترياتك في 5 ثوانٍ؟</strong>
                <ol style="margin:6px 18px 0 0;padding:0;">
                    <li>أظهر كود عضويتك أو الباركود الثابت للكاشير قبل الدفع.</li>
                    <li>استلم كود التحقق الفوري <code>SW-XXXX</code> على إيصالك.</li>
                    <li>تُضاف عائدات خطة الدخل لصندوق هدفك الشهري فوراً!</li>
                </ol>
            </div>
            <div class="store-kit-no-print" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                <button type="button" onclick="window.print()" class="btn btn-primary" style="padding:10px 22px;font-weight:800;">🖨️ طباعة الملصق فوراً (A4/A5)</button>
                <button type="button" id="storeKitCloseBtn" onclick="document.getElementById('storeKitModalOverlay').style.display='none'" class="btn btn-outline" style="padding:10px 22px;font-weight:800;background:#f1f5f9;color:#0f172a;border:1.5px solid #cbd5e1;">✕ إغلاق</button>
            </div>
        </div>
    `;
    const qrBox = document.getElementById('storeKitMainQr');
    renderSawyanQrBox(qrBox, `SAWYAN:MERCHANT:${p.merchant_code || p.id}`, 180, '#064e3b');
}

// ============================================================================
// 3. الصفحات الحية المربوطة بقاعدة البيانات (Pending, Completed+Shift CSV, Financials, Settings+D25)
// ============================================================================
async function loadPendingTransactions(skipRefresh = false) {
    const page = document.getElementById('pendingPage');
    if (!page) return;
    if (!skipRefresh) await refreshMerchantBundle();
    const pendingData = merchantBundle?.pending_transactions || [];
    const empRejections = merchantBundle?.recent_employee_rejections || [];
    const curr = merchantBundle?.profile?.currency_code || 'EGP';
    const canRejectManual = (merchantBundle?.profile?.effective_access?.can_reject_pending_manually !== false);

    const itemsHtml = pendingData.length === 0 ? `
        <div style="background:white;border-radius:12px;padding:30px;text-align:center;border:1px solid #e2e8f0;">
            <div style="font-size:2.5rem;margin-bottom:8px;">✅</div>
            <div style="font-weight:800;font-size:1.05rem;color:#0f172a;">لا توجد طلبات توثيق معلقة أو في طابور الشحن حالياً</div>
            <div style="font-size:0.82rem;color:#64748b;margin-top:4px;">كافة العمليات موثقة في الدفتر المحاسبي المزدوج — التحديث الحي يعمل تلقائياً.</div>
        </div>
    ` : pendingData.map(tx => `
        <div id="merPendingTx_${escM(tx.id)}" data-tx-id="${escM(tx.id)}" data-short-code="${escM(tx.sw_short_code || '')}" style="background:white;border:1.5px solid ${tx.status === 'awaiting_merchant_topup' ? '#ef4444' : '#cbd5e1'};border-radius:14px;padding:16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-weight:900;font-size:1rem;color:#0f172a;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span>👤 العضو: ${escM(tx.member_masked_name)}</span>
                        <span style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:2px 9px;border-radius:7px;font-family:monospace;font-size:0.9rem;font-weight:900;" dir="ltr">${escM(tx.sw_short_code)}</span>
                    </div>
                    <div style="font-size:0.78rem;color:#64748b;margin-top:3px;">⏱️ ${new Date(tx.created_at).toLocaleString('ar-EG')} ${tx.branch_name ? `• 📍 ${escM(tx.branch_name)}` : ''}</div>
                    <div style="font-size:0.76rem;color:#334155;margin-top:4px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                        <span style="background:#f1f5f9;padding:2px 8px;border-radius:6px;font-weight:700;">${escM(fmtMerchantPayTypeLabel(tx.payment_type))}</span>
                        ${tx.unique_payment_ref ? `<span>مرجع: <code dir="ltr">${escM(tx.unique_payment_ref)}</code></span>` : ''}
                        ${tx.zero_hold_in_isolation ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-weight:800;">🟠 طلب بالعزل 10% (بدون حجز مؤقت)</span>' : ''}
                        ${(tx.payment_type === 'cod' || tx.payment_type === 'cheque') ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:6px;font-weight:800;">🚚 تحصيل مؤجل — اعتمدها بعد استلام المبلغ</span>' : ''}
                    </div>
                </div>
                <span style="background:${tx.status === 'awaiting_merchant_topup' ? '#fee2e2' : '#fef3c7'};color:${tx.status === 'awaiting_merchant_topup' ? '#991b1b' : '#92400e'};font-size:0.75rem;font-weight:800;padding:3px 10px;border-radius:999px;">
                    ${tx.status === 'awaiting_merchant_topup' ? '⏸️ بانتظار شحن رصيد المتجر' : '⏳ بانتظار اعتمادك (أو أحد الموظفين)'}
                </span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:8px;background:#f8fafc;padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:0.84rem;">
                <div><span style="color:#64748b;display:block;font-size:0.74rem;">إجمالي الفاتورة:</span><strong>${fmtMerchantMoney(tx.total_amount, tx.currency_code || curr)}</strong></div>
                <div><span style="color:#64748b;display:block;font-size:0.74rem;">إجمالي العمولة التعاقدية:</span><strong style="color:#dc2626;">-${fmtMerchantMoney(tx.commission_amount, tx.currency_code || curr)}</strong></div>
                <div><span style="color:#64748b;display:block;font-size:0.74rem;">صافي نقدية المتجر:</span><strong style="color:#059669;">${fmtMerchantMoney(tx.merchant_net_amount, tx.currency_code || curr)}</strong></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                ${tx.status === 'pending' ? `
                    <button type="button" onclick="approvePendingTx('${tx.id}')" style="flex:2;background:#059669;color:white;border:none;padding:10px 14px;border-radius:8px;font-weight:800;cursor:pointer;">✅ اعتماد الفاتورة مباشرة (بصلاحية المالك)</button>
                    ${canRejectManual
                        ? `<button type="button" onclick="rejectPendingTx('${tx.id}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;font-weight:700;cursor:pointer;">❌ رفض</button>`
                        : `<span style="background:#fff7ed;color:#9a3412;border:1px solid #fdba74;padding:8px 12px;border-radius:8px;font-size:0.78rem;font-weight:800;">🔒 الرفض اليدوي موقوف مؤقتاً</span>`}
                ` : `
                    <button type="button" onclick="openMerchantTopupModal()" class="btn btn-primary btn-sm">➕ اشحن الرصيد لتحرير الفاتورة تلقائياً</button>
                `}
                ${(tx.receipt_media_url && window.SAWYAN && window.SAWYAN.ImageUpload) ? window.SAWYAN.ImageUpload.renderThumbHtml(tx.receipt_media_url, '🧾 إيصال الفاتورة ' + escM(tx.sw_short_code)) : ''}
            </div>
        </div>
    `).join('');

    const empRejHtml = empRejections.length === 0 ? '' : `
        <div style="margin-top:22px;background:#fff7ed;border:1.5px solid #fdba74;border-radius:14px;padding:16px;">
            <h3 style="margin:0 0 6px;font-size:1.02rem;font-weight:900;color:#9a3412;">⚠️ فواتير رفضها موظفون خلال آخر 48 ساعة (${empRejections.length})</h3>
            <p style="margin:0 0 12px;font-size:0.8rem;color:#7c2d12;">بصفتك مالك المتجر، يمكنك التراجع الفوري واعتماد أي فاتورة رفضها موظف بالخطأ خلال مهلة الـ 48 ساعة لحماية متجرك من النزاعات (D2).</p>
            ${empRejections.map(rx => `
                <div style="background:#fff;border:1px solid #fed7aa;border-radius:10px;padding:12px;margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                        <div>
                            <strong>👤 ${escM(rx.member_masked_name)}</strong> • <code dir="ltr">${escM(rx.sw_short_code)}</code>
                            <div style="font-size:0.78rem;color:#9a3412;margin-top:2px;">👨‍💼 رفضها الموظف: <strong>${escM(rx.employee_name || '')} (${escM(rx.employee_code || '')})</strong> • السبب: «${escM(rx.rejection_reason || 'غير مطابق')}»</div>
                        </div>
                        <strong style="color:#0f172a;">${fmtMerchantMoney(rx.total_amount, rx.currency_code || curr)}</strong>
                    </div>
                    <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button type="button" onclick="overrideEmployeeRejection('${rx.id}')" style="background:#059669;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:800;font-size:0.82rem;cursor:pointer;">✅ تراجع واعتماد الفاتورة (بصلاحية المالك)</button>
                        ${(rx.receipt_media_url && window.SAWYAN && window.SAWYAN.ImageUpload) ? window.SAWYAN.ImageUpload.renderThumbHtml(rx.receipt_media_url, '🧾 إيصال ' + escM(rx.sw_short_code)) : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <div>
                <h2 style="margin:0;font-size:1.3rem;font-weight:900;color:#0f172a;">⏳ طلبات التوثيق الواردة (${pendingData.length})</h2>
                <p style="margin:4px 0 0;font-size:0.84rem;color:#64748b;">اعتمد الطلب مباشرة بصلاحية المالك (بدون PIN) أو سيعتمدها أسرع موظف من موبايله الشخصي.</p>
            </div>
        </div>
        <div id="pendingList">${itemsHtml}</div>
        ${empRejHtml}
    `;
}

const _merchantTxBusySet = new Set();

async function overrideEmployeeRejection(id) {
    if (_merchantTxBusySet.has(id)) return;
    _merchantTxBusySet.add(id);
    try {
        const res = await window.SAWYAN.API.confirmOrRejectPendingTx({
            merchantId: currentMerchant.id,
            transactionId: id,
            decision: 'approve'
        });
        const st = res?.result?.status || res?.feed?.status || 'completed';
        swNotify(st === 'awaiting_merchant_topup'
            ? 'تم التراجع عن رفض الموظف وحفظ الفاتورة بانتظار شحن الرصيد.'
            : '✅ تم التراجع عن رفض الموظف واعتماد الفاتورة وإشعار العميل فوراً!', st === 'awaiting_merchant_topup' ? 'warning' : 'success');
        await loadPendingTransactions();
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    } finally {
        _merchantTxBusySet.delete(id);
    }
}

async function approvePendingTx(id) {
    if (_merchantTxBusySet.has(id)) return;
    _merchantTxBusySet.add(id);
    try {
        const res = await window.SAWYAN.API.confirmOrRejectPendingTx({
            merchantId: currentMerchant.id,
            transactionId: id,
            decision: 'approve'
        });
        const st = res?.result?.status || 'completed';
        swNotify(st === 'awaiting_merchant_topup'
            ? 'تم قبول الفاتورة لكنها بانتظار شحن رصيد المتجر لتفعيلها.'
            : 'تم اعتماد الفاتورة وتوثيقها في المبيعات بنجاح!', st === 'awaiting_merchant_topup' ? 'warning' : 'success');
        await loadPendingTransactions();
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    } finally {
        _merchantTxBusySet.delete(id);
    }
}

async function rejectPendingTx(id) {
    const reason = await swPromptBox('سبب رفض الفاتورة', 'اذكر سبب رفض الفاتورة لإبلاغ العميل بوضوح:', 'بيانات الإيصال غير مطابقة', 'مثال: صورة الإيصال غير واضحة أو المبلغ مختلف');
    if (reason === null) return;
    try {
        await window.SAWYAN.API.confirmOrRejectPendingTx({
            merchantId: currentMerchant.id,
            transactionId: id,
            decision: 'reject',
            rejectionReason: reason.trim() || 'غير مطابق'
        });
        swNotify('تم رفض الفاتورة وتحرير المبلغ المحجوز فوراً.', 'success');
        await loadPendingTransactions();
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    }
}

async function downloadSafeShiftCsv(periodFilter = 'today') {
    try {
        const shiftRes = await window.SAWYAN.API.merchantShiftClosingGuarded({
            merchantId: currentMerchant.id,
            periodFilter,
            exportFormat: 'csv'
        });
        const csvText = window.SAWYAN.API.buildSafeCsvContent(shiftRes);
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAWYAN_ShiftClosing_${merchantData?.merchant_code || 'Store'}_${periodFilter}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        swNotify('تعذر تصدير تقرير الوردية: ' + formatMerchantErrorMessage(err), 'error');
    }
}

let activeShiftPeriod = 'today';

async function loadAllTransactions(periodFilter = activeShiftPeriod) {
    activeShiftPeriod = periodFilter || 'today';
    const page = document.getElementById('transactionsPage');
    if (!page) return;
    await refreshMerchantBundle(activeShiftPeriod, null);

    const txs = merchantBundle?.completed_transactions || [];
    const queuedTxs = merchantBundle?.pending_transactions || [];
    const shift = merchantBundle?.shift_closing || {};
    const totals = shift.summary || shift.totals || {};
    const curr = merchantBundle?.profile?.currency_code || 'EGP';

    const queuedAlertHtml = queuedTxs.length === 0 ? '' : `
        <div style="background:#fef2f2;border:1.5px solid #f87171;border-radius:14px;padding:14px 16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                <strong style="color:#991b1b;font-size:0.95rem;">⏸️ فواتير بانتظار شحن الرصيد أو الاعتماد (${queuedTxs.length})</strong>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button type="button" onclick="showPage('pending')" style="background:#b91c1c;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:800;font-size:0.78rem;cursor:pointer;">⏳ فتح قائمة الفواتير المعلقة</button>
                    <button type="button" onclick="showPage('financial')" style="background:#065f46;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:800;font-size:0.78rem;cursor:pointer;">🏦 شحن الرصيد الآن</button>
                </div>
            </div>
            <div style="display:grid;gap:8px;">
                ${queuedTxs.map(qt => `
                    <div style="background:#fff;border:1px solid ${qt.status === 'awaiting_merchant_topup' ? '#fca5a5' : '#fcd34d'};border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:0.83rem;">
                        <div>
                            <code style="font-weight:800;color:#1d4ed8;">${escM(qt.sw_short_code)}</code> — <b>${escM(qt.member_masked_name)}</b>
                            <span style="color:#64748b;">• ${new Date(qt.created_at).toLocaleString('ar-EG')}</span>
                        </div>
                        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                            <b>${fmtMerchantMoney(qt.total_amount, qt.currency_code || curr)}</b>
                            <span style="color:#b91c1c;font-weight:700;">عمولة: ${fmtMerchantMoney(qt.commission_amount, qt.currency_code || curr)}</span>
                            <span style="padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:800;background:${qt.status === 'awaiting_merchant_topup' ? '#fee2e2' : '#fef3c7'};color:${qt.status === 'awaiting_merchant_topup' ? '#991b1b' : '#92400e'};">
                                ${qt.status === 'awaiting_merchant_topup' ? `⏸️ بانتظار شحن الرصيد (ترتيب #${qt.fifo_seq || 1})` : '⏳ بانتظار الاعتماد'}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    const rowsHtml = txs.length === 0
        ? `<tr><td colspan="9" style="padding:20px;text-align:center;color:#64748b;">${queuedTxs.length > 0 ? 'لا توجد عمليات مكتملة بعد — راجع الفواتير المعلقة الظاهرة أعلاه.' : 'لا توجد عمليات مسجلة بعد في هذا المتجر.'}</td></tr>`
        : txs.map(tx => {
            const thumb = (tx.receipt_media_url && window.SAWYAN && window.SAWYAN.ImageUpload)
                ? window.SAWYAN.ImageUpload.renderThumbHtml(tx.receipt_media_url, '🧾 إيصال ' + escM(tx.sw_short_code))
                : '';
            return `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td data-label="كود الفاتورة" style="padding:12px;font-weight:800;font-family:monospace;direction:ltr;color:#2563eb;">${escM(tx.sw_short_code)}</td>
                <td data-label="العضو" style="padding:12px;font-weight:700;">${escM(tx.member_masked_name)}</td>
                <td data-label="الوسيلة والإيصال" style="padding:12px;font-size:0.78rem;">
                    <div>${escM(fmtMerchantPayTypeLabel(tx.payment_type))}</div>
                    ${tx.unique_payment_ref ? `<div style="font-family:monospace;color:#475569;font-size:0.72rem;" dir="ltr">Ref: ${escM(tx.unique_payment_ref)}</div>` : ''}
                    ${thumb ? `<div style="margin-top:4px;">${thumb}</div>` : ''}
                </td>
                <td data-label="إجمالي الفاتورة" style="padding:12px;font-weight:800;color:#0f172a;"><span dir="ltr">${fmtMerchantMoney(tx.total_amount, tx.currency_code || curr)}</span></td>
                <td data-label="العمولة التعاقدية" style="padding:12px;font-weight:800;color:#dc2626;"><span dir="ltr">-${fmtMerchantMoney(tx.commission_amount, tx.currency_code || curr)}</span></td>
                <td data-label="صافي الدرج" style="padding:12px;font-weight:800;color:#059669;"><span dir="ltr">${fmtMerchantMoney(tx.merchant_net_amount, tx.currency_code || curr)}</span></td>
                <td data-label="التوقيت" style="padding:12px;font-size:0.8rem;color:#64748b;">${new Date(tx.completed_at || tx.created_at).toLocaleString('ar-EG')}</td>
                <td data-label="الفرع والكاشير" style="padding:12px;font-size:0.76rem;"><span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:6px;font-weight:800;">${escM(tx.branch_name || '-')} • ${escM(tx.cashier_name || '')}</span></td>
                <td data-label="إجراء المرتجع" style="padding:12px;font-size:0.76rem;">
                    ${tx.status === 'completed'
                        ? `<button type="button" onclick="handleMerchantPosReturn('${tx.id}','${escM(tx.sw_short_code)}')" style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;padding:5px 10px;border-radius:6px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">↩️ مرتجع (قبل يوم 15)</button>`
                        : `<span style="color:#64748b;font-weight:800;">↩️ مسترجعة</span>`}
                </td>
            </tr>
        `; }).join('');

    page.innerHTML = `
        <div style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:0.84rem;color:#9a3412;line-height:1.65;">
            🛑 <strong>القاعدة التعاقدية للمرتجعات:</strong> يُقبل استرداد العمولة عبر النظام خلال الشهر المفتوح وحتى نهاية اليوم <strong>14</strong> من الشهر التالي فقط (قبل يوم الصرف 15). <strong>وبعد يوم الصرف (يوم 15) يُقفل الشهر نهائياً ويرفض السيستم أي مرتجع يخصه؛ فإن وافق البائع على قبول المرتجع بعد يوم 15 يتحمله البائع وحده بالكامل (100%) خارج نظام سوياً.</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <div>
                <h2 style="margin:0;font-size:1.3rem;font-weight:900;color:#0f172a;">💳 سجل العمليات وتقفيل الوردية</h2>
                <p style="margin:4px 0 0;font-size:0.84rem;color:#64748b;">سجل محمي للخصوصية وجاهز لتقفيل الوردية وتصدير كشف Excel آمن</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select onchange="loadAllTransactions(this.value)" class="form-control" style="width:auto;font-weight:700;">
                    <option value="today" ${activeShiftPeriod === 'today' ? 'selected' : ''}>وردية اليوم</option>
                    <option value="week" ${activeShiftPeriod === 'week' ? 'selected' : ''}>آخر 7 أيام</option>
                    <option value="month" ${activeShiftPeriod === 'month' ? 'selected' : ''}>الشهر الحالي</option>
                </select>
                <button type="button" onclick="downloadSafeShiftCsv('${activeShiftPeriod}')" style="background:#0f172a;color:white;border:none;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;">
                    📥 تنزيل كشف الوردية (Excel / CSV)
                </button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:10px;margin-bottom:14px;">
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;">
                <small style="color:#065f46;">مكتملة (${totals.completed_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#047857;">${fmtMerchantMoney(totals.completed_amount ?? totals.completed_gross ?? 0, curr)}</strong>
            </div>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px;">
                <small style="color:#92400e;">معلقة (${totals.pending_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#b45309;">${fmtMerchantMoney(totals.pending_amount ?? totals.pending_gross ?? 0, curr)}</strong>
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;">
                <small style="color:#991b1b;">بانتظار شحن الرصيد (${totals.awaiting_topup_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#dc2626;">${fmtMerchantMoney(totals.awaiting_topup_amount ?? totals.awaiting_topup_gross ?? 0, curr)}</strong>
            </div>
            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;">
                <small style="color:#475569;">مسترجعة (${totals.reversed_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#334155;">${fmtMerchantMoney(totals.reversed_amount ?? totals.reversed_gross ?? 0, curr)}</strong>
            </div>
        </div>

        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:auto;">
            ${queuedAlertHtml}
            <table class="data-table" style="width:100%;border-collapse:collapse;text-align:right;font-size:0.86rem;">
                <thead>
                    <tr style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;color:#475569;font-weight:800;">
                        <th style="padding:12px;">كود الفاتورة</th>
                        <th style="padding:12px;">العضو</th>
                        <th style="padding:12px;">الوسيلة والإيصال</th>
                        <th style="padding:12px;">إجمالي الفاتورة</th>
                        <th style="padding:12px;">العمولة التعاقدية</th>
                        <th style="padding:12px;">صافي الدرج</th>
                        <th style="padding:12px;">التوقيت</th>
                        <th style="padding:12px;">الفرع والكاشير</th>
                        <th style="padding:12px;">إجراء المرتجع</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `;
}

function openMerchantPosReturnModal(transactionId, shortCode) {
    let overlay = document.getElementById('sawyanMerchantReturnModal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sawyanMerchantReturnModal';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;padding:16px;z-index:10050;';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    const close = () => { overlay.style.display = 'none'; };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    const renderStep1 = () => {
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;padding:22px;direction:rtl;font-family:Tajawal,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,0.28);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h3 style="margin:0;color:#0f172a;font-size:1.08rem;">↩️ مصافحة مرتجع آمنة — الفاتورة ${escM(shortCode)}</h3>
                    <button type="button" id="mrCloseBtn" style="border:none;background:#f1f5f9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-weight:800;">✕</button>
                </div>
                <div style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:10px;padding:10px;font-size:0.82rem;color:#9a3412;margin-bottom:12px;">
                    ⚠️ <strong>تنبيه إلزامي:</strong> لا تُسلِّم النقد للعميل قبل إتمام رمز التحقق (<strong>OTP</strong>) أو موافقة تطبيق العميل؛ وبعد صرف يوم 15 يرفض النظام أي مرتجع ويتحمله المتجر وحده (100%).
                </div>
                <label style="font-weight:700;font-size:0.86rem;display:block;margin-bottom:4px;">سبب المرتجع *</label>
                <input id="mrReturnReason" type="text" class="form-control" value="مرتجع بضاعة بموافقة العميل قبل يوم الصرف" style="margin-bottom:12px;">
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button type="button" id="mrCancelBtn" class="btn btn-outline btn-sm">إلغاء</button>
                    <button type="button" id="mrSendOtpBtn" class="btn btn-primary btn-sm">١. إرسال رمز OTP لتطبيق العميل</button>
                </div>
            </div>
        `;
        document.getElementById('mrCloseBtn').onclick = close;
        document.getElementById('mrCancelBtn').onclick = close;
        document.getElementById('mrSendOtpBtn').onclick = async () => {
            const btn = document.getElementById('mrSendOtpBtn');
            const reason = (document.getElementById('mrReturnReason').value || '').trim() || 'مرتجع قبل يوم الصرف';
            btn.disabled = true;
            btn.textContent = '⏳ جاري الإرسال...';
            try {
                await window.SAWYAN.API.merchantProcessPosReturn({
                    merchantId: currentMerchant.id,
                    transactionId,
                    reason,
                    mode: 'request_otp'
                });
                renderStep2(reason, '');
            } catch (err) {
                btn.disabled = false;
                btn.textContent = '١. إرسال رمز OTP لتطبيق العميل';
                if (String(err.message || '').includes('POST_PAYOUT_RETURN_FORBIDDEN')) {
                    await swAlertBox('مرتجع غير متاح بعد الصرف', 'تم إغلاق هذا الشهر وصرف عمولاته في اليوم 15؛ وفي حال موافقة التاجر على قبول المرتجع بعد يوم الصرف يتحمله التاجر بالكامل خارج المنصة.', 'warning');
                    close();
                } else {
                    swNotify('تعذر بدء المرتجع: ' + formatMerchantErrorMessage(err), 'error');
                }
            }
        };
    };

    const renderStep2 = (reason, statusHtml) => {
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;max-width:490px;width:100%;padding:22px;direction:rtl;font-family:Tajawal,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,0.28);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h3 style="margin:0;color:#0f172a;font-size:1.08rem;">🔐 الخطوة 2: تأكيد OTP المرتجع — ${escM(shortCode)}</h3>
                    <button type="button" id="mrCloseBtn2" style="border:none;background:#f1f5f9;border-radius:8px;width:32px;height:32px;cursor:pointer;font-weight:800;">✕</button>
                </div>
                <div style="background:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:10px;font-size:0.82rem;color:#065f46;margin-bottom:10px;">
                    ✅ تم إرسال رمز تحقق <strong>OTP (6 أرقام)</strong> وطلب موافقة لتطبيق العميل. أدخل الرمز الذي يظهر للعميل أو ارفع إثبات الرد عند مغادرته دون تأكيد.
                </div>
                <div id="mrOtpFeedback">${statusHtml}</div>
                <label style="font-weight:700;font-size:0.86rem;display:block;margin-bottom:4px;">رمز التحقق OTP من العميل (6 أرقام)</label>
                <input id="mrOtpInput" type="text" maxlength="6" placeholder="مثال: 482910" class="form-control" style="margin-bottom:10px;letter-spacing:3px;font-weight:800;text-align:center;">
                <div style="display:flex;gap:8px;margin-bottom:14px;">
                    <button type="button" id="mrConfirmOtpBtn" class="btn btn-primary btn-sm" style="flex:1;">٢. تأكيد OTP وتنفيذ المرتجع</button>
                </div>
                <details style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;">
                    <summary style="cursor:pointer;font-weight:800;color:#b45309;font-size:0.84rem;">🚨 هل تسلّم العميل النقد وغادر دون تأكيد؟ (تصعيد P0 بإثبات)</summary>
                    <div style="margin-top:8px;display:grid;gap:8px;">
                        <div id="mrEscProofUploader"></div>
                        <input id="mrEscProofUrl" type="hidden">
                        <button type="button" id="mrEscalateBtn" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;">رفع إثبات وتصعيد للإدارة (P0)</button>
                    </div>
                </details>
            </div>
        `;
        const retProofHost = document.getElementById('mrEscProofUploader');
        if (retProofHost && window.SAWYAN && window.SAWYAN.ImageUpload) {
            window._mrEscProofUploader = window.SAWYAN.ImageUpload.mountUploader(retProofHost, {
                label: '📷 رفع صورة إثبات رد النقد / الفاتورة الممضاة *',
                maxDim: 1280,
                maxChars: 360000,
                onChange: (v) => { const el = document.getElementById('mrEscProofUrl'); if (el) el.value = v || ''; }
            });
        }
        document.getElementById('mrCloseBtn2').onclick = close;
        document.getElementById('mrConfirmOtpBtn').onclick = async () => {
            const otp = (document.getElementById('mrOtpInput').value || '').trim();
            if (!otp) return;
            const res = await window.SAWYAN.API.merchantProcessPosReturn({
                merchantId: currentMerchant.id,
                transactionId,
                reason,
                mode: 'confirm_otp',
                otpCode: otp
            });
            if (res && res.ok === false) {
                const msg = res.status === 'locked'
                    ? '🔒 تم قفل محاولات OTP بعد استنفاد الحد الأقصى (5 محاولات). يمكنك التصعيد بالإثبات أدناه.'
                    : `⚠️ رمز OTP غير صحيح — المحاولات المتبقية: ${res.attempts_remaining ?? 0}`;
                renderStep2(reason, `<div style="background:#fef2f2;border:1px solid #fca5a5;color:#991b1b;padding:8px 10px;border-radius:8px;font-size:0.82rem;margin-bottom:10px;">${msg}</div>`);
                return;
            }
            swNotify(`تم تأكيد المرتجع وإلغاء الفاتورة (${shortCode}) واسترداد العمولة لرصيد المتجر!`, 'success');
            close();
            await loadAllTransactions(activeShiftPeriod);
        };
        document.getElementById('mrEscalateBtn').onclick = async () => {
            const proofUrl = ((window._mrEscProofUploader && window._mrEscProofUploader.getValue()) || document.getElementById('mrEscProofUrl')?.value || '').trim();
            if (!proofUrl) { swNotify('يرجى رفع صورة إثبات رد المبلغ للعميل أولاً.', 'warning'); return; }
            try {
                await window.SAWYAN.API.merchantProcessPosReturn({
                    merchantId: currentMerchant.id,
                    transactionId,
                    reason,
                    mode: 'escalate_with_proof',
                    proofUrl
                });
                swNotify('تم رفع إثبات المرتجع وإرسال الطلب لمراجعة الإدارة بنجاح.', 'success');
                close();
                await loadAllTransactions(activeShiftPeriod);
            } catch (err) { swNotify(formatMerchantErrorMessage(err), 'error'); }
        };
    };

    renderStep1();
}

async function handleMerchantPosReturn(transactionId, shortCode) {
    openMerchantPosReturnModal(transactionId, shortCode);
}

// حقن البيانات الحية في الموقف المالي ذي التبويبات الثلاثة (مع الحفاظ الكامل على تبويباته وتصميمه!)
const _origLoadFinancialReport = loadFinancialReport;
loadFinancialReport = async function () {
    _origLoadFinancialReport();
    await refreshMerchantBundle();
    const p = merchantBundle?.profile;
    if (!p) return;
    const curr = p.currency_code || 'EGP';
    const pct = Number(p.deduction_percent || 10);
    const cashBal = Number(p.actual_cash_balance || 0);
    const holdBal = Number(p.soft_hold_balance || 0);
    const credLim = Number(p.credit_limit || 0);
    const freeBal = Number(p.free_balance ?? (cashBal - holdBal + credLim));
    const safetyCap = pct > 0 ? (Math.max(0, freeBal) * 100 / pct) : 0;

    const heroCard = document.getElementById('finPrepaidHeroCard');
    if (heroCard && freeBal < 0) {
        heroCard.style.background = 'linear-gradient(135deg, #7f1d1d, #0f172a)';
        heroCard.style.borderColor = '#ef4444';
    }
    const debtPill = document.getElementById('liveDebtPill');
    if (debtPill) {
        debtPill.style.display = (freeBal < 0 || cashBal < 0) ? 'inline-block' : 'none';
    }

    const liveBal = document.getElementById('livePrepaidBalance');
    if (liveBal) {
        liveBal.textContent = fmtMerchantMoney(freeBal, curr);
        liveBal.style.color = freeBal < 0 ? '#f87171' : (freeBal === 0 ? '#fbbf24' : '#34d399');
    }

    const actualCashEl = document.getElementById('finActualCashVal');
    const credLimEl = document.getElementById('finCreditLimitVal');
    const softHoldEl = document.getElementById('finSoftHoldVal');
    const freeBalEl = document.getElementById('finFreeBalVal');
    if (actualCashEl) {
        actualCashEl.textContent = fmtMerchantMoney(cashBal, curr) + (cashBal < 0 ? ' (مديون)' : '');
        actualCashEl.style.color = cashBal < 0 ? '#f87171' : (cashBal === 0 ? '#fbbf24' : '#34d399');
    }
    if (credLimEl) {
        credLimEl.textContent = fmtMerchantMoney(credLim, curr);
        credLimEl.style.color = credLim > 0 ? '#93c5fd' : '#cbd5e1';
    }
    if (softHoldEl) {
        softHoldEl.textContent = fmtMerchantMoney(holdBal, curr);
        softHoldEl.style.color = holdBal > 0 ? '#fcd34d' : '#cbd5e1';
    }
    if (freeBalEl) {
        freeBalEl.textContent = fmtMerchantMoney(freeBal, curr);
        freeBalEl.style.color = freeBal < 0 ? '#f87171' : (freeBal === 0 ? '#fbbf24' : '#34d399');
    }

    const statusBadge = document.getElementById('liveStoreRadarBadge');
    if (statusBadge) {
        const effAcc = p.effective_access || {};
        if (p.cutoff_breached || p.financial_status === 'locked_queue_full' || p.governance_status === 'suspended_compliance' || p.governance_status === 'banned_permanent') {
            statusBadge.textContent = p.cutoff_breached
                ? '🔴 انتهت مهلة السداد — استقبال الفواتير متوقف لحين السداد'
                : '🔴 مقفل / معلق — يرجى مراجعة الرصيد والحالة';
            statusBadge.style.background = '#fef2f2';
            statusBadge.style.color = '#991b1b';
            statusBadge.style.borderColor = '#fca5a5';
        } else if (p.is_isolated || freeBal < 0) {
            statusBadge.textContent = freeBal < 0
                ? '🔴 رصيد مديون — المتجر مخفي مؤقتاً لحين السداد'
                : '🔴 المتجر مخفي مؤقتاً لنفاد الرصيد';
            statusBadge.style.background = '#fef2f2';
            statusBadge.style.color = '#991b1b';
            statusBadge.style.borderColor = '#fca5a5';
        } else if (p.onboarding_status && p.onboarding_status !== 'approved') {
            statusBadge.textContent = '⚠️ المتجر قيد استكمال البيانات التعاقدية';
            statusBadge.style.background = '#fef3c7';
            statusBadge.style.color = '#92400e';
            statusBadge.style.borderColor = '#fcd34d';
        } else if (p.governance_status === 'paused_by_merchant' || p.governance_status === 'paused_by_admin' || !effAcc.is_visible_on_radar) {
            statusBadge.textContent = '⏸️ المتجر مخفي / في إجازة مؤقتة';
            statusBadge.style.background = '#fef3c7';
            statusBadge.style.color = '#92400e';
            statusBadge.style.borderColor = '#fcd34d';
        } else {
            statusBadge.textContent = '🟢 حالة المتجر: آمن ونشط بالدليل';
        }
    }

    const safetyStrip = document.getElementById('liveSafetyCapStrip');
    if (safetyStrip) {
        safetyStrip.innerHTML = freeBal < 0
            ? `🔴 <strong>سعة التغطية المتاحة:</strong> لديك عجز قدره <strong dir="ltr">${fmtMerchantMoney(freeBal, curr)}</strong> وسعة المبيعات الآمنة حالياً <strong>${fmtMerchantMoney(0, curr)}</strong> حتى الشحن أو تغطية الرصيد.`
            : `🛡️ <strong>سعة التغطية المتاحة:</strong> الرصيد المتاح يكفي لتمرير مبيعات لأعضاء سويًا حتى <strong>${fmtMerchantMoney(safetyCap, curr)}</strong>.`;
    }
    const dedBadge = document.getElementById('liveDedRateBadge');
    if (dedBadge) dedBadge.textContent = `نسبة العمولة التعاقدية: ${pct.toFixed(1)}% معتمدة`;

    const freePct = Number(p.free_pct ?? p.free_balance_pct ?? 100);
    const activeZone = p.zone_status || (p.is_isolated ? 'ISOLATED' : 'GREEN');
    const ladderTag = document.getElementById('finD15LadderZoneTag');
    if (ladderTag) {
        const zLbl = {
            GREEN: `🟢 المنطقة الخضراء (${freePct.toFixed(1)}%)`,
            YELLOW: `🟡 إنذار شحن مبكر (${freePct.toFixed(1)}%)`,
            RED: `🟠 إنذار حرج (${freePct.toFixed(1)}%)`,
            ISOLATED: `🔴 متوقف مؤقتاً لحين الشحن (${freePct.toFixed(1)}%)`
        };
        ladderTag.textContent = zLbl[activeZone] || `${activeZone} (${freePct.toFixed(1)}%)`;
    }

    const pendTopupsHost = document.getElementById('finPendingTopupsHost');
    const proofStatuses = Array.isArray(merchantBundle?.topup_proof_statuses) ? merchantBundle.topup_proof_statuses : [];
    const pendTopups = Array.isArray(merchantBundle?.pending_topup_requests) ? merchantBundle.pending_topup_requests : [];
    const _tpStatusMeta = (st) => {
        if (st === 'approved') return { label: '🟢 تم', bg: '#dcfce7', color: '#047857', border: '#4ade80', cardBg: '#f0fdf4', cardBorder: '#86efac' };
        if (st === 'rejected') return { label: '🔴 مرفوض', bg: '#fee2e2', color: '#b91c1c', border: '#f87171', cardBg: '#fef2f2', cardBorder: '#fca5a5' };
        if (st === 'under_review') return { label: '🟠 قيد المراجعة', bg: '#ffedd5', color: '#c2410c', border: '#fb923c', cardBg: '#fff7ed', cardBorder: '#fdba74' };
        return { label: '⚪ بانتظار الإدارة', bg: '#ffffff', color: '#334155', border: '#cbd5e1', cardBg: '#fffbeb', cardBorder: '#fde68a' };
    };
    const _helpTopupBtn = (window.svHelpBtn && typeof window.svHelpBtn === 'function') ? window.svHelpBtn('topup_proof_status') : '';
    const _waFollowUrl = `https://wa.me/905376744337?text=${encodeURIComponent('مرحباً، أتابع طلب شحن رصيد متجر ' + (p.business_name || '') + ' (' + (p.merchant_code || '') + ')')}`;
    const _renderProofCard = (tp, idPrefix) => {
        const meta = _tpStatusMeta(tp.review_status);
        const noteText = String(tp.admin_note || '').trim();
        const noteBox = noteText ? `
            <div style="margin-top:6px;padding:7px 10px;border-radius:8px;font-size:0.79rem;font-weight:700;background:${tp.review_status === 'rejected' ? '#fef2f2;color:#991b1b;border:1px solid #fecaca;' : (tp.review_status === 'under_review' ? '#fff7ed;color:#9a3412;border:1px solid #fed7aa;' : '#f0fdf4;color:#065f46;border:1px solid #bbf7d0;')}">
                ${tp.review_status === 'rejected' ? '🔴 سبب الرفض من الإدارة: ' : (tp.review_status === 'under_review' ? '🟠 رد وملاحظة الإدارة: ' : '🟢 ملاحظة الإدارة: ')}${escM(noteText)}
            </div>
        ` : '';
        return `
            <div id="${idPrefix}${escM(tp.id)}" data-proof-id="${escM(tp.id)}" data-bank-ref="${escM(tp.bank_ref || '')}" style="background:#ffffff;border:1.5px solid ${meta.cardBorder};border-radius:10px;padding:10px 12px;font-size:0.84rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                    <div>
                        <strong style="color:#0f172a;">+${fmtMerchantMoney(tp.amount_local ?? tp.amount, curr)}</strong>
                        <span style="color:#64748b;margin:0 6px;">•</span>
                        <span>مرجع التحويل: <code dir="ltr">${escM(tp.bank_ref || tp.payment_ref || '—')}</code></span>
                        ${tp.receipt_note ? `<div style="font-size:0.76rem;color:#475569;margin-top:2px;">${escM(tp.receipt_note)}</div>` : ''}
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:0.75rem;color:#64748b;">${tp.created_at ? new Date(tp.created_at).toLocaleString('ar-EG') : ''}</span>
                        <span style="background:${meta.bg};color:${meta.color};border:1.5px solid ${meta.border};padding:3px 10px;border-radius:999px;font-size:0.75rem;font-weight:800;white-space:nowrap;">${meta.label}</span>
                    </div>
                </div>
                ${noteBox}
            </div>
        `;
    };
    if (pendTopupsHost) {
        const activeOrRejected = proofStatuses.filter(tp => tp.review_status === 'pending' || tp.review_status === 'under_review' || tp.review_status === 'rejected').slice(0, 6);
        if (activeOrRejected.length > 0) {
            pendTopupsHost.innerHTML = `
                <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:14px;padding:14px 16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                        <strong style="color:#0f172a;font-size:0.95rem;display:flex;align-items:center;gap:6px;">🏦 متابعة طلبات الشحن البنكي (${activeOrRejected.length})${_helpTopupBtn}</strong>
                        <a href="${_waFollowUrl}" target="_blank" rel="noopener" style="background:#16a34a;color:#fff;padding:5px 12px;border-radius:8px;font-size:0.78rem;font-weight:800;text-decoration:none;">💬 تواصل مع الإدارة عبر واتساب</a>
                    </div>
                    <div style="display:grid;gap:8px;">
                        ${activeOrRejected.map(tp => _renderProofCard(tp, 'merTopupActive_')).join('')}
                    </div>
                </div>
            `;
        } else if (pendTopups.length > 0) {
            pendTopupsHost.innerHTML = `
                <div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px 16px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                        <strong style="color:#92400e;font-size:0.96rem;">🏦 طلبات شحن رصيد بانتظار الإدارة (${pendTopups.length})${_helpTopupBtn}</strong>
                        <a href="${_waFollowUrl}" target="_blank" rel="noopener" style="background:#16a34a;color:#fff;padding:5px 12px;border-radius:8px;font-size:0.78rem;font-weight:800;text-decoration:none;">💬 متابعة عبر واتساب الدعم</a>
                    </div>
                    <div style="display:grid;gap:8px;">
                        ${pendTopups.map(pr => _renderProofCard({ ...pr, review_status: 'pending', amount_local: pr.amount, bank_ref: pr.payment_ref }, 'merTopupActive_')).join('')}
                    </div>
                </div>
            `;
        } else {
            pendTopupsHost.innerHTML = '';
        }
    }
    const proofTab2Box = document.getElementById('merchantTopupProofStatusBox');
    if (proofTab2Box) {
        if (proofStatuses.length === 0) {
            proofTab2Box.innerHTML = '';
        } else {
            proofTab2Box.innerHTML = `
                <div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:12px 14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                        <strong style="color:#0f172a;font-size:0.9rem;display:flex;align-items:center;gap:6px;">📋 سجل إشعارات الشحن وردود الإدارة (${proofStatuses.length})${_helpTopupBtn}</strong>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;font-size:0.72rem;font-weight:800;color:#475569;">
                            <span>⚪ بانتظار الإدارة</span><span>•</span><span>🟠 قيد المراجعة</span><span>•</span><span>🟢 تم</span><span>•</span><span>🔴 مرفوض</span>
                        </div>
                    </div>
                    <div style="display:grid;gap:8px;">
                        ${proofStatuses.map(tp => _renderProofCard(tp, 'merTopupProof_')).join('')}
                    </div>
                </div>
            `;
        }
    }
    ['GREEN', 'YELLOW', 'RED', 'ISOLATED'].forEach(z => {
        const card = document.getElementById('d15Tier' + z);
        if (card) {
            card.style.boxShadow = z === activeZone ? '0 0 0 2.5px #0f172a' : 'none';
            card.style.opacity = z === activeZone ? '1' : '0.68';
        }
    });

    const txs = merchantBundle?.completed_transactions || [];
    const completedOnlyTxs = txs.filter(t => t.status === 'completed');
    const topups = merchantBundle?.topup_history || [];
    const taxInvs = merchantBundle?.b2b_tax_invoices || [];

    const grossTotal = completedOnlyTxs.reduce((s, t) => s + Number(t.total_amount || 0), 0);
    const commTotal = completedOnlyTxs.reduce((s, t) => s + Number(t.commission_amount || 0), 0);
    const netTotal = grossTotal - commTotal;

    const gmvEl = document.getElementById('finGrossGmvCard');
    const commEl = document.getElementById('finCommDedCard');
    const netEl = document.getElementById('finNetSalesCard');
    const commLbl = document.getElementById('finCommRateLbl');
    const netLbl = document.getElementById('finNetRateLbl');
    if (gmvEl) gmvEl.textContent = fmtMerchantMoney(grossTotal, curr);
    if (commEl) commEl.textContent = `-${fmtMerchantMoney(commTotal, curr)}`;
    if (netEl) netEl.textContent = fmtMerchantMoney(netTotal, curr);
    if (commLbl) commLbl.textContent = `عمولات سويًا (${pct.toFixed(1)}%)`;
    if (netLbl) netLbl.textContent = `صافي مبيعات المتجر (${(100 - pct).toFixed(1)}%)`;

    const tab1Body = document.querySelector('#finTabContent1 tbody');
    if (tab1Body) {
        tab1Body.innerHTML = txs.length === 0
            ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#64748b;">لا توجد استقطاعات شحن مسجلة بعد.</td></tr>`
            : txs.map(t => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td data-label="التاريخ والوقت" style="padding:10px 12px;color:#64748b;">${new Date(t.created_at).toLocaleString('ar-EG')}</td>
                    <td data-label="رقم العملية" style="padding:10px 12px;font-weight:800;font-family:monospace;">${escM(t.sw_short_code)}</td>
                    <td data-label="العضو المشتري" style="padding:10px 12px;font-weight:700;">${escM(t.member_masked_name)}</td>
                    <td data-label="قيمة الفاتورة" style="padding:10px 12px;font-weight:800;">${fmtMerchantMoney(t.total_amount, t.currency_code || curr)}</td>
                    <td data-label="العمولة التعاقدية" style="padding:10px 12px;color:#dc2626;font-weight:800;">-${fmtMerchantMoney(t.commission_amount, t.currency_code || curr)}</td>
                    <td data-label="الحالة" style="padding:10px 12px;color:${t.status === 'completed' ? '#059669' : '#64748b'};font-weight:900;">${escM(t.status)}</td>
                </tr>
            `).join('');
    }

    const tab2Body = document.querySelector('#finTabContent2 tbody');
    if (tab2Body) {
        tab2Body.innerHTML = topups.length === 0
            ? `<tr><td colspan="7" style="padding:16px;text-align:center;color:#64748b;">لا توجد حركات شحن إضافية مسجلة في دفتر اليومية بعد.</td></tr>`
            : topups.map(tp => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td data-label="تاريخ الشحن" style="padding:10px 12px;color:#64748b;">${new Date(tp.posted_at).toLocaleString('ar-EG')}</td>
                    <td data-label="رقم القيد" style="padding:10px 12px;font-weight:800;font-family:monospace;">#JE-${tp.entry_number}</td>
                    <td data-label="المبلغ المشحون" style="padding:10px 12px;color:#059669;font-weight:900;">+${fmtMerchantMoney(tp.amount_local, tp.currency_code || curr)}</td>
                    <td data-label="البيان والمرجع" style="padding:10px 12px;">${escM(tp.description)}</td>
                    <td data-label="ملاحظات" style="padding:10px 12px;">—</td>
                    <td data-label="التوجيه المحاسبي" style="padding:10px 12px;font-weight:800;color:#047857;">مقيد برصيد الشحن</td>
                    <td data-label="الحالة" style="padding:10px 12px;">✅ موثق</td>
                </tr>
            `).join('');
    }

    const tab3Div = document.getElementById('finTabContent3');
    if (tab3Div) {
        tab3Div.innerHTML = `
            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:16px;overflow-x:auto;">
                <h3 style="margin:0 0 10px;color:#0f172a;">🧾 الفواتير الضريبية والتسويات الصادرة تلقائياً (${taxInvs.length})</h3>
                ${taxInvs.length === 0 ? '<p style="color:#64748b;">تُصدر الفواتير الضريبية تلقائياً مع كل عملية مكتملة.</p>' : `
                    <table class="data-table" style="width:100%;border-collapse:collapse;text-align:right;font-size:0.84rem;">
                        <thead><tr style="background:#f8fafc;border-bottom:1.5px solid #cbd5e1;">
                            <th style="padding:10px;">رقم الفاتورة الضريبية</th>
                            <th style="padding:10px;">صافي العمولة</th>
                            <th style="padding:10px;">ضريبة VAT</th>
                            <th style="padding:10px;">الإجمالي</th>
                            <th style="padding:10px;">تاريخ الإصدار</th>
                        </tr></thead>
                        <tbody>
                            ${taxInvs.map(inv => `
                                <tr style="border-bottom:1px solid #f1f5f9;">
                                    <td data-label="رقم الفاتورة الضريبية" style="padding:10px;font-family:monospace;font-weight:800;">${escM(inv.invoice_number)}</td>
                                    <td data-label="صافي العمولة" style="padding:10px;">${fmtMerchantMoney(inv.net_commission_amount, inv.currency_code)}</td>
                                    <td data-label="ضريبة VAT" style="padding:10px;">${fmtMerchantMoney(inv.vat_amount, inv.currency_code)}</td>
                                    <td data-label="الإجمالي" style="padding:10px;font-weight:800;">${fmtMerchantMoney(inv.gross_invoice_total, inv.currency_code)}</td>
                                    <td data-label="تاريخ الإصدار" style="padding:10px;color:#64748b;">${new Date(inv.issued_at).toLocaleString('ar-EG')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        `;
    }
};

function getCountryTopupOptions(countryCode) {
    const cc = String(countryCode || 'EG').toUpperCase();
    if (cc === 'TR') {
        return [
            { value: 'iban_fast_tr', label: '🏦 تحويل بنكي سريع (FAST / IBAN)' },
            { value: 'bank_transfer', label: '🏢 إيداع / حوالة بنكية مباشرة' }
        ];
    }
    if (cc === 'SA') {
        return [
            { value: 'iban_sar', label: '🏦 تحويل بنكي سريع (IBAN)' },
            { value: 'stc_pay', label: '⚡ تحويل فوري (STC Pay)' }
        ];
    }
    if (cc === 'EG') {
        return [
            { value: 'instapay', label: '⚡ إنستاباي / تحويل فوري' },
            { value: 'bank_transfer', label: '🏦 إيداع أو حوالة بنكية' }
        ];
    }
    return [
        { value: 'bank_transfer', label: '🏦 تحويل بنكي (IBAN / SWIFT)' }
    ];
}

function openMerchantTopupModal() {
    const p = merchantBundle?.profile || merchantData || {};
    const curr = p.currency_code || 'EGP';
    const cc = p.country_code || 'EG';
    const opts = getCountryTopupOptions(cc);
    const pendTopups = Array.isArray(merchantBundle?.pending_topup_requests)
        ? merchantBundle.pending_topup_requests
        : (Array.isArray(merchantBundle?.pending_topups) ? merchantBundle.pending_topups : []);
    const requireProof = Boolean(merchantBundle?.verification_settings?.require_topup_proof);
    const waText = encodeURIComponent(`مرحباً فريق مالية SAWYAN، أحتاج بيانات الحساب البنكي الرسمي لشحن رصيد متجر: ${p.business_name || ''} (${p.merchant_code || ''}) بعملة ${curr}.`);

    let ov = document.getElementById('svMerchantTopupOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'svMerchantTopupOverlay';
        ov.style.cssText = 'position:fixed;inset:0;z-index:10060;background:rgba(15,23,42,0.68);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:14px;overflow-y:auto;';
        document.body.appendChild(ov);
    }
    ov.style.display = 'flex';
    window._svTopupModalReceiptData = null;

    const existingPendingNotice = pendTopups.length > 0
        ? `<div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:0.8rem;color:#92400e;line-height:1.55;">
               <strong>⏳ تنبيه: لديك ${pendTopups.length} طلب شحن مفتوح قيد المراجعة حالياً</strong> — لا تُرسل نفس التحويل مرتين؛ أرسل طلباً جديداً فقط إذا قمت بتحويل إضافي جديد.
           </div>`
        : '';

    const step2Text = requireProof
        ? 'أدخل المبلغ الفعلي المحوّل + رقم مرجع الحوالة أو صورة الإيصال أدناه لتوثيق الشحن.'
        : 'أدخل المبلغ الذي حوّلته واضغط إرسال لإشعار المالية (رقم المرجع وصورة الإيصال اختياريان مؤقتاً، وستضيف المالية رصيدك فور مراجعة التحويل).';
    const refLabel = requireProof
        ? '🔢 رقم مرجع الحوالة البنكية (مطلوب ما لم تُرفق صورة الإيصال)'
        : '🔢 رقم مرجع الحوالة البنكية (اختياري مؤقتاً)';
    const refPlaceholder = requireProof
        ? 'أدخل رقم المرجع من إيصال البنك (مثال: FAST-982341)'
        : 'اختياري — اتركه فارغاً أو أدخل رقم الحوالة إن وُجد';
    const submitLabel = requireProof
        ? '📤 إرسال طلب الشحن والإيصال للمالية'
        : '📤 إشعار المالية بشحن الرصيد';

    ov.innerHTML = `
        <div style="background:#ffffff;border-radius:18px;max-width:520px;width:100%;max-height:92vh;overflow-y:auto;padding:22px;font-family:'Tajawal',sans-serif;direction:rtl;box-shadow:0 24px 55px rgba(15,23,42,0.34);">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #e2e8f0;padding-bottom:10px;margin-bottom:14px;">
                <h3 style="margin:0;font-size:1.1rem;font-weight:900;color:#0f172a;">💳 شحن رصيد المتجر (${escM(p.business_name || '')})</h3>
                <button type="button" onclick="document.getElementById('svMerchantTopupOverlay').style.display='none'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:8px;font-size:1.1rem;cursor:pointer;font-weight:900;">✕</button>
            </div>

            ${existingPendingNotice}

            <div style="background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:0.84rem;color:#064e3b;line-height:1.65;">
                <strong>📋 خطوات شحن الرصيد بسهولة:</strong>
                <ol style="margin:6px 18px 8px 0;padding:0;">
                    <li>حوّل المبلغ المطلوب لحساب SAWYAN البنكي المعتمد لدولتك (<span dir="ltr">${escM(cc)} — ${escM(curr)}</span>).</li>
                    <li>${step2Text}</li>
                </ol>
                <a href="https://wa.me/905376744337?text=${waText}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;background:#16a34a;color:#fff;padding:7px 14px;border-radius:8px;text-decoration:none;font-weight:800;font-size:0.82rem;">💬 اطلب بيانات الحساب البنكي عبر واتساب (<span dir="ltr">+905376744337</span>)</a>
            </div>

            <form id="svMerchantTopupForm" style="display:grid;gap:12px;" novalidate>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:10px;">
                    <div>
                        <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">💰 مبلغ الشحن (${escM(curr)}) *</label>
                        <input id="svTopupAmtInput" type="number" step="any" min="0.01" inputmode="decimal" required value="" placeholder="مثال: 2000" class="form-control" dir="ltr">
                    </div>
                    <div>
                        <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">🏦 وسيلة التحويل *</label>
                        <select id="svTopupProviderSelect" class="form-control">
                            ${opts.map(o => `<option value="${escM(o.value)}">${escM(o.label)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div>
                    <label id="svTopupRefLabel" style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">${refLabel}</label>
                    <input id="svTopupRefInput" type="text" value="" placeholder="${refPlaceholder}" class="form-control" dir="ltr">
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;display:block;margin-bottom:4px;">📝 اسم البنك المحوّل منه / ملاحظات (اختياري)</label>
                    <input id="svTopupNoteInput" type="text" placeholder="مثال: تحويل من بنك زراعات / البنك الأهلي" class="form-control">
                </div>
                <div id="svTopupModalUploader"></div>
                <button type="submit" id="svTopupSubmitBtn" class="btn btn-primary btn-block" style="padding:12px;font-size:0.96rem;">${submitLabel}</button>
            </form>
        </div>
    `;

    if (window.SAWYAN && window.SAWYAN.ImageUpload) {
        window.SAWYAN.ImageUpload.mountUploader(document.getElementById('svTopupModalUploader'), {
            label: requireProof
                ? '🧾 صورة إيصال التحويل البنكي (مطلوبة إن لم تدخل رقم المرجع)'
                : '🧾 صورة إيصال التحويل البنكي (اختياري مؤقتاً — يُسرّع المطابقة إن وُجد)',
            maxDim: 1280,
            maxChars: 360000,
            onChange: (v) => { window._svTopupModalReceiptData = v || null; }
        });
    }

    document.getElementById('svMerchantTopupForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('svTopupSubmitBtn');
        const rawAmt = String(document.getElementById('svTopupAmtInput')?.value || '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).trim();
        const amt = parseFloat(rawAmt || '0');
        const provider = document.getElementById('svTopupProviderSelect')?.value || 'bank_transfer';
        const ref = (document.getElementById('svTopupRefInput')?.value || '').trim();
        const note = (document.getElementById('svTopupNoteInput')?.value || '').trim();
        const hasReceipt = Boolean(window._svTopupModalReceiptData);
        if (!Number.isFinite(amt) || amt <= 0) {
            swNotify('يرجى إدخال مبلغ شحن صحيح أكبر من صفر (مثال: 500 أو 2000).', 'warning');
            return;
        }
        if (requireProof && ref.length < 3 && !hasReceipt) {
            swNotify('يرجى إدخال رقم مرجع الحوالة البنكية (3 أحرف على الأقل) أو رفع صورة إيصال التحويل لتوثيق الطلب.', 'warning');
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري تسجيل إشعار الشحن...'; }
        try {
            const res = await window.SAWYAN.API.merchantInitiateTopup({
                merchantId: currentMerchant.id,
                amount: amt,
                provider,
                paymentRef: ref || null,
                receiptImageData: window._svTopupModalReceiptData || null,
                receiptNote: note || null
            });
            window._svTopupModalReceiptData = null;
            ov.style.display = 'none';
            const amtFormatted = `\u200E${Number(amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}\u200E`;
            if (res.mode === 'demo_instant_fifo') {
                await swAlertBox(
                    'تم شحن الرصيد بنجاح (البيئة التجريبية)',
                    `تمت إضافة ${amtFormatted} لرصيد متجرك وتفعيل ${res.topup_result?.released_fifo_count || 0} فاتورة كانت بانتظار الشحن.`,
                    'success'
                );
            } else {
                await swAlertBox(
                    'تم استلام إشعار الشحن بنجاح',
                    `رقم المتابعة: \u200E${res.payment_ref}\u200E\nالمبلغ: ${amtFormatted}\n\nسيقوم فريق المالية بمراجعة التحويل وإضافة الرصيد لحساب متجرك فور المطابقة، ويمكنك متابعة حالة الطلب من تبويب «الشحن / الموقف المالي».`,
                    'success'
                );
            }
            await loadStats();
            await loadFinancialReport();
        } catch (err) {
            swNotify('تعذر تسجيل طلب الشحن: ' + formatMerchantErrorMessage(err), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = submitLabel; }
        }
    };
}
window.openMerchantTopupModal = openMerchantTopupModal;

promptTopupBalance = async function () {
    openMerchantTopupModal();
};

// شاشة الإعدادات الشاملة + استكمال الحقول المرحّلة + موظفو الكاشير + Wi-Fi + Geo-Picker
let _merchantSettingsGeoPicker = null;
let _merchantSettingsCascade = null;

async function loadSettings() {
    const page = document.getElementById('settingsPage');
    if (!page) return;
    await refreshMerchantBundle();
    const p = merchantBundle?.profile || merchantData || {};
    const cashiers = merchantBundle?.cashiers || [];
    const branches = merchantBundle?.branches || [];
    const kDocs = p.kyc_docs || {};
    const social = p.social || {};
    const eng = window.SAWYAN && window.SAWYAN.RegEngine;

    let merchCfg = { fields: [] };
    let cashierCfg = { fields: [] };
    if (eng) {
        try {
            merchCfg = await eng.loadFormConfig('merchant', false);
            cashierCfg = await eng.loadFormConfig('employee_cashier', false);
        } catch (_e) {}
    }

    const mFieldMap = {};
    (merchCfg.fields || []).forEach(f => { mFieldMap[f.field_key] = f; });
    const cFieldMap = {};
    (cashierCfg.fields || []).forEach(f => { cFieldMap[f.field_key] = f; });

    function mLbl(key, defText) {
        const f = mFieldMap[key];
        const t = (f && f.label_ar) ? f.label_ar : defText;
        const req = f && f.required_in_dashboard ? ' <span style="color:#DC2626;font-weight:900;">*</span>' : '';
        return escM(t) + req;
    }
    function mHlp(key, defHelp) {
        const f = mFieldMap[key];
        const t = (f && f.help_text_ar) ? f.help_text_ar : (defHelp || '');
        return t ? `<small style="display:block;color:#64748b;font-size:0.75rem;margin-top:2px;">${escM(t)}</small>` : '';
    }
    function cMeta(key, defLbl, defPh, defHlp, defShow, defReq) {
        const f = cFieldMap[key] || {};
        return {
            label: f.label_ar || defLbl,
            placeholder: f.placeholder_ar || defPh || '',
            help: f.help_text_ar || defHlp || '',
            show: f.show_in_dashboard !== undefined ? Boolean(f.show_in_dashboard) : defShow,
            req: f.required_in_dashboard !== undefined ? Boolean(f.required_in_dashboard) : defReq
        };
    }

    const whObj = (p.working_hours && typeof p.working_hours === 'object') ? p.working_hours : {};
    const daysDef = [
        ['sat', 'السبت'], ['sun', 'الأحد'], ['mon', 'الإثنين'], ['tue', 'الثلاثاء'],
        ['wed', 'الأربعاء'], ['thu', 'الخميس'], ['fri', 'الجمعة']
    ];
    const whRowsHtml = daysDef.map(([dk, dAr]) => {
        const dVal = whObj[dk] || { enabled: true, open: '09:00', close: '23:00' };
        return `
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
                <label style="display:flex;align-items:center;gap:6px;min-width:95px;font-weight:700;font-size:0.82rem;">
                    <input type="checkbox" class="wh-day-enabled" data-day="${dk}" ${dVal.enabled !== false ? 'checked' : ''}>
                    ${dAr}
                </label>
                <input type="time" class="form-control wh-day-open" data-day="${dk}" value="${escM(dVal.open || '09:00')}" style="width:125px;padding:5px 8px;">
                <span style="font-size:0.8rem;color:#64748b;">إلى</span>
                <input type="time" class="form-control wh-day-close" data-day="${dk}" value="${escM(dVal.close || '23:00')}" style="width:125px;padding:5px 8px;">
            </div>
        `;
    }).join('');

    const cmCode = cMeta('employee_code', 'كود الموظف', 'تلقائي مثل EMP-02 إذا تُرك فارغاً', '', true, false);
    const cmName = cMeta('full_name', 'اسم موظف الكاشير الكامل', 'الاسم الكامل للموظف', '', true, true);
    const cmPin  = cMeta('cashier_pin', 'رمز PIN السري الخاص بالموظف (4 أرقام)', '4 أرقام مثل 2580', '', true, true);
    const cmBr   = cMeta('branch_id', 'الفرع التابع له الموظف', '', '', true, true);
    const cmPh   = cMeta('employee_phone', 'رقم هاتف الموظف', 'رقم الهاتف', '', true, false);
    const cmMem  = cMeta('linked_member_code', 'كود عضويته في SAWYAN (إن وجد)', 'اختياري لمنع التواطؤ', '', true, false);
    const cmLim  = cMeta('max_tx_amount_limit', 'سقف الفاتورة المباشرة', 'فارغ = بلا سقف', '', true, false);
    const cmNot  = cMeta('notify_owner_realtime', 'إشعار فوري لصاحب المحل مع كل فاتورة', '', '', true, false);

    const activeMerTab = window.__merchantSettingsTab || 'profile';

    page.innerHTML = `
        <div style="margin-bottom:14px;">
            <h2 style="margin:0;font-size:1.3rem;font-weight:900;color:#0f172a;">⚙️ إعدادات المتجر، الفروع وموظفي الكاشير</h2>
            <p style="margin:4px 0 0;font-size:0.84rem;color:#64748b;">إدارة هوية المتجر، الموقع على خرائط جوجل، الصور والوثائق، موظفي الكاشير، والفروع والدعم</p>
        </div>

        <div class="merchant-settings-tabs" role="tablist">
            <button type="button" class="merchant-settings-tab-btn ${activeMerTab === 'profile' ? 'active' : ''}" data-mer-tab="profile" onclick="switchMerchantSettingsTab('profile')">🏪 البيانات والواي فاي</button>
            <button type="button" class="merchant-settings-tab-btn ${activeMerTab === 'location' ? 'active' : ''}" data-mer-tab="location" onclick="switchMerchantSettingsTab('location')">📍 الموقع والمواعيد</button>
            <button type="button" class="merchant-settings-tab-btn ${activeMerTab === 'media' ? 'active' : ''}" data-mer-tab="media" onclick="switchMerchantSettingsTab('media')">🖼️ الصور والوثائق</button>
            <button type="button" class="merchant-settings-tab-btn ${activeMerTab === 'employees' ? 'active' : ''}" data-mer-tab="employees" onclick="switchMerchantSettingsTab('employees')">👨‍💼 الموظفون (${cashiers.length})</button>
            <button type="button" class="merchant-settings-tab-btn ${activeMerTab === 'advanced' ? 'active' : ''}" data-mer-tab="advanced" onclick="switchMerchantSettingsTab('advanced')">🏢 الفروع والمرتجع والدعم</button>
        </div>

        <div style="display:grid;gap:16px;">
            <div class="merchant-settings-pane" data-mer-pane="profile" style="display:${activeMerTab === 'profile' ? 'block' : 'none'};background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 12px;color:#0f172a;">🏪 البيانات الأساسية والتعاقدية للمنشأة</h3>
                <div style="display:grid;gap:10px;">
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">${mLbl('business_name', 'اسم النشاط التجاري')}</label>
                        <input type="text" id="settingsBusinessName" class="form-control" value="${escM(p.business_name || '')}">
                        ${mHlp('business_name')}
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('owner_name', 'اسم المالك الكامل')}</label>
                            <input type="text" id="settingsOwnerName" class="form-control" value="${escM(p.owner_name || '')}">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('email', 'البريد الإلكتروني')}</label>
                            <input type="email" id="settingsEmail" dir="ltr" class="form-control" value="${escM(p.email || '')}">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('phone', 'هاتف التواصل')}</label>
                            <input type="text" id="settingsPhone" dir="ltr" class="form-control" value="${escM(p.phone || '')}">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('whatsapp', 'رقم واتساب للعملاء')}</label>
                            <input type="text" id="settingsWhatsapp" dir="ltr" class="form-control" value="${escM(p.whatsapp || '')}" placeholder="مثال: +201012345678">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('merchant_type', 'نوع النشاط التجاري')}</label>
                            <select id="settingsMerchantType" class="form-control">
                                <option value="physical" ${p.merchant_type === 'physical' ? 'selected' : ''}>فيزيائي (محل على الأرض)</option>
                                <option value="online" ${p.merchant_type === 'online' ? 'selected' : ''}>متجر إلكتروني (أونلاين)</option>
                                <option value="both" ${p.merchant_type === 'both' ? 'selected' : ''}>محل على الأرض + أونلاين</option>
                            </select>
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('business_category', 'فئة النشاط التجاري')}</label>
                            <select id="settingsCategory" class="form-control">
                                <option value="${escM(p.category || 'supermarket')}">${escM(p.category || 'supermarket')}</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">${mLbl('business_description', 'وصف مختصر عن النشاط')}</label>
                        <textarea id="settingsDescription" rows="2" class="form-control" placeholder="اذكر أبرز منتجاتك أو خدماتك...">${escM(p.description || '')}</textarea>
                        ${mHlp('business_description')}
                    </div>

                    ${p.commission_locked ? `
                        <div style="background:#f0fdf4;border:1.5px solid #10b981;border-radius:10px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:0.84rem;font-weight:800;color:#065f46;">🔒 نسبة المساهمة المعتمدة والموثّقة تعاقدياً:</span>
                            <strong style="font-size:1.1rem;color:#047857;">${Number(p.deduction_percent || 0).toFixed(2)}%</strong>
                        </div>
                    ` : `
                        <div style="background:${p.commission_pending ? '#fef2f2' : '#fffbeb'};border:1.5px solid ${p.commission_pending ? '#ef4444' : '#f59e0b'};border-radius:12px;padding:12px;">
                            <label style="font-size:0.84rem;font-weight:800;color:${p.commission_pending ? '#991b1b' : '#92400e'};display:block;margin-bottom:6px;">
                                ${mLbl('commission_percent', 'كم أقصى نسبة تستطيع ردّها لسويًا كلما اشترى أعضاؤها منك؟ (%)')}
                            </label>
                            <input type="number" id="settingsDeductionPercent" class="form-control" min="0.5" max="95" step="0.5" dir="ltr"
                                value="${p.deduction_percent > 0 ? Number(p.deduction_percent) : ''}" placeholder="مثال: 10">
                            ${mHlp('commission_percent', 'أقصى نسبة من المبيعات تستطيع استقطاعها لسويًا نظير حشد آلاف المشترين نحو مشروعك')}
                        </div>
                    `}

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">شبكة Wi-Fi للزبائن (SSID)</label>
                            <input type="text" id="settingsWifiSSID" class="form-control" value="${escM(p.wifi_ssid || '')}">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">كلمة مرور Wi-Fi</label>
                            <input type="text" id="settingsWifiPassword" class="form-control" value="${escM(p.wifi_password || '')}">
                        </div>
                    </div>

                    <button type="button" onclick="saveFullMerchantProfileAndWifi()" class="btn btn-primary">💾 حفظ البيانات الأساسية والتعاقدية والموقع</button>
                </div>
            </div>

            <div class="merchant-settings-pane" data-mer-pane="location" style="display:${activeMerTab === 'location' ? 'block' : 'none'};background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 12px;color:#0f172a;">📍 الموقع على خرائط جوجل، الروابط ومواعيد العمل</h3>
                <div style="display:grid;gap:10px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('city', 'المدينة / المحافظة')}</label>
                            <select id="settingsCountryCode" class="form-control" style="display:none;"><option value="${escM(p.country_code || 'EG')}">${escM(p.country_code || 'EG')}</option></select>
                            <input type="text" id="settingsCitySearch" class="form-control" placeholder="ابحث لتصفية المدن..." style="margin-bottom:5px;">
                            <select id="settingsCitySelect" class="form-control"></select>
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('district', 'الحي / المنطقة')}</label>
                            <select id="settingsDistrictSelect" class="form-control"></select>
                            <input type="text" id="settingsDistrictManual" class="form-control" value="${escM(p.district || '')}" placeholder="اكتب اسم الحي يدوياً..." style="display:none;margin-top:5px;">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">${mLbl('address', 'العنوان التفصيلي')}</label>
                        <input type="text" id="settingsAddress" class="form-control" value="${escM(p.address || '')}">
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">${mLbl('geo_location', 'الموقع الدقيق على خرائط جوجل (اللاقط التلقائي)')}</label>
                        <div id="merchantSettingsGeoPickerHost"></div>
                        <input type="hidden" id="settingsLat" value="${escM(p.latitude ?? '')}">
                        <input type="hidden" id="settingsLng" value="${escM(p.longitude ?? '')}">
                        <input type="hidden" id="settingsMapsUrl" value="${escM(p.google_maps_url || '')}">
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('website_url', 'الموقع / المتجر الإلكتروني')}</label>
                            <input type="url" id="settingsWebsiteUrl" dir="ltr" class="form-control" value="${escM(p.website_url || '')}" placeholder="https://yourstore.com">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('webhook_url', 'رابط الربط التقني (Webhook)')}</label>
                            <input type="url" id="settingsWebhookUrl" dir="ltr" class="form-control" value="${escM(p.webhook_url || '')}" placeholder="https://yourstore.com/webhook">
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr));gap:8px;">
                        <input type="url" id="settingsFbUrl" dir="ltr" class="form-control" value="${escM(social.facebook || '')}" placeholder="رابط فيسبوك">
                        <input type="url" id="settingsIgUrl" dir="ltr" class="form-control" value="${escM(social.instagram || '')}" placeholder="رابط إنستغرام">
                        <input type="url" id="settingsTtUrl" dir="ltr" class="form-control" value="${escM(social.tiktok || '')}" placeholder="رابط تيك توك">
                    </div>

                    <div style="border-top:1px solid #e2e8f0;padding-top:10px;margin-top:4px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                            <strong style="font-size:0.86rem;">🕒 مواعيد العمل الأسبوعية</strong>
                            <button type="button" onclick="applySaturdayHoursToAll()" class="btn btn-outline btn-sm">🔁 تعميم موعد السبت على باقي الأيام</button>
                        </div>
                        <div style="display:grid;gap:6px;">${whRowsHtml}</div>
                    </div>

                    <button type="button" onclick="saveFullMerchantProfileAndWifi()" class="btn btn-primary">💾 حفظ الموقع والروابط ومواعيد العمل</button>
                </div>
            </div>

            <div class="merchant-settings-pane" data-mer-pane="media" style="display:${activeMerTab === 'media' ? 'block' : 'none'};background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 12px;color:#0f172a;">🖼️ صور المتجر ووثائق التحقق الرسمية</h3>
                <div style="display:grid;gap:12px;">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,140px),1fr));gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('commercial_reg_no', 'رقم السجل التجاري')}</label>
                            <input type="text" id="settingsCommercialRegNo" class="form-control" value="${escM(p.commercial_reg_no || '')}" placeholder="1010456789">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">${mLbl('tax_id', 'الرقم الضريبي')}</label>
                            <input type="text" id="settingsTaxId" class="form-control" value="${escM(p.tax_id || '')}" placeholder="300-456-789">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">شعار المتجر (Logo)</label>
                        <div id="settingsLogoUploader"></div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">صورة الغلاف / الواجهة (Cover)</label>
                        <div id="settingsCoverUploader"></div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">معرض صور النشاط (حتى 6 صور)</label>
                        <div id="settingsGalleryUploader"></div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">📄 صورة السجل التجاري</label>
                        <div id="settingsCommDocUploader"></div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">🧾 صورة البطاقة الضريبية</label>
                        <div id="settingsTaxDocUploader"></div>
                    </div>
                    <button type="button" onclick="saveMerchantMediaAndDocs()" class="btn btn-primary">💾 حفظ الصور والوثائق في المتجر</button>
                </div>
            </div>

            <div class="merchant-settings-pane" data-mer-pane="employees" style="display:${activeMerTab === 'employees' ? 'block' : 'none'};background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 6px;color:#0f172a;">👨‍💼 موظفو التوثيق المستقلون (دخول معزول من موبايلاتهم الشخصية)</h3>
                <p style="margin:0 0 10px;font-size:0.78rem;color:#64748b;line-height:1.55;">
                    لا تشارك كلمة مرورك مع أي موظف — أضف كل موظف بكود ورمز <strong>PIN مؤقت (4 أرقام)</strong> ليدخل من موبايله الشخصي، وسيُطلب منه تلقائياً تغيير الـ PIN لرمز سري خاص به عند أول دخول.
                </p>
                <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:10px 12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;font-size:0.8rem;">
                    <span style="color:#065f46;font-weight:700;">📱 رابط دخول الموظفين: <code dir="ltr">login.html?tab=employee&amp;store=${escM(p.merchant_code || '')}</code></span>
                    <button type="button" class="btn btn-outline btn-sm" onclick="copyEmployeePortalLink('${escM(p.merchant_code || '')}')">📋 نسخ الرابط للموظفين</button>
                </div>
                <form id="addCashierEmpForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:10px;margin-bottom:14px;background:#f8fafc;padding:12px;border-radius:12px;">
                    ${cmCode.show ? `
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">${escM(cmCode.label)}${cmCode.req ? ' <span style="color:#DC2626;">*</span>' : ''}</label>
                        <input type="text" id="newEmpCode" ${cmCode.req ? 'required' : ''} class="form-control" placeholder="${escM(cmCode.placeholder)}">
                    </div>` : ''}
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">${escM(cmName.label)} <span style="color:#DC2626;">*</span></label>
                        <input type="text" id="newEmpName" required class="form-control" placeholder="${escM(cmName.placeholder)}">
                    </div>
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">رمز PIN مؤقت (4 أرقام — يغيّره الموظف أول دخول) <span style="color:#DC2626;">*</span></label>
                        <input type="password" id="newEmpPin" required maxlength="4" pattern="\\d{4}" dir="ltr" class="form-control" placeholder="${escM(cmPin.placeholder)}">
                    </div>
                    ${cmBr.show ? `
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">${escM(cmBr.label)} <span style="color:#DC2626;">*</span></label>
                        <select id="newEmpBranchId" class="form-control">
                            ${branches.map(b => `<option value="${escM(b.id)}">${escM(b.branch_name || b.branch_code)}${b.is_main_branch ? ' (الرئيسي)' : ''}</option>`).join('')}
                        </select>
                    </div>` : ''}
                    ${cmPh.show ? `
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">${escM(cmPh.label)}${cmPh.req ? ' <span style="color:#DC2626;">*</span>' : ''}</label>
                        <input type="tel" id="newEmpPhone" dir="ltr" ${cmPh.req ? 'required' : ''} class="form-control" placeholder="${escM(cmPh.placeholder)}">
                    </div>` : ''}
                    ${cmMem.show ? `
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">${escM(cmMem.label)}${cmMem.req ? ' <span style="color:#DC2626;">*</span>' : ''}</label>
                        <input type="number" id="newEmpLinkedCode" min="1" dir="ltr" class="form-control" placeholder="${escM(cmMem.placeholder)}">
                    </div>` : ''}
                    ${cmLim.show ? `
                    <div>
                        <label style="font-size:0.76rem;font-weight:700;display:block;margin-bottom:3px;">${escM(cmLim.label)}</label>
                        <input type="number" id="newEmpMaxLimit" min="1" step="0.01" dir="ltr" class="form-control" placeholder="${escM(cmLim.placeholder)}">
                    </div>` : ''}
                    ${cmNot.show ? `
                    <label style="grid-column:1 / -1;display:flex;align-items:center;gap:8px;font-size:0.8rem;font-weight:700;cursor:pointer;">
                        <input type="checkbox" id="newEmpNotifyOwner" checked>
                        <span>${escM(cmNot.label)}</span>
                    </label>` : ''}
                    <button type="submit" class="btn btn-primary btn-sm" style="grid-column:1 / -1;">+ إضافة موظف توثيق بـ PIN مؤقت مشفر</button>
                </form>

                <div style="display:grid;gap:8px;">
                    ${cashiers.length === 0 ? '<p style="color:#64748b;font-size:0.85rem;">لا يوجد موظفو توثيق مضافون بعد.</p>' : cashiers.map(c => `
                        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                            <div>
                                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                    <strong>${escM(c.employee_code)}</strong> — ${escM(c.full_name)}
                                    ${c.must_change_pin
                                        ? '<span style="background:#fef3c7;color:#92400e;font-size:0.7rem;font-weight:800;padding:2px 7px;border-radius:999px;">🔐 بانتظار تعيين PIN سري</span>'
                                        : '<span style="background:#dcfce7;color:#166534;font-size:0.7rem;font-weight:800;padding:2px 7px;border-radius:999px;">✅ PIN سري مفعّل</span>'}
                                    ${c.session_active ? '<span style="background:#dbeafe;color:#1d4ed8;font-size:0.7rem;font-weight:800;padding:2px 7px;border-radius:999px;">🟢 وردية نشطة الآن</span>' : ''}
                                </div>
                                ${c.employee_phone ? `<div style="font-size:0.75rem;color:#475569;margin-top:2px;" dir="ltr">📞 ${escM(c.employee_phone)}</div>` : ''}
                                <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">محاولات PIN الخاطئة: ${c.failed_pin_attempts}/5 ${c.max_tx_amount_limit ? `• سقف ${Number(c.max_tx_amount_limit)}` : ''} ${c.pin_locked_until ? '• 🔒 مقفل مؤقتاً' : ''}</div>
                            </div>
                            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                                <button type="button" class="btn btn-outline btn-sm" onclick="resetCashierEmployeePin('${c.id}', '${escM(c.employee_code)}')">🔑 تصفير PIN</button>
                                <button type="button" class="btn btn-outline btn-sm" onclick="toggleCashierEmployee('${c.id}', ${c.is_active ? 'true' : 'false'}, '${escM(c.full_name)}')">${c.is_active ? 'إيقاف فوري' : 'تفعيل وفك قفل'}</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="merchant-settings-pane" data-mer-pane="advanced" style="display:${activeMerTab === 'advanced' ? 'block' : 'none'};background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 8px;color:#0f172a;">🏢 الفروع، الشحن البنكي، المرتجعات، والدعم الفني</h3>
                <p style="margin:0 0 14px;font-size:0.84rem;color:#64748b;">اختر الأداة المطلوبة لفتحها مباشرة دون مغادرة شاشة الإعدادات:</p>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;">
                    <button type="button" class="btn btn-outline" onclick="if(typeof openMerchantStage7Modal==='function')openMerchantStage7Modal('branches')">🏢 إدارة الفروع (${branches.length})</button>
                    <button type="button" class="btn btn-outline" onclick="if(typeof openMerchantTopupModal==='function')openMerchantTopupModal()">🏦 شحن الرصيد / تحويل بنكي</button>
                    <button type="button" class="btn btn-outline" onclick="if(typeof openMerchantStage7Modal==='function')openMerchantStage7Modal('refund')">↩️ مرتجع فاتورة بـ OTP</button>
                    <button type="button" class="btn btn-outline" onclick="if(typeof openMerchantStage7Modal==='function')openMerchantStage7Modal('support')">🎫 الدعم وتغيير كلمة المرور</button>
                </div>
            </div>
        </div>
    `;

    if (eng) {
        _merchantSettingsGeoPicker = eng.mountGeoPicker(document.getElementById('merchantSettingsGeoPickerHost'), {
            latInput: document.getElementById('settingsLat'),
            lngInput: document.getElementById('settingsLng'),
            mapsUrlInput: document.getElementById('settingsMapsUrl'),
            addressInput: document.getElementById('settingsAddress'),
            initialLat: p.latitude,
            initialLng: p.longitude,
            countryCode: p.country_code || 'EG',
            compact: true
        });

        _merchantSettingsCascade = eng.mountWorldGeoCascade({
            countrySelect: document.getElementById('settingsCountryCode'),
            citySelect: document.getElementById('settingsCitySelect'),
            citySearchInput: document.getElementById('settingsCitySearch'),
            districtSelect: document.getElementById('settingsDistrictSelect'),
            districtManualInput: document.getElementById('settingsDistrictManual'),
            activeOnly: false,
            includeAllCountries: true,
            defaultCountry: p.country_code || 'EG',
            onCityChange: function (cityInfo) {
                if (cityInfo && cityInfo.lat && cityInfo.lng && _merchantSettingsGeoPicker) {
                    _merchantSettingsGeoPicker.setCenterView(cityInfo.lat, cityInfo.lng, 12);
                }
            }
        });
        await _merchantSettingsCascade.init();
        if (p.city_geoname_id || p.district) {
            await _merchantSettingsCascade.setCityAndDistrict(p.city_geoname_id, p.district);
        }
        const cats = _merchantSettingsCascade.getCategories();
        const catSel = document.getElementById('settingsCategory');
        if (catSel && Array.isArray(cats) && cats.length > 0) {
            catSel.innerHTML = '';
            cats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.slug;
                opt.textContent = (c.name_i18n && (c.name_i18n.ar || c.name_i18n.en)) || c.slug;
                catSel.appendChild(opt);
            });
            if (p.category) catSel.value = p.category;
        }
    }

    if (window.SAWYAN && window.SAWYAN.ImageUpload) {
        const up = window.SAWYAN.ImageUpload;
        window._merchantSettingsUploaders = {
            logo: up.mountUploader(document.getElementById('settingsLogoUploader'), {
                label: '🏪 شعار المتجر (Logo)',
                initialValue: p.logo_url || null,
                maxDim: 800,
                maxChars: 240000,
                preserveTransparency: true
            }),
            cover: up.mountUploader(document.getElementById('settingsCoverUploader'), {
                label: '🖼️ صورة الغلاف / الواجهة',
                initialValue: p.cover_image_url || null,
                maxDim: 1280,
                maxChars: 340000
            }),
            gallery: up.mountUploader(document.getElementById('settingsGalleryUploader'), {
                label: '📸 صور إضافية للنشاط (حتى 6 صور)',
                multiple: true,
                maxItems: 6,
                initialValue: Array.isArray(p.images) ? p.images : [],
                maxDim: 1024,
                maxChars: 260000
            }),
            commercialReg: up.mountUploader(document.getElementById('settingsCommDocUploader'), {
                label: '📄 السجل التجاري / الرخصة',
                initialValue: kDocs.commercial_reg || null,
                maxDim: 1400,
                maxChars: 380000
            }),
            taxCard: up.mountUploader(document.getElementById('settingsTaxDocUploader'), {
                label: '🧾 البطاقة الضريبية',
                initialValue: kDocs.tax_card || null,
                maxDim: 1400,
                maxChars: 380000
            })
        };
    }

    document.getElementById('addCashierEmpForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const empPhoneRaw = (document.getElementById('newEmpPhone')?.value || '').trim();
            if (empPhoneRaw && eng) {
                const chk = eng.validatePhoneByCountry(empPhoneRaw, p.country_code || 'EG', false);
                if (!chk.valid) throw new Error(chk.error);
            }
            const empMediaPatch = {
                employee_phone: empPhoneRaw || null,
                notify_owner_realtime: document.getElementById('newEmpNotifyOwner')
                    ? Boolean(document.getElementById('newEmpNotifyOwner').checked)
                    : true
            };
            await window.SAWYAN.API.manageMerchantCashierAndSettings({
                merchantId: currentMerchant.id,
                action: 'add_cashier',
                employeeCode: (document.getElementById('newEmpCode')?.value || '').trim() || null,
                employeeName: document.getElementById('newEmpName').value.trim(),
                employeePin: document.getElementById('newEmpPin').value.trim(),
                branchId: document.getElementById('newEmpBranchId')?.value || null,
                linkedMemberCode: document.getElementById('newEmpLinkedCode')?.value.trim() || null,
                maxTxLimit: document.getElementById('newEmpMaxLimit')?.value.trim() || null,
                mediaPatch: empMediaPatch
            });
            await loadSettings();
            swNotify('تم إضافة موظف الكاشير وتشفير رمز الـ PIN الخاص به بنجاح.', 'success');
        } catch (err) {
            swNotify('تعذر إضافة الكاشير: ' + formatMerchantErrorMessage(err), 'error');
        }
    });
}

function applySaturdayHoursToAll() {
    const satEnabled = document.querySelector('.wh-day-enabled[data-day="sat"]')?.checked ?? true;
    const satOpen = document.querySelector('.wh-day-open[data-day="sat"]')?.value || '09:00';
    const satClose = document.querySelector('.wh-day-close[data-day="sat"]')?.value || '23:00';
    document.querySelectorAll('.wh-day-enabled').forEach(el => { el.checked = satEnabled; });
    document.querySelectorAll('.wh-day-open').forEach(el => { el.value = satOpen; });
    document.querySelectorAll('.wh-day-close').forEach(el => { el.value = satClose; });
}

function collectWorkingHoursMap() {
    const out = {};
    document.querySelectorAll('.wh-day-enabled').forEach(el => {
        const dk = el.dataset.day;
        const openEl = document.querySelector(`.wh-day-open[data-day="${dk}"]`);
        const closeEl = document.querySelector(`.wh-day-close[data-day="${dk}"]`);
        out[dk] = {
            enabled: Boolean(el.checked),
            open: openEl ? openEl.value : '09:00',
            close: closeEl ? closeEl.value : '23:00'
        };
    });
    return out;
}

async function saveMerchantMediaAndDocs() {
    const u = window._merchantSettingsUploaders || {};
    const kycPatch = {};
    const cDoc = u.commercialReg ? u.commercialReg.getValue() : null;
    const tDoc = u.taxCard ? u.taxCard.getValue() : null;
    if (cDoc) kycPatch.commercial_reg = cDoc;
    if (tDoc) kycPatch.tax_card = tDoc;

    const mediaPatch = {
        logo_url: u.logo ? (u.logo.getValue() || '') : null,
        cover_image_url: u.cover ? (u.cover.getValue() || '') : null,
        images: u.gallery ? (u.gallery.getValue() || []) : null,
        commercial_reg_no: (document.getElementById('settingsCommercialRegNo')?.value || '').trim() || null,
        tax_id: (document.getElementById('settingsTaxId')?.value || '').trim() || null
    };
    if (Object.keys(kycPatch).length > 0) {
        mediaPatch.kyc_docs = kycPatch;
    }

    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'update_media',
            mediaPatch
        });
        await loadSettings();
        swNotify('تم حفظ شعار المتجر والصور والوثائق الرسمية بنجاح!', 'success');
    } catch (err) {
        swNotify('تعذر حفظ الصور والوثائق: ' + formatMerchantErrorMessage(err), 'error');
    }
}

async function saveFullMerchantProfileAndWifi() {
    try {
        const eng = window.SAWYAN && window.SAWYAN.RegEngine;
        const p = merchantBundle?.profile || merchantData || {};
        const rawEmail = (document.getElementById('settingsEmail')?.value || '').trim();
        if (rawEmail && eng) {
            const emRes = eng.validateEmailStrict(rawEmail, false);
            if (!emRes.valid) throw new Error(emRes.error);
        }

        const dedInp = document.getElementById('settingsDeductionPercent');
        const dedRaw = dedInp ? dedInp.value.trim() : '';
        if (dedRaw !== '') {
            const dn = Number(dedRaw);
            if (!Number.isFinite(dn) || dn < 0.5 || dn > 95) {
                throw new Error('النسبة المعتمدة يجب أن تكون بين 0.5% و 95%.');
            }
        }

        const latVal = (document.getElementById('settingsLat')?.value || '').trim();
        const lngVal = (document.getElementById('settingsLng')?.value || '').trim();
        const socialObj = {
            facebook: (document.getElementById('settingsFbUrl')?.value || '').trim() || null,
            instagram: (document.getElementById('settingsIgUrl')?.value || '').trim() || null,
            tiktok: (document.getElementById('settingsTtUrl')?.value || '').trim() || null
        };

        const mediaPatch = {
            email: rawEmail || null,
            description: (document.getElementById('settingsDescription')?.value || '').trim() || null,
            merchant_type: document.getElementById('settingsMerchantType')?.value || null,
            category: document.getElementById('settingsCategory')?.value || null,
            whatsapp: (document.getElementById('settingsWhatsapp')?.value || '').trim() || null,
            website_url: (document.getElementById('settingsWebsiteUrl')?.value || '').trim() || null,
            webhook_url: (document.getElementById('settingsWebhookUrl')?.value || '').trim() || null,
            google_maps_url: (document.getElementById('settingsMapsUrl')?.value || '').trim() || null,
            city_geoname_id: _merchantSettingsCascade ? _merchantSettingsCascade.getCityId() : (p.city_geoname_id || null),
            city_name: _merchantSettingsCascade ? (_merchantSettingsCascade.getCityName() || p.city_name || null) : (p.city_name || null),
            district: _merchantSettingsCascade ? (_merchantSettingsCascade.getDistrict() || p.district || null) : (p.district || null),
            social: socialObj,
            working_hours: collectWorkingHoursMap()
        };
        if (dedRaw !== '') {
            mediaPatch.deduction_percent = Number(dedRaw);
        }

        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'update_profile',
            businessName: document.getElementById('settingsBusinessName')?.value,
            ownerName: document.getElementById('settingsOwnerName')?.value,
            phone: document.getElementById('settingsPhone')?.value,
            address: document.getElementById('settingsAddress')?.value,
            latitude: latVal ? Number(latVal) : null,
            longitude: lngVal ? Number(lngVal) : null,
            wifiSsid: document.getElementById('settingsWifiSSID')?.value,
            wifiPassword: document.getElementById('settingsWifiPassword')?.value,
            mediaPatch
        });
        await loadSettings();
        swNotify('تم حفظ وتحديث كافة بيانات المتجر والإحداثيات بنجاح!', 'success');
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    }
}

window.switchMerchantSettingsTab = function (tab) {
    window.__merchantSettingsTab = tab || 'profile';
    document.querySelectorAll('.merchant-settings-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.merTab === window.__merchantSettingsTab);
    });
    document.querySelectorAll('.merchant-settings-pane').forEach(p => {
        p.style.display = p.dataset.merPane === window.__merchantSettingsTab ? 'block' : 'none';
    });
};

async function toggleCashierEmployee(empId, isCurrentlyActive = true, empName = '') {
    if (isCurrentlyActive) {
        const ok = await swConfirmBox(
            'تأكيد إيقاف موظف التوثيق',
            `هل تريد إيقاف حساب الموظف ${empName || ''} فوراً؟ سيتم إنهاء جلسته النشطة على موبايله ومنعه من اعتماد أي فواتير حتى تعيد تفعيله.`,
            true
        );
        if (!ok) return;
    }
    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'toggle_cashier',
            employeeId: empId
        });
        await loadSettings();
        swNotify('تم تحديث حالة الموظف وإنهاء جلسته النشطة إن تم إيقافه.', 'success');
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    }
}

async function resetCashierEmployeePin(empId, empCode) {
    const rawPin = await swPromptBox(
        `🔑 تصفير PIN للموظف ${empCode}`,
        'أدخل رمز PIN مؤقتاً جديداً (4 أرقام). ستُغلق جلسة الموظف الحالية فوراً ويُلزم باختيار رمز سري جديد عند دخوله القادم:',
        '',
        'مثال: 4829'
    );
    if (rawPin === null) return;
    const cleanPin = String(rawPin || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
    if (!/^\d{4}$/.test(cleanPin)) {
        swNotify('يجب إدخال رمز PIN مؤقت من 4 أرقام فقط.', 'error');
        return;
    }
    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'reset_cashier_pin',
            employeeId: empId,
            employeePin: cleanPin
        });
        await loadSettings();
        swNotify(`تم تصفير رمز PIN للموظف ${empCode} وإبطال جلسته القديمة وتوثيق العملية في سجل التدقيق.`, 'success');
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'error');
    }
}

function copyEmployeePortalLink(merchantCode) {
    const base = window.location.href.replace(/[^/]+(\?.*)?$/, '');
    const url = `${base}login.html?tab=employee${merchantCode ? '&store=' + encodeURIComponent(merchantCode) : ''}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(
            () => swNotify('تم نسخ رابط دخول الموظفين — أرسله لكل موظف ليفتحه من موبايله الشخصي.', 'success'),
            () => swNotify(url, 'info')
        );
    } else {
        swNotify(url, 'info');
    }
}

let _ownerPollTimer = null;
let _ownerKnownPendingIds = new Set();
let _ownerKnownEmpRejIds = new Set();
let _ownerInitAlertDone = false;

function _playOwnerGentleChime() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(987.77, now);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
    } catch (_e) {}
}

function _syncOwnerLiveAlertsAndPoll(bundle) {
    if (!bundle) return;
    const pends = Array.isArray(bundle.pending_transactions) ? bundle.pending_transactions : [];
    const rejs = Array.isArray(bundle.recent_employee_rejections) ? bundle.recent_employee_rejections : [];
    const nextPendIds = new Set(pends.map(t => t.id));
    const nextRejIds = new Set(rejs.map(t => t.id));

    if (_ownerInitAlertDone) {
        const newPend = pends.filter(t => t.status === 'pending' && !_ownerKnownPendingIds.has(t.id));
        if (newPend.length > 0) {
            _playOwnerGentleChime();
            swNotify(`🔔 وصل طلب توثيق جديد (${newPend[0].sw_short_code}) بمبلغ ${fmtMerchantMoney(newPend[0].total_amount, newPend[0].currency_code)}`, 'info');
            if ('Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification(`🧾 طلب توثيق جديد — ${newPend[0].sw_short_code}`, {
                        body: `${newPend[0].member_masked_name} • ${fmtMerchantMoney(newPend[0].total_amount, newPend[0].currency_code)}`,
                        icon: '../shared/assets/sawyan-icon.svg'
                    });
                } catch (_e) {}
            }
            const pendPage = document.getElementById('pendingPage');
            if (pendPage && pendPage.classList.contains('active')) {
                loadPendingTransactions(true);
            }
        }
        const newEmpRej = rejs.filter(r => !_ownerKnownEmpRejIds.has(r.id));
        if (newEmpRej.length > 0) {
            _playOwnerGentleChime();
            swNotify(`⚠️ قام الموظف ${newEmpRej[0].employee_name || ''} برفض فاتورة (${newEmpRej[0].sw_short_code}) — يمكنك مراجعتها والتراجع خلال 48 ساعة.`, 'warning');
            const pendPage = document.getElementById('pendingPage');
            if (pendPage && pendPage.classList.contains('active')) {
                loadPendingTransactions(true);
            }
        }
    }

    _ownerKnownPendingIds = nextPendIds;
    _ownerKnownEmpRejIds = nextRejIds;
    _ownerInitAlertDone = true;

    const secs = Math.max(3, Math.min(120, Number(bundle?.verification_settings?.live_poll_interval_secs || 8)));
    const ms = secs * 1000;
    if (!_ownerPollTimer || _ownerPollTimer._ms !== ms) {
        if (_ownerPollTimer) clearInterval(_ownerPollTimer);
        _ownerPollTimer = setInterval(() => {
            if (!document.hidden && currentMerchant && currentMerchant.id) {
                refreshMerchantBundle('today', null);
            }
        }, ms);
        _ownerPollTimer._ms = ms;
    }
    _syncMerchantOwnerPushUi();
}

let _ownerPushSyncedOnce = false;
async function _syncMerchantOwnerPushUi() {
    const btn = document.getElementById('merchantOwnerPushBtn');
    if (!window.SAWYAN?.Push || !currentMerchant?.id) return;
    if (!_ownerPushSyncedOnce) {
        _ownerPushSyncedOnce = true;
        window.SAWYAN.Push.syncIfAlreadyGranted({ actorType: 'merchant_owner', actorId: currentMerchant.id }).catch(() => {});
    }
    if (!btn) return;
    const st = await window.SAWYAN.Push.getStatus();
    if (st.subscribed) {
        btn.style.background = '#ecfdf5';
        btn.style.color = '#047857';
        btn.style.borderColor = '#6ee7b7';
        btn.textContent = '🔊 إشعارات القفل مفعّلة';
    } else {
        btn.style.background = '#eff6ff';
        btn.style.color = '#1d4ed8';
        btn.style.borderColor = '#93c5fd';
        btn.textContent = '🔔 إشعارات القفل';
    }
}

async function toggleMerchantOwnerPush() {
    if (!window.SAWYAN?.Push || !currentMerchant?.id) return;
    const btn = document.getElementById('merchantOwnerPushBtn');
    const st = await window.SAWYAN.Push.getStatus();
    if (st.subscribed) {
        await window.SAWYAN.Push.disablePush({ actorType: 'merchant_owner', actorId: currentMerchant.id });
        swNotify('تم إيقاف إشعارات شاشة القفل لهذا الهاتف.', 'info');
        await _syncMerchantOwnerPushUi();
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = '⏳ جاري التفعيل...'; }
    try {
        _playOwnerGentleChime();
        await window.SAWYAN.Push.enablePush({
            actorType: 'merchant_owner',
            actorId: currentMerchant.id,
            sendWelcomeTest: true
        });
        swNotify('✅ تم تفعيل إشعارات شاشة القفل بالصوت لحساب التاجر! أرسلنا لك إشعاراً تجريبياً الآن.', 'success');
    } catch (err) {
        swNotify(formatMerchantErrorMessage(err), 'warning');
    } finally {
        if (btn) btn.disabled = false;
        await _syncMerchantOwnerPushUi();
    }
}
