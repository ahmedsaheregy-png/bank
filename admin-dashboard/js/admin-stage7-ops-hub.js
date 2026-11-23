/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — STAGE 7 SOVEREIGN OPERATIONS COMPLETENESS HUB
 * Implements all 12 Joint-Committee Operational Capabilities in Admin Portal:
 *   - Gap 1: Root #0 Founding Leaders (48h One-Time Invite Token + Direct Create)
 *   - Gap 2: Live Country Cities Manager (`geonames_locations`)
 *   - Gap 3: Staff & 7-Role RBAC Manager + Country Scope + Instant Kill Session
 *   - Gap 4 & 12: Live PostgreSQL Binding + Server-Side Search on Sidebar Screens
 *   - Gap 5: Live Support Tickets Two-Way Reply + User Password Reset (72h Lock) + Self Password Change
 *   - Gap 6: Atomic Withdrawal Payout (Mandatory Bank Ref) & Rejection (100% Reversal to Wallet)
 *   - Gap 7: KYC Document & Next-Month Residency Move Reviewer
 *   - Gap 8 & 11: Merchant Contract Editor (Commission %, D4 Credit, Bank Top-Up B2B) + Academy & Categories
 * ============================================================================
 */
(function () {
    'use strict';

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

    const _LIVE_MEMBERS_MAP = new Map();
    const _LIVE_MERCHANTS_MAP = new Map();
    let _activeMerchantFilter = 'all';
    const _ONBOARD_LABELS = {
        draft_incomplete: ['⚠️ مسودة ناقصة', '#fef3c7', '#92400e'],
        needs_correction: ['✏️ بانتظار تصحيح التاجر', '#ffedd5', '#9a3412'],
        approved: ['✅ مؤهل بياناتياً', '#dcfce7', '#166534'],
        rejected: ['🚫 مرفوض', '#fee2e2', '#991b1b']
    };
    const _FIN_LABELS = {
        unfunded: ['💳 بلا تمويل (0 شحن/ائتمان)', '#f1f5f9', '#334155'],
        healthy_green: ['🟢 رصيد أخضر (>30%)', '#dcfce7', '#166534'],
        warning_yellow: ['🟡 إنذار مبكر (≤30%)', '#fef3c7', '#92400e'],
        warning_red: ['🟠 إنذار حرج (≤20%)', '#ffedd5', '#9a3412'],
        isolated_low_balance: ['🔴 عزل وقائي (≤10%)', '#fee2e2', '#991b1b'],
        depleted_fifo_grace: ['⏸️ نفاد ومهلة FIFO', '#fee2e2', '#991b1b'],
        locked_queue_full: ['🔒 قفل تام (نفاد الطابور / D4)', '#7f1d1d', '#ffffff']
    };
    const _GOV_LABELS = {
        good_standing: ['🟢 سليم ممتثل', '#dcfce7', '#166534'],
        probation_warning: ['🟡 مراقبة وإنذار (د1)', '#fef3c7', '#92400e'],
        restricted_no_reject: ['🟠 تقييد الدرجة 2 (بلا رفض يدوي)', '#ffedd5', '#9a3412'],
        paused_by_merchant: ['⏸️ إجازة بطلب التاجر', '#e0f2fe', '#075985'],
        paused_by_admin: ['⏸️ موقوف إدارياً', '#f1f5f9', '#475569'],
        suspended_compliance: ['🔴 تعليق امتثال (متأخر ≥14ي)', '#fee2e2', '#991b1b'],
        banned_permanent: ['🚫 حظر نهائي (D3)', '#450a0a', '#ffffff']
    };
    function pillHtml(pair) {
        const p = pair || ['—', '#f1f5f9', '#334155'];
        return '<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:0.71rem;font-weight:800;background:' + p[1] + ';color:' + p[2] + ';">' + esc(p[0]) + '</span>';
    }
    function matchMerchantFilter(m, fk) {
        if (!fk || fk === 'all') return true;
        const lc = m.lifecycle || {};
        const onb = m.onboarding_status || lc.onboarding_status || 'approved';
        const fin = lc.financial_status || 'healthy_green';
        const gov = m.governance_status || lc.governance_status || 'good_standing';
        const acc = lc.effective_access || {};
        const vc = lc.violation_counters || {};
        if (fk === 'draft_incomplete') return onb === 'draft_incomplete' || onb === 'needs_correction';
        if (fk === 'unfunded') return onb === 'approved' && fin === 'unfunded';
        if (fk === 'active_store') return Boolean(acc.is_visible_on_radar);
        if (fk === 'warnings') return fin === 'warning_yellow' || fin === 'warning_red';
        if (fk === 'isolated_fifo') return fin === 'isolated_low_balance' || fin === 'depleted_fifo_grace';
        if (fk === 'locked') return fin === 'locked_queue_full';
        if (fk === 'compliance_alerts') return gov === 'probation_warning' || gov === 'restricted_no_reject' || Number(vc.verified_price_gouging_count || 0) >= 3 || Number(vc.open_complaints_count || 0) > 0;
        if (fk === 'paused') return gov === 'paused_by_merchant' || gov === 'paused_by_admin';
        if (fk === 'suspended_banned') return gov === 'suspended_compliance' || gov === 'banned_permanent' || onb === 'rejected';
        return true;
    }
    const _ADM_PAY_LABELS = {
        cash: '💵 نقدي (Cash)',
        pos_card: '💳 بطاقة POS',
        instant_transfer: '⚡ تحويل فوري',
        iban_swift_sepa: '🏦 تحويل بنكي',
        digital_wallet: '📱 محفظة إلكترونية',
        payment_gateway: '🌐 بوابة دفع',
        bnpl: '🗓️ تقسيط BNPL',
        cheque: '🧾 شيك بنكي',
        cod: '🚚 دفع عند الاستلام',
        marketplace_escrow: '🛡️ ضامن سوق'
    };
    function fmtAdmPayType(pt) {
        return _ADM_PAY_LABELS[String(pt || 'cash')] || String(pt || 'cash');
    }
    function renderAdmThumb(url, label) {
        if (!url || !(window.SAWYAN && window.SAWYAN.ImageUpload)) return '';
        return window.SAWYAN.ImageUpload.renderThumbHtml(url, label || '📎 مرفق');
    }

    function toast(msg, isErr) {
        let box = document.getElementById('sawyanAdminLiveToast');
        if (!box) {
            box = document.createElement('div');
            box.id = 'sawyanAdminLiveToast';
            box.style.cssText = 'position:fixed;bottom:22px;left:22px;z-index:10060;max-width:460px;padding:12px 16px;border-radius:12px;font-family:Tajawal,sans-serif;font-weight:800;font-size:0.88rem;box-shadow:0 10px 28px rgba(15,23,42,0.28);transition:opacity 0.25s;';
            document.body.appendChild(box);
        }
        box.style.background = isErr ? '#991b1b' : '#065f46';
        box.style.color = '#ffffff';
        box.style.border = isErr ? '1.5px solid #fca5a5' : '1.5px solid #6ee7b7';
        box.textContent = (isErr ? '⛔ ' : '✅ ') + msg;
        box.style.opacity = '1';
        clearTimeout(box._timer);
        box._timer = setTimeout(function () { box.style.opacity = '0'; }, 5000);
    }

    function curAdmin() {
        return (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedAdmin()) || window.currentAdmin || null;
    }

    function isFounder() {
        const a = curAdmin();
        return Boolean(a && (a.is_sovereign_founder || String(a.email || '').toLowerCase() === 'ahmed.saher.egy@gmail.com'));
    }

    function getBaseSiteRootUrl() {
        const loc = window.location;
        const idx = loc.href.indexOf('/admin-dashboard/');
        if (idx !== -1) return loc.href.slice(0, idx);
        return loc.origin;
    }

    function openStage7Modal(title, htmlBody, maxWidth) {
        let ov = document.getElementById('svStage7ModalOverlay');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'svStage7ModalOverlay';
            ov.style.cssText = 'position:fixed;inset:0;z-index:10055;background:rgba(15,23,42,0.65);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;';
            document.body.appendChild(ov);
        }
        ov.style.display = 'flex';
        ov.innerHTML =
            '<div style="background:#ffffff;border-radius:16px;max-width:' + (maxWidth || '760px') + ';width:100%;max-height:92vh;overflow-y:auto;padding:22px;box-shadow:0 24px 48px rgba(15,23,42,0.35);font-family:Tajawal,sans-serif;direction:rtl;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #e2e8f0;padding-bottom:10px;margin-bottom:14px;">' +
                    '<h3 style="margin:0;font-size:1.08rem;color:#0f172a;">' + title + '</h3>' +
                    '<button type="button" onclick="document.getElementById(\'svStage7ModalOverlay\').style.display=\'none\'" style="background:#f1f5f9;border:none;width:34px;height:34px;border-radius:8px;font-size:1.1rem;cursor:pointer;font-weight:900;">✕</button>' +
                '</div>' +
                '<div id="svStage7ModalBody">' + htmlBody + '</div>' +
            '</div>';
    }
    window.closeStage7Modal = function () {
        const ov = document.getElementById('svStage7ModalOverlay');
        if (ov) ov.style.display = 'none';
    };
    window.svOpenAdminModal = openStage7Modal;
    window.svAdminToast = toast;
    window.svEsc = esc;

    // ========================================================================
    // 1. Sovereign Command Center: Root #0 Leaders + Staff RBAC + Geo & Categories
    // ========================================================================
    function mountCommandCenterSidebarLink() {
        const nav = document.querySelector('.sidebar-nav') || document.querySelector('.sidebar');
        const contentArea = document.getElementById('contentArea') || document.querySelector('.dashboard-main');
        if (!nav || !contentArea) return;

        let navLink = document.getElementById('svStage7HubNavItem');
        if (!navLink) {
            navLink = document.createElement('a');
            navLink.href = '#';
            navLink.id = 'svStage7HubNavItem';
            navLink.className = 'nav-item nav-item-sovereign';
            navLink.dataset.page = 'sovereignOpsCenter';
            navLink.innerHTML = '<span class="icon">👑</span><span>التأسيس والموظفون</span>';
            const firstItem = nav.querySelector('.nav-item');
            if (firstItem && firstItem.nextSibling) nav.insertBefore(navLink, firstItem.nextSibling);
            else nav.appendChild(navLink);
        }
        if (!navLink.dataset.svBound) {
            navLink.dataset.svBound = '1';
            navLink.addEventListener('click', function (e) {
                e.preventDefault();
                window.openSovereignOpsCenter('root0');
            });
        }

        if (!document.getElementById('sovereignOpsCenterPage')) {
            const p = document.createElement('div');
            p.id = 'sovereignOpsCenterPage';
            p.className = 'page';
            contentArea.appendChild(p);
        }

        // Add self password change button to top header
        const hdr = document.querySelector('.dashboard-header');
        if (hdr && !document.getElementById('svAdminChangeOwnPwdBtn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'svAdminChangeOwnPwdBtn';
            btn.style.cssText = 'background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;padding:5px 11px;border-radius:8px;font-family:Tajawal,sans-serif;font-weight:800;font-size:0.78rem;cursor:pointer;margin-right:8px;';
            btn.textContent = '🔑 تغيير كلمة مروري';
            btn.onclick = window.svOpenAdminSelfPasswordModal;
            hdr.appendChild(btn);
        }

        const adm = curAdmin();
        if (adm && adm.must_change_password && !window.__svPromptedPwdChange) {
            window.__svPromptedPwdChange = true;
            setTimeout(function () { window.svOpenAdminSelfPasswordModal(true); }, 600);
        }
    }

    let ACTIVE_OPS_TAB = 'root0'; // root0 | staff | geo_catalog

    window.openSovereignOpsCenter = async function (tab) {
        if (tab) ACTIVE_OPS_TAB = (tab === 'cities' || tab === 'categories') ? 'geo_catalog' : tab;
        document.querySelectorAll('.nav-item').forEach(function (n) { n.classList.remove('active'); });
        const navItem = document.getElementById('svStage7HubNavItem');
        if (navItem) navItem.classList.add('active');

        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = '👑 التأسيس وإدارة الموظفين والكتالوج';

        document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
        const pg = document.getElementById('sovereignOpsCenterPage');
        if (pg) {
            pg.classList.add('active');
            await renderSovereignOpsCenter();
        }
    };

    async function renderSovereignOpsCenter() {
        const pg = document.getElementById('sovereignOpsCenterPage');
        if (!pg) return;
        const founder = isFounder();

        const tabs = [
            ['root0', '🌳 قادة الجيل الأول تحت #0'],
            ['staff', '👔 الموظفون والأدوار السبعة'],
            ['geo_catalog', '🗺️ المدن وتصنيفات المتاجر']
        ];

        pg.innerHTML =
            '<div style="background:linear-gradient(135deg,#0f172a,#064e3b);color:#ffffff;padding:16px 20px;border-radius:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">' +
                '<div>' +
                    '<div style="font-size:1.12rem;font-weight:900;">👑 مركز التأسيس السيادي وإدارة الموظفين والجغرافيا والكتالوج</div>' +
                    '<div style="font-size:0.8rem;color:#a7f3d0;margin-top:3px;">جميع الأدوات مرتبطة مباشرةً بقاعدة البيانات الحية (' + esc(window.SAWYAN.API.getActiveSchema()) + ') وموثقة في سجل التدقيق الجنائي. (الأكاديمية التدريبية متاحة الآن كقسم مستقل في القائمة الجانبية 🎓)</div>' +
                '</div>' +
                (founder ? '<span style="background:#fbbf24;color:#0f172a;padding:4px 12px;border-radius:999px;font-weight:900;font-size:0.78rem;">صلاحية المؤسس السيادي مفعّلة</span>' : '<span style="background:rgba(255,255,255,0.15);padding:4px 12px;border-radius:999px;font-size:0.78rem;">وضع عرض الصلاحيات</span>') +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">' +
                tabs.map(function (t) {
                    const act = ACTIVE_OPS_TAB === t[0];
                    return '<button type="button" onclick="openSovereignOpsCenter(\'' + t[0] + '\')" style="padding:9px 15px;border-radius:10px;border:1.5px solid ' + (act ? '#059669' : '#cbd5e1') + ';background:' + (act ? '#059669' : '#ffffff') + ';color:' + (act ? '#ffffff' : '#0f172a') + ';font-family:Tajawal,sans-serif;font-weight:800;cursor:pointer;">' + t[1] + '</button>';
                }).join('') +
            '</div>' +
            '<div id="svOpsSubBody"><div style="padding:24px;text-align:center;color:#64748b;">جاري التحميل من قاعدة البيانات...</div></div>';

        const sub = document.getElementById('svOpsSubBody');
        try {
            if (ACTIVE_OPS_TAB === 'root0') await renderRoot0Tab(sub);
            else if (ACTIVE_OPS_TAB === 'staff') await renderStaffTab(sub);
            else await renderGeoAndCategoriesTab(sub);
        } catch (err) {
            sub.innerHTML = '<div style="padding:18px;background:#fef2f2;color:#991b1b;border-radius:12px;font-weight:800;">⛔ ' + esc(err.message) + '</div>';
        }
    }

    // --- Sub-Tab 1: Root #0 Founding Leaders ---
    async function renderRoot0Tab(sub) {
        const data = await window.SAWYAN.API.adminManageRootLeaders({ action: 'list' });
        const tokens = data.tokens || [];
        const leaders = data.direct_leaders || [];
        const founder = isFounder();
        const baseRoot = getBaseSiteRootUrl();

        sub.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px;margin-bottom:16px;">' +
                '<div style="background:#ffffff;border:1.5px solid #10b981;border-radius:14px;padding:16px;">' +
                    '<h3 style="margin:0 0 6px 0;font-size:0.98rem;color:#065f46;">🔗 ١. توليد رابط دعوة تأسيسي وحيد الاستخدام تحت `#0` (موصى به)</h3>' +
                    '<p style="font-size:0.79rem;color:#475569;margin:0 0 10px 0;">يولّد رابطاً مشفراً صالحاً لـ 48 ساعة ترسله للقائد على واتساب ليسجّل بياناته وكلمة مروره السرية بنفسه، ويحترق الرابط فور أول استخدام.</p>' +
                    '<div style="display:grid;grid-template-columns:2fr 1fr;gap:8px;margin-bottom:10px;">' +
                        '<input id="svRootTokNote" type="text" placeholder="اسم القائد / ملاحظة (مثلاً: القائد طارق — مصر)" class="form-control">' +
                        '<input id="svRootTokCountry" type="text" maxlength="2" value="EG" placeholder="EG" class="form-control">' +
                    '</div>' +
                    '<button type="button" ' + (founder ? '' : 'disabled') + ' onclick="svGenerateRootToken()" class="btn btn-primary" style="width:100%;">👑 توليد رابط قائد جيل أول وحيد الاستخدام</button>' +
                '</div>' +

                '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                    '<h3 style="margin:0 0 6px 0;font-size:0.98rem;color:#0f172a;">👤 ٢. تسجيل قائد جيل أول مباشرةً من لوحتك (احتياطي)</h3>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">' +
                        '<input id="svRootDirName" type="text" placeholder="الاسم الكامل للقائد" class="form-control">' +
                        '<input id="svRootDirPhone" type="text" placeholder="رقم الهاتف (+2010...)" class="form-control">' +
                        '<input id="svRootDirCountry" type="text" maxlength="2" value="EG" placeholder="الدولة (EG)" class="form-control">' +
                        '<input id="svRootDirPwd" type="text" placeholder="كلمة مرور مبدئية (>=8)" class="form-control">' +
                    '</div>' +
                    '<button type="button" ' + (founder ? '' : 'disabled') + ' onclick="svCreateDirectRootLeader()" class="btn btn-outline" style="width:100%;font-weight:800;">➕ إنشاء وتسكين القائد تحت `#0` الآن</button>' +
                '</div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;margin-bottom:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">🎟️ روابط الدعوة التأسيسية الصادرة تحت `#0`</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>ملاحظة القائد</th><th>الدولة</th><th>الحالة</th><th>الصلاحية</th><th>رابط التسجيل والنسخ / واتساب</th><th>إجراء</th></tr></thead><tbody>' +
                (tokens.length === 0 ? '<tr><td colspan="6" class="empty-state">لم يتم إصدار روابط دعوة تأسيسية بعد</td></tr>' : tokens.map(function (t) {
                    const url = baseRoot + '/member-dashboard/register.html?root_token=' + encodeURIComponent(t.token) + '&country=' + encodeURIComponent(t.country_code || 'EG');
                    const used = Boolean(t.used);
                    const wa = 'https://wa.me/?text=' + encodeURIComponent('دعوة تأسيسية رسمية لتسجيل حسابك كقائد جيل أول في منظومة SAWYAN (رابط وحيد الاستخدام صالح لـ 48 ساعة):\n' + url);
                    return '<tr>' +
                        '<td data-label="ملاحظة القائد"><b>' + esc(t.leader_note) + '</b></td>' +
                        '<td data-label="الدولة">' + esc(t.country_code) + '</td>' +
                        '<td data-label="الحالة">' + (used ? '<span class="badge badge-success">✅ استُخدم (' + esc(t.used_by_phone || '') + ')</span>' : '<span class="badge badge-warning">🟢 متاح لمرة واحدة</span>') + '</td>' +
                        '<td data-label="الصلاحية"><small>' + esc(String(t.expires_at || '').slice(0, 16).replace('T', ' ')) + '</small></td>' +
                        '<td data-label="رابط التسجيل والنسخ / واتساب">' + (used ? '—' : ('<div style="display:flex;gap:5px;flex-wrap:wrap;"><button type="button" class="btn-sm btn-primary" onclick="navigator.clipboard.writeText(\'' + esc(url) + '\');alert(\'✅ تم نسخ الرابط التأسيسي!\')">📋 نسخ الرابط</button><a href="' + esc(wa) + '" target="_blank" style="background:#16a34a;color:#fff;padding:4px 9px;border-radius:6px;text-decoration:none;font-size:0.76rem;font-weight:800;">💬 إرسال واتساب</a></div>')) + '</td>' +
                        '<td data-label="إجراء">' + (!used && founder ? '<button type="button" class="btn-sm btn-danger" onclick="svRevokeRootToken(\'' + esc(t.token) + '\')">إلغاء</button>' : '—') + '</td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                    '<h3 style="margin:0;font-size:0.98rem;">🌳 قادة الجيل الأول المسكّنون مباشرةً تحت الجذر `#0` (' + leaders.length + ')</h3>' +
                    '<button type="button" class="btn-sm btn-primary" onclick="if (typeof openAdminNetworkTree === \'function\') openAdminNetworkTree(0)">🌳 عرض الشجرة الكاملة من #0</button>' +
                '</div>' +
                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>كود القائد</th><th>الاسم الكامل</th><th>الهاتف</th><th>الدولة</th><th>حجم فريقه</th><th>إجراءات ورابط الإحالة</th></tr></thead><tbody>' +
                (leaders.length === 0 ? '<tr><td colspan="6" class="empty-state">لا يوجد قادة مسكّنون تحت `#0` حتى الآن</td></tr>' : leaders.map(function (l) {
                    const refUrl = baseRoot + '/member-dashboard/register.html?ref=' + l.member_code + '&country=' + encodeURIComponent(l.country_code || 'EG');
                    return '<tr>' +
                        '<td data-label="كود القائد"><b>#' + Number(l.member_code) + '</b></td>' +
                        '<td data-label="الاسم الكامل">' + esc(l.full_name) + '</td>' +
                        '<td data-label="الهاتف">' + esc(l.phone) + '</td>' +
                        '<td data-label="الدولة">' + esc(l.country_code) + '</td>' +
                        '<td data-label="حجم فريقه"><b>' + Number(l.team_size || 0) + '</b> عضو</td>' +
                        '<td data-label="إجراءات ورابط الإحالة"><div style="display:flex;gap:5px;flex-wrap:wrap;"><button type="button" class="btn-sm btn-outline" onclick="if (typeof openAdminNetworkTree === \'function\') openAdminNetworkTree(' + Number(l.member_code) + ')">🌳 شجرته</button><button type="button" class="btn-sm btn-primary" onclick="navigator.clipboard.writeText(\'' + esc(refUrl) + '\');alert(\'تم نسخ رابط إحالة القائد #' + l.member_code + '\')">📋 نسخ رابط القائد</button></div></td>' +
                    '</tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>';
    }

    window.svGenerateRootToken = async function () {
        try {
            const note = document.getElementById('svRootTokNote').value.trim() || 'قائد جيل أول تأسيسي';
            const cc = document.getElementById('svRootTokCountry').value.trim().toUpperCase() || 'EG';
            await window.SAWYAN.API.adminManageRootLeaders({ action: 'generate_token', leaderName: note, countryCode: cc });
            toast('👑 تم توليد رابط الدعوة التأسيسي وحيد الاستخدام بنجاح!', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    window.svRevokeRootToken = async function (tok) {
        try {
            await window.SAWYAN.API.adminManageRootLeaders({ action: 'revoke_token', tokenToRevoke: tok });
            toast('تم إلغاء الرابط التأسيسي.', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    window.svCreateDirectRootLeader = async function () {
        try {
            const name = document.getElementById('svRootDirName').value.trim();
            const phone = document.getElementById('svRootDirPhone').value.trim();
            const cc = document.getElementById('svRootDirCountry').value.trim().toUpperCase() || 'EG';
            const pwd = document.getElementById('svRootDirPwd').value;
            const res = await window.SAWYAN.API.adminManageRootLeaders({
                action: 'create_direct',
                leaderName: name,
                leaderPhone: phone,
                countryCode: cc,
                initialPassword: pwd
            });
            toast('👑 تم إنشاء وتسكين القائد تحت #0 بنجاح! كوده الرسمي: #' + res.created_leader_code, false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    // --- Sub-Tab 2: Staff & 7-Role RBAC Management ---
    function generateStrongStaffPwd() {
        const up = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lo = 'abcdefghijkmnpqrstuvwxyz';
        const dg = '23456789';
        const sm = '@#$!';
        const all = up + lo + dg + sm;
        let p = up[Math.floor(Math.random() * up.length)]
            + lo[Math.floor(Math.random() * lo.length)]
            + dg[Math.floor(Math.random() * dg.length)]
            + sm[Math.floor(Math.random() * sm.length)];
        for (let i = 0; i < 8; i++) p += all[Math.floor(Math.random() * all.length)];
        return p;
    }

    async function renderStaffTab(sub) {
        const res = await window.SAWYAN.API.adminManageStaffAccounts({ action: 'list' });
        const staff = res.staff || [];
        const founder = isFounder();

        let empCfg = { fields: [] };
        try {
            if (window.SAWYAN && window.SAWYAN.RegEngine) {
                empCfg = await window.SAWYAN.RegEngine.loadFormConfig('employee_admin', true);
            }
        } catch (_e) {}

        const fMap = {};
        (empCfg.fields || []).forEach(function (f) { fMap[f.field_key] = f; });
        function meta(key, defLbl, defPh, defHlp, defShow, defReq) {
            const c = fMap[key] || {};
            return {
                label: c.label_ar || defLbl,
                placeholder: c.placeholder_ar || defPh || '',
                help: c.help_text_ar || defHlp || '',
                show: c.show_in_initial !== undefined ? Boolean(c.show_in_initial) : defShow,
                req: c.required_in_initial !== undefined ? Boolean(c.required_in_initial) : defReq
            };
        }

        const mName  = meta('full_name', 'الاسم الكامل للموظف الإداري', 'الاسم الكامل كما في العقد الوظيفي', '', true, true);
        const mEmail = meta('email', 'البريد الإلكتروني الوظيفي', 'name@sawyan.global', '', true, true);
        const mRole  = meta('role', 'الدور الوظيفي (الصلاحية)', '', '', true, true);
        const mScope = meta('country_scope', 'نطاق الدولة المصرح به', '', '', true, true);
        const mPwd   = meta('initial_password', 'كلمة المرور المبدئية (8+ أحرف)', 'أدخل أو ولّد كلمة مرور قوية', '', true, true);
        const mPhone = meta('staff_phone', 'رقم الهاتف الوظيفي', '+201012345678', '', true, false);

        const star = function (isReq) {
            return isReq
                ? ' <span style="color:#DC2626;font-weight:900;">*</span>'
                : ' <span style="font-size:0.74rem;color:#64748B;">(اختياري)</span>';
        };
        const hlpHtml = function (txt) {
            return txt ? '<small style="display:block;color:#64748B;font-size:0.76rem;margin-top:3px;">' + esc(txt) + '</small>' : '';
        };

        const sortedCountries = (window.SAWYAN && typeof window.SAWYAN.getCountriesSorted === 'function')
            ? window.SAWYAN.getCountriesSorted()
            : ((window.SAWYAN && Array.isArray(window.SAWYAN.Countries)) ? window.SAWYAN.Countries : []);
        const countriesOpts = sortedCountries
            .map(function (c) {
                return '<option value="' + esc(c.code) + '" data-name-ar="' + esc(c.nameAr) + '" data-name-en="' + esc(c.nameEn || c.nameAr) + '" data-flag="' + esc(c.flag || '') + '">' + esc((c.flag || '') + ' ' + c.nameAr + ' (' + c.code + ')') + '</option>';
            }).join('');

        sub.innerHTML =
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;margin-bottom:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;">' +
                    '<h3 style="margin:0;font-size:0.98rem;">➕ تعيين موظف إداري جديد (حصري للمؤسس السيادي — يُجبر على تغيير كلمة المرور فور أول دخول)</h3>' +
                    '<button type="button" class="btn-sm btn-outline" onclick="if(typeof openRegistrationBuilderPage===\'function\') openRegistrationBuilderPage(\'employee_admin\')">🧩 تعديل حقول نموذج الموظف</button>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-bottom:12px;">' +
                    '<div>' +
                        '<label style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;">' + esc(mName.label) + star(mName.req) + '</label>' +
                        '<input id="svStfName" type="text" placeholder="' + esc(mName.placeholder) + '" class="form-control">' +
                        hlpHtml(mName.help) +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;">' + esc(mEmail.label) + star(mEmail.req) + '</label>' +
                        '<input id="svStfEmail" type="email" dir="ltr" placeholder="' + esc(mEmail.placeholder) + '" class="form-control">' +
                        hlpHtml(mEmail.help) +
                    '</div>' +
                    (mPhone.show ? (
                    '<div>' +
                        '<label style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;">' + esc(mPhone.label) + star(mPhone.req) + '</label>' +
                        '<input id="svStfPhone" type="tel" dir="ltr" data-req="' + (mPhone.req ? '1' : '0') + '" placeholder="' + esc(mPhone.placeholder) + '" class="form-control">' +
                        hlpHtml(mPhone.help) +
                    '</div>'
                    ) : '') +
                    '<div>' +
                        '<label style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;">' + esc(mRole.label) + star(mRole.req) + '</label>' +
                        '<select id="svStfRole" class="form-control">' +
                            '<option value="finance">💼 محاسب مالي (finance)</option>' +
                            '<option value="kyc_officer">🪪 موظف هوية (kyc_officer)</option>' +
                            '<option value="support">🎫 دعم ونزاعات (support)</option>' +
                            '<option value="reviewer">🔎 مراجع رقابي (reviewer)</option>' +
                            '<option value="approver">✅ معتمد ثانٍ (approver)</option>' +
                            '<option value="auditor">🔍 مدقق قراءة فقط (auditor)</option>' +
                            '<option value="data_entry">⌨️ مدخل بيانات (data_entry)</option>' +
                        '</select>' +
                        hlpHtml(mRole.help) +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;">' + esc(mScope.label) + star(mScope.req) + '</label>' +
                        '<select id="svStfScope" class="form-control">' +
                            '<option value="GLOBAL">🌍 عالمي (GLOBAL — كافة الدول)</option>' +
                            countriesOpts +
                        '</select>' +
                        hlpHtml(mScope.help) +
                    '</div>' +
                    '<div>' +
                        '<label style="display:block;font-weight:700;font-size:0.84rem;margin-bottom:4px;">' + esc(mPwd.label) + star(mPwd.req) + '</label>' +
                        '<div style="display:flex;gap:6px;">' +
                            '<input id="svStfPwd" type="text" dir="ltr" placeholder="' + esc(mPwd.placeholder) + '" class="form-control">' +
                            '<button type="button" class="btn-sm btn-outline" onclick="document.getElementById(\'svStfPwd\').value=\'' + esc(generateStrongStaffPwd()) + '\'" title="توليد كلمة مرور قوية">🎲 توليد</button>' +
                        '</div>' +
                        hlpHtml(mPwd.help) +
                    '</div>' +
                '</div>' +
                '<button type="button" ' + (founder ? '' : 'disabled') + ' onclick="svCreateStaff()" class="btn btn-primary">👔 إنشاء حساب الموظف وتفعيل إجبار تغيير كلمة المرور</button>' +
            '</div>' +

            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">📋 جدول الموظفين الإداريين والصلاحيات السبعة</h3>' +
                '<div style="overflow-x:auto;"><table class="data-table" data-has-labels="1"><thead><tr><th>الموظف</th><th>البريد والهاتف</th><th>الدور الوظيفي</th><th>نطاق الدولة</th><th>الحالة</th><th>إجراءات المؤسس الفورية</th></tr></thead><tbody>' +
                staff.map(function (s) {
                    return '<tr>' +
                        '<td data-label="الموظف"><b>' + esc(s.full_name) + '</b>' + (s.is_founder ? ' <span class="badge badge-success">👑 المؤسس</span>' : '') + '</td>' +
                        '<td data-label="البريد والهاتف"><code>' + esc(s.email) + '</code>' + (s.phone ? '<div style="font-size:0.78rem;color:#475569;" dir="ltr">' + esc(s.phone) + '</div>' : '') + '</td>' +
                        '<td data-label="الدور الوظيفي"><b>' + esc(s.role) + '</b></td>' +
                        '<td data-label="نطاق الدولة"><span class="badge badge-info">' + esc(s.country_scope || 'GLOBAL') + '</span></td>' +
                        '<td data-label="الحالة">' + (s.is_active ? '<span class="badge badge-success">نشط</span>' : '<span class="badge badge-danger">موقوف / مطرود</span>') + '</td>' +
                        '<td data-label="إجراءات المؤسس الفورية">' + (s.is_founder || !founder ? '—' : (
                            '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                                '<button type="button" class="btn-sm btn-primary" onclick="svPromptStaffRole(\'' + s.id + '\',\'' + esc(s.role) + '\',\'' + esc(s.country_scope || 'GLOBAL') + '\')">⚙️ الدور/النطاق</button>' +
                                '<button type="button" class="btn-sm btn-warning" onclick="svPromptStaffResetPwd(\'' + s.id + '\')">🔑 كلمة مرور</button>' +
                                (s.is_active
                                    ? '<button type="button" class="btn-sm btn-danger" onclick="svKillStaff(\'' + s.id + '\')">⛔ إيقاف وطرد فوري</button>'
                                    : '<button type="button" class="btn-sm btn-success" onclick="svActivateStaff(\'' + s.id + '\')">إعادة تفعيل</button>') +
                            '</div>'
                        )) + '</td>' +
                    '</tr>';
                }).join('') +
                '</tbody></table></div>' +
            '</div>';

        if (window.SAWYAN && window.SAWYAN.SmartSearch) {
            const stfScopeSel = document.getElementById('svStfScope');
            if (stfScopeSel) {
                window.SAWYAN.SmartSearch.attachToSelect(stfScopeSel, {
                    kind: 'country',
                    compact: true,
                    placeholder: 'ابحث عن نطاق الدولة (عربي / English)...',
                    showLetterHeaders: true,
                    skipEmptyPlaceholder: false
                });
            }
        }
    }

    window.svCreateStaff = async function () {
        try {
            const name = document.getElementById('svStfName').value.trim();
            const rawEmail = document.getElementById('svStfEmail').value.trim();
            const phoneEl = document.getElementById('svStfPhone');
            const rawPhone = phoneEl ? phoneEl.value.trim() : '';
            const phoneReq = phoneEl ? phoneEl.dataset.req === '1' : false;
            const scope = (document.getElementById('svStfScope').value || 'GLOBAL').trim().toUpperCase();
            const pwd = document.getElementById('svStfPwd').value;

            if (!name || name.length < 3) throw new Error('يرجى إدخال الاسم الكامل للموظف (3 أحرف فأكثر).');

            let finalEmail = rawEmail;
            if (window.SAWYAN && window.SAWYAN.RegEngine) {
                const emRes = window.SAWYAN.RegEngine.validateEmailStrict(rawEmail, true);
                if (!emRes.valid) throw new Error(emRes.error);
                finalEmail = emRes.clean;

                if (rawPhone || phoneReq) {
                    const ccHint = (scope && scope !== 'GLOBAL' && scope.length === 2) ? scope : 'EG';
                    const phRes = window.SAWYAN.RegEngine.validatePhoneByCountry(rawPhone, ccHint, phoneReq);
                    if (!phRes.valid) throw new Error(phRes.error);
                }
                const pwRes = window.SAWYAN.RegEngine.validatePasswordStrong(pwd);
                if (!pwRes.valid) throw new Error(pwRes.error);
            }

            await window.SAWYAN.API.adminManageStaffAccounts({
                action: 'create',
                fullName: name,
                email: finalEmail,
                role: document.getElementById('svStfRole').value,
                countryScope: scope || 'GLOBAL',
                password: pwd,
                phone: rawPhone || null
            });
            toast('👔 تم إنشاء حساب الموظف بنجاح!', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    window.svPromptStaffRole = async function (id, curRole, curScope) {
        const nr = prompt('أدخل الدور الجديد (finance / kyc_officer / support / reviewer / approver / auditor / data_entry):', curRole);
        if (!nr) return;
        const ns = prompt('أدخل نطاق الدولة (GLOBAL لجميع الدول أو رمز الدولة مثل EG أو SA أو TR):', curScope);
        if (!ns) return;
        try {
            await window.SAWYAN.API.adminManageStaffAccounts({ action: 'update', targetId: id, role: nr.trim(), countryScope: ns.trim() });
            toast('تم تحديث دور ونطاق الموظف فوراً.', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    window.svPromptStaffResetPwd = async function (id) {
        const np = prompt('أدخل كلمة المرور المؤقتة الجديدة للموظف (8 أحرف فأكثر):', 'Sawyan@Staff2026!');
        if (!np) return;
        try {
            await window.SAWYAN.API.adminManageStaffAccounts({ action: 'reset_password', targetId: id, password: np });
            toast('🔑 تم تعيين كلمة المرور المؤقتة وإنهاء جلسات الموظف السابقة.', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    window.svKillStaff = async function (id) {
        if (!confirm('تأكيد إيقاف حساب الموظف وطرده من الجلسة المفتوحة فوراً؟')) return;
        try {
            await window.SAWYAN.API.adminManageStaffAccounts({ action: 'kill_deactivate', targetId: id });
            toast('⛔ تم إيقاف الموظف وطرده من النظام في التو واللحظة!', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    window.svActivateStaff = async function (id) {
        try {
            await window.SAWYAN.API.adminManageStaffAccounts({ action: 'activate', targetId: id });
            toast('تمت إعادة تفعيل حساب الموظف.', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    // --- Sub-Tab 3: Country Cities Manager ---
    let SELECTED_CITY_CC = 'EG';
    async function renderCitiesTab(sub) {
        const pub = await window.SAWYAN.API.getPublicActiveCountriesAndCities();
        const cityRes = await window.SAWYAN.API.adminManageCountryCities({ action: 'list', countryCode: SELECTED_CITY_CC });
        const cities = cityRes.cities || [];

        sub.innerHTML =
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                        '<label style="font-weight:800;">اختر رمز الدولة:</label>' +
                        '<input id="svCityCcInput" type="text" maxlength="2" value="' + esc(SELECTED_CITY_CC) + '" style="width:75px;text-align:center;font-weight:900;" class="form-control">' +
                        '<button type="button" class="btn-sm btn-primary" onclick="svSwitchCityCountry()">عرض المدن</button>' +
                    '</div>' +
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                        (pub.countries || []).map(function (c) {
                            return '<button type="button" class="btn-sm ' + (c.country_code === SELECTED_CITY_CC ? 'btn-primary' : 'btn-outline') + '" onclick="svQuickSelectCityCc(\'' + esc(c.country_code) + '\')">' + esc((c.country_name_i18n && c.country_name_i18n.ar) || c.country_code) + ' (' + esc(c.country_code) + ')</button>';
                        }).join('') +
                    '</div>' +
                '</div>' +

                '<div style="display:grid;grid-template-columns:2fr 2fr 1fr;gap:8px;margin-bottom:14px;">' +
                    '<input id="svNewCityAr" type="text" placeholder="اسم المدينة/المحافظة بالعربية (مثلاً: العين)" class="form-control">' +
                    '<input id="svNewCityEn" type="text" placeholder="الاسم بالإنجليزية (مثلاً: Al Ain)" class="form-control">' +
                    '<button type="button" class="btn btn-primary" onclick="svAddCountryCity()">➕ إضافة مدينة</button>' +
                '</div>' +

                '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>كود المدينة</th><th>الاسم بالعربية</th><th>الاسم الدولي</th><th>إجراء</th></tr></thead><tbody>' +
                (cities.length === 0 ? '<tr><td colspan="4" class="empty-state">لا توجد مدن مسجلة لهذه الدولة بعد</td></tr>' : cities.map(function (g) {
                    return '<tr><td><code>' + g.geoname_id + '</code></td><td><b>' + esc(g.city_name) + '</b></td><td>' + esc(g.asciiname) + '</td><td><button type="button" class="btn-sm btn-danger" onclick="svDeleteCountryCity(' + Number(g.geoname_id) + ')">حذف</button></td></tr>';
                }).join('')) +
                '</tbody></table></div>' +
            '</div>';
    }

    window.svQuickSelectCityCc = async function (cc) { SELECTED_CITY_CC = cc; await renderSovereignOpsCenter(); };
    window.svSwitchCityCountry = async function () {
        SELECTED_CITY_CC = (document.getElementById('svCityCcInput').value || 'EG').trim().toUpperCase();
        await renderSovereignOpsCenter();
    };
    window.svAddCountryCity = async function () {
        try {
            await window.SAWYAN.API.adminManageCountryCities({
                action: 'add',
                countryCode: SELECTED_CITY_CC,
                cityNameAr: document.getElementById('svNewCityAr').value.trim(),
                cityNameEn: document.getElementById('svNewCityEn').value.trim()
            });
            toast('🏙️ تمت إضافة المدينة بنجاح وتحديث قوائم التسجيل الحية!', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };
    window.svDeleteCountryCity = async function (gid) {
        if (!confirm('حذف هذه المدينة من القائمة؟')) return;
        try {
            await window.SAWYAN.API.adminManageCountryCities({ action: 'delete', countryCode: SELECTED_CITY_CC, geonameId: gid });
            toast('تم حذف المدينة.', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    // --- Sub-Tab 3: Geo Cities & Merchant Categories ---
    async function renderGeoAndCategoriesTab(sub) {
        sub.innerHTML =
            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:14px;">' +
                '<div id="svGeoCitiesPane"></div>' +
                '<div id="svCategoriesPane"></div>' +
            '</div>';
        const citiesPane = document.getElementById('svGeoCitiesPane');
        const catsPane = document.getElementById('svCategoriesPane');
        await Promise.all([
            renderCitiesTab(citiesPane),
            renderMerchantCategoriesCard(catsPane)
        ]);
    }

    async function renderMerchantCategoriesCard(container) {
        const res = await window.SAWYAN.API.adminManageAcademyAndCategories({ domain: 'category', action: 'list' });
        const cats = res.categories || [];
        container.innerHTML =
            '<div style="background:#ffffff;border:1.5px solid #cbd5e1;border-radius:14px;padding:16px;">' +
                '<h3 style="margin:0 0 8px 0;font-size:0.98rem;">🏷️ تصنيفات المتاجر المعتمدة (<code>sawyan.categories</code>)</h3>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:10px;">' +
                    '<input id="svCatSlug" type="text" placeholder="الكود (مثلاً: optics)" class="form-control">' +
                    '<input id="svCatNameAr" type="text" placeholder="الاسم (مثلاً: بصريات ونظارات)" class="form-control">' +
                    '<button type="button" class="btn btn-primary" onclick="svAddCategory()">➕ إضافة</button>' +
                '</div>' +
                '<div style="max-height:360px;overflow-y:auto;"><table class="data-table"><thead><tr><th>التصنيف</th><th>الكود</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>' +
                cats.map(function (ct) {
                    return '<tr><td><b>' + esc((ct.name_i18n && ct.name_i18n.ar) || ct.slug) + '</b></td><td><code>' + esc(ct.slug) + '</code></td><td>' + (ct.is_active ? '🟢' : '⚪') + '</td><td><button type="button" class="btn-sm btn-outline" onclick="svToggleCategory(' + ct.id + ')">تبديل</button></td></tr>';
                }).join('') +
                '</tbody></table></div>' +
            '</div>';
    }

    window.svAddCategory = async function () {
        try {
            await window.SAWYAN.API.adminManageAcademyAndCategories({
                domain: 'category',
                action: 'upsert',
                payload: {
                    slug: document.getElementById('svCatSlug').value.trim(),
                    name_ar: document.getElementById('svCatNameAr').value.trim(),
                    is_active: true
                }
            });
            toast('🏷️ تمت إضافة التصنيف التجاري بنجاح!', false);
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };
    window.svToggleCategory = async function (id) {
        try {
            await window.SAWYAN.API.adminManageAcademyAndCategories({ domain: 'category', action: 'toggle', payload: { id: id } });
            await renderSovereignOpsCenter();
        } catch (err) { toast(err.message, true); }
    };

    // ========================================================================
    // 2. Self Password Change Modal for Admin + User Password Reset Tool
    // ========================================================================
    window.svOpenAdminSelfPasswordModal = function (forced) {
        openStage7Modal(
            forced ? '🔐 إجراء أمني إلزامي: يرجى تعيين كلمة مرورك السرية الجديدة' : '🔑 تغيير كلمة مرور حسابك الإداري',
            '<div style="display:grid;gap:10px;">' +
                (forced ? '<div style="background:#fffbeb;border:1px solid #f59e0b;color:#92400e;padding:10px;border-radius:10px;font-size:0.84rem;font-weight:700;">دخولك الحالي بكلمة مرور مبدئية؛ يرجى تعيين كلمة مرورك السرية الخاصة للمتابعة.</div>' : '') +
                '<div><label style="font-size:0.8rem;font-weight:800;">كلمة المرور الحالية</label><input id="svSelfOldPwd" type="password" class="form-control"></div>' +
                '<div><label style="font-size:0.8rem;font-weight:800;">كلمة المرور الجديدة (8 أحرف فأكثر)</label><input id="svSelfNewPwd" type="password" class="form-control"></div>' +
                '<button type="button" class="btn btn-primary" onclick="svSubmitAdminSelfPassword()">🔐 حفظ كلمة المرور الجديدة</button>' +
            '</div>',
            '460px'
        );
    };

    window.svSubmitAdminSelfPassword = async function () {
        try {
            const adm = curAdmin();
            await window.SAWYAN.API.changeOwnPassword({
                actorType: 'admin',
                actorId: adm.id,
                sessionToken: window.SAWYAN.API.getAdminSessionToken(),
                oldPassword: document.getElementById('svSelfOldPwd').value,
                newPassword: document.getElementById('svSelfNewPwd').value
            });
            adm.must_change_password = false;
            window.SAWYAN.API.saveAdminSession(adm, window.SAWYAN.API.getAdminSessionToken());
            window.closeStage7Modal();
            toast('تم تحديث كلمة مرورك بنجاح!', false);
        } catch (err) { toast(err.message, true); }
    };

    window.svOpenUserPasswordResetModal = function (userType, identifier) {
        openStage7Modal(
            '🔑 إصدار كلمة مرور مؤقتة لمرة واحدة (' + (userType === 'member' ? 'عضو — مع قفل تهدئة سحب 72 ساعة' : 'تاجر') + ')',
            '<div style="display:grid;gap:10px;">' +
                '<div><label style="font-size:0.8rem;font-weight:800;">معرّف الحساب (الكود أو الهاتف أو البريد)</label><input id="svRstIdent" type="text" value="' + esc(identifier || '') + '" class="form-control"></div>' +
                '<div><label style="font-size:0.8rem;font-weight:800;">كلمة المرور المؤقتة الجديدة (>=8 أحرف)</label><input id="svRstTempPwd" type="text" value="Sawyan@Reset' + Math.floor(1000 + Math.random() * 9000) + '!" class="form-control"></div>' +
                '<div><label style="font-size:0.8rem;font-weight:800;">توثيق التحقق من ملكية الهاتف</label><input id="svRstReason" type="text" value="تم التحقق من ملكية رقم الهاتف المسجل عبر واتساب الرسمي" class="form-control"></div>' +
                '<button type="button" class="btn btn-primary" onclick="svExecUserPasswordReset(\'' + esc(userType) + '\')">🔑 اعتماد كلمة المرور المؤقتة وتفعيل الحماية</button>' +
            '</div>',
            '500px'
        );
    };

    window.svExecUserPasswordReset = async function (userType) {
        try {
            const tempPwd = document.getElementById('svRstTempPwd').value.trim();
            const res = await window.SAWYAN.API.adminResetUserPassword({
                userType: userType,
                userIdentifier: document.getElementById('svRstIdent').value.trim(),
                tempPassword: tempPwd,
                reason: document.getElementById('svRstReason').value.trim()
            });
            window.closeStage7Modal();
            toast('تم إصدار كلمة المرور المؤقتة (' + tempPwd + ') للحساب #' + res.code + ' بنجاح!', false);
        } catch (err) { toast(err.message, true); }
    };

    // ========================================================================
    // 3. Live PostgreSQL Binding for Sidebar Screens (Single Codebase D29)
    // ========================================================================
    // Override Members Screen with Live Server-Side Search + KYC/Residency Viewer + Password Reset
    window.loadMembers = async function (q) {
        const page = document.getElementById('membersPage');
        if (!page) return;
        const res = await window.SAWYAN.API.adminSearchAndReplyOps({ action: 'search', entity: 'members', query: q || '' });
        const list = res.results || [];
        _LIVE_MEMBERS_MAP.clear();
        list.forEach(function (m) { if (m && m.id) _LIVE_MEMBERS_MAP.set(String(m.id), m); });
        page.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
                '<div><h2 style="margin:0;">👥 إدارة الأعضاء الحية (' + list.length + ')</h2><div style="font-size:0.8rem;color:#64748b;">بحث مباشر على السيرفر + مراجعة وثائق KYC ونقل الإقامة + استعادة الحسابات</div></div>' +
                '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                    '<input id="svLiveMemSearch" type="text" value="' + esc(q || '') + '" placeholder="ابحث بالكود أو الهاتف أو الاسم..." class="form-control" style="width:min(100%,240px);">' +
                    '<button type="button" class="btn btn-primary" onclick="loadMembers(document.getElementById(\'svLiveMemSearch\').value)">🔎 بحث سيرفري</button>' +
                    '<button type="button" class="btn btn-outline" onclick="if (typeof openAdminNetworkTree === \'function\') openAdminNetworkTree(0)">🌳 عرض الشجرة (دوائر)</button>' +
                    '<button type="button" class="btn btn-outline" onclick="openSovereignOpsCenter(\'root0\')">👑 تأسيس قائد تحت #0</button>' +
                '</div>' +
            '</div>' +
            '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                '<table class="data-table"><thead><tr><th>الكود</th><th>الاسم</th><th>الهاتف / الدولة</th><th>الراعي</th><th>المحفظة ($)</th><th>حالة KYC / نقل دولة</th><th>الحالة</th><th>إجراءات حية</th></tr></thead><tbody>' +
                (list.length === 0 ? '<tr><td colspan="8" class="empty-state">لا يوجد أعضاء مطابقون في قاعدة البيانات الحية حالياً</td></tr>' : list.map(function (m) {
                        const mv = m.pending_residency_move;
                        return '<tr>' +
                            '<td data-label="الكود"><b>#' + Number(m.member_code) + '</b></td>' +
                            '<td data-label="الاسم"><b>' + esc(m.full_name) + '</b><br><small style="color:#64748b;">' + esc(m.email || '') + '</small></td>' +
                            '<td data-label="الهاتف / الدولة">' + esc(m.phone) + ' • <b>' + esc(m.country_code) + '</b></td>' +
                            '<td data-label="الراعي">#' + Number(m.sponsor_code || 0) + '</td>' +
                            '<td data-label="المحفظة ($)"><b>$' + fmt2(m.wallet_balance_usd) + '</b></td>' +
                            '<td data-label="حالة KYC / نقل دولة">' +
                                '<span class="badge ' + (m.kyc_status === 'verified' ? 'badge-success' : m.kyc_status === 'pending' ? 'badge-warning' : 'badge-danger') + '">' + esc(m.kyc_status) + '</span>' +
                                (mv && mv.status === 'pending_review' ? '<div style="font-size:0.72rem;color:#b45309;font-weight:800;margin-top:3px;">✈️ طلب نقل إقامة إلى ' + esc(mv.target_country_code) + '</div>' : '') +
                            '</td>' +
                            '<td data-label="الحالة">' + (m.is_tombstone_banned ? '<span class="badge badge-danger">محظور Tombstone</span>' : '<span class="badge badge-success">نشط</span>') + '</td>' +
                            '<td data-label="إجراءات حية"><div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                                '<button type="button" class="btn-sm btn-outline" onclick="if (typeof openAdminNetworkTree === \'function\') openAdminNetworkTree(' + Number(m.member_code) + ')">🌳 شجرته</button>' +
                                '<button type="button" class="btn-sm btn-primary" onclick="svOpenLiveKycModal(\'' + esc(m.id) + '\')">🪪 فحص الهوية</button>' +
                                '<button type="button" class="btn-sm btn-warning" onclick="svOpenUserPasswordResetModal(\'member\',\'#' + m.member_code + '\')">🔑 كلمة مرور</button>' +
                                '<button type="button" class="btn-sm ' + (m.is_tombstone_banned ? 'btn-success' : 'btn-danger') + '" onclick="svToggleMemberBan(\'' + m.id + '\',' + (!m.is_tombstone_banned) + ')">' + (m.is_tombstone_banned ? 'فك الحظر' : 'حظر') + '</button>' +
                            '</div></td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        window.svOpenLiveKycModal = function (mOrId) {
            const m = (typeof mOrId === 'string') ? _LIVE_MEMBERS_MAP.get(mOrId) : mOrId;
            if (!m) { toast('تعذر العثور على بيانات العضو في الذاكرة المحلية — أعد البحث.', true); return; }
            const ks = m.kyc_submission || {};
            const mv = m.pending_residency_move || null;
            const kycMediaHtml = ks.document_redacted
                ? '<div style="margin-top:8px;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:0.8rem;font-weight:700;">🔒 مستند الهوية محجوب عن هذا الدور الإداري (يتطلب صلاحية kyc_reviewer أو compliance_auditor أو المؤسس).</div>'
                : (ks.document_preview ? '<div style="margin-top:8px;">' + renderAdmThumb(ks.document_preview, '🪪 وثيقة الهوية — ' + esc(m.full_name)) + '</div>' : '');
            const mvMediaHtml = mv
                ? (mv.document_redacted
                    ? '<div style="margin:6px 0;padding:8px 10px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:0.78rem;font-weight:700;">🔒 مستند الإقامة محجوب لحماية الصلاحيات (KYC RBAC).</div>'
                    : (mv.document_preview ? '<div style="margin:8px 0;">' + renderAdmThumb(mv.document_preview, '✈️ مستند الإقامة — ' + esc(mv.target_country_code)) + '</div>' : ''))
                : '';

            openStage7Modal(
                '🪪 فحص وتوثيق هوية العضو #' + m.member_code + ' (' + esc(m.full_name) + ')',
                '<div style="display:grid;gap:12px;">' +
                    '<div style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px;border-radius:10px;font-size:0.86rem;">' +
                        '<div><b>الاسم المسجل بالحساب:</b> ' + esc(m.full_name) + ' • <b>الهاتف:</b> ' + esc(m.phone) + '</div>' +
                        '<div><b>الاسم القانوني المرفوع:</b> ' + esc(ks.legal_full_name || 'لم يُرفع بعد') + ' • <b>المستند:</b> ' + esc(ks.document_type || '—') + ' (' + esc(ks.document_number || m.kyc_docs_enc_ref || '—') + ')</div>' +
                        kycMediaHtml +
                    '</div>' +
                    '<input id="svKycRevNote" type="text" placeholder="ملاحظة للمشترك (مثلاً: تم التحقق من تطابق الاسم الرباعي)" class="form-control">' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<button type="button" class="btn btn-primary" onclick="svDecideLiveKyc(\'' + m.id + '\',\'kyc\',\'verified\')">✅ اعتماد وتوثيق الهوية (KYC)</button>' +
                        '<button type="button" class="btn btn-danger" onclick="svDecideLiveKyc(\'' + m.id + '\',\'kyc\',\'rejected\')">❌ رفض المستند مع إرسال السبب</button>' +
                    '</div>' +
                    (mv && mv.status === 'pending_review'
                        ? '<div style="background:#fffbeb;border:1.5px solid #f59e0b;padding:12px;border-radius:10px;">' +
                            '<div style="font-weight:900;color:#92400e;margin-bottom:6px;">✈️ طلب نقل دولة الإقامة إلى (' + esc(mv.target_country_code) + ') — يسري مطلع الشهر المحاسبي الجديد</div>' +
                            '<div style="font-size:0.82rem;margin-bottom:6px;">رقم الإقامة: ' + esc(mv.document_number || '') + '</div>' +
                            mvMediaHtml +
                            '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn-sm btn-success" onclick="svDecideLiveKyc(\'' + m.id + '\',\'residency_move\',\'verified\')">✅ اعتماد نقل الدولة مطلع الشهر القادم</button><button type="button" class="btn-sm btn-danger" onclick="svDecideLiveKyc(\'' + m.id + '\',\'residency_move\',\'rejected\')">❌ رفض طلب النقل</button></div>' +
                          '</div>'
                        : '') +
                '</div>',
                '620px'
            );
        };

        window.svDecideLiveKyc = async function (memberId, rType, dec) {
            try {
                const notes = (document.getElementById('svKycRevNote') || {}).value || '';
                await window.SAWYAN.API.adminReviewKycOrResidency({ memberId: memberId, reviewType: rType, decision: dec, notes: notes });
                window.closeStage7Modal();
                toast('تم حفظ قرار الفحص وإشعار العضو فوراً.', false);
                await window.loadMembers();
            } catch (err) { toast(err.message, true); }
        };

        window.svToggleMemberBan = async function (memberId, ban) {
            try {
                await window.SAWYAN.API.adminOperationalDecision({ domain: 'member_tombstone', recordId: memberId, decision: ban ? 'ban' : 'unban' });
                toast(ban ? 'تم حظر الحساب (Tombstone).' : 'تم فك الحظر.', false);
                await window.loadMembers();
            } catch (err) { toast(err.message, true); }
        };

        // Override Merchants Screen with Live 3-Axis Lifecycle Filter + Contract Editor + Bank Top-Up
        window.loadMerchants = async function (q, filterKey) {
            const page = document.getElementById('merchantsPage');
            if (!page) return;
            if (filterKey !== undefined) _activeMerchantFilter = filterKey;
            const [res, proofsRes] = await Promise.all([
                window.SAWYAN.API.adminSearchAndReplyOps({ action: 'search', entity: 'merchants', query: q || '' }),
                window.SAWYAN.API.adminSearchAndReplyOps({ action: 'search', entity: 'bank_topup_proofs' })
            ]);
            const allList = res.results || [];
            const proofs = proofsRes.results || [];
            _LIVE_MERCHANTS_MAP.clear();
            allList.forEach(function (m) { if (m && m.id) _LIVE_MERCHANTS_MAP.set(String(m.id), m); });
            const list = allList.filter(function (m) { return matchMerchantFilter(m, _activeMerchantFilter); });
            const filterDefs = [
                ['all', 'الكل'],
                ['active_store', '🟢 ظاهر بالستور والرادار'],
                ['draft_incomplete', '⚠️ بانتظار استكمال/تصحيح'],
                ['unfunded', '💳 معتمد بلا تمويل'],
                ['warnings', '🟡 إنذار رصيد (30%/20%)'],
                ['isolated_fifo', '🔴 معزول/مهلة FIFO'],
                ['locked', '🔒 قفل تام'],
                ['compliance_alerts', '⚖️ تنبيهات/شكاوى/تلاعب'],
                ['paused', '⏸️ إجازة/إيقاف'],
                ['suspended_banned', '🚫 معلق/محظور/مرفوض']
            ];
            const filterBarHtml = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' + filterDefs.map(function (fd) {
                const cnt = allList.filter(function (m) { return matchMerchantFilter(m, fd[0]); }).length;
                const active = _activeMerchantFilter === fd[0];
                return '<button type="button" data-mer-filter="' + fd[0] + '" onclick="loadMerchants(document.getElementById(\'svLiveMerSearch\').value,\'' + fd[0] + '\')" style="padding:5px 11px;border-radius:999px;font-size:0.76rem;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;border:1.5px solid ' + (active ? '#0f766e' : '#cbd5e1') + ';background:' + (active ? '#0f766e' : '#ffffff') + ';color:' + (active ? '#ffffff' : '#334155') + ';">' + esc(fd[1]) + ' (' + cnt + ')</button>';
            }).join('') + '</div>';

            page.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">' +
                    '<div><h2 style="margin:0;">🏪 إدارة التجار والمحاور الثلاثة والشحن البنكي (' + list.length + '/' + allList.length + ')</h2><div style="font-size:0.8rem;color:#64748b;">محور التأهيل • المحور المالي (30/20/10% + D4 + FIFO) • محور الحوكمة والامتثال</div></div>' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<input id="svLiveMerSearch" type="text" value="' + esc(q || '') + '" placeholder="ابحث بكود التاجر أو الاسم أو الهاتف..." class="form-control" style="width:min(100%,240px);">' +
                        '<button type="button" class="btn btn-primary" onclick="loadMerchants(document.getElementById(\'svLiveMerSearch\').value)">🔎 بحث سيرفري</button>' +
                    '</div>' +
                '</div>' +
                filterBarHtml +
                (proofs.length > 0
                    ? '<div style="background:#fffbeb;border:1.5px solid #f59e0b;border-radius:14px;padding:14px;margin-bottom:14px;">' +
                        '<h3 style="margin:0 0 8px 0;font-size:0.95rem;color:#92400e;">🏦 إشعارات تحويل بنكي لشحن رصيد التجار بانتظار المطابقة (' + proofs.length + ')</h3>' +
                        proofs.map(function (pr) {
                            const p = pr.payload || {};
                            const isDone = pr.event_name === 'MerchantBankTopupProofProcessed';
                            const prThumb = renderAdmThumb(p.receipt_image_data, '🧾 إيصال شحن بنكي ' + esc(p.bank_ref || ''));
                            return '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;background:#fff;padding:10px;border-radius:10px;border:1px solid ' + (isDone ? '#86efac' : '#fcd34d') + ';margin-bottom:6px;">' +
                                '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' +
                                    prThumb +
                                    '<div><b>' + esc(p.business_name) + ' (' + esc(p.merchant_code) + ')</b> • المبلغ: <b>' + fmt2(p.amount_local) + '</b> • مرجع البنك: <code>' + esc(p.bank_ref) + '</code>' + (p.receipt_note ? '<div style="font-size:0.75rem;color:#64748b;">' + esc(p.receipt_note) + '</div>' : '') + '</div>' +
                                '</div>' +
                                (isDone
                                    ? '<span class="badge badge-success">✅ تمت المطابقة والشحن</span>'
                                    : '<button type="button" class="btn-sm btn-success" onclick="svApproveBankTopup(\'' + esc(p.merchant_id || pr.merchant_id) + '\',' + Number(p.amount_local) + ',\'' + esc(p.bank_ref) + '\',\'' + pr.id + '\')">✅ مطابقة وشحن الرصيد + فاتورة B2B</button>') +
                            '</div>';
                        }).join('') +
                      '</div>'
                    : '') +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                    '<table class="data-table"><thead><tr><th>كود التاجر</th><th>المنشأة</th><th>الدولة / الفئة</th><th>نسبة العمولة</th><th>رصيد الشحن 2101</th><th>سقف D4 / الصافي الحر</th><th>الحالة الثلاثية</th><th>إجراءات التعاقد والشحن</th></tr></thead><tbody>' +
                    (list.length === 0 ? '<tr><td colspan="8" class="empty-state">لا يوجد تجار مطابقون لهذا التصنيف حالياً</td></tr>' : list.map(function (m) {
                        const logoThumb = renderAdmThumb(m.logo_url, '🏪 شعار ' + esc(m.business_name));
                        const cashBal = Number(m.actual_cash_balance || 0);
                        const holdBal = Number(m.soft_hold_balance || 0);
                        const credLim = Number(m.credit_limit || 0);
                        const freeBal = cashBal - holdBal + credLim;
                        const curr = esc(m.currency_code || '');
                        const cashColor = cashBal < 0 ? '#dc2626' : (cashBal === 0 ? '#b45309' : '#059669');
                        const freeColor = freeBal < 0 ? '#dc2626' : (freeBal === 0 ? '#b45309' : '#059669');
                        const lc = m.lifecycle || {};
                        const onb = m.onboarding_status || lc.onboarding_status || 'approved';
                        const fin = lc.financial_status || 'healthy_green';
                        const gov = m.governance_status || lc.governance_status || 'good_standing';
                        const vc = lc.violation_counters || {};
                        const statusHtml = '<div style="display:flex;flex-direction:column;gap:4px;">' +
                            pillHtml(_ONBOARD_LABELS[onb]) +
                            pillHtml(_FIN_LABELS[fin]) +
                            pillHtml(_GOV_LABELS[gov]) +
                            (Number(vc.open_complaints_count || 0) > 0 ? '<span style="font-size:0.7rem;color:#b91c1c;font-weight:800;">📣 ' + Number(vc.open_complaints_count) + ' شكوى مفتوحة</span>' : '') +
                            (Number(vc.verified_price_gouging_count || 0) > 0 ? '<span style="font-size:0.7rem;color:#991b1b;font-weight:800;">🚨 تلاعب أسعار: ' + Number(vc.verified_price_gouging_count) + '/3</span>' : '') +
                        '</div>';
                        return '<tr>' +
                            '<td data-label="كود التاجر"><b>' + esc(m.merchant_code) + '</b></td>' +
                            '<td data-label="المنشأة"><div style="display:flex;align-items:center;gap:8px;">' + logoThumb + '<div><b>' + esc(m.business_name) + '</b><br><small style="color:#64748b;">' + esc(m.phone) + '</small></div></div></td>' +
                            '<td data-label="الدولة / الفئة">' + esc(m.country_code) + ' • ' + esc(m.category) + '</td>' +
                            '<td data-label="نسبة العمولة"><b>' + Number(m.deduction_percent) + '%</b></td>' +
                            '<td data-label="رصيد الشحن 2101">' +
                                '<b style="color:' + cashColor + ';" dir="ltr">' + fmt2(cashBal) + ' ' + curr + '</b>' +
                                (cashBal < 0 ? ' <span class="badge badge-danger" style="font-size:0.68rem;">مديون</span>' : '') +
                                (holdBal > 0 ? '<div style="font-size:0.72rem;color:#b45309;font-weight:700;margin-top:2px;">⏳ محجوز: <span dir="ltr">' + fmt2(holdBal) + ' ' + curr + '</span></div>' : '') +
                            '</td>' +
                            '<td data-label="سقف D4 / الصافي الحر">' +
                                '<div style="font-size:0.8rem;color:' + (credLim > 0 ? '#1d4ed8' : '#475569') + ';font-weight:800;">سقف D4: <span dir="ltr">' + fmt2(credLim) + ' ' + curr + '</span></div>' +
                                '<div style="font-size:0.76rem;color:' + freeColor + ';font-weight:900;margin-top:2px;">الصافي الحر: <span dir="ltr">' + fmt2(freeBal) + ' ' + curr + '</span></div>' +
                            '</td>' +
                            '<td data-label="الحالة الثلاثية">' + statusHtml + (Number(m.fifo_queue_count || 0) > 0 ? '<div style="font-size:0.72rem;color:#b91c1c;font-weight:800;margin-top:3px;">⏸️ ' + Number(m.fifo_queue_count) + ' فاتورة FIFO (عمولة ' + fmt2(m.fifo_required_comm_local || 0) + ' ' + curr + ')</div>' : '') + '</td>' +
                            '<td data-label="إجراءات التعاقد والشحن"><div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                                '<button type="button" class="btn-sm btn-primary" onclick="svOpenMerchantContractModal(\'' + esc(m.id) + '\')">⚙️ تحرير العقد والحالة والشحن</button>' +
                                '<button type="button" class="btn-sm btn-warning" onclick="svOpenUserPasswordResetModal(\'merchant\',\'' + esc(m.merchant_code) + '\')">🔑 كلمة مرور</button>' +
                            '</div></td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        window.svOpenMerchantContractModal = function (mOrId) {
            const m = (typeof mOrId === 'string') ? _LIVE_MERCHANTS_MAP.get(mOrId) : mOrId;
            if (!m) { toast('تعذر العثور على بيانات المتجر — أعد تحميل القائمة.', true); return; }
            const kDocs = (m.kyc_docs && typeof m.kyc_docs === 'object') ? m.kyc_docs : {};
            const docLabels = {
                commercial_reg: '📄 السجل التجاري',
                tax_card: '🧾 البطاقة الضريبية',
                owner_id: '🪪 هوية المالك',
                store_license: '🏛️ رخصة المحل',
                storefront_photo: '🏪 صورة الواجهة'
            };
            const galleryArr = Array.isArray(m.images) ? m.images : [];
            const mediaItems = [];
            if (m.logo_url) mediaItems.push('<div style="text-align:center;"><div style="font-size:0.72rem;font-weight:700;margin-bottom:3px;">الشعار</div>' + renderAdmThumb(m.logo_url, 'شعار ' + esc(m.business_name)) + '</div>');
            if (m.cover_image_url) mediaItems.push('<div style="text-align:center;"><div style="font-size:0.72rem;font-weight:700;margin-bottom:3px;">الغلاف</div>' + renderAdmThumb(m.cover_image_url, 'غلاف ' + esc(m.business_name)) + '</div>');
            galleryArr.forEach(function (gUrl, idx) {
                if (gUrl) mediaItems.push('<div style="text-align:center;"><div style="font-size:0.72rem;font-weight:700;margin-bottom:3px;">صورة #' + (idx + 1) + '</div>' + renderAdmThumb(gUrl, 'معرض ' + esc(m.business_name)) + '</div>');
            });
            Object.keys(kDocs).forEach(function (kKey) {
                if (kDocs[kKey]) mediaItems.push('<div style="text-align:center;"><div style="font-size:0.72rem;font-weight:700;margin-bottom:3px;">' + (docLabels[kKey] || esc(kKey)) + '</div>' + renderAdmThumb(kDocs[kKey], (docLabels[kKey] || esc(kKey)) + ' — ' + esc(m.business_name)) + '</div>');
            });

            const cashBal = Number(m.actual_cash_balance || 0);
            const holdBal = Number(m.soft_hold_balance || 0);
            const credLim = Number(m.credit_limit || 0);
            const freeBal = cashBal - holdBal + credLim;
            const curr = esc(m.currency_code || '');
            const cashBorder = cashBal < 0 ? '#fca5a5' : (cashBal === 0 ? '#fcd34d' : '#6ee7b7');
            const cashBg = cashBal < 0 ? '#fef2f2' : (cashBal === 0 ? '#fffbeb' : '#ecfdf5');
            const cashClr = cashBal < 0 ? '#dc2626' : (cashBal === 0 ? '#b45309' : '#059669');
            const freeBorder = freeBal < 0 ? '#fca5a5' : (freeBal === 0 ? '#fcd34d' : '#6ee7b7');
            const freeBg = freeBal < 0 ? '#fef2f2' : (freeBal === 0 ? '#fffbeb' : '#f0fdf4');
            const freeClr = freeBal < 0 ? '#dc2626' : (freeBal === 0 ? '#b45309' : '#047857');

            const lc = m.lifecycle || {};
            const acc = lc.effective_access || {};
            const vc = lc.violation_counters || {};
            const onb = m.onboarding_status || lc.onboarding_status || 'approved';
            const fin = lc.financial_status || 'healthy_green';
            const gov = m.governance_status || lc.governance_status || 'good_standing';
            const cutoffStr = m.deferred_settlement_cutoff_time ? String(m.deferred_settlement_cutoff_time).slice(0, 5) : '';
            const qCapVal = (m.unsecured_queue_cap_override !== null && m.unsecured_queue_cap_override !== undefined) ? String(m.unsecured_queue_cap_override) : '';
            const isoPctVal = (m.isolate_pct_override !== null && m.isolate_pct_override !== undefined) ? String(m.isolate_pct_override) : '';
            const d4CycOv = (m.d4_cycle_days_override !== null && m.d4_cycle_days_override !== undefined) ? String(m.d4_cycle_days_override) : '';
            const d4GrOv = (m.d4_grace_hours_override !== null && m.d4_grace_hours_override !== undefined) ? String(m.d4_grace_hours_override) : '';
            const d4DisTime = Boolean(m.d4_time_trigger_disabled || lc.d4_time_trigger_disabled);
            const d4DueStmt = Number(lc.d4_statement_due_local || 0);
            const d4OpenComm = Number(lc.d4_open_cycle_comm_local || 0);
            const d4SummaryHtml = credLim > 0 ? (
                '<div style="background:#eff6ff;border:1.5px solid #60a5fa;border-radius:10px;padding:10px 12px;font-size:0.79rem;color:#1e3a8a;line-height:1.6;">' +
                    '<div style="font-weight:900;margin-bottom:4px;">⏱️ حالة دورة الائتمان D4 السارية: ' +
                        (d4DisTime ? '<span style="color:#b45309;">معطّل الإغلاق الزمني (سقف مبلغ فقط)</span>' : ('كل <b>' + Number(lc.d4_effective_cycle_days || 1) + '</b> يوم • إغلاق <b>' + esc(String(lc.d4_effective_cutoff_time || '23:59:00').slice(0, 5)) + '</b> • مهلة سداد <b>' + Number(lc.d4_effective_grace_hours ?? 2) + ' ساعة</b>')) +
                    '</div>' +
                    '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
                        '<span>🧾 واجب عن دورة مغلقة: <b dir="ltr">' + fmt2(d4DueStmt) + ' ' + curr + '</b></span>' +
                        '<span>📊 جاري بالدورة المفتوحة: <b dir="ltr">' + fmt2(d4OpenComm) + ' ' + curr + '</b></span>' +
                        (lc.d4_cycle_close_at ? '<span>🔚 الإغلاق: <b>' + esc(new Date(lc.d4_cycle_close_at).toLocaleString('ar-EG')) + '</b></span>' : '') +
                        (lc.d4_grace_due_at ? '<span>⏳ نهاية السماح: <b>' + esc(new Date(lc.d4_grace_due_at).toLocaleString('ar-EG')) + '</b></span>' : '') +
                        (lc.d4_in_grace_window ? '<span class="badge badge-warning">داخل مهلة السماح الساعية</span>' : '') +
                        (lc.cutoff_breached ? '<span class="badge badge-danger">متجاوز نهاية السماح — مقفل ومعزول</span>' : '') +
                    '</div>' +
                '</div>'
            ) : '';

            openStage7Modal(
                '⚙️ إدارة عقد التاجر والمحاور الثلاثة: ' + esc(m.business_name) + ' (' + esc(m.merchant_code) + ')',
                '<div style="display:grid;gap:12px;">' +
                    '<div style="background:#0f172a;color:#f8fafc;border-radius:12px;padding:10px 14px;display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;">' +
                        '<div style="font-size:0.82rem;font-weight:900;">⚡ النتيجة التشغيلية الآن: ' +
                            '<span style="margin-inline:6px;">' + (acc.is_visible_on_radar ? '🟢 ظاهر بالستور والرادار' : '🔴 مخفي عن الستور والرادار') + '</span> • ' +
                            '<span style="margin-inline:6px;">' + (acc.can_accept_pos ? '🟢 توثيق الفواتير مفتوح' : '🔒 توثيق الفواتير مغلق') + '</span> • ' +
                            '<span style="margin-inline:6px;">' + (acc.can_login_portal ? '🟢 دخول اللوحة: ' + esc(acc.portal_access_mode || 'full') : '🚫 الدخول محظور') + '</span>' +
                        '</div>' +
                        ((lc.hide_reason_ar || lc.pos_lock_reason_ar)
                            ? '<div style="width:100%;font-size:0.75rem;color:#fde68a;">' + esc(lc.hide_reason_ar || lc.pos_lock_reason_ar) + '</div>'
                            : '') +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr));gap:8px;">' +
                        '<div style="background:' + cashBg + ';border:1.5px solid ' + cashBorder + ';border-radius:10px;padding:10px 12px;">' +
                            '<div style="font-size:0.74rem;color:#475569;font-weight:800;">💵 رصيد الشحن الفعلي (2101)</div>' +
                            '<div style="font-size:1.08rem;font-weight:900;color:' + cashClr + ';margin-top:3px;" dir="ltr">' + fmt2(cashBal) + ' ' + curr + '</div>' +
                            (cashBal < 0 ? '<span class="badge badge-danger" style="font-size:0.68rem;margin-top:3px;display:inline-block;">مديون (عجز كاش)</span>' : '') +
                        '</div>' +
                        '<div style="background:#eff6ff;border:1.5px solid #93c5fd;border-radius:10px;padding:10px 12px;">' +
                            '<div style="font-size:0.74rem;color:#1e40af;font-weight:800;">💳 الحد الائتماني الاستثنائي (D4)</div>' +
                            '<div style="font-size:1.08rem;font-weight:900;color:' + (credLim > 0 ? '#1d4ed8' : '#475569') + ';margin-top:3px;" dir="ltr">' + fmt2(credLim) + ' ' + curr + '</div>' +
                            '<div style="font-size:0.68rem;color:#475569;margin-top:2px;">الأصل 0 ما لم تُقر الإدارة استثناءً</div>' +
                        '</div>' +
                        '<div style="background:' + freeBg + ';border:1.5px solid ' + freeBorder + ';border-radius:10px;padding:10px 12px;">' +
                            '<div style="font-size:0.74rem;color:#0f172a;font-weight:800;">🛡️ الصافي الحر المتاح للتغطية</div>' +
                            '<div style="font-size:1.08rem;font-weight:900;color:' + freeClr + ';margin-top:3px;" dir="ltr">' + fmt2(freeBal) + ' ' + curr + '</div>' +
                            '<div style="font-size:0.68rem;color:#475569;margin-top:2px;">' + pillHtml(_FIN_LABELS[fin]) + '</div>' +
                            (holdBal > 0 ? '<div style="font-size:0.72rem;color:#b45309;font-weight:800;margin-top:3px;">⏳ محجوز للفواتير المعلقة: <span dir="ltr">' + fmt2(holdBal) + ' ' + curr + '</span></div>' : '') +
                        '</div>' +
                    '</div>' +
                    (freeBal < 0
                        ? '<div style="background:#fef2f2;border:1.5px solid #f87171;color:#991b1b;padding:10px 12px;border-radius:10px;font-size:0.82rem;font-weight:700;line-height:1.6;">🔴 <b>تنبيه مديونية مفتوحة:</b> هذا التاجر لديه عجز صافٍ قدره <b dir="ltr">' + fmt2(freeBal) + ' ' + curr + '</b> وسيظل معزولاً تلقائياً لحين سداد المديونية بالشحن البنكي أو اعتماد حد ائتماني (D4) يغطي العجز.</div>'
                        : '') +
                    (Number(m.fifo_queue_count || 0) > 0
                        ? '<div style="background:#fef2f2;border:1.5px solid #fca5a5;color:#991b1b;padding:10px 12px;border-radius:10px;font-size:0.82rem;font-weight:700;line-height:1.6;">⏸️ لدى هذا التاجر <b>' + Number(m.fifo_queue_count) + '</b> فاتورة محجوزة في طابور الشحن FIFO (عمولة مطلوبة: <b>' + fmt2(m.fifo_required_comm_local || 0) + ' ' + curr + '</b>). بمجرد شحن الرصيد أو منح سقف ائتمان D4 كافٍ سيتم تحريرها تلقائياً وتغذية صندوق العضو ورفع العزل فوراً.</div>'
                        : '') +
                    d4SummaryHtml +
                    '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;display:flex;gap:12px;flex-wrap:wrap;font-size:0.78rem;font-weight:700;color:#334155;">' +
                        '<span>⏳ متأخرة &gt;48س (30ي): <b>' + Number(vc.escalated_pending_30d || 0) + '</b>/' + Number(vc.restrict_escalated_tx_30d || 5) + '</span>' +
                        '<span>⚖️ نزاعات خاسرة (30ي): <b>' + Number(vc.lost_disputes_30d || 0) + '</b>/' + Number(vc.restrict_lost_disputes_30d || 3) + '</span>' +
                        '<span>🚨 بلاغات تلاعب أسعار: <b>' + Number(vc.verified_price_gouging_count || 0) + '</b>/3</span>' +
                        '<span>📣 شكاوى موثقة (30ي): <b>' + Number(vc.verified_complaints_30d || 0) + '</b>/' + Number(vc.restrict_verified_complaints_30d || 3) + ' (مفتوحة: ' + Number(vc.open_complaints_count || 0) + ')</span>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:10px;">' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">المحور 1 — حالة التأهيل والأوراق</label><select id="svMerOnboarding" class="form-control">' +
                            '<option value="draft_incomplete"' + (onb === 'draft_incomplete' ? ' selected' : '') + '>⚠️ مسودة غير مكتملة</option>' +
                            '<option value="needs_correction"' + (onb === 'needs_correction' ? ' selected' : '') + '>✏️ مطلوب استيفاء/تصحيح</option>' +
                            '<option value="approved"' + (onb === 'approved' ? ' selected' : '') + '>✅ مؤهل ومعتمد بياناتياً</option>' +
                            '<option value="rejected"' + (onb === 'rejected' ? ' selected' : '') + '>🚫 مرفوض</option>' +
                        '</select></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">ملاحظات التأهيل للتاجر</label><input id="svMerOnboardingNote" type="text" value="' + esc(m.onboarding_notes || '') + '" placeholder="تظهر للتاجر عند طلب التصحيح..." class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">المحور 3 — حالة الحوكمة والامتثال</label><select id="svMerGovernance" class="form-control">' +
                            '<option value="good_standing"' + (gov === 'good_standing' ? ' selected' : '') + '>🟢 سليم ممتثل</option>' +
                            '<option value="probation_warning"' + (gov === 'probation_warning' ? ' selected' : '') + '>🟡 تحت المراقبة والإنذار (د1)</option>' +
                            '<option value="restricted_no_reject"' + (gov === 'restricted_no_reject' ? ' selected' : '') + '>🟠 تقييد د2 (ممنوع من الرفض ومخفي)</option>' +
                            '<option value="paused_by_merchant"' + (gov === 'paused_by_merchant' ? ' selected' : '') + '>⏸️ إجازة بطلب التاجر</option>' +
                            '<option value="paused_by_admin"' + (gov === 'paused_by_admin' ? ' selected' : '') + '>⏸️ موقوف إدارياً</option>' +
                            '<option value="suspended_compliance"' + (gov === 'suspended_compliance' ? ' selected' : '') + '>🔴 تعليق امتثال (Maker-Checker)</option>' +
                            '<option value="banned_permanent"' + (gov === 'banned_permanent' ? ' selected' : '') + '>🚫 حظر نهائي D3 (Maker-Checker)</option>' +
                        '</select></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">سبب الحوكمة / القرار (للتدقيق)</label><input id="svMerGovReason" type="text" value="' + esc(m.governance_reason || 'تحديث تعاقدي وحوكمة معتمدة') + '" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">نسبة عمولة سويًا (%)</label><input id="svMerPct" type="number" step="0.5" min="0.5" max="95" value="' + Number(m.deduction_percent || 10) + '" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">التصنيف التجاري</label><input id="svMerCat" type="text" value="' + esc(m.category || 'supermarket') + '" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">سقف الائتمان D4 (' + curr + ') [Maker-Checker]</label><input id="svMerCredit" type="number" step="100" min="0" value="' + Number(m.credit_limit || 0) + '" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">استثناء دورة D4 أيام (فارغ=العام ' + Number(lc.d4_effective_cycle_days || 1) + ')</label><input id="svMerD4CycleDays" type="number" min="1" max="90" step="1" value="' + esc(d4CycOv) + '" placeholder="الإعداد العام" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">استثناء وقت إغلاق D4 (فارغ=العام ' + esc(String(lc.d4_effective_cutoff_time || '23:59:00').slice(0, 5)) + ')</label><input id="svMerCutoffTime" type="time" value="' + esc(cutoffStr) + '" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">استثناء مهلة سداد D4 ساعة (فارغ=العام ' + Number(lc.d4_effective_grace_hours ?? 2) + ')</label><input id="svMerD4GraceHours" type="number" min="0" max="168" step="0.5" value="' + esc(d4GrOv) + '" placeholder="الإعداد العام" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">استثناء طابور ما بعد النفاد (فارغ=العام ' + Number(lc.effective_queue_cap ?? 3) + ')</label><input id="svMerQueueCapOverride" type="number" min="0" step="1" value="' + esc(qCapVal) + '" placeholder="الإعداد العام" class="form-control"></div>' +
                        '<div><label style="font-size:0.78rem;font-weight:800;">استثناء عتبة العزل % (فارغ=العام)</label><input id="svMerIsoPctOverride" type="number" min="0.5" max="99" step="0.5" value="' + esc(isoPctVal) + '" placeholder="الإعداد العام" class="form-control"></div>' +
                        '<div style="grid-column:1 / -1;display:flex;align-items:center;gap:8px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:8px 10px;">' +
                            '<input id="svMerD4DisableTime" type="checkbox"' + (d4DisTime ? ' checked' : '') + ' style="width:16px;height:16px;">' +
                            '<label for="svMerD4DisableTime" style="margin:0;font-size:0.78rem;font-weight:800;cursor:pointer;">تعطيل الإغلاق الزمني D4 لهذا التاجر (العمل بسقف المبلغ فقط دون مهلة يومية/ساعية)</label>' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:0.74rem;color:#64748b;">ℹ️ تعديل سقف الائتمان D4 أو التعليق الامتثالي/الحظر النهائي يمر عبر طابور Maker–Checker لغير المؤسس، وينفذ فوراً للمؤسس السيادي.</div>' +
                    '<button type="button" id="svSaveMerContractBtn" class="btn btn-primary" onclick="svSaveMerchantContract(\'' + m.id + '\')">💾 حفظ وتطبيق الحالة الثلاثية والعقد</button>' +
                    '<div style="background:#f8fafc;border:1px solid #cbd5e1;padding:12px;border-radius:10px;">' +
                        '<div style="font-weight:900;color:#0f172a;margin-bottom:6px;">🖼️ صور المنشأة ووثائق التحقق الرسمية</div>' +
                        '<div style="font-size:0.78rem;color:#475569;margin-bottom:8px;">السجل التجاري: <code>' + esc(m.commercial_reg_no || m.kyc_docs?.commercial_reg_no || '—') + '</code> • الرقم الضريبي: <code>' + esc(m.tax_id || m.tax_registration_no || '—') + '</code></div>' +
                        (mediaItems.length > 0
                            ? '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start;">' + mediaItems.join('') + '</div>'
                            : '<div style="font-size:0.8rem;color:#64748b;">لا توجد صور أو وثائق مرفوعة لهذا المتجر بعد.</div>') +
                    '</div>' +
                    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:4px 0;">' +
                    '<div style="background:#ecfdf5;border:1px solid #6ee7b7;padding:12px;border-radius:10px;">' +
                        '<div style="font-weight:900;color:#065f46;margin-bottom:8px;">🏦 شحن رصيد التاجر المسبق (2101) مقابل حوالة بنكية موثقة (' + esc(m.currency_code) + ')</div>' +
                        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:8px;">' +
                            '<input id="svMerTopupAmt" type="number" step="50" placeholder="المبلغ بالعملة المحلية" class="form-control">' +
                            '<input id="svMerTopupRef" type="text" placeholder="رقم مرجع الإيداع البنكي" class="form-control">' +
                            '<button type="button" class="btn btn-primary" onclick="svApproveBankTopup(\'' + m.id + '\',document.getElementById(\'svMerTopupAmt\').value,document.getElementById(\'svMerTopupRef\').value,null)">شحن الآن</button>' +
                        '</div>' +
                    '</div>' +
                '</div>',
                '760px'
            );
        };

        window.svSaveMerchantContract = async function (merchantId) {
            try {
                const qOvRaw = document.getElementById('svMerQueueCapOverride').value.trim();
                const iOvRaw = document.getElementById('svMerIsoPctOverride').value.trim();
                const cutRaw = document.getElementById('svMerCutoffTime').value.trim();
                const cycOvRaw = document.getElementById('svMerD4CycleDays').value.trim();
                const grOvRaw = document.getElementById('svMerD4GraceHours').value.trim();
                const disTimeVal = Boolean(document.getElementById('svMerD4DisableTime')?.checked);
                const res = await window.SAWYAN.API.adminManageMerchantContract({
                    merchantId: merchantId,
                    action: 'update_contract',
                    deductionPercent: Number(document.getElementById('svMerPct').value),
                    category: document.getElementById('svMerCat').value.trim(),
                    creditLimit: Number(document.getElementById('svMerCredit').value || 0),
                    onboardingStatus: document.getElementById('svMerOnboarding').value,
                    onboardingNotes: document.getElementById('svMerOnboardingNote').value.trim(),
                    governanceStatus: document.getElementById('svMerGovernance').value,
                    reason: document.getElementById('svMerGovReason').value.trim() || 'تحديث تعاقدي معتمد من إدارة علاقات التجار',
                    unsecuredQueueCapOverride: qOvRaw === '' ? null : Number(qOvRaw),
                    clearQueueCapOverride: qOvRaw === '',
                    isolatePctOverride: iOvRaw === '' ? null : Number(iOvRaw),
                    clearIsolatePctOverride: iOvRaw === '',
                    deferredSettlementCutoffTime: cutRaw === '' ? null : (cutRaw.length === 5 ? cutRaw + ':00' : cutRaw),
                    clearCutoffTime: cutRaw === '',
                    d4CycleDaysOverride: cycOvRaw === '' ? null : Number(cycOvRaw),
                    clearD4CycleDays: cycOvRaw === '',
                    d4GraceHoursOverride: grOvRaw === '' ? null : Number(grOvRaw),
                    clearD4GraceHours: grOvRaw === '',
                    d4DisableTimeTrigger: disTimeVal
                });
                window.closeStage7Modal();
                if (res && res.pending_maker_checker) {
                    toast('📤 تم إرسال التعديل الحساس لطابور الاعتماد المزدوج Maker–Checker (طلب #' + String(res.request_id || '').slice(0, 8) + ').', false);
                } else {
                    const relCnt = Number(res?.released_fifo_count || 0);
                    toast(relCnt > 0
                        ? ('تم تحديث عقد التاجر وتحرير ' + relCnt + ' فاتورة من طابور FIFO تلقائياً!')
                        : 'تم تحديث الحالة الثلاثية وعقد التاجر بنجاح!', false);
                }
                if (typeof window.refreshSovereignBundle === 'function') await window.refreshSovereignBundle(false);
                await window.loadMerchants((document.getElementById('svLiveMerSearch') || {}).value || '');
            } catch (err) { toast(err.message, true); }
        };

        window.svApproveBankTopup = async function (merchantId, amt, ref, notifId) {
            try {
                await window.SAWYAN.API.adminManageMerchantContract({
                    merchantId: merchantId,
                    action: 'approve_bank_topup',
                    topupAmountLocal: Number(amt),
                    topupBankRef: ref,
                    topupProofNotifId: notifId
                });
                window.closeStage7Modal();
                toast('🏦 تم شحن رصيد التاجر وتوليد القيد المحاسبي وفاتورة B2B بنجاح!', false);
                if (typeof window.refreshSovereignBundle === 'function') await window.refreshSovereignBundle(false);
                await window.loadMerchants();
            } catch (err) { toast(err.message, true); }
        };

        // Override Withdrawals Screen with Live Payout Reference + Atomic Rejection Reversal
        window.loadWithdrawals = async function () {
            const page = document.getElementById('withdrawalsPage');
            if (!page) return;
            const bundle = await window.SAWYAN.API.getAdminSovereignBundle();
            const list = bundle.withdrawals || [];

            page.innerHTML =
                '<div class="page-header"><h2>💸 طلبات سحب أرباح الأعضاء الحية (' + list.length + ')</h2></div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                    '<table class="data-table"><thead><tr><th>العضو</th><th>المبلغ ($)</th><th>التوقيت</th><th>الحالة</th><th>إجراء المحاسب / المؤسس</th></tr></thead><tbody>' +
                    (list.length === 0 ? '<tr><td colspan="5" class="empty-state">لا توجد طلبات سحب مسجلة حالياً</td></tr>' : list.map(function (w) {
                        return '<tr>' +
                            '<td data-label="العضو"><b>' + esc(w.full_name) + ' (#' + Number(w.member_code) + ')</b></td>' +
                            '<td data-label="المبلغ ($)"><b>$' + fmt2(w.amount_usd) + '</b></td>' +
                            '<td data-label="التوقيت">' + esc(String(w.created_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
                            '<td data-label="الحالة"><span class="badge ' + (w.status === 'completed' ? 'badge-success' : w.status === 'rejected' ? 'badge-danger' : 'badge-warning') + '">' + esc(w.status) + '</span></td>' +
                            '<td data-label="إجراء المحاسب / المؤسس">' + (w.status === 'processing_payout'
                                ? '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                                    '<button type="button" class="btn-sm btn-success" onclick="svDecideLiveWithdrawal(\'' + w.id + '\',\'completed\')">✅ تأكيد التحويل بمرجع بنكي</button>' +
                                    '<button type="button" class="btn-sm btn-danger" onclick="svDecideLiveWithdrawal(\'' + w.id + '\',\'rejected\')">❌ رفض وإرجاع 100% للمحفظة</button>' +
                                  '</div>'
                                : '—') + '</td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        window.svDecideLiveWithdrawal = async function (wtxId, dec) {
            try {
                if (dec === 'completed') {
                    const ref = prompt('أدخل رقم مرجع التحويل الفعلي (البنك / InstaPay / المحفظة) — إلزامي ليظهر للعضو:');
                    if (!ref) return;
                    await window.SAWYAN.API.adminDecideWithdrawalV3({ walletTxId: wtxId, decision: 'completed', payoutRef: ref });
                    toast('✅ تم توثيق التحويل وإرسال رقم المرجع للعضو!', false);
                } else {
                    const reason = prompt('أدخل سبب رفض طلب السحب (سيُعكس القيد المحاسبي ويعود المبلغ 100% لمحفظة العضو فوراً):', 'بيانات رقم الحساب المستلم غير صحيحة — يرجى مراجعتها');
                    if (!reason) return;
                    await window.SAWYAN.API.adminDecideWithdrawalV3({ walletTxId: wtxId, decision: 'rejected', rejectReason: reason });
                    toast('↩️ تم رفض الطلب وإعادة كامل المبلغ لمحفظة العضو بقيد عكسي متزن!', false);
                }
                await window.loadWithdrawals();
            } catch (err) { toast(err.message, true); }
        };

        // Override Support Screen with Live Tickets & Recovery Requests
        window.loadSupport = async function (q) {
            const page = document.getElementById('supportPage');
            if (!page) return;
            const res = await window.SAWYAN.API.adminSearchAndReplyOps({ action: 'search', entity: 'support_tickets', query: q || '' });
            const list = res.results || [];

            page.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
                    '<div><h2 style="margin:0;">🎫 تذاكر الدعم الفني واستعادة الحسابات الحية (' + list.length + ')</h2><div style="font-size:0.8rem;color:#64748b;">تستقبل مباشرةً من صفحة اتصل بنا، استعادة كلمة المرور، وبوابتي العضو والتاجر</div></div>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<button type="button" class="btn btn-warning" onclick="svOpenUserPasswordResetModal(\'member\',\'\')">🔑 استعادة كلمة مرور عضو</button>' +
                        '<button type="button" class="btn btn-outline" onclick="svOpenUserPasswordResetModal(\'merchant\',\'\')">🔑 استعادة كلمة مرور تاجر</button>' +
                    '</div>' +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                    '<table class="data-table"><thead><tr><th>المرجع</th><th>المرسل</th><th>التصنيف / الموضوع</th><th>الرسالة والرد</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>' +
                    (list.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد تذاكر دعم مفتوحة حالياً</td></tr>' : list.map(function (t) {
                        return '<tr>' +
                            '<td data-label="المرجع"><code>' + esc(t.ticket_ref) + '</code></td>' +
                            '<td data-label="المرسل"><b>' + esc(t.contact_name || t.requester_type) + '</b><br><small>' + esc(t.contact_phone || t.contact_email || '') + '</small></td>' +
                            '<td data-label="التصنيف / الموضوع"><span class="badge badge-info">' + esc(t.category) + '</span><br><b>' + esc(t.subject || '') + '</b></td>' +
                            '<td data-label="الرسالة والرد" style="max-width:300px;">' + esc(t.message_body || '') + (t.admin_reply ? '<div style="margin-top:4px;padding:6px;background:#ecfdf5;border-radius:6px;color:#065f46;font-size:0.78rem;"><b>رد الإدارة:</b> ' + esc(t.admin_reply) + '</div>' : '') + '</td>' +
                            '<td data-label="الحالة"><span class="badge ' + (t.status === 'closed' ? 'badge-success' : 'badge-warning') + '">' + esc(t.status) + '</span></td>' +
                            '<td data-label="إجراء"><button type="button" class="btn-sm btn-primary" onclick="svReplySupportTicket(\'' + t.id + '\')">💬 رد وإغلاق</button></td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        window.svReplySupportTicket = async function (ticketId) {
            const reply = prompt('اكتب رد الإدارة الرسمي (سيظهر للعضو/التاجر فوراً داخل حسابه):');
            if (!reply) return;
            try {
                await window.SAWYAN.API.adminSearchAndReplyOps({ action: 'reply_support_ticket', recordId: ticketId, replyText: reply, newStatus: 'closed' });
                toast('تم إرسال الرد وإغلاق التذكرة بنجاح!', false);
                await window.loadSupport();
            } catch (err) { toast(err.message, true); }
        };

        // ====================================================================
        // 4. Consolidated Live Overrides for Transactions, Commissions & Disputes
        //    (Loads AFTER admin-screens-demo.js & admin-v3-live-bridge.js)
        // ====================================================================
        let _activeTxnStatusFilter = 'all';
        let _lastLiveTxRows = [];

        window.svSetAdminTxnFilter = function (st) {
            _activeTxnStatusFilter = st || 'all';
            window.loadTransactions((document.getElementById('svLiveTxnSearch') || {}).value || '', _activeTxnStatusFilter);
        };

        window.svAdminTxnDecision = async function (txId, decision) {
            const labels = {
                approve_escalated: 'اعتماد هذه الفاتورة المعلقة / المصعّدة وتحرير العائد؟',
                reject_escalated: 'رفض هذه الفاتورة المعلقة وتحرير الحجز المرن؟',
                reverse_pre_payout: 'عكس هذه الفاتورة المكتملة (متاح فقط قبل إقفال وصرف يوم 15)؟'
            };
            if (!confirm(labels[decision] || 'تأكيد تنفيذ القرار التشغيلي على العملية؟')) return;
            const reason = prompt('ملاحظة / سبب القرار الإداري (يُسجّل في Audit Log):', decision);
            if (reason === null) return;
            try {
                await window.SAWYAN.API.adminOperationalDecision({
                    domain: 'transaction',
                    recordId: txId,
                    decision: decision,
                    notes: reason.trim() || decision
                });
                toast('تم تنفيذ القرار المحاسبي على المعاملة وتحديث الدفاتر!', false);
                if (typeof window.refreshSovereignBundle === 'function') await window.refreshSovereignBundle(false);
                await window.loadTransactions((document.getElementById('svLiveTxnSearch') || {}).value || '', _activeTxnStatusFilter);
            } catch (err) { toast(err.message, true); }
        };

        window.loadTransactions = async function (q, statusFilter) {
            const page = document.getElementById('transactionsPage');
            if (!page) return;
            if (statusFilter !== undefined) _activeTxnStatusFilter = statusFilter;
            const res = await window.SAWYAN.API.adminSearchAndReplyOps({
                action: 'search',
                entity: 'transactions',
                query: q || ''
            });
            const allRows = Array.isArray(res.results) ? res.results : [];
            _lastLiveTxRows = allRows;
            const rows = allRows.filter(function (t) {
                return _activeTxnStatusFilter === 'all' || String(t.status || '') === _activeTxnStatusFilter;
            });

            const filterButtons = [
                ['all', 'الكل (' + allRows.length + ')'],
                ['completed', 'مكتملة (' + allRows.filter(function (t) { return t.status === 'completed'; }).length + ')'],
                ['pending', 'معلقة (' + allRows.filter(function (t) { return t.status === 'pending'; }).length + ')'],
                ['awaiting_merchant_topup', 'طابور FIFO (' + allRows.filter(function (t) { return t.status === 'awaiting_merchant_topup'; }).length + ')'],
                ['reversed', 'مسترجعة (' + allRows.filter(function (t) { return t.status === 'reversed'; }).length + ')']
            ];

            page.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
                    '<div><h2 style="margin:0;">💳 سجل المعاملات والفواتير الحية (' + rows.length + ')</h2><div style="font-size:0.8rem;color:#64748b;">عرض حي مباشر من PostgreSQL بجميع وسائل الدفع والإيصالات المرفقة</div></div>' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<input id="svLiveTxnSearch" type="text" value="' + esc(q || '') + '" placeholder="ابحث بكود الفاتورة، العضو أو التاجر..." class="form-control" style="width:min(100%,240px);">' +
                        '<button type="button" class="btn btn-primary" onclick="loadTransactions(document.getElementById(\'svLiveTxnSearch\').value)">🔎 بحث سيرفري</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">' +
                    filterButtons.map(function (fb) {
                        const act = fb[0] === _activeTxnStatusFilter;
                        return '<button type="button" class="btn-sm ' + (act ? 'btn-primary' : 'btn-outline') + '" onclick="svSetAdminTxnFilter(\'' + fb[0] + '\')">' + fb[1] + '</button>';
                    }).join('') +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                    '<table class="data-table"><thead><tr><th>كود الفاتورة</th><th>العضو</th><th>التاجر والفرع</th><th>وسيلة الدفع والإيصال</th><th>قيمة الفاتورة</th><th>العمولة المستقطعة</th><th>الحالة والتوقيت</th><th>إجراءات إدارية حية</th></tr></thead><tbody>' +
                    (rows.length === 0 ? '<tr><td colspan="8" class="empty-state">لا توجد معاملات مطابقة لخيارات البحث الحالية</td></tr>' : rows.map(function (t) {
                        const rThumb = renderAdmThumb(t.receipt_media_url, '🧾 إيصال ' + esc(t.sw_short_code));
                        const actBtns = t.status === 'pending'
                            ? '<button type="button" class="btn-sm btn-success" onclick="svAdminTxnDecision(\'' + t.id + '\',\'approve_escalated\')">✅ اعتماد</button>' +
                              '<button type="button" class="btn-sm btn-danger" onclick="svAdminTxnDecision(\'' + t.id + '\',\'reject_escalated\')">❌ رفض</button>'
                            : (t.status === 'completed'
                                ? '<button type="button" class="btn-sm btn-warning" onclick="svAdminTxnDecision(\'' + t.id + '\',\'reverse_pre_payout\')">↩️ عكس (قبل يوم 15)</button>'
                                : '—');
                        return '<tr>' +
                            '<td data-label="كود الفاتورة"><code style="font-weight:800;color:#1d4ed8;">' + esc(t.sw_short_code) + '</code>' + (t.fifo_seq ? '<div style="font-size:0.72rem;color:#64748b;">FIFO #' + Number(t.fifo_seq) + '</div>' : '') + '</td>' +
                            '<td data-label="العضو"><b>#' + Number(t.member_code || 0) + '</b> ' + esc(t.member_name || '') + '</td>' +
                            '<td data-label="التاجر والفرع"><b>' + esc(t.merchant_name || '') + '</b><div style="font-size:0.74rem;color:#64748b;">' + esc(t.branch_name || '') + ' • ' + esc(t.country_code || '') + '</div></td>' +
                            '<td data-label="وسيلة الدفع والإيصال"><div>' + esc(fmtAdmPayType(t.payment_type)) + '</div>' + (t.unique_payment_ref ? '<div style="font-size:0.72rem;font-family:monospace;" dir="ltr">Ref: ' + esc(t.unique_payment_ref) + '</div>' : '') + (rThumb ? '<div style="margin-top:4px;">' + rThumb + '</div>' : '') + '</td>' +
                            '<td data-label="قيمة الفاتورة"><b>' + fmt2(t.total_amount) + ' ' + esc(t.currency_code || '') + '</b></td>' +
                            '<td data-label="العمولة المستقطعة"><b style="color:#059669;">' + fmt2(t.commission_amount) + ' ' + esc(t.currency_code || '') + '</b></td>' +
                            '<td data-label="الحالة والتوقيت"><span class="badge ' + (t.status === 'completed' ? 'badge-success' : (t.status === 'reversed' || t.status === 'rejected') ? 'badge-danger' : 'badge-warning') + '">' + esc(t.status) + '</span><div style="font-size:0.72rem;color:#64748b;margin-top:2px;">' + esc(String(t.completed_at || t.created_at || '').slice(0, 16).replace('T', ' ')) + '</div></td>' +
                            '<td data-label="إجراءات إدارية حية"><div style="display:flex;gap:5px;flex-wrap:wrap;">' + actBtns + '</div></td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        window.loadCommissions = async function () {
            const page = document.getElementById('commissionsPage');
            if (!page) return;
            const bundle = await window.SAWYAN.API.getAdminSovereignBundle();
            const k = bundle.kpis || {};
            const zd = bundle.zero_discrepancy || {};
            const byCur = Array.isArray(k.gmv_and_commission_by_currency) ? k.gmv_and_commission_by_currency : [];
            const completedTxs = (bundle.transactions || []).filter(function (t) { return t.status === 'completed'; });
            const totalCommUsd = Number(k.commission_usd_completed || 0);
            const treasUsd = totalCommUsd * 0.25;
            const planUsd = totalCommUsd * 0.75;

            page.innerHTML =
                '<div class="page-header"><h2>💰 دفتر العمولات والانقسام الدستوري (25% / 75% — مطابقة صفرية)</h2></div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:12px;margin-bottom:16px;">' +
                    '<div style="background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:12px;padding:14px;"><small style="color:#475569;">إجمالي GMV المكتمل ($)</small><div style="font-size:1.35rem;font-weight:900;color:#0f172a;">$' + fmt2(k.gmv_usd_completed || 0) + '</div></div>' +
                    '<div style="background:#ecfdf5;border:1.5px solid #6ee7b7;border-radius:12px;padding:14px;"><small style="color:#065f46;">إجمالي عمولات سويًا ($)</small><div style="font-size:1.35rem;font-weight:900;color:#059669;">$' + fmt2(totalCommUsd) + '</div></div>' +
                    '<div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:14px;"><small style="color:#1e40af;">حصة الخزانة 25% ($)</small><div style="font-size:1.35rem;font-weight:900;color:#1d4ed8;">$' + fmt2(treasuryValFallback(treasUsd, k.treasury_revenue_usd)) + '</div></div>' +
                    '<div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:12px;padding:14px;"><small style="color:#92400e;">وعاء خطة الدخل 75% ($)</small><div style="font-size:1.35rem;font-weight:900;color:#b45309;">$' + fmt2(treasuryValFallback(planUsd, k.plan_pool_liability_usd)) + '</div></div>' +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:16px;overflow-x:auto;">' +
                    '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">🌍 تفصيل العمولات حسب العملة (' + byCur.length + ') — ميزان المراجعة: ' + (zd.is_zero_discrepancy_intact ? '✅ مطابق 100%' : '⚠️ قيد المراجعة') + '</h3>' +
                    '<table class="data-table"><thead><tr><th>العملة</th><th>العمليات المكتملة</th><th>إجمالي GMV المحلي</th><th>إجمالي العمولة المحلية</th><th>حصة الخزانة 25%</th><th>وعاء الخطة 75%</th></tr></thead><tbody>' +
                    (byCur.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد عمولات مكتملة مسجلة بعد</td></tr>' : byCur.map(function (c) {
                        const cl = Number(c.commission_local || 0);
                        return '<tr>' +
                            '<td data-label="العملة"><b>' + esc(c.currency_code) + '</b></td>' +
                            '<td data-label="العمليات المكتملة">' + Number(c.tx_count || 0) + '</td>' +
                            '<td data-label="إجمالي GMV المحلي">' + fmt2(c.gmv_local) + ' ' + esc(c.currency_code) + '</td>' +
                            '<td data-label="إجمالي العمولة المحلية"><b style="color:#059669;">' + fmt2(cl) + ' ' + esc(c.currency_code) + '</b></td>' +
                            '<td data-label="حصة الخزانة 25%">' + fmt2(cl * 0.25) + ' ' + esc(c.currency_code) + '</td>' +
                            '<td data-label="وعاء الخطة 75%">' + fmt2(cl * 0.75) + ' ' + esc(c.currency_code) + '</td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                    '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">🧾 أحدث الفواتير المولّدة للعمولة (' + completedTxs.length + ')</h3>' +
                    '<table class="data-table"><thead><tr><th>كود الفاتورة</th><th>التاجر</th><th>العضو</th><th>قيمة الفاتورة</th><th>العمولة الإجمالية</th><th>التوقيت</th></tr></thead><tbody>' +
                    (completedTxs.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد فواتير مكتملة بعد</td></tr>' : completedTxs.slice(0, 40).map(function (t) {
                        return '<tr>' +
                            '<td data-label="كود الفاتورة"><code>' + esc(t.sw_short_code) + '</code></td>' +
                            '<td data-label="التاجر">' + esc(t.merchant_name || '') + '</td>' +
                            '<td data-label="العضو">#' + Number(t.member_code || 0) + ' ' + esc(t.member_name || '') + '</td>' +
                            '<td data-label="قيمة الفاتورة">' + fmt2(t.total_amount) + ' ' + esc(t.currency_code || '') + '</td>' +
                            '<td data-label="العمولة الإجمالية"><b style="color:#059669;">' + fmt2(t.commission_amount) + ' ' + esc(t.currency_code || '') + '</b></td>' +
                            '<td data-label="التوقيت">' + esc(String(t.completed_at || t.created_at || '').slice(0, 16).replace('T', ' ')) + '</td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        function treasuryValFallback(calcVal, kpiVal) {
            return Number(kpiVal || 0) > 0 ? Number(kpiVal) : Number(calcVal || 0);
        }

        window.svAdminDisputeAct = async function (domain, recordId, decision) {
            try {
                await window.SAWYAN.API.adminOperationalDecision({
                    domain: domain,
                    recordId: recordId,
                    decision: decision
                });
                toast('تم تسجيل الحكم وتنفيذ الأثر المحاسبي والرقابي فوراً!', false);
                if (typeof window.refreshSovereignBundle === 'function') await window.refreshSovereignBundle(false);
                await window.loadDisputes((document.getElementById('svLiveDispSearch') || {}).value || '');
            } catch (err) { toast(err.message, true); }
        };

        window.loadDisputes = async function (q) {
            const page = document.getElementById('disputesPage');
            if (!page) return;
            const [dispRes, compRes, bundle] = await Promise.all([
                window.SAWYAN.API.adminSearchAndReplyOps({ action: 'search', entity: 'disputes', query: q || '' }),
                window.SAWYAN.API.adminSearchAndReplyOps({ action: 'search', entity: 'merchant_complaints', query: q || '' }),
                window.SAWYAN.API.getAdminSovereignBundle()
            ]);
            const disputes = Array.isArray(dispRes.results) ? dispRes.results : [];
            const complaints = Array.isArray(compRes.results) ? compRes.results : [];
            const gouging = Array.isArray(bundle.price_gouging_reports) ? bundle.price_gouging_reports : [];
            const compCatLabels = {
                refused_verification: 'رفض توثيق الفاتورة',
                evasion_excuse: 'تهرّب أو مماطلة',
                hidden_fee: 'رسوم إضافية على السعر',
                bad_conduct: 'سوء معاملة',
                other: 'مخالفة أخرى'
            };

            page.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">' +
                    '<div><h2 style="margin:0;">⚠️ مركز تحكيم النزاعات والشكاوى وبلاغات الأسعار الحية (' + disputes.length + ' نزاع • ' + complaints.length + ' شكوى • ' + gouging.length + ' بلاغ سعر)</h2><div style="font-size:0.8rem;color:#64748b;">عرض مرفقات الإثبات، التحقق من شكاوى التهرّب ضد المتاجر، وتنفيذ عكس العمولة أو التصعيد التلقائي مباشرة عبر الخادم</div></div>' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<input id="svLiveDispSearch" type="text" value="' + esc(q || '') + '" placeholder="ابحث بكود الفاتورة أو العضو أو التاجر..." class="form-control" style="width:min(100%,240px);">' +
                        '<button type="button" class="btn btn-primary" onclick="loadDisputes(document.getElementById(\'svLiveDispSearch\').value)">🔎 بحث سيرفري</button>' +
                    '</div>' +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:16px;overflow-x:auto;">' +
                    '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">⚖️ تذاكر النزاعات الثلاثية الحية (D6 / Clawback D5)</h3>' +
                    '<table class="data-table"><thead><tr><th>الفاتورة</th><th>العضو</th><th>التاجر</th><th>التصنيف والسبب</th><th>الإثبات المرفق</th><th>الحالة</th><th>حكم التحكيم الحي</th></tr></thead><tbody>' +
                    (disputes.length === 0 ? '<tr><td colspan="7" class="empty-state">لا توجد نزاعات مسجلة حالياً</td></tr>' : disputes.map(function (d) {
                        const open = d.status === 'awaiting_merchant_friendly' || d.status === 'escalated_to_admin';
                        const evThumb = renderAdmThumb(d.evidence_url, '📎 إثبات النزاع ' + esc(d.sw_short_code));
                        const btns = open
                            ? '<button type="button" class="btn-sm btn-success" onclick="svAdminDisputeAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_member\')">إنصاف العضو</button>' +
                              (d.tx_status === 'completed'
                                  ? '<button type="button" class="btn-sm btn-danger" onclick="svAdminDisputeAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_member_clawback\')">عكس قبل الصرف</button>'
                                  : '') +
                              '<button type="button" class="btn-sm btn-outline" onclick="svAdminDisputeAct(\'dispute_ticket\',\'' + d.id + '\',\'resolved_merchant\')">لصالح التاجر</button>'
                            : 'تم الفصل';
                        return '<tr>' +
                            '<td data-label="الفاتورة"><code>' + esc(d.sw_short_code) + '</code><div style="font-size:0.74rem;color:#64748b;">' + fmt2(d.total_amount) + ' ' + esc(d.currency_code || '') + '</div></td>' +
                            '<td data-label="العضو">#' + Number(d.member_code || 0) + ' ' + esc(d.member_name || '') + '</td>' +
                            '<td data-label="التاجر">' + esc(d.merchant_name || '') + '</td>' +
                            '<td data-label="التصنيف والسبب"><code>' + esc(d.dispute_category || 'general') + '</code><div>' + esc(d.dispute_reason || '') + '</div></td>' +
                            '<td data-label="الإثبات المرفق">' + (evThumb || '—') + '</td>' +
                            '<td data-label="الحالة"><span class="badge ' + (open ? 'badge-warning' : 'badge-success') + '">' + esc(d.status) + '</span></td>' +
                            '<td data-label="حكم التحكيم الحي"><div style="display:flex;gap:5px;flex-wrap:wrap;">' + btns + '</div></td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin-bottom:16px;overflow-x:auto;">' +
                    '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">📣 شكاوى الأعضاء المباشرة ضد التجار (التهرب من التوثيق / مخالفات)</h3>' +
                    '<table class="data-table"><thead><tr><th>المتجر</th><th>العضو</th><th>التصنيف والموضوع</th><th>التفاصيل والإثبات</th><th>الحالة</th><th>إجراء التحكيم</th></tr></thead><tbody>' +
                    (complaints.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد شكاوى تجار مسجلة حالياً</td></tr>' : complaints.map(function (cp) {
                        const isOpen = cp.status === 'open';
                        const cpThumb = renderAdmThumb(cp.evidence_url, '📎 إثبات شكوى ضد ' + esc(cp.merchant_name || ''));
                        return '<tr>' +
                            '<td data-label="المتجر"><b>' + esc(cp.merchant_name || '') + '</b><div style="font-size:0.74rem;color:#64748b;">' + esc(cp.merchant_code || '') + ' • ' + esc(cp.country_code || '') + '</div></td>' +
                            '<td data-label="العضو">#' + Number(cp.member_code || 0) + ' ' + esc(cp.member_name || '') + '</td>' +
                            '<td data-label="التصنيف والموضوع"><span class="badge badge-warning" style="font-size:0.7rem;">' + esc(compCatLabels[cp.category] || cp.category) + '</span><div style="font-weight:700;margin-top:3px;">' + esc(cp.subject || '') + '</div></td>' +
                            '<td data-label="التفاصيل والإثبات"><div style="font-size:0.8rem;">' + esc(cp.details || '') + '</div>' + (cpThumb ? '<div style="margin-top:4px;">' + cpThumb + '</div>' : '') + '</td>' +
                            '<td data-label="الحالة"><span class="badge ' + (isOpen ? 'badge-warning' : (cp.status === 'verified' ? 'badge-danger' : 'badge-success')) + '">' + esc(cp.status) + '</span></td>' +
                            '<td data-label="إجراء التحكيم">' + (isOpen
                                ? '<div style="display:flex;gap:5px;flex-wrap:wrap;">' +
                                      '<button type="button" class="btn-sm btn-danger" onclick="svAdminDisputeAct(\'merchant_complaint\',\'' + cp.id + '\',\'verified\')">✅ توثيق الشكوى</button>' +
                                      '<button type="button" class="btn-sm btn-outline" onclick="svAdminDisputeAct(\'merchant_complaint\',\'' + cp.id + '\',\'dismissed\')">❌ رفض (غير مثبتة)</button>' +
                                  '</div>'
                                : esc(cp.admin_notes || cp.status)) + '</td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>' +
                '<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;overflow-x:auto;">' +
                    '<h3 style="margin:0 0 10px 0;font-size:0.98rem;">🚨 بلاغات رفع الأسعار (S10 — صور الرف والإيصال)</h3>' +
                    '<table class="data-table"><thead><tr><th>الفاتورة</th><th>التاجر</th><th>السعر المعلن مقابل المحصّل</th><th>صور الإثبات</th><th>الحالة</th><th>إجراء رقابي</th></tr></thead><tbody>' +
                    (gouging.length === 0 ? '<tr><td colspan="6" class="empty-state">لا توجد بلاغات رفع أسعار حالياً</td></tr>' : gouging.map(function (g) {
                        const sh = renderAdmThumb(g.shelf_photo_url, '📸 سعر الرف');
                        const rc = renderAdmThumb(g.receipt_url, '🧾 الإيصال');
                        return '<tr>' +
                            '<td data-label="الفاتورة"><code>' + esc(g.sw_short_code) + '</code></td>' +
                            '<td data-label="التاجر">' + esc(g.merchant_name || '') + '</td>' +
                            '<td data-label="السعر المعلن مقابل المحصّل">معلن: ' + fmt2(g.declared_price) + ' ← محصّل: <b style="color:#dc2626;">' + fmt2(g.charged_price) + '</b></td>' +
                            '<td data-label="صور الإثبات"><div style="display:flex;gap:6px;flex-wrap:wrap;">' + (sh + rc || '—') + '</div></td>' +
                            '<td data-label="الحالة">' + esc(g.verification_status) + '</td>' +
                            '<td data-label="إجراء رقابي">' + (g.verification_status === 'pending'
                                ? '<button type="button" class="btn-sm btn-danger" onclick="svAdminDisputeAct(\'price_gouging\',\'' + g.id + '\',\'verified_violation\')">تأكيد المخالفة</button>'
                                : '—') + '</td>' +
                        '</tr>';
                    }).join('')) +
                    '</tbody></table>' +
                '</div>';
        };

        // Neutralize / route legacy demo modal helpers cleanly to live PostgreSQL RPCs
        window.opsTxnResolve = function (id, decision) { window.svAdminTxnDecision(id, decision); };
        window.opsClawbackModal = function (id) { window.svAdminTxnDecision(id, 'reverse_pre_payout'); };
        window.opsEscalatedModal = function (id) { window.svAdminTxnDecision(id, 'approve_escalated'); };
        window.opsDisputeModal = function () { window.loadDisputes(); };
        window.opsDisputeResolve = function (id, decision) { window.svAdminDisputeAct('dispute_ticket', id, decision); };

        // Hook sidebar clicks so clicking any live Admin screen loads PostgreSQL data immediately
        document.addEventListener('click', function (e) {
            const nav = e.target.closest('.nav-item, .more-menu-item, .bottom-nav-item');
            if (!nav) return;
            const pg = nav.dataset.page;
            if (pg === 'members') setTimeout(function () { window.loadMembers(); }, 30);
            else if (pg === 'merchants') setTimeout(function () { window.loadMerchants(); }, 30);
            else if (pg === 'transactions') setTimeout(function () { window.loadTransactions(); }, 30);
            else if (pg === 'commissions') setTimeout(function () { window.loadCommissions(); }, 30);
            else if (pg === 'disputes') setTimeout(function () { window.loadDisputes(); }, 30);
            else if (pg === 'withdrawals') setTimeout(function () { window.loadWithdrawals(); }, 30);
            else if (pg === 'support') setTimeout(function () { window.loadSupport(); }, 30);
        });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountCommandCenterSidebarLink);
    } else {
        mountCommandCenterSidebarLink();
    }
})();
