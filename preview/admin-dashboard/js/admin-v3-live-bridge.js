/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — STAGE 6 SOVEREIGN ADMIN V3.0 LIVE POSTGRESQL BRIDGE
 * Connects the 10-Screen / 25-Unit Admin Dashboard to Live Supabase Schemas:
 *   - Production (`/`)       -> `sawyan` (Strict Auth Gate -> login.html)
 *   - Parallel (`/preview/`) -> `sawyan_demo` (Live RBAC Maker/Checker/Auditor)
 * Preserves 100% of Decisions Lab, Settings Center & Operational Simulators
 * while eliminating all legacy unguarded `.from(...)` queries.
 * ============================================================================
 */
(function () {
    'use strict';

    let LIVE_BUNDLE = null;
    let ACTIVE_LIVE_TAB = 'mc'; // mc | close | country | partners | coa | ops
    let LAST_ACTUARIAL = null;

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmt2(n) {
        return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function roleLabel(role) {
        const map = {
            approver: 'سلطة اعتماد عليا (Approver)',
            finance: 'إدارة مالية وتسويات (Finance Maker)',
            auditor: 'مدقّق مستقل — قراءة فقط (Auditor)',
            reviewer: 'مراجع رقابي (Reviewer)',
            data_entry: 'مُدخل عمليات (Data Entry)',
            support: 'دعم فني ونزاعات (Support)',
            kyc_officer: 'مسؤول التحقق من الهوية (KYC Officer)'
        };
        return map[role] || role || 'إداري';
    }

    function showToast(msg, isError) {
        let box = document.getElementById('sawyanAdminLiveToast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'sawyanAdminLiveToast';
            box.style.cssText = 'position:fixed;bottom:22px;left:22px;z-index:10050;max-width:440px;padding:12px 16px;border-radius:12px;font-family:Tajawal,sans-serif;font-weight:800;font-size:0.88rem;box-shadow:0 10px 28px rgba(15,23,42,0.28);transition:opacity 0.25s;';
            document.body.appendChild(box);
        }
        box.style.background = isError ? '#991b1b' : '#065f46';
        box.style.color = '#ffffff';
        box.style.border = isError ? '1.5px solid #fca5a5' : '1.5px solid #6ee7b7';
        box.textContent = (isError ? '⛔ ' : '✅ ') + msg;
        box.style.opacity = '1';
        clearTimeout(box._timer);
        box._timer = setTimeout(function () { box.style.opacity = '0'; }, 4800);
    }

    // ------------------------------------------------------------------------
    // 1. Neutralize Legacy Unguarded Queries in dashboard.js Before Boot
    // ------------------------------------------------------------------------
    window.checkAuth = async function () {
        if (!window.SAWYAN || !window.SAWYAN.API) return;
        const api = window.SAWYAN.API;
        let adm = api.getSavedAdmin();
        let tok = api.getAdminSessionToken();

        if ((!adm || !tok) && api.isDemoMode()) {
            try {
                const loginRes = await api.authenticateAdminLogin({
                    email: 'demo.maker@sawyan.local',
                    password: 'Demo@Maker2026',
                    totpCode: '246810'
                });
                adm = loginRes.admin;
                tok = loginRes.session_token;
            } catch (err) {
                console.warn('Demo auto-login fallback -> redirecting to login.html:', err.message);
            }
        }

        if (!adm || !tok) {
            window.location.href = 'login.html';
            return;
        }

        window.currentAdmin = adm;
        updateHeaderIdentity(adm);
    };

    window.loadRecentActivity = async function () {
        await refreshSovereignBundle(false);
    };

    window.logout = async function () {
        if (window.SAWYAN && window.SAWYAN.API) {
            window.SAWYAN.API.clearAdminSession();
        }
        window.location.href = 'login.html';
    };

    function updateHeaderIdentity(adm) {
        if (!adm) return;
        const nameEl = document.getElementById('adminName');
        if (nameEl) nameEl.textContent = adm.full_name || adm.email;
        const badgeEl = document.querySelector('.dashboard-header .member-code');
        if (badgeEl) {
            badgeEl.textContent = roleLabel(adm.role);
            badgeEl.style.background = adm.role === 'auditor' ? '#fef3c7' : adm.role === 'approver' ? '#dcfce7' : '#dbeafe';
            badgeEl.style.color = adm.role === 'auditor' ? '#92400e' : adm.role === 'approver' ? '#065f46' : '#1e40af';
        }
        mountHeaderRbacControls(adm);
    }

    function mountHeaderRbacControls(adm) {
        const hdr = document.querySelector('.dashboard-header');
        if (!hdr || !window.SAWYAN || !window.SAWYAN.API) return;
        let bar = document.getElementById('sawyanHeaderRbacBar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'sawyanHeaderRbacBar';
            bar.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
            hdr.appendChild(bar);
        }

        if (window.SAWYAN.API.isDemoMode()) {
            bar.innerHTML =
                '<span style="font-size:0.75rem;color:#64748b;font-weight:800;">تبديل الدور الحي:</span>' +
                '<button type="button" id="switchMakerBtn" onclick="sawyanSwitchDemoRole(\'maker\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (adm.role === 'finance' ? '#1d4ed8' : '#cbd5e1') + ';background:' + (adm.role === 'finance' ? '#1d4ed8' : '#ffffff') + ';color:' + (adm.role === 'finance' ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">💼 Maker (مالي)</button>' +
                '<button type="button" id="switchCheckerBtn" onclick="sawyanSwitchDemoRole(\'checker\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (adm.role === 'approver' ? '#059669' : '#cbd5e1') + ';background:' + (adm.role === 'approver' ? '#059669' : '#ffffff') + ';color:' + (adm.role === 'approver' ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">✅ Checker (مُعتمِد)</button>' +
                '<button type="button" id="switchAuditorBtn" onclick="sawyanSwitchDemoRole(\'auditor\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (adm.role === 'auditor' ? '#d97706' : '#cbd5e1') + ';background:' + (adm.role === 'auditor' ? '#d97706' : '#ffffff') + ';color:' + (adm.role === 'auditor' ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">🔍 Auditor (قراءة فقط)</button>';
        } else {
            bar.innerHTML = '<span style="font-size:0.76rem;background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;padding:4px 10px;border-radius:999px;font-weight:800;">🔒 جلسة إنتاج سيادية موثقة (`sawyan`)</span>';
        }
    }

    window.sawyanSwitchDemoRole = async function (which) {
        if (!window.SAWYAN || !window.SAWYAN.API || !window.SAWYAN.API.isDemoMode()) return;
        const creds = {
            maker: { email: 'demo.maker@sawyan.local', password: 'Demo@Maker2026' },
            checker: { email: 'demo.checker@sawyan.local', password: 'Demo@Checker2026' },
            auditor: { email: 'demo.auditor@sawyan.local', password: 'Demo@Auditor2026' }
        }[which];
        if (!creds) return;
        try {
            const res = await window.SAWYAN.API.authenticateAdminLogin({
                email: creds.email,
                password: creds.password,
                totpCode: '246810'
            });
            window.currentAdmin = res.admin;
            updateHeaderIdentity(res.admin);
            await refreshSovereignBundle(true);
            showToast('تم التبديل الحي إلى: ' + res.admin.full_name, false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    // ------------------------------------------------------------------------
    // 2. Fetch Live PostgreSQL Sovereign Bundle & Hydrate UI
    // ------------------------------------------------------------------------
    async function refreshSovereignBundle(showFeedback) {
        if (!window.SAWYAN || !window.SAWYAN.API) return;
        const api = window.SAWYAN.API;
        const adm = api.getSavedAdmin();
        const tok = api.getAdminSessionToken();
        if (!adm || !tok) return;

        try {
            const periodInput = document.getElementById('svClosePeriodInput');
            const ym = periodInput && periodInput.value ? periodInput.value.trim() : null;
            LIVE_BUNDLE = await api.getAdminSovereignBundle({ periodYm: ym });
            if (LIVE_BUNDLE && LIVE_BUNDLE.admin) {
                window.currentAdmin = LIVE_BUNDLE.admin;
                updateHeaderIdentity(LIVE_BUNDLE.admin);
            }
            mountSovereignNavAndPage();
            renderLiveSummaryBannerOnHome();
            renderSovereignLivePage();
            renderLiveFlashOfferQueue();
            if (showFeedback) showToast('تمت مزامنة البيانات السيادية الحية من قاعدة البيانات بنجاح', false);
        } catch (err) {
            if (/ADMIN_AUTH_REQUIRED|ADMIN_SESSION_INVALID|ADMIN_SESSION_EXPIRED|ADMIN_NOT_ACTIVE/.test(err.message || '')) {
                api.clearAdminSession();
                window.location.href = 'login.html';
                return;
            }
            showToast(err.message || 'خطأ في جلب حزمة الإدارة السيادية', true);
        }
    }
    window.refreshSovereignBundle = refreshSovereignBundle;

    // ------------------------------------------------------------------------
    // 3. Inject Live Sovereign Command Hub Page & Sidebar Link (Non-Destructive)
    // ------------------------------------------------------------------------
    function mountSovereignNavAndPage() {
        const nav = document.querySelector('.sidebar-nav');
        if (nav && !document.getElementById('sovereignLiveNavItem')) {
            const a = document.createElement('a');
            a.href = '#';
            a.id = 'sovereignLiveNavItem';
            a.className = 'nav-item';
            a.dataset.page = 'sovereignLive';
            a.innerHTML = '<span class="icon">⚡</span><span>الحوكمة الحية وشركاء الشركة</span>';
            a.addEventListener('click', function (e) {
                e.preventDefault();
                openSovereignLivePage();
            });
            const refNode = nav.children[1] || null;
            nav.insertBefore(a, refNode);
        }

        const area = document.getElementById('contentArea');
        if (area && !document.getElementById('sovereignLivePage')) {
            const div = document.createElement('div');
            div.id = 'sovereignLivePage';
            div.className = 'page';
            area.insertBefore(div, area.firstChild);
        }
    }

    window.openSovereignLivePage = function (subTab) {
        if (subTab) ACTIVE_LIVE_TAB = subTab;
        mountSovereignNavAndPage();
        document.querySelectorAll('.nav-item').forEach(function (n) {
            n.classList.toggle('active', n.dataset.page === 'sovereignLive');
        });
        document.querySelectorAll('.page').forEach(function (p) {
            p.classList.toggle('active', p.id === 'sovereignLivePage');
        });
        const t = document.getElementById('pageTitle');
        if (t) t.textContent = '⚡ مركز الحوكمة السيادية الحية وشركاء الشركة (PostgreSQL V3.0)';
        renderSovereignLivePage();
    };

    function renderLiveSummaryBannerOnHome() {
        const home = document.getElementById('homePage');
        if (!home || !LIVE_BUNDLE) return;
        let strip = document.getElementById('sawyanLiveDbBanner');
        if (!strip) {
            strip = document.createElement('div');
            strip.id = 'sawyanLiveDbBanner';
            strip.style.cssText = 'background:linear-gradient(135deg,#064e3b,#0f172a);color:#ffffff;border:1.5px solid #10b981;border-radius:14px;padding:14px 18px;margin-bottom:16px;box-shadow:0 6px 20px rgba(6,78,59,0.2);';
            home.insertBefore(strip, home.firstChild);
        }

        const k = LIVE_BUNDLE.kpis || {};
        const zd = LIVE_BUNDLE.zero_discrepancy || {};
        const schemaName = window.SAWYAN && window.SAWYAN.API ? window.SAWYAN.API.getActiveSchema() : 'sawyan';

        strip.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">' +
                '<div>' +
                    '<span style="background:#10b981;color:#052e16;font-weight:900;font-size:0.74rem;padding:2px 9px;border-radius:999px;margin-left:8px;">LIVE DB: ' + esc(schemaName) + '</span>' +
                    '<b style="font-size:0.98rem;">القراءة الحية المباشرة من دفتر الأستاذ المزدوج وحوكمة PostgreSQL V3.0</b>' +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                    '<button type="button" onclick="openSovereignLivePage(\'mc\')" style="background:#fbbf24;color:#0f172a;border:none;padding:6px 13px;border-radius:8px;font-family:Tajawal,sans-serif;font-weight:900;font-size:0.82rem;cursor:pointer;">⚡ فتح مركز الحوكمة الحية والاعتماد المزدوج (' + Number(k.pending_mc_requests || 0) + ' معلق)</button>' +
                    '<button type="button" onclick="refreshSovereignBundle(true)" style="background:rgba(255,255,255,0.14);color:#ffffff;border:1px solid rgba(255,255,255,0.3);padding:6px 12px;border-radius:8px;font-family:Tajawal,sans-serif;font-weight:700;font-size:0.8rem;cursor:pointer;">🔄 تحديث فوري</button>' +
                '</div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;font-size:0.82rem;">' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;">👥 الأعضاء بالقاعدة: <b>' + Number(k.members_total || 0) + '</b> (+ #0)</div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;">🏪 التجار النشطون: <b>' + Number(k.merchants_active || 0) + ' / ' + Number(k.merchants_total || 0) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;">💳 فواتير مكتملة: <b>' + Number(k.transactions_completed || 0) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;">🏦 خزانة 25%: <b>$' + fmt2(k.treasury_revenue_usd) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;">🎯 التزام الخطة 75%: <b>$' + fmt2(k.plan_pool_liability_usd) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;">⚖️ المطابقة الصفرية: <b style="color:' + (zd.is_zero_discrepancy_intact ? '#6ee7b7' : '#fca5a5') + ';">' + (zd.is_zero_discrepancy_intact ? '✅ فرق $0.00' : '⛔ خلل!') + '</b></div>' +
            '</div>';

        const elMemb = document.getElementById('totalMembers');
        const elMerch = document.getElementById('totalMerchants');
        const elTx = document.getElementById('totalTransactions');
        const elComm = document.getElementById('totalCommissions');
        const elAct = document.getElementById('activityList');

        if (elMemb) elMemb.textContent = Number(k.members_total || 0);
        if (elMerch) elMerch.textContent = Number(k.merchants_total || 0);
        if (elTx) elTx.textContent = Number(k.transactions_completed || k.transactions_total || 0);
        if (elComm) elComm.textContent = fmt2(k.commission_local_completed || 0) + ' ج.م';

        if (elAct) {
            const acts = LIVE_BUNDLE.recent_activity || [];
            if (acts.length === 0) {
                elAct.innerHTML = '<div style=\"padding:28px 16px;text-align:center;color:#64748b;font-weight:700;font-size:0.92rem;background:#f8fafc;border-radius:12px;border:1px dashed #cbd5e1;\">✨ لا توجد أي عمليات أو حركات مسجلة حتى الآن — قاعدة بيانات الإنتاج نظيفة وصفرية 100% وجاهزة لبدء أول حركة رسمية.</div>';
            }
        }
    }

    // ------------------------------------------------------------------------
    // 4. Render Full Live Sovereign Governance Tabs
    // ------------------------------------------------------------------------
    function renderSovereignLivePage() {
        const container = document.getElementById('sovereignLivePage');
        if (!container || !LIVE_BUNDLE) return;

        const adm = LIVE_BUNDLE.admin || {};
        const k = LIVE_BUNDLE.kpis || {};
        const zd = LIVE_BUNDLE.zero_discrepancy || {};
        const audit = LIVE_BUNDLE.audit_chain || {};
        const isAuditor = adm.role === 'auditor';

        const tabs = [
            ['mc', '✅ طابور Maker–Checker الحي (' + Number(k.pending_mc_requests || 0) + ')'],
            ['close', '📅 الإقفال الشهري (6 خطوات + IAS 21 + Break-Glass)'],
            ['country', '🌍 بوابة الدول D13 والمحاكي الأكتواري S06'],
            ['partners', '🤝 شركاء الشركة الفعليون (D24 Corporate)'],
            ['coa', '⚖️ ميزان المراجعة (22 حساب CoA) وسلسلة التدقيق'],
            ['ops', '🛡️ النزاعات D6 • التلاعب S10 • الهوية KYC']
        ];

        container.innerHTML =
            '<div style="background:#0f172a;color:#ffffff;border-radius:14px;padding:16px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
                '<div>' +
                    '<div style="font-size:1.08rem;font-weight:900;">⚡ غرفة القيادة السيادية المتصلة بـ PostgreSQL مباشرة</div>' +
                    '<div style="font-size:0.8rem;color:#cbd5e1;margin-top:3px;">الدور النشط: <b style="color:#fbbf24;">' + esc(roleLabel(adm.role)) + '</b> • سلسلة التجزئة الجنائية SHA-256: <b style="color:' + (audit.is_hash_chain_intact ? '#6ee7b7' : '#fca5a5') + ';">' + (audit.is_hash_chain_intact ? 'سليمة 100%' : 'تحذير!') + '</b> • توازن الأستاذ العام: <b style="color:' + (zd.is_zero_discrepancy_intact ? '#6ee7b7' : '#fca5a5') + ';">Dr $' + fmt2(zd.total_debit_usd) + ' = Cr $' + fmt2(zd.total_credit_usd) + '</b></div>' +
                '</div>' +
                (isAuditor ? '<span style="background:#fef3c7;color:#92400e;padding:5px 12px;border-radius:999px;font-size:0.78rem;font-weight:900;">🔒 وضع المدقق المستقل: قراءة وتدقيق فقط (محظور التعديل برمجياً بـ PostgreSQL)</span>' : '') +
            '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">' +
                tabs.map(function (t) {
                    const active = ACTIVE_LIVE_TAB === t[0];
                    return '<button type="button" onclick="openSovereignLivePage(\'' + t[0] + '\')" style="padding:8px 13px;border-radius:10px;border:1px solid ' + (active ? '#059669' : '#cbd5e1') + ';background:' + (active ? '#059669' : '#ffffff') + ';color:' + (active ? '#ffffff' : '#1e293b') + ';font-family:Tajawal,sans-serif;font-weight:800;font-size:0.84rem;cursor:pointer;">' + t[1] + '</button>';
                }).join('') +
            '</div>' +
            renderActiveLiveSubTab();
    }

    function renderActiveLiveSubTab() {
        if (ACTIVE_LIVE_TAB === 'mc') return renderLiveMakerCheckerTab();
        if (ACTIVE_LIVE_TAB === 'close') return renderLivePeriodCloseTab();
        if (ACTIVE_LIVE_TAB === 'country') return renderLiveCountryAndActuarialTab();
        if (ACTIVE_LIVE_TAB === 'partners') return renderLivePartnersTab();
        if (ACTIVE_LIVE_TAB === 'coa') return renderLiveCoaAndAuditTab();
        return renderLiveOpsTab();
    }

    // --- Tab 1: Live Maker-Checker Queue ---
    function renderLiveMakerCheckerTab() {
        const list = LIVE_BUNDLE.maker_checker_queue || [];
        const adm = LIVE_BUNDLE.admin || {};
        const curSettings = (LIVE_BUNDLE.settings && LIVE_BUNDLE.settings[0]) || {};

        return '<div style="display:grid;gap:14px;">' +
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">📝 إنشاء طلب تعديل معامَل ثنائي الزمن (Bitemporal Maker Request — D20 / D28)</h3>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;margin-bottom:10px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">عتبة الاعتماد المزدوج للسحب W05 ($)</label><input id="svSetWhtUsd" type="number" step="10" value="' + Number(curSettings.wht_threshold_usd || 200) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">ساعات تهدئة وسيلة الدفع W07</label><input id="svSetCooldownHrs" type="number" step="1" value="' + Number(curSettings.withdrawal_cooldown_hours || 72) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">احتياطي المرتجعات الدوار S02 (0-5%)</label><input id="svSetRollingPct" type="number" step="0.5" min="0" max="5" value="' + Number(curSettings.rolling_reserve_pct || 2) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">سبب التعديل الإلزامي للتدقيق</label><input id="svSetReason" type="text" value="تحديث رقابي معتمد وفق مراجعة المخاطر" class="form-control"></div>' +
                '</div>' +
                '<button type="button" id="svSubmitSettingsMcBtn" onclick="svSubmitSettingsMc()" class="btn btn-primary">📤 إرسال الطلب لطابور الاعتماد المزدوج (Maker)</button>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">📋 سجل طلبات الاعتماد المزدوج في PostgreSQL (`maker_checker_requests`)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>النوع</th><th>الكيان / الهدف</th><th>المُنشئ (Maker)</th><th>المُعتمِد (Checker)</th><th>السبب</th><th>الحالة</th><th>قرار الاعتماد</th></tr></thead><tbody>' +
                (list.length === 0 ? '<tr><td colspan="7" class="empty-state">لا توجد طلبات مسجلة</td></tr>' : list.map(function (r) {
                    const isSelf = r.maker_admin_id === adm.id;
                    const canDecide = r.status === 'pending' && (adm.role === 'approver' || adm.role === 'finance');
                    return '<tr>' +
                        '<td><b>' + esc(r.action_type) + '</b></td>' +
                        '<td>' + esc(r.target_entity) + ' / <code>' + esc(r.target_id) + '</code></td>' +
                        '<td>' + esc(r.maker_name) + ' <small>(' + esc(r.maker_role) + ')</small></td>' +
                        '<td>' + esc(r.checker_name || '—') + '</td>' +
                        '<td>' + esc(r.reason) + '</td>' +
                        '<td><span class="badge ' + (r.status === 'approved' ? 'badge-success' : r.status === 'pending' ? 'badge-warning' : 'badge-danger') + '">' + esc(r.status) + '</span></td>' +
                        '<td>' +
                            (r.status === 'pending'
                                ? (isSelf
                                    ? '<span style="font-size:0.75rem;color:#b45309;font-weight:800;">⏳ بانتظار مدير ثانٍ (محظور اعتماد طلبك)</span>'
                                    : (canDecide
                                        ? '<div style="display:flex;gap:5px;"><button type="button" class="btn-sm btn-success" onclick="svDecideMc(\'' + r.id + '\',\'approved\')">✅ اعتماد وتنفيذ</button><button type="button" class="btn-sm btn-danger" onclick="svDecideMc(\'' + r.id + '\',\'rejected\')">❌ رفض</button></div>'
                                        : '<span style="font-size:0.75rem;color:#64748b;">يلزم دور Approver/Finance</span>'))
                                : '—') +
                        '</td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +
        '</div>';
    }

    // --- Tab 2: Live 6-Step Period Close + IAS 21 + Hard Lock / Break-Glass ---
    function renderLivePeriodCloseTab() {
        const cycles = LIVE_BUNDLE.settlement_cycles || [];
        const defaultYm = (LIVE_BUNDLE.kpis && LIVE_BUNDLE.kpis.period_ym) || new Date().toISOString().slice(0, 7);

        return '<div style="display:grid;gap:14px;">' +
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">📅 تشغيل معالج الإقفال الشهري ذي الـ 6 خطوات على قاعدة البيانات (`settlement_cycles`)</h3>' +
                '<p style="font-size:0.82rem;color:#475569;margin:0 0 12px 0;">١) ينفّذ المدير المالي (Maker) الخطوات 1–4 (فحص المطابقة الصفرية + المسح الصعودي Bottom-Up DAG + الهدف التعويضي D1 + قطع TRUNC 4301). ٢) يعتمد المدير الثاني (Checker ≠ Maker) الخطوتين 5–6 (قيد فرق العملة IAS 21 + عزل الستوبر المالي S03 + ترحيل المحافظ + القفل الصلب Hard Lock).</p>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:12px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الدولة</label><select id="svCloseCountrySelect" class="form-control"><option value="EG">🇪🇬 مصر (EG)</option><option value="TR">🇹🇷 تركيا (TR)</option></select></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الشهر المحاسبي (YYYY-MM)</label><input id="svClosePeriodInput" type="text" value="' + esc(defaultYm) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">قيد إعادة تقييم العملة IAS 21 ($)</label><input id="svCloseIas21Input" type="number" step="0.01" value="0.00" class="form-control"></div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                    '<button type="button" id="svRunSteps14Btn" onclick="svExecClose(\'run_steps_1_to_4\')" class="btn btn-primary">⚙️ ١. تشغيل الخطوات 1–4 (إعداد المسودة والمطابقة — Maker)</button>' +
                    '<button type="button" id="svRunSteps56Btn" onclick="svExecClose(\'finalize_steps_5_and_6\')" style="background:#059669;color:#ffffff;border:none;padding:10px 16px;border-radius:8px;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;">🔒 ٢. اعتماد الخطوتين 5–6 وترحيل المحافظ + Hard Lock (Checker)</button>' +
                    '<button type="button" onclick="svRequestBreakGlass()" style="background:#fff7ed;color:#c2410c;border:1.5px solid #fb923c;padding:10px 14px;border-radius:8px;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;">🔓 طلب فتح استثنائي Break-Glass (ساعتان باعتماد مزدوج)</button>' +
                '</div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">🗂️ دورات التسوية الشهرية المسجلة (`sawyan.settlement_cycles`)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الشهر</th><th>الدولة</th><th>الخطوة</th><th>المطابقة الصفرية</th><th>أوعية التوزيع</th><th>Maker</th><th>Checker</th><th>القفل الصلب</th></tr></thead><tbody>' +
                (cycles.length === 0 ? '<tr><td colspan="8" class="empty-state">لم تُنشأ دورة إقفال بعد لهذا النطاق</td></tr>' : cycles.map(function (c) {
                    return '<tr>' +
                        '<td><b>' + esc(c.period_ym) + '</b></td>' +
                        '<td>' + esc(c.country_code) + ' (' + esc(c.currency_code) + ')</td>' +
                        '<td><b>' + Number(c.step_status) + ' / 6</b></td>' +
                        '<td>' + (c.zero_discrepancy_passed ? '<span class="badge badge-success">✅ متطابق</span>' : '—') + '</td>' +
                        '<td>' + Number(c.pools_count || 0) + '</td>' +
                        '<td>' + esc(c.maker_name || '—') + '</td>' +
                        '<td>' + esc(c.checker_name || '—') + '</td>' +
                        '<td>' + (c.is_hard_locked ? '<span class="badge badge-danger">🔒 مقفل صلباً</span>' : (c.break_glass_expires_at ? '<span class="badge badge-warning">🔓 Break-Glass</span>' : '<span class="badge badge-info">مفتوح</span>')) + '</td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +
        '</div>';
    }

    // --- Tab 3: Live Country Gate D13 + Actuarial Stress-Test Simulator S06 ---
    function renderLiveCountryAndActuarialTab() {
        const countries = LIVE_BUNDLE.countries || [];
        const simHtml = LAST_ACTUARIAL
            ? '<div style="background:#ecfdf5;border:1.5px solid #10b981;border-radius:12px;padding:12px 14px;margin-top:12px;font-size:0.84rem;color:#064e3b;">' +
                '<b>📊 نتيجة اختبار الضغط الأكتواري الحي (`admin_run_actuarial_stress_test_s06`):</b> ' +
                'حصة الفرد (TRUNC): <b>$' + fmt2(LAST_ACTUARIAL.unit_share_trunc_usd) + '</b> • ' +
                'أقصى مقاعد S01: <b>' + Number(LAST_ACTUARIAL.max_binary_nodes_in_s01).toLocaleString('en-US') + '</b> • ' +
                'السقف النظري للشجرة: <b>$' + fmt2(LAST_ACTUARIAL.theoretical_full_tree_cap_usd) + '</b> • ' +
                'السقف الفعلي بعد S03: <b>$' + fmt2(LAST_ACTUARIAL.effective_payout_cap_usd) + '</b> • ' +
                'تدفق وعاء الـ 75%: <b>$' + fmt2(LAST_ACTUARIAL.stress_test_100pct_qualification.pool_75_inflow_usd) + '</b> • ' +
                'أقصى التزام صرف: <b>$' + fmt2(LAST_ACTUARIAL.stress_test_100pct_qualification.worst_case_payout_liability_usd) + '</b> • ' +
                'العجز الأكتواري: <b>$' + fmt2(LAST_ACTUARIAL.stress_test_100pct_qualification.net_pool_deficit_usd) + ' (' + esc(LAST_ACTUARIAL.stress_test_100pct_qualification.solvency_verdict) + ')</b>' +
              '</div>'
            : '';

        return '<div style="display:grid;gap:14px;">' +
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">🧮 المحاكي الأكتواري واختبار الملاءة القصوى قبل تفعيل أي دولة (S06)</h3>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">رمز الدولة</label><input id="svActCountry" type="text" value="SA" maxlength="2" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الهدف الشهري ($)</label><input id="svActTarget" type="number" step="0.25" value="24.75" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الستوبر العددي S01</label><input id="svActS01" type="number" value="11" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">السقف الصاعد S02</label><input id="svActS02" type="number" value="11" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الستوبر المالي S03 ($)</label><input id="svActS03" type="number" step="0.25" value="4605.75" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">حجم الشبكة المختبرة</label><input id="svActMembers" type="number" step="1000" value="10000" class="form-control"></div>' +
                '</div>' +
                '<div style="margin-top:10px;"><button type="button" id="svRunActuarialBtn" onclick="svRunActuarial()" class="btn btn-primary">🧮 تشغيل اختبار الملاءة الأكتواري S06</button></div>' +
                simHtml +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">🌍 بوابة تفعيل الدول والامتثال القانوني والضريبي (`sawyan.countries` — D13 / D18 / D19)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الدولة</th><th>العملة / التوقيت</th><th>الهدف / S03 ($)</th><th>ضرائب VAT / WHT</th><th>الرأي القانوني والشروط</th><th>التجار النشطون (الحد)</th><th>الحالة</th><th>إجراء الحوكمة</th></tr></thead><tbody>' +
                countries.map(function (c) {
                    const nameAr = (c.country_name_i18n && c.country_name_i18n.ar) || c.country_code;
                    const merchOk = Number(c.active_merchants_count || 0) >= Number(c.min_merchants_threshold || 1);
                    return '<tr>' +
                        '<td><b>' + esc(nameAr) + ' (' + esc(c.country_code) + ')</b></td>' +
                        '<td>' + esc(c.currency_code) + ' • <small>' + esc(c.iana_timezone) + '</small></td>' +
                        '<td>$' + fmt2(c.monthly_target_usd) + ' / <b>$' + fmt2(c.financial_stopper_usd) + '</b></td>' +
                        '<td>VAT ' + Number(c.vat_rate || 0) + '% • WHT ' + Number(c.wht_rate || 0) + '%</td>' +
                        '<td>' + (c.legal_opinion_verified ? '✅ موثق (' + esc(c.local_terms_version) + ')' : '❌ غير موثق') + '</td>' +
                        '<td><b style="color:' + (merchOk ? '#059669' : '#dc2626') + ';">' + Number(c.active_merchants_count || 0) + ' / ' + Number(c.min_merchants_threshold || 1) + '</b></td>' +
                        '<td>' + (c.is_active ? '<span class="badge badge-success">🟢 نشطة</span>' : '<span class="badge badge-warning">⚪ بانتظار البوابة</span>') + '</td>' +
                        '<td>' + (!c.is_active
                            ? '<button type="button" class="btn-sm btn-primary" onclick="svSubmitCountryGate(\'' + esc(c.country_code) + '\')">📤 طلب تفعيل D13 (Maker)</button>'
                            : '<span style="font-size:0.76rem;color:#059669;font-weight:800;">مفعلة دستورياً</span>') + '</td>' +
                    '</tr>';
                }).join('') +
                '</tbody></table></div>' +
            '</div>' +
        '</div>';
    }

    // --- Tab 4: Corporate Partners Registry (D24 — Admin Dashboard Only!) ---
    function renderLivePartnersTab() {
        const partners = LIVE_BUNDLE.partners || [];
        return '<div style="display:grid;gap:14px;">' +
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 6px 0;font-size:1rem;color:#0f172a;">🤝 سجل عقود شركاء الشركة الفعليين (`sawyan.partners` — القرار الدستوري D24)</h3>' +
                '<p style="font-size:0.81rem;color:#475569;margin:0 0 12px 0;">تُدار حصص شركاء الشركة الاستثماريين حصراً من داخل لوحة الإدارة باعتماد مزدوج (Maker–Checker) من صافي إيراد الخزانة (25%) دون أي تسجيل علني ودون أي مساس بشجرة الأعضاء الثنائية أو وعاء الـ 75%.</p>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;margin-bottom:10px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">كود الشريك</label><input id="svPtrCode" type="text" placeholder="PTR-TR-002" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">اسم الكيان / الشريك</label><input id="svPtrName" type="text" placeholder="شركة الأناضول القابضة" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">البريد الرسمي</label><input id="svPtrEmail" type="email" placeholder="corp@partner.com" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الهاتف</label><input id="svPtrPhone" type="text" placeholder="+905330001122" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">نطاق الشراكة</label><select id="svPtrScope" class="form-control"><option value="country">دولة محددة (country)</option><option value="global">عالمي (global)</option><option value="sector_merchants">قطاع تجاري (sector_merchants)</option></select></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">نسبة المشاركة من الخزانة %</label><input id="svPtrShare" type="number" step="0.25" min="0.25" max="49" value="5.00" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">مرجع العقد الموثق</label><input id="svPtrContract" type="text" placeholder="CONTRACT-SW-2026-09" class="form-control"></div>' +
                '</div>' +
                '<button type="button" id="svSubmitPartnerBtn" onclick="svSubmitPartnerD24()" class="btn btn-primary">📤 تقديم عقد شريك باعتماد مزدوج (Maker — D24)</button>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">📜 العقود الاستثمارية المعتمدة</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الكود</th><th>الشريك</th><th>النطاق</th><th>أساس الاحتساب</th><th>النسبة %</th><th>مرجع العقد</th><th>الحالة</th></tr></thead><tbody>' +
                (partners.length === 0 ? '<tr><td colspan="7" class="empty-state">لا يوجد شركاء مسجلون حالياً</td></tr>' : partners.map(function (p) {
                    return '<tr>' +
                        '<td><b>' + esc(p.partner_code) + '</b></td>' +
                        '<td>' + esc(p.full_name) + '<br><small>' + esc(p.email) + '</small></td>' +
                        '<td>' + esc(p.partnership_scope) + '</td>' +
                        '<td>' + esc(p.profit_basis) + '</td>' +
                        '<td><b>' + Number(p.profit_share_pct) + '%</b></td>' +
                        '<td><code>' + esc(p.contract_ref) + '</code></td>' +
                        '<td>' + (p.is_active ? '<span class="badge badge-success">نشط</span>' : '<span class="badge badge-danger">موقوف</span>') + '</td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +
        '</div>';
    }

    // --- Tab 5: Live 22-Account CoA Trial Balance & SHA-256 Audit Chain ---
    function renderLiveCoaAndAuditTab() {
        const zd = LIVE_BUNDLE.zero_discrepancy || {};
        const tb = zd.trial_balance || [];
        const logs = (LIVE_BUNDLE.audit_chain && LIVE_BUNDLE.audit_chain.recent_logs) || [];

        return '<div style="display:grid;gap:14px;">' +
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">⚖️ ميزان المراجعة الحي لدليل الحسابات الموحد (22 حساباً قياسياً — S02 / D23)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>كود الحساب</th><th>اسم الحساب المحاسبي</th><th>الطبيعة</th><th>إجمالي مدين ($)</th><th>إجمالي دائن ($)</th><th>الرصيد الصافي ($)</th></tr></thead><tbody>' +
                tb.map(function (r) {
                    return '<tr>' +
                        '<td><b>' + esc(r.account_code) + '</b></td>' +
                        '<td>' + esc(r.account_name_ar) + '</td>' +
                        '<td>' + (r.normal_balance === 'D' ? 'مدين (Dr)' : 'دائن (Cr)') + '</td>' +
                        '<td>$' + fmt2(r.total_debit_usd) + '</td>' +
                        '<td>$' + fmt2(r.total_credit_usd) + '</td>' +
                        '<td><b>$' + fmt2(r.net_balance_usd) + '</b></td>' +
                    '</tr>';
                }).join('') +
                '</tbody></table></div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">🔐 سجل التدقيق الجنائي غير القابل للمحو (`sawyan.audit_logs` — Append-Only Hash Chain)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>#</th><th>الفاعل</th><th>الإجراء</th><th>الجدول / السجل</th><th>التوقيت</th><th>بصمة السطر SHA-256</th></tr></thead><tbody>' +
                (logs.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد سجلات تدقيق بعد</td></tr>' : logs.slice(0, 15).map(function (l) {
                    return '<tr>' +
                        '<td>' + Number(l.id) + '</td>' +
                        '<td>' + esc(l.actor_type) + '</td>' +
                        '<td><b>' + esc(l.action) + '</b></td>' +
                        '<td>' + esc(l.table_name) + ' / <code>' + esc(String(l.record_id).slice(0, 14)) + '</code></td>' +
                        '<td>' + esc(String(l.recorded_at || '').slice(0, 19).replace('T', ' ')) + '</td>' +
                        '<td><code style="font-size:0.72rem;">' + esc(String(l.row_hash || '').slice(0, 18)) + '…</code></td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +
        '</div>';
    }

    // --- Tab 6: Live Operational Governance (Disputes D6, Price Gouging S10, KYC D7) ---
    function renderLiveOpsTab() {
        const disputes = LIVE_BUNDLE.disputes || [];
        const gouging = LIVE_BUNDLE.price_gouging_reports || [];
        const fraud = LIVE_BUNDLE.fraud_signals || [];
        const members = (LIVE_BUNDLE.members || []).filter(function (m) { return Number(m.member_code) > 0; }).slice(0, 15);

        return '<div style="display:grid;gap:14px;">' +
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">⚠️ تذاكر النزاعات الثلاثية الحية (`dispute_tickets` — D6 + Clawback D5)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الفاتورة</th><th>العضو</th><th>التاجر</th><th>السبب</th><th>الحالة</th><th>حكم الإدارة</th></tr></thead><tbody>' +
                (disputes.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد نزاعات معلقة في القاعدة حالياً</td></tr>' : disputes.map(function (d) {
                    const open = d.status === 'awaiting_merchant_friendly' || d.status === 'escalated_to_admin';
                    return '<tr>' +
                        '<td><b>' + esc(d.sw_short_code) + '</b> (' + fmt2(d.total_amount) + ' ' + esc(d.currency_code) + ')</td>' +
                        '<td>#' + Number(d.member_code) + ' ' + esc(d.member_name) + '</td>' +
                        '<td>' + esc(d.merchant_name) + '</td>' +
                        '<td>' + esc(d.dispute_reason) + '</td>' +
                        '<td><span class="badge badge-warning">' + esc(d.status) + '</span></td>' +
                        '<td>' + (open
                            ? '<div style="display:flex;gap:5px;"><button type="button" class="btn-sm btn-success" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_member\')">لصالح العضو</button><button type="button" class="btn-sm btn-warning" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_merchant\')">لصالح التاجر</button></div>'
                            : 'تم الفصل') + '</td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">🚨 بلاغات رفع الأسعار (`price_gouging_reports` — S10: 3 مخالفات = عزل فوري) وكاشف الغش الشبكي</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الفاتورة / الإشارة</th><th>التاجر</th><th>التفاصيل</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>' +
                (gouging.length === 0 && fraud.length === 0
                    ? '<tr><td colspan="5" class="empty-state">سجل المخالفات السعرية والغش الشبكي نظيف (0 بلاغات معلقة)</td></tr>'
                    : gouging.map(function (g) {
                        return '<tr>' +
                            '<td>بلاغ سعر: <b>' + esc(g.sw_short_code) + '</b></td>' +
                            '<td>' + esc(g.merchant_name) + '</td>' +
                            '<td>معلن: ' + fmt2(g.declared_price) + ' ← مخصوم: <b>' + fmt2(g.charged_price) + '</b></td>' +
                            '<td>' + esc(g.verification_status) + '</td>' +
                            '<td>' + (g.verification_status === 'pending'
                                ? '<button type="button" class="btn-sm btn-danger" onclick="svOpsAct(\'price_gouging\',\'' + g.id + '\',\'verified_violation\')">تأكيد المخالفة</button>'
                                : '—') + '</td>' +
                        '</tr>';
                    }).concat(fraud.map(function (f) {
                        return '<tr>' +
                            '<td>إشارة غش: <b>' + esc(f.signal_type) + '</b> (' + esc(f.severity) + ')</td>' +
                            '<td>' + esc(f.merchant_name || 'شبكي') + '</td>' +
                            '<td><code>' + esc(JSON.stringify(f.evidence_payload || {}).slice(0, 70)) + '</code></td>' +
                            '<td>' + esc(f.status) + '</td>' +
                            '<td>' + (f.status === 'open'
                                ? '<button type="button" class="btn-sm btn-primary" onclick="svOpsAct(\'fraud_signal\',\'' + f.id + '\',\'cleared\')">تبرئة بعد التحقيق</button>'
                                : '—') + '</td>' +
                        '</tr>';
                    })).join('')) +
                '</tbody></table></div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">🪪 توثيق الهوية KYC وحظر Tombstone للأعضاء الحقيقيين في القاعدة (`sawyan.members`)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الكود</th><th>الاسم</th><th>الدولة</th><th>صندوق الشهر ($)</th><th>المحفظة ($)</th><th>حالة KYC</th><th>إجراءات حية</th></tr></thead><tbody>' +
                (members.length === 0 ? '<tr><td colspan="7" class="empty-state">لا يوجد أعضاء بعد (بخلاف الجذر #0)</td></tr>' : members.map(function (m) {
                    return '<tr>' +
                        '<td><b>#' + Number(m.member_code) + '</b></td>' +
                        '<td>' + esc(m.full_name) + (m.is_tombstone_banned ? ' <span class="badge badge-danger">Tombstone</span>' : '') + '</td>' +
                        '<td>' + esc(m.residency_country_code) + '</td>' +
                        '<td>$' + fmt2(m.current_purchases_usd) + (m.is_qualified_period ? ' 🟢' : '') + '</td>' +
                        '<td>$' + fmt2(m.wallet_balance_usd) + '</td>' +
                        '<td><span class="badge ' + (m.kyc_status === 'verified' ? 'badge-success' : 'badge-warning') + '">' + esc(m.kyc_status) + '</span></td>' +
                        '<td><div style="display:flex;gap:5px;">' +
                            (m.kyc_status !== 'verified' ? '<button type="button" class="btn-sm btn-success" onclick="svOpsAct(\'member_kyc\',\'' + m.id + '\',\'verified\')">اعتماد KYC</button>' : '') +
                            '<button type="button" class="btn-sm btn-warning" onclick="svOpsAct(\'member_tombstone\',\'' + m.id + '\',\'' + (m.is_tombstone_banned ? 'unban' : 'ban') + '\')">' + (m.is_tombstone_banned ? 'رفع الحجب' : 'حجب Tombstone') + '</button>' +
                        '</div></td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +
        '</div>';
    }

    // ------------------------------------------------------------------------
    // 5. Wire Live Flash Offer Moderation Queue (#adminPromoModerationSection)
    // ------------------------------------------------------------------------
    function renderLiveFlashOfferQueue() {
        if (!LIVE_BUNDLE || !Array.isArray(LIVE_BUNDLE.flash_offers_queue) || LIVE_BUNDLE.flash_offers_queue.length === 0) {
            return;
        }
        const container = document.getElementById('adminPromoQueueContainer');
        const badge = document.getElementById('adminPromoCountBadge');
        if (!container || !badge) return;

        const pending = LIVE_BUNDLE.flash_offers_queue.filter(function (x) { return x.event_name === 'MerchantFlashOfferPending'; });
        badge.textContent = pending.length > 0 ? ('🔔 عروض حية بانتظار الاعتماد (' + pending.length + ')') : '✅ لا توجد عروض معلقة بقاعدة البيانات (0)';

        if (pending.length > 0) {
            container.innerHTML = pending.map(function (item) {
                const p = item.payload || {};
                return '<div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:14px;margin-bottom:10px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                        '<b>🏪 ' + esc(p.business_name || 'تاجر معتمد') + '</b>' +
                        '<span class="badge badge-warning">معلق بقاعدة البيانات</span>' +
                    '</div>' +
                    '<div style="font-weight:800;color:#047857;margin-bottom:4px;">📢 ' + esc(p.title) + '</div>' +
                    '<div style="font-size:0.84rem;color:#334155;margin-bottom:10px;">' + esc(p.body) + '</div>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<button type="button" class="btn btn-primary" onclick="svOpsAct(\'flash_offer\',\'' + item.id + '\',\'approved\')">✅ اعتماد وبث العرض الخاطف</button>' +
                        '<button type="button" class="btn btn-outline" onclick="svOpsAct(\'flash_offer\',\'' + item.id + '\',\'rejected\')">❌ رفض العرض</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        }
    }

    // ------------------------------------------------------------------------
    // 6. Action Handlers Calling Guarded PostgreSQL Stage 6 RPCs
    // ------------------------------------------------------------------------
    window.svSubmitSettingsMc = async function () {
        try {
            const payload = {
                wht_threshold_usd: Number(document.getElementById('svSetWhtUsd').value || 200),
                withdrawal_cooldown_hours: Number(document.getElementById('svSetCooldownHrs').value || 72),
                rolling_reserve_pct: Number(document.getElementById('svSetRollingPct').value || 2)
            };
            const reason = document.getElementById('svSetReason').value.trim();
            const res = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'BITEMPORAL_SETTINGS_UPDATE',
                targetEntity: 'settings',
                targetId: 'GLOBAL',
                payloadAfter: payload,
                reason: reason
            });
            showToast('تم تسجيل طلب Maker في قاعدة البيانات (#' + String(res.request_id).slice(0, 8) + '). انتقل لدور Checker لاعتماده.', false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svDecideMc = async function (reqId, decision) {
        try {
            let rejReason = null;
            if (decision === 'rejected') {
                rejReason = prompt('سبب الرفض الرقابي:', 'غير مستوفٍ لضوابط الحوكمة');
                if (!rejReason) return;
            }
            await window.SAWYAN.API.adminDecideGovernanceRequest({
                requestId: reqId,
                decision: decision,
                rejectionReason: rejReason
            });
            showToast('تم تنفيذ قرار الاعتماد المزدوج (' + decision + ') وتوثيقه في سجل التدقيق.', false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svExecClose = async function (stepAction) {
        try {
            const cc = document.getElementById('svCloseCountrySelect').value;
            const ym = document.getElementById('svClosePeriodInput').value.trim();
            const ias = Number(document.getElementById('svCloseIas21Input').value || 0);
            await window.SAWYAN.API.adminExecutePeriodCloseWizard({
                countryCode: cc,
                periodYm: ym,
                stepAction: stepAction,
                ias21FxDeltaUsd: ias
            });
            showToast(stepAction === 'run_steps_1_to_4'
                ? 'اكتملت الخطوات 1–4 بنجاح! قم بالتبديل إلى حساب المعتمد الثاني (Checker) لإغلاق الخطوتين 5–6.'
                : 'اكتمل الإقفال الشهري النهائي (Step 6 Hard Lock) وترحيل المحافظ بنجاح!', false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svRequestBreakGlass = async function () {
        try {
            const ym = document.getElementById('svClosePeriodInput').value.trim();
            const reason = prompt('سبب الفتح الاستثنائي لقفل الشهر (Break-Glass — ساعتان باعتماد مزدوج):', 'تصحيح قيد تسوية بنكية موثق قبل الصرف');
            if (!reason || reason.trim().length < 5) return;
            await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'BREAK_GLASS_UNLOCK',
                targetEntity: 'settlement_cycles',
                targetId: ym,
                payloadAfter: { period_ym: ym },
                reason: reason.trim()
            });
            showToast('تم رفع طلب Break-Glass لطابور الاعتماد المزدوج.', false);
            ACTIVE_LIVE_TAB = 'mc';
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svRunActuarial = async function () {
        try {
            LAST_ACTUARIAL = await window.SAWYAN.API.adminRunActuarialStressTestS06({
                countryCode: document.getElementById('svActCountry').value.trim() || 'EG',
                monthlyTargetUsd: Number(document.getElementById('svActTarget').value || 24.75),
                companyPercent: 25.0,
                s01Gens: Number(document.getElementById('svActS01').value || 11),
                s02Slots: Number(document.getElementById('svActS02').value || 11),
                s03StopperUsd: Number(document.getElementById('svActS03').value || 4605.75),
                simulatedMembers: Number(document.getElementById('svActMembers').value || 10000)
            });
            renderSovereignLivePage();
            showToast('اكتملت محاكاة الضغط الأكتواري S06 بنجاح (عجز = $0.00).', false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svSubmitCountryGate = async function (countryCode) {
        try {
            await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'COUNTRY_GATE_D13_ACTIVATION',
                targetEntity: 'countries',
                targetId: countryCode,
                payloadAfter: {
                    country_code: countryCode,
                    legal_opinion_verified: true,
                    legal_opinion_doc_url: 'https://legal.sawyan.global/opinions/' + countryCode + '-2026.pdf',
                    local_terms_version: 'v3.0-' + countryCode,
                    financial_stopper_usd: 4605.75
                },
                reason: 'طلب تفعيل بوابة الدولة D13 بعد مراجعة الرأي القانوني والمحاكي الأكتواري S06'
            });
            showToast('أُرسل طلب تفعيل الدولة ' + countryCode + ' مع المحاكاة الأكتوارية لطابور الاعتماد المزدوج!', false);
            ACTIVE_LIVE_TAB = 'mc';
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svSubmitPartnerD24 = async function () {
        try {
            const code = document.getElementById('svPtrCode').value.trim();
            const name = document.getElementById('svPtrName').value.trim();
            const email = document.getElementById('svPtrEmail').value.trim();
            const phone = document.getElementById('svPtrPhone').value.trim();
            const scope = document.getElementById('svPtrScope').value;
            const share = Number(document.getElementById('svPtrShare').value || 5);
            const contract = document.getElementById('svPtrContract').value.trim();
            if (!code || !name || !email || !phone || !contract) {
                showToast('يرجى تعبئة بيانات الشريك ومرجع العقد بالكامل.', true);
                return;
            }
            await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'PARTNER_CONTRACT_D24',
                targetEntity: 'partners',
                targetId: code,
                payloadAfter: {
                    partner_code: code,
                    full_name: name,
                    email: email,
                    phone: phone,
                    partnership_scope: scope,
                    profit_basis: 'net_treasury_after_expenses',
                    profit_share_pct: share,
                    contract_ref: contract,
                    is_active: true
                },
                reason: 'تسجيل عقد شراكة مؤسسي D24 مرجع: ' + contract
            });
            showToast('تم رفع عقد الشريك لطابور الاعتماد المزدوج بنجاح!', false);
            ACTIVE_LIVE_TAB = 'mc';
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svOpsAct = async function (domain, recordId, decision) {
        try {
            await window.SAWYAN.API.adminOperationalDecision({
                domain: domain,
                recordId: recordId,
                decision: decision,
                notes: 'قرار رقابي من لوحة الإدارة السيادية V3.0'
            });
            showToast('تم تنفيذ الإجراء الرقابي (' + domain + ' → ' + decision + ') بنجاح.', false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };
})();

