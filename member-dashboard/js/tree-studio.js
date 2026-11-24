/**
 * ============================================================================
 * SAWYAN V3.0 — Phase 2 Adaptive Binary Tree Studio (`SAWYAN.TreeStudio`)
 * ============================================================================
 * Powered by server-side lazy-loaded `sawyan.get_member_tree_subtree` RPC:
 *   - Mid-range Mobile (<= 768px): 4 gens default (max 5 gens / <= 80 DOM nodes)
 *   - Laptop / Desktop (> 1024px): 6 gens default (up to 8 gens / <= 500 nodes)
 *   - Avatars/Monograms + SVG Target Progress Rings + Crisp SVG Country Flags
 *   - ZERO Scroll-Jacking (zoom via +/−, Fullscreen, or Ctrl+Wheel only)
 *   - Breadcrumb Drill-Down, Right/Left Power Bar, Next Spillover Slot,
 *     Month-End 72h War Room (Roll-Up & 70-99%), and Paginated Team Table.
 */
(function () {
    'use strict';

    const STATE = {
        rootCode: null,
        countryCode: null,
        maxDepth: null,
        zoom: 1,
        panX: 0,
        panY: 8,
        fullscreen: false,
        tablePage: 1,
        tablePageSize: 20,
        searchQuery: '',
        warTab: 'near', // near | rollup
        data: null,
        loading: false,
        selectedNode: null
    };

    function isMobileViewport() {
        return typeof window !== 'undefined' && window.innerWidth <= 768;
    }

    function getDefaultDepth() {
        if (isMobileViewport()) return 4;
        if (typeof window !== 'undefined' && window.innerWidth <= 1024) return 5;
        return 6;
    }

    function getMaxAllowedDepth() {
        return isMobileViewport() ? 5 : 8;
    }

    function getNodeLimit() {
        return isMobileViewport() ? 80 : 500;
    }

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function t(key, fallback) {
        return (window.SAWYAN && window.SAWYAN.I18n && typeof window.SAWYAN.I18n.t === 'function')
            ? window.SAWYAN.I18n.t(key, fallback)
            : (fallback || key);
    }

    function flagSvg(cc, size) {
        if (window.SAWYAN && window.SAWYAN.Flags && typeof window.SAWYAN.Flags.svg === 'function') {
            return window.SAWYAN.Flags.svg(cc, size || 16);
        }
        return '<span>' + esc(cc || '') + '</span>';
    }

    function getInitials(name) {
        const clean = String(name || 'عضو').trim();
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return clean.slice(0, 2).toUpperCase();
    }

    function ringColor(node) {
        if (node.is_tombstone_banned) return '#475569';
        if (node.is_qualified || Number(node.progress_pct) >= 100) return '#10b981';
        if (Number(node.progress_pct) >= 70) return '#f59e0b';
        if (Number(node.progress_pct) > 0) return '#3b82f6';
        return '#cbd5e1';
    }

    function formatWaLink(phone, text) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.length < 8) return null;
        return 'https://wa.me/' + digits + (text ? ('?text=' + encodeURIComponent(text)) : '');
    }

    const STUDIO_CSS = `
    <style id="sawyanTreeStudioStyles">
        .ts-wrap { display:flex; flex-direction:column; gap:14px; }
        .ts-card { background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:16px; box-shadow:0 2px 10px rgba(15,23,42,0.04); }
        .ts-header-bar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; }
        .ts-badge { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-size:0.75rem; font-weight:800; }
        .ts-controls { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .ts-btn { border:1px solid #cbd5e1; background:#f8fafc; color:#0f172a; border-radius:9px; padding:6px 11px; font-family:'Tajawal',sans-serif; font-size:0.8rem; font-weight:800; cursor:pointer; transition:all 0.15s; display:inline-flex; align-items:center; gap:5px; }
        .ts-btn:hover { border-color:#059669; background:#ecfdf5; color:#065f46; }
        .ts-btn.active { background:#059669; color:#ffffff; border-color:#059669; }
        .ts-breadcrumb { display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:0.82rem; font-weight:800; padding:8px 12px; background:#f8fafc; border-radius:10px; border:1px solid #e2e8f0; }
        .ts-crumb-btn { background:transparent; border:none; color:#047857; font-weight:800; cursor:pointer; font-family:inherit; padding:2px 6px; border-radius:6px; }
        .ts-crumb-btn:hover { background:#d1fae5; }
        .ts-power-grid { display:grid; grid-template-columns:1.5fr 1fr; gap:12px; align-items:center; }
        @media (max-width:768px) { .ts-power-grid { grid-template-columns:1fr; } }
        .ts-power-bar-track { height:12px; border-radius:999px; overflow:hidden; background:#e2e8f0; display:flex; margin:8px 0 6px; }
        .ts-power-right { background:linear-gradient(90deg,#10b981,#059669); transition:width 0.35s; }
        .ts-power-left { background:linear-gradient(90deg,#3b82f6,#1d4ed8); transition:width 0.35s; }
        .ts-spill-pill { background:linear-gradient(135deg,#ecfdf5,#eff6ff); border:1.5px dashed #10b981; border-radius:12px; padding:10px 12px; font-size:0.8rem; font-weight:800; color:#065f46; }
        .ts-viewport { position:relative; width:100%; height:480px; overflow:auto; border-radius:14px; border:1.5px solid #cbd5e1; background:radial-gradient(circle at top,#f8fafc 0%,#f1f5f9 100%); touch-action:pan-y pan-x; cursor:grab; }
        .ts-viewport.panning { cursor:grabbing; }
        .ts-viewport.fullscreen { position:fixed; inset:0; z-index:10500; height:100vh; border-radius:0; border:none; background:#f8fafc; }
        .ts-fs-bar { position:sticky; top:8px; inset-inline-end:8px; z-index:20; display:flex; justify-content:space-between; align-items:center; padding:6px 10px; pointer-events:none; }
        .ts-fs-bar > * { pointer-events:auto; }
        .ts-zoom-cluster { display:inline-flex; gap:4px; background:rgba(255,255,255,0.92); backdrop-filter:blur(6px); padding:4px; border-radius:10px; border:1px solid #cbd5e1; box-shadow:0 4px 12px rgba(15,23,42,0.08); }
        .ts-stage { position:relative; transform-origin:top center; padding:20px 28px 40px; min-width:100%; width:max-content; margin:0 auto; }
        .ts-svg-lines { position:absolute; inset:0; pointer-events:none; overflow:visible; }
        .ts-tree-ul { display:flex; justify-content:center; align-items:flex-start; gap:14px; list-style:none; margin:0; padding:0; }
        .ts-tree-li { display:flex; flex-direction:column; align-items:center; position:relative; }
        .ts-children-row { display:flex; justify-content:center; align-items:flex-start; gap:12px; margin-top:26px; }
        .ts-node { position:relative; width:114px; background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:8px 6px 7px; text-align:center; cursor:pointer; transition:transform 0.15s,box-shadow 0.15s,border-color 0.15s; box-shadow:0 3px 10px rgba(15,23,42,0.05); }
        @media (max-width:768px) { .ts-node { width:92px; padding:6px 4px; } }
        .ts-node:hover { transform:translateY(-2px); border-color:#10b981; box-shadow:0 8px 18px rgba(16,185,129,0.16); }
        .ts-node.dimmed { opacity:0.35; filter:grayscale(0.7); }
        .ts-node.root-node { border-color:#059669; border-width:2px; background:linear-gradient(180deg,#ecfdf5 0%,#ffffff 100%); }
        .ts-avatar-ring { position:relative; width:48px; height:48px; margin:0 auto 4px; }
        .ts-avatar-ring svg { position:absolute; inset:0; width:48px; height:48px; transform:rotate(-90deg); }
        .ts-avatar-img, .ts-avatar-mono { position:absolute; top:5px; left:5px; width:38px; height:38px; border-radius:50%; object-fit:cover; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.78rem; color:#ffffff; background:linear-gradient(135deg,#0f2744,#059669); }
        .ts-flag-corner { position:absolute; bottom:-2px; inset-inline-end:-4px; }
        .ts-node-name { font-size:0.74rem; font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
        .ts-node-meta { display:flex; justify-content:center; align-items:center; gap:4px; font-size:0.66rem; font-weight:800; color:#475569; margin-top:2px; direction:ltr; }
        .ts-direct-dot { background:#fef3c7; color:#92400e; padding:0 4px; border-radius:4px; font-size:0.62rem; }
        .ts-expand-pill { margin-top:5px; border:none; background:#0f2744; color:#ffffff; border-radius:999px; padding:2px 8px; font-size:0.66rem; font-weight:800; cursor:pointer; font-family:'Poppins','Tajawal',sans-serif; }
        .ts-expand-pill:hover { background:#059669; }
        .ts-slot-empty { width:72px; min-height:52px; border:1.5px dashed #cbd5e1; border-radius:12px; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:0.66rem; color:#94a3b8; font-weight:700; padding:4px; }
        .ts-slot-empty.next-spill { border-color:#10b981; background:#ecfdf5; color:#047857; box-shadow:0 0 0 3px rgba(16,185,129,0.18); animation:tsPulse 2s infinite; }
        @keyframes tsPulse { 0%,100% { box-shadow:0 0 0 2px rgba(16,185,129,0.2); } 50% { box-shadow:0 0 0 6px rgba(16,185,129,0.35); } }
        .ts-war-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; margin-top:10px; }
        .ts-war-item { border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; gap:8px; }
        .ts-inspector { position:fixed; inset:0; z-index:10600; background:rgba(15,23,42,0.55); display:flex; align-items:center; justify-content:center; padding:14px; }
        .ts-inspector-card { background:#ffffff; border-radius:16px; max-width:420px; width:100%; padding:18px; box-shadow:0 20px 44px rgba(15,23,42,0.3); }
        html[data-theme="dark"] .ts-viewport { background:#0b1220; border-color:#24324a; }
        html[data-theme="dark"] .ts-node, html[data-theme="dark"] .ts-inspector-card, html[data-theme="dark"] .ts-war-item, html[data-theme="dark"] .ts-breadcrumb { background:#111c30; border-color:#24324a; color:#f1f5f9; }
        html[data-theme="dark"] .ts-node-name { color:#f8fafc; }
    </style>`;

    async function fetchSubtree(opts) {
        const api = window.SAWYAN && window.SAWYAN.API;
        const member = (api && api.getSavedMember && api.getSavedMember()) || window.currentMember || null;
        if (!api || !member || !member.id || typeof api.getMemberTreeSubtree !== 'function') {
            return null;
        }
        const depth = (opts && opts.maxDepth) || STATE.maxDepth || getDefaultDepth();
        STATE.maxDepth = Math.min(depth, getMaxAllowedDepth());
        const res = await api.getMemberTreeSubtree({
            memberId: member.id,
            rootMemberCode: (opts && opts.rootCode !== undefined) ? opts.rootCode : STATE.rootCode,
            maxDepth: STATE.maxDepth,
            nodeLimit: getNodeLimit(),
            countryCode: (opts && opts.countryCode !== undefined) ? opts.countryCode : STATE.countryCode
        });
        if (res && Array.isArray(res.nodes)) {
            STATE.data = res;
            window.__sawyanTreePulseCache = res.tree_pulse || null;
            window.__sawyanTreePowerCache = res.power_bar || null;
        }
        return res;
    }

    function buildNodeHtml(node, byParent, spillParent, spillSide, rootCode, curDepth, maxDepth) {
        const r = 21;
        const circ = 2 * Math.PI * r;
        const pct = Math.max(0, Math.min(100, Number(node.progress_pct || 0)));
        const offset = circ - (pct / 100) * circ;
        const stroke = ringColor(node);
        const dimClass = node.in_country_lens === false ? ' dimmed' : '';
        const rootClass = node.member_code === rootCode ? ' root-node' : '';

        const avatarInner = node.avatar_url
            ? '<img class="ts-avatar-img" src="' + esc(node.avatar_url) + '" alt="' + esc(node.full_name) + '" loading="lazy">'
            : '<div class="ts-avatar-mono">' + esc(getInitials(node.full_name)) + '</div>';

        const kids = byParent.get(node.member_code) || [];
        const rightKid = kids.find(function (k) { return k.placement_side === 'right'; }) || kids[0] || null;
        const leftKid = kids.find(function (k) { return k.placement_side === 'left' && k !== rightKid; }) || (kids.length > 1 ? kids[1] : null);

        const hiddenCnt = Number(node.hidden_descendants || 0);
        const expandBtn = hiddenCnt > 0
            ? '<button type="button" class="ts-expand-pill" onclick="event.stopPropagation(); window.SAWYAN.TreeStudio.drillTo(' + Number(node.member_code) + ')">+' + hiddenCnt + ' ▾</button>'
            : '';

        let childrenHtml = '';
        if (curDepth < maxDepth && (rightKid || leftKid || node.member_code === spillParent)) {
            const renderSlot = function (kid, side) {
                if (kid) return buildNodeHtml(kid, byParent, spillParent, spillSide, rootCode, curDepth + 1, maxDepth);
                const isNextSpill = (node.member_code === spillParent && side === spillSide);
                if (!isNextSpill && curDepth >= 2) return '';
                return '<li class="ts-tree-li"><div class="ts-slot-empty' + (isNextSpill ? ' next-spill' : '') + '">' +
                    (isNextSpill ? '✨ التالي<br>(' + (side === 'right' ? 'يمين' : 'يسار') + ')' : (side === 'right' ? 'يمين متاح' : 'يسار متاح')) +
                '</div></li>';
            };
            const rSlot = renderSlot(rightKid, 'right');
            const lSlot = renderSlot(leftKid, 'left');
            if (rSlot || lSlot) {
                childrenHtml = '<ul class="ts-children-row">' + rSlot + lSlot + '</ul>';
            }
        }

        return '<li class="ts-tree-li" data-node-code="' + Number(node.member_code) + '">' +
            '<div class="ts-node' + dimClass + rootClass + '" data-ts-code="' + Number(node.member_code) + '" onclick="window.SAWYAN.TreeStudio.openInspector(' + Number(node.member_code) + ')">' +
                '<div class="ts-avatar-ring">' +
                    '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="' + r + '" fill="none" stroke="#e2e8f0" stroke-width="3.5"/><circle cx="24" cy="24" r="' + r + '" fill="none" stroke="' + stroke + '" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '"/></svg>' +
                    avatarInner +
                    '<span class="ts-flag-corner">' + flagSvg(node.country_code, 16) + '</span>' +
                '</div>' +
                '<div class="ts-node-name" title="' + esc(node.full_name) + '">' + esc(node.full_name) + '</div>' +
                '<div class="ts-node-meta"><span>#' + Number(node.member_code) + '</span><span>•</span><span style="color:' + stroke + ';">' + Math.round(pct) + '%</span>' +
                    (node.is_direct_referral ? '<span class="ts-direct-dot" title="إحالة مباشرة">★</span>' : '') +
                '</div>' +
                expandBtn +
            '</div>' +
            childrenHtml +
        '</li>';
    }

    function drawConnectors() {
        const stage = document.getElementById('tsStage');
        const svg = document.getElementById('tsSvgLines');
        if (!stage || !svg) return;
        const w = stage.scrollWidth || 800;
        const h = stage.scrollHeight || 400;
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);

        const stageRect = stage.getBoundingClientRect();
        const scale = STATE.zoom || 1;
        const paths = [];
        stage.querySelectorAll('.ts-tree-li').forEach(function (li) {
            const parentCard = li.querySelector(':scope > .ts-node');
            const childRow = li.querySelector(':scope > .ts-children-row');
            if (!parentCard || !childRow) return;
            const pRect = parentCard.getBoundingClientRect();
            const px = (pRect.left - stageRect.left + pRect.width / 2) / scale;
            const py = (pRect.bottom - stageRect.top) / scale;
            childRow.querySelectorAll(':scope > .ts-tree-li > .ts-node, :scope > .ts-tree-li > .ts-slot-empty').forEach(function (childEl) {
                const cRect = childEl.getBoundingClientRect();
                const cx = (cRect.left - stageRect.left + cRect.width / 2) / scale;
                const cy = (cRect.top - stageRect.top) / scale;
                const midY = py + (cy - py) * 0.5;
                paths.push('<path d="M ' + px.toFixed(1) + ' ' + py.toFixed(1) + ' C ' + px.toFixed(1) + ' ' + midY.toFixed(1) + ', ' + cx.toFixed(1) + ' ' + midY.toFixed(1) + ', ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + '" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round"/>');
            });
        });
        svg.innerHTML = paths.join('');
    }

    function applyZoomTransform() {
        const stage = document.getElementById('tsStage');
        if (stage) {
            stage.style.transform = 'scale(' + STATE.zoom + ')';
            requestAnimationFrame(drawConnectors);
        }
    }

    function bindViewportInteractions() {
        const vp = document.getElementById('tsViewport');
        if (!vp) return;
        let drag = false, sx = 0, sy = 0, sl = 0, st = 0;

        vp.onpointerdown = function (e) {
            if (e.target.closest('button, a, .ts-node')) return;
            drag = true;
            sx = e.clientX; sy = e.clientY;
            sl = vp.scrollLeft; st = vp.scrollTop;
            vp.classList.add('panning');
        };
        vp.onpointermove = function (e) {
            if (!drag) return;
            vp.scrollLeft = sl - (e.clientX - sx);
            vp.scrollTop = st - (e.clientY - sy);
        };
        vp.onpointerup = vp.onpointerleave = function () {
            drag = false;
            vp.classList.remove('panning');
        };
        // ZERO SCROLL-JACKING: only zoom on Ctrl/Meta+Wheel or in Fullscreen!
        vp.onwheel = function (e) {
            if (!e.ctrlKey && !e.metaKey && !STATE.fullscreen) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.08 : 0.08;
            STATE.zoom = Math.max(0.45, Math.min(1.6, Number((STATE.zoom + delta).toFixed(2))));
            applyZoomTransform();
        };
    }

    function renderPaginatedTableOnly() {
        const wrap = document.getElementById('tsTableWrap');
        if (!wrap || !STATE.data) return;
        const nodes = (STATE.data.nodes || []).filter(function (n) { return n.rel_depth > 0; });
        const q = String(STATE.searchQuery || '').trim().toLowerCase();
        const filtered = q
            ? nodes.filter(function (n) {
                return String(n.full_name || '').toLowerCase().includes(q) ||
                    String(n.member_code || '').includes(q) ||
                    String(n.country_code || '').toLowerCase().includes(q);
            })
            : nodes;

        const totalPages = Math.max(1, Math.ceil(filtered.length / STATE.tablePageSize));
        if (STATE.tablePage > totalPages) STATE.tablePage = totalPages;
        const start = (STATE.tablePage - 1) * STATE.tablePageSize;
        const slice = filtered.slice(start, start + STATE.tablePageSize);

        wrap.innerHTML =
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>العضو</th><th>الدولة</th><th>الجيل</th><th>التقدم</th><th>التواصل (D26)</th><th>استكشاف</th></tr></thead><tbody>' +
            (slice.length === 0
                ? '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:18px;">لا توجد نتائج مطابقة في هذا الفرع</td></tr>'
                : slice.map(function (n) {
                    const wa = formatWaLink(n.phone, 'أهلاً ' + (n.full_name || '') + ' — فريق SAWYAN');
                    return '<tr>' +
                        '<td><b>' + esc(n.full_name) + '</b> <span style="color:#64748b;font-size:0.78rem;" dir="ltr">#' + Number(n.member_code) + '</span>' + (n.is_direct_referral ? ' <span class="ts-direct-dot">★ مباشر</span>' : '') + '</td>' +
                        '<td>' + flagSvg(n.country_code, 16) + ' ' + esc(n.country_code) + '</td>' +
                        '<td>الجيل ' + Number(n.viewer_depth || n.rel_depth) + '</td>' +
                        '<td><b style="color:' + ringColor(n) + ';" dir="ltr">' + Math.round(Number(n.progress_pct || 0)) + '%</b> <small style="color:#64748b;" dir="ltr">($' + Number(n.accumulated_usd || 0).toFixed(2) + ' / $' + Number(n.target_required_usd || 24.75).toFixed(2) + ')</small></td>' +
                        '<td dir="ltr">' + (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" style="color:#047857;font-weight:800;text-decoration:none;">💬 ' + esc(n.phone) + '</a>' : '<span style="color:#94a3b8;">🔒 محمي</span>') + '</td>' +
                        '<td><button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.drillTo(' + Number(n.member_code) + ')">🔍 فتح الفرع</button></td>' +
                    '</tr>';
                }).join('')) +
            '</tbody></table></div>' +
            (totalPages > 1
                ? '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;gap:8px;flex-wrap:wrap;font-size:0.82rem;">' +
                    '<span>عرض ' + (start + 1) + '–' + Math.min(start + STATE.tablePageSize, filtered.length) + ' من ' + filtered.length + '</span>' +
                    '<div style="display:flex;gap:6px;">' +
                        '<button type="button" class="ts-btn" ' + (STATE.tablePage <= 1 ? 'disabled' : '') + ' onclick="window.SAWYAN.TreeStudio.setTablePage(' + (STATE.tablePage - 1) + ')">' + t('tree.page_prev', 'السابق') + '</button>' +
                        '<span style="font-weight:800;padding:5px 8px;">' + STATE.tablePage + ' / ' + totalPages + '</span>' +
                        '<button type="button" class="ts-btn" ' + (STATE.tablePage >= totalPages ? 'disabled' : '') + ' onclick="window.SAWYAN.TreeStudio.setTablePage(' + (STATE.tablePage + 1) + ')">' + t('tree.page_next', 'التالي') + '</button>' +
                    '</div>' +
                  '</div>'
                : '');
    }

    function renderStudioInto(container) {
        const d = STATE.data;
        if (!container || !d) return;
        const nodes = d.nodes || [];
        const rootNode = nodes.find(function (n) { return n.member_code === d.root_code; }) || nodes[0];
        const byParent = new Map();
        nodes.forEach(function (n) {
            if (n.member_code === d.root_code) return;
            const p = n.parent_code;
            if (!byParent.has(p)) byParent.set(p, []);
            byParent.get(p).push(n);
        });

        const pb = d.power_bar || {};
        const pulse = d.tree_pulse || {};
        const totalArm = Math.max(1, Number(pb.right_total || 0) + Number(pb.left_total || 0));
        const rPct = Math.round((Number(pb.right_total || 0) / totalArm) * 100);
        const lPct = 100 - rPct;
        const mob = isMobileViewport();
        const depthChoices = mob ? [3, 4, 5] : [4, 5, 6, 7, 8];
        const countries = d.available_countries || [];
        const nearList = pulse.near_qualification_members || [];
        const rollupList = pulse.rollup_risk_members || [];

        const treeRootHtml = rootNode
            ? '<ul class="ts-tree-ul">' + buildNodeHtml(rootNode, byParent, pb.next_spillover_parent_code, pb.next_spillover_side, d.root_code, 0, d.max_depth) + '</ul>'
            : '<div style="text-align:center;padding:40px;color:#64748b;">لا توجد عقد بعد في شجرتك</div>';

        const warItems = STATE.warTab === 'rollup' ? rollupList : nearList;
        const warHtml = warItems.length === 0
            ? '<div style="font-size:0.82rem;color:#64748b;padding:8px 0;">لا توجد حالات طارئة في هذه القائمة حالياً 🎉</div>'
            : '<div class="ts-war-grid">' + warItems.map(function (item) {
                const msg = STATE.warTab === 'rollup'
                    ? 'تنبيه مهم من فريق SAWYAN: لديك ' + item.qualified_downlines + ' عضو مؤهل تحتك هذا الشهر، أكمل هدفك لحفظ عمولاتك!'
                    : 'أنت على بُعد $' + Number(item.remaining_usd || 0).toFixed(2) + ' فقط لإتمام تأهلك الشهري (' + item.progress_pct + '%)!';
                const wa = formatWaLink(item.phone, msg);
                return '<div class="ts-war-item">' +
                    '<div>' +
                        '<div style="font-weight:800;font-size:0.84rem;">' + flagSvg(item.country_code, 14) + ' ' + esc(item.full_name) + ' <small dir="ltr">#' + Number(item.member_code) + '</small></div>' +
                        '<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">' +
                            (STATE.warTab === 'rollup'
                                ? '🚨 ' + item.qualified_downlines + ' مؤهل تحته (معرّض لـ $' + Number(item.at_risk_usd || 0).toFixed(2) + ')'
                                : '🔥 ' + item.progress_pct + '% — متبقي $' + Number(item.remaining_usd || 0).toFixed(2)) +
                        '</div>' +
                    '</div>' +
                    (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" class="ts-btn" style="background:#ecfdf5;border-color:#10b981;color:#065f46;text-decoration:none;">💬 تذكير</a>' : '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.drillTo(' + Number(item.member_code) + ')">🔍</button>') +
                '</div>';
            }).join('') + '</div>';

        container.innerHTML = STUDIO_CSS +
            '<div class="ts-wrap">' +
                // Top Header + Device Adaptive Depth Controls
                '<div class="ts-card" data-spec-id="member-tree-kpis">' +
                    '<div class="ts-header-bar">' +
                        '<div>' +
                            '<h2 style="margin:0;font-size:1.12rem;font-weight:900;">🌳 ' + t('tree.studio_title', 'استوديو الشجرة الثنائية التكيّفي') + '</h2>' +
                            '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                                '<span class="ts-badge" style="background:#ecfdf5;color:#065f46;">' + (mob ? '📱 ' + t('tree.device_mobile', 'وضع الموبايل السلس (4–5 أجيال)') : '💻 ' + t('tree.device_desktop', 'وضع اللابتوب الكامل (6–8 أجيال)')) + '</span>' +
                                '<span class="ts-badge" style="background:#eff6ff;color:#1e40af;">إجمالي شجرتك: ' + Number(d.total_subtree_members || 0) + ' • المعروض: ' + nodes.length + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<div class="ts-controls" data-spec-id="member-tree-controls">' +
                            '<span data-spec-id="member-tree-view-toggle" style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;">' +
                                '<span style="font-size:0.76rem;font-weight:800;color:#64748b;">' + t('tree.depth_label', 'عمق العرض') + ':</span>' +
                                depthChoices.map(function (dep) {
                                    return '<button type="button" class="ts-btn' + (d.max_depth === dep ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setDepth(' + dep + ')">' + dep + ' ' + t('tree.generations', 'أجيال') + '</button>';
                                }).join('') +
                            '</span>' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.toggleFullscreen()">⛶ ' + t('common.fullscreen', 'ملء الشاشة') + '</button>' +
                        '</div>' +
                    '</div>' +

                    // Breadcrumb
                    '<div class="ts-breadcrumb" style="margin-top:10px;">' +
                        '<span>📍 المسار:</span>' +
                        (d.breadcrumb || []).map(function (c, idx) {
                            return (idx > 0 ? '<span style="color:#94a3b8;">›</span>' : '') +
                                '<button type="button" class="ts-crumb-btn" onclick="window.SAWYAN.TreeStudio.drillTo(' + Number(c.member_code) + ')">' +
                                (idx === 0 ? '👑 ' : '') + esc(c.full_name) + ' (#' + Number(c.member_code) + ')</button>';
                        }).join('') +
                    '</div>' +

                    // Right/Left Power Bar + Next Spillover Slot
                    '<div class="ts-power-grid" data-spec-id="member-tree-reserve-counter" style="margin-top:12px;">' +
                        '<div>' +
                            '<div style="display:flex;justify-content:space-between;font-size:0.8rem;font-weight:800;">' +
                                '<span style="color:#047857;">👉 ' + t('tree.right_arm', 'الذراع الأيمن') + ': ' + Number(pb.right_total || 0) + ' (' + Number(pb.right_qualified || 0) + ' مؤهل)</span>' +
                                '<span style="color:#1d4ed8;">👈 ' + t('tree.left_arm', 'الذراع الأيسر') + ': ' + Number(pb.left_total || 0) + ' (' + Number(pb.left_qualified || 0) + ' مؤهل)</span>' +
                            '</div>' +
                            '<div class="ts-power-bar-track"><div class="ts-power-right" style="width:' + rPct + '%;"></div><div class="ts-power-left" style="width:' + lPct + '%;"></div></div>' +
                        '</div>' +
                        '<div class="ts-spill-pill">✨ ' + t('tree.next_spillover', 'المقعد التلقائي القادم') + ': ' +
                            (pb.next_spillover_parent_code ? ('تحت <b>#' + Number(pb.next_spillover_parent_code) + '</b> — ' + (pb.next_spillover_side === 'right' ? 'الذراع الأيمن' : 'الذراع الأيسر')) : 'تلقائي في الذراع الأضعف') +
                        '</div>' +
                    '</div>' +

                    // Dynamic Country Lens Bar (SVG Flags!)
                    '<div data-spec-id="member-tree-lens-bar" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px;">' +
                        '<span style="font-size:0.76rem;font-weight:800;color:#64748b;">🌍 عدسة الدولة:</span>' +
                        '<button type="button" class="ts-btn' + (!STATE.countryCode ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setCountry(null)">الكل (' + Number(d.total_subtree_members || 0) + ')</button>' +
                        '<span data-spec-id="member-tree-country-reports" style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                            countries.map(function (c) {
                                return '<button type="button" class="ts-btn' + (STATE.countryCode === c.country_code ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setCountry(\'' + esc(c.country_code) + '\')">' +
                                    flagSvg(c.country_code, 16) + ' ' + esc(c.country_code) + ' (' + Number(c.count) + ')</button>';
                            }).join('') +
                        '</span>' +
                    '</div>' +
                '</div>' +

                // Interactive Tree Canvas (Zero Scroll-Jacking!)
                '<div id="tsViewport" data-spec-id="member-tree-earth-viewport" class="ts-viewport' + (STATE.fullscreen ? ' fullscreen' : '') + '">' +
                    '<div class="ts-fs-bar">' +
                        '<div class="ts-zoom-cluster" data-spec-id="member-tree-hud-dpad">' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.zoom(0.12)" title="تكبير">+</button>' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.zoom(-0.12)" title="تصغير">−</button>' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.resetZoom()" title="إعادة ضبط">↺</button>' +
                            (STATE.fullscreen ? '<button type="button" class="ts-btn active" onclick="window.SAWYAN.TreeStudio.toggleFullscreen()">✕ خروج</button>' : '') +
                        '</div>' +
                        '<span class="ts-badge" style="background:rgba(255,255,255,0.92);border:1px solid #cbd5e1;color:#475569;">' + t('tree.zoom_hint', 'التمرير حر — استخدم +/− أو Ctrl+العجلة للتكبير') + '</span>' +
                    '</div>' +
                    '<div id="tsStage" class="ts-stage" style="transform:scale(' + STATE.zoom + ');">' +
                        '<svg id="tsSvgLines" class="ts-svg-lines"></svg>' +
                        treeRootHtml +
                    '</div>' +
                '</div>' +

                // Month-End 72h War Room (Near Qualification 70-99% + Roll-Up Alert)
                '<div class="ts-card" data-spec-id="member-tree-leader-radar">' +
                    '<div class="ts-header-bar">' +
                        '<div style="font-weight:900;font-size:0.96rem;">⚡ ' + t('tree.war_room', 'غرفة عمليات نهاية الشهر (72 ساعة)') + '</div>' +
                        '<div class="ts-controls">' +
                            '<button type="button" data-spec-id="member-tree-orange-filter" class="ts-btn' + (STATE.warTab === 'near' ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setWarTab(\'near\')">🔥 قريبون من التأهل 70–99% (' + nearList.length + ')</button>' +
                            '<button type="button" class="ts-btn' + (STATE.warTab === 'rollup' ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setWarTab(\'rollup\')">🚨 تنبيه Roll-Up (' + rollupList.length + ')</button>' +
                        '</div>' +
                    '</div>' +
                    warHtml +
                '</div>' +

                // Paginated Team Directory (Zero Focus Loss Search Input!)
                '<div class="ts-card" data-spec-id="member-tree-detail-table">' +
                    '<div class="ts-header-bar" style="margin-bottom:10px;">' +
                        '<div style="font-weight:900;font-size:0.96rem;">📋 دليل أعضاء الفرع المعروض (' + Math.max(0, nodes.length - 1) + ')</div>' +
                        '<input type="search" id="tsTableSearchInput" value="' + esc(STATE.searchQuery) + '" placeholder="ابحث بالاسم أو الكود أو الدولة..." style="padding:7px 12px;border:1.5px solid #cbd5e1;border-radius:10px;min-width:220px;font-family:Tajawal,sans-serif;">' +
                    '</div>' +
                    '<div id="tsTableWrap"></div>' +
                '</div>' +
            '</div>';

        const sIn = document.getElementById('tsTableSearchInput');
        if (sIn) {
            sIn.addEventListener('input', function (e) {
                STATE.searchQuery = e.target.value;
                STATE.tablePage = 1;
                renderPaginatedTableOnly(); // Never destroys the input!
            });
        }

        renderPaginatedTableOnly();
        bindViewportInteractions();
        requestAnimationFrame(drawConnectors);
    }

    async function mount(containerId) {
        const host = document.getElementById(containerId || 'treePage');
        if (!host) return;
        host.innerHTML = STUDIO_CSS + '<div class="ts-card" style="text-align:center;padding:36px;color:#475569;font-weight:800;">🌳 جارٍ تحميل شجرتك التكيّفية من الخادم...</div>';
        try {
            const res = await fetchSubtree({});
            if (!res) throw new Error('TREE_SESSION_UNAVAILABLE');
            renderStudioInto(host);
        } catch (err) {
            host.innerHTML = STUDIO_CSS + '<div class="ts-card" style="color:#b91c1c;font-weight:800;">⚠️ تعذر تحميل الشجرة: ' + esc(err && err.message || err) + '</div>';
        }
    }

    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.TreeStudio = {
        mount: mount,
        fetchPulseOnly: async function () {
            if (window.__sawyanTreePulseCache) return { tree_pulse: window.__sawyanTreePulseCache, power_bar: window.__sawyanTreePowerCache };
            try { return await fetchSubtree({ maxDepth: getDefaultDepth() }); } catch (_e) { return null; }
        },
        drillTo: async function (code) {
            STATE.rootCode = Number(code);
            STATE.tablePage = 1;
            await mount('treePage');
        },
        setDepth: async function (dep) {
            STATE.maxDepth = Math.min(Number(dep), getMaxAllowedDepth());
            await mount('treePage');
        },
        setCountry: async function (cc) {
            STATE.countryCode = cc || null;
            await mount('treePage');
        },
        zoom: function (delta) {
            STATE.zoom = Math.max(0.45, Math.min(1.6, Number((STATE.zoom + delta).toFixed(2))));
            applyZoomTransform();
        },
        resetZoom: function () {
            STATE.zoom = 1;
            applyZoomTransform();
        },
        toggleFullscreen: function () {
            STATE.fullscreen = !STATE.fullscreen;
            const host = document.getElementById('treePage');
            if (host && STATE.data) renderStudioInto(host);
        },
        setWarTab: function (tab) {
            STATE.warTab = tab;
            const host = document.getElementById('treePage');
            if (host && STATE.data) renderStudioInto(host);
        },
        setTablePage: function (p) {
            STATE.tablePage = Math.max(1, Number(p) || 1);
            renderPaginatedTableOnly();
        },
        openInspector: function (code) {
            if (!STATE.data) return;
            const node = (STATE.data.nodes || []).find(function (n) { return n.member_code === Number(code); });
            if (!node) return;
            const existing = document.getElementById('tsInspectorOverlay');
            if (existing) existing.remove();
            const wa = formatWaLink(node.phone, 'أهلاً ' + (node.full_name || '') + ' — فريق SAWYAN');
            const ov = document.createElement('div');
            ov.id = 'tsInspectorOverlay';
            ov.className = 'ts-inspector';
            ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
            ov.innerHTML =
                '<div class="ts-inspector-card">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">' +
                        '<div style="font-weight:900;font-size:1.05rem;">' + flagSvg(node.country_code, 18) + ' ' + esc(node.full_name) + ' <small dir="ltr">#' + Number(node.member_code) + '</small></div>' +
                        '<button type="button" class="ts-btn" onclick="document.getElementById(\'tsInspectorOverlay\').remove()">✕</button>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.84rem;margin-bottom:12px;">' +
                        '<div style="background:#f8fafc;padding:8px;border-radius:10px;"><b>التأهل الشهري:</b><br><span style="color:' + ringColor(node) + ';font-weight:900;">' + Math.round(Number(node.progress_pct || 0)) + '%</span></div>' +
                        '<div style="background:#f8fafc;padding:8px;border-radius:10px;"><b>المتبقي للهدف:</b><br><b dir="ltr">$' + Number(node.remaining_usd || 0).toFixed(2) + '</b></div>' +
                        '<div style="background:#f8fafc;padding:8px;border-radius:10px;"><b>حجم فريقه:</b><br><b>' + Number(node.subtree_count || 0) + ' عضو</b></div>' +
                        '<div style="background:#f8fafc;padding:8px;border-radius:10px;"><b>نوع العلاقة:</b><br><b>' + (node.is_direct_referral ? '★ إحالة مباشرة' : '● فريق ممتد') + '</b></div>' +
                    '</div>' +
                    '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
                        '<button type="button" class="ts-btn active" onclick="document.getElementById(\'tsInspectorOverlay\').remove(); window.SAWYAN.TreeStudio.drillTo(' + Number(node.member_code) + ')">🔍 استكشاف فرع هذا العضو</button>' +
                        (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" class="ts-btn" style="text-decoration:none;background:#ecfdf5;border-color:#10b981;color:#065f46;">💬 واتساب</a>' : '') +
                    '</div>' +
                '</div>';
            document.body.appendChild(ov);
        }
    };
})();
