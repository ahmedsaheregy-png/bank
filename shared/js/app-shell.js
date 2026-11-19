/**
 * ============================================================================
 * SAWYAN V3.0 — Unified Responsive App Shell Controller (D30)
 * - Compact Rail Drawer Toggle for 600px–1023px half-screen mode
 * - Automatic `data-label` injection + `.table-responsive-wrap` guard
 * - Single Navigation Schema sync between `.sidebar-nav` & `#moreMenu`
 * ============================================================================
 */
(function () {
    'use strict';

    function setupRailToggle() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        if (!document.getElementById('appShellBackdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'appShellBackdrop';
            backdrop.className = 'app-shell-backdrop';
            backdrop.addEventListener('click', function () {
                sidebar.classList.remove('rail-expanded');
                backdrop.classList.remove('open');
            });
            document.body.appendChild(backdrop);
        }

        if (!document.getElementById('appShellRailToggle')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'appShellRailToggle';
            btn.className = 'app-shell-rail-toggle';
            btn.setAttribute('aria-label', 'توسيع أو طي القائمة الجانبية');
            btn.title = 'توسيع / طي القائمة';
            btn.textContent = '☰';
            btn.addEventListener('click', function () {
                const expanded = sidebar.classList.toggle('rail-expanded');
                const bd = document.getElementById('appShellBackdrop');
                if (bd) bd.classList.toggle('open', expanded);
            });
            sidebar.insertBefore(btn, sidebar.firstChild);
        }

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && sidebar.classList.contains('rail-expanded')) {
                sidebar.classList.remove('rail-expanded');
                const bd = document.getElementById('appShellBackdrop');
                if (bd) bd.classList.remove('open');
            }
        });

        sidebar.querySelectorAll('.nav-item').forEach(function (item) {
            const labelSpan = item.querySelector('span:not(.icon):not(.nav-icon)');
            const txt = labelSpan ? labelSpan.textContent.trim() : item.textContent.trim();
            if (txt && !item.getAttribute('title')) {
                item.setAttribute('title', txt);
            }
            item.addEventListener('click', function () {
                if (sidebar.classList.contains('rail-expanded')) {
                    sidebar.classList.remove('rail-expanded');
                    const bd = document.getElementById('appShellBackdrop');
                    if (bd) bd.classList.remove('open');
                }
            });
        });
    }

    function syncMobileMoreMenuFromSidebar() {
        const moreItems = document.querySelector('#moreMenu .more-menu-items');
        const sidebarItems = document.querySelectorAll('.sidebar-nav .nav-item');
        if (!moreItems || !sidebarItems.length) return;

        const bottomPages = new Set();
        document.querySelectorAll('.bottom-nav .bottom-nav-item[data-page]').forEach(function (el) {
            const p = el.getAttribute('data-page');
            if (p && p !== 'more') bottomPages.add(p);
        });

        const existingMorePages = new Set();
        moreItems.querySelectorAll('.more-menu-item[data-page]').forEach(function (el) {
            const p = el.getAttribute('data-page');
            if (p) existingMorePages.add(p);
        });

        const logoutItem = moreItems.querySelector('.more-menu-item.logout');

        sidebarItems.forEach(function (nav) {
            const page = nav.getAttribute('data-page');
            if (!page || bottomPages.has(page) || existingMorePages.has(page)) return;

            const iconEl = nav.querySelector('.icon, .nav-icon');
            const labelEl = nav.querySelector('span:not(.icon):not(.nav-icon)');
            const iconText = iconEl ? iconEl.textContent.trim() : '•';
            const labelText = labelEl ? labelEl.textContent.trim() : page;

            const a = document.createElement('a');
            a.href = '#';
            a.className = 'more-menu-item';
            a.setAttribute('data-page', page);
            a.innerHTML = '<span>' + iconText + '</span> ' + labelText;
            a.addEventListener('click', function (e) {
                e.preventDefault();
                if (typeof window.closeMoreMenu === 'function') window.closeMoreMenu();
                nav.click();
            });

            if (logoutItem) {
                moreItems.insertBefore(a, logoutItem);
            } else {
                moreItems.appendChild(a);
            }
            existingMorePages.add(page);
        });
    }

    function enhanceTablesAndLabels() {
        const tables = document.querySelectorAll('.main-content table, .modal table');
        tables.forEach(function (tbl) {
            if (tbl.closest('.tree-canvas, .tree-viewport, [data-no-responsive-table="1"]')) return;

            if (!tbl.closest('.table-responsive-wrap, .table-container')) {
                const parent = tbl.parentElement;
                if (parent) {
                    const wrap = document.createElement('div');
                    wrap.className = 'table-responsive-wrap';
                    parent.insertBefore(wrap, tbl);
                    wrap.appendChild(tbl);
                }
            }

            const ths = Array.from(tbl.querySelectorAll('thead th')).map(function (th) {
                return th.textContent.trim();
            });
            if (!ths.length) return;

            tbl.setAttribute('data-has-labels', '1');
            tbl.querySelectorAll('tbody tr').forEach(function (tr) {
                const cells = tr.querySelectorAll('td');
                if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                    cells[0].setAttribute('data-label', '');
                    return;
                }
                cells.forEach(function (td, idx) {
                    if (!td.getAttribute('data-label') && ths[idx]) {
                        td.setAttribute('data-label', ths[idx]);
                    }
                });
            });
        });
    }

    let rafPending = false;
    function scheduleEnhance() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(function () {
            rafPending = false;
            enhanceTablesAndLabels();
            syncMobileMoreMenuFromSidebar();
        });
    }

    function boot() {
        setupRailToggle();
        syncMobileMoreMenuFromSidebar();
        enhanceTablesAndLabels();

        const target = document.querySelector('.main-content') || document.body;
        if (target && typeof MutationObserver !== 'undefined') {
            const obs = new MutationObserver(scheduleEnhance);
            obs.observe(target, { childList: true, subtree: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.AppShell = {
        refresh: scheduleEnhance,
        syncMoreMenu: syncMobileMoreMenuFromSidebar,
        enhanceTables: enhanceTablesAndLabels
    };
})();
