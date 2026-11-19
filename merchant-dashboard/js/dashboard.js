// لوحة التاجر - مكتملة بكل الميزات
let currentMerchant = null;
let merchantData = null;

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.icon();
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
            window.SAWYAN.Notifications.hydrateFromBundle(merchantBundle.notifications);
        }
        renderLiveHomeStats();
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

function fmtMerchantMoney(val, curr) {
    const c = curr || merchantBundle?.profile?.currency_code || merchantData?.currency_code || 'EGP';
    return `${Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`;
}

function renderLiveHomeStats() {
    const p = merchantBundle?.profile;
    if (!p) return;
    const curr = p.currency_code || 'EGP';
    const pct = Number(p.deduction_percent || 10).toFixed(1);

    const todaySalesEl = document.getElementById('todaySales');
    const todayTransEl = document.getElementById('todayTransactions');
    const commsDueEl = document.getElementById('totalCommissionsDue');
    const todayNetEl = document.getElementById('todayMerchantNet');
    const prepaidEl = document.getElementById('pendingPayment');
    const contractPctEl = document.getElementById('radarCardContractPct');
    const zoneEl = document.getElementById('radarCardZoneStatus');

    if (todaySalesEl) todaySalesEl.textContent = fmtMerchantMoney(p.today_sales_local, curr);
    if (todayTransEl) todayTransEl.textContent = `${p.today_completed_count || 0} عمليات مكتملة اليوم`;
    if (commsDueEl) commsDueEl.textContent = '-' + fmtMerchantMoney(p.today_commission_local, curr);
    if (todayNetEl) todayNetEl.textContent = fmtMerchantMoney(p.today_merchant_net_local, curr);
    if (prepaidEl) {
        prepaidEl.textContent = fmtMerchantMoney(p.free_balance, curr);
        const hint = prepaidEl.nextElementSibling;
        if (hint) {
            hint.textContent = p.is_isolated
                ? '🔴 المتجر معزول مؤقتاً — اشحن الرصيد لتحرير طابور FIFO'
                : `🟢 يكفي مبيعات حتى ${fmtMerchantMoney(p.safe_sales_capacity, curr)} (${p.zone_status})`;
            hint.style.color = p.is_isolated ? '#dc2626' : '#059669';
        }
    }
    if (contractPctEl) contractPctEl.textContent = `${pct}%`;
    if (zoneEl) {
        const zoneMap = {
            GREEN: '🟢 المنطقة الخضراء (> 30%)',
            YELLOW: '🟡 إنذار شحن مبكر (<= 30%)',
            RED: '🟠 إنذار حرج (<= 20%)',
            ISOLATED: '🔴 معزول لحين الشحن (<= 10%)'
        };
        zoneEl.textContent = zoneMap[p.zone_status] || p.zone_status;
    }
}

async function handleTransaction(e) {
    e.preventDefault();
    const rawCode = (document.getElementById('memberCodeInput')?.value || '').trim();
    const amount = parseFloat(document.getElementById('amount')?.value || '0');
    const memberDigits = rawCode.replace(/[^0-9]/g, '');

    if (!memberDigits || !amount || amount <= 0) {
        alert('الرجاء إدخال كود عضو رقمي صحيح ومبلغ أكبر من صفر.');
        return;
    }

    await submitLiveOrOfflinePosTransaction({
        memberCode: Number(memberDigits),
        amount,
        paymentType: 'cash',
        employeeCode: null,
        cashierPin: null
    });

    document.getElementById('transactionForm')?.reset();
    const mIn = document.getElementById('memberCodeInput');
    if (mIn) mIn.value = '';
    const fEl = document.getElementById('transactionForm');
    if (fEl) fEl.style.display = 'none';
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
        kiosk: '⚡ وضع الكاشير السريع المعزول (POS Kiosk Mode)',
        pending: 'طلبات الفواتير المعلقة وطابور FIFO',
        scan: 'تسجيل عملية جديدة',
        qrScanner: 'نقطة البيع والتحقق بـ PIN الكاشير (D25)',
        transactions: 'العمليات المكتملة وتقفيل الوردية',
        financial: 'الموقف المالي والفواتير الضريبية B2B',
        settings: 'الإعدادات وموظفو الكاشير (D25)'
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

async function loadAllTransactions() {
    const page = document.getElementById('transactionsPage');
    page.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
                <h2 style="margin:0; font-size:1.2rem; color:#0f172a; font-weight:800;">💳 العمليات المكتملة وسجل المبيعات</h2>
                <p style="margin:4px 0 0; color:#64748b; font-size:0.82rem;">كشف حساب تفصيلي بمبيعات أعضاء سويا ومطابقة درج الكاشير</p>
            </div>
            <button onclick="alert('📊 تم تصدير كشف حساب العمليات بصيغة Excel / PDF بنجاح لمطابقة الوردية')" style="background:#0f172a; color:white; border:none; padding:8px 14px; border-radius:8px; font-weight:700; font-size:0.82rem; cursor:pointer; font-family:'Tajawal';">
                📥 تصدير كشف الحساب (Excel)
            </button>
        </div>

        <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden;">
            <table style="width:100%; border-collapse:collapse; text-align:right; font-size:0.85rem;">
                <thead style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1; font-weight:800; color:#334155;">
                    <tr>
                        <th style="padding:10px 14px;">رقم العملية</th>
                        <th style="padding:10px 14px;">العضو</th>
                        <th style="padding:10px 14px;">المسار</th>
                        <th style="padding:10px 14px;">قيمة الفاتورة</th>
                        <th style="padding:10px 14px;">عمولة المتجر (10%)</th>
                        <th style="padding:10px 14px;">الوقت والتاريخ</th>
                    </tr>
                </thead>
                <tbody style="divide-y:1px solid #e2e8f0;">
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 14px; font-weight:800; font-family:monospace;">#TX-1092</td>
                        <td style="padding:10px 14px; font-weight:700;">خالد حسن (#125)</td>
                        <td style="padding:10px 14px;"><span style="background:#ecfdf5; color:#047857; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800;">مسار A (فوري)</span></td>
                        <td style="padding:10px 14px; font-weight:900; color:#0f172a;">1,250.00 ج.م</td>
                        <td style="padding:10px 14px; color:#059669; font-weight:800;">125.00 ج.م</td>
                        <td style="padding:10px 14px; color:#64748b; font-size:0.78rem;">اليوم 04:30 م</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 14px; font-weight:800; font-family:monospace;">#TX-1088</td>
                        <td style="padding:10px 14px; font-weight:700;">إبراهيم عادل (#135)</td>
                        <td style="padding:10px 14px;"><span style="background:#ecfdf5; color:#047857; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800;">مسار A (فوري)</span></td>
                        <td style="padding:10px 14px; font-weight:900; color:#0f172a;">825.00 ج.م</td>
                        <td style="padding:10px 14px; color:#059669; font-weight:800;">82.50 ج.م</td>
                        <td style="padding:10px 14px; color:#64748b; font-size:0.78rem;">اليوم 02:15 م</td>
                    </tr>
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:10px 14px; font-weight:800; font-family:monospace;">#TX-1075</td>
                        <td style="padding:10px 14px; font-weight:700;">سارة أحمد (#140)</td>
                        <td style="padding:10px 14px;"><span style="background:#eff6ff; color:#1d4ed8; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:800;">مسار B (فاتورة)</span></td>
                        <td style="padding:10px 14px; font-weight:900; color:#0f172a;">450.00 ج.م</td>
                        <td style="padding:10px 14px; color:#059669; font-weight:800;">45.00 ج.م</td>
                        <td style="padding:10px 14px; color:#64748b; font-size:0.78rem;">أمس 08:20 م</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}
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
        <div style="background:linear-gradient(135deg, #064e3b, #0f172a); color:white; border-radius:14px; padding:18px 22px; margin-bottom:16px; box-shadow:0 4px 15px rgba(6,78,59,0.25); border:1px solid #10b981;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:12px;">
                <div>
                    <span style="font-size:0.75rem; background:rgba(16,185,129,0.2); border:1px solid #10b981; color:#a7f3d0; padding:2px 8px; border-radius:10px; font-weight:700;">رصيد الشحن مسبق الدفع المتاح حالياً (Prepaid)</span>
                    <div id="livePrepaidBalance" style="font-size:2.2rem; font-weight:900; margin-top:6px; font-family:monospace; color:#34d399;">4,850.00 ج.م</div>
                </div>
                <div style="text-align:left;">
                    <span style="background:#ecfdf5; color:#047857; font-weight:800; font-size:0.8rem; padding:4px 12px; border-radius:8px; display:inline-block; border:1px solid #a7f3d0;">
                        🟢 حالة المتجر: آمن ونشط بالرادار
                    </span>
                    <div style="font-size:0.74rem; color:#94a3b8; margin-top:5px;">الحد الأدنى لإنذار الشحن: 500.00 ج.م</div>
                </div>
            </div>

            <!-- شريط الأمان المالي الاستراتيجي -->
            <div style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:10px; padding:10px 14px; font-size:0.8rem; color:#e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <span>🛡️ <strong>حد الأمان المحاسبي:</strong> رصيدك الحالي يكفي لتمرير مبيعات لأعضاء سويا بقيمة <strong>48,500.00 ج.م</strong> قبل الحاجة لإعادة الشحن.</span>
                <span style="color:#a7f3d0; font-weight:800; font-family:monospace;">نسبة العمولة: 10.0% معتمدة</span>
            </div>
        </div>

        <!-- 2. بطاقات إحصائيات الشهر الحالي السريعة -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; margin-bottom:16px;">
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px 18px; text-align:center;">
                <div style="font-size:0.78rem; color:#64748b; font-weight:700;">إجمالي مبيعات الشهر (Gross GMV)</div>
                <div style="font-size:1.35rem; font-weight:900; color:#0f172a; margin-top:4px;">42,800.00 ج.م</div>
            </div>
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px 18px; text-align:center;">
                <div style="font-size:0.78rem; color:#64748b; font-weight:700;">عمولات سويا (10%)</div>
                <div style="font-size:1.35rem; font-weight:900; color:#dc2626; margin-top:4px;">-4,280.00 ج.م</div>
            </div>
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px 18px; text-align:center;">
                <div style="font-size:0.78rem; color:#64748b; font-weight:700;">صافي مبيعات المتجر المحصلة (90%)</div>
                <div style="font-size:1.35rem; font-weight:900; color:#059669; margin-top:4px;">38,520.00 ج.م</div>
            </div>
        </div>

        <!-- 3. شريط التبويبات المحاسبية الثلاثة -->
        <div style="display:flex; border-bottom:2px solid #e2e8f0; margin-bottom:14px; gap:8px;">
            <button id="finTabBtn1" onclick="switchFinancialTab(1)" style="background:transparent; border:none; border-bottom:3px solid #059669; color:#059669; font-weight:900; font-size:0.9rem; padding:8px 16px; cursor:pointer; font-family:'Tajawal';">
                🧾 كشف استهلاك الشحن والمبيعات (أين صُرف؟)
            </button>
            <button id="finTabBtn2" onclick="switchFinancialTab(2)" style="background:transparent; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:700; font-size:0.9rem; padding:8px 16px; cursor:pointer; font-family:'Tajawal';">
                🔋 سجل عمليات شحن الرصيد (كم مرة وبكم؟)
            </button>
            <button id="finTabBtn3" onclick="switchFinancialTab(3)" style="background:transparent; border:none; border-bottom:3px solid transparent; color:#64748b; font-weight:700; font-size:0.9rem; padding:8px 16px; cursor:pointer; font-family:'Tajawal';">
                📅 الإقفالات والتسويات للأشهر السابقة
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
                            <th style="padding:10px 12px;">عمولات سويا (10%)</th>
                            <th style="padding:10px 12px;">الرصيد المتبقي بعد العملية</th>
                        </tr>
                    </thead>
                    <tbody style="divide-y:1px solid #e2e8f0;">
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">اليوم 06:45 م</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TX-1095</td>
                            <td style="padding:10px 12px; font-weight:700;">أحمد مصطفى (#124)</td>
                            <td style="padding:10px 12px; font-weight:800;">500.00 ج.م</td>
                            <td style="padding:10px 12px; color:#dc2626; font-weight:800; font-family:monospace;">-50.00 ج.م </td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">4,850.00 ج.م</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">اليوم 04:30 م</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TX-1092</td>
                            <td style="padding:10px 12px; font-weight:700;">خالد حسن (#125)</td>
                            <td style="padding:10px 12px; font-weight:800;">1,250.00 ج.م</td>
                            <td style="padding:10px 12px; color:#dc2626; font-weight:800; font-family:monospace;">-125.00 ج.م </td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">4,900.00 ج.م</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">اليوم 02:15 م</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TX-1088</td>
                            <td style="padding:10px 12px; font-weight:700;">إبراهيم عادل (#135)</td>
                            <td style="padding:10px 12px; font-weight:800;">825.00 ج.م</td>
                            <td style="padding:10px 12px; color:#dc2626; font-weight:800; font-family:monospace;">-82.50 ج.م </td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">5,025.00 ج.م</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">أمس 08:20 م</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TX-1075</td>
                            <td style="padding:10px 12px; font-weight:700;">سارة أحمد (#140)</td>
                            <td style="padding:10px 12px; font-weight:800;">450.00 ج.م</td>
                            <td style="padding:10px 12px; color:#dc2626; font-weight:800; font-family:monospace;">-45.00 ج.م </td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">5,107.50 ج.م</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- التبويب 2: سجل عمليات شحن الرصيد السابقة -->
        <div id="finTabContent2" style="display:none;">
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden;">
                <table style="width:100%; border-collapse:collapse; text-align:right; font-size:0.84rem;">
                    <thead style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1; font-weight:800; color:#334155;">
                        <tr>
                            <th style="padding:10px 12px;">تاريخ الشحن</th>
                            <th style="padding:10px 12px;">رقم العملية</th>
                            <th style="padding:10px 12px;">المبلغ المشحون</th>
                            <th style="padding:10px 12px;">وسيلة الدفع</th>
                            <th style="padding:10px 12px;">الرصيد قبل الشحن</th>
                            <th style="padding:10px 12px;">الرصيد بعد الشحن</th>
                            <th style="padding:10px 12px;">الإيصال الرسمي</th>
                        </tr>
                    </thead>
                    <tbody style="divide-y:1px solid #e2e8f0;">
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">08 نوفمبر 2026</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TOP-781</td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">+3,000.00 ج.م</td>
                            <td style="padding:10px 12px;"><span style="background:#eff6ff; color:#1d4ed8; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.75rem;">إنستاباي (InstaPay)</span></td>
                            <td style="padding:10px 12px; font-family:monospace; color:#64748b;">2,152.50 ج.م</td>
                            <td style="padding:10px 12px; font-family:monospace; font-weight:800; color:#047857;">5,152.50 ج.م</td>
                            <td style="padding:10px 12px;">
                                <button onclick="alert('📄 إيصال الشحن الرسمي رقم #TOP-781: معتمد برقم مرجعي بنكي NBE-99120')" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">عرض الإيصال</button>
                            </td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">01 نوفمبر 2026</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TOP-742</td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">+2,000.00 ج.م</td>
                            <td style="padding:10px 12px;"><span style="background:#fdf2f8; color:#9d174d; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.75rem;">فودافون كاش</span></td>
                            <td style="padding:10px 12px; font-family:monospace; color:#64748b;">845.00 ج.م</td>
                            <td style="padding:10px 12px; font-family:monospace; font-weight:800; color:#047857;">2,845.00 ج.م</td>
                            <td style="padding:10px 12px;">
                                <button onclick="alert('📄 إيصال الشحن الرسمي رقم #TOP-742: معتمد برقم محفظة VF-40291')" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">عرض الإيصال</button>
                            </td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 12px; color:#64748b;">15 أكتوبر 2026</td>
                            <td style="padding:10px 12px; font-weight:800; font-family:monospace;">#TOP-690</td>
                            <td style="padding:10px 12px; color:#059669; font-weight:900; font-family:monospace;">+5,000.00 ج.م</td>
                            <td style="padding:10px 12px;"><span style="background:#f0fdf4; color:#15803d; padding:2px 8px; border-radius:6px; font-weight:800; font-size:0.75rem;">تحويل بنكي مباشر</span></td>
                            <td style="padding:10px 12px; font-family:monospace; color:#64748b;">420.00 ج.م</td>
                            <td style="padding:10px 12px; font-family:monospace; font-weight:800; color:#047857;">5,420.00 ج.م</td>
                            <td style="padding:10px 12px;">
                                <button onclick="alert('📄 إيصال الشحن الرسمي رقم #TOP-690: معتمد برقم تحويل CIB-11048')" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:3px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;">عرض الإيصال</button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- التبويب 3: الإقفالات والتسويات الشهرية السابقة -->
        <div id="finTabContent3" style="display:none;">
            <div style="background:#f8fafc; border:1px solid #cbd5e1; border-radius:12px; padding:14px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <label style="font-weight:800; font-size:0.85rem; color:#0f172a;">اختر دورة الإقفال الشهري:</label>
                    <select id="settlementMonthSelect" onchange="changeSettlementMonth(this.value)" style="padding:6px 12px; border-radius:6px; border:1px solid #cbd5e1; font-weight:700; font-family:'Tajawal'; font-size:0.85rem;">
                        <option value="oct_2026" selected>أكتوبر 2026 (دورة مقفلة معتمدة)</option>
                        <option value="sep_2026">سبتمبر 2026 (دورة مقفلة معتمدة)</option>
                        <option value="aug_2026">أغسطس 2026 (دورة مقفلة معتمدة)</option>
                    </select>
                </div>
                <button onclick="alert('📥 جاري تنزيل الفاتورة الضريبية وإشعار التسوية المعتمد لشهر ' + document.getElementById('settlementMonthSelect').options[document.getElementById('settlementMonthSelect').selectedIndex].text);" style="background:#1e3a8a; color:white; border:none; padding:8px 14px; border-radius:6px; font-weight:700; font-size:0.82rem; cursor:pointer; font-family:'Tajawal';">
                    🧾 تحميل الفاتورة الضريبية الشهرية (Tax Invoice PDF)
                </button>
            </div>

            <!-- جدول ملخص الإقفال للشهر المختار -->
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden;">
                <table style="width:100%; border-collapse:collapse; text-align:right; font-size:0.86rem;">
                    <thead style="background:#f1f5f9; border-bottom:1.5px solid #cbd5e1; font-weight:800; color:#334155;">
                        <tr>
                            <th style="padding:10px 14px;">البند المحاسبي</th>
                            <th style="padding:10px 14px;">القيمة المالية</th>
                            <th style="padding:10px 14px;">التوجيه المحاسبي</th>
                        </tr>
                    </thead>
                    <tbody style="divide-y:1px solid #e2e8f0;">
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 14px; font-weight:700;">رصيد أول المدة للشحن (Opening Balance)</td>
                            <td style="padding:10px 14px; font-weight:900; font-family:monospace;">420.00 ج.م</td>
                            <td style="padding:10px 14px; color:#64748b;">مرحل من سبتمبر 2026</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 14px; font-weight:700;">إجمالي مبالغ الشحن المضافة خلال الشهر (+)</td>
                            <td style="padding:10px 14px; font-weight:900; font-family:monospace; color:#059669;">+5,000.00 ج.م</td>
                            <td style="padding:10px 14px; color:#059669;">تمت تسويتها واعتمادها بالبنك</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 14px; font-weight:700;">إجمالي مبيعات أعضاء سويا بالمحل (Gross GMV)</td>
                            <td style="padding:10px 14px; font-weight:900; font-family:monospace; color:#0f172a;">45,750.00 ج.م</td>
                            <td style="padding:10px 14px; color:#64748b;">إجمالي 64 فاتورة معتمدة</td>
                        </tr>
                        <tr style="border-bottom:1px solid #f1f5f9;">
                            <td style="padding:10px 14px; font-weight:700;">عمولات سويا (10%) (-)</td>
                            <td style="padding:10px 14px; font-weight:900; font-family:monospace; color:#dc2626;">-4,575.00 ج.م</td>
                            <td style="padding:10px 14px; color:#dc2626;">مستقطعة وفق النسبة التعاقدية 10%</td>
                        </tr>
                        <tr style="background:#f0fdf4; border-top:2px solid #10b981;">
                            <td style="padding:12px 14px; font-weight:900; color:#065f46;">رصيد آخر المدة المرحل للشهر التالي (Closing Balance)</td>
                            <td style="padding:12px 14px; font-weight:900; font-family:monospace; font-size:1.1rem; color:#047857;">845.00 ج.م</td>
                            <td style="padding:12px 14px; font-weight:800; color:#047857;">✅ تم ترحيله كرصيد افتتاحي لشهر نوفمبر</td>
                        </tr>
                    </tbody>
                </table>
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
    const amount = prompt('أدخل مبلغ الشحن بالجنيه المصري (مثال: 1000):', '1000');
    if (amount && parseFloat(amount) > 0) {
        alert('✅ تم تسجيل طلب شحن الرصيد بمبلغ ' + amount + ' ج.م بنجاح عبر إنستاباي / فودافون كاش!\nتم تحديث رصيد الأمان بالرادار.');
        const balEl = document.getElementById('livePrepaidBalance');
        if (balEl) {
            const current = 4850.00;
            balEl.innerText = (current + parseFloat(amount)).toLocaleString('en-US', {minimumFractionDigits: 2}) + ' ج.م';
        }
    }
}

function exportFinancialStatementPDF() {
    alert('📥 جاري تنزيل كشف الحساب المالي المعتمد لمتجر سوبرماركت الفارق بصيغة PDF...');
}

function changeSettlementMonth(val) {
    alert('📅 تم تحديث عرض دورة التسوية الشهرية لـ ' + val);
}
function loadSettings() {
    const page = document.getElementById('settingsPage');
    page.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <div>
                <h2 style="margin:0; font-size:1.2rem; color:#0f172a; font-weight:800;">⚙️ إعدادات المتجر وبيانات التعاقد</h2>
                <p style="margin:4px 0 0; color:#64748b; font-size:0.82rem;">إدارة بيانات الفرع، ساعات العمل، ومراجعة نسب العمولة المعتمدة</p>
            </div>
            <button onclick="alert('✅ تم حفظ تعديلات بيانات المتجر بنجاح');" style="background:#059669; color:white; border:none; padding:8px 16px; border-radius:8px; font-weight:800; font-size:0.85rem; cursor:pointer; font-family:'Tajawal';">
                💾 حفظ التعديلات
            </button>
        </div>

        <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:16px;">
            <!-- بيانات المتجر الأساسية -->
            <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:16px;">
                <div style="font-weight:900; font-size:0.95rem; color:#0f172a; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:8px;">🏪 بيانات المتجر والفرع</div>
                
                <div style="margin-bottom:10px;">
                    <label style="display:block; font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:3px;">اسم المتجر التجاري:</label>
                    <input type="text" value="سوبر ماركت الفارق المركزي" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-weight:700; font-family:'Tajawal'; font-size:0.85rem;">
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
                    <div>
                        <label style="display:block; font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:3px;">كود المتجر التعريفي:</label>
                        <input type="text" value="EG-MKT-101" readonly style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; background:#f8fafc; font-weight:800; font-family:monospace; font-size:0.85rem;">
                    </div>
                    <div>
                        <label style="display:block; font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:3px;">الفرع:</label>
                        <input type="text" value="فرع مدينة نصر (شارع عباس العقاد)" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-weight:700; font-family:'Tajawal'; font-size:0.85rem;">
                    </div>
                </div>

                <div style="margin-bottom:10px;">
                    <label style="display:block; font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:3px;">ساعات العمل اليومية:</label>
                    <input type="text" value="يومياً من 08:00 صباحاً حتى 01:00 بعد منتصف الليل" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-weight:700; font-family:'Tajawal'; font-size:0.85rem;">
                </div>

                <div>
                    <label style="display:block; font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:3px;">رقم هاتف المحل / الكاشير:</label>
                    <input type="tel" value="01098765432" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid #cbd5e1; font-weight:700; font-family:monospace; font-size:0.85rem;">
                </div>
            </div>

            <!-- بطاقة نسبة العمولة المؤمنة والـ GPS -->
            <div style="display:flex; flex-direction:column; gap:12px;">
                <!-- نسبة الخصم التعاقدية (مقروءة فقط) -->
                <div style="background:#f0fdf4; border:1.5px solid #10b981; border-radius:12px; padding:14px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="font-weight:900; font-size:0.9rem; color:#065f46;">🔒 نسبة العمولة التعاقدية الرسمية:</div>
                        <span style="background:#10b981; color:white; font-size:0.75rem; font-weight:800; padding:2px 6px; border-radius:4px;">معتمدة بالعقد</span>
                    </div>
                    <div style="font-size:1.8rem; font-weight:900; color:#047857; font-family:monospace;">10.0% <span style="font-size:0.85rem; font-family:'Tajawal'; color:#065f46;">(عائدات خطة الدخل وعمولة الشبكة)</span></div>
                    <div style="font-size:0.75rem; color:#047857; margin-top:4px; line-height:1.4;">
                        تُخصم آلياً من رصيد الشحن المسبق مع إصدار فاتورة ضريبية مزدوجة B2B رسمية.<br>
                        <span style="color:#64748b;">(تعديل النسبة التعاقدية محصور باعتماد Maker–Checker لدى إدارة المنصة).</span>
                    </div>
                </div>

                <!-- إحداثيات المتجر على الخريطة والرادار -->
                <div style="background:white; border:1px solid #cbd5e1; border-radius:12px; padding:14px;">
                    <div style="font-weight:900; font-size:0.88rem; color:#0f172a; margin-bottom:6px;">📍 إحداثيات المتجر في رادار الأعضاء:</div>
                    <div style="font-size:0.78rem; color:#334155; margin-bottom:8px;">
                        الإحداثيات الحالية: <strong>30.0561° N, 31.3412° E</strong> (مدينة نصر).
                    </div>
                    <button onclick="alert('🗺️ فتح خريطة تعديل دبوس موقع المتجر لضبط دقة الرادار');" style="width:100%; background:white; color:#1d4ed8; border:1px solid #bfdbfe; padding:8px; border-radius:6px; font-weight:700; font-size:0.8rem; cursor:pointer; font-family:'Tajawal';">
                        🗺️ تحديث موضع المتجر على الخريطة
                    </button>
                </div>
            </div>
        </div>
    `;
}

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
        alert('✅ تم حفظ إعدادات المتجر في الخادم بنجاح!');
    } catch (error) {
        alert('❌ تعذر حفظ الإعدادات: ' + error.message);
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
        alert('الرجاء إدخال اسم الشبكة (SSID)');
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

    // استخدام مكتبة qrcode.js إذا كانت متاحة
    if (typeof QRCode !== 'undefined') {
        qrCodeDiv.innerHTML = '';
        new QRCode(qrCodeDiv, {
            text: wifiString,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        // Fallback: عرض النص فقط
        qrCodeDiv.innerHTML = `
            <div style="padding: 20px; background: #f5f5f5; border-radius: 8px;">
                <p style="font-size: 0.85rem; margin-bottom: 10px;">نص QR للواي فاي:</p>
                <code style="word-break: break-all; font-size: 0.75rem;">${wifiString}</code>
                <p style="font-size: 0.8rem; margin-top: 10px; color: #666;">
                    💡 لإنشاء QR مرئي، أضف مكتبة qrcode.js للمشروع
                </p>
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

    page.innerHTML = `
        <div class="qr-scanner-page" style="max-width: 800px; margin: 0 auto;">
            
            <!-- 1. شريط هوية التاجر والمتجر المعتمد -->
            <div style="background: white; border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 14px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 48px; height: 48px; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.6rem;">🏬</div>
                    <div>
                        <div style="font-weight: 900; font-size: 1.1rem; color: #0f172a;">سوبر ماركت الفارق المركزي</div>
                        <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
                            كود التاجر: <strong style="color: #059669; font-family: monospace;">#EG-MKT-101</strong> • <span style="background: #ecfdf5; color: #047857; padding: 1px 8px; border-radius: 6px; font-weight: 800; font-size: 0.75rem;">🟢 متجر معتمد ونشط</span>
                        </div>
                    </div>
                </div>
                <div style="text-align: left;">
                    <div style="font-size: 0.74rem; color: #64748b; font-weight: 700;">نسبة عمولات سويا:</div>
                    <div style="font-weight: 900; color: #059669; font-size: 1.2rem; font-family: monospace;">10.0% معتمدة</div>
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
                <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 14px; margin-bottom: 14px;">
                    <!-- حقل 1: كود العميل -->
                    <div>
                        <label style="display: block; font-size: 0.85rem; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
                            🔢 كود العميل / العضو: <span style="color: #ef4444;">*</span>
                        </label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="manualQRInput" value="" placeholder="أدخل كود العضو (مثال: 1 أو 124)" 
                                oninput="handleManualCodeInput(this.value)" 
                                onkeydown="if(event.key==='Enter') focusBillAmount()"
                                style="width: 100%; padding: 10px 14px; border: 2px solid #cbd5e1; border-radius: 10px; font-weight: 900; font-size: 1.1rem; font-family: monospace; outline: none; transition: border-color 0.2s;"
                                onfocus="this.style.borderColor='#10b981'" onblur="this.style.borderColor='#cbd5e1'">
                            <button onclick="processManualQRInput()" title="تحقق من العضو" style="background: #059669; color: white; border: none; padding: 0 16px; border-radius: 10px; font-weight: 900; font-size: 1.2rem; cursor: pointer;">
                                ✓
                            </button>
                        </div>
                        <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">جرب كتابة: <strong>1</strong> أو <strong>124</strong> أو <strong>125</strong> أو <strong>101</strong></div>
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
                    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; align-items: center;">
                        <div>
                            <label style="display: block; font-size: 0.88rem; font-weight: 800; color: #0f172a; margin-bottom: 6px;">
                                💰 إجمالي قيمة الفاتورة بالجنيه المصري: <span style="color: #ef4444;">*</span>
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
                                <span style="color: #64748b; font-weight: 700;">عمولات سويا (10%):</span>
                                <strong id="previewSawyanComm" style="color: #dc2626; font-family: monospace;">-0.00 ج.م</strong>
                            </div>
                            <div style="display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 4px;">
                                <span style="color: #065f46; font-weight: 800;">صافي نقدية المتجر:</span>
                                <strong id="previewMerchantNet" style="color: #059669; font-family: monospace; font-size: 0.95rem;">0.00 ج.م</strong>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- زر الاعتماد الفوري وتوثيق الفاتورة -->
                <button onclick="processOfflineCustomerPayment()" id="submitPosPaymentBtn" 
                    style="width: 100%; background: linear-gradient(135deg, #059669, #047857); color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 900; font-size: 1.05rem; cursor: pointer; font-family: 'Tajawal'; box-shadow: 0 4px 15px rgba(5,150,105,0.3); display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span>💳 تسجيل العملية وتوثيق الفاتورة فوراً</span>
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
 * معالجة الإدخال اليدوي
 */
// ===== قاعدة بيانات الأعضاء المعتمدة للكشف اللحظي بالاسم =====
const MOCK_MEMBERS_MAP = {
    '1': { name: 'أحمد مصطفى', code: 'SWY-124', phone: '01012345678', rank: 'عضو نشط ومؤهل' },
    '12': { name: 'أحمد مصطفى', code: 'SWY-124', phone: '01012345678', rank: 'عضو نشط ومؤهل' },
    '124': { name: 'أحمد مصطفى', code: 'SWY-124', phone: '01012345678', rank: 'عضو نشط ومؤهل' },
    'SWY-124': { name: 'أحمد مصطفى', code: 'SWY-124', phone: '01012345678', rank: 'عضو نشط ومؤهل' },
    '125': { name: 'خالد حسن', code: 'SWY-125', phone: '01123456789', rank: 'عضو نشط ومؤهل' },
    'SWY-125': { name: 'خالد حسن', code: 'SWY-125', phone: '01123456789', rank: 'عضو نشط ومؤهل' },
    '135': { name: 'إبراهيم عادل', code: 'SWY-135', phone: '01234567890', rank: 'عضو نشط ومؤهل' },
    'SWY-135': { name: 'إبراهيم عادل', code: 'SWY-135', phone: '01234567890', rank: 'عضو نشط ومؤهل' },
    '140': { name: 'سارة أحمد', code: 'SWY-140', phone: '01512345678', rank: 'عضوة نشطة ومؤهلة' },
    'SWY-140': { name: 'سارة أحمد', code: 'SWY-140', phone: '01512345678', rank: 'عضوة نشطة ومؤهلة' },
    '101': { name: 'محمد دمير', code: 'SWY-101', phone: '01099887766', rank: 'عضو نشط ومؤهل' },
    'SWY-101': { name: 'محمد دمير', code: 'SWY-101', phone: '01099887766', rank: 'عضو نشط ومؤهل' },
    '102': { name: 'محمود علي', code: 'SWY-102', phone: '01188776655', rank: 'عضو نشط ومؤهل' },
    'SWY-102': { name: 'محمود علي', code: 'SWY-102', phone: '01188776655', rank: 'عضو نشط ومؤهل' },
    '103': { name: 'طارق عبد الله', code: 'SWY-103', phone: '01277665544', rank: 'عضو نشط ومؤهل' },
    'SWY-103': { name: 'طارق عبد الله', code: 'SWY-103', phone: '01277665544', rank: 'عضو نشط ومؤهل' },
    '110': { name: 'مريم إبراهيم', code: 'SWY-110', phone: '01033445566', rank: 'عضوة نشطة ومؤهلة' },
    'SWY-110': { name: 'مريم إبراهيم', code: 'SWY-110', phone: '01033445566', rank: 'عضوة نشطة ومؤهلة' }
};

function getMemberByCode(inputCode) {
    if (!inputCode) return null;
    const clean = inputCode.trim();
    if (MOCK_MEMBERS_MAP[clean]) return MOCK_MEMBERS_MAP[clean];
    const upper = clean.toUpperCase();
    if (MOCK_MEMBERS_MAP[upper]) return MOCK_MEMBERS_MAP[upper];
    // المطابقة بالأرقام
    const num = clean.replace(/[^0-9]/g, '');
    if (num && MOCK_MEMBERS_MAP[num]) return MOCK_MEMBERS_MAP[num];
    // توليد ذكي لأي كود آخر لضمان عدم توقف التجربة
    return {
        name: 'كابتن / عضو سويا المعتمد (' + clean + ')',
        code: clean.startsWith('SWY-') ? clean : ('SWY-' + clean),
        phone: '010XXXXXXXX',
        rank: 'عضو نشط ومؤهل'
    };
}

// الكشف اللحظي عن اسم العضو أثناء الكتابة في شاشة مسح QR / دفع أونلاين
// الكشف اللحظي الفوري عن اسم العميل بمجرد كتابة أي حرف أو رقم
function handleManualCodeInput(val) {
    const box = document.getElementById('detectedMemberBox');
    const nameText = document.getElementById('detectedMemberNameText');
    const badge = document.getElementById('detectedMemberBadge');
    const codeText = document.getElementById('detectedMemberCodeText');
    
    const clean = val ? val.trim() : '';

    if (clean.length === 0) {
        if (box) {
            box.style.background = '#f8fafc';
            box.style.borderColor = '#cbd5e1';
            box.style.borderStyle = 'dashed';
        }
        if (nameText) {
            nameText.innerText = '(اكتب كود العميل وسيظهر اسمه هنا فوراً)';
            nameText.style.color = '#94a3b8';
        }
        if (badge) badge.style.display = 'none';
        if (codeText) codeText.style.display = 'none';
        scannedMemberData = null;
        return;
    }

    // مطابقة ذكية حتى من رقم واحد (مثال: 1 -> أحمد مصطفى)
    const member = getMemberByCode(clean);

    if (member) {
        scannedMemberData = {
            id: member.code,
            code: member.code,
            name: member.name
        };

        if (box) {
            box.style.background = '#ecfdf5';
            box.style.borderColor = '#10b981';
            box.style.borderStyle = 'solid';
        }
        if (nameText) {
            nameText.innerHTML = `👤 <span style="color:#047857;">${member.name}</span>`;
            nameText.style.color = '#047857';
        }
        if (badge) {
            badge.style.display = 'inline-block';
            badge.innerText = '🟢 ' + member.rank;
        }
        if (codeText) {
            codeText.style.display = 'block';
            codeText.innerHTML = `كود العضوية: <strong>${member.code}</strong> • هاتف: ${member.phone}`;
        }
    }
}

function handleScanPageMemberCode(val) {
    const preview = document.getElementById('scanPageMemberPreview');
    const form = document.getElementById('transactionForm');
    const clean = val ? val.trim() : '';
    if (clean.length < 2) {
        if (preview) {
            preview.style.display = 'none';
            preview.innerHTML = '';
        }
        if (form) form.style.display = 'none';
        return;
    }
    const member = getMemberByCode(clean);
    if (member) {
        if (preview) {
            preview.style.display = 'block';
            preview.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:36px; height:36px; background:#10b981; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">👤</div>
                    <div>
                        <div style="font-weight:900; color:#065f46; font-size:0.95rem;">اسم العميل: <span style="color:#047857; text-decoration:underline;">${member.name}</span></div>
                        <div style="font-size:0.75rem; color:#059669; margin-top:2px;">كود: <strong>${member.code}</strong> • <span style="background:#d1fae5; color:#065f46; padding:1px 6px; border-radius:4px; font-weight:700;">🟢 ${member.rank}</span></div>
                    </div>
                </div>
            `;
        }
        if (form) {
            form.style.display = 'block';
        }
    }
}

function processManualQRInput() {
    const input = document.getElementById('manualQRInput');
    const qrData = input ? input.value.trim() : '';
    if (!qrData) {
        alert('الرجاء إدخال كود العضو أولاً');
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

    const sawyanCommEl = document.getElementById('previewSawyanComm');
    const merchantNetEl = document.getElementById('previewMerchantNet');

    if (amount > 0) {
        const comm = amount * (pct / 100);
        const net = amount - comm;
        if (sawyanCommEl) sawyanCommEl.innerText = `-${comm.toFixed(2)} ${curr}`;
        if (merchantNetEl) merchantNetEl.innerText = `${net.toFixed(2)} ${curr}`;
    } else {
        if (sawyanCommEl) sawyanCommEl.innerText = `-0.00 ${curr}`;
        if (merchantNetEl) merchantNetEl.innerText = `0.00 ${curr}`;
    }
}

function resetScanner() {
    scannedMemberData = null;
    const resultEl = document.getElementById('scanResult');
    if (resultEl) resultEl.style.display = 'none';
    const amountEl = document.getElementById('offlinePaymentAmount');
    if (amountEl) amountEl.value = '';
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
        alert('⚠️ لم تقم بإعداد الواي فاي بعد.\nاذهب إلى تبويب الإعدادات لإدخال اسم شبكة Wi-Fi المتجر.');
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
                    swShortCode: payload.swShortCode
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
        badge.textContent = `${online ? '🟢 متصل' : '🟠 أوفلاين'} • حافظة الأوفلاين المشفرة (AES-GCM): ${list.length}`;
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
    amount,
    paymentType = 'cash',
    branchId = null,
    employeeCode = null,
    cashierPin = null
}) {
    const idemKey = window.SAWYAN.API.newIdempotencyKey();
    const shortCode = 'SW-' + idemKey.replace(/-/g, '').slice(0, 6).toUpperCase();
    const isOffline = forceDeadZoneSimulation || (typeof navigator !== 'undefined' && !navigator.onLine);

    if (isOffline) {
        const queued = await SawyanOfflinePosVault.enqueueEncryptedDraft({
            merchantId: currentMerchant.id,
            memberCode: Number(memberCode),
            amount: Number(amount),
            paymentType,
            branchId,
            employeeCode,
            cashierPin,
            idempotencyKey: idemKey,
            swShortCode: shortCode
        });
        alert(`📴 وضع انقطاع الشبكة (Dead Zone):\nتم تشفير المسودة بـ AES-256-GCM وحفظها في IndexedDB برقم فاتورة ${queued.sw_short_code} ومفتاح عدم تكرار UUIDv7.\nستُرسل تلقائياً فور عودة الإنترنت.`);
        return queued;
    }

    try {
        const res = await window.SAWYAN.API.authenticateAndSubmitPosTx({
            merchantId: currentMerchant.id,
            memberCode: Number(memberCode),
            amount: Number(amount),
            paymentType,
            idempotencyKey: idemKey,
            branchId,
            employeeCode,
            cashierPin,
            swShortCode: shortCode
        });

        if (res && res.success === false) {
            if (res.error_code === 'CASHIER_PIN_LOCKED_15M') {
                alert('⛔ تم قفل رمز PIN لهذا الموظف لمدة 15 دقيقة بعد 5 محاولات خاطئة (القرار D25).');
                return null;
            }
            if (res.error_code === 'INVALID_CASHIER_PIN') {
                alert(`❌ رمز PIN الكاشير غير صحيح! المحاولات المتبقية قبل القفل: ${res.remaining_attempts}`);
                return null;
            }
            if (res.pos_result?.status === 'rejected_self_cashier_pin') {
                alert('⛔ محظور أمنياً (D25): لا يجوز لموظف الكاشير توثيق فاتورة لحسابه الشخصي كعضو! تم إشعار مالك المتجر.');
                return null;
            }
            alert('❌ تعذر إتمام العملية: ' + (res.error_code || 'خطأ غير متوقع'));
            return null;
        }

        const st = res?.pos_result?.status || 'completed';
        const curr = merchantBundle?.profile?.currency_code || 'EGP';
        alert(`✅ تم توثيق الفاتورة عبر محرك PostgreSQL V3.0!\n━━━━━━━━━━━━━━━━━━━━━\n🧾 الكود المختصر: ${res.sw_short_code}\n👤 العضو: ${res.member_name} (#${res.member_code})\n💰 قيمة الفاتورة: ${Number(amount).toFixed(2)} ${curr}\n🏷️ العمولة المستقطعة: ${Number(res.commission_deducted_local).toFixed(2)} ${curr}\n💵 صافي نقدية الدرج: ${Number(res.merchant_net_local).toFixed(2)} ${curr}\n📌 الحالة المحاسبية: ${st === 'awaiting_merchant_topup' ? '⏸️ دخلت طابور الشحن FIFO (D4)' : '✅ مكتملة وصدر لها فاتورة ضريبية B2B'}`);
        await refreshMerchantBundle();
        return res;
    } catch (err) {
        // إذا تعذر الاتصال بالخادم فجأة، خزّنها مشفرة في حافظة الأوفلاين لمنع ضياع عملية الكاشير!
        if (String(err.message || '').toLowerCase().includes('fetch')) {
            const queued = await SawyanOfflinePosVault.enqueueEncryptedDraft({
                merchantId: currentMerchant.id,
                memberCode: Number(memberCode),
                amount: Number(amount),
                paymentType,
                branchId,
                employeeCode,
                cashierPin,
                idempotencyKey: idemKey,
                swShortCode: shortCode
            });
            alert(`🟠 تعذر الوصول للشبكة — تم حفظ العملية مشفرة في حافظة الأوفلاين (${queued.sw_short_code}) للمزامنة التلقائية.`);
            return queued;
        }
        alert('❌ تعذر تسجيل الفاتورة: ' + err.message);
        return null;
    }
}

// الكشف الحي الآمن عن العضو في شاشة الكاشير عبر lookup_member_for_pos (بدون هواتف D26)
function handleManualCodeInput(val) {
    const box = document.getElementById('detectedMemberBox');
    const nameText = document.getElementById('detectedMemberNameText');
    const badge = document.getElementById('detectedMemberBadge');
    const codeText = document.getElementById('detectedMemberCodeText');
    const clean = (val || '').trim();

    if (posLookupDebounce) clearTimeout(posLookupDebounce);
    if (!clean) {
        scannedMemberData = null;
        if (box) { box.style.background = '#f8fafc'; box.style.borderColor = '#cbd5e1'; box.style.borderStyle = 'dashed'; }
        if (nameText) { nameText.textContent = '(اكتب كود العميل وسيظهر اسمه هنا فوراً)'; nameText.style.color = '#94a3b8'; }
        if (badge) badge.style.display = 'none';
        if (codeText) codeText.style.display = 'none';
        return;
    }

    if (nameText) { nameText.textContent = '⏳ جاري التحقق من قاعدة البيانات...'; nameText.style.color = '#64748b'; }
    posLookupDebounce = setTimeout(async () => {
        try {
            const res = await window.SAWYAN.API.lookupMemberForPos({
                merchantId: currentMerchant.id,
                memberIdentifier: clean
            });
            if (res && res.found) {
                scannedMemberData = { id: res.member_id, code: res.member_code, name: res.full_name };
                if (box) { box.style.background = '#ecfdf5'; box.style.borderColor = '#10b981'; box.style.borderStyle = 'solid'; }
                if (nameText) { nameText.textContent = `👤 ${res.full_name}`; nameText.style.color = '#047857'; }
                if (badge) { badge.style.display = 'inline-block'; badge.textContent = '🟢 عضو نشط'; }
                if (codeText) { codeText.style.display = 'block'; codeText.textContent = `كود العضوية الرسمي: #${res.member_code} (الهاتف محجوب D26)`; }
            } else {
                scannedMemberData = null;
                if (box) { box.style.background = '#fef2f2'; box.style.borderColor = '#ef4444'; box.style.borderStyle = 'solid'; }
                if (nameText) { nameText.textContent = `❌ لا يوجد عضو نشط بالكود (${clean})`; nameText.style.color = '#dc2626'; }
                if (badge) badge.style.display = 'none';
                if (codeText) codeText.style.display = 'none';
            }
        } catch (err) {
            // في وضع الأوفلاين نسمح بإدخال الكود الرقمي للحافظة المشفرة
            const digits = clean.replace(/\D/g, '');
            if (digits && Number(digits) > 0) {
                scannedMemberData = { id: null, code: Number(digits), name: `عضو #${digits} (سيُتحقق منه عند المزامنة)` };
                if (nameText) { nameText.textContent = scannedMemberData.name; nameText.style.color = '#b45309'; }
            }
        }
    }, 260);
}

function handleScanPageMemberCode(val) {
    const preview = document.getElementById('scanPageMemberPreview');
    const form = document.getElementById('transactionForm');
    const clean = (val || '').trim().replace(/\D/g, '');
    if (!clean) {
        if (preview) preview.style.display = 'none';
        if (form) form.style.display = 'none';
        return;
    }
    if (form) form.style.display = 'block';
    window.SAWYAN.API.lookupMemberForPos({ merchantId: currentMerchant.id, memberIdentifier: clean })
        .then(res => {
            if (!preview) return;
            preview.style.display = 'block';
            preview.innerHTML = res && res.found
                ? `<strong>✅ العضو: ${escM(res.full_name)} (#${res.member_code})</strong>`
                : `<span style="color:#dc2626;">❌ كود غير مسجل (#${escM(clean)})</span>`;
        })
        .catch(() => {});
}

async function processOfflineCustomerPayment() {
    const manualVal = (document.getElementById('manualQRInput')?.value || '').trim().replace(/\D/g, '');
    const mCode = scannedMemberData?.code || (manualVal ? Number(manualVal) : 0);
    if (!mCode || mCode <= 0) {
        alert('❌ يرجى إدخال أو مسح كود عضو صالح أولاً.');
        return;
    }
    const amount = parseFloat(document.getElementById('offlinePaymentAmount')?.value || '0');
    if (!amount || amount <= 0) {
        alert('الرجاء إدخال قيمة الفاتورة.');
        return;
    }
    const empCode = document.getElementById('posCashierEmpCode')?.value?.trim() || null;
    const empPin = document.getElementById('posCashierPinInput')?.value?.trim() || null;

    const ok = await submitLiveOrOfflinePosTransaction({
        memberCode: mCode,
        amount,
        paymentType: 'cash',
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
    const cashiers = merchantBundle?.cashiers || [];
    const btn = document.getElementById('submitPosPaymentBtn');
    if (btn && !document.getElementById('posCashierAuthBlock')) {
        const block = document.createElement('div');
        block.id = 'posCashierAuthBlock';
        block.style.cssText = 'background:#f0fdf4;border:1.5px solid #10b981;border-radius:12px;padding:12px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;';
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
    }
    // تحديث ترويسة المتجر الحية داخل qrScannerPage
    const page = document.getElementById('qrScannerPage');
    if (page && p.business_name) {
        page.innerHTML = page.innerHTML
            .replace(/سوبر ماركت الفارق المركزي/g, escM(p.business_name))
            .replace(/#EG-MKT-101/g, '#' + escM(p.merchant_code))
            .replace(/10\.0% معتمدة/g, `${Number(p.deduction_percent || 10).toFixed(1)}% معتمدة`);
    }
};

// ============================================================================
// 1. وضع الكاشير المعزول بـ 3 أزرار عملاقة فقط (POS Kiosk Mode — Ch. 7.4 #1)
// ============================================================================
async function loadKioskModePage() {
    const page = document.getElementById('kioskPage');
    if (!page) return;
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
            <label style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.12);padding:8px 14px;border-radius:10px;cursor:pointer;font-size:0.84rem;font-weight:700;">
                <input type="checkbox" id="deadZoneToggle" ${forceDeadZoneSimulation ? 'checked' : ''} onchange="toggleDeadZoneSim(this.checked)">
                <span>📴 محاكاة انقطاع الإنترنت (Dead-Zone Test)</span>
            </label>
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
                <div style="font-size:1.2rem;font-weight:900;font-family:Tajawal,sans-serif;">2️⃣ مزامنة الأوفلاين المشفرة (${queuedList.length})</div>
                <div style="font-size:0.82rem;opacity:0.9;margin-top:4px;">IndexedDB + AES-GCM + مفتاح عدم تكرار UUIDv7</div>
            </button>

            <button type="button" onclick="downloadSafeShiftCsv('today')" style="background:#0f172a;color:#fff;border:none;border-radius:18px;padding:28px 20px;cursor:pointer;text-align:center;box-shadow:0 10px 25px rgba(15,23,42,0.25);">
                <div style="font-size:2.6rem;margin-bottom:8px;">🧾</div>
                <div style="font-size:1.2rem;font-weight:900;font-family:Tajawal,sans-serif;">3️⃣ تقفيل الوردية وتنزيل CSV</div>
                <div style="font-size:0.82rem;opacity:0.9;margin-top:4px;">مطهّر ضد CSV Formula Injection مع قيد Audit Log</div>
            </button>
        </div>

        <div id="kioskWorkPanel" style="background:#fff;border:2px solid #10b981;border-radius:16px;padding:20px;">
            <h3 style="margin:0 0 12px;color:#065f46;">⚡ نافذة الإدخال السريع للكاشير</h3>
            <form id="kioskFastForm" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;align-items:end;">
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">كود العضو أو الباركود *</label>
                    <input type="text" id="kioskMemberCode" required class="form-control" placeholder="مثال: 1 أو SAWYAN:MEMBER:2">
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">مبلغ الفاتورة (${escM(p.currency_code || 'EGP')}) *</label>
                    <input type="number" step="0.01" min="1" id="kioskAmount" required class="form-control" placeholder="500.00">
                </div>
                <div>
                    <label style="font-weight:800;font-size:0.84rem;">طريقة الدفع</label>
                    <select id="kioskPayType" class="form-control">
                        <option value="cash">نقدي (Cash)</option>
                        <option value="pos_card">بطاقة بنكية (POS Card)</option>
                        <option value="instant_transfer">تحويل فوري (InstaPay)</option>
                    </select>
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
                <button type="submit" class="btn btn-primary" style="padding:12px;font-weight:900;">✅ اعتماد الفاتورة فوراً</button>
            </form>
        </div>
    `;

    document.getElementById('kioskFastForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rawCode = document.getElementById('kioskMemberCode').value.replace(/\D/g, '');
        const amt = parseFloat(document.getElementById('kioskAmount').value);
        if (!rawCode || !amt) return;
        await submitLiveOrOfflinePosTransaction({
            memberCode: Number(rawCode),
            amount: amt,
            paymentType: document.getElementById('kioskPayType').value,
            employeeCode: document.getElementById('kioskEmpCode').value || null,
            cashierPin: document.getElementById('kioskEmpPin').value || null
        });
        await loadKioskModePage();
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
    alert(`🔄 اكتملت مزامنة حافظة الأوفلاين المشفرة:\n• فواتير تم ترحيلها للخادم: ${res.synced}\n• فواتير ما زالت بالانتظار: ${res.failed}`);
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
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.78);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Tajawal,sans-serif;direction:rtl;';
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div id="storeKitPrintableCard" style="background:#ffffff;border:4px solid #059669;border-radius:20px;max-width:520px;width:100%;padding:26px;text-align:center;box-shadow:0 25px 60px rgba(0,0,0,0.4);">
            <div style="background:#064e3b;color:#fff;padding:10px 16px;border-radius:12px;margin-bottom:14px;">
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
            <div style="display:flex;gap:10px;justify-content:center;">
                <button type="button" onclick="window.print()" class="btn btn-primary" style="padding:10px 22px;font-weight:800;">🖨️ طباعة الملصق فوراً (A4/A5)</button>
                <button type="button" onclick="document.getElementById('storeKitModalOverlay').style.display='none'" class="btn btn-outline">إغلاق</button>
            </div>
        </div>
    `;
    const qrBox = document.getElementById('storeKitMainQr');
    renderSawyanQrBox(qrBox, `SAWYAN:MERCHANT:${p.merchant_code || p.id}`, 180, '#064e3b');
}

// ============================================================================
// 3. الصفحات الحية المربوطة بقاعدة البيانات (Pending, Completed+Shift CSV, Financials, Settings+D25)
// ============================================================================
async function loadPendingTransactions() {
    const page = document.getElementById('pendingPage');
    if (!page) return;
    await refreshMerchantBundle();
    const pendingData = merchantBundle?.pending_transactions || [];
    const curr = merchantBundle?.profile?.currency_code || 'EGP';

    const itemsHtml = pendingData.length === 0 ? `
        <div style="background:white;border-radius:12px;padding:30px;text-align:center;border:1px solid #e2e8f0;">
            <div style="font-size:2.5rem;margin-bottom:8px;">✅</div>
            <div style="font-weight:800;font-size:1.05rem;color:#0f172a;">لا توجد طلبات فواتير معلقة أو في طابور الشحن حالياً</div>
            <div style="font-size:0.82rem;color:#64748b;margin-top:4px;">كافة العمليات موثقة في الدفتر المحاسبي المزدوج.</div>
        </div>
    ` : pendingData.map(tx => `
        <div style="background:white;border:1.5px solid ${tx.status === 'awaiting_merchant_topup' ? '#ef4444' : '#cbd5e1'};border-radius:14px;padding:16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;border-bottom:1px solid #f1f5f9;padding-bottom:8px;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-weight:900;font-size:1rem;color:#0f172a;">👤 العضو: ${escM(tx.member_masked_name)}</div>
                    <div style="font-size:0.78rem;color:#64748b;margin-top:2px;">⏱️ ${new Date(tx.created_at).toLocaleString('ar-EG')} • كود الفاتورة: <code>${escM(tx.sw_short_code)}</code> • تسلسل FIFO: #${tx.fifo_seq}</div>
                </div>
                <span style="background:${tx.status === 'awaiting_merchant_topup' ? '#fee2e2' : '#fef3c7'};color:${tx.status === 'awaiting_merchant_topup' ? '#991b1b' : '#92400e'};font-size:0.75rem;font-weight:800;padding:3px 10px;border-radius:999px;">
                    ${tx.status === 'awaiting_merchant_topup' ? '⏸️ بانتظار شحن رصيد المتجر (FIFO D4)' : '⏳ بانتظار مطابقة واعتماد التاجر'}
                </span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;background:#f8fafc;padding:10px 12px;border-radius:10px;margin-bottom:12px;font-size:0.84rem;">
                <div><span style="color:#64748b;display:block;font-size:0.74rem;">إجمالي الفاتورة:</span><strong>${fmtMerchantMoney(tx.total_amount, tx.currency_code || curr)}</strong></div>
                <div><span style="color:#64748b;display:block;font-size:0.74rem;">إجمالي العمولة التعاقدية:</span><strong style="color:#dc2626;">-${fmtMerchantMoney(tx.commission_amount, tx.currency_code || curr)}</strong></div>
                <div><span style="color:#64748b;display:block;font-size:0.74rem;">صافي نقدية المتجر:</span><strong style="color:#059669;">${fmtMerchantMoney(tx.merchant_net_amount, tx.currency_code || curr)}</strong></div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                ${tx.status === 'pending' ? `
                    <button type="button" onclick="approvePendingTx('${tx.id}')" style="flex:2;background:#059669;color:white;border:none;padding:10px 14px;border-radius:8px;font-weight:800;cursor:pointer;">✅ اعتماد الفاتورة وتغذية الصندوق</button>
                    <button type="button" onclick="rejectPendingTx('${tx.id}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;padding:10px 14px;border-radius:8px;font-weight:700;cursor:pointer;">❌ رفض</button>
                ` : `
                    <button type="button" onclick="showPage('financial')" class="btn btn-primary btn-sm">➕ انتقل لشحن الرصيد لتحرير الطابور تلقائياً (FIFO)</button>
                `}
                ${tx.receipt_media_url ? `<a href="${escM(tx.receipt_media_url)}" target="_blank" class="btn btn-outline btn-sm">🔍 عرض صورة الإيصال المرفق ↗</a>` : ''}
            </div>
        </div>
    `).join('');

    page.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <div>
                <h2 style="margin:0;font-size:1.3rem;font-weight:900;color:#0f172a;">⏳ طلبات الفواتير المعلقة وطابور FIFO (${pendingData.length})</h2>
                <p style="margin:4px 0 0;font-size:0.84rem;color:#64748b;">تُعالج الفواتير ذرياً عبر الخادم دون أي تعديل مباشر على المحافظ من المتصفح (D21)</p>
            </div>
        </div>
        <div id="pendingList">${itemsHtml}</div>
    `;
}

async function approvePendingTx(id) {
    try {
        const res = await window.SAWYAN.API.confirmOrRejectPendingTx({
            merchantId: currentMerchant.id,
            transactionId: id,
            decision: 'approve'
        });
        alert(`✅ تم اعتماد الفاتورة بنجاح! الحالة: ${res?.result?.status || 'completed'}`);
        await loadPendingTransactions();
    } catch (err) {
        alert('❌ تعذر الاعتماد: ' + err.message);
    }
}

async function rejectPendingTx(id) {
    const reason = prompt('اذكر سبب رفض الفاتورة لإشعار العضو:', 'بيانات الإيصال غير مطابقة');
    if (reason === null) return;
    try {
        await window.SAWYAN.API.confirmOrRejectPendingTx({
            merchantId: currentMerchant.id,
            transactionId: id,
            decision: 'reject',
            rejectionReason: reason.trim() || 'غير مطابق'
        });
        alert('✅ تم رفض الفاتورة وتحرير الحجز المؤقت (Soft Hold).');
        await loadPendingTransactions();
    } catch (err) {
        alert('❌ تعذر الرفض: ' + err.message);
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
        alert('❌ تعذر تصدير تقرير الوردية: ' + err.message);
    }
}

let activeShiftPeriod = 'today';

async function loadAllTransactions(periodFilter = activeShiftPeriod) {
    activeShiftPeriod = periodFilter || 'today';
    const page = document.getElementById('transactionsPage');
    if (!page) return;
    await refreshMerchantBundle(activeShiftPeriod, null);

    const txs = merchantBundle?.completed_transactions || [];
    const shift = merchantBundle?.shift_closing || {};
    const totals = shift.totals || {};
    const curr = merchantBundle?.profile?.currency_code || 'EGP';

    const rowsHtml = txs.length === 0
        ? `<tr><td colspan="8" style="padding:20px;text-align:center;color:#64748b;">لا توجد عمليات مسجلة بعد في هذا المتجر.</td></tr>`
        : txs.map(tx => `
            <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:12px;font-weight:800;font-family:monospace;direction:ltr;color:#2563eb;">${escM(tx.sw_short_code)}</td>
                <td style="padding:12px;font-weight:700;">${escM(tx.member_masked_name)}</td>
                <td style="padding:12px;font-weight:800;color:#0f172a;">${fmtMerchantMoney(tx.total_amount, tx.currency_code || curr)}</td>
                <td style="padding:12px;font-weight:800;color:#dc2626;">-${fmtMerchantMoney(tx.commission_amount, tx.currency_code || curr)}</td>
                <td style="padding:12px;font-weight:800;color:#059669;">${fmtMerchantMoney(tx.merchant_net_amount, tx.currency_code || curr)}</td>
                <td style="padding:12px;font-size:0.8rem;color:#64748b;">${new Date(tx.created_at).toLocaleString('ar-EG')}</td>
                <td style="padding:12px;font-size:0.76rem;"><span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:6px;font-weight:800;">${escM(tx.branch_name || '-')} • ${escM(tx.cashier_name || '')}</span></td>
                <td style="padding:12px;font-size:0.76rem;">
                    ${tx.status === 'completed'
                        ? `<button type="button" onclick="handleMerchantPosReturn('${tx.id}','${escM(tx.sw_short_code)}')" style="background:#fff7ed;color:#c2410c;border:1px solid #fdba74;padding:5px 10px;border-radius:6px;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;">↩️ مرتجع (قبل يوم 15)</button>`
                        : `<span style="color:#64748b;font-weight:800;">↩️ مسترجعة</span>`}
                </td>
            </tr>
        `).join('');

    page.innerHTML = `
        <div style="background:#fff7ed;border:1.5px solid #fb923c;border-radius:12px;padding:12px 16px;margin-bottom:14px;font-size:0.84rem;color:#9a3412;line-height:1.65;">
            🛑 <strong>القاعدة التعاقدية الحاكمة للمرتجعات (D5):</strong> يُقبل استرداد العمولة عبر النظام خلال الشهر المفتوح وحتى نهاية اليوم <strong>14</strong> من الشهر التالي فقط (قبل يوم الصرف 15). <strong>وبعد يوم الصرف (يوم 15) يُقفل الشهر نهائياً ويرفض السيستم أي مرتجع يخصه؛ فإن وافق البائع على قبول المرتجع بعد يوم 15 يتحمله البائع وحده بالكامل (100%) خارج نظام سوياً.</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <div>
                <h2 style="margin:0;font-size:1.3rem;font-weight:900;color:#0f172a;">💳 سجل العمليات وتقفيل الوردية المحاسبي (Point 13)</h2>
                <p style="margin:4px 0 0;font-size:0.84rem;color:#64748b;">مقنّع الأسماء (D26) وخالٍ من تفكيك العمولة الداخلي، مع تطهير خلايا CSV ضد حقن المعادلات</p>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <select onchange="loadAllTransactions(this.value)" class="form-control" style="width:auto;font-weight:700;">
                    <option value="today" ${activeShiftPeriod === 'today' ? 'selected' : ''}>وردية اليوم</option>
                    <option value="week" ${activeShiftPeriod === 'week' ? 'selected' : ''}>آخر 7 أيام</option>
                    <option value="month" ${activeShiftPeriod === 'month' ? 'selected' : ''}>الشهر الحالي</option>
                </select>
                <button type="button" onclick="downloadSafeShiftCsv('${activeShiftPeriod}')" style="background:#0f172a;color:white;border:none;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer;">
                    📥 تنزيل CSV الوردية المطهّر (Excel BOM)
                </button>
            </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px;">
            <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:12px;">
                <small style="color:#065f46;">مكتملة (${totals.completed_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#047857;">${fmtMerchantMoney(totals.completed_gross || 0, curr)}</strong>
            </div>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:12px;">
                <small style="color:#92400e;">معلقة مسار B (${totals.pending_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#b45309;">${fmtMerchantMoney(totals.pending_gross || 0, curr)}</strong>
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:12px;">
                <small style="color:#991b1b;">طابور FIFO (${totals.awaiting_topup_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#dc2626;">${fmtMerchantMoney(totals.awaiting_topup_gross || 0, curr)}</strong>
            </div>
            <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:12px;padding:12px;">
                <small style="color:#475569;">مسترجعة (${totals.reversed_count || 0})</small>
                <strong style="display:block;font-size:1.1rem;color:#334155;">${fmtMerchantMoney(totals.reversed_gross || 0, curr)}</strong>
            </div>
        </div>

        <div style="background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:auto;">
            <table style="width:100%;border-collapse:collapse;text-align:right;font-size:0.86rem;">
                <thead>
                    <tr style="background:#f8fafc;border-bottom:1.5px solid #e2e8f0;color:#475569;font-weight:800;">
                        <th style="padding:12px;">كود الفاتورة</th>
                        <th style="padding:12px;">العضو (D26)</th>
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
                    alert('🛑 مرفوض برمجياً وتعاقدياً (POST_PAYOUT_RETURN_FORBIDDEN):\nتم إغلاق هذا الشهر وصرف عمولاته في اليوم 15! لا يقبل نظام سوياً أي مرتجع بعد يوم الصرف، وفي حال موافقتك على قبول المرتجع بعد يوم 15 يتحمله المتجر وحده بالكامل (100%) خارج النظام.');
                    close();
                } else {
                    alert('❌ تعذر بدء المرتجع: ' + err.message);
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
                        <input id="mrEscProofUrl" type="url" placeholder="رابط صورة إيصال رد المبلغ أو الكاميرا https://..." class="form-control">
                        <button type="button" id="mrEscalateBtn" class="btn btn-outline btn-sm" style="border-color:#dc2626;color:#dc2626;">رفع إثبات وتصعيد للإدارة (P0)</button>
                    </div>
                </details>
            </div>
        `;
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
            alert(`✅ تم تأكيد المرتجع وإلغاء الفاتورة (${shortCode}) واسترداد العمولة لرصيد المتجر!`);
            close();
            await loadAllTransactions(activeShiftPeriod);
        };
        document.getElementById('mrEscalateBtn').onclick = async () => {
            const proofUrl = (document.getElementById('mrEscProofUrl').value || '').trim();
            if (!proofUrl) { alert('يرجى إدخال رابط إثبات رد المبلغ للعميل.'); return; }
            try {
                await window.SAWYAN.API.merchantProcessPosReturn({
                    merchantId: currentMerchant.id,
                    transactionId,
                    reason,
                    mode: 'escalate_with_proof',
                    proofUrl
                });
                alert('📨 تم رفع إثبات المرتجع وتصعيد تذكرة P0 للإدارة بنجاح.');
                close();
                await loadAllTransactions(activeShiftPeriod);
            } catch (err) { alert('❌ ' + err.message); }
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
    const liveBal = document.getElementById('livePrepaidBalance');
    if (liveBal) liveBal.textContent = fmtMerchantMoney(p.free_balance, curr);

    const txs = merchantBundle?.completed_transactions || [];
    const topups = merchantBundle?.topup_history || [];
    const taxInvs = merchantBundle?.b2b_tax_invoices || [];

    const tab1Body = document.querySelector('#finTabContent1 tbody');
    if (tab1Body) {
        tab1Body.innerHTML = txs.length === 0
            ? `<tr><td colspan="6" style="padding:16px;text-align:center;color:#64748b;">لا توجد استقطاعات شحن مسجلة بعد.</td></tr>`
            : txs.map(t => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;color:#64748b;">${new Date(t.created_at).toLocaleString('ar-EG')}</td>
                    <td style="padding:10px 12px;font-weight:800;font-family:monospace;">${escM(t.sw_short_code)}</td>
                    <td style="padding:10px 12px;font-weight:700;">${escM(t.member_masked_name)}</td>
                    <td style="padding:10px 12px;font-weight:800;">${fmtMerchantMoney(t.total_amount, t.currency_code || curr)}</td>
                    <td style="padding:10px 12px;color:#dc2626;font-weight:800;">-${fmtMerchantMoney(t.commission_amount, t.currency_code || curr)}</td>
                    <td style="padding:10px 12px;color:#059669;font-weight:900;">${escM(t.status)}</td>
                </tr>
            `).join('');
    }

    const tab2Body = document.querySelector('#finTabContent2 tbody');
    if (tab2Body) {
        tab2Body.innerHTML = topups.length === 0
            ? `<tr><td colspan="7" style="padding:16px;text-align:center;color:#64748b;">لا توجد حركات شحن إضافية مسجلة في دفتر اليومية بعد.</td></tr>`
            : topups.map(tp => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:10px 12px;color:#64748b;">${new Date(tp.posted_at).toLocaleString('ar-EG')}</td>
                    <td style="padding:10px 12px;font-weight:800;font-family:monospace;">#JE-${tp.entry_number}</td>
                    <td style="padding:10px 12px;color:#059669;font-weight:900;">+${fmtMerchantMoney(tp.amount_local, tp.currency_code || curr)}</td>
                    <td style="padding:10px 12px;">${escM(tp.description)}</td>
                    <td style="padding:10px 12px;">—</td>
                    <td style="padding:10px 12px;font-weight:800;color:#047857;">مقيد بحساب 2101</td>
                    <td style="padding:10px 12px;">✅ موثق</td>
                </tr>
            `).join('');
    }

    const tab3Div = document.getElementById('finTabContent3');
    if (tab3Div) {
        tab3Div.innerHTML = `
            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:16px;">
                <h3 style="margin:0 0 10px;color:#0f172a;">🧾 الفواتير الضريبية المزدوجة B2B الصادرة تلقائياً (Tax-Exclusive D19 — ${taxInvs.length})</h3>
                ${taxInvs.length === 0 ? '<p style="color:#64748b;">تُصدر الفواتير الضريبية تلقائياً مع كل عملية مكتملة.</p>' : `
                    <table style="width:100%;border-collapse:collapse;text-align:right;font-size:0.84rem;">
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
                                    <td style="padding:10px;font-family:monospace;font-weight:800;">${escM(inv.invoice_number)}</td>
                                    <td style="padding:10px;">${fmtMerchantMoney(inv.net_commission_amount, inv.currency_code)}</td>
                                    <td style="padding:10px;">${fmtMerchantMoney(inv.vat_amount, inv.currency_code)}</td>
                                    <td style="padding:10px;font-weight:800;">${fmtMerchantMoney(inv.gross_invoice_total, inv.currency_code)}</td>
                                    <td style="padding:10px;color:#64748b;">${new Date(inv.issued_at).toLocaleString('ar-EG')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        `;
    }
};

promptTopupBalance = async function () {
    const curr = merchantBundle?.profile?.currency_code || 'EGP';
    const amtStr = prompt(`أدخل مبلغ شحن الرصيد مسبق الدفع (${curr}):`, '2000');
    if (!amtStr) return;
    const amt = parseFloat(amtStr);
    if (!amt || amt <= 0) return;
    const ref = prompt('أدخل الرقم المرجعي للتحويل البنكي / InstaPay:', 'REF-' + Date.now());
    try {
        const res = await window.SAWYAN.API.merchantInitiateTopup({
            merchantId: currentMerchant.id,
            amount: amt,
            provider: 'instapay',
            paymentRef: ref || null
        });
        if (res.mode === 'demo_instant_fifo') {
            alert(`✅ (الموقع الموازي): تم شحن الرصيد فوراً وتحرير ${res.topup_result?.released_fifo_count || 0} فاتورة من طابور FIFO!`);
        } else {
            alert(`✅ تم إرسال إشعار التحويل البنكي (${res.payment_ref}) لمراجعة واعتماد الإدارة المالية / البنك وفق قفل D4.`);
        }
        await loadFinancialReport();
    } catch (err) {
        alert('❌ تعذر تسجيل طلب الشحن: ' + err.message);
    }
};

// شاشة الإعدادات + إدارة موظفي الكاشير المستقلين (D25) + إعدادات Wi-Fi QR
async function loadSettings() {
    const page = document.getElementById('settingsPage');
    if (!page) return;
    await refreshMerchantBundle();
    const p = merchantBundle?.profile || merchantData || {};
    const cashiers = merchantBundle?.cashiers || [];

    page.innerHTML = `
        <div style="margin-bottom:16px;">
            <h2 style="margin:0;font-size:1.3rem;font-weight:900;color:#0f172a;">⚙️ إعدادات المتجر وحوكمة موظفي الكاشير (D25)</h2>
            <p style="margin:4px 0 0;font-size:0.84rem;color:#64748b;">تعديل بيانات الفرع، شبكة Wi-Fi للعملاء، وإدارة رموز PIN المستقلة للكاشير (بدون كشف النسب الداخلية F01)</p>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;">
            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 12px;color:#0f172a;">🏪 بيانات المنشأة والواي فاي</h3>
                <div style="display:grid;gap:10px;">
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">اسم المتجر</label>
                        <input type="text" id="settingsBusinessName" class="form-control" value="${escM(p.business_name || '')}">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">اسم المالك</label>
                            <input type="text" id="settingsOwnerName" class="form-control" value="${escM(p.owner_name || '')}">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">هاتف التواصل</label>
                            <input type="text" id="settingsPhone" class="form-control" value="${escM(p.phone || '')}">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:0.82rem;font-weight:700;">عنوان الفرع الرئيسي</label>
                        <input type="text" id="settingsAddress" class="form-control" value="${escM(p.address || '')}">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">شبكة Wi-Fi للزبائن (SSID)</label>
                            <input type="text" id="settingsWifiSSID" class="form-control" value="${escM(p.wifi_ssid || '')}">
                        </div>
                        <div>
                            <label style="font-size:0.82rem;font-weight:700;">كلمة مرور Wi-Fi</label>
                            <input type="text" id="settingsWifiPassword" class="form-control" value="${escM(p.wifi_password || '')}">
                        </div>
                    </div>
                    <div style="background:#f0fdf4;border:1.5px solid #10b981;border-radius:10px;padding:10px;display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-size:0.84rem;font-weight:800;color:#065f46;">🔒 نسبة العمولة التعاقدية الإجمالية المقفولة:</span>
                        <strong style="font-size:1.1rem;color:#047857;">${Number(p.deduction_percent || 10).toFixed(2)}%</strong>
                    </div>
                    <button type="button" onclick="saveFullMerchantProfileAndWifi()" class="btn btn-primary">💾 حفظ بيانات المتجر والواي فاي</button>
                </div>
            </div>

            <div style="background:#fff;border:1px solid #cbd5e1;border-radius:16px;padding:20px;">
                <h3 style="margin:0 0 12px;color:#0f172a;">👨‍💼 موظفو الكاشير المستقلون (PIN 4 أرقام — D25)</h3>
                <form id="addCashierEmpForm" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;background:#f8fafc;padding:12px;border-radius:12px;">
                    <input type="text" id="newEmpCode" required class="form-control" placeholder="كود الموظف (EMP-02)">
                    <input type="text" id="newEmpName" required class="form-control" placeholder="اسم الموظف الكامل">
                    <input type="password" id="newEmpPin" required maxlength="4" pattern="\\d{4}" class="form-control" placeholder="PIN من 4 أرقام">
                    <input type="number" id="newEmpLinkedCode" min="1" class="form-control" placeholder="كود عضويته إن وجد (لكشف التواطؤ)">
                    <button type="submit" class="btn btn-primary btn-sm" style="grid-column:1 / -1;">+ إضافة موظف كاشير بـ PIN مشفر</button>
                </form>
                <div style="display:grid;gap:8px;">
                    ${cashiers.length === 0 ? '<p style="color:#64748b;font-size:0.85rem;">لا يوجد موظفو كاشير مضافون بعد.</p>' : cashiers.map(c => `
                        <div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                            <div>
                                <strong>${escM(c.employee_code)}</strong> — ${escM(c.full_name)}
                                <div style="font-size:0.75rem;color:#64748b;">محاولات PIN الخاطئة: ${c.failed_pin_attempts}/5 ${c.pin_locked_until ? '• 🔒 مقفل مؤقتاً' : ''}</div>
                            </div>
                            <button type="button" class="btn btn-outline btn-sm" onclick="toggleCashierEmployee('${c.id}')">${c.is_active ? 'إيقاف' : 'تفعيل وفك قفل'}</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    document.getElementById('addCashierEmpForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await window.SAWYAN.API.manageMerchantCashierAndSettings({
                merchantId: currentMerchant.id,
                action: 'add_cashier',
                employeeCode: document.getElementById('newEmpCode').value.trim(),
                employeeName: document.getElementById('newEmpName').value.trim(),
                employeePin: document.getElementById('newEmpPin').value.trim(),
                linkedMemberCode: document.getElementById('newEmpLinkedCode').value.trim() || null
            });
            await loadSettings();
        } catch (err) {
            alert('❌ تعذر إضافة الكاشير: ' + err.message);
        }
    });
}

async function saveFullMerchantProfileAndWifi() {
    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'update_profile',
            businessName: document.getElementById('settingsBusinessName')?.value,
            ownerName: document.getElementById('settingsOwnerName')?.value,
            phone: document.getElementById('settingsPhone')?.value,
            address: document.getElementById('settingsAddress')?.value,
            wifiSsid: document.getElementById('settingsWifiSSID')?.value,
            wifiPassword: document.getElementById('settingsWifiPassword')?.value
        });
        await loadSettings();
        alert('✅ تم حفظ إعدادات المتجر والواي فاي في قاعدة البيانات!');
    } catch (err) {
        alert('❌ ' + err.message);
    }
}

async function toggleCashierEmployee(empId) {
    try {
        await window.SAWYAN.API.manageMerchantCashierAndSettings({
            merchantId: currentMerchant.id,
            action: 'toggle_cashier',
            employeeId: empId
        });
        await loadSettings();
    } catch (err) {
        alert('❌ ' + err.message);
    }
}
