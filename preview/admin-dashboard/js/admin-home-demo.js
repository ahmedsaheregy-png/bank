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
    ops_fifo: 0,
    ops_pending_review: 0,
    gmv_mtd: 0,
    gmv_usd_completed: 0,
    fifo_gmv_usd: 0,
    comm_total: 0,
    commission_usd_completed: 0,
    fifo_comm_usd: 0,
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
    var fmtUsdSigned = function (n) {
        var v = Number(n || 0);
        var sign = v < 0 ? '-' : '';
        return '<span dir="ltr" style="display:inline-block;unicode-bidi:isolate;">' + sign + '$' + fmt(Math.abs(v)) + '</span>';
    };

    function syncSidebarSlaBadges() {
        var map = {
            navBadgeWithdrawals: Number((D.pending && D.pending.withdrawals) || 0),
            navBadgeDisputes: Number((D.pending && D.pending.disputes) || 0),
            navBadgeSupport: Number((D.pending && D.pending.support) || 0),
            navBadgeMerchants: Number((D.merchants && (D.merchants.frozen + D.merchants.pending_approval)) || 0),
            navBadgeTransactions: Number((D.ops_fifo || 0) + (D.ops_pending_review || 0))
        };
        Object.keys(map).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            var cnt = map[id];
            el.textContent = cnt > 99 ? '99+' : String(cnt);
            el.style.display = cnt > 0 ? 'inline-flex' : 'none';
        });
    }

    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    window.goAdminPage = function (page, filterKey) {
        if (filterKey !== undefined) {
            if (page === 'merchants') window._pendingMerchantFilter = filterKey;
            else if (page === 'members') window._pendingMemberFilter = filterKey;
            else if (page === 'transactions') window._pendingTxnFilter = filterKey;
        }
        if (typeof window.goToPage === 'function') {
            window.goToPage(page);
            return;
        }
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

    function ensureCmdQueueStyles() {
        if (typeof document === 'undefined' || document.getElementById('swAdminCmdQueueStyles')) return;
        var st = document.createElement('style');
        st.id = 'swAdminCmdQueueStyles';
        st.textContent = '' +
            '.sw-cmd-shell{background:#ffffff;border:1.5px solid #e2e8f0;border-radius:16px;padding:16px 18px;margin-bottom:18px;box-shadow:0 2px 10px rgba(15,23,42,0.03);}' +
            '.sw-cmd-hdr{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}' +
            '.sw-cmd-title{font-weight:900;color:#0f172a;font-size:1.02rem;display:flex;align-items:center;gap:8px;}' +
            '.sw-cmd-warn-pill{background:#fef3c7;color:#b45309;border:1px solid #fcd34d;font-size:0.78rem;font-weight:800;padding:4px 12px;border-radius:999px;}' +
            '.sw-cmd-calm-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:linear-gradient(135deg,#ecfdf5,#f0fdf4);border:1px solid #a7f3d0;border-radius:12px;padding:11px 14px;margin-bottom:11px;}' +
            '.sw-cmd-calm-txt{font-size:0.88rem;font-weight:800;color:#065f46;display:flex;align-items:center;gap:7px;}' +
            '.sw-cmd-calm-hint{font-size:0.74rem;font-weight:700;color:#047857;}' +
            '.sw-cmd-urgent-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:10px;margin-bottom:12px;}' +
            '.sw-cmd-card{appearance:none;-webkit-appearance:none;width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;border:1.5px solid #f59e0b;background:#fffbeb;cursor:pointer;text-align:right;font-family:Tajawal,sans-serif;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease;min-width:0;}' +
            '.sw-cmd-card:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(245,158,11,0.16);}' +
            '.sw-cmd-card.crit{border-color:#ef4444;background:#fef2f2;}' +
            '.sw-cmd-card.crit:hover{box-shadow:0 6px 16px rgba(239,68,68,0.16);}' +
            '.sw-cmd-card .sw-ic{width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:#fef3c7;flex-shrink:0;}' +
            '.sw-cmd-card.crit .sw-ic{background:#fee2e2;}' +
            '.sw-cmd-card .sw-meta{flex:1;min-width:0;}' +
            '.sw-cmd-card .sw-lbl{font-size:0.9rem;font-weight:900;color:#0f172a;line-height:1.35;}' +
            '.sw-cmd-card .sw-sub{font-size:0.76rem;font-weight:700;color:#b45309;margin-top:2px;line-height:1.4;}' +
            '.sw-cmd-card.crit .sw-sub{color:#b91c1c;}' +
            '.sw-cmd-card .sw-cnt{font-family:Poppins,sans-serif;font-weight:800;font-size:0.92rem;min-width:28px;height:28px;padding:0 7px;border-radius:999px;background:#f59e0b;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;}' +
            '.sw-cmd-card.crit .sw-cnt{background:#dc2626;}' +
            '.sw-cmd-card .sw-chev{color:#d97706;font-weight:900;font-size:1.05rem;flex-shrink:0;}' +
            '.sw-cmd-card.crit .sw-chev{color:#dc2626;}' +
            '.sw-cmd-sublbl{font-size:0.74rem;color:#64748b;font-weight:700;margin-bottom:7px;}' +
            '.sw-cmd-pills{display:flex;flex-wrap:wrap;gap:7px;align-items:center;}' +
            '.sw-cmd-pill{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-size:0.79rem;font-weight:700;color:#334155;cursor:pointer;font-family:Tajawal,sans-serif;transition:background .14s ease,border-color .14s ease,color .14s ease;max-width:100%;}' +
            '.sw-cmd-pill:hover{background:#ecfdf5;border-color:#10b981;color:#065f46;}' +
            '.sw-cmd-pill .sw-pic{display:inline-flex;align-items:center;flex-shrink:0;}' +
            '.sw-cmd-pill .sw-pic svg{width:15px;height:15px;}' +
            '.sw-cmd-pill .sw-pcnt{font-family:Poppins,sans-serif;font-size:0.72rem;font-weight:800;color:#64748b;background:#e2e8f0;padding:1px 6px;border-radius:999px;}' +
            '.sw-cmd-pill .sw-pchev{color:#94a3b8;font-size:0.85rem;}' +
            '[data-theme="dark"] .sw-cmd-shell{background:#0f172a !important;border-color:#24324a !important;}' +
            '[data-theme="dark"] .sw-cmd-title{color:#f8fafc !important;}' +
            '[data-theme="dark"] .sw-cmd-calm-banner{background:rgba(16,185,129,0.12) !important;border-color:rgba(16,185,129,0.35) !important;}' +
            '[data-theme="dark"] .sw-cmd-calm-txt{color:#6ee7b7 !important;}' +
            '[data-theme="dark"] .sw-cmd-calm-hint{color:#34d399 !important;}' +
            '[data-theme="dark"] .sw-cmd-card{background:rgba(245,158,11,0.11) !important;border-color:#d97706 !important;}' +
            '[data-theme="dark"] .sw-cmd-card.crit{background:rgba(239,68,68,0.12) !important;border-color:#ef4444 !important;}' +
            '[data-theme="dark"] .sw-cmd-card .sw-lbl{color:#f8fafc !important;}' +
            '[data-theme="dark"] .sw-cmd-card .sw-sub{color:#fcd34d !important;}' +
            '[data-theme="dark"] .sw-cmd-card.crit .sw-sub{color:#fca5a5 !important;}' +
            '[data-theme="dark"] .sw-cmd-card .sw-ic{background:rgba(245,158,11,0.22) !important;}' +
            '[data-theme="dark"] .sw-cmd-card.crit .sw-ic{background:rgba(239,68,68,0.22) !important;}' +
            '[data-theme="dark"] .sw-cmd-pill{background:#111c30 !important;border-color:#24324a !important;color:#e2e8f0 !important;}' +
            '[data-theme="dark"] .sw-cmd-pill:hover{background:rgba(16,185,129,0.16) !important;border-color:#10b981 !important;color:#6ee7b7 !important;}' +
            '[data-theme="dark"] .sw-cmd-pill .sw-pcnt{background:#1e293b !important;color:#94a3b8 !important;}' +
            '@media (max-width:480px){.sw-cmd-shell{padding:13px 12px;}.sw-cmd-pill{padding:6px 9px;font-size:0.76rem;}}';
        document.head.appendChild(st);
    }

    function cmdSvgIcon(key, color) {
        var c = color || 'currentColor';
        var paths = {
            frozen: '<circle cx="12" cy="12" r="10"/><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/>',
            pending_tx: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
            promo: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
            withdraw: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
            kyc: '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h3"/>',
            lowbal: '<rect x="2" y="7" width="16" height="10" rx="2"/><line x1="22" y1="11" x2="22" y2="13"/><line x1="6" y1="10" x2="6" y2="14"/>',
            newmerch: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 20v-6h6v6"/>',
            dispute: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            support: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>'
        };
        return '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[key] || paths.support) + '</svg>';
    }

    function buildActionQueueHtml() {
        ensureCmdQueueStyles();
        var items = [
            {
                id: 'actionRowFifoMerchants',
                iconKey: 'frozen',
                count: Number(D.merchants.frozen || 0),
                shortTitle: 'تجار معزولون',
                urgentTitle: 'تجار معزولون / بلا تمويل',
                hint: D.merchants.frozen + ' تاجر متوقف عن الظهور' + (D.ops_fifo > 0 ? (' • ' + D.ops_fifo + ' فاتورة بانتظار الشحن') : ''),
                severity: 'critical',
                onclick: "goAdminPage('merchants', 'isolated_fifo')"
            }
        ];

        if (D.ops_fifo > 0 || D.ops_pending_review > 0) {
            items.push({
                id: 'actionRowPendingTx',
                iconKey: 'pending_tx',
                count: Number(D.ops_fifo || 0) + Number(D.ops_pending_review || 0),
                shortTitle: 'فواتير معلقة',
                urgentTitle: 'فواتير بانتظار الشحن أو المراجعة',
                hint: D.ops_fifo + ' بانتظار شحن التاجر • ' + D.ops_pending_review + ' بانتظار المراجعة',
                severity: 'critical',
                onclick: "goAdminPage('transactions', 'pending_or_fifo')"
            });
        }

        items.push(
            {
                id: 'actionRowPromo',
                iconKey: 'promo',
                count: promoPendingCount(),
                shortTitle: 'إعلانات التجار',
                urgentTitle: 'إعلانات ترويجية بانتظار الاعتماد',
                hint: 'مراجعة النص قبل البث المباشر للأعضاء',
                severity: 'urgent',
                onclick: 'scrollToPromoQueue()'
            },
            {
                id: 'actionRowWithdrawals',
                iconKey: 'withdraw',
                count: Number((D.pending && D.pending.withdrawals) || 0),
                shortTitle: 'طلبات السحب',
                urgentTitle: 'طلبات سحب أرباح الأعضاء',
                hint: 'مراجعة الهوية وبيانات الحساب قبل الصرف',
                severity: 'urgent',
                onclick: "goAdminPage('withdrawals')"
            },
            {
                id: 'actionRowPendingKyc',
                iconKey: 'kyc',
                count: Number(D.members.pending_kyc || 0),
                shortTitle: 'توثيق الهوية',
                urgentTitle: 'أعضاء بانتظار توثيق الهوية',
                hint: 'مراجعة المستندات لإتاحة السحب',
                severity: 'urgent',
                onclick: "goAdminPage('members', 'pending_kyc')"
            },
            {
                id: 'actionRowLowBalance',
                iconKey: 'lowbal',
                count: Number(D.merchants.low_balance || 0),
                shortTitle: 'رصيد منخفض',
                urgentTitle: 'تجار رصيدهم منخفض (≤30%)',
                hint: 'قريبون من العزل التلقائي عند النفاد',
                severity: 'urgent',
                onclick: "goAdminPage('merchants', 'warnings')"
            },
            {
                id: 'actionRowPendingMerchants',
                iconKey: 'newmerch',
                count: Number(D.merchants.pending_approval || 0),
                shortTitle: 'تجار جدد',
                urgentTitle: 'طلبات انضمام تجار جدد',
                hint: 'مراجعة البيانات واعتماد نسبة العمولة',
                severity: 'urgent',
                onclick: "goAdminPage('merchants', 'draft_incomplete')"
            },
            {
                id: 'actionRowDisputes',
                iconKey: 'dispute',
                count: Number((D.pending && D.pending.disputes) || 0),
                shortTitle: 'نزاعات مفتوحة',
                urgentTitle: 'نزاعات مفتوحة بين الأعضاء والتجار',
                hint: 'تحتاج تحكيماً إدارياً ملزماً',
                severity: 'critical',
                onclick: "goAdminPage('disputes')"
            },
            {
                id: 'actionRowSupport',
                iconKey: 'support',
                count: Number((D.pending && D.pending.support) || 0),
                shortTitle: 'تذاكر الدعم',
                urgentTitle: 'تذاكر دعم فني مفتوحة',
                hint: 'أعضاء وتجار ينتظرون الرد',
                severity: 'urgent',
                onclick: "goAdminPage('support')"
            }
        );

        var urgent = items.filter(function (x) { return x.count > 0; });
        var calm = items.filter(function (x) { return x.count === 0; });

        var renderPill = function (it) {
            return '<button type="button" id="' + it.id + '" class="sw-cmd-pill" onclick="' + it.onclick + '" title="' + esc(it.urgentTitle) + '">' +
                '<span class="sw-pic">' + cmdSvgIcon(it.iconKey, '#475569') + '</span>' +
                '<span>' + esc(it.shortTitle) + '</span>' +
                '<span class="sw-pcnt">0</span>' +
                '<span class="sw-pchev" aria-hidden="true">‹</span>' +
            '</button>';
        };

        var renderUrgentCard = function (it) {
            var isCrit = it.severity === 'critical';
            var icCol = isCrit ? '#dc2626' : '#d97706';
            return '<button type="button" id="' + it.id + '" class="sw-cmd-card' + (isCrit ? ' crit' : '') + '" onclick="' + it.onclick + '">' +
                '<span class="sw-ic">' + cmdSvgIcon(it.iconKey, icCol) + '</span>' +
                '<span class="sw-meta">' +
                    '<div class="sw-lbl">' + esc(it.urgentTitle) + '</div>' +
                    '<div class="sw-sub">' + esc(it.hint) + '</div>' +
                '</span>' +
                '<span class="sw-cnt">' + fmt0(it.count) + '</span>' +
                '<span class="sw-chev" aria-hidden="true">‹</span>' +
            '</button>';
        };

        if (urgent.length === 0) {
            return '<div id="adminActionQueueShell" class="sw-cmd-shell">' +
                '<div class="sw-cmd-calm-banner">' +
                    '<div class="sw-cmd-calm-txt">✨ كل المهام منجزة — لا يوجد شيء بانتظار قرارك الآن</div>' +
                    '<div class="sw-cmd-calm-hint">وصول سريع لأي قسم بنقرة واحدة ↓</div>' +
                '</div>' +
                '<div class="sw-cmd-pills">' + calm.map(renderPill).join('') + '</div>' +
            '</div>';
        }

        var urgentCountTxt = urgent.length === 1
            ? 'قسم واحد يحتاج مراجعة'
            : (urgent.length === 2 ? 'قسمان يحتاجان مراجعة' : (urgent.length + ' أقسام تحتاج مراجعة'));

        return '<div id="adminActionQueueShell" class="sw-cmd-shell">' +
            '<div class="sw-cmd-hdr">' +
                '<div class="sw-cmd-title">⚡ يحتاج قرارك الآن</div>' +
                '<div class="sw-cmd-warn-pill">🔔 ' + urgentCountTxt + '</div>' +
            '</div>' +
            '<div class="sw-cmd-urgent-grid">' + urgent.map(renderUrgentCard).join('') + '</div>' +
            (calm.length > 0
                ? '<div class="sw-cmd-sublbl">أقسام أخرى بدون معلقات (وصول سريع):</div><div class="sw-cmd-pills">' + calm.map(renderPill).join('') + '</div>'
                : '') +
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
        var matchMer = typeof window.SAWYAN_MATCH_MERCHANT === 'function' ? window.SAWYAN_MATCH_MERCHANT : null;
        var matchMem = typeof window.SAWYAN_MATCH_MEMBER === 'function' ? window.SAWYAN_MATCH_MEMBER : null;
        D.members = {
            total: Number(k.members_total !== undefined ? k.members_total : mems.length),
            active: matchMem ? mems.filter(function (m) { return matchMem(m, 'active'); }).length : Number(k.members_active !== undefined ? k.members_active : mems.filter(function (m) { return !m.is_tombstone_banned && m.is_active_in_tree !== false; }).length),
            pending_kyc: matchMem ? mems.filter(function (m) { return matchMem(m, 'pending_kyc'); }).length : Number(k.members_pending_kyc !== undefined ? k.members_pending_kyc : mems.filter(function (m) { return m.kyc_status === 'pending'; }).length),
            suspended: matchMem ? mems.filter(function (m) { return matchMem(m, 'banned'); }).length : Number(k.members_banned !== undefined ? k.members_banned : mems.filter(function (m) { return !!m.is_tombstone_banned; }).length)
        };
        D.merchants = {
            total: mers.length || Number(k.merchants_total || 0),
            active: matchMer ? mers.filter(function (m) { return matchMer(m, 'active_store'); }).length : Number(k.merchants_active !== undefined ? k.merchants_active : mers.filter(function (m) { return m.is_active && !m.is_isolated; }).length),
            frozen: matchMer ? mers.filter(function (m) { return matchMer(m, 'isolated_fifo'); }).length : Number(k.merchants_isolated !== undefined ? k.merchants_isolated : mers.filter(function (m) { return !!m.is_isolated; }).length),
            pending_approval: matchMer ? mers.filter(function (m) { return matchMer(m, 'draft_incomplete'); }).length : mers.filter(function (m) { return !m.is_active; }).length,
            low_balance: matchMer ? mers.filter(function (m) { return matchMer(m, 'warnings'); }).length : mers.filter(function (m) {
                var cash = Number(m.actual_cash_balance || 0);
                var cred = Number(m.credit_limit || 0);
                var pct = Number(m.free_balance_pct || 0);
                return m.is_active && !m.is_isolated && (cash > 0 || cred > 0) && pct > 0 && pct <= 30;
            }).length
        };

        var completedTxs = txs.filter(function (t) { return t.status === 'completed'; });
        var fifoTxs = txs.filter(function (t) { return t.status === 'awaiting_merchant_topup'; });
        var pendingRevTxs = txs.filter(function (t) { return t.status === 'pending'; });
        D.ops_mtd = Number(k.transactions_completed !== undefined ? k.transactions_completed : completedTxs.length);
        D.ops_fifo = Number(k.transactions_awaiting_topup !== undefined ? k.transactions_awaiting_topup : fifoTxs.length);
        D.ops_pending_review = Number(k.transactions_pending_review !== undefined ? k.transactions_pending_review : pendingRevTxs.length);
        D.gmv_mtd = Number(k.gmv_local_completed || 0);
        D.gmv_usd_completed = Number(k.gmv_usd_completed || 0);
        D.fifo_gmv_usd = Number(k.awaiting_topup_gmv_usd !== undefined ? k.awaiting_topup_gmv_usd : fifoTxs.reduce(function (s, t) { return s + (Number(t.total_amount || 0) / Math.max(0.0001, Number(t.fx_rate_used || 1))); }, 0));
        D.comm_total = Number(k.commission_local_completed || (D.gmv_mtd * D.commission_rate));
        D.commission_usd_completed = Number(k.commission_usd_completed || 0);
        D.fifo_comm_usd = Number(k.awaiting_topup_commission_usd !== undefined ? k.awaiting_topup_commission_usd : fifoTxs.reduce(function (s, t) { return s + (Number(t.commission_amount || 0) / Math.max(0.0001, Number(t.fx_rate_used || 1))); }, 0));
        D.gmv_by_currency = Array.isArray(k.gmv_and_commission_by_currency) ? k.gmv_and_commission_by_currency : [];
        D.prepaid_held = mers.reduce(function (s, m) {
            return s + Math.max(0, Number(m.actual_cash_balance || 0) - Number(m.soft_hold_balance || 0));
        }, 0);
        D.prepaid_held_usd = Number(k.merchant_prepaid_float_usd || 0);

        D.pending = {
            withdrawals: Number(k.pending_withdrawals !== undefined ? k.pending_withdrawals : wds.filter(function (w) { return w.status === 'processing_payout'; }).length),
            disputes: Number(k.open_disputes !== undefined ? k.open_disputes : disputes.filter(function (d) { return d.status === 'awaiting_merchant_friendly' || d.status === 'escalated_to_admin' || d.status === 'appealed_72h'; }).length),
            support: tickets.filter(function (t) { return t.status === 'open' || t.status === 'in_progress'; }).length,
            promo: flash.filter(function (x) { return x.event_name === 'MerchantFlashOfferPending' || x.event_name === 'MerchantFlashOfferUnderReview'; }).length
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
            var stTxt = t.status === 'completed'
                ? '✅ مكتملة'
                : (t.status === 'awaiting_merchant_topup'
                    ? '⏸️ طابور انتظار شحن التاجر' + (t.fifo_seq ? ' #' + Number(t.fifo_seq) : '') + ' — بانتظار شحن الرصيد'
                    : (t.status === 'pending'
                        ? '⏳ معلقة للمراجعة'
                        : (t.status === 'reversed' ? '↩️ مسترجعة' : '❌ مرفوضة')));
            var desc = esc(t.member_name || ('عضو #' + (t.member_code || ''))) +
                ' (#' + Number(t.member_code || 0) + ') — ' +
                esc(t.merchant_name || '') +
                ' بمبلغ ' + fmt(t.total_amount) + ' ' + esc(cur) +
                ' [' + esc(t.sw_short_code || '') + '] • <b style="color:' + (t.status === 'awaiting_merchant_topup' ? '#b91c1c' : '#334155') + ';">' + esc(stTxt) + '</b>';
            return {
                t: dt,
                i: t.status === 'completed' ? '💳' : (t.status === 'awaiting_merchant_topup' ? '⏸️' : (t.status === 'reversed' ? '↩️' : '⏳')),
                x: desc,
                c: fmt(t.commission_amount) + ' ' + esc(cur)
            };
        });

        renderHome();
        refreshPromoRow();
        syncSidebarSlaBadges();
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
        '</div>' +

        '<div data-spec-id="admin-home-kpis" class="admin-kpi-grid-3x2" style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:14px; margin-bottom:18px;">' +
            kpi('👥', 'إجمالي الأعضاء', fmt0(D.members.total), fmt0(D.members.active) + ' نشط • ' + D.members.pending_kyc + ' بانتظار توثيق الهوية • ' + D.members.suspended + ' محجوب', '#3b82f6') +
            kpi('🏪', 'إجمالي التجار', fmt0(D.merchants.total), D.merchants.active + ' نشط • ' + D.merchants.frozen + ' معزول • ' + D.merchants.pending_approval + ' بانتظار الاستكمال', '#10b981') +
            kpi('💳', 'العمليات المكتملة', fmt0(D.ops_mtd),
                'متوسط الفاتورة ' + fmtUsdSigned(avgTicketUsd) +
                ((D.ops_fifo > 0 || D.ops_pending_review > 0)
                    ? '<br><span style="color:#b91c1c;font-weight:800;">⏸️ ' + fmt0(D.ops_fifo) + ' بانتظار شحن التاجر (' + fmtUsdSigned(D.fifo_gmv_usd) + ') • ⏳ ' + fmt0(D.ops_pending_review) + ' معلقة</span>'
                    : ''), '#6366f1') +
            kpi('🛒', 'إجمالي المبيعات الموحّد ($)', fmtUsdSigned(D.gmv_usd_completed), curSummary, '#0ea5e9') +
            kpi('💰', 'عمولات سويا المحصّلة ($)', fmtUsdSigned(commUsd),
                'خزينة الشركة (25%): <b>' + fmtUsdSigned(treasuryUsd) + '</b><br>خطة الدخل والأعضاء (75%): <b>' + fmtUsdSigned(planUsd) + '</b>' + commByCurSummary, '#f59e0b') +
            kpi('🛡️', 'إجمالي أرصدة التجار المشحونة', fmtUsdSigned(D.prepaid_held_usd),
                'صافي أرصدة الشحن الحرة المقومة بالدولار في دفتر الأستاذ', Number(D.prepaid_held_usd || 0) < 0 ? '#dc2626' : '#059669') +
        '</div>' +

        buildActionQueueHtml() +

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
        var shell = document.getElementById('adminActionQueueShell');
        if (!shell) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = buildActionQueueHtml();
        if (tmp.firstChild) shell.replaceWith(tmp.firstChild);
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
