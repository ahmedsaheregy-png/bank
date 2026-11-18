/* ============================================================
   SAWYAN Admin — Screen 1: Command Center (Home) — DEMO SIMULATION
   - بيانات محاكاة متسقة حسابياً (ليست إنتاجية)
   - مصدر الحقيقة الواحد: window.SAWYAN_ADMIN_DEMO (تُغذّى منه باقي الشاشات لاحقاً)
   ============================================================ */
if (typeof window !== 'undefined' && window.SAWYAN && !window.SAWYAN.isParallelDemo) {
    console.log('[SAWYAN Admin] Production mode active: skipping demo simulation override on #homePage.');
    window.SAWYAN_ADMIN_DEMO = null;
    return;
}
window.SAWYAN_ADMIN_DEMO = {
    period_label: 'من 1 إلى 14 نوفمبر 2026',
    members: { total: 4860, active: 4780, pending_kyc: 23, suspended: 57 },
    merchants: { total: 38, active: 36, frozen: 1, pending_approval: 1, low_balance: 2 },
    ops_mtd: 1978,
    gmv_mtd: 1284600,
    commission_rate: 0.10,
    treasury_share: 0.25,
    plan_share: 0.75,
    prepaid_held: 186300,
    low_balance_threshold: 500,
    pending: { withdrawals: 12, disputes: 3, support: 9 },
    daily_ops: [
        { d: 'الأحد 8', v: 128 }, { d: 'الاثنين 9', v: 141 }, { d: 'الثلاثاء 10', v: 119 },
        { d: 'الأربعاء 11', v: 152 }, { d: 'الخميس 12', v: 163 }, { d: 'الجمعة 13', v: 187 },
        { d: 'السبت 14', v: 148 }
    ],
    categories: [
        { n: 'سوبر ماركت', p: 41, c: '#10b981' }, { n: 'صيدليات', p: 18, c: '#3b82f6' },
        { n: 'مطاعم وكافيهات', p: 16, c: '#f59e0b' }, { n: 'ملابس', p: 11, c: '#8b5cf6' },
        { n: 'إلكترونيات', p: 9, c: '#ef4444' }, { n: 'أخرى', p: 5, c: '#94a3b8' }
    ],
    activity: [
        { t: 'اليوم 06:45 م', i: '💳', x: 'أحمد مصطفى (#124) اشترى من سوبر ماركت الفارق المركزي بمبلغ 500.00 ج.م', c: '50.00' },
        { t: 'اليوم 05:20 م', i: '💳', x: 'منى علي (#210) اشترت من صيدلية الشفاء بمبلغ 340.00 ج.م', c: '34.00' },
        { t: 'اليوم 04:30 م', i: '💳', x: 'خالد حسن (#125) اشترى من سوبر ماركت الفارق المركزي بمبلغ 1,250.00 ج.م', c: '125.00' },
        { t: 'اليوم 03:10 م', i: '💸', x: 'طلب سحب جديد من العضو محمد دمير (#101) بمبلغ 1,500.00 ج.م — بانتظار المراجعة', c: null },
        { t: 'اليوم 02:15 م', i: '💳', x: 'إبراهيم عادل (#135) اشترى من سوبر ماركت الفارق المركزي بمبلغ 825.00 ج.م', c: '82.50' },
        { t: 'اليوم 01:05 م', i: '💳', x: 'يوسف كمال (#318) اشترى من مطعم البيت الشامي بمبلغ 780.00 ج.م', c: '78.00' }
    ]
};

(function () {
    var D = window.SAWYAN_ADMIN_DEMO;
    var fmt = function (n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var fmt0 = function (n) { return Number(n).toLocaleString('en-US'); };

    // الانتقال لأي شاشة عبر نفس زر الشريط الجانبي (يضمن تحميل المحتوى)
    window.goAdminPage = function (page) {
        var link = document.querySelector('.sidebar .nav-item[data-page="' + page + '"]') ||
                   document.querySelector('.nav-item[data-page="' + page + '"]');
        if (link) link.click();
    };

    window.scrollToPromoQueue = function () {
        var el = document.getElementById('adminPromoModerationSection');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    function promoPendingCount() {
        var p = null;
        try { p = JSON.parse(localStorage.getItem('sawyan_active_merchant_promo') || 'null'); } catch (e) { p = null; }
        if (!p) return 1; // الطلب التجريبي الافتراضي (PRM-892) معلّق
        return p.status === 'PENDING_ADMIN_APPROVAL' ? 1 : 0;
    }

    function actionRow(icon, count, title, hint, btnLabel, onclick, id) {
        var done = count === 0;
        return '' +
        '<div id="' + (id || '') + '" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:1.5px solid ' + (done ? '#d1fae5' : '#fde68a') + '; background:' + (done ? '#f0fdf4' : '#fffbeb') + '; border-radius:12px;">' +
            '<div style="display:flex; align-items:center; gap:12px;">' +
                '<div style="min-width:44px; height:44px; border-radius:12px; background:' + (done ? '#10b981' : '#f59e0b') + '; color:white; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.15rem; font-family:Poppins,sans-serif;">' + (done ? '✓' : count) + '</div>' +
                '<div>' +
                    '<div style="font-weight:800; color:#0f172a; font-size:0.95rem;">' + icon + ' ' + title + '</div>' +
                    '<div style="font-size:0.78rem; color:#64748b; margin-top:2px;">' + (done ? 'لا يوجد شيء معلّق ✅' : hint) + '</div>' +
                '</div>' +
            '</div>' +
            '<button onclick="' + onclick + '" style="background:white; color:#047857; border:1.5px solid #10b981; padding:7px 16px; border-radius:8px; font-weight:800; font-size:0.82rem; cursor:pointer; font-family:Tajawal,sans-serif; white-space:nowrap;">' + btnLabel + '</button>' +
        '</div>';
    }

    function kpi(icon, label, value, sub, color) {
        return '' +
        '<div style="background:white; border:1px solid #e2e8f0; border-right:4px solid ' + color + '; border-radius:14px; padding:16px 18px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">' +
            '<div style="display:flex; justify-content:space-between; align-items:flex-start;">' +
                '<div style="min-width:0;">' +
                    '<div style="font-size:0.8rem; color:#64748b; font-weight:700;">' + label + '</div>' +
                    '<div style="font-size:1.55rem; font-weight:900; color:#0f172a; margin-top:4px; font-family:Poppins,Tajawal,sans-serif;">' + value + '</div>' +
                '</div>' +
                '<div style="font-size:1.6rem;">' + icon + '</div>' +
            '</div>' +
            '<div style="font-size:0.76rem; color:#475569; margin-top:6px; line-height:1.6;">' + sub + '</div>' +
        '</div>';
    }

    function renderHome() {
        var page = document.getElementById('homePage');
        if (!page) return;

        var comm = D.gmv_mtd * D.commission_rate;
        var treasury = comm * D.treasury_share;
        var plan = comm * D.plan_share;
        var avgTicket = D.gmv_mtd / D.ops_mtd;
        var weekTotal = D.daily_ops.reduce(function (s, x) { return s + x.v; }, 0);
        var maxV = Math.max.apply(null, D.daily_ops.map(function (x) { return x.v; }));

        // --- الرسم الأسبوعي (أعمدة CSS) ---
        var bars = D.daily_ops.map(function (x, idx) {
            var h = Math.round((x.v / maxV) * 150);
            var last = idx === D.daily_ops.length - 1;
            return '<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px;">' +
                '<div style="font-size:0.72rem; font-weight:800; color:#0f172a; font-family:Poppins,sans-serif;">' + x.v + '</div>' +
                '<div style="width:70%; max-width:38px; height:' + h + 'px; background:' + (last ? '#059669' : '#6ee7b7') + '; border-radius:6px 6px 0 0;"></div>' +
                '<div style="font-size:0.66rem; color:#64748b; text-align:center; line-height:1.2;">' + x.d + '</div>' +
            '</div>';
        }).join('');

        // --- توزيع الفئات ---
        var cats = D.categories.map(function (c) {
            return '<div style="margin-bottom:10px;">' +
                '<div style="display:flex; justify-content:space-between; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:3px;"><span>' + c.n + '</span><span style="font-family:Poppins,sans-serif;">' + c.p + '%</span></div>' +
                '<div style="background:#f1f5f9; border-radius:6px; height:10px; overflow:hidden;"><div style="width:' + c.p + '%; height:100%; background:' + c.c + ';"></div></div>' +
            '</div>';
        }).join('');

        // --- النشاط الأخير ---
        var act = D.activity.map(function (a) {
            return '<div style="display:flex; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid #f1f5f9;">' +
                '<div style="width:38px; height:38px; background:#ecfdf5; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">' + a.i + '</div>' +
                '<div style="flex:1; font-size:0.86rem; color:#1e293b; font-weight:600;">' + a.x +
                    (a.c ? ' <span style="color:#059669; font-weight:800;">• عمولة سويا ' + a.c + ' ج.م</span>' : '') + '</div>' +
                '<div style="font-size:0.74rem; color:#94a3b8; white-space:nowrap;">' + a.t + '</div>' +
            '</div>';
        }).join('');

        page.innerHTML = '' +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">' +
            '<div><div style="font-size:1.1rem; font-weight:900; color:#0f172a;">🧭 غرفة العمليات المركزية</div>' +
            '<div style="font-size:0.8rem; color:#64748b; margin-top:2px;">ملخص الشهر الجاري: ' + D.period_label + '</div></div>' +
            '<span style="background:#fef3c7; color:#92400e; border:1px solid #fcd34d; padding:4px 12px; border-radius:8px; font-size:0.74rem; font-weight:800;">🧪 بيانات محاكاة للتجربة</span>' +
        '</div>' +

        // KPIs
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(250px, 1fr)); gap:14px; margin-bottom:18px;">' +
            kpi('👥', 'إجمالي الأعضاء', fmt0(D.members.total), fmt0(D.members.active) + ' نشط • ' + D.members.pending_kyc + ' بانتظار توثيق الهوية • ' + D.members.suspended + ' موقوف', '#3b82f6') +
            kpi('🏪', 'إجمالي التجار', fmt0(D.merchants.total), D.merchants.active + ' نشط • ' + D.merchants.frozen + ' مجمّد • ' + D.merchants.pending_approval + ' بانتظار الاعتماد', '#10b981') +
            kpi('💳', 'عمليات الشهر حتى الآن', fmt0(D.ops_mtd), 'متوسط الفاتورة ' + fmt(avgTicket) + ' ج.م', '#6366f1') +
            kpi('🛒', 'حجم مبيعات الأعضاء (GMV)', fmt(D.gmv_mtd) + ' <span style="font-size:0.9rem;">ج.م</span>', 'إجمالي ما اشتراه الأعضاء من التجار هذا الشهر', '#0ea5e9') +
            kpi('💰', 'عمولات سويا المحصّلة (' + (D.commission_rate * 100) + '%)', fmt(comm) + ' <span style="font-size:0.9rem;">ج.م</span>',
                'خزينة الشركة (25%): <b>' + fmt(treasury) + '</b> ج.م<br>خطة الدخل والأعضاء (75%): <b>' + fmt(plan) + '</b> ج.م', '#f59e0b') +
            kpi('🛡️', 'أرصدة الشحن المسبق لدى التجار', fmt(D.prepaid_held) + ' <span style="font-size:0.9rem;">ج.م</span>',
                'التزام على المنصة: مبالغ دفعها التجار مقدماً ولم تُستهلك بعد', '#059669') +
        '</div>' +

        // مركز القرارات
        '<div style="background:white; border:1.5px solid #e2e8f0; border-radius:14px; padding:18px; margin-bottom:18px;">' +
            '<div style="font-weight:900; color:#0f172a; font-size:1.05rem; margin-bottom:4px;">⚡ يحتاج قرارك الآن</div>' +
            '<div style="font-size:0.78rem; color:#64748b; margin-bottom:12px;">كل بند يفتح الشاشة المختصة لاتخاذ القرار</div>' +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:10px;">' +
                actionRow('📢', promoPendingCount(), 'طلبات إعلانات ترويجية من التجار', 'تُراجَع نصوصها قبل البث لهواتف الأعضاء', 'مراجعة الآن', 'scrollToPromoQueue()', 'actionRowPromo') +
                actionRow('💸', D.pending.withdrawals, 'طلبات سحب أرباح الأعضاء', 'تحقق من الهوية وبيانات الحساب قبل التحويل', 'فتح طلبات السحب', "goAdminPage('withdrawals')") +
                actionRow('🪪', D.members.pending_kyc, 'أعضاء بانتظار توثيق الهوية (KYC)', 'شرط لصرف أول سحب', 'فتح الأعضاء', "goAdminPage('members')") +
                actionRow('🔋', D.merchants.low_balance, 'تجار رصيد شحنهم تحت ' + D.low_balance_threshold + ' ج.م', 'خطر عزلهم عن رادار الأعضاء قريباً', 'فتح التجار', "goAdminPage('merchants')") +
                actionRow('🏪', D.merchants.pending_approval, 'طلبات انضمام تجار جدد', 'مراجعة المستندات واعتماد النسبة', 'فتح التجار', "goAdminPage('merchants')") +
                actionRow('⚠️', D.pending.disputes, 'نزاعات مفتوحة بين الأعضاء والتجار', 'تحكيم إداري ملزم', 'فتح الشكاوى', "goAdminPage('disputes')") +
                actionRow('🎫', D.pending.support, 'تذاكر دعم فني مفتوحة', 'أعضاء وتجار ينتظرون الرد', 'فتح الدعم الفني', "goAdminPage('support')") +
            '</div>' +
        '</div>' +

        // الرسوم
        '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(380px, 1fr)); gap:14px; margin-bottom:18px;">' +
            '<div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px;">' +
                '<div style="font-weight:900; color:#0f172a; margin-bottom:2px;">📈 العمليات اليومية (آخر 7 أيام)</div>' +
                '<div style="font-size:0.76rem; color:#64748b; margin-bottom:12px;">الإجمالي: <b>' + fmt0(weekTotal) + '</b> عملية</div>' +
                '<div style="display:flex; align-items:flex-end; gap:6px; height:210px; padding-top:6px;">' + bars + '</div>' +
            '</div>' +
            '<div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px;">' +
                '<div style="font-weight:900; color:#0f172a; margin-bottom:2px;">🧩 توزيع المبيعات حسب فئة التاجر</div>' +
                '<div style="font-size:0.76rem; color:#64748b; margin-bottom:12px;">نسبة كل فئة من حجم مبيعات الشهر</div>' + cats +
            '</div>' +
        '</div>' +

        // مكان بطاقة اعتماد الإعلانات
        '<div id="promoQueueSlot"></div>' +

        // النشاط
        '<div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px;">' +
            '<div style="font-weight:900; color:#0f172a; margin-bottom:6px;">🕒 النشاط الأخير</div>' + act +
        '</div>';

        // نقل بطاقة اعتماد الإعلانات داخل الرئيسية فقط (كانت تظهر أسفل كل الشاشات)
        var promo = document.getElementById('adminPromoModerationSection');
        var slot = document.getElementById('promoQueueSlot');
        if (promo && slot) slot.appendChild(promo);
    }

    // تحديث صف الإعلانات في مركز القرارات بعد اعتماد/رفض/إعادة تعيين
    function refreshPromoRow() {
        var row = document.getElementById('actionRowPromo');
        if (!row) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = actionRow('📢', promoPendingCount(), 'طلبات إعلانات ترويجية من التجار', 'تُراجَع نصوصها قبل البث لهواتف الأعضاء', 'مراجعة الآن', 'scrollToPromoQueue()', 'actionRowPromo');
        row.replaceWith(tmp.firstChild);
    }
    var _origRender = window.renderAdminPromoQueue;
    if (typeof _origRender === 'function') {
        window.renderAdminPromoQueue = function () { _origRender(); refreshPromoRow(); };
    }

    // استبدال محمّلات الصفحة الرئيسية القديمة (التي كانت تقرأ قاعدة بيانات شبه فارغة)
    window.loadStats = async function () { renderHome(); };
    window.loadRecentActivity = async function () { /* مدمج في renderHome */ };

    // لو كانت الصفحة قد حُمّلت بالفعل نعيد الرسم فوراً
    if (document.readyState !== 'loading') {
        setTimeout(function () { renderHome(); refreshPromoRow(); }, 0);
    }
})();

