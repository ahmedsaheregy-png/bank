/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — SOVEREIGN ADMIN FULL CIRCULAR TREE EXPLORER
 * Authoritative PostgreSQL Binary & Multi-Leader Tree (`get_admin_full_tree`)
 * Features:
 *   - Full tree starting from Company Root #0 (all direct leaders + full binary subtrees)
 *   - Default Circular Nodes View (⭕ دوائر) + Switchable Cards View (🪪 بطاقات)
 *   - Smooth SVG Bézier connectors + Google-Earth 2D Pan/Zoom + Auto-Fit + HUD D-Pad
 *   - Focus/Drill-down on any member #N + Ancestor Breadcrumb + S01 Stopper inspection
 *   - Country Lens Filter, Month Period Picker, Depth Window, Live Search & Smart Table
 *   - RBAC-aware Admin Action Modal (Focus, Password Reset, Tombstone Ban/Unban)
 * ============================================================================
 */
(function () {
    'use strict';

    const STATE = {
        rootCode: 0,
        periodYm: '',
        countryCode: '',
        maxDepth: 15,
        viewMode: 'circles', // 'circles' | 'cards'
        colorFilter: 'ALL',
        searchQuery: '',
        zoom: 1,
        panX: 0,
        panY: 16,
        autoFitPending: true,
        data: null,
        loading: false,
        error: null
    };

    const VISUAL_PALETTE = {
        ROOT: {
            bg: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)',
            solidBg: '#064e3b',
            softBg: '#ecfdf5',
            border: '#facc15',
            text: '#064e3b',
            circleText: '#ffffff',
            icon: '👑',
            label: 'جذر الشركة'
        },
        GREEN: {
            bg: '#059669',
            solidBg: '#059669',
            softBg: '#ecfdf5',
            border: '#10b981',
            text: '#064e3b',
            circleText: '#ffffff',
            icon: '🟢',
            label: 'مؤهل'
        },
        ORANGE: {
            bg: '#d97706',
            solidBg: '#d97706',
            softBg: '#fffbeb',
            border: '#f59e0b',
            text: '#78350f',
            circleText: '#ffffff',
            icon: '🟠',
            label: 'قيد التجميع'
        },
        WHITE: {
            bg: '#ffffff',
            solidBg: '#ffffff',
            softBg: '#ffffff',
            border: '#64748b',
            text: '#0f172a',
            circleText: '#0f172a',
            icon: '⚪',
            label: '0/100'
        },
        GRAY: {
            bg: '#475569',
            solidBg: '#475569',
            softBg: '#f1f5f9',
            border: '#94a3b8',
            text: '#334155',
            circleText: '#f1f5f9',
            icon: '🔘',
            label: 'فريق رديف'
        },
        BLACK: {
            bg: '#020617',
            solidBg: '#020617',
            softBg: '#0f172a',
            border: '#334155',
            text: '#cbd5e1',
            circleText: '#94a3b8',
            icon: '⬛',
            label: 'خارج العدسة'
        },
        BANNED: {
            bg: '#991b1b',
            solidBg: '#991b1b',
            softBg: '#fef2f2',
            border: '#ef4444',
            text: '#7f1d1d',
            circleText: '#ffffff',
            icon: '⛔',
            label: 'محظور'
        }
    };

    function esc(v) {
        if (typeof window.svEsc === 'function') return window.svEsc(v);
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmt2(n) {
        return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function toast(msg, isErr) {
        if (typeof window.svAdminToast === 'function') {
            window.svAdminToast(msg, isErr);
            return;
        }
        if (isErr) console.error(msg);
        else console.log(msg);
    }

    function curAdmin() {
        return (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedAdmin()) || window.currentAdmin || null;
    }

    function isAuditorOnly() {
        const adm = curAdmin();
        return Boolean(adm && String(adm.role || '').toLowerCase() === 'auditor');
    }

    function countryFlag(cc, size) {
        const clean = String(cc || '').trim().toUpperCase();
        if (!/^[A-Z]{2}$/.test(clean)) return '🌐';
        if (window.SAWYAN && window.SAWYAN.Flags && typeof window.SAWYAN.Flags.svg === 'function') {
            return window.SAWYAN.Flags.svg(clean, size || 16);
        }
        return clean;
    }

    function safeAvatarUrl(raw) {
        const val = String(raw || '').trim();
        if (!val) return '';
        if (window.SAWYAN && window.SAWYAN.ImageUpload && typeof window.SAWYAN.ImageUpload.isSafeMediaUrl === 'function') {
            return window.SAWYAN.ImageUpload.isSafeMediaUrl(val) ? val : '';
        }
        return /^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(val) ? val : '';
    }

    function memberInitials(name, code) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return '#' + Number(code || 0);
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function sideLabelAr(side, memberCode) {
        if (Number(memberCode) === 0) return '👑 الجذر التأسيسي';
        if (side === 'root_direct') return '👑 قائد جيل أول (#0)';
        if (side === 'right') return 'يمين';
        if (side === 'left') return 'يسار';
        return side || '—';
    }

    function kycBadgeHtml(status) {
        if (status === 'verified') return '<span class="badge badge-success">✅ موثّق</span>';
        if (status === 'pending') return '<span class="badge badge-warning">⏳ قيد المراجعة</span>';
        if (status === 'rejected') return '<span class="badge badge-danger">❌ مرفوض</span>';
        return '<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:700;">غير موثّق</span>';
    }

    function currentDefaultPeriodYm() {
        const d = new Date();
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    function mountSidebarLink() {
        const nav = document.querySelector('.sidebar-nav');
        const contentArea = document.getElementById('contentArea');
        if (!nav || !contentArea) return;

        let link = document.getElementById('svAdminTreeNavItem');
        if (!link) {
            link = document.createElement('a');
            link.href = '#';
            link.id = 'svAdminTreeNavItem';
            link.className = 'nav-item';
            link.dataset.page = 'networkTree';
            link.innerHTML = '<span class="icon">🌳</span><span>الشجرة الكاملة</span>';
            const memLink = nav.querySelector('.nav-item[data-page="members"]');
            if (memLink && memLink.nextSibling) nav.insertBefore(link, memLink.nextSibling);
            else nav.appendChild(link);
        }

        if (!link.dataset.atreeBound) {
            link.dataset.atreeBound = '1';
            link.addEventListener('click', function (e) {
                e.preventDefault();
                window.openAdminNetworkTree(STATE.rootCode);
            });
        }

        let pg = document.getElementById('networkTreePage');
        if (!pg) {
            pg = document.createElement('div');
            pg.id = 'networkTreePage';
            pg.className = 'page';
            pg.setAttribute('data-spec-id', 'admin-network-tree');
            contentArea.appendChild(pg);
        } else {
            pg.setAttribute('data-spec-id', 'admin-network-tree');
        }

        if (window.SAWYAN && window.SAWYAN.AppShell && typeof window.SAWYAN.AppShell.syncMoreMenu === 'function') {
            window.SAWYAN.AppShell.syncMoreMenu();
        }
    }

    function buildChildrenMap(nodes) {
        const childrenByParent = new Map();
        const nodeByCode = new Map();
        for (const n of nodes) {
            nodeByCode.set(Number(n.member_code), n);
        }
        for (const n of nodes) {
            if (n.parent_member_code === null || n.parent_member_code === undefined) continue;
            const pCode = Number(n.parent_member_code);
            if (!nodeByCode.has(pCode) || Number(n.member_code) === Number(n.parent_member_code)) continue;
            if (!childrenByParent.has(pCode)) childrenByParent.set(pCode, []);
            childrenByParent.get(pCode).push(n);
        }
        childrenByParent.forEach((arr, parentCode) => {
            arr.sort((a, b) => {
                if (Number(parentCode) === 0) {
                    return Number(a.member_code) - Number(b.member_code);
                }
                const rank = (s) => (s === 'right' ? 0 : s === 'left' ? 1 : 2);
                const rDiff = rank(a.placement_side) - rank(b.placement_side);
                return rDiff !== 0 ? rDiff : Number(a.member_code) - Number(b.member_code);
            });
        });
        return { childrenByParent, nodeByCode };
    }

    function nodeMatchesFilters(node, searchQ) {
        if (STATE.colorFilter !== 'ALL') {
            const vc = node.visual_color || node.node_color;
            if (Number(node.member_code) > 0 && vc !== STATE.colorFilter) return false;
        }
        if (searchQ) {
            const hay = `${node.member_code} ${node.full_name || ''} ${node.phone || ''} ${node.residency_country_code || ''} ${node.email || ''}`.toLowerCase();
            if (!hay.includes(searchQ)) return false;
        }
        return true;
    }

    function renderSingleTreeNodeHtml(n, isViewRoot, searchQ) {
        const code = Number(n.member_code);
        const isCompanyRoot = code === 0;
        const pCode = (n.parent_member_code === null || n.parent_member_code === undefined || isViewRoot)
            ? ''
            : Number(n.parent_member_code);
        const vColor = n.visual_color || n.node_color || 'WHITE';
        const pal = VISUAL_PALETTE[vColor] || VISUAL_PALETTE.WHITE;
        const pctVal = Math.round(Number(n.target_pct || 0));
        const subTotal = Number(n.subtree_total || 0);

        const hasSearch = Boolean(searchQ);
        const hay = `${code} ${n.full_name || ''} ${n.phone || ''} ${n.residency_country_code || ''}`.toLowerCase();
        const searchHit = !hasSearch || hay.includes(searchQ);
        const colorHit = STATE.colorFilter === 'ALL' || isCompanyRoot || vColor === STATE.colorFilter;
        const isDimmed = (hasSearch && !searchHit) || (!colorHit && !isViewRoot);
        const isHighlighted = (hasSearch && searchHit) || (STATE.colorFilter !== 'ALL' && colorHit && !isCompanyRoot);

        const wrapClasses = [
            'atree-node-wrap',
            isDimmed ? 'atree-dimmed' : '',
            isHighlighted ? 'atree-highlighted' : ''
        ].filter(Boolean).join(' ');

        const avatarUrl = !isCompanyRoot ? safeAvatarUrl(n.avatar_url) : '';
        const flagHtml = n.residency_country_code ? countryFlag(n.residency_country_code, 14) : '';

        if (STATE.viewMode === 'circles') {
            let mainBadge;
            let subBadge;
            if (isCompanyRoot) {
                mainBadge = '👑 #0';
                subBadge = 'الجذر';
            } else if (vColor === 'BANNED') {
                mainBadge = `#${code}`;
                subBadge = '⛔ محظور';
            } else if (n.stopper_slot) {
                mainBadge = esc(n.stopper_slot);
                subBadge = `#${code} ${esc(n.residency_country_code || '')}`;
            } else {
                mainBadge = `#${code}`;
                subBadge = `${esc(n.residency_country_code || '')} ${pctVal}%`;
            }

            const discClasses = [
                'tree-circle-disc',
                'atree-node-anchor',
                isViewRoot ? 'c-root-disc' : '',
                isCompanyRoot ? 'atree-disc-company-root' : '',
                avatarUrl ? 'atree-disc-has-avatar' : ''
            ].filter(Boolean).join(' ');

            const sidePill = isCompanyRoot
                ? `🏢 ${subTotal} عضو`
                : (n.placement_side === 'root_direct'
                    ? `${flagHtml} 👑 قائد${subTotal > 0 ? ' +' + subTotal : ''}`
                    : `${flagHtml} ${n.placement_side === 'right' ? 'يمين' : 'يسار'}${subTotal > 0 ? ' +' + subTotal : ''}`);

            const discInner = avatarUrl
                ? `<img src="${esc(avatarUrl)}" alt="${esc(n.full_name || ('#' + code))}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.remove();" />` +
                  `<span style="position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.88);color:#ffffff;font-size:0.62rem;font-weight:800;padding:1px 6px;border-radius:999px;white-space:nowrap;border:1px solid ${pal.border};">${mainBadge}</span>`
                : `<span style="font-size:${isCompanyRoot ? '0.92rem' : '0.84rem'};line-height:1.1;">${mainBadge}</span>` +
                  `<span style="font-size:0.63rem;opacity:0.92;margin-top:2px;">${subBadge}</span>`;

            return (
                `<div class="${wrapClasses}" data-code="${code}" data-parent="${pCode}" data-side="${esc(n.placement_side || '')}" data-vcolor="${esc(vColor)}" data-hay="${esc(hay)}" onclick="openAdminTreeNodeModal(${code})">` +
                    `<div class="${discClasses}" style="position:relative;overflow:${avatarUrl ? 'visible' : 'hidden'};background:${pal.bg};border-color:${pal.border};color:${pal.circleText};">` +
                        discInner +
                    `</div>` +
                    `<div class="atree-node-caption">` +
                        `<div class="atree-node-name" title="#${code} ${esc(n.full_name || '')}">${isCompanyRoot ? 'شركة SAWYAN (#0)' : esc(n.full_name || '')}</div>` +
                        `<div class="atree-node-subtag" style="display:inline-flex;align-items:center;justify-content:center;gap:4px;">${sidePill}</div>` +
                    `</div>` +
                `</div>`
            );
        }

        // Cards Mode
        const topBadge = isCompanyRoot
            ? '👑 الجذر #0'
            : (vColor === 'BANNED' ? '⛔ محظور' : (n.stopper_slot ? esc(n.stopper_slot) : `${pal.icon} ${pal.label}`));
        const cardAvatarHtml = isCompanyRoot
            ? `<span style="width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#064e3b;color:#facc15;font-size:0.88rem;flex-shrink:0;">👑</span>`
            : (avatarUrl
                ? `<img src="${esc(avatarUrl)}" alt="${esc(n.full_name || '')}" loading="lazy" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid ${pal.border};flex-shrink:0;" onerror="this.remove();" />`
                : `<span style="width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:${pal.solidBg === '#ffffff' ? '#e2e8f0' : pal.solidBg};color:${vColor === 'WHITE' ? '#0f172a' : pal.circleText};font-size:0.72rem;font-weight:800;flex-shrink:0;">${esc(memberInitials(n.full_name, code))}</span>`);
        return (
            `<div class="${wrapClasses}" data-code="${code}" data-parent="${pCode}" data-side="${esc(n.placement_side || '')}" data-vcolor="${esc(vColor)}" data-hay="${esc(hay)}" onclick="openAdminTreeNodeModal(${code})">` +
                `<div class="atree-card-box atree-node-anchor" style="background:${pal.softBg};border:2px solid ${pal.border};color:${pal.text};">` +
                    `<div class="atree-card-head">` +
                        `<strong style="display:inline-flex;align-items:center;gap:5px;">${cardAvatarHtml}<span>#${code}</span> ${flagHtml}</strong>` +
                        `<span class="atree-card-pill" style="background:${pal.solidBg === '#ffffff' ? '#64748b' : pal.solidBg};color:${vColor === 'WHITE' ? '#ffffff' : pal.circleText};">${topBadge}</span>` +
                    `</div>` +
                    `<div class="atree-card-title">${isCompanyRoot ? 'شركة SAWYAN العالمية' : esc(n.full_name || '')}</div>` +
                    `<div class="atree-card-meta">` +
                        `<span>${sideLabelAr(n.placement_side, code)}</span>` +
                        `<span>${isCompanyRoot ? `فريق ${subTotal}` : `${pctVal}% • $${fmt2(n.wallet_balance_usd)}`}</span>` +
                    `</div>` +
                    (subTotal > 0 ? `<div class="atree-card-sub">🌳 تحته: <b>${subTotal}</b> (${Number(n.subtree_right || 0)} يمين / ${Number(n.subtree_left || 0)} يسار)</div>` : '') +
                `</div>` +
            `</div>`
        );
    }

    function renderBranchRecursive(node, childrenByParent, viewRootCode, searchQ, visited) {
        const code = Number(node.member_code);
        if (visited.has(code)) return '';
        visited.add(code);

        const kids = childrenByParent.get(code) || [];
        const nodeHtml = renderSingleTreeNodeHtml(node, code === Number(viewRootCode), searchQ);
        if (!kids.length) {
            return `<div class="atree-branch">${nodeHtml}</div>`;
        }
        const kidsHtml = kids.map((k) => renderBranchRecursive(k, childrenByParent, viewRootCode, searchQ, visited)).join('');
        return (
            `<div class="atree-branch">` +
                nodeHtml +
                `<div class="atree-children">${kidsHtml}</div>` +
            `</div>`
        );
    }

    function renderTreeTableRows(filteredNodes) {
        if (!filteredNodes.length) {
            return '<tr><td colspan="8" class="empty-state">لا توجد نتائج مطابقة للفلتر أو البحث الحالي.</td></tr>';
        }
        return filteredNodes.slice(0, 150).map((n) => {
            const code = Number(n.member_code);
            const vColor = n.visual_color || n.node_color || 'WHITE';
            const pal = VISUAL_PALETTE[vColor] || VISUAL_PALETTE.WHITE;
            const wa = n.phone ? String(n.phone).replace(/\D/g, '') : '';
            const statusText = n.stopper_slot ? `مقعد ${esc(n.stopper_slot)}` : `${pal.icon} ${pal.label}`;
            return (
                `<tr onclick="openAdminTreeNodeModal(${code})" style="cursor:pointer;">` +
                    `<td data-label="العضو"><b>#${code} ${esc(n.full_name)}</b>${wa ? `<div style="font-size:0.73rem;color:#047857;direction:ltr;text-align:right;">${esc(n.phone)}</div>` : ''}</td>` +
                    `<td data-label="الحالة بالشجرة"><span style="font-weight:800;">${statusText}</span></td>` +
                    `<td data-label="الجيل / الجانب">الجيل #${Number(n.company_gen || 0)} • ${sideLabelAr(n.placement_side, code)}</td>` +
                    `<td data-label="الأب / الراعي">${n.parent_member_code !== null && n.parent_member_code !== undefined ? `أب #${n.parent_member_code}` : '—'}${n.sponsor_code !== null && n.sponsor_code !== undefined ? ` • راعي #${n.sponsor_code}` : ''}</td>` +
                    `<td data-label="الدولة">${countryFlag(n.residency_country_code)} ${esc(n.residency_country_code || '')}</td>` +
                    `<td data-label="الصندوق والمحفظة"><b>${Number(n.target_pct || 0)}%</b> <small style="color:#64748b;">($${fmt2(n.box_accumulated_usd)}/$${fmt2(n.target_required_usd)})</small><div style="font-size:0.73rem;color:#059669;">محفظة: $${fmt2(n.wallet_balance_usd)}</div></td>` +
                    `<td data-label="حجم فريقه"><b>${Number(n.subtree_total || 0) + 1}</b> <small>(هو + ${Number(n.subtree_total || 0)} • ${Number(n.subtree_right || 0)} يمين / ${Number(n.subtree_left || 0)} يسار)</small></td>` +
                    `<td data-label="إجراءات" onclick="event.stopPropagation();"><div style="display:flex;gap:5px;flex-wrap:wrap;">` +
                        `<button type="button" class="btn-sm btn-primary" onclick="openAdminNetworkTree(${code})">🎯 تمركز</button>` +
                        `<button type="button" class="btn-sm btn-outline" onclick="openAdminTreeNodeModal(${code})">🪪 تفاصيل</button>` +
                    `</div></td>` +
                `</tr>`
            );
        }).join('');
    }

    function renderAdminTreeShell() {
        const page = document.getElementById('networkTreePage');
        if (!page) return;
        page.setAttribute('data-spec-id', 'admin-network-tree');
        page.setAttribute('data-tree-loading', STATE.loading ? '1' : '0');

        const d = STATE.data;
        const summary = (d && d.summary) || {};
        const rootNode = (d && d.root_node) || { member_code: STATE.rootCode, full_name: STATE.rootCode === 0 ? 'شركة SAWYAN (#0)' : `#${STATE.rootCode}` };
        const nodes = (d && Array.isArray(d.nodes)) ? d.nodes : [];
        const countries = (d && Array.isArray(d.country_breakdown)) ? d.country_breakdown : [];
        const breadcrumb = (d && Array.isArray(d.ancestors_breadcrumb)) ? d.ancestors_breadcrumb : [];
        const activePeriod = STATE.periodYm || (d && d.period_ym) || currentDefaultPeriodYm();
        const activeLens = (d && d.lens_country_code) || (STATE.countryCode || 'ALL');
        const adminScope = (d && d.admin_country_scope) || 'GLOBAL';
        const searchQ = String(STATE.searchQuery || '').trim().toLowerCase();

        const { childrenByParent, nodeByCode } = buildChildrenMap(nodes);
        const rootEntry = nodeByCode.get(Number(rootNode.member_code)) || nodes[0] || null;
        const treeHtml = rootEntry
            ? renderBranchRecursive(rootEntry, childrenByParent, rootNode.member_code, searchQ, new Set())
            : (STATE.loading
                ? '<div style="padding:48px 24px;text-align:center;color:#0f172a;font-weight:800;">⏳ جاري تحميل خريطة الشجرة الكاملة من قاعدة البيانات الحية...</div>'
                : '<div style="padding:48px 24px;text-align:center;color:#64748b;font-weight:700;">لا توجد عقد للعرض في هذه الشجرة.</div>');

        const filteredTableNodes = nodes.filter((n) => {
            if (Number(n.member_code) === 0) return false;
            return nodeMatchesFilters(n, searchQ);
        });

        const s01Gens = Number(summary.s01_gens || 11);
        const isRoot0 = Number(rootNode.member_code) === 0;
        const companyTotal = Number(summary.company_total_members || 0);
        const subtreeTotal = Number(summary.subtree_total_members || 0);
        const renderedCount = Number(summary.rendered_nodes_count || nodes.length || 0);

        page.innerHTML =
            '<!-- شريط عدسات الدول وإعدادات التمركز للإدارة -->' +
            '<div class="country-lens-bar-dark">' +
                '<div style="color:#f8fafc;font-size:0.86rem;font-weight:800;">' +
                    '🔭 <strong>عدسة الشجرة الإدارية الكاملة:</strong> ' +
                    '<span style="color:#94a3b8;font-weight:600;font-size:0.78rem;">' +
                        (adminScope !== 'GLOBAL'
                            ? `نطاق الموظف مقفل على (${esc(adminScope)})`
                            : `العدسة (${esc(activeLens)}) • اضغط على أي دائرة لعرض الملف الإداري أو التمركز`) +
                    '</span>' +
                '</div>' +
                '<div data-spec-id="admin-tree-lens-bar" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                    (adminScope === 'GLOBAL'
                        ? `<button type="button" class="lens-pill-btn ${activeLens === 'ALL' ? 'active' : ''}" onclick="setAdminTreeCountryLens('')">🌐 كل الدول (${companyTotal})</button>`
                        : '') +
                    countries.map((c) => {
                        const isAct = activeLens === c.country_code;
                        const cName = (c.country_name_i18n && c.country_name_i18n.ar) || c.country_code;
                        return `<button type="button" class="lens-pill-btn ${isAct ? 'active' : ''}" onclick="setAdminTreeCountryLens('${esc(c.country_code)}')">${countryFlag(c.country_code)} ${esc(cName)} (${Number(c.total_members || 0)})</button>`;
                    }).join('') +
                '</div>' +
            '</div>' +

            '<!-- بطاقة المؤشرات العليا ومسار التصفح -->' +
            '<div data-spec-id="admin-tree-kpis" style="background:linear-gradient(135deg,#0f172a 0%,#064e3b 100%);color:#ffffff;border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 8px 24px rgba(15,23,42,0.2);border:1px solid rgba(16,185,129,0.35);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">' +
                    '<div>' +
                        `<h2 style="margin:0;font-size:1.14rem;font-weight:900;color:#34d399;">🌳 ${isRoot0 ? 'الشجرة الكاملة للمنصة من الجذر (#0)' : `شجرة العضو #${Number(rootNode.member_code)} — ${esc(rootNode.full_name || '')}`}</h2>` +
                        '<div style="font-size:0.79rem;color:#cbd5e1;margin-top:3px;">' +
                            `الشهر المحاسبي: <b style="color:#fde047;">${esc(activePeriod)}</b> • أقصى عمق بالشجرة: <b>${Number(summary.max_depth_in_subtree || 0)}</b> • العقد المعروضة: <b>${renderedCount}</b>` +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                        '<input type="month" id="adminTreePeriodInput" value="' + esc(activePeriod) + '" class="form-control" style="width:auto;padding:5px 9px;font-size:0.8rem;background:#0f172a;color:#f8fafc;border-color:#334155;" onchange="setAdminTreePeriod(this.value)">' +
                        '<select id="adminTreeDepthSelect" class="form-control" style="width:auto;padding:5px 9px;font-size:0.8rem;background:#0f172a;color:#f8fafc;border-color:#334155;" onchange="setAdminTreeDepth(this.value)">' +
                            [6, 11, 15, 25, 40].map((dp) => `<option value="${dp}" ${Number(STATE.maxDepth) === dp ? 'selected' : ''}>عمق ${dp} جيل</option>`).join('') +
                        '</select>' +
                        (!isRoot0 ? '<button type="button" class="lens-pill-btn" style="background:#fbbf24;color:#0f172a;border-color:#fde047;" onclick="openAdminNetworkTree(0)">👑 العودة للجذر #0</button>' : '') +
                    '</div>' +
                '</div>' +

                (breadcrumb.length > 1
                    ? '<div class="atree-breadcrumb">' +
                        '<span style="color:#94a3b8;font-size:0.76rem;font-weight:800;">مسار النسب:</span>' +
                        breadcrumb.map((b, idx) => {
                            const isLast = idx === breadcrumb.length - 1;
                            const lbl = Number(b.member_code) === 0 ? '👑 #0 الجذر' : `#${b.member_code} ${esc(b.full_name || '')}`;
                            return `<button type="button" class="atree-crumb-btn ${isLast ? 'active' : ''}" onclick="openAdminNetworkTree(${Number(b.member_code)})">${lbl}</button>`;
                        }).join('<span style="color:#64748b;">◂</span>') +
                      '</div>'
                    : '') +

                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;text-align:center;">' +
                    '<div style="background:rgba(255,255,255,0.08);padding:9px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);">' +
                        '<div style="font-size:0.75rem;color:#e2e8f0;font-weight:800;">إجمالي أعضاء المنصة</div>' +
                        `<strong style="display:block;font-size:1.28rem;color:#ffffff;margin:2px 0;">${companyTotal}</strong>` +
                        `<div style="font-size:0.71rem;color:#fde68a;">+ الجذر #0 (${companyTotal + 1} عقدة)</div>` +
                    '</div>' +
                    '<div style="background:rgba(255,255,255,0.08);padding:9px;border-radius:12px;border:1px solid rgba(255,255,255,0.16);">' +
                        `<div style="font-size:0.75rem;color:#e2e8f0;font-weight:800;">${isRoot0 ? 'قادة الجيل الأول تحت #0' : 'حجم الشجرة المتمركزة'}</div>` +
                        `<strong style="display:block;font-size:1.28rem;color:#34d399;margin:2px 0;">${isRoot0 ? Number(summary.direct_root_leaders_count || 0) : (subtreeTotal + 1)}</strong>` +
                        `<div style="font-size:0.71rem;color:#cbd5e1;">${isRoot0 ? 'فروع تأسيسية مباشرة' : `هو + ${subtreeTotal} (يمين ${Number(summary.right_arm_count || 0)} • يسار ${Number(summary.left_arm_count || 0)})`}</div>` +
                    '</div>' +
                    '<div style="background:rgba(16,185,129,0.18);padding:9px;border-radius:12px;border:1px solid rgba(52,211,153,0.45);">' +
                        '<div style="font-size:0.75rem;color:#a7f3d0;font-weight:800;">🟢 مؤهلون (100%)</div>' +
                        `<strong style="display:block;font-size:1.28rem;color:#34d399;margin:2px 0;">${Number(summary.green_count || 0)}</strong>` +
                        '<div style="font-size:0.71rem;color:#ecfdf5;">أكملوا صندوق الهدف</div>' +
                    '</div>' +
                    '<div style="background:rgba(245,158,11,0.18);padding:9px;border-radius:12px;border:1px solid rgba(251,191,36,0.45);">' +
                        '<div style="font-size:0.75rem;color:#fde68a;font-weight:800;">🟠 قيد التجميع</div>' +
                        `<strong style="display:block;font-size:1.28rem;color:#fde047;margin:2px 0;">${Number(summary.orange_count || 0)}</strong>` +
                        '<div style="font-size:0.71rem;color:#fef3c7;">مشتريات جزئية / كاري أون</div>' +
                    '</div>' +
                    '<div style="background:rgba(148,163,184,0.14);padding:9px;border-radius:12px;border:1px solid rgba(148,163,184,0.35);">' +
                        '<div style="font-size:0.75rem;color:#e2e8f0;font-weight:800;">⚪ 0% / ⛔ محظور</div>' +
                        `<strong style="display:block;font-size:1.28rem;color:#f1f5f9;margin:2px 0;">${Number(summary.white_count || 0)} <small style="color:#fca5a5;">/ ${Number(summary.banned_count || 0)}</small></strong>` +
                        '<div style="font-size:0.71rem;color:#cbd5e1;">بدون شراء / محظورين</div>' +
                    '</div>' +
                '</div>' +
                (summary.truncated
                    ? `<div style="margin-top:10px;background:rgba(245,158,11,0.22);border:1px solid #fbbf24;color:#fef3c7;padding:7px 12px;border-radius:10px;font-size:0.78rem;font-weight:700;">⚠️ تم عرض أول ${renderedCount} عقدة من أصل ${subtreeTotal} لحماية أداء المتصفح — اضغط على أي دائرة أو أدخل كود عضو أعلاه للتمركز داخل فرعه بالكامل.</div>`
                    : '') +
            '</div>' +

            (STATE.error
                ? `<div style="background:#fef2f2;border:1.5px solid #ef4444;color:#991b1b;padding:12px 16px;border-radius:12px;margin-bottom:12px;font-weight:800;">⛔ ${esc(STATE.error)}</div>`
                : '') +

            '<!-- شريط أدوات الشجرة الداكن + التبديل بين الدوائر والبطاقات -->' +
            '<div class="tree-toolbar-dark">' +
                '<div data-spec-id="admin-tree-controls" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                    `<input type="search" id="adminTreeSearchInput" class="form-control" style="max-width:210px;padding:6px 10px;font-size:0.82rem;" placeholder="🔍 ابحث بالكود أو الاسم أو الهاتف..." value="${esc(STATE.searchQuery)}">` +
                    '<div style="display:inline-flex;gap:4px;align-items:center;">' +
                        '<input type="number" id="adminTreeJumpCodeInput" min="0" class="form-control" style="width:92px;padding:6px 8px;font-size:0.8rem;" placeholder="# كود">' +
                        '<button type="button" class="lens-pill-btn" onclick="jumpAdminTreeToInput()">🎯 تمركز</button>' +
                    '</div>' +
                    '<button type="button" class="lens-pill-btn" onclick="adjustAdminTreeZoom(0.14)">➕ تكبير</button>' +
                    '<button type="button" class="lens-pill-btn" onclick="adjustAdminTreeZoom(-0.14)">➖ تصغير</button>' +
                    '<button type="button" class="lens-pill-btn" onclick="fitAdminTreeViewport()">📐 ملائمة</button>' +
                    `<button type="button" class="lens-pill-btn" onclick="resetAdminTreeViewport()">⌖ تمركز (${Math.round(STATE.zoom * 100)}%)</button>` +
                '</div>' +
                '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
                    '<div data-spec-id="admin-tree-view-toggle" id="adminTreeViewToggle" style="display:inline-flex;gap:4px;">' +
                        `<button type="button" class="lens-pill-btn ${STATE.viewMode === 'circles' ? 'active' : ''}" onclick="setAdminTreeViewMode('circles')">⭕ دوائر</button>` +
                        `<button type="button" class="lens-pill-btn ${STATE.viewMode === 'cards' ? 'active' : ''}" onclick="setAdminTreeViewMode('cards')">🪪 بطاقات</button>` +
                    '</div>' +
                    '<button type="button" class="lens-pill-btn" onclick="refreshAdminNetworkTree()">🔄 تحديث حي</button>' +
                '</div>' +
                '<div style="width:100%;display:flex;gap:12px;flex-wrap:wrap;font-size:0.74rem;color:#cbd5e1;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);">' +
                    '<span>👑 الجذر #0</span>' +
                    '<span>🟢 مؤهل 100%</span>' +
                    '<span>🟠 قيد التجميع</span>' +
                    '<span>⚪ 0/100</span>' +
                    (isRoot0 ? '' : `<span>🔘 رديف (بعد ${s01Gens} مؤهل)</span>`) +
                    '<span>⬛ خارج العدسة</span>' +
                    '<span>⛔ محظور</span>' +
                '</div>' +
            '</div>' +

            '<!-- عدسة العرض ثنائية الأبعاد + أزرار HUD -->' +
            '<div id="adminTreeEarthViewport" data-spec-id="admin-tree-earth-viewport" class="tree-earth-viewport atree-viewport" style="border-radius:0 0 16px 16px;border-top:none;">' +
                '<div class="hud-dpad-panel" data-spec-id="admin-tree-hud-dpad" aria-label="وحدة تحكم الكاميرا">' +
                    '<div></div>' +
                    '<button type="button" class="hud-dpad-btn" onclick="panAdminTreeCamera(0, 90)" title="أعلى">▲</button>' +
                    '<button type="button" class="hud-dpad-btn" onclick="adjustAdminTreeZoom(0.14)" title="تكبير">+</button>' +
                    '<button type="button" class="hud-dpad-btn" onclick="panAdminTreeCamera(-100, 0)" title="يمين">◀</button>' +
                    '<button type="button" class="hud-dpad-btn" onclick="fitAdminTreeViewport()" title="ملائمة الشاشة">⌖</button>' +
                    '<button type="button" class="hud-dpad-btn" onclick="panAdminTreeCamera(100, 0)" title="يسار">▶</button>' +
                    '<div></div>' +
                    '<button type="button" class="hud-dpad-btn" onclick="panAdminTreeCamera(0, -90)" title="أسفل">▼</button>' +
                    '<button type="button" class="hud-dpad-btn" onclick="adjustAdminTreeZoom(-0.14)" title="تصغير">−</button>' +
                '</div>' +

                `<div id="adminTreeEarthStage" class="tree-earth-stage" style="transform: translate(calc(-50% + ${Math.round(STATE.panX)}px), ${Math.round(STATE.panY)}px) scale(${STATE.zoom});">` +
                    '<svg id="adminTreeSvgOverlay" style="position:absolute;top:0;left:0;pointer-events:none;z-index:0;"></svg>' +
                    `<div id="adminTreeNodesRoot" class="atree-root-container">${treeHtml}</div>` +
                '</div>' +
            '</div>' +

            '<!-- الجدول الذكي المصاحب لأعضاء الشجرة المعروضة -->' +
            '<div data-spec-id="admin-tree-detail-table" style="background:#ffffff;border:1px solid #cbd5e1;border-radius:14px;padding:14px;margin-top:16px;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">' +
                    `<strong id="adminTreeTableCount" style="font-size:0.98rem;">📋 سجل أعضاء الشجرة المعروضة (${filteredTableNodes.length})</strong>` +
                    '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                        [
                            ['ALL', 'الكل'],
                            ['GREEN', '🟢 مؤهل'],
                            ['ORANGE', '🟠 قيد التجميع'],
                            ['WHITE', '⚪ 0%'],
                            ...(isRoot0 ? [] : [['GRAY', '🔘 رديف']]),
                            ['BLACK', '⬛ خارج العدسة'],
                            ['BANNED', '⛔ محظور']
                        ].map(([k, lbl]) => `<button type="button" class="lens-pill-btn ${STATE.colorFilter === k ? 'active' : ''}" onclick="setAdminTreeColorFilter('${k}')">${lbl}</button>`).join('') +
                        '<button type="button" class="btn-sm btn-primary" onclick="exportAdminTreeCsv()">📥 تصدير CSV</button>' +
                    '</div>' +
                '</div>' +
                '<div class="table-responsive-wrap">' +
                    '<table class="data-table" data-has-labels="1">' +
                        '<thead><tr>' +
                            '<th>العضو</th><th>الحالة بالشجرة</th><th>الجيل / الجانب</th><th>الأب / الراعي</th><th>الدولة</th><th>الصندوق والمحفظة</th><th>حجم فريقه</th><th>إجراءات</th>' +
                        '</tr></thead>' +
                        `<tbody id="adminTreeTableBody">${renderTreeTableRows(filteredTableNodes)}</tbody>` +
                    '</table>' +
                '</div>' +
            '</div>';

        const sInput = document.getElementById('adminTreeSearchInput');
        if (sInput) {
            sInput.addEventListener('input', (e) => {
                STATE.searchQuery = e.target.value;
                applyAdminTreeHighlightsAndTable();
            });
        }

        const jInput = document.getElementById('adminTreeJumpCodeInput');
        if (jInput) {
            jInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    window.jumpAdminTreeToInput();
                }
            });
        }

        initAdminTreePanZoom();

        if (STATE.autoFitPending && nodes.length > 0) {
            STATE.autoFitPending = false;
            requestAnimationFrame(() => {
                fitAdminTreeToContainer(false);
                drawAdminTreeConnectors();
            });
        } else {
            requestAnimationFrame(drawAdminTreeConnectors);
        }
    }

    function applyAdminTreeHighlightsAndTable() {
        const searchQ = String(STATE.searchQuery || '').trim().toLowerCase();
        const rootEl = document.getElementById('adminTreeNodesRoot');
        if (rootEl) {
            rootEl.querySelectorAll('.atree-node-wrap').forEach((el) => {
                const code = Number(el.dataset.code || 0);
                const vColor = el.dataset.vcolor || 'WHITE';
                const hay = el.dataset.hay || '';
                const isRoot = Number(code) === Number(STATE.rootCode);
                const searchHit = !searchQ || hay.includes(searchQ);
                const colorHit = STATE.colorFilter === 'ALL' || code === 0 || vColor === STATE.colorFilter;
                const dimmed = (searchQ && !searchHit) || (!colorHit && !isRoot);
                const highlighted = (searchQ && searchHit) || (STATE.colorFilter !== 'ALL' && colorHit && code !== 0);
                el.classList.toggle('atree-dimmed', dimmed);
                el.classList.toggle('atree-highlighted', highlighted);
            });
        }

        const nodes = (STATE.data && Array.isArray(STATE.data.nodes)) ? STATE.data.nodes : [];
        const filtered = nodes.filter((n) => Number(n.member_code) !== 0 && nodeMatchesFilters(n, searchQ));
        const tbody = document.getElementById('adminTreeTableBody');
        const countEl = document.getElementById('adminTreeTableCount');
        if (tbody) tbody.innerHTML = renderTreeTableRows(filtered);
        if (countEl) countEl.textContent = `📋 سجل أعضاء الشجرة المعروضة (${filtered.length})`;
    }

    function applyStageTransform() {
        const stage = document.getElementById('adminTreeEarthStage');
        if (stage) {
            stage.style.transform = `translate(calc(-50% + ${Math.round(STATE.panX)}px), ${Math.round(STATE.panY)}px) scale(${STATE.zoom})`;
        }
    }

    function fitAdminTreeToContainer(redraw) {
        const vp = document.getElementById('adminTreeEarthViewport');
        const rootEl = document.getElementById('adminTreeNodesRoot');
        if (!vp || !rootEl) return;
        const vpW = vp.clientWidth || 800;
        const stageW = rootEl.scrollWidth || rootEl.offsetWidth || 400;
        const fitZoom = stageW > vpW - 40
            ? Math.max(0.24, Math.min(1, Number(((vpW - 44) / stageW).toFixed(2))))
            : 1;
        STATE.zoom = fitZoom;
        STATE.panX = 0;
        STATE.panY = 16;
        applyStageTransform();
        const resetBtn = document.querySelector('[onclick="resetAdminTreeViewport()"]');
        if (resetBtn) resetBtn.textContent = `⌖ تمركز (${Math.round(STATE.zoom * 100)}%)`;
        if (redraw !== false) {
            requestAnimationFrame(drawAdminTreeConnectors);
        }
    }

    function initAdminTreePanZoom() {
        const vp = document.getElementById('adminTreeEarthViewport');
        if (!vp) return;

        let dragging = false;
        let startX = 0;
        let startY = 0;
        let basePanX = STATE.panX;
        let basePanY = STATE.panY;

        vp.onpointerdown = (e) => {
            if (e.target.closest('.hud-dpad-panel, .atree-node-wrap, button, a, input, select')) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            basePanX = STATE.panX;
            basePanY = STATE.panY;
            vp.classList.add('panning');
        };
        vp.onpointermove = (e) => {
            if (!dragging) return;
            STATE.panX = basePanX + (e.clientX - startX);
            STATE.panY = basePanY + (e.clientY - startY);
            applyStageTransform();
        };
        vp.onpointerup = vp.onpointerleave = () => {
            dragging = false;
            vp.classList.remove('panning');
        };
        vp.onwheel = (e) => {
            // Phase 2 Zero Scroll-Jacking: allow normal page scroll unless Ctrl/Meta is held
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.07 : 0.07;
            STATE.zoom = Math.max(0.18, Math.min(1.80, Number((STATE.zoom + delta).toFixed(2))));
            applyStageTransform();
        };
    }

    function drawAdminTreeConnectors() {
        const svg = document.getElementById('adminTreeSvgOverlay');
        const rootEl = document.getElementById('adminTreeNodesRoot');
        if (!svg || !rootEl) return;

        const w = rootEl.scrollWidth || rootEl.offsetWidth || 800;
        const h = rootEl.scrollHeight || rootEl.offsetHeight || 400;
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.innerHTML = '';

        const scale = Math.max(0.1, Number(STATE.zoom || 1));
        const rootRect = rootEl.getBoundingClientRect();
        const wrapMap = new Map();
        rootEl.querySelectorAll('.atree-node-wrap').forEach((el) => {
            wrapMap.set(el.dataset.code, el);
        });

        const ns = 'http://www.w3.org/2000/svg';
        wrapMap.forEach((el) => {
            const parentCode = el.dataset.parent;
            if (!parentCode || !wrapMap.has(parentCode)) return;
            const pWrap = wrapMap.get(parentCode);
            const cAnchor = el.querySelector('.atree-node-anchor') || el;
            const pr = pWrap.getBoundingClientRect();
            const cr = cAnchor.getBoundingClientRect();

            const x1 = (pr.left - rootRect.left + pr.width / 2) / scale;
            const y1 = (pr.bottom - rootRect.top) / scale;
            const x2 = (cr.left - rootRect.left + cr.width / 2) / scale;
            const y2 = (cr.top - rootRect.top) / scale;
            const midY = (y1 + y2) / 2;

            const side = el.dataset.side || '';
            const stroke = Number(parentCode) === 0
                ? '#eab308'
                : (side === 'right' ? '#10b981' : '#64748b');

            const path = document.createElementNS(ns, 'path');
            path.setAttribute('d', `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${x1.toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${midY.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`);
            path.setAttribute('stroke', stroke);
            path.setAttribute('stroke-width', Number(parentCode) === 0 ? '2.2' : '1.8');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('fill', 'none');
            svg.appendChild(path);
        });
    }

    async function fetchAndRenderTree() {
        if (!window.SAWYAN || !window.SAWYAN.API) return;
        STATE.loading = true;
        STATE.error = null;
        renderAdminTreeShell();

        try {
            const res = await window.SAWYAN.API.getAdminFullTree({
                rootMemberCode: STATE.rootCode,
                periodYm: STATE.periodYm || null,
                countryCode: STATE.countryCode || null,
                maxDepth: STATE.maxDepth
            });
            STATE.data = res;
            if (res && res.period_ym && !STATE.periodYm) STATE.periodYm = res.period_ym;
            STATE.loading = false;
            renderAdminTreeShell();
        } catch (err) {
            STATE.loading = false;
            const msg = String((err && err.message) || err || 'خطأ في تحميل الشجرة الكاملة');
            if (/ADMIN_AUTH_REQUIRED|ADMIN_SESSION_INVALID|ADMIN_SESSION_EXPIRED|ADMIN_NOT_ACTIVE/.test(msg)) {
                window.SAWYAN.API.clearAdminSession();
                window.location.href = 'login.html';
                return;
            }
            STATE.error = msg;
            toast(msg, true);
            renderAdminTreeShell();
        }
    }

    window.openAdminNetworkTree = async function (rootCode, opts) {
        mountSidebarLink();
        if (rootCode !== undefined && rootCode !== null) {
            const parsed = Math.max(0, parseInt(rootCode, 10) || 0);
            if (parsed !== STATE.rootCode || (opts && opts.resetView)) {
                STATE.rootCode = parsed;
                STATE.panX = 0;
                STATE.panY = 16;
                STATE.zoom = 1;
                STATE.autoFitPending = true;
            }
        } else if (!STATE.data) {
            STATE.autoFitPending = true;
        }
        if (opts && opts.countryCode !== undefined) STATE.countryCode = opts.countryCode || '';
        if (opts && opts.periodYm !== undefined) STATE.periodYm = opts.periodYm || '';

        document.querySelectorAll('.nav-item').forEach((n) => {
            n.classList.toggle('active', n.dataset.page === 'networkTree');
        });
        document.querySelectorAll('.page').forEach((p) => {
            p.classList.toggle('active', p.id === 'networkTreePage');
        });
        const titleEl = document.getElementById('pageTitle');
        if (titleEl) titleEl.textContent = window.innerWidth <= 768 ? '🌳 الشجرة الكاملة' : '🌳 الشجرة الدولية الكاملة';

        await fetchAndRenderTree();
    };

    window.refreshAdminNetworkTree = async function () {
        await fetchAndRenderTree();
    };

    window.setAdminTreeCountryLens = async function (cc) {
        STATE.countryCode = cc || '';
        await fetchAndRenderTree();
    };

    window.setAdminTreePeriod = async function (ym) {
        STATE.periodYm = ym || '';
        await fetchAndRenderTree();
    };

    window.setAdminTreeDepth = async function (dp) {
        STATE.maxDepth = Math.max(1, Math.min(40, parseInt(dp, 10) || 15));
        STATE.autoFitPending = true;
        await fetchAndRenderTree();
    };

    window.setAdminTreeViewMode = function (mode) {
        STATE.viewMode = mode === 'cards' ? 'cards' : 'circles';
        STATE.autoFitPending = true;
        renderAdminTreeShell();
    };

    window.setAdminTreeColorFilter = function (f) {
        STATE.colorFilter = f || 'ALL';
        renderAdminTreeShell();
    };

    window.adjustAdminTreeZoom = function (delta) {
        STATE.zoom = Math.max(0.18, Math.min(1.80, Number((STATE.zoom + delta).toFixed(2))));
        renderAdminTreeShell();
    };

    window.panAdminTreeCamera = function (dx, dy) {
        STATE.panX += dx;
        STATE.panY += dy;
        applyStageTransform();
    };

    window.fitAdminTreeViewport = function () {
        fitAdminTreeToContainer(true);
    };

    window.resetAdminTreeViewport = function () {
        STATE.zoom = 1;
        STATE.panX = 0;
        STATE.panY = 16;
        renderAdminTreeShell();
    };

    window.jumpAdminTreeToInput = function () {
        const inp = document.getElementById('adminTreeJumpCodeInput');
        if (!inp) return;
        const val = String(inp.value || '').replace(/\D/g, '');
        if (val === '') {
            toast('أدخل رقم كود العضو (مثلاً 0 أو 1 أو 2)', true);
            return;
        }
        window.openAdminNetworkTree(parseInt(val, 10));
    };

    window.openAdminTreeNodeModal = function (memberCode) {
        const nodes = (STATE.data && Array.isArray(STATE.data.nodes)) ? STATE.data.nodes : [];
        const node = nodes.find((n) => Number(n.member_code) === Number(memberCode));
        if (!node) return;

        const code = Number(node.member_code);
        const isRoot0 = code === 0;
        const vColor = node.visual_color || node.node_color || 'WHITE';
        const pal = VISUAL_PALETTE[vColor] || VISUAL_PALETTE.WHITE;
        const wa = node.phone ? String(node.phone).replace(/\D/g, '') : '';
        const auditor = isAuditorOnly();
        const subTotalIncSelf = Number(node.subtree_total || 0) + 1;

        const modalAvatarUrl = !isRoot0 ? safeAvatarUrl(node.avatar_url) : '';
        const modalAvatarHtml = isRoot0
            ? `<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#064e3b,#0f172a);border:2px solid #facc15;display:flex;align-items:center;justify-content:center;font-size:1.35rem;flex-shrink:0;">👑</div>`
            : (modalAvatarUrl
                ? `<img src="${esc(modalAvatarUrl)}" alt="${esc(node.full_name || '')}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:2.5px solid ${pal.border};flex-shrink:0;" onerror="this.remove();" />`
                : `<div style="width:48px;height:48px;border-radius:50%;background:${pal.solidBg === '#ffffff' ? '#e2e8f0' : pal.solidBg};color:${vColor === 'WHITE' ? '#0f172a' : pal.circleText};border:2px solid ${pal.border};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.95rem;flex-shrink:0;">${esc(memberInitials(node.full_name, code))}</div>`);

        const bodyHtml =
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1.5px solid #e2e8f0;padding-bottom:10px;margin-bottom:12px;">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    modalAvatarHtml +
                    '<div>' +
                        `<div style="font-size:1.05rem;font-weight:900;color:#0f172a;">${isRoot0 ? '👑 شركة SAWYAN العالمية — الجذر #0' : esc(node.full_name)} <small style="color:#059669;">(#${code})</small></div>` +
                        `<div style="font-size:0.8rem;color:#64748b;margin-top:2px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;"><span>الجيل العام #${Number(node.company_gen || 0)} • ${sideLabelAr(node.placement_side, code)} • الإقامة:</span> ${countryFlag(node.residency_country_code, 16)} <span>${esc(node.residency_country_code || '')}</span></div>` +
                    '</div>' +
                '</div>' +
                `<span style="background:${pal.solidBg === '#ffffff' ? '#334155' : pal.solidBg};color:${vColor === 'WHITE' ? '#ffffff' : pal.circleText};padding:4px 11px;border-radius:999px;font-size:0.78rem;font-weight:800;">${node.stopper_slot ? `مقعد ${esc(node.stopper_slot)}` : `${pal.icon} ${pal.label}`}</span>` +
            '</div>' +

            '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:10px;font-size:0.84rem;margin-bottom:14px;">' +
                '<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px;">' +
                    '<div style="color:#64748b;font-size:0.74rem;">🌳 الأب المباشر والراعي</div>' +
                    `<strong>${node.parent_member_code !== null && node.parent_member_code !== undefined ? `أب: #${node.parent_member_code}` : 'قمة الجذر #0'}</strong>` +
                    `<div style="font-size:0.76rem;color:#475569;margin-top:2px;">${node.sponsor_code !== null && node.sponsor_code !== undefined ? `الراعي: #${node.sponsor_code} ${esc(node.sponsor_name || '')}` : 'تأسيس مباشر'}</div>` +
                '</div>' +
                '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:10px;">' +
                    '<div style="color:#1e40af;font-size:0.74rem;">👥 إجمالي شجرته</div>' +
                    `<strong>${subTotalIncSelf} (${isRoot0 ? 'المنصة' : 'هو'} + ${Number(node.subtree_total || 0)})</strong>` +
                    `<div style="font-size:0.76rem;color:#1e3a8a;margin-top:2px;">يمين ${Number(node.subtree_right || 0)} • يسار ${Number(node.subtree_left || 0)}</div>` +
                '</div>' +
                '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px;">' +
                    `<div style="color:#92400e;font-size:0.74rem;">🎯 صندوق الهدف الشهري${node.box_country_code ? ` (${esc(node.box_country_code)})` : ''}</div>` +
                    `<strong>${Number(node.target_pct || 0)}%</strong>` +
                    `<div style="font-size:0.76rem;color:#78350f;margin-top:2px;">$${fmt2(node.box_accumulated_usd)} / $${fmt2(node.target_required_usd)}</div>` +
                    (Number(node.projected_carry_on_out_usd || 0) > 0 ? `<div style="font-size:0.72rem;color:#b45309;margin-top:2px;">ترحيل متوقع (Carry-On): <b>$${fmt2(node.projected_carry_on_out_usd)}</b></div>` : '') +
                    (Array.isArray(node.country_boxes) && node.country_boxes.length > 0
                        ? `<div style="font-size:0.7rem;color:#78350f;margin-top:4px;border-top:1px dashed #fcd34d;padding-top:4px;">${node.country_boxes.map((cb) => `${esc(cb.country_code)}: ${cb.is_qualified ? '🟢' : '🟠'} $${fmt2(cb.accumulated_usd)}`).join(' • ')}</div>`
                        : '') +
                '</div>' +
                '<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:10px;">' +
                    '<div style="color:#065f46;font-size:0.74rem;">💰 العمولات والمحفظة وتوثيق الهوية</div>' +
                    `<div><strong>جارية (قبل الإقفال): $${fmt2(node.estimated_month_commission_usd || 0)}</strong></div>` +
                    `<div style="font-size:0.72rem;color:#047857;margin-top:2px;">صانع: $${fmt2(node.maker_share_usd || 0)} • فريق: $${fmt2(node.downline_est_comm_usd || 0)} <span style="color:#64748b;">(تُصرف يوم 15)</span></div>` +
                    (Number(node.at_risk_rollup_usd || 0) > 0 ? `<div style="font-size:0.71rem;color:#b45309;margin-top:2px;">⚠️ مهددة بالتخطي: <b>$${fmt2(node.at_risk_rollup_usd)}</b></div>` : '') +
                    `<div style="font-size:0.74rem;color:#334155;margin-top:3px;border-top:1px dashed #a7f3d0;padding-top:3px;">مصروفة بالمحفظة: <b>$${fmt2(node.wallet_balance_usd)}</b> <small>(إجمالي سابق: $${fmt2(node.total_earned_usd)})</small></div>` +
                    `<div style="margin-top:4px;">${kycBadgeHtml(node.kyc_status)}</div>` +
                '</div>' +
            '</div>' +

            '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:0.82rem;margin-bottom:14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;align-items:center;">' +
                `<div><b>📱 الهاتف:</b> ${node.phone ? `<span style="direction:ltr;display:inline-block;">${esc(node.phone)}</span>` : '🔒 مقنّع خارج نطاقك'} • <b>📧 البريد:</b> ${esc(node.email || '—')}</div>` +
                (wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener noreferrer" style="background:#16a34a;color:#ffffff;padding:4px 10px;border-radius:7px;text-decoration:none;font-weight:800;font-size:0.78rem;">💬 واتساب</a>` : '') +
            '</div>' +

            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                `<button type="button" class="btn btn-primary" onclick="closeStage7Modal && closeStage7Modal(); openAdminNetworkTree(${code});">🎯 تمركز الشجرة على #${code}</button>` +
                (node.parent_member_code !== null && node.parent_member_code !== undefined
                    ? `<button type="button" class="btn btn-outline" onclick="closeStage7Modal && closeStage7Modal(); openAdminNetworkTree(${Number(node.parent_member_code)});">⬆️ الصعود للأب #${Number(node.parent_member_code)}</button>`
                    : '') +
                (!isRoot0 && !auditor
                    ? `<button type="button" class="btn btn-warning" onclick="closeStage7Modal && closeStage7Modal(); if (typeof svOpenUserPasswordResetModal === 'function') svOpenUserPasswordResetModal('member', '#${code}');">🔑 كلمة مرور مؤقتة</button>` +
                      `<button type="button" class="btn ${node.is_tombstone_banned ? 'btn-success' : 'btn-danger'}" onclick="adminTreeToggleBan('${esc(node.id)}', ${!node.is_tombstone_banned})">${node.is_tombstone_banned ? '🔓 فك الحظر' : '⛔ حظر نهائي'}</button>`
                    : '') +
            '</div>';

        if (typeof window.svOpenAdminModal === 'function') {
            window.svOpenAdminModal(`🌳 ملف العقدة الإداري — #${code}`, bodyHtml, '680px');
        }
    };

    window.adminTreeToggleBan = async function (memberId, ban) {
        try {
            await window.SAWYAN.API.adminOperationalDecision({
                domain: 'member_tombstone',
                recordId: memberId,
                decision: ban ? 'ban' : 'unban',
                notes: 'قرار إداري من عارض الشجرة الكاملة'
            });
            if (typeof window.closeStage7Modal === 'function') window.closeStage7Modal();
            toast(ban ? '⛔ تم تنفيذ الحظر النهائي على الحساب.' : '🔓 تم فك الحظر بنجاح.', false);
            await fetchAndRenderTree();
        } catch (err) {
            toast(err.message || 'تعذر تنفيذ القرار', true);
        }
    };

    window.exportAdminTreeCsv = function () {
        const nodes = (STATE.data && Array.isArray(STATE.data.nodes)) ? STATE.data.nodes : [];
        const searchQ = String(STATE.searchQuery || '').trim().toLowerCase();
        const rows = nodes
            .filter((n) => Number(n.member_code) !== 0 && nodeMatchesFilters(n, searchQ))
            .map((n) => [
                `#${n.member_code}`,
                n.full_name || '',
                n.phone || '',
                n.residency_country_code || '',
                n.company_gen || '',
                n.placement_side || '',
                n.parent_member_code !== null && n.parent_member_code !== undefined ? `#${n.parent_member_code}` : '',
                n.sponsor_code !== null && n.sponsor_code !== undefined ? `#${n.sponsor_code}` : '',
                n.visual_color || n.node_color || '',
                `${n.target_pct || 0}%`,
                n.wallet_balance_usd || 0,
                Number(n.subtree_total || 0) + 1
            ]);
        const headers = ['Code', 'Name', 'Phone', 'Country', 'CompanyGen', 'Side', 'ParentCode', 'SponsorCode', 'Status', 'BoxPct', 'WalletUSD', 'SubtreeCount'];
        const csvLines = [headers].concat(rows).map((r) =>
            r.map((c) => '"' + String(c === null || c === undefined ? '' : c).replace(/"/g, '""') + '"').join(',')
        );
        const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `sawyan_admin_tree_root${STATE.rootCode}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 300);
    };

    // Hook navigation clicks (sidebar, bottom nav, mobile more menu)
    document.addEventListener('click', function (e) {
        const nav = e.target.closest('.nav-item, .more-menu-item, .bottom-nav-item');
        if (!nav) return;
        if (nav.dataset.page === 'networkTree') {
            e.preventDefault();
            if (typeof window.closeMoreMenu === 'function') window.closeMoreMenu();
            window.openAdminNetworkTree(STATE.rootCode);
        }
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        const pg = document.getElementById('networkTreePage');
        if (!pg || !pg.classList.contains('active')) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            drawAdminTreeConnectors();
        }, 120);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountSidebarLink);
    } else {
        mountSidebarLink();
    }
})();
