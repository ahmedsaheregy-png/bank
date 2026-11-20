/* ============================================================
   SAWYAN Admin — Screen 1: Command Center (Home) — LIVE POSTGRESQL
   - مصدر الحقيقة الواحد: حزمة قاعدة البيانات الحية (get_admin_sovereign_bundle)
   - يبدأ بالحالة الصفرية النظيفة حتى وصول حزمة PostgreSQL بدون أي بيانات وهمية
   ============================================================ */
window.SAWYAN_ADMIN_DEMO = {
    schema: 'sawyan',
    period_label: 'نوفمبر 2026 — بانتظار المزامنة الحية',
    members: { total: 0, active: 0, pending_kyc: 0, suspended: 0 },
    merchants: { total: 0, active: 0, frozen: 0, pending_approval: 0, low_balance: 0 },
    ops_mtd: 0,
    gmv_mtd: 0,
    gmv_usd_completed: 0,
    comm_total: 0,
    commission_usd_completed: 0,
    gmv_by_currency: [],
    commission_rate: 0.10,
    treasury_share: 0.25,
    plan_share: 0.75,
    prepaid_held: 0,
    prepaid_held_usd: 0,
    low_balance_threshold: 500,
    pending: { withdrawals: 0, disputes: 0, support: 0, promo: 0 },
    daily_ops: [
        { d: 'الأحد', v: 0 }, { d: 'الاثنين', v: 0 }, { d: 'الثلاثاء', v: 0 },
        { d: 'الأربعاء', v: 0 }, { d: 'الخميس', v: 0 }, { d: 'الجمعة', v: 0 },
        { d: 'السبت', v: 0 }
    ],
    categories: [],
    activity: []
};

(function () {
    var D = window.SAWYAN_ADMIN_DEMO;
    var fmt = function (n) { return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var fmt0 = function (n) { return Number(n || 0).toLocaleString('en-US'); };

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

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
        return Number((D.pending && D.pending.promo) || 0);
    }

    function actionRow(icon, count, title, hint, btnLabel, onclick, id) {
        var done = Number(count || 0) === 0;
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

    window.hydrateAdminFromLiveBundle = function (bundle) {
        if (!bundle || typeof bundle !== 'object') return;
        var k = bundle.kpis || {};
        var mems = Array.isArray(bundle.members) ? bundle.members.filter(function (m) { return Number(m.member_code) > 0; }) : [];
        var mers = Array.isArray(bundle.merchants) ? bundle.merchants : [];
        var txs = Array.isArray(bundle.transactions) ? bundle.transactions : [];
        var disputes = Array.isArray(bundle.disputes) ? bundle.disputes : [];
        var tickets = Array.isArray(bundle.support_tickets) ? bundle.support_tickets : [];
        var wds = Array.isArray(bundle.withdrawals) ? bundle.withdrawals : [];
        var flash = Array.isArray(bundle.flash_offers_queue) ? bundle.flash_offers_queue : [];
        var schema = (window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.getActiveSchema === 'function')
            ? window.SAWYAN.API.getActiveSchema()
            : 'sawyan';

        D.schema = schema;
        D.period_label = (k.period_ym || '2026-11') + ' — قاعدة البيانات الحية (' + schema + ')';
        D.members = {
            total: Number(k.members_total !== undefined ? k.members_total : mems.length),
            active: Number(k.members_active !== undefined ? k.members_active : mems.filter(function (m) { return !m.is_tombstone_banned && m.is_active_in_tree !== false; }).length),
            pending_kyc: Number(k.members_pending_kyc !== undefined ? k.members_pending_kyc : mems.filter(function (m) { return m.kyc_status === 'pending'; }).length),
            suspended: Number(k.members_banned !== undefined ? k.members_banned : mems.filter(function (m) { return !!m.is_tombstone_banned; }).length)
        };
        D.merchants = {
            total: Number(k.merchants_total !== undefined ? k.merchants_total : mers.length),
            active: Number(k.merchants_active !== undefined ? k.merchants_active : mers.filter(function (m) { return m.is_active && !m.is_isolated; }).length),
            frozen: Number(k.merchants_isolated !== undefined ? k.merchants_isolated : mers.filter(function (m) { return !!m.is_isolated; }).length),
            pending_approval: mers.filter(function (m) { return !m.is_active; }).length,
            low_balance: mers.filter(function (m) { return m.is_active && Number(m.free_balance_pct || 0) <= 30; }).length
        };

        var completedTxs = txs.filter(function (t) { return t.status === 'completed'; });
        D.ops_mtd = Number(k.transactions_completed !== undefined ? k.transactions_completed : completedTxs.length);
        D.gmv_mtd = Number(k.gmv_local_completed || 0);
        D.gmv_usd_completed = Number(k.gmv_usd_completed || 0);
        D.comm_total = Number(k.commission_local_completed || (D.gmv_mtd * D.commission_rate));
        D.commission_usd_completed = Number(k.commission_usd_completed || 0);
        D.gmv_by_currency = Array.isArray(k.gmv_and_commission_by_currency) ? k.gmv_and_commission_by_currency : [];
        D.prepaid_held = mers.reduce(function (s, m) {
            return s + Math.max(0, Number(m.actual_cash_balance || 0) - Number(m.soft_hold_balance || 0));
        }, 0);
        D.prepaid_held_usd = Number(k.merchant_prepaid_float_usd || 0);

        D.pending = {
            withdrawals: Number(k.pending_withdrawals !== undefined ? k.pending_withdrawals : wds.filter(function (w) { return w.status === 'processing_payout'; }).length),
            disputes: Number(k.open_disputes !== undefined ? k.open_disputes : disputes.filter(function (d) { return d.status === 'awaiting_merchant_friendly' || d.status === 'escalated_to_admin' || d.status === 'appealed_72h'; }).length),
            support: tickets.filter(function (t) { return t.status === 'open' || t.status === 'in_progress'; }).length,
            promo: flash.filter(function (x) { return x.event_name === 'MerchantFlashOfferPending'; }).length
        };

        // بناء الرسم البياني لآخر 7 أيام من المعاملات الحية
        var dayLabels = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        var dayCounts = [0, 0, 0, 0, 0, 0, 0];
        completedTxs.forEach(function (t) {
            var dt = new Date(t.created_at);
            if (!isNaN(dt.getTime())) dayCounts[dt.getDay()] += 1;
        });
        D.daily_ops = dayLabels.map(function (lbl, idx) { return { d: lbl, v: dayCounts[idx] }; });

        // بناء توزيع الفئات من التجار الفعليين
        var catMap = {};
        var totalCatGmv = 0;
        var merByCode = {};
        mers.forEach(function (m) { merByCode[m.merchant_code] = m; });
        mers.forEach(function (m) {
            var cat = m.category || 'متنوع';
            var g = Number(m.gmv_completed || 0);
            if (g > 0) {
                catMap[cat] = (catMap[cat] || 0) + g;
                totalCatGmv += g;
            }
        });
        var palette = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#94a3b8'];
        D.categories = totalCatGmv > 0
            ? Object.keys(catMap).sort(function (a, b) { return catMap[b] - catMap[a]; }).slice(0, 6).map(function (cat, i) {
                return { n: cat, p: Math.max(1, Math.round((catMap[cat] / totalCatGmv) * 100)), c: palette[i % palette.length] };
            })
            : [];

        // بناء سجل النشاط الأخير من قاعدة البيانات الحية
        D.activity = txs.slice(0, 8).map(function (t) {
            var dt = t.created_at ? new Date(t.created_at).toLocaleString('ar-EG') : '';
            var cur = t.currency_code || 'EGP';
            var desc = esc(t.member_name || ('عضو #' + (t.member_code || ''))) +
                ' (#' + Number(t.member_code || 0) + ') — ' +
                esc(t.merchant_name || '') +
                ' بمبلغ ' + fmt(t.total_amount) + ' ' + esc(cur) +
                ' [' + esc(t.sw_short_code || '') + ']';
            return {
                t: dt,
                i: t.status === 'completed' ? '💳' : (t.status === 'reversed' ? '↩️' : '⏳'),
                x: desc,
                c: fmt(t.commission_amount) + ' ' + esc(cur)
            };
        });

        renderHome();
        refreshPromoRow();
    };

    function renderHome() {
        var page = document.getElementById('homePage');
        if (!page) return;

        var commUsd = Number(D.commission_usd_completed || 0);
        var treasuryUsd = commUsd * D.treasury_share;
        var planUsd = commUsd * D.plan_share;
        var avgTicketUsd = D.ops_mtd > 0 ? (Number(D.gmv_usd_completed || 0) / D.ops_mtd) : 0;
        var curSummary = Array.isArray(D.gmv_by_currency) && D.gmv_by_currency.length > 0
            ? D.gmv_by_currency.map(function (c) { return fmt(c.gmv_local) + ' ' + esc(c.currency_code); }).join(' • ')
            : 'إجمالي الفواتير المكتملة بالدفتر الحي';
        var commByCurSummary = Array.isArray(D.gmv_by_currency) && D.gmv_by_currency.length > 0
            ? '<br><small style="color:#64748b;">(' + D.gmv_by_currency.map(function (c) { return fmt(c.commission_local) + ' ' + esc(c.currency_code); }).join(' • ') + ')</small>'
            : '';
        var weekTotal = D.daily_ops.reduce(function (s, x) { return s + x.v; }, 0);
        var maxV = Math.max(1, Math.max.apply(null, D.daily_ops.map(function (x) { return x.v; })));

        var bars = D.daily_ops.map(function (x, idx) {
            var h = Math.round((x.v / maxV) * 150);
            var last = idx === D.daily_ops.length - 1;
            return '<div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px;">' +
                '<div style="font-size:0.72rem; font-weight:800; color:#0f172a; font-family:Poppins,sans-serif;">' + x.v + '</div>' +
                '<div style="width:70%; max-width:38px; height:' + h + 'px; background:' + (last ? '#059669' : '#6ee7b7') + '; border-radius:6px 6px 0 0;"></div>' +
                '<div style="font-size:0.66rem; color:#64748b; text-align:center; line-height:1.2;">' + x.d + '</div>' +
            '</div>';
        }).join('');

        var cats = D.categories.length === 0
            ? '<div style="padding:24px 12px;text-align:center;color:#64748b;font-weight:700;font-size:0.85rem;background:#f8fafc;border-radius:10px;border:1px dashed #cbd5e1;">لا توجد مبيعات مصنفة مسجلة في قاعدة البيانات بعد (0.00)</div>'
            : D.categories.map(function (c) {
                return '<div style="margin-bottom:10px;">' +
                    '<div style="display:flex; justify-content:space-between; font-size:0.82rem; font-weight:700; color:#334155; margin-bottom:3px;"><span>' + esc(c.n) + '</span><span style="font-family:Poppins,sans-serif;">' + c.p + '%</span></div>' +
                    '<div style="background:#f1f5f9; border-radius:6px; height:10px; overflow:hidden;"><div style="width:' + c.p + '%; height:100%; background:' + c.c + ';"></div></div>' +
                '</div>';
            }).join('');

        var act = D.activity.length === 0
            ? '<div style="padding:26px 16px;text-align:center;color:#64748b;font-weight:700;font-size:0.9rem;background:#f8fafc;border-radius:12px;border:1px dashed #cbd5e1;">✨ لا توجد عمليات مسجلة حتى الآن — سجل قاعدة البيانات صفري ونقي 100%.</div>'
            : D.activity.map(function (a) {
                return '<div style="display:flex; align-items:center; gap:12px; padding:10px 4px; border-bottom:1px solid #f1f5f9;">' +
                    '<div style="width:38px; height:38px; background:#ecfdf5; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.2rem;">' + a.i + '</div>' +
                    '<div style="flex:1; font-size:0.86rem; color:#1e293b; font-weight:600;">' + a.x +
                        (a.c ? ' <span style="color:#059669; font-weight:800;">• عمولة سويا ' + a.c + '</span>' : '') + '</div>' +
                    '<div style="font-size:0.74rem; color:#94a3b8; white-space:nowrap;">' + esc(a.t) + '</div>' +
                '</div>';
            }).join('');

        var bannerEl = document.getElementById('sawyanLiveDbBanner');
        var promoEl = document.getElementById('adminPromoModerationSection');

        page.innerHTML = '' +
        '<div id="adminHomeBannerSlot"></div>' +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:14px;">' +
            '<div><div style="font-size:1.1rem; font-weight:900; color:#0f172a;">🧭 غرفة العمليات المركزية</div>' +
            '<div style="font-size:0.8rem; color:#64748b; margin-top:2px;">ملخص الدورة: ' + esc(D.period_label) + '</div></div>' +
            '<span style="background:#dcfce7; color:#065f46; border:1px solid #6ee7b7; padding:4px 12px; border-radius:8px; font-size:0.74rem; font-weight:800;">🟢 مرتبط بقاعدة البيانات الحية (' + esc(D.schema) + ')</span>' +
        '</div>' +

        '<div data-spec-id="admin-home-kpis" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 240px), 1fr)); gap:14px; margin-bottom:18px;">' +
            kpi('👥', 'إجمالي الأعضاء', fmt0(D.members.total), fmt0(D.members.active) + ' نشط • ' + D.members.pending_kyc + ' بانتظار توثيق الهوية • ' + D.members.suspended + ' محجوب', '#3b82f6') +
            kpi('🏪', 'إجمالي التجار', fmt0(D.merchants.total), D.merchants.active + ' نشط • ' + D.merchants.frozen + ' معزول • ' + D.merchants.pending_approval + ' بانتظار الاعتماد', '#10b981') +
            kpi('💳', 'العمليات المكتملة', fmt0(D.ops_mtd), 'متوسط الفاتورة $' + fmt(avgTicketUsd), '#6366f1') +
            kpi('🛒', 'حجم المبيعات (GMV موحد $)', '$' + fmt(D.gmv_usd_completed), curSummary, '#0ea5e9') +
            kpi('💰', 'عمولات سويا المحصّلة ($)', '$' + fmt(commUsd),
                'خزينة الشركة (25%): <b>$' + fmt(treasuryUsd) + '</b><br>خطة الدخل والأعضاء (75%): <b>$' + fmt(planUsd) + '</b>' + commByCurSummary, '#f59e0b') +
            kpi('🛡️', 'التزام الشحن المسبق (2101)', '$' + fmt(D.prepaid_held_usd),
                'صافي أرصدة الشحن الحرة المقومة بالدولار في دفتر الأستاذ', '#059669') +
        '</div>' +

        '<div style="background:white; border:1.5px solid #e2e8f0; border-radius:14px; padding:18px; margin-bottom:18px;">' +
            '<div style="font-weight:900; color:#0f172a; font-size:1.05rem; margin-bottom:4px;">⚡ يحتاج قرارك الآن</div>' +
            '<div style="font-size:0.78rem; color:#64748b; margin-bottom:12px;">كل بند يفتح الشاشة المختصة لاتخاذ القرار الحي</div>' +
            '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:10px;">' +
                actionRow('📢', promoPendingCount(), 'طلبات إعلانات ترويجية من التجار', 'تُراجَع نصوصها قبل البث لهواتف الأعضاء', 'مراجعة الآن', 'scrollToPromoQueue()', 'actionRowPromo') +
                actionRow('💸', D.pending.withdrawals, 'طلبات سحب أرباح الأعضاء', 'تحقق من الهوية وبيانات الحساب قبل التحويل', 'فتح طلبات السحب', "goAdminPage('withdrawals')") +
                actionRow('🪪', D.members.pending_kyc, 'أعضاء بانتظار توثيق الهوية (KYC)', 'شرط لصرف أول سحب', 'فتح الأعضاء', "goAdminPage('members')") +
                actionRow('🔋', D.merchants.low_balance, 'تجار رصيد شحنهم منخفض (≤30%)', 'خطر عزلهم عن رادار الأعضاء قريباً', 'فتح التجار', "goAdminPage('merchants')") +
                actionRow('🏪', D.merchants.pending_approval, 'طلبات انضمام تجار جدد', 'مراجعة المستندات واعتماد النسبة', 'فتح التجار', "goAdminPage('merchants')") +
                actionRow('⚠️', D.pending.disputes, 'نزاعات مفتوحة بين الأعضاء والتجار', 'تحكيم إداري ملزم', 'فتح الشكاوى', "goAdminPage('disputes')") +
                actionRow('🎫', D.pending.support, 'تذاكر دعم فني مفتوحة', 'أعضاء وتجار ينتظرون الرد', 'فتح الدعم الفني', "goAdminPage('support')") +
            '</div>' +
        '</div>' +

        '<div data-spec-id="admin-home-charts" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap:14px; margin-bottom:18px;">' +
            '<div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px;">' +
                '<div style="font-weight:900; color:#0f172a; margin-bottom:2px;">📈 توزيع العمليات الأسبوعي (من السجل الحي)</div>' +
                '<div style="font-size:0.76rem; color:#64748b; margin-bottom:12px;">الإجمالي: <b>' + fmt0(weekTotal) + '</b> عملية</div>' +
                '<div style="display:flex; align-items:flex-end; gap:6px; height:210px; padding-top:6px;">' + bars + '</div>' +
            '</div>' +
            '<div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px;">' +
                '<div style="font-weight:900; color:#0f172a; margin-bottom:2px;">🧩 توزيع المبيعات حسب فئة التاجر</div>' +
                '<div style="font-size:0.76rem; color:#64748b; margin-bottom:12px;">نسبة كل فئة من إجمالي مبيعات القاعدة</div>' + cats +
            '</div>' +
        '</div>' +

        '<div id="promoQueueSlot"></div>' +

        '<div data-spec-id="admin-home-activity" style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:18px;">' +
            '<div style="font-weight:900; color:#0f172a; margin-bottom:6px;">🕒 النشاط الأخير من قاعدة البيانات</div>' + act +
        '</div>';

        var bSlot = document.getElementById('adminHomeBannerSlot');
        if (bannerEl && bSlot) bSlot.appendChild(bannerEl);
        var slot = document.getElementById('promoQueueSlot');
        if (promoEl && slot) slot.appendChild(promoEl);
    }

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

    window.loadStats = async function () { renderHome(); };
    window.loadRecentActivity = async function () {};

    if (document.readyState !== 'loading') {
        setTimeout(function () { renderHome(); refreshPromoRow(); }, 0);
    } else {
        document.addEventListener('DOMContentLoaded', function () { renderHome(); refreshPromoRow(); });
    }
})();
