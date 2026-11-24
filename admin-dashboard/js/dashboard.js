/**
 * ============================================================================
 * SAWYAN V3.0 — Sovereign Admin Cockpit Shell & Power-Operator Controller
 * ============================================================================
 * Replaces legacy V1 unguarded dashboard.js & dashboard-extended.js:
 *   - Strict sessionStorage-only Admin Auth guard (zero localStorage admin tokens)
 *   - Zero unguarded client .from() writes & zero native alert/confirm/prompt
 *   - Lazy-loader for 313 KB admin-decisions-lab.js on first visit
 *   - Global Ctrl+K Command Palette & Esc Modal Closer
 *   - BOM-UTF8 Formula-Safe CSV Exporters (Members, Merchants, Transactions, Commissions, Disputes, Support)
 *   - Smart Table Pagination (25 / 50 / 100 rows) & Session Idle Expiry Warning
 */
(function () {
    'use strict';

    let currentAdmin = null;
    let decisionsLabLoaded = false;
    let decisionsLabLoading = null;
    let lastActivityAt = Date.now();
    let idleWarningShown = false;

    const PAGE_TITLES = {
        home: 'غرفة العمليات المركزية',
        members: 'إدارة الأعضاء',
        networkTree: 'الشجرة الكاملة للشركة',
        merchants: 'إدارة التجار',
        transactions: 'العمليات والفواتير الحية',
        commissions: 'العمولات والخزينة',
        withdrawals: 'طلبات سحب الأرباح',
        governanceOps: 'وحدات الرقابة والإقفال',
        reports: 'التقارير والإحصائيات',
        disputes: 'الشكاوى والنزاعات',
        support: 'الدعم الفني واستعادة الحسابات',
        academyAdmin: 'الأكاديمية التدريبية',
        sovereignOpsCenter: 'التأسيس والموظفون',
        registrationBuilder: 'هندسة نماذج التسجيل',
        decisionsLab: 'مختبر القرارات والمقترحات',
        settings: 'إعدادات النظام والحوكمة'
    };

    const COMMAND_NAV_ITEMS = [
        { page: 'home', icon: '🏠', label: 'الرئيسية — غرفة العمليات', keywords: 'home dashboard kpi' },
        { page: 'members', icon: '👥', label: 'إدارة الأعضاء وKYC', keywords: 'members users kyc' },
        { page: 'networkTree', icon: '🌳', label: 'الشجرة الكاملة للشركة', keywords: 'tree network binary' },
        { page: 'merchants', icon: '🏪', label: 'إدارة التجار والشحن المسبق', keywords: 'merchants stores prepaid' },
        { page: 'transactions', icon: '💳', label: 'العمليات والفواتير وطابور FIFO', keywords: 'transactions invoices fifo sw' },
        { page: 'commissions', icon: '💰', label: 'العمولات والخزينة', keywords: 'commissions treasury' },
        { page: 'withdrawals', icon: '💸', label: 'طلبات سحب الأرباح', keywords: 'withdrawals payouts' },
        { page: 'governanceOps', icon: '🛡️', label: 'وحدات الرقابة والإقفال والمطابقة', keywords: 'governance close recon fraud' },
        { page: 'disputes', icon: '⚠️', label: 'الشكاوى والنزاعات وبلاغات الأسعار', keywords: 'disputes complaints' },
        { page: 'support', icon: '🎫', label: 'الدعم الفني واستعادة الحسابات', keywords: 'support tickets recovery' },
        { page: 'academyAdmin', icon: '🎓', label: 'الأكاديمية التدريبية LMS', keywords: 'academy lms lessons' },
        { page: 'sovereignOpsCenter', icon: '👑', label: 'التأسيس والموظفون والدول', keywords: 'sovereign staff founder root' },
        { page: 'registrationBuilder', icon: '🧩', label: 'هندسة نماذج التسجيل', keywords: 'registration builder forms' },
        { page: 'decisionsLab', icon: '🧪', label: 'مختبر القرارات والمقترحات', keywords: 'decisions lab proposals' },
        { page: 'reports', icon: '📊', label: 'التقارير والإحصائيات', keywords: 'reports analytics' },
        { page: 'settings', icon: '⚙️', label: 'إعدادات النظام ومفاتيح الطوارئ', keywords: 'settings kill switch 2fa' }
    ];

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function notify(msg, type) {
        if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
            window.SAWYAN.UI.toast(msg, type || 'info');
        } else if (typeof window.svAdminToast === 'function') {
            window.svAdminToast(msg, type === 'error' || type === 'warning');
        }
    }

    function csvCellSafe(v) {
        let s = String(v === null || v === undefined ? '' : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }

    function downloadBomCsv(filename, headers, rows) {
        const lines = [headers].concat(rows).map(r => r.map(csvCellSafe).join(','));
        const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
        notify('✅ تم تصدير الملف (' + filename + ') بصيغة UTF-8 آمنة.', 'success');
    }

    function exportVisibleTableCsv(tableId, filename) {
        const tbl = document.getElementById(tableId);
        if (!tbl) { notify('لا يوجد جدول جاهز للتصدير في هذه الشاشة.', 'warning'); return; }
        const headers = Array.from(tbl.querySelectorAll('thead th')).map(th => th.textContent.trim());
        const rows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr =>
            Array.from(tr.querySelectorAll('td')).map(td => td.textContent.replace(/\s+/g, ' ').trim())
        ).filter(r => r.length > 1);
        if (!rows.length) { notify('لا توجد صفوف بيانات للتصدير حالياً.', 'info'); return; }
        downloadBomCsv(filename, headers, rows);
    }

    // Expose BOM-UTF8 safe CSV exporters (replacing V1 "coming soon" alerts)
    window.exportMembers = function () { exportVisibleTableCsv('membersTable', 'SAWYAN_Members_' + new Date().toISOString().slice(0, 10) + '.csv'); };
    window.exportMerchants = function () { exportVisibleTableCsv('merchantsTable', 'SAWYAN_Merchants_' + new Date().toISOString().slice(0, 10) + '.csv'); };
    window.exportTransactions = function () { exportVisibleTableCsv('transactionsTable', 'SAWYAN_Transactions_' + new Date().toISOString().slice(0, 10) + '.csv'); };
    window.exportCommissions = function () { exportVisibleTableCsv('commissionsTable', 'SAWYAN_Commissions_' + new Date().toISOString().slice(0, 10) + '.csv'); };
    window.exportDisputes = function () { exportVisibleTableCsv('disputesTable', 'SAWYAN_Disputes_' + new Date().toISOString().slice(0, 10) + '.csv'); };
    window.exportSupport = function () { exportVisibleTableCsv('supportTable', 'SAWYAN_Support_' + new Date().toISOString().slice(0, 10) + '.csv'); };
    window.sawyanExportBomCsv = downloadBomCsv;

    // Lazy-loader for 313 KB admin-decisions-lab.js
    function ensureDecisionsLabLoaded() {
        if (decisionsLabLoaded) return Promise.resolve(true);
        if (decisionsLabLoading) return decisionsLabLoading;
        const page = document.getElementById('decisionsLabPage');
        if (page) {
            page.innerHTML = '<div style="padding:36px;text-align:center;color:#475569;font-weight:800;">⏳ جاري تحميل مختبر القرارات والمقترحات (Lazy-Load)...</div>';
        }
        decisionsLabLoading = new Promise((resolve) => {
            const sc = document.createElement('script');
            sc.src = 'js/admin-decisions-lab.js?v=20261121_launch';
            sc.onload = function () {
                decisionsLabLoaded = true;
                if (typeof window.renderDecisionsLab === 'function') window.renderDecisionsLab();
                else if (typeof window.loadDecisionsLab === 'function') window.loadDecisionsLab();
                resolve(true);
            };
            sc.onerror = function () {
                if (page) page.innerHTML = '<div style="padding:24px;color:#b91c1c;font-weight:800;">⚠️ تعذر تحميل مختبر القرارات.</div>';
                decisionsLabLoading = null;
                resolve(false);
            };
            document.body.appendChild(sc);
        });
        return decisionsLabLoading;
    }
    window.ensureDecisionsLabLoaded = ensureDecisionsLabLoaded;

    // Smart Table Pagination Helper (25 / 50 / 100 rows)
    function attachTablePagination(tableEl) {
        if (!tableEl || tableEl.dataset.swPagedInit) return;
        const tbody = tableEl.querySelector('tbody');
        if (!tbody) return;
        const renderPager = () => {
            const allRows = Array.from(tbody.querySelectorAll('tr'));
            if (allRows.length <= 25) {
                const old = tableEl.parentElement && tableEl.parentElement.querySelector('.admin-table-pager');
                if (old) old.remove();
                return;
            }
            const pageSize = Number(tableEl.dataset.swPageSize || 25);
            const totalPages = Math.max(1, Math.ceil(allRows.length / pageSize));
            let cur = Math.max(1, Math.min(totalPages, Number(tableEl.dataset.swPage || 1)));
            tableEl.dataset.swPage = String(cur);
            const start = (cur - 1) * pageSize;
            allRows.forEach((tr, idx) => {
                tr.style.display = (idx >= start && idx < start + pageSize) ? '' : 'none';
            });
            let pager = tableEl.parentElement && tableEl.parentElement.querySelector('.admin-table-pager');
            if (!pager && tableEl.parentElement) {
                pager = document.createElement('div');
                pager.className = 'admin-table-pager';
                tableEl.parentElement.appendChild(pager);
            }
            if (!pager) return;
            pager.innerHTML =
                '<span>صفحة <strong>' + cur + '</strong> من <strong>' + totalPages + '</strong> (' + allRows.length + ' سجل)</span>' +
                '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
                    '<select class="form-control sw-psize-sel" style="width:auto;padding:4px 8px;font-size:0.78rem;">' +
                        [25, 50, 100].map(sz => '<option value="' + sz + '"' + (sz === pageSize ? ' selected' : '') + '>' + sz + ' / صفحة</option>').join('') +
                    '</select>' +
                    '<button type="button" class="btn btn-outline btn-sm sw-prev-btn"' + (cur <= 1 ? ' disabled' : '') + '>◀ السابق</button>' +
                    '<button type="button" class="btn btn-outline btn-sm sw-next-btn"' + (cur >= totalPages ? ' disabled' : '') + '>التالي ▶</button>' +
                '</div>';
            pager.querySelector('.sw-psize-sel')?.addEventListener('change', (e) => {
                tableEl.dataset.swPageSize = e.target.value;
                tableEl.dataset.swPage = '1';
                renderPager();
            });
            pager.querySelector('.sw-prev-btn')?.addEventListener('click', () => {
                tableEl.dataset.swPage = String(Math.max(1, cur - 1));
                renderPager();
            });
            pager.querySelector('.sw-next-btn')?.addEventListener('click', () => {
                tableEl.dataset.swPage = String(Math.min(totalPages, cur + 1));
                renderPager();
            });
        };
        tableEl.dataset.swPagedInit = '1';
        const obs = new MutationObserver(() => {
            tableEl.dataset.swPage = '1';
            renderPager();
        });
        obs.observe(tbody, { childList: true });
        renderPager();
    }

    // Strict SessionStorage Auth Check (overridable by admin-v3-live-bridge.js)
    async function defaultCheckAuth() {
        if (window.SAWYAN && window.SAWYAN.API) {
            const adm = window.SAWYAN.API.getSavedAdmin();
            if (adm && adm.id) {
                currentAdmin = adm;
                window.currentAdmin = adm;
                const nameEl = document.getElementById('adminName');
                if (nameEl) nameEl.textContent = adm.full_name || 'مدير النظام';
                return true;
            }
        }
        window.location.href = 'login.html';
        return false;
    }
    window.checkAuth = defaultCheckAuth;

    function activatePage(page) {
        if (!page) return;
        document.querySelectorAll('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
        document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.toggle('active', i.dataset.page === page));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(page + 'Page');
        if (target) target.classList.add('active');
        const titleEl = document.getElementById('pageTitle');
        if (titleEl && PAGE_TITLES[page]) titleEl.textContent = PAGE_TITLES[page];

        if (page === 'decisionsLab') {
            ensureDecisionsLabLoaded();
        } else if (page === 'sovereignOpsCenter' && typeof window.openSovereignOpsCenter === 'function') {
            window.openSovereignOpsCenter('root0');
        } else if (page === 'academyAdmin' && typeof window.openAcademyAdminPage === 'function') {
            window.openAcademyAdminPage('lessons');
        } else if (page === 'registrationBuilder' && typeof window.openRegistrationBuilderPage === 'function') {
            window.openRegistrationBuilderPage('merchant');
        } else if (page === 'networkTree' && typeof window.openAdminNetworkTree === 'function') {
            window.openAdminNetworkTree(0);
        } else if (page === 'home' && typeof window.loadStats === 'function') {
            window.loadStats();
        } else if (page === 'members' && typeof window.loadMembers === 'function') {
            window.loadMembers();
        } else if (page === 'merchants' && typeof window.loadMerchants === 'function') {
            window.loadMerchants();
        } else if (page === 'transactions' && typeof window.loadTransactions === 'function') {
            window.loadTransactions();
        } else if (page === 'commissions' && typeof window.loadCommissions === 'function') {
            window.loadCommissions();
        } else if (page === 'disputes' && typeof window.loadDisputes === 'function') {
            window.loadDisputes();
        } else if (page === 'support' && typeof window.loadSupport === 'function') {
            window.loadSupport();
        } else if (page === 'withdrawals' && typeof window.loadWithdrawals === 'function') {
            window.loadWithdrawals();
        } else if (page === 'settings' && typeof window.loadSettings === 'function') {
            window.loadSettings();
        }
        window.closeMoreMenu();
    }

    function handleNavigation(e) {
        if (e) e.preventDefault();
        const page = this && this.dataset ? this.dataset.page : null;
        if (page) activatePage(page);
    }

    window.goToPage = function (page) { activatePage(page); };
    window.toggleMoreMenu = function (e) {
        if (e) e.preventDefault();
        const m = document.getElementById('moreMenu');
        if (m) m.classList.toggle('open');
    };
    window.closeMoreMenu = function () {
        const m = document.getElementById('moreMenu');
        if (m) m.classList.remove('open');
    };
    window.logout = function () {
        if (window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.clearAdminSession === 'function') {
            window.SAWYAN.API.clearAdminSession();
        }
        window.location.href = 'login.html';
    };

    // Global Ctrl+K Command Palette
    function mountCommandPalette() {
        if (document.getElementById('adminCmdKOverlay')) return;
        const ov = document.createElement('div');
        ov.id = 'adminCmdKOverlay';
        ov.className = 'admin-cmdk-overlay';
        ov.innerHTML =
            '<div class="admin-cmdk-box" role="dialog" aria-modal="true" aria-label="لوحة الأوامر السريعة">' +
                '<input type="search" id="adminCmdKInput" class="admin-cmdk-input" placeholder="🔍 اكتب اسم شاشة، كود عضو، متجر، أو عملية (SW-XXXX)... (Esc للإغلاق)">' +
                '<div id="adminCmdKList" class="admin-cmdk-list"></div>' +
            '</div>';
        ov.addEventListener('click', (e) => { if (e.target === ov) closeAdminCommandPalette(); });
        document.body.appendChild(ov);

        const inp = document.getElementById('adminCmdKInput');
        inp.addEventListener('input', () => renderCmdKResults(inp.value));
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const first = document.querySelector('#adminCmdKList .admin-cmdk-item');
                if (first) first.click();
            }
        });
    }

    function renderCmdKResults(rawQ) {
        const list = document.getElementById('adminCmdKList');
        if (!list) return;
        const q = String(rawQ || '').trim().toLowerCase();
        const matches = COMMAND_NAV_ITEMS.filter(it => !q || (it.label + ' ' + it.keywords + ' ' + it.page).toLowerCase().includes(q));
        let html = matches.map((it, idx) =>
            '<button type="button" class="admin-cmdk-item' + (idx === 0 ? ' active' : '') + '" onclick="closeAdminCommandPalette();goToPage(\'' + it.page + '\')">' +
                '<span>' + it.icon + ' ' + esc(it.label) + '</span>' +
                '<small style="color:#64748b;font-family:Poppins,monospace;">' + esc(it.page) + '</small>' +
            '</button>'
        ).join('');

        if (q.length >= 2) {
            html +=
                '<button type="button" class="admin-cmdk-item" onclick="closeAdminCommandPalette();goToPage(\'transactions\');setTimeout(function(){if(typeof loadTransactions===\'function\')loadTransactions(\'' + esc(rawQ.trim()).replace(/'/g, '') + '\');},120)">' +
                    '<span>💳 بحث مباشر في العمليات عن: <strong>' + esc(rawQ.trim()) + '</strong></span>' +
                    '<small style="color:#047857;">PostgreSQL ↗</small>' +
                '</button>';
        }
        list.innerHTML = html || '<div style="padding:18px;text-align:center;color:#64748b;font-size:0.86rem;">لا توجد نتائج مطابقة</div>';
    }

    window.openAdminCommandPalette = function () {
        mountCommandPalette();
        const ov = document.getElementById('adminCmdKOverlay');
        const inp = document.getElementById('adminCmdKInput');
        if (ov) ov.style.display = 'flex';
        if (inp) { inp.value = ''; renderCmdKResults(''); setTimeout(() => inp.focus(), 20); }
    };

    window.closeAdminCommandPalette = function () {
        const ov = document.getElementById('adminCmdKOverlay');
        if (ov) ov.style.display = 'none';
    };

    // Global Keyboard Shortcuts (Ctrl+K / Cmd+K & Esc)
    document.addEventListener('keydown', function (e) {
        if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'k') {
            e.preventDefault();
            window.openAdminCommandPalette();
            return;
        }
        if (e.key === 'Escape') {
            window.closeAdminCommandPalette();
            if (typeof window.closeStage7Modal === 'function') window.closeStage7Modal();
            ['svStage7ModalOverlay', 'svAdminModalOverlay', 'opsModalOverlay'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el.style.display !== 'none') el.style.display = 'none';
            });
            window.closeMoreMenu();
        }
    });

    // Session Activity Tracker & Expiry Warning (50 min idle warning before 60 min timeout)
    ['click', 'keydown', 'pointerdown'].forEach(evt => {
        document.addEventListener(evt, () => { lastActivityAt = Date.now(); idleWarningShown = false; }, { passive: true });
    });
    setInterval(() => {
        if (!currentAdmin || idleWarningShown) return;
        const idleMins = (Date.now() - lastActivityAt) / 60000;
        if (idleMins >= 50) {
            idleWarningShown = true;
            notify('⏱️ تنبيه أمان الجلسة: مرّ 50 دقيقة دون نشاط — قم بحفظ عملك أو تحديث الصفحة للاستمرار.', 'warning');
        }
    }, 60000);

    document.addEventListener('DOMContentLoaded', async function () {
        if (window.SAWYAN && window.SAWYAN.Logo) {
            const box = document.getElementById('logoContainer');
            if (box) box.innerHTML = '<a href="../index.html" class="logo-link" style="text-decoration:none;">' + window.SAWYAN.Logo.svg('light-on-dark') + '</a>';
        }

        if (typeof window.checkAuth === 'function') {
            await window.checkAuth();
        } else {
            await defaultCheckAuth();
        }
        currentAdmin = window.currentAdmin || (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedAdmin()) || null;
        if (!currentAdmin || !currentAdmin.id) return;

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', handleNavigation);
        });
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            if (item.dataset.page === 'more') return;
            item.addEventListener('click', function (e) {
                e.preventDefault();
                activatePage(this.dataset.page);
            });
        });

        // Attach automatic smart pagination to main operational tables
        ['membersTable', 'merchantsTable', 'transactionsTable'].forEach(id => {
            const el = document.getElementById(id);
            if (el) attachTablePagination(el);
        });

        // Hydrate live PostgreSQL Sovereign Bundle (mounts sovereignLive nav, admin-home-live-banner & live KPIs)
        if (typeof window.loadRecentActivity === 'function') {
            try { await window.loadRecentActivity(); } catch (e) { console.warn('Live bundle boot:', e && e.message); }
        }
        if (typeof window.loadStats === 'function') {
            try { window.loadStats(); } catch (e) {}
        }
    });
})();
