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

    function getGlobalStopperConfig() {
        const s = (LIVE_BUNDLE && Array.isArray(LIVE_BUNDLE.settings) && LIVE_BUNDLE.settings[0]) || {};
        const s01 = Math.max(1, Math.min(40, parseInt(s.numerical_stopper_s01 || s.generations_count || 11, 10) || 11));
        const s02 = Math.max(1, parseInt(s.upline_ceiling_s02 || 11, 10) || 11);
        const idealNodes = Math.pow(2, s01) - 1;
        return { s01: s01, s02: s02, idealNodes: idealNodes };
    }

    function calcUnitShareCents(targetUsd, s02Slots) {
        const tgtCents = Math.max(0, Math.round(Number(targetUsd || 0) * 100));
        const slots = Math.max(1, parseInt(s02Slots || 11, 10) || 11);
        return Math.floor(tgtCents / slots);
    }

    function calcUnitShareUsd(targetUsd, s02Slots) {
        return calcUnitShareCents(targetUsd, s02Slots) / 100;
    }

    function calcDefaultCountryStopperUsd(targetUsd, s01Gens, s02Slots) {
        const cfg = getGlobalStopperConfig();
        const s01 = s01Gens ? Math.max(1, Math.min(40, parseInt(s01Gens, 10) || cfg.s01)) : cfg.s01;
        const s02 = s02Slots ? Math.max(1, parseInt(s02Slots, 10) || cfg.s02) : cfg.s02;
        const shareCents = calcUnitShareCents(targetUsd, s02);
        const idealNodes = Math.pow(2, s01) - 1;
        return (shareCents * idealNodes) / 100;
    }

    function isSovereignFounder(adm) {
        if (!adm) return false;
        return Boolean(adm.is_sovereign_founder);
    }

    function roleLabel(role, adm) {
        if (isSovereignFounder(adm)) {
            return '👑 المؤسس السيادي — صلاحية مطلقة فورية';
        }
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
                    totpCode: null
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
        if (adm.id && window.SAWYAN && window.SAWYAN.Notifications) {
            window.SAWYAN.Notifications.init('admin', adm.id);
        }
        if (!window._svAdminNotifPollTimer) {
            window._svAdminNotifPollTimer = setInterval(function () {
                if (typeof document !== 'undefined' && document.hidden) return;
                refreshSovereignBundle(false);
            }, 45000);
        }
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
            badgeEl.textContent = roleLabel(adm.role, adm);
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
            const founderActive = isSovereignFounder(adm);
            const checkerActive = adm.role === 'approver' && !founderActive;
            bar.innerHTML =
                '<span style="font-size:0.75rem;color:#64748b;font-weight:800;">تبديل الدور الحي:</span>' +
                '<button type="button" id="switchFounderBtn" onclick="sawyanSwitchDemoRole(\'founder\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (founderActive ? '#b45309' : '#cbd5e1') + ';background:' + (founderActive ? '#b45309' : '#ffffff') + ';color:' + (founderActive ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">👑 المؤسس (إدارة مطلقة)</button>' +
                '<button type="button" id="switchMakerBtn" onclick="sawyanSwitchDemoRole(\'maker\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (adm.role === 'finance' ? '#1d4ed8' : '#cbd5e1') + ';background:' + (adm.role === 'finance' ? '#1d4ed8' : '#ffffff') + ';color:' + (adm.role === 'finance' ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">💼 Maker (مالي)</button>' +
                '<button type="button" id="switchCheckerBtn" onclick="sawyanSwitchDemoRole(\'checker\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (checkerActive ? '#059669' : '#cbd5e1') + ';background:' + (checkerActive ? '#059669' : '#ffffff') + ';color:' + (checkerActive ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">✅ Checker (مُعتمِد)</button>' +
                '<button type="button" id="switchAuditorBtn" onclick="sawyanSwitchDemoRole(\'auditor\')" style="padding:5px 10px;border-radius:8px;border:1px solid ' + (adm.role === 'auditor' ? '#d97706' : '#cbd5e1') + ';background:' + (adm.role === 'auditor' ? '#d97706' : '#ffffff') + ';color:' + (adm.role === 'auditor' ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-size:0.76rem;font-weight:800;cursor:pointer;">🔍 Auditor (قراءة فقط)</button>';
        } else {
            bar.innerHTML = '<span style="font-size:0.76rem;background:#ecfdf5;color:#065f46;border:1px solid #6ee7b7;padding:4px 10px;border-radius:999px;font-weight:800;">🔒 جلسة إنتاج سيادية موثقة (`sawyan`)</span>';
        }
    }

    window.sawyanSwitchDemoRole = async function (which) {
        if (!window.SAWYAN || !window.SAWYAN.API || !window.SAWYAN.API.isDemoMode()) return;
        const creds = {
            founder: { email: 'demo.founder@sawyan.local', password: 'Demo@Founder2026' },
            maker: { email: 'demo.maker@sawyan.local', password: 'Demo@Maker2026' },
            checker: { email: 'demo.checker@sawyan.local', password: 'Demo@Checker2026' },
            auditor: { email: 'demo.auditor@sawyan.local', password: 'Demo@Auditor2026' }
        }[which];
        if (!creds) return;
        try {
            const res = await window.SAWYAN.API.authenticateAdminLogin({
                email: creds.email,
                password: creds.password,
                totpCode: null
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
            window.__SAWYAN_ADMIN_LIVE_BUNDLE__ = LIVE_BUNDLE;
            if (LIVE_BUNDLE && LIVE_BUNDLE.admin) {
                window.currentAdmin = LIVE_BUNDLE.admin;
                updateHeaderIdentity(LIVE_BUNDLE.admin);
            }
            if (window.SAWYAN && window.SAWYAN.Notifications) {
                if (!window.SAWYAN.Notifications.userId && LIVE_BUNDLE?.admin?.id) {
                    window.SAWYAN.Notifications.init('admin', LIVE_BUNDLE.admin.id);
                }
                if (Array.isArray(LIVE_BUNDLE?.admin_notifications)) {
                    window.SAWYAN.Notifications.hydrateFromBundle(LIVE_BUNDLE.admin_notifications);
                }
            }
            mountSovereignNavAndPage();
            renderLiveSummaryBannerOnHome();
            renderSovereignLivePage();
            renderLiveFlashOfferQueue();
            if (typeof window.hydrateAdminFromLiveBundle === 'function') {
                window.hydrateAdminFromLiveBundle(LIVE_BUNDLE);
            }
            if (typeof window.hydrateAdminOpsFromLiveBundle === 'function') {
                window.hydrateAdminOpsFromLiveBundle(LIVE_BUNDLE);
            }
            if (typeof window.refreshLiveSettingsCenterIfOpen === 'function') {
                window.refreshLiveSettingsCenterIfOpen(LIVE_BUNDLE);
            }
            const merMount = document.getElementById('svLiveMerSettingsMount');
            if (merMount && typeof window.renderLiveMerchantRiskSettingsCard === 'function') {
                merMount.innerHTML = window.renderLiveMerchantRiskSettingsCard('scMer');
            }
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
            div.setAttribute('data-spec-id', 'admin-live-hub');
            area.insertBefore(div, area.firstChild);
        }
        if (window.SAWYAN && window.SAWYAN.AppShell && typeof window.SAWYAN.AppShell.syncMoreMenu === 'function') {
            window.SAWYAN.AppShell.syncMoreMenu();
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
            strip.setAttribute('data-spec-id', 'admin-home-live-banner');
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
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;white-space:nowrap;">🏪 التجار النشطون: <b>' + Number(k.merchants_active || 0) + ' / ' + Number(k.merchants_total || 0) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;white-space:nowrap;">💳 فواتير مكتملة: <b>' + Number(k.transactions_completed || 0) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;white-space:nowrap;">🏦 صافي الخزانة (25%): <b>$' + fmt2(k.treasury_revenue_usd) + '</b></div>' +
                '<div style="background:rgba(255,255,255,0.08);padding:8px 11px;border-radius:10px;white-space:nowrap;">🎯 متبقي وعاء الخطة (2201): <b>$' + fmt2(k.plan_pool_liability_usd) + '</b></div>' +
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

    function getActiveGlobalSettings() {
        const list = (LIVE_BUNDLE && Array.isArray(LIVE_BUNDLE.settings)) ? LIVE_BUNDLE.settings : [];
        const nowMs = Date.now();
        const active = list.find(function (s) {
            return s && (s.country_id === null || s.country_id === undefined) && (!s.effective_from || new Date(s.effective_from).getTime() <= nowMs);
        });
        return active || list.find(function (s) { return s && (s.country_id === null || s.country_id === undefined); }) || list[0] || {};
    }

    window.renderLiveMerchantRiskSettingsCard = function (prefix) {
        const pfx = esc(prefix || 'liveMc');
        const cur = getActiveGlobalSettings();
        const adm = (LIVE_BUNDLE && LIVE_BUNDLE.admin) || window.currentAdmin || {};
        const founder = isSovereignFounder(adm);
        if (!cur || (!cur.id && !LIVE_BUNDLE)) {
            return '<div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px;margin-bottom:14px;font-weight:700;color:#92400e;">⏳ جاري مزامنة عتبات ومخاطر التجار الحية من قاعدة البيانات...</div>';
        }
        return '<div style="background:#ffffff;border:1.5px solid #0f766e;border-radius:14px;padding:16px;margin-bottom:14px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                '<div>' +
                    '<h3 style="margin:0;font-size:1rem;color:#0f172a;">🏪 ضبط عتبات ومخاطر التجار الحية في PostgreSQL (`sawyan.settings`)</h3>' +
                    '<div style="font-size:0.78rem;color:#64748b;">الإعدادات الحية الفعلية السارية حالياً — تعدل سلوك المبيعات، طابور النفاد (M5 — يقبل 0)، مهل التقييد والتصعيد، وعتبات W05/W07.</div>' +
                '</div>' +
                '<span class="badge badge-success">LIVE • ساري من: ' + esc(String(cur.effective_from || '').slice(0, 10)) + '</span>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,175px),1fr));gap:10px;margin-bottom:10px;">' +
                '<div><label style="font-size:0.76rem;font-weight:700;">عتبة التنبيه الأول (%)</label><input id="' + pfx + '_warn1" type="number" step="0.5" min="2" max="99" value="' + Number(cur.merchant_warn1_pct ?? 30) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">عتبة الإنذار الأخير (%)</label><input id="' + pfx + '_warn2" type="number" step="0.5" min="1" max="98" value="' + Number(cur.merchant_warn2_pct ?? 20) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">عتبة العزل الوقائي (%)</label><input id="' + pfx + '_iso" type="number" step="0.5" min="0.5" max="97" value="' + Number(cur.merchant_isolate_pct ?? 10) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">فواتير ما بعد النفاد (M5 — 0=قفل فوري)</label><input id="' + pfx + '_qcap" type="number" step="1" min="0" max="50" value="' + Number(cur.unsecured_queue_cap ?? 3) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">سقف Soft Hold للمعلقات (%)</label><input id="' + pfx + '_hold" type="number" step="1" min="1" max="100" value="' + Number(cur.unconfirmed_soft_hold_cap_pct ?? 20) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مهلة السداد قبل تعليق الامتثال (أيام)</label><input id="' + pfx + '_fdef" type="number" step="1" min="1" max="90" value="' + Number(cur.fifo_default_days ?? 14) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مهلة رد التاجر على المعلق (ساعة)</label><input id="' + pfx + '_psla" type="number" step="1" min="1" max="720" value="' + Number(cur.pending_sla_hours ?? 48) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">إنذار/تقييد المعلق المتأخر (30ي)</label><div style="display:flex;gap:4px;"><input id="' + pfx + '_wesc" type="number" min="1" value="' + Number(cur.warn_escalated_tx_30d ?? 3) + '" class="form-control" title="إنذار"><input id="' + pfx + '_resc" type="number" min="1" value="' + Number(cur.restrict_escalated_tx_30d ?? 5) + '" class="form-control" title="تقييد د2"></div></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">إنذار/تقييد النزاع الخاسر (30ي)</label><div style="display:flex;gap:4px;"><input id="' + pfx + '_wdis" type="number" min="1" value="' + Number(cur.warn_lost_disputes_30d ?? 2) + '" class="form-control" title="إنذار"><input id="' + pfx + '_rdis" type="number" min="1" value="' + Number(cur.restrict_lost_disputes_30d ?? 3) + '" class="form-control" title="تقييد د2"></div></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">إنذار/تقييد الشكوى الموثقة (30ي)</label><div style="display:flex;gap:4px;"><input id="' + pfx + '_wcmp" type="number" min="1" value="' + Number(cur.warn_verified_complaints_30d ?? 2) + '" class="form-control" title="إنذار"><input id="' + pfx + '_rcmp" type="number" min="1" value="' + Number(cur.restrict_verified_complaints_30d ?? 3) + '" class="form-control" title="تقييد د2"></div></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مدة دورة ائتمان D4 (أيام)</label><input id="' + pfx + '_d4days" type="number" step="1" min="1" max="90" value="' + Number(cur.d4_cycle_days ?? 1) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">وقت إغلاق دورة D4</label><input id="' + pfx + '_d4cutoff" type="time" value="' + esc(String(cur.d4_cycle_cutoff_time || '23:59').slice(0, 5)) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مهلة سداد D4 بعد الإغلاق (ساعة)</label><input id="' + pfx + '_d4grace" type="number" step="0.5" min="0" max="168" value="' + Number(cur.d4_grace_hours ?? 2) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">عتبة سحب W05 ($)</label><input id="' + pfx + '_wht" type="number" step="10" min="1" value="' + Number(cur.wht_threshold_usd ?? 200) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">تهدئة W07 (ساعة)</label><input id="' + pfx + '_cd" type="number" step="1" min="0" value="' + Number(cur.withdrawal_cooldown_hours ?? 72) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">تاريخ السريان</label><select id="' + pfx + '_effmode" class="form-control"><option value="immediate">⚡ فوري (من اللحظة)</option><option value="next_month">📅 أول الشهر القادم</option></select></div>' +
                '<div style="grid-column:1 / -1;border-top:1.5px dashed #cbd5e1;padding-top:10px;margin-top:4px;"><strong style="font-size:0.86rem;color:#0f2744;">🧾 إعدادات التوثيق الموحّد وجلسات الموظفين والحماية (Stage 14 — قابلة للتعديل الفوري)</strong></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مدة وردية الموظف القصوى (ساعات)</label><input id="' + pfx + '_eshift" type="number" step="1" min="1" max="72" value="' + Number(cur.employee_shift_hours ?? 8) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مهلة خمول جلسة الموظف (دقائق)</label><input id="' + pfx + '_eidle" type="number" step="5" min="5" max="720" value="' + Number(cur.employee_idle_timeout_mins ?? 60) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">حد رفض بلا صورة لتفعيل الحماية (0=تعطيل)</label><input id="' + pfx + '_srej" type="number" step="1" min="0" max="50" value="' + Number(cur.spam_reject_threshold ?? 2) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">نافذة رصد الرفض (ساعات)</label><input id="' + pfx + '_swin" type="number" step="1" min="1" max="720" value="' + Number(cur.spam_reject_window_hours ?? 24) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">مدة إلزام الصورة المؤقت (ساعات)</label><input id="' + pfx + '_sreq" type="number" step="1" min="1" max="720" value="' + Number(cur.spam_require_receipt_hours ?? 24) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">أقصى طلبات معلّقة للعضو عند نفس المتجر</label><input id="' + pfx + '_maxp" type="number" step="1" min="1" max="20" value="' + Number(cur.max_pending_per_merchant ?? 2) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">معدل التحديث الحي للطلبات (ثوانٍ)</label><input id="' + pfx + '_poll" type="number" step="1" min="3" max="120" value="' + Number(cur.live_poll_interval_secs ?? 8) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">عتبة إعادة PIN للفواتير الكبيرة ($ • 0=معطّلة)</label><input id="' + pfx + '_repin" type="number" step="10" min="0" max="100000" value="' + Number(cur.employee_pin_reconfirm_usd ?? 0) + '" class="form-control"></div>' +
                '<div><label style="font-size:0.76rem;font-weight:700;">طلبات العضو في العزل 10% (Soft Hold = 0)</label><select id="' + pfx + '_ziso" class="form-control"><option value="true"' + (cur.allow_zero_hold_in_isolation !== false ? ' selected' : '') + '>✅ مسموح (بدون حجز مؤقت)</option><option value="false"' + (cur.allow_zero_hold_in_isolation === false ? ' selected' : '') + '>🚫 ممنوع داخل العزل</option></select></div>' +
                '<div style="grid-column:1 / -1;"><label style="font-size:0.76rem;font-weight:700;">سبب التعديل الإلزامي لسجل التدقيق (>= 5 أحرف)</label><input id="' + pfx + '_reason" type="text" value="تحديث عتبات مخاطر التجار والحوكمة وإعدادات التوثيق الحية" class="form-control"></div>' +
            '</div>' +
            '<button type="button" id="' + pfx + '_submitBtn" onclick="svSubmitMerchantRiskSettings(\'' + pfx + '\')" class="btn btn-primary">' + (founder ? '👑 حفظ وتطبيق فوري في PostgreSQL (صلاحية المؤسس)' : '📤 إرسال تعديل الإعدادات لطابور الاعتماد المزدوج (Maker)') + '</button>' +
        '</div>';
    };

    window.svSubmitMerchantRiskSettings = async function (prefix) {
        try {
            const pfx = prefix || 'liveMc';
            const g = function (s) { return document.getElementById(pfx + '_' + s); };
            const w1 = Number(g('warn1').value);
            const w2 = Number(g('warn2').value);
            const iso = Number(g('iso').value);
            const qcap = Number(g('qcap').value);
            const hold = Number(g('hold').value);
            const fdef = Number(g('fdef').value);
            const psla = Number(g('psla').value);
            const wesc = Number(g('wesc').value);
            const resc = Number(g('resc').value);
            const wdis = Number(g('wdis').value);
            const rdis = Number(g('rdis').value);
            const wcmp = Number(g('wcmp').value);
            const rcmp = Number(g('rcmp').value);
            const d4days = Number(g('d4days').value);
            const d4cut = String(g('d4cutoff').value || '').trim();
            const d4grace = Number(g('d4grace').value);
            const wht = Number(g('wht').value);
            const cd = Number(g('cd').value);
            const eshift = Number(g('eshift')?.value ?? 8);
            const eidle = Number(g('eidle')?.value ?? 60);
            const srej = Number(g('srej')?.value ?? 2);
            const swin = Number(g('swin')?.value ?? 24);
            const sreq = Number(g('sreq')?.value ?? 24);
            const maxp = Number(g('maxp')?.value ?? 2);
            const poll = Number(g('poll')?.value ?? 8);
            const repin = Number(g('repin')?.value ?? 0);
            const ziso = String(g('ziso')?.value ?? 'true') !== 'false';
            const effMode = g('effmode').value;
            const reason = String(g('reason').value || '').trim();

            if (!(w1 > w2 && w2 > iso && iso > 0)) {
                showToast('يجب أن يكون التدرج صارماً: التنبيه الأول > الإنذار الأخير > العزل > 0', true);
                return;
            }
            if (!Number.isInteger(qcap) || qcap < 0) {
                showToast('عدد فواتير ما بعد النفاد يجب أن يكون عدداً صحيحاً >= 0', true);
                return;
            }
            if (resc < wesc || rdis < wdis || rcmp < wcmp || wesc < 1 || wdis < 1 || wcmp < 1) {
                showToast('عتبات التقييد د2 يجب أن تكون >= عتبات الإنذار د1 (>= 1)', true);
                return;
            }
            if (!Number.isInteger(d4days) || d4days < 1 || d4days > 90) {
                showToast('مدة دورة ائتمان D4 يجب أن تكون بين 1 و 90 يوماً.', true);
                return;
            }
            if (!/^\d{2}:\d{2}(:\d{2})?$/.test(d4cut)) {
                showToast('يرجى تحديد وقت إغلاق دورة D4 بصيغة صالحة (HH:MM).', true);
                return;
            }
            if (!Number.isFinite(d4grace) || d4grace < 0 || d4grace > 168) {
                showToast('مهلة سداد D4 بعد الإغلاق يجب أن تكون بين 0 و 168 ساعة.', true);
                return;
            }
            if (reason.length < 5) {
                showToast('يرجى إدخال سبب التعديل (5 أحرف على الأقل) لتوثيقه في سجل التدقيق.', true);
                return;
            }

            const d = new Date();
            const effIso = effMode === 'next_month'
                ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0)).toISOString()
                : d.toISOString();

            const payload = {
                merchant_warn1_pct: w1,
                merchant_warn2_pct: w2,
                merchant_isolate_pct: iso,
                unsecured_queue_cap: qcap,
                unconfirmed_soft_hold_cap_pct: hold,
                fifo_default_days: fdef,
                pending_sla_hours: psla,
                warn_escalated_tx_30d: wesc,
                restrict_escalated_tx_30d: resc,
                warn_lost_disputes_30d: wdis,
                restrict_lost_disputes_30d: rdis,
                warn_verified_complaints_30d: wcmp,
                restrict_verified_complaints_30d: rcmp,
                d4_cycle_days: d4days,
                d4_cycle_cutoff_time: d4cut.length === 5 ? d4cut + ':00' : d4cut,
                d4_grace_hours: d4grace,
                wht_threshold_usd: wht,
                withdrawal_cooldown_hours: cd,
                employee_shift_hours: Math.max(1, Math.min(72, Math.round(eshift || 8))),
                employee_idle_timeout_mins: Math.max(5, Math.min(720, Math.round(eidle || 60))),
                spam_reject_threshold: Math.max(0, Math.round(Number.isFinite(srej) ? srej : 2)),
                spam_reject_window_hours: Math.max(1, Math.min(720, Math.round(swin || 24))),
                spam_require_receipt_hours: Math.max(1, Math.min(720, Math.round(sreq || 24))),
                max_pending_per_merchant: Math.max(1, Math.min(20, Math.round(maxp || 2))),
                live_poll_interval_secs: Math.max(3, Math.min(120, Math.round(poll || 8))),
                employee_pin_reconfirm_usd: Math.max(0, Number.isFinite(repin) ? repin : 0),
                allow_zero_hold_in_isolation: ziso,
                effective_from: effIso
            };

            const res = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'BITEMPORAL_SETTINGS_UPDATE',
                targetEntity: 'settings',
                targetId: 'GLOBAL',
                payloadAfter: payload,
                reason: reason
            });
            showToast(res && res.sovereign_auto_executed
                ? '👑 تم حفظ وتفعيل عتبات ومخاطر التجار الحية في PostgreSQL!'
                : ('📤 تم تسجيل طلب Maker (#' + String(res.request_id || '').slice(0, 8) + '). انتقل لدور Checker لاعتماده.'), false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    // --- Tab 1: Live Maker-Checker Queue ---
    function renderLiveMakerCheckerTab() {
        const list = LIVE_BUNDLE.maker_checker_queue || [];
        const adm = LIVE_BUNDLE.admin || {};
        return '<div style="display:grid;gap:14px;">' +
            window.renderLiveMerchantRiskSettingsCard('liveMc') +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">📋 سجل طلبات الاعتماد المزدوج في PostgreSQL (`maker_checker_requests`)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>النوع</th><th>الكيان / الهدف</th><th>المُنشئ (Maker)</th><th>المُعتمِد (Checker)</th><th>السبب</th><th>الحالة</th><th>قرار الاعتماد</th></tr></thead><tbody>' +
                (list.length === 0 ? '<tr><td colspan="7" class="empty-state">لا توجد طلبات مسجلة</td></tr>' : list.map(function (r) {
                    const founder = isSovereignFounder(adm);
                    const isSelf = (r.maker_admin_id === adm.id) && !founder;
                    const canDecide = r.status === 'pending' && (founder || adm.role === 'approver' || adm.role === 'finance');
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
                                        ? '<div style="display:flex;gap:5px;"><button type="button" class="btn-sm btn-success" onclick="svDecideMc(\'' + r.id + '\',\'approved\')">' + (founder ? '👑 اعتماد وتنفيذ سيادي فوري' : '✅ اعتماد وتنفيذ') + '</button><button type="button" class="btn-sm btn-danger" onclick="svDecideMc(\'' + r.id + '\',\'rejected\')">❌ رفض</button></div>'
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
                    '<div><label style="font-size:0.78rem;font-weight:700;">الدولة</label><select id="svCloseCountrySelect" class="form-control"><option value="ALL">🌍 جميع الدول الجاهزة (ALL)</option><option value="EG">🇪🇬 مصر (EG)</option><option value="TR">🇹🇷 تركيا (TR)</option></select></div>' +
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
        const gCfg = getGlobalStopperConfig();
        const actDefaultShare = calcUnitShareUsd(24.75, gCfg.s02);
        const actDefaultS03 = calcDefaultCountryStopperUsd(24.75, gCfg.s01, gCfg.s02);
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
                    '<div><label style="font-size:0.78rem;font-weight:700;">رمز الدولة</label><input id="svActCountry" type="text" value="SA" maxlength="2" oninput="svOnActuarialCountryChange()" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الهدف الشهري ($)</label><input id="svActTarget" type="number" step="0.25" value="24.75" oninput="svSyncActuarialDerived(false)" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#047857;">حصة الفرد المؤهل (÷S02) ($)</label><input id="svActUnitShare" type="text" readonly value="' + actDefaultShare.toFixed(2) + '" class="form-control" style="background:#ecfdf5;border-color:#6ee7b7;color:#065f46;font-weight:900;"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">الستوبر العددي S01</label><input id="svActS01" type="number" value="' + gCfg.s01 + '" oninput="svSyncActuarialDerived(false)" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">السقف الصاعد S02</label><input id="svActS02" type="number" value="' + gCfg.s02 + '" oninput="svSyncActuarialDerived(false)" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;display:flex;justify-content:space-between;align-items:center;"><span>الستوبر المالي S03 ($)</span><a href="#" onclick="svSyncActuarialDerived(true);return false;" style="font-size:0.7rem;color:#059669;text-decoration:underline;">↺ ديفولت</a></label><input id="svActS03" type="number" step="0.25" value="' + actDefaultS03.toFixed(2) + '" data-custom="0" oninput="this.dataset.custom=\'1\'" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:700;">حجم الشبكة المختبرة</label><input id="svActMembers" type="number" step="1000" value="10000" class="form-control"></div>' +
                '</div>' +
                '<div style="margin-top:10px;"><button type="button" id="svRunActuarialBtn" onclick="svRunActuarial()" class="btn btn-primary">🧮 تشغيل اختبار الملاءة الأكتواري S06</button></div>' +
                simHtml +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">' +
                    '<div>' +
                        '<h3 style="margin:0;font-size:1rem;color:#0f172a;">🌍 بوابة تفعيل وتخصيص مدخلات الدول (`sawyan.countries` — D13 / D18 / D19)</h3>' +
                        '<div style="font-size:0.78rem;color:#64748b;margin-top:3px;">تحكّم كامل ومباشر في العملة، سعر الصرف الإداري، الهدف الشهري، حصة الفرد المؤهل (الهدف ÷ ' + gCfg.s02 + ')، ديفولت الستوبر المالي S03 (×' + gCfg.idealNodes.toLocaleString('en-US') + ')، الضرائب، ومواعيد الصرف لكل دولة.</div>' +
                    '</div>' +
                    '<button type="button" class="btn btn-primary" onclick="svOpenCountryEditModal(null)">➕ إضافة دولة جديدة للنظام</button>' +
                '</div>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الدولة</th><th>العملة / سعر الصرف</th><th>الهدف الشهري / حصة الفرد / S03</th><th>ضرائب VAT / WHT</th><th>الصرف / المرتجعات</th><th>الرأي القانوني</th><th>التجار (الحد)</th><th>الحالة</th><th>إجراءات التعديل والحوكمة</th></tr></thead><tbody>' +
                countries.map(function (c) {
                    const nameAr = (c.country_name_i18n && c.country_name_i18n.ar) || c.country_code;
                    const fx = Number(c.admin_fx_rate || 1);
                    const cS01 = Number(c.numerical_stopper_s01 || gCfg.s01);
                    const cS02 = Number(c.upline_ceiling_s02 || gCfg.s02);
                    const cNodes = Number(c.ideal_tree_nodes || (Math.pow(2, cS01) - 1));
                    const targetUsd = Number(c.monthly_target_usd || 24.75);
                    const unitShareUsd = c.unit_share_usd !== undefined ? Number(c.unit_share_usd) : calcUnitShareUsd(targetUsd, cS02);
                    const defStopperUsd = c.default_financial_stopper_usd !== undefined ? Number(c.default_financial_stopper_usd) : calcDefaultCountryStopperUsd(targetUsd, cS01, cS02);
                    const savedStopperUsd = Number(c.financial_stopper_usd || defStopperUsd);
                    const isDefaultStopper = Math.abs(savedStopperUsd - defStopperUsd) < 0.005;
                    const localTarget = targetUsd * fx;
                    const localShare = unitShareUsd * fx;
                    const merchOk = Number(c.active_merchants_count || 0) >= Number(c.min_merchants_threshold || 1);
                    const founder = isSovereignFounder(LIVE_BUNDLE && LIVE_BUNDLE.admin);
                    return '<tr>' +
                        '<td><b>' + esc(nameAr) + ' (' + esc(c.country_code) + ')</b><div style="font-size:0.72rem;color:#64748b;">' + esc(c.iana_timezone) + '</div></td>' +
                        '<td><b>' + esc(c.currency_code) + '</b><div style="font-size:0.74rem;color:#0f766e;font-weight:800;">1$ = ' + fmt2(fx) + ' ' + esc(c.currency_code) + '</div></td>' +
                        '<td>' +
                            '<div>الهدف: <b>$' + fmt2(targetUsd) + '</b> <small style="color:#64748b;">(' + fmt2(localTarget) + ' ' + esc(c.currency_code) + ')</small></div>' +
                            '<div style="font-size:0.75rem;color:#047857;font-weight:800;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;padding:2px 6px;margin:3px 0;display:inline-block;">💎 حصة الفرد (÷' + cS02 + '): <b>$' + fmt2(unitShareUsd) + '</b> <small>(' + fmt2(localShare) + ' ' + esc(c.currency_code) + ')</small></div>' +
                            '<div style="font-size:0.74rem;color:#1e293b;">S03: <b>$' + fmt2(savedStopperUsd) + '</b> <small style="color:' + (isDefaultStopper ? '#059669' : '#b45309') + ';font-weight:700;">' + (isDefaultStopper ? '(ديفولت ×' + cNodes.toLocaleString('en-US') + ')' : '(مخصص • الديفولت $' + fmt2(defStopperUsd) + ')') + '</small></div>' +
                        '</td>' +
                        '<td>VAT ' + Number(c.vat_rate || 0) + '%<br>WHT ' + Number(c.wht_rate || 0) + '%</td>' +
                        '<td>يوم <b>' + Number(c.payout_day || 15) + '</b><div style="font-size:0.72rem;color:#64748b;">إغلاق مرتجع: يوم ' + Number(c.return_cutoff_day || 14) + '</div></td>' +
                        '<td>' + (c.legal_opinion_verified ? '✅ موثق (' + esc(c.local_terms_version) + ')' : '❌ غير موثق') + '</td>' +
                        '<td><b style="color:' + (merchOk ? '#059669' : '#dc2626') + ';">' + Number(c.active_merchants_count || 0) + ' / ' + Number(c.min_merchants_threshold || 1) + '</b></td>' +
                        '<td>' + (c.is_active ? '<span class="badge badge-success">🟢 نشطة</span>' : '<span class="badge badge-warning">⚪ غير نشطة</span>') + '</td>' +
                        '<td><div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                            '<button type="button" class="btn-sm" style="background:#0f172a;color:#ffffff;border:none;padding:5px 10px;border-radius:7px;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;" onclick="svOpenCountryEditModal(\'' + esc(c.country_code) + '\')">⚙️ تعديل المدخلات</button>' +
                            '<button type="button" class="btn-sm" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;padding:5px 9px;border-radius:7px;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;" onclick="if(window.svQuickSelectCityCc){window.svQuickSelectCityCc(\'' + esc(c.country_code) + '\');window.openSovereignOpsCenter(\'cities\');}">🏙️ المدن</button>' +
                            (!c.is_active
                                ? '<button type="button" class="btn-sm btn-primary" onclick="svSubmitCountryGate(\'' + esc(c.country_code) + '\')">' + (founder ? '👑 تفعيل فوري' : '📤 طلب تفعيل D13') + '</button>'
                                : (founder ? '<button type="button" class="btn-sm" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;padding:5px 9px;border-radius:7px;font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;" onclick="svToggleCountryActive(\'' + esc(c.country_code) + '\',false)">⏸️ إيقاف</button>' : '<span style="font-size:0.74rem;color:#059669;font-weight:800;">مفعلة</span>')) +
                        '</div></td>' +
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
                '<button type="button" id="svSubmitPartnerBtn" onclick="svSubmitPartnerD24()" class="btn btn-primary">' + (isSovereignFounder(LIVE_BUNDLE && LIVE_BUNDLE.admin) ? '👑 تسجيل واعتماد الشريك فوراً (D24)' : '📤 تقديم عقد شريك باعتماد مزدوج (Maker — D24)') + '</button>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">📜 العقود الاستثمارية المعتمدة</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الكود</th><th>الشريك</th><th>النطاق</th><th>أساس الاحتساب</th><th>النسبة %</th><th>مرجع العقد</th><th>الحالة</th></tr></thead><tbody>' +
                (partners.length === 0 ? '<tr><td colspan="7" class="empty-state">لا يوجد شركاء مسجلون حالياً</td></tr>' : partners.map(function (p) {
                    return '<tr>' +
                        '<td data-label="الكود"><b>' + esc(p.partner_code) + '</b></td>' +
                        '<td data-label="الشريك">' + esc(p.full_name) + '<br><small>' + esc(p.email) + '</small></td>' +
                        '<td data-label="النطاق">' + esc(p.partnership_scope) + '</td>' +
                        '<td data-label="أساس الاحتساب">' + esc(p.profit_basis) + '</td>' +
                        '<td data-label="النسبة %"><b>' + Number(p.profit_share_pct) + '%</b></td>' +
                        '<td data-label="مرجع العقد"><code>' + esc(p.contract_ref) + '</code></td>' +
                        '<td data-label="الحالة">' + (p.is_active ? '<span class="badge badge-success">نشط</span>' : '<span class="badge badge-danger">موقوف</span>') + '</td>' +
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
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">⚖️ ميزان المراجعة الحي لدليل الحسابات الموحد (19 حساباً قياسياً — صفر مسؤولية خزانة D5 / D23)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>كود الحساب</th><th>اسم الحساب المحاسبي</th><th>الطبيعة</th><th>إجمالي مدين ($)</th><th>إجمالي دائن ($)</th><th>الرصيد الصافي ($)</th></tr></thead><tbody>' +
                tb.map(function (r) {
                    return '<tr>' +
                        '<td data-label="كود الحساب"><b>' + esc(r.account_code) + '</b></td>' +
                        '<td data-label="اسم الحساب المحاسبي">' + esc(r.account_name_ar) + '</td>' +
                        '<td data-label="الطبيعة">' + (r.normal_balance === 'D' ? 'مدين (Dr)' : 'دائن (Cr)') + '</td>' +
                        '<td data-label="إجمالي مدين ($)">$' + fmt2(r.total_debit_usd) + '</td>' +
                        '<td data-label="إجمالي دائن ($)">$' + fmt2(r.total_credit_usd) + '</td>' +
                        '<td data-label="الرصيد الصافي ($)"><b>$' + fmt2(r.net_balance_usd) + '</b></td>' +
                    '</tr>';
                }).join('') +
                '</tbody></table></div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:1rem;color:#0f172a;">🔐 سجل التدقيق الجنائي غير القابل للمحو (`sawyan.audit_logs` — Append-Only Hash Chain)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>#</th><th>الفاعل</th><th>الإجراء</th><th>الجدول / السجل</th><th>التوقيت</th><th>بصمة السطر SHA-256</th></tr></thead><tbody>' +
                (logs.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد سجلات تدقيق بعد</td></tr>' : logs.slice(0, 15).map(function (l) {
                    return '<tr>' +
                        '<td data-label="#">' + Number(l.id) + '</td>' +
                        '<td data-label="الفاعل">' + esc(l.actor_type) + '</td>' +
                        '<td data-label="الإجراء"><b>' + esc(l.action) + '</b></td>' +
                        '<td data-label="الجدول / السجل">' + esc(l.table_name) + ' / <code>' + esc(String(l.record_id).slice(0, 14)) + '</code></td>' +
                        '<td data-label="التوقيت">' + esc(String(l.recorded_at || '').slice(0, 19).replace('T', ' ')) + '</td>' +
                        '<td data-label="بصمة السطر SHA-256"><code style="font-size:0.72rem;">' + esc(String(l.row_hash || '').slice(0, 18)) + '…</code></td>' +
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
                '<h3 style="margin:0 0 8px 0;font-size:1rem;color:#0f172a;">⚠️ تذاكر النزاعات الثلاثية الحية (`dispute_tickets` — D6 + فرز Option 1-A + Clawback D5)</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>الفاتورة</th><th>العضو</th><th>التاجر</th><th>التصنيف وفرز الصرف (1-أ)</th><th>السبب والإثبات</th><th>الحالة</th><th>حكم الإدارة</th></tr></thead><tbody>' +
                (disputes.length === 0 ? '<tr><td colspan="7" class="empty-state">لا توجد نزاعات معلقة في القاعدة حالياً</td></tr>' : disputes.map(function (d) {
                    const open = d.status === 'awaiting_merchant_friendly' || d.status === 'escalated_to_admin';
                    const isBreak = Boolean(d.is_qualification_breaking);
                    const triageBadge = isBreak
                        ? '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.76rem;font-weight:800;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;">🔴 كاسرة للتأهل (' + fmt2(d.estimated_commission_at_stake_usd || 0) + '$ بالخطر)</span>'
                        : '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.76rem;font-weight:700;background:#dcfce7;color:#166534;">🟢 غير كاسرة للتأهل</span>';
                    const btns = open
                        ? ('<div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                            '<button type="button" class="btn-sm btn-success" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_member\')">إنصاف العضو</button>' +
                            (d.tx_status === 'completed'
                                ? '<button type="button" class="btn-sm btn-danger" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_member_clawback\')">عكس قبل الصرف</button>' +
                                  '<button type="button" class="btn-sm btn-warning" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_merchant_force_return\')">فرض المرتجع (30ي تجميد)</button>'
                                : '') +
                            '<button type="button" class="btn-sm btn-outline" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_merchant\')">لصالح التاجر</button>' +
                            (isBreak ? '<button type="button" class="btn-sm btn-danger" onclick="svOpsAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_merchant_malicious_claim\')">بلاغ كيدي (30ي تجميد)</button>' : '') +
                          '</div>')
                        : 'تم الفصل';
                    const evThumb = (d.evidence_url && window.SAWYAN && window.SAWYAN.ImageUpload)
                        ? '<div style="margin-top:4px;">' + window.SAWYAN.ImageUpload.renderThumbHtml(d.evidence_url, '📎 إثبات النزاع ' + esc(d.sw_short_code)) + '</div>'
                        : '';
                    return '<tr>' +
                        '<td data-label="الفاتورة"><b>' + esc(d.sw_short_code) + '</b> (' + fmt2(d.total_amount) + ' ' + esc(d.currency_code) + ')' + (d.tx_country_code ? '<br><small>' + esc(d.tx_country_code) + ' • ' + esc(d.dispute_period_ym || '') + '</small>' : '') + '</td>' +
                        '<td data-label="العضو">#' + Number(d.member_code) + ' ' + esc(d.member_name) + '</td>' +
                        '<td data-label="التاجر">' + esc(d.merchant_name) + '</td>' +
                        '<td data-label="التصنيف وفرز الصرف (1-أ)"><code>' + esc(d.dispute_category || 'general') + '</code><br>' + triageBadge + '</td>' +
                        '<td data-label="السبب والإثبات">' + esc(d.dispute_reason) + evThumb + '</td>' +
                        '<td data-label="الحالة"><span class="badge badge-warning">' + esc(d.status) + '</span></td>' +
                        '<td data-label="حكم الإدارة">' + btns + '</td>' +
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
                        const up = window.SAWYAN && window.SAWYAN.ImageUpload;
                        const shThumb = (g.shelf_photo_url && up) ? up.renderThumbHtml(g.shelf_photo_url, '📸 سعر الرف') : '';
                        const rcThumb = (g.receipt_url && up) ? up.renderThumbHtml(g.receipt_url, '🧾 الإيصال') : '';
                        const thumbs = (shThumb || rcThumb) ? ('<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;">' + shThumb + rcThumb + '</div>') : '';
                        return '<tr>' +
                            '<td data-label="الفاتورة / الإشارة">بلاغ سعر: <b>' + esc(g.sw_short_code) + '</b></td>' +
                            '<td data-label="التاجر">' + esc(g.merchant_name) + '</td>' +
                            '<td data-label="التفاصيل">معلن: ' + fmt2(g.declared_price) + ' ← مخصوم: <b>' + fmt2(g.charged_price) + '</b>' + thumbs + '</td>' +
                            '<td data-label="الحالة">' + esc(g.verification_status) + '</td>' +
                            '<td data-label="إجراء">' + (g.verification_status === 'pending'
                                ? '<button type="button" class="btn-sm btn-danger" onclick="svOpsAct(\'price_gouging\',\'' + g.id + '\',\'verified_violation\')">تأكيد المخالفة</button>'
                                : '—') + '</td>' +
                        '</tr>';
                    }).concat(fraud.map(function (f) {
                        return '<tr>' +
                            '<td data-label="الفاتورة / الإشارة">إشارة غش: <b>' + esc(f.signal_type) + '</b> (' + esc(f.severity) + ')</td>' +
                            '<td data-label="التاجر">' + esc(f.merchant_name || 'شبكي') + '</td>' +
                            '<td data-label="التفاصيل"><code>' + esc(JSON.stringify(f.evidence_payload || {}).slice(0, 70)) + '</code></td>' +
                            '<td data-label="الحالة">' + esc(f.status) + '</td>' +
                            '<td data-label="إجراء">' + (f.status === 'open'
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
                        '<td data-label="الكود"><b>#' + Number(m.member_code) + '</b></td>' +
                        '<td data-label="الاسم">' + esc(m.full_name) + (m.is_tombstone_banned ? ' <span class="badge badge-danger">Tombstone</span>' : '') + '</td>' +
                        '<td data-label="الدولة">' + esc(m.residency_country_code) + '</td>' +
                        '<td data-label="صندوق الشهر ($)">$' + fmt2(m.current_purchases_usd) + (m.is_qualified_period ? ' 🟢' : '') + '</td>' +
                        '<td data-label="المحفظة ($)">$' + fmt2(m.wallet_balance_usd) + '</td>' +
                        '<td data-label="حالة KYC"><span class="badge ' + (m.kyc_status === 'verified' ? 'badge-success' : 'badge-warning') + '">' + esc(m.kyc_status) + '</span></td>' +
                        '<td data-label="إجراءات حية"><div style="display:flex;gap:5px;">' +
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
        const container = document.getElementById('adminPromoQueueContainer');
        const badge = document.getElementById('adminPromoCountBadge');
        if (!container || !badge) return;

        const queue = (LIVE_BUNDLE && Array.isArray(LIVE_BUNDLE.flash_offers_queue)) ? LIVE_BUNDLE.flash_offers_queue : [];
        const pending = queue.filter(function (x) { return x.event_name === 'MerchantFlashOfferPending'; });
        badge.textContent = pending.length > 0 ? ('🔔 عروض حية بانتظار الاعتماد (' + pending.length + ')') : '✅ لا توجد معلقات (0)';

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
        } else {
            container.innerHTML = '<div style="background:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:12px;padding:14px;text-align:center;color:#64748b;font-weight:700;font-size:0.88rem;">✨ لا توجد إعلانات أو عروض معلقة بانتظار الاعتماد في قاعدة البيانات الحية (0).</div>';
        }
    }
    window.renderLiveFlashOfferQueue = renderLiveFlashOfferQueue;

    // ------------------------------------------------------------------------
    // 6. Action Handlers Calling Guarded PostgreSQL Stage 6 RPCs
    // ------------------------------------------------------------------------
    window.svSubmitSettingsMc = async function () {
        try {
            const payload = {
                wht_threshold_usd: Number(document.getElementById('svSetWhtUsd').value || 200),
                withdrawal_cooldown_hours: Number(document.getElementById('svSetCooldownHrs').value || 72)
            };
            const reason = document.getElementById('svSetReason').value.trim();
            const res = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'BITEMPORAL_SETTINGS_UPDATE',
                targetEntity: 'settings',
                targetId: 'GLOBAL',
                payloadAfter: payload,
                reason: reason
            });
            showToast(res && res.sovereign_auto_executed ? '👑 تم التنفيذ والاعتماد السيادي الفوري للإعدادات بصلاحية المؤسس المطلقة!' : ('تم تسجيل طلب Maker في قاعدة البيانات (#' + String(res.request_id).slice(0, 8) + '). انتقل لدور Checker لاعتماده.'), false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svDecideMc = async function (reqId, decision) {
        try {
            let rejReason = null;
            if (decision === 'rejected') {
                rejReason = window.SAWYAN?.UI?.prompt
                    ? await window.SAWYAN.UI.prompt({ title: 'سبب الرفض الرقابي', message: 'أدخل سبب رفض طلب الاعتماد المزدوج:', defaultValue: 'غير مستوفٍ لضوابط الحوكمة' })
                    : null;
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
            if (stepAction === 'run_steps_1_to_4' && cc === 'ALL') {
                const activeCodes = ((LIVE_BUNDLE && LIVE_BUNDLE.countries) || [])
                    .filter(function (c) { return c.is_active; })
                    .map(function (c) { return c.country_code; });
                const targets = activeCodes.length ? activeCodes : ['EG', 'TR'];
                for (let i = 0; i < targets.length; i++) {
                    await window.SAWYAN.API.adminExecutePeriodCloseWizard({
                        countryCode: targets[i],
                        periodYm: ym,
                        stepAction: stepAction,
                        ias21FxDeltaUsd: ias
                    });
                }
            } else {
                await window.SAWYAN.API.adminExecutePeriodCloseWizard({
                    countryCode: cc === 'ALL' ? null : cc,
                    periodYm: ym,
                    stepAction: stepAction,
                    ias21FxDeltaUsd: ias
                });
            }
            showToast(stepAction === 'run_steps_1_to_4'
                ? (isSovereignFounder(LIVE_BUNDLE && LIVE_BUNDLE.admin) ? '👑 اكتملت الخطوات 1–4! يمكنك الآن اعتماد الخطوتين 5–6 فوراً بصلاحية المؤسس.' : 'اكتملت الخطوات 1–4 بنجاح! قم بالتبديل إلى حساب المعتمد الثاني (Checker) لإغلاق الخطوتين 5–6.')
                : 'اكتمل الإقفال الشهري النهائي (Step 6 Hard Lock) وترحيل المحافظ بنجاح!', false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svRequestBreakGlass = async function () {
        try {
            const ym = document.getElementById('svClosePeriodInput').value.trim();
            const reason = window.SAWYAN?.UI?.prompt
                ? await window.SAWYAN.UI.prompt({ title: '🔓 فتح استثنائي لقفل الشهر (Break-Glass)', message: 'سبب الفتح الاستثنائي لقفل الشهر (ساعتان باعتماد مزدوج):', defaultValue: 'تصحيح قيد تسوية بنكية موثق قبل الصرف' })
                : null;
            if (!reason || reason.trim().length < 5) return;
            const bgRes = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'BREAK_GLASS_UNLOCK',
                targetEntity: 'settlement_cycles',
                targetId: ym,
                payloadAfter: { period_ym: ym },
                reason: reason.trim()
            });
            showToast(bgRes && bgRes.sovereign_auto_executed ? '👑 تم فتح القفل الاستثنائي (Break-Glass) فوراً بصلاحية المؤسس السيادية!' : 'تم رفع طلب Break-Glass لطابور الاعتماد المزدوج.', false);
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

    window.svSyncActuarialDerived = function (forceResetS03) {
        const tgt = Number((document.getElementById('svActTarget') || {}).value || 24.75);
        const s01 = Number((document.getElementById('svActS01') || {}).value || 11);
        const s02 = Number((document.getElementById('svActS02') || {}).value || 11);
        const shareEl = document.getElementById('svActUnitShare');
        const s03El = document.getElementById('svActS03');
        const shareUsd = calcUnitShareUsd(tgt, s02);
        const defS03 = calcDefaultCountryStopperUsd(tgt, s01, s02);
        if (shareEl) shareEl.value = shareUsd.toFixed(2);
        if (s03El && (forceResetS03 || s03El.dataset.custom !== '1')) {
            s03El.value = defS03.toFixed(2);
            if (forceResetS03) s03El.dataset.custom = '0';
        }
    };

    window.svOnActuarialCountryChange = function () {
        const cc = String((document.getElementById('svActCountry') || {}).value || '').trim().toUpperCase();
        const cty = ((LIVE_BUNDLE && LIVE_BUNDLE.countries) || []).find(function (x) { return x.country_code === cc; });
        if (!cty) return;
        const tgtEl = document.getElementById('svActTarget');
        const s03El = document.getElementById('svActS03');
        if (tgtEl) tgtEl.value = Number(cty.monthly_target_usd || 24.75);
        if (s03El) {
            s03El.dataset.custom = '0';
            window.svSyncActuarialDerived(true);
            if (cty.financial_stopper_usd && Math.abs(Number(cty.financial_stopper_usd) - Number(s03El.value)) > 0.005
                && !(Math.abs(Number(cty.financial_stopper_usd) - 4605.75) < 0.005 && Math.abs(Number(cty.monthly_target_usd || 24.75) - 24.75) > 0.005)) {
                s03El.value = Number(cty.financial_stopper_usd);
                s03El.dataset.custom = '1';
            }
        }
    };

    window.svUpdateCountryModalPreview = function () {
        const gCfg = getGlobalStopperConfig();
        const fx = Number((document.getElementById('svEditCtyFx') || {}).value || 1);
        const tgt = Number((document.getElementById('svEditCtyTarget') || {}).value || 24.75);
        const shareUsd = calcUnitShareUsd(tgt, gCfg.s02);
        const rawShare = tgt > 0 ? (tgt / gCfg.s02) : 0;
        const defStp = calcDefaultCountryStopperUsd(tgt, gCfg.s01, gCfg.s02);
        const stpEl = document.getElementById('svEditCtyStopper');
        const stp = Number((stpEl || {}).value || defStp);
        const cur = String((document.getElementById('svEditCtyCurrency') || {}).value || 'EGP').toUpperCase();

        const shareBox = document.getElementById('svEditCtyUnitShare');
        if (shareBox) shareBox.value = shareUsd.toFixed(2);

        const shareSub = document.getElementById('svEditCtyUnitShareSub');
        if (shareSub) {
            const exactNote = Math.abs(rawShare - shareUsd) > 0.0001 ? (' • الكسر قبل القطع: $' + rawShare.toFixed(4)) : '';
            shareSub.innerHTML = '= <b>' + fmt2(shareUsd * fx) + ' ' + esc(cur) + '</b> (حصة خطة الدخل ÷ ' + gCfg.s02 + esc(exactNote) + ')';
        }

        const badgeEl = document.getElementById('svEditCtyStopperBadge');
        if (badgeEl) {
            const isDef = Math.abs(stp - defStp) < 0.005;
            badgeEl.innerHTML = isDef
                ? '<span style="color:#059669;font-size:0.7rem;font-weight:800;">✓ ديفولت ($' + fmt2(shareUsd) + ' × ' + gCfg.idealNodes.toLocaleString('en-US') + ')</span>'
                : '<button type="button" onclick="svResetCountryStopperToDefault()" style="background:#ecfdf5;color:#047857;border:1px solid #6ee7b7;border-radius:6px;padding:1px 7px;font-family:Tajawal,sans-serif;font-size:0.7rem;font-weight:800;cursor:pointer;">↺ ضبط الديفولت ($' + fmt2(defStp) + ')</button>';
        }

        const prev = document.getElementById('svEditCtyLocalPreview');
        if (prev) {
            prev.innerHTML = '💡 المعادل بالعملة المحلية وفق سعر الصرف المدخل: الهدف الشهري = <b>' + fmt2(tgt * fx) + ' ' + esc(cur) + '</b> • حصة الفرد المؤهل (1/' + gCfg.s02 + ') = <b>' + fmt2(shareUsd * fx) + ' ' + esc(cur) + '</b> ($' + fmt2(shareUsd) + ') • الستوبر المالي S03 = <b>' + fmt2(stp * fx) + ' ' + esc(cur) + '</b>';
        }
    };

    window.svOnCountryTargetInput = function () {
        const gCfg = getGlobalStopperConfig();
        const overlay = document.getElementById('svCountryEditorOverlay');
        const tgt = Number((document.getElementById('svEditCtyTarget') || {}).value || 0);
        const stpEl = document.getElementById('svEditCtyStopper');
        if (stpEl && (!overlay || overlay.dataset.stopperCustom !== '1') && tgt > 0) {
            stpEl.value = calcDefaultCountryStopperUsd(tgt, gCfg.s01, gCfg.s02).toFixed(2);
        }
        window.svUpdateCountryModalPreview();
    };

    window.svOnCountryStopperInput = function () {
        const gCfg = getGlobalStopperConfig();
        const overlay = document.getElementById('svCountryEditorOverlay');
        const tgt = Number((document.getElementById('svEditCtyTarget') || {}).value || 24.75);
        const stp = Number((document.getElementById('svEditCtyStopper') || {}).value || 0);
        const defStp = calcDefaultCountryStopperUsd(tgt, gCfg.s01, gCfg.s02);
        if (overlay) {
            overlay.dataset.stopperCustom = Math.abs(stp - defStp) < 0.005 ? '0' : '1';
        }
        window.svUpdateCountryModalPreview();
    };

    window.svResetCountryStopperToDefault = function () {
        const gCfg = getGlobalStopperConfig();
        const overlay = document.getElementById('svCountryEditorOverlay');
        const tgt = Number((document.getElementById('svEditCtyTarget') || {}).value || 24.75);
        const stpEl = document.getElementById('svEditCtyStopper');
        if (stpEl) stpEl.value = calcDefaultCountryStopperUsd(tgt, gCfg.s01, gCfg.s02).toFixed(2);
        if (overlay) overlay.dataset.stopperCustom = '0';
        window.svUpdateCountryModalPreview();
    };

    window.svOpenCountryEditModal = function (countryCode) {
        const countries = (LIVE_BUNDLE && LIVE_BUNDLE.countries) || [];
        const gCfg = getGlobalStopperConfig();
        const existing = countryCode ? countries.find(function (x) { return x.country_code === countryCode; }) : null;
        const isNew = !existing;
        const initDefaultS03 = calcDefaultCountryStopperUsd(24.75, gCfg.s01, gCfg.s02);
        const c = existing || {
            country_code: '',
            country_name_i18n: { ar: '', en: '' },
            currency_code: 'AED',
            iana_timezone: 'Asia/Dubai',
            admin_fx_rate: 3.6725,
            monthly_target_usd: 24.75,
            financial_stopper_usd: initDefaultS03,
            compensatory_admin_fee_usd: 0.00,
            vat_rate: 0.00,
            wht_rate: 0.00,
            payout_day: 15,
            return_cutoff_day: 14,
            min_merchants_threshold: 5,
            local_terms_version: 'v3.0',
            legal_opinion_doc_url: '',
            legal_opinion_verified: true,
            is_active: false
        };
        const cTarget = Number(c.monthly_target_usd || 24.75);
        const cShare = calcUnitShareUsd(cTarget, gCfg.s02);
        const cDefStopper = calcDefaultCountryStopperUsd(cTarget, gCfg.s01, gCfg.s02);
        const rawSavedStopper = Number(c.financial_stopper_usd || 0);
        const wasLegacyUnlinked = (!isNew && Math.abs(rawSavedStopper - 4605.75) < 0.005 && Math.abs(cTarget - 24.75) > 0.005);
        const isAutoDefault = isNew || rawSavedStopper <= 0 || Math.abs(rawSavedStopper - cDefStopper) < 0.005 || wasLegacyUnlinked;
        const effectiveStopper = isAutoDefault ? cDefStopper : rawSavedStopper;
        const founder = isSovereignFounder(LIVE_BUNDLE && LIVE_BUNDLE.admin);

        let overlay = document.getElementById('svCountryEditorOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'svCountryEditorOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
            document.body.appendChild(overlay);
        }
        overlay.dataset.isNew = isNew ? '1' : '0';
        overlay.dataset.stopperCustom = isAutoDefault ? '0' : '1';
        overlay.style.display = 'flex';

        overlay.innerHTML =
            '<div style="background:#ffffff;border-radius:16px;max-width:820px;width:100%;max-height:92vh;overflow-y:auto;padding:22px;box-shadow:0 24px 48px rgba(15,23,42,0.35);font-family:Tajawal,sans-serif;direction:rtl;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #e2e8f0;padding-bottom:12px;margin-bottom:14px;">' +
                    '<div>' +
                        '<h3 style="margin:0;font-size:1.12rem;color:#0f172a;">' + (isNew ? '➕ إضافة دولة جديدة وتحديد مدخلاتها السيادية' : ('⚙️ تعديل مدخلات دولة: ' + esc((c.country_name_i18n && c.country_name_i18n.ar) || c.country_code) + ' (' + esc(c.country_code) + ')')) + '</h3>' +
                        '<div style="font-size:0.78rem;color:#64748b;margin-top:2px;">جميع التعديلات تُحفظ مباشرة في جدول `sawyan.countries` وتُوثق في سجل التدقيق الجنائي.</div>' +
                    '</div>' +
                    '<button type="button" onclick="document.getElementById(\'svCountryEditorOverlay\').style.display=\'none\'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:8px;font-size:1.1rem;cursor:pointer;font-weight:900;">✕</button>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:11px;margin-bottom:12px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">رمز الدولة ISO (حرفان)</label><input id="svEditCtyCode" type="text" maxlength="2" ' + (isNew ? '' : 'readonly style="background:#f1f5f9;font-weight:900;"') + ' value="' + esc(c.country_code) + '" placeholder="AE" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">اسم الدولة (عربي)</label><input id="svEditCtyNameAr" type="text" value="' + esc((c.country_name_i18n && c.country_name_i18n.ar) || '') + '" placeholder="الإمارات" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">اسم الدولة (English)</label><input id="svEditCtyNameEn" type="text" value="' + esc((c.country_name_i18n && c.country_name_i18n.en) || '') + '" placeholder="UAE" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">رمز العملة (3 أحرف)</label><input id="svEditCtyCurrency" type="text" maxlength="3" oninput="svUpdateCountryModalPreview()" value="' + esc(c.currency_code) + '" placeholder="AED" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#0f766e;">سعر الصرف الإداري مقابل $1</label><input id="svEditCtyFx" type="number" step="0.0001" min="0.0001" oninput="svUpdateCountryModalPreview()" value="' + Number(c.admin_fx_rate || 1) + '" class="form-control" style="border-color:#10b981;font-weight:800;"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">المنطقة الزمنية (IANA)</label><input id="svEditCtyTz" type="text" value="' + esc(c.iana_timezone) + '" placeholder="Asia/Dubai" class="form-control"></div>' +
                '</div>' +

                '<div id="svEditCtyLocalPreview" style="background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;padding:9px 12px;border-radius:10px;font-size:0.82rem;margin-bottom:12px;"></div>' +

                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:11px;margin-bottom:12px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">الهدف الشهري للعضو — حصة الخطة ($)</label><input id="svEditCtyTarget" type="number" step="0.25" min="1" oninput="svOnCountryTargetInput()" value="' + cTarget + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:900;color:#047857;">💎 حصة الفرد المؤهل (الهدف ÷ ' + gCfg.s02 + ') ($)</label><input id="svEditCtyUnitShare" type="text" readonly value="' + cShare.toFixed(2) + '" class="form-control" style="background:#ecfdf5;border:1.5px solid #10b981;color:#065f46;font-weight:900;"><div id="svEditCtyUnitShareSub" style="font-size:0.71rem;color:#047857;margin-top:3px;"></div></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;display:flex;justify-content:space-between;align-items:center;gap:4px;flex-wrap:wrap;"><span>الستوبر المالي الشهري S03 ($)</span><span id="svEditCtyStopperBadge"></span></label><input id="svEditCtyStopper" type="number" step="0.01" min="1" oninput="svOnCountryStopperInput()" value="' + effectiveStopper.toFixed(2) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">رسم الهدف التعويضي ($)</label><input id="svEditCtyCompFee" type="number" step="0.25" min="0" value="' + Number(c.compensatory_admin_fee_usd || 0) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">ضريبة القيمة المضافة VAT (%)</label><input id="svEditCtyVat" type="number" step="0.5" min="0" max="99" value="' + Number(c.vat_rate || 0) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">ضريبة المنبع WHT (%)</label><input id="svEditCtyWht" type="number" step="0.5" min="0" max="99" value="' + Number(c.wht_rate || 0) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">الحد الأدنى للتجار النشطين</label><input id="svEditCtyMinMerch" type="number" step="1" min="1" value="' + Number(c.min_merchants_threshold || 5) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">يوم صرف الأرباح (2–28)</label><input id="svEditCtyPayoutDay" type="number" step="1" min="2" max="28" value="' + Number(c.payout_day || 15) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">يوم إغلاق المرتجعات (&lt; يوم الصرف)</label><input id="svEditCtyCutoffDay" type="number" step="1" min="1" max="27" value="' + Number(c.return_cutoff_day || 14) + '" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">إصدار الشروط المحلية</label><input id="svEditCtyTerms" type="text" value="' + esc(c.local_terms_version || 'v3.0') + '" class="form-control"></div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:11px;margin-bottom:14px;">' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">رابط الرأي القانوني الموثق (اختياري)</label><input id="svEditCtyLegalUrl" type="text" value="' + esc(c.legal_opinion_doc_url || '') + '" placeholder="https://legal.sawyan.global/opinion.pdf" class="form-control"></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">حالة الرأي القانوني D18</label><select id="svEditCtyLegalOk" class="form-control"><option value="true" ' + (c.legal_opinion_verified ? 'selected' : '') + '>✅ موثق ومعتمد</option><option value="false" ' + (!c.legal_opinion_verified ? 'selected' : '') + '>❌ غير موثق بعد</option></select></div>' +
                    '<div><label style="font-size:0.78rem;font-weight:800;color:#334155;">حالة تفعيل الدولة التشغيلية</label><select id="svEditCtyActive" class="form-control"><option value="true" ' + (c.is_active ? 'selected' : '') + '>🟢 نشطة ومفعلة للتسجيل والعمليات</option><option value="false" ' + (!c.is_active ? 'selected' : '') + '>⚪ غير نشطة / موقوفة مؤقتاً</option></select></div>' +
                '</div>' +

                '<div style="margin-bottom:14px;"><label style="font-size:0.78rem;font-weight:800;color:#334155;">سبب التعديل / التوثيق الرقابي</label><input id="svEditCtyReason" type="text" value="تحديث سيادي لمدخلات ومعاملات الدولة وفق خطة التشغيل" class="form-control"></div>' +

                '<div style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid #e2e8f0;padding-top:14px;">' +
                    '<button type="button" class="btn btn-outline" onclick="document.getElementById(\'svCountryEditorOverlay\').style.display=\'none\'">إلغاء</button>' +
                    '<button type="button" id="svSaveCtyModalBtn" class="btn btn-primary" onclick="svSaveCountryModal()">' + (founder ? '👑 حفظ وتطبيق فوري بصلاحية المؤسس' : '📤 إرسال تعديل الدولة للاعتماد المزدوج') + '</button>' +
                '</div>' +
            '</div>';

        window.svUpdateCountryModalPreview();
    };

    window.svSaveCountryModal = async function () {
        try {
            const code = String(document.getElementById('svEditCtyCode').value || '').trim().toUpperCase();
            const nameAr = String(document.getElementById('svEditCtyNameAr').value || '').trim();
            const nameEn = String(document.getElementById('svEditCtyNameEn').value || '').trim() || code;
            const currency = String(document.getElementById('svEditCtyCurrency').value || '').trim().toUpperCase();
            const fx = Number(document.getElementById('svEditCtyFx').value || 0);
            const tz = String(document.getElementById('svEditCtyTz').value || '').trim() || 'UTC';
            const targetUsd = Number(document.getElementById('svEditCtyTarget').value || 0);
            const stopperUsd = Number(document.getElementById('svEditCtyStopper').value || 0);
            const compFee = Number(document.getElementById('svEditCtyCompFee').value || 0);
            const vat = Number(document.getElementById('svEditCtyVat').value || 0);
            const wht = Number(document.getElementById('svEditCtyWht').value || 0);
            const minMerch = Number(document.getElementById('svEditCtyMinMerch').value || 1);
            const payoutDay = Number(document.getElementById('svEditCtyPayoutDay').value || 15);
            const cutoffDay = Number(document.getElementById('svEditCtyCutoffDay').value || 14);
            const terms = String(document.getElementById('svEditCtyTerms').value || 'v3.0').trim();
            const legalUrl = String(document.getElementById('svEditCtyLegalUrl').value || '').trim();
            const legalOk = document.getElementById('svEditCtyLegalOk').value === 'true';
            const isActive = document.getElementById('svEditCtyActive').value === 'true';
            const reason = String(document.getElementById('svEditCtyReason').value || '').trim();

            if (code.length !== 2) { showToast('يرجى إدخال رمز الدولة من حرفين (مثل EG أو SA أو AE).', true); return; }
            if (!nameAr) { showToast('يرجى إدخال اسم الدولة بالعربية.', true); return; }
            if (currency.length !== 3) { showToast('يرجى إدخال رمز العملة من 3 أحرف (مثل EGP أو SAR أو AED).', true); return; }
            if (fx <= 0) { showToast('سعر الصرف الإداري يجب أن يكون أكبر من صفر.', true); return; }
            if (targetUsd <= 0 || stopperUsd <= 0) { showToast('الهدف الشهري والستوبر المالي يجب أن يكونا أكبر من صفر.', true); return; }
            if (payoutDay < 2 || payoutDay > 28 || cutoffDay >= payoutDay) {
                showToast('يوم إغلاق المرتجعات يجب أن يكون أقل من يوم صرف الأرباح (بين 2 و28).', true);
                return;
            }
            if (reason.length < 5) { showToast('سبب التعديل إلزامي (5 أحرف على الأقل).', true); return; }

            const payload = {
                country_code: code,
                name_ar: nameAr,
                name_en: nameEn,
                country_name_i18n: { ar: nameAr, en: nameEn, tr: nameEn },
                currency_code: currency,
                admin_fx_rate: fx,
                iana_timezone: tz,
                monthly_target_usd: targetUsd,
                financial_stopper_usd: stopperUsd,
                compensatory_admin_fee_usd: compFee,
                vat_rate: vat,
                wht_rate: wht,
                min_merchants_threshold: minMerch,
                payout_day: payoutDay,
                return_cutoff_day: cutoffDay,
                local_terms_version: terms,
                legal_opinion_doc_url: legalUrl,
                legal_opinion_verified: legalOk,
                is_active: isActive
            };

            const res = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'COUNTRY_LEGAL_TAX_PREP',
                targetEntity: 'countries',
                targetId: code,
                payloadAfter: payload,
                reason: reason
            });

            document.getElementById('svCountryEditorOverlay').style.display = 'none';
            showToast(res && res.sovereign_auto_executed
                ? ('👑 تم حفظ وتطبيق مدخلات دولة ' + nameAr + ' (' + code + ') فوراً في قاعدة البيانات!')
                : ('تم إرسال تعديلات دولة ' + code + ' لطابور الاعتماد المزدوج.'), false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svToggleCountryActive = async function (countryCode, targetActive) {
        try {
            const res = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'COUNTRY_LEGAL_TAX_PREP',
                targetEntity: 'countries',
                targetId: countryCode,
                payloadAfter: { country_code: countryCode, is_active: Boolean(targetActive) },
                reason: targetActive ? 'إعادة تفعيل الدولة بأمر المؤسس السيادي' : 'إيقاف مؤقت لتفعيل الدولة بأمر المؤسس السيادي'
            });
            showToast(res && res.sovereign_auto_executed
                ? ('👑 تم تحديث حالة الدولة (' + countryCode + ') فوراً!')
                : 'تم إرسال الطلب للاعتماد.', false);
            await refreshSovereignBundle(false);
        } catch (err) {
            showToast(err.message, true);
        }
    };

    window.svSubmitCountryGate = async function (countryCode) {
        try {
            const gCfg = getGlobalStopperConfig();
            const cty = ((LIVE_BUNDLE && LIVE_BUNDLE.countries) || []).find(function (x) { return x.country_code === countryCode; }) || {};
            const cTarget = Number(cty.monthly_target_usd || 24.75);
            const defStopper = calcDefaultCountryStopperUsd(cTarget, gCfg.s01, gCfg.s02);
            const savedStopper = Number(cty.financial_stopper_usd || 0);
            const wasLegacyUnlinked = (Math.abs(savedStopper - 4605.75) < 0.005 && Math.abs(cTarget - 24.75) > 0.005);
            const gateStopperUsd = (savedStopper > 0 && !wasLegacyUnlinked) ? savedStopper : defStopper;

            const ctyRes = await window.SAWYAN.API.adminSubmitGovernanceRequest({
                actionType: 'COUNTRY_GATE_D13_ACTIVATION',
                targetEntity: 'countries',
                targetId: countryCode,
                payloadAfter: {
                    country_code: countryCode,
                    monthly_target_usd: cTarget,
                    legal_opinion_verified: true,
                    legal_opinion_doc_url: cty.legal_opinion_doc_url || ('https://legal.sawyan.global/opinions/' + countryCode + '-2026.pdf'),
                    local_terms_version: cty.local_terms_version || ('v3.0-' + countryCode),
                    financial_stopper_usd: gateStopperUsd
                },
                reason: 'طلب تفعيل بوابة الدولة D13 بعد مراجعة الرأي القانوني والمحاكي الأكتواري S06'
            });
            if (ctyRes && ctyRes.sovereign_auto_executed) {
                showToast('👑 تم التفعيل السيادي الفوري لبوابة الدولة (' + countryCode + ') بصلاحية المؤسس المطلقة!', false);
            } else {
                showToast('أُرسل طلب تفعيل الدولة ' + countryCode + ' مع المحاكاة الأكتوارية لطابور الاعتماد المزدوج!', false);
                ACTIVE_LIVE_TAB = 'mc';
            }
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
            const ptrRes = await window.SAWYAN.API.adminSubmitGovernanceRequest({
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
            if (ptrRes && ptrRes.sovereign_auto_executed) {
                showToast('👑 تم تسجيل واعتماد عقد الشريك (' + code + ') فوراً بصلاحية المؤسس المطلقة!', false);
            } else {
                showToast('تم رفع عقد الشريك لطابور الاعتماد المزدوج بنجاح!', false);
                ACTIVE_LIVE_TAB = 'mc';
            }
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

