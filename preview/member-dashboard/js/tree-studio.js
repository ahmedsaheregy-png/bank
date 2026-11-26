/**
 * ============================================================================
 * SAWYAN V3.0 — Compact Circular Binary Tree Studio (`SAWYAN.TreeStudio`)
 * ============================================================================
 * Powered by server-side `get_member_tree_subtree` RPC:
 *   - Compact sleek circles ONLY (zero square node cards, zero oversized flags!)
 *   - Constitutional 6-State Visual System (Locked by Founder):
 *       1) Green  (#10b981/#047857): Qualified 100% (within S01=11 commission team)
 *       2) Orange (#f59e0b/#ea580c): Accumulating 1%–99% (NEVER blue, NEVER yellow)
 *       3) White  (#ffffff + border): 0% (no purchases / no carry-on yet)
 *       4) Dark Gray (#475569):      Relative Reserve Team (beyond 11th qualified stopper)
 *       5) Red    (#dc2626):         Tombstone Banned / Frozen pass-through seat
 *       6) Semi-Transparent (0.28):  Out of selected Country Lens (brightens on hover)
 *   - Inside circle: Member photo (avatar_url) if present, else First Name only
 *   - Rim + Under: Tiny crisp SVG country flag (18×13px) + compact `#code` pill only
 *   - Click Inspector Modal: All 9 Founder-specified fields + DB-enforced 10-upline
 *     phone & WhatsApp privacy (`viewer_depth BETWEEN 0 AND 10`).
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

    function getFirstName(name) {
        const clean = String(name || 'عضو').trim();
        if (!clean) return 'عضو';
        const first = clean.split(/\s+/)[0] || clean;
        return first.length > 9 ? first.slice(0, 8) + '…' : first;
    }

    /**
     * Exact Constitutional 5-Status Node Classification (Locked by Founder):
     *   red    = Banned / Frozen Tombstone seat
     *   gray   = Relative Reserve Team (beyond S01=11 qualified stopper)
     *   green  = Qualified 100%
     *   orange = Accumulating 1%–99% (NEVER blue, NEVER yellow)
     *   white  = 0% (no purchases / no carry-on yet)
     */
    function nodeStatus(node) {
        if (node.is_tombstone_banned) {
            return { key: 'red', color: '#dc2626', soft: '#fef2f2', text: '#991b1b', label: '🔴 مجمّد / محظور' };
        }
        if (node.is_reserve_team) {
            return { key: 'gray', color: '#475569', soft: '#f1f5f9', text: '#334155', label: '⚫ فريق رديف (بعد الستوبر 11)' };
        }
        const pct = Number(node.progress_pct || 0);
        if (node.is_qualified || pct >= 100) {
            return { key: 'green', color: '#059669', soft: '#ecfdf5', text: '#065f46', label: '🟢 مؤهل (100%)' };
        }
        if (pct > 0) {
            return { key: 'orange', color: '#ea580c', soft: '#fff7ed', text: '#9a3412', label: '🟠 قيد التجميع (' + Math.round(pct) + '%)' };
        }
        return { key: 'white', color: '#64748b', soft: '#f8fafc', text: '#334155', label: '⚪ لم يبدأ بعد (0%)' };
    }

    function formatLocalMoney(amount, currencyCode) {
        const num = Number(amount || 0);
        const formatted = num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const curMap = { EGP: 'ج.م', TRY: 'ل.ت', SAR: 'ر.س', AED: 'د.إ', EUR: '€', GBP: '£', USD: '$' };
        const cc = String(currencyCode || 'EGP').toUpperCase();
        return formatted + ' ' + (curMap[cc] || cc);
    }

    function formatJoinDate(iso) {
        if (!iso) return '—';
        try {
            const dt = new Date(iso);
            if (isNaN(dt.getTime())) return String(iso).slice(0, 10);
            return dt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (_e) {
            return String(iso).slice(0, 10);
        }
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
        .ts-arms-row { display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
        .ts-arm-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:999px; font-size:0.76rem; font-weight:800; }
        .ts-arm-right { background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; }
        .ts-arm-left { background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; }
        .ts-power-bar-track { height:10px; border-radius:999px; overflow:hidden; background:#e2e8f0; display:flex; margin:8px 0 4px; }
        .ts-power-right { background:linear-gradient(90deg,#10b981,#059669); transition:width 0.35s; }
        .ts-power-left { background:linear-gradient(90deg,#3b82f6,#1d4ed8); transition:width 0.35s; }
        .ts-spill-pill { background:linear-gradient(135deg,#ecfdf5,#f8fafc); border:1.5px dashed #10b981; border-radius:12px; padding:10px 12px; font-size:0.8rem; font-weight:800; color:#065f46; }

        /* Lens + Constitutional Color Legend Strip */
        .ts-lens-legend { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9; }
        .ts-legend { display:flex; align-items:center; gap:9px; flex-wrap:wrap; font-size:0.73rem; font-weight:800; color:#334155; }
        .ts-legend-item { display:inline-flex; align-items:center; gap:4px; }
        .ts-dot { width:10px; height:10px; border-radius:50%; display:inline-block; flex-shrink:0; }
        .ts-dot-green { background:#10b981; }
        .ts-dot-orange { background:#f59e0b; }
        .ts-dot-white { background:#ffffff; border:2px solid #94a3b8; }
        .ts-dot-gray { background:#475569; }
        .ts-dot-red { background:#dc2626; }

        /* Interactive Tree Canvas */
        .ts-viewport { position:relative; width:100%; height:500px; overflow:auto; border-radius:14px; border:1.5px solid #cbd5e1; background:radial-gradient(circle at top,#ffffff 0%,#f8fafc 55%,#f1f5f9 100%); touch-action:pan-y pan-x; cursor:grab; }
        .ts-viewport.panning { cursor:grabbing; }
        .ts-viewport.fullscreen { position:fixed; inset:0; z-index:10500; height:100vh; border-radius:0; border:none; background:#f8fafc; }
        .ts-fs-bar { position:sticky; top:8px; inset-inline-end:8px; z-index:20; display:flex; justify-content:space-between; align-items:center; padding:6px 10px; pointer-events:none; }
        .ts-fs-bar > * { pointer-events:auto; }
        .ts-zoom-cluster { display:inline-flex; gap:4px; background:rgba(255,255,255,0.92); backdrop-filter:blur(6px); padding:4px; border-radius:10px; border:1px solid #cbd5e1; box-shadow:0 4px 12px rgba(15,23,42,0.08); }
        .ts-stage { position:relative; transform-origin:top center; padding:18px 24px 38px; min-width:100%; width:max-content; margin:0 auto; }
        .ts-svg-lines { position:absolute; inset:0; pointer-events:none; overflow:visible; }
        .ts-tree-ul { display:flex; justify-content:center; align-items:flex-start; gap:10px; list-style:none; margin:0; padding:0; }
        .ts-tree-li { display:flex; flex-direction:column; align-items:center; position:relative; }
        .ts-children-row { display:flex; justify-content:center; align-items:flex-start; gap:10px; margin-top:24px; padding:0; list-style:none; }

        /* ================================================================
           COMPACT SLEEK CIRCULAR NODE (NO SQUARE CARD! NO GIANT FLAG!)
           ================================================================ */
        .ts-node {
            position:relative;
            display:flex;
            flex-direction:column;
            align-items:center;
            gap:3px;
            padding:0 2px;
            background:transparent;
            border:none;
            cursor:pointer;
            transition:transform 0.16s ease, opacity 0.2s ease, filter 0.2s ease;
            z-index:2;
        }
        .ts-node:hover { transform:translateY(-3px) scale(1.07); }
        /* Dimmed / Semi-Transparent when outside active Country Lens (brightens on hover!) */
        .ts-node.dimmed { opacity:0.28; filter:grayscale(0.75); }
        .ts-node.dimmed:hover { opacity:0.82; filter:grayscale(0.15); }

        .ts-circle-wrap {
            position:relative;
            width:48px;
            height:48px;
            flex-shrink:0;
        }
        .ts-node.root-node .ts-circle-wrap {
            width:56px;
            height:56px;
        }
        .ts-circle {
            width:100%;
            height:100%;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-weight:900;
            font-size:0.72rem;
            line-height:1.05;
            text-align:center;
            overflow:hidden;
            padding:3px;
            box-shadow:0 4px 12px rgba(15,23,42,0.12);
            border:2.5px solid #ffffff;
            user-select:none;
        }
        .ts-node.root-node .ts-circle {
            box-shadow:0 0 0 3px #10b981, 0 6px 16px rgba(16,185,129,0.28);
            font-size:0.8rem;
        }
        .ts-circle.has-photo { padding:0; }
        .ts-circle img { width:100%; height:100%; object-fit:cover; display:block; }

        /* Exact Constitutional Status Colors */
        .ts-st-green .ts-circle { background:linear-gradient(135deg,#10b981 0%,#047857 100%); color:#ffffff; border-color:#d1fae5; }
        .ts-st-green .ts-circle.has-photo { border:3px solid #10b981; }

        .ts-st-orange .ts-circle { background:linear-gradient(135deg,#f59e0b 0%,#ea580c 100%); color:#ffffff; border-color:#fef3c7; }
        .ts-st-orange .ts-circle.has-photo { border:3px solid #f59e0b; }

        .ts-st-white .ts-circle { background:#ffffff; color:#1e293b; border:2.5px solid #cbd5e1; box-shadow:0 3px 8px rgba(15,23,42,0.08); }
        .ts-st-white .ts-circle.has-photo { border:3px solid #cbd5e1; }

        .ts-st-gray .ts-circle { background:linear-gradient(135deg,#64748b 0%,#334155 100%); color:#f1f5f9; border-color:#cbd5e1; }
        .ts-st-gray .ts-circle.has-photo { border:3px solid #475569; }

        .ts-st-red .ts-circle { background:linear-gradient(135deg,#ef4444 0%,#b91c1c 100%); color:#ffffff; border-color:#fee2e2; }
        .ts-st-red .ts-circle.has-photo { border:3px solid #dc2626; }

        /* Tiny crisp SVG country flag nestled neatly on bottom-left rim */
        .ts-flag-dot {
            position:absolute;
            bottom:-2px;
            left:-3px;
            width:18px;
            height:13px;
            border-radius:3px;
            overflow:hidden;
            border:1.5px solid #ffffff;
            box-shadow:0 1px 4px rgba(0,0,0,0.28);
            display:flex;
            align-items:center;
            justify-content:center;
            background:#ffffff;
            z-index:3;
            pointer-events:none;
        }
        .ts-flag-dot svg {
            width:100% !important;
            height:100% !important;
            display:block !important;
            position:static !important;
            transform:none !important;
        }

        /* Compact #code pill directly beneath circle */
        .ts-code-pill {
            font-family:'Poppins','Tajawal',sans-serif;
            font-size:0.65rem;
            font-weight:800;
            color:#334155;
            background:rgba(255,255,255,0.94);
            border:1px solid #e2e8f0;
            border-radius:999px;
            padding:0 6px;
            line-height:1.38;
            direction:ltr;
            box-shadow:0 1px 3px rgba(15,23,42,0.05);
            white-space:nowrap;
        }
        .ts-st-green .ts-code-pill { border-color:#a7f3d0; color:#065f46; background:#ecfdf5; }
        .ts-st-orange .ts-code-pill { border-color:#fed7aa; color:#9a3412; background:#fff7ed; }
        .ts-st-red .ts-code-pill { border-color:#fecaca; color:#991b1b; background:#fef2f2; }

        .ts-expand-pill { margin-top:2px; border:none; background:#0f2744; color:#ffffff; border-radius:999px; padding:1px 7px; font-size:0.62rem; font-weight:800; cursor:pointer; font-family:'Poppins','Tajawal',sans-serif; }
        .ts-expand-pill:hover { background:#059669; }

        .ts-slot-empty { width:42px; height:42px; border:1.5px dashed #cbd5e1; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.78rem; color:#94a3b8; font-weight:800; background:rgba(255,255,255,0.65); }
        .ts-slot-empty.next-spill { border-color:#10b981; background:#ecfdf5; color:#047857; box-shadow:0 0 0 3px rgba(16,185,129,0.18); animation:tsPulse 2s infinite; }
        @keyframes tsPulse { 0%,100% { box-shadow:0 0 0 2px rgba(16,185,129,0.2); } 50% { box-shadow:0 0 0 6px rgba(16,185,129,0.35); } }

        @media (max-width:768px) {
            .ts-viewport { height:420px; }
            .ts-children-row { gap:6px; margin-top:20px; }
            .ts-circle-wrap { width:40px; height:40px; }
            .ts-node.root-node .ts-circle-wrap { width:46px; height:46px; }
            .ts-circle { font-size:0.62rem; }
            .ts-flag-dot { width:15px; height:11px; bottom:-2px; left:-2px; }
            .ts-code-pill { font-size:0.6rem; padding:0 5px; }
            .ts-slot-empty { width:34px; height:34px; font-size:0.7rem; }
        }

        .ts-war-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; margin-top:10px; }
        .ts-war-item { border:1px solid #e2e8f0; border-radius:12px; padding:10px 12px; background:#f8fafc; display:flex; justify-content:space-between; align-items:center; gap:8px; }

        /* ================================================================
           CLICK MEMBER DETAIL MODAL (ALL 9 FOUNDER-SPECIFIED FIELDS!)
           ================================================================ */
        .ts-inspector { position:fixed; inset:0; z-index:10600; background:rgba(15,23,42,0.58); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; padding:14px; }
        .ts-inspector-card { background:#ffffff; border-radius:20px; max-width:430px; width:100%; overflow:hidden; box-shadow:0 24px 56px rgba(15,23,42,0.35); border:1px solid #e2e8f0; }
        .ts-mm-hero { background:linear-gradient(135deg,#0f2744 0%,#047857 100%); color:#ffffff; padding:15px 16px; display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .ts-mm-hero-main { display:flex; align-items:center; gap:11px; min-width:0; }
        .ts-mm-avatar { width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:0.86rem; flex-shrink:0; overflow:hidden; border:3px solid #ffffff; }
        .ts-mm-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
        .ts-mm-name { font-size:1.02rem; font-weight:900; line-height:1.25; }
        .ts-mm-sub { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px; font-size:0.75rem; font-weight:800; }
        .ts-mm-code { background:rgba(255,255,255,0.2); padding:1px 8px; border-radius:999px; font-family:'Poppins',sans-serif; direction:ltr; }
        .ts-mm-status { padding:1px 8px; border-radius:999px; font-weight:800; }
        .ts-mm-close { width:32px; height:32px; border-radius:50%; border:none; background:rgba(255,255,255,0.18); color:#ffffff; font-size:1rem; font-weight:900; cursor:pointer; flex-shrink:0; }
        .ts-mm-body { padding:14px 16px 16px; display:flex; flex-direction:column; gap:10px; }
        .ts-mm-target { border-radius:13px; padding:10px 12px; border:1px solid #e2e8f0; background:#f8fafc; }
        .ts-mm-target-top { display:flex; justify-content:space-between; align-items:center; gap:8px; font-size:0.78rem; font-weight:800; margin-bottom:5px; flex-wrap:wrap; }
        .ts-mm-target-vals { display:flex; justify-content:space-between; align-items:baseline; gap:8px; font-size:0.86rem; font-weight:900; color:#0f172a; margin-bottom:6px; }
        .ts-mm-bar { height:8px; background:rgba(15,23,42,0.08); border-radius:999px; overflow:hidden; }
        .ts-mm-bar-fill { height:100%; border-radius:999px; transition:width 0.3s; }
        .ts-mm-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .ts-mm-cell { background:#f8fafc; border:1px solid #e2e8f0; border-radius:11px; padding:8px 10px; min-width:0; }
        .ts-mm-lbl { font-size:0.71rem; color:#64748b; font-weight:700; margin-bottom:2px; }
        .ts-mm-val { font-size:0.83rem; color:#0f172a; font-weight:800; display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .ts-mm-team { grid-column:1 / -1; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; background:#f8fafc; border:1px solid #e2e8f0; border-radius:11px; padding:9px 11px; }
        .ts-mm-phone-ok { background:#ecfdf5; border:1px solid #a7f3d0; border-radius:12px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; }
        .ts-mm-phone-num { font-family:'Poppins',sans-serif; font-size:0.9rem; font-weight:800; color:#065f46; direction:ltr; }
        .ts-mm-wa-btn { background:#16a34a; color:#ffffff; text-decoration:none; padding:8px 13px; border-radius:10px; font-weight:800; font-size:0.82rem; white-space:nowrap; display:inline-flex; align-items:center; gap:5px; box-shadow:0 4px 12px rgba(22,163,74,0.28); }
        .ts-mm-phone-locked { background:#f1f5f9; border:1px dashed #cbd5e1; border-radius:11px; padding:9px 11px; font-size:0.78rem; font-weight:700; color:#475569; text-align:center; }
        .ts-mm-drill { width:100%; background:#0f2744; color:#ffffff; border:none; padding:10px 12px; border-radius:11px; font-family:'Tajawal',sans-serif; font-size:0.86rem; font-weight:800; cursor:pointer; }
        .ts-mm-drill:hover { background:#047857; }

        html[data-theme="dark"] .ts-card { background:#0f172a; border-color:#24324a; color:#f1f5f9; }
        html[data-theme="dark"] .ts-viewport { background:#0b1220; border-color:#24324a; }
        html[data-theme="dark"] .ts-inspector-card, html[data-theme="dark"] .ts-war-item, html[data-theme="dark"] .ts-breadcrumb, html[data-theme="dark"] .ts-mm-cell, html[data-theme="dark"] .ts-mm-team, html[data-theme="dark"] .ts-mm-target { background:#111c30; border-color:#24324a; color:#f1f5f9; }
        html[data-theme="dark"] .ts-mm-val, html[data-theme="dark"] .ts-mm-target-vals { color:#f8fafc; }
        html[data-theme="dark"] .ts-code-pill { background:#1e293b; border-color:#334155; color:#e2e8f0; }
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
        const st = nodeStatus(node);
        const dimClass = node.in_country_lens === false ? ' dimmed' : '';
        const rootClass = node.member_code === rootCode ? ' root-node' : '';
        const firstName = getFirstName(node.full_name);

        const hasPhoto = Boolean(node.avatar_url && !node.is_tombstone_banned);
        const circleInner = hasPhoto
            ? '<img src="' + esc(node.avatar_url) + '" alt="' + esc(firstName) + '" loading="lazy">'
            : esc(node.is_tombstone_banned ? 'مجمّد' : firstName);

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
                const slotTitle = isNextSpill
                    ? ('المقعد التلقائي القادم (' + (side === 'right' ? 'يمين' : 'يسار') + ')')
                    : (side === 'right' ? 'مقعد يمين متاح' : 'مقعد يسار متاح');
                return '<li class="ts-tree-li"><div class="ts-slot-empty' + (isNextSpill ? ' next-spill' : '') + '" title="' + esc(slotTitle) + '">' +
                    (isNextSpill ? '✨' : '+') +
                '</div></li>';
            };
            const rSlot = renderSlot(rightKid, 'right');
            const lSlot = renderSlot(leftKid, 'left');
            if (rSlot || lSlot) {
                childrenHtml = '<ul class="ts-children-row">' + rSlot + lSlot + '</ul>';
            }
        }

        return '<li class="ts-tree-li" data-node-code="' + Number(node.member_code) + '">' +
            '<div class="ts-node ts-st-' + st.key + dimClass + rootClass + '" data-ts-code="' + Number(node.member_code) + '" title="' + esc(node.full_name) + ' (#' + Number(node.member_code) + ')" onclick="window.SAWYAN.TreeStudio.openInspector(' + Number(node.member_code) + ')">' +
                '<div class="ts-circle-wrap">' +
                    '<div class="ts-circle' + (hasPhoto ? ' has-photo' : '') + '">' + circleInner + '</div>' +
                    '<span class="ts-flag-dot">' + flagSvg(node.country_code, 18) + '</span>' +
                '</div>' +
                '<span class="ts-code-pill">#' + Number(node.member_code) + '</span>' +
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
            const parentNode = li.querySelector(':scope > .ts-node');
            const childRow = li.querySelector(':scope > .ts-children-row');
            if (!parentNode || !childRow) return;
            const pRect = parentNode.getBoundingClientRect();
            const px = (pRect.left - stageRect.left + pRect.width / 2) / scale;
            const py = (pRect.bottom - stageRect.top) / scale;
            childRow.querySelectorAll(':scope > .ts-tree-li > .ts-node, :scope > .ts-tree-li > .ts-slot-empty').forEach(function (childEl) {
                const cRect = childEl.getBoundingClientRect();
                const cx = (cRect.left - stageRect.left + cRect.width / 2) / scale;
                const cy = (cRect.top - stageRect.top) / scale;
                const midY = py + (cy - py) * 0.5;
                paths.push('<path d="M ' + px.toFixed(1) + ' ' + py.toFixed(1) + ' C ' + px.toFixed(1) + ' ' + midY.toFixed(1) + ', ' + cx.toFixed(1) + ' ' + midY.toFixed(1) + ', ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + '" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-linecap="round"/>');
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
                    String(n.country_code || '').toLowerCase().includes(q) ||
                    String(n.country_name_ar || '').toLowerCase().includes(q);
            })
            : nodes;

        const totalPages = Math.max(1, Math.ceil(filtered.length / STATE.tablePageSize));
        if (STATE.tablePage > totalPages) STATE.tablePage = totalPages;
        const start = (STATE.tablePage - 1) * STATE.tablePageSize;
        const slice = filtered.slice(start, start + STATE.tablePageSize);

        wrap.innerHTML =
            '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>العضو</th><th>الدولة</th><th>الجيل</th><th>الهدف الشهري</th><th>التواصل</th><th>استكشاف</th></tr></thead><tbody>' +
            (slice.length === 0
                ? '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:18px;">لا توجد نتائج مطابقة في هذا الفرع</td></tr>'
                : slice.map(function (n) {
                    const st = nodeStatus(n);
                    const wa = formatWaLink(n.phone, 'أهلاً ' + (n.full_name || '') + ' — فريق SAWYAN');
                    const boxCur = n.box_currency_code || n.currency_code;
                    const boxCC = n.box_country_code || n.country_code;
                    const achLocal = n.achieved_local !== undefined ? formatLocalMoney(n.achieved_local, boxCur) : ('$' + Number(n.accumulated_usd || 0).toFixed(2));
                    const reqLocal = n.target_required_local !== undefined ? formatLocalMoney(n.target_required_local, boxCur) : ('$' + Number(n.target_required_usd || 24.75).toFixed(2));
                    const crossTag = (boxCC && n.country_code && boxCC !== n.country_code)
                        ? (' <span style="background:#ecfdf5;color:#065f46;padding:0 5px;border-radius:4px;font-size:0.68rem;">صندوق ' + esc(boxCC) + '</span>')
                        : '';
                    return '<tr>' +
                        '<td><b>' + esc(n.full_name) + '</b> <span style="color:#64748b;font-size:0.78rem;" dir="ltr">#' + Number(n.member_code) + '</span>' + (n.is_direct_referral ? ' <span style="background:#fef3c7;color:#92400e;padding:0 5px;border-radius:4px;font-size:0.68rem;">★ مباشر</span>' : '') + '</td>' +
                        '<td>' + flagSvg(n.country_code, 16) + ' ' + esc(n.country_name_ar || n.country_code) + crossTag + '</td>' +
                        '<td>الجيل ' + Number(n.viewer_depth || n.rel_depth) + '</td>' +
                        '<td><b style="color:' + st.color + ';" dir="ltr">' + Math.round(Number(n.progress_pct || 0)) + '%</b> <small style="color:#64748b;">(' + esc(achLocal) + ' / ' + esc(reqLocal) + ')</small></td>' +
                        '<td dir="ltr">' + (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" style="color:#047857;font-weight:800;text-decoration:none;">💬 ' + esc(n.phone) + '</a>' : '<span style="color:#94a3b8;">🔒 محمي</span>') + '</td>' +
                        '<td><button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.openInspector(' + Number(n.member_code) + ')">🪪 البطاقة</button></td>' +
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
                const remStr = item.remaining_local !== undefined
                    ? formatLocalMoney(item.remaining_local, item.currency_code)
                    : ('$' + Number(item.remaining_usd || 0).toFixed(2));
                const riskStr = item.at_risk_local !== undefined
                    ? formatLocalMoney(item.at_risk_local, item.currency_code)
                    : ('$' + Number(item.at_risk_usd || 0).toFixed(2));
                const msg = STATE.warTab === 'rollup'
                    ? 'تنبيه مهم من فريق SAWYAN: لديك ' + item.qualified_downlines + ' عضو مؤهل تحتك هذا الشهر، أكمل هدفك لحفظ عمولاتك!'
                    : 'أنت على بُعد ' + remStr + ' فقط لإتمام تأهلك الشهري (' + item.progress_pct + '%)!';
                const wa = formatWaLink(item.phone, msg);
                return '<div class="ts-war-item">' +
                    '<div>' +
                        '<div style="font-weight:800;font-size:0.84rem;">' + flagSvg(item.country_code, 14) + ' ' + esc(item.full_name) + ' <small dir="ltr">#' + Number(item.member_code) + '</small></div>' +
                        '<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">' +
                            (STATE.warTab === 'rollup'
                                ? '🚨 ' + item.qualified_downlines + ' مؤهل تحته (معرّض لـ ' + esc(riskStr) + ')'
                                : '🟠 ' + item.progress_pct + '% — متبقي ' + esc(remStr)) +
                        '</div>' +
                    '</div>' +
                    (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" class="ts-btn" style="background:#ecfdf5;border-color:#10b981;color:#065f46;text-decoration:none;">💬 تذكير</a>' : '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.drillTo(' + Number(item.member_code) + ')">🔍</button>') +
                '</div>';
            }).join('') + '</div>';

        const totalTeamCount = Number(d.total_subtree_members || 0);
        const shownDownlines = Math.max(0, nodes.length - (rootNode ? 1 : 0));
        const teamCountBadgeText = shownDownlines < totalTeamCount
            ? ('أعضاء فريقك: ' + totalTeamCount + ' • المعروض حالياً: ' + shownDownlines)
            : ('أعضاء فريقك: ' + totalTeamCount);

        container.innerHTML = STUDIO_CSS +
            '<div class="ts-wrap">' +
                // Top Header + Device Adaptive Depth Controls
                '<div class="ts-card" data-spec-id="member-tree-kpis">' +
                    '<div class="ts-header-bar">' +
                        '<div>' +
                            '<h2 style="margin:0;font-size:1.12rem;font-weight:900;">🌳 شجرتي الدولية</h2>' +
                            '<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                                '<span class="ts-badge" style="background:#ecfdf5;color:#065f46;">⭕ عرض الدوائر المختصر</span>' +
                                '<span class="ts-badge" style="background:#eff6ff;color:#1e40af;">' + teamCountBadgeText + '</span>' +
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
                            '<div class="ts-arms-row">' +
                                '<span class="ts-arm-pill ts-arm-right">↗ ' + t('tree.right_arm', 'الذراع الأيمن') + ': ' + Number(pb.right_total || 0) + ' (' + Number(pb.right_qualified || 0) + ' مؤهل)</span>' +
                                '<span class="ts-arm-pill ts-arm-left">↖ ' + t('tree.left_arm', 'الذراع الأيسر') + ': ' + Number(pb.left_total || 0) + ' (' + Number(pb.left_qualified || 0) + ' مؤهل)</span>' +
                            '</div>' +
                            '<div class="ts-power-bar-track"><div class="ts-power-right" style="width:' + rPct + '%;"></div><div class="ts-power-left" style="width:' + lPct + '%;"></div></div>' +
                        '</div>' +
                        '<div class="ts-spill-pill">✨ ' + t('tree.next_spillover', 'المقعد التلقائي القادم') + ': ' +
                            (pb.next_spillover_parent_code ? ('تحت <b>#' + Number(pb.next_spillover_parent_code) + '</b> — ' + (pb.next_spillover_side === 'right' ? 'الذراع الأيمن' : 'الذراع الأيسر')) : 'تلقائي في الذراع الأضعف') +
                        '</div>' +
                    '</div>' +

                    // Dynamic Country Lens Bar + Exact Constitutional Color Legend
                    '<div class="ts-lens-legend">' +
                        '<div data-spec-id="member-tree-lens-bar" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                            '<span style="font-size:0.76rem;font-weight:800;color:#64748b;">🌍 عدسة الدولة:</span>' +
                            '<button type="button" class="ts-btn' + (!STATE.countryCode ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setCountry(null)">الكل (' + totalTeamCount + ')</button>' +
                            '<span data-spec-id="member-tree-country-reports" style="display:inline-flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
                                countries.map(function (c) {
                                    const qCnt = Number(c.qualified || 0);
                                    return '<button type="button" class="ts-btn' + (STATE.countryCode === c.country_code ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setCountry(\'' + esc(c.country_code) + '\')">' +
                                        flagSvg(c.country_code, 16) + ' ' + esc(c.country_name_ar || c.country_code) + ' (' + Number(c.count) + (qCnt > 0 ? (' • ' + qCnt + ' 🟢') : '') + ')</button>';
                                }).join('') +
                            '</span>' +
                        '</div>' +
                        '<div class="ts-legend" aria-label="دليل ألوان الشجرة">' +
                            '<span class="ts-legend-item"><i class="ts-dot ts-dot-green"></i> مؤهل 100%</span>' +
                            '<span class="ts-legend-item"><i class="ts-dot ts-dot-orange"></i> قيد التجميع</span>' +
                            '<span class="ts-legend-item"><i class="ts-dot ts-dot-white"></i> 0%</span>' +
                            '<span class="ts-legend-item"><i class="ts-dot ts-dot-gray"></i> رديف (&gt;11)</span>' +
                            '<span class="ts-legend-item"><i class="ts-dot ts-dot-red"></i> مجمّد</span>' +
                        '</div>' +
                    '</div>' +
                '</div>' +

                // Interactive Tree Canvas (Compact Circles!)
                '<div id="tsViewport" data-spec-id="member-tree-earth-viewport" class="ts-viewport' + (STATE.fullscreen ? ' fullscreen' : '') + '">' +
                    '<div class="ts-fs-bar">' +
                        '<div class="ts-zoom-cluster" data-spec-id="member-tree-hud-dpad">' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.zoom(0.12)" title="تكبير">+</button>' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.zoom(-0.12)" title="تصغير">−</button>' +
                            '<button type="button" class="ts-btn" onclick="window.SAWYAN.TreeStudio.resetZoom()" title="إعادة ضبط">↺</button>' +
                            (STATE.fullscreen ? '<button type="button" class="ts-btn active" onclick="window.SAWYAN.TreeStudio.toggleFullscreen()">✕ خروج</button>' : '') +
                        '</div>' +
                        '<span class="ts-badge" style="background:rgba(255,255,255,0.92);border:1px solid #cbd5e1;color:#475569;">اضغط على أي دائرة لعرض بطاقة العضو</span>' +
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
                            '<button type="button" data-spec-id="member-tree-orange-filter" class="ts-btn' + (STATE.warTab === 'near' ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setWarTab(\'near\')">🟠 قريبون من التأهل 70–99% (' + nearList.length + ')</button>' +
                            '<button type="button" class="ts-btn' + (STATE.warTab === 'rollup' ? ' active' : '') + '" onclick="window.SAWYAN.TreeStudio.setWarTab(\'rollup\')">🚨 تنبيه Roll-Up (' + rollupList.length + ')</button>' +
                        '</div>' +
                    '</div>' +
                    warHtml +
                '</div>' +

                // Paginated Team Directory (Zero Focus Loss Search Input!)
                '<div class="ts-card" data-spec-id="member-tree-detail-table">' +
                    '<div class="ts-header-bar" style="margin-bottom:10px;">' +
                        '<div style="font-weight:900;font-size:0.96rem;">📋 دليل أعضاء الفرع المعروض (' + shownDownlines + ')</div>' +
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
                renderPaginatedTableOnly();
            });
        }

        renderPaginatedTableOnly();
        bindViewportInteractions();
        requestAnimationFrame(drawConnectors);
    }

    async function mount(containerId) {
        const host = document.getElementById(containerId || 'treePage');
        if (!host) return;
        host.innerHTML = STUDIO_CSS + '<div class="ts-card" style="text-align:center;padding:36px;color:#475569;font-weight:800;">🌳 جارٍ تحميل شجرتك من الخادم...</div>';
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

            const st = nodeStatus(node);
            const pct = Math.max(0, Math.min(100, Number(node.progress_pct || 0)));
            const firstName = getFirstName(node.full_name);
            const hasPhoto = Boolean(node.avatar_url && !node.is_tombstone_banned);

            const boxCur = node.box_currency_code || node.currency_code || 'EGP';
            const boxCC = node.box_country_code || node.country_code || '';
            const boxNameAr = node.box_country_name_ar || node.country_name_ar || boxCC;
            const resCur = node.residency_currency_code || node.currency_code || '';

            const achLocal = node.achieved_local !== undefined
                ? formatLocalMoney(node.achieved_local, boxCur)
                : ('$' + Number(node.accumulated_usd || 0).toFixed(2));
            const reqLocal = node.target_required_local !== undefined
                ? formatLocalMoney(node.target_required_local, boxCur)
                : ('$' + Number(node.target_required_usd || 24.75).toFixed(2));
            const remLocal = node.remaining_local !== undefined
                ? formatLocalMoney(node.remaining_local, boxCur)
                : ('$' + Number(node.remaining_usd || 0).toFixed(2));
            const projCarryOutLocal = Number(node.projected_carry_on_out_local || 0);
            const targetTopRight = pct >= 100
                ? (projCarryOutLocal > 0 ? ('✅ مكتمل 100% • ترحيل: ' + esc(formatLocalMoney(projCarryOutLocal, boxCur))) : '✅ مكتمل 100%')
                : ('متبقي: ' + esc(remLocal));

            const allCountryBoxes = Array.isArray(node.country_boxes) ? node.country_boxes : [];
            const extraBoxes = allCountryBoxes.filter(function (cb) {
                return cb && cb.country_code && (cb.country_code !== boxCC || allCountryBoxes.length > 1);
            });
            const resBoxObj = allCountryBoxes.find(function (cb) { return cb && (cb.is_residency || cb.country_code === node.country_code); });
            const isForeignBoxWhileHomeUnqual = Boolean(boxCC && node.country_code && boxCC !== node.country_code && !(resBoxObj && resBoxObj.is_qualified));
            const resNameAr = node.country_name_ar || node.country_code || '';
            const foreignScopeNoteHtml = isForeignBoxWhileHomeUnqual
                ? '<div data-spec-id="tree-foreign-box-scope-notice" style="margin-top:8px;padding:7px 9px;background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;font-size:0.74rem;line-height:1.55;color:#92400e;font-weight:700;">' +
                      'ℹ️ استقلال الدول: التأهل في ' + esc(boxNameAr) + ' يشمل عمولات ' + esc(boxNameAr) + ' فقط، ولا يغني عن إتمام هدف دولة التسجيل (' + esc(resNameAr) + ').' +
                  '</div>'
                : '';
            const multiBoxHtml = (extraBoxes.length > 0
                ? '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed rgba(15,23,42,0.12);display:flex;flex-direction:column;gap:4px;">' +
                      '<div style="font-size:0.71rem;font-weight:800;color:#475569;">🌍 تفصيل صناديق العضو حسب الدولة (استقلال الدول):</div>' +
                      extraBoxes.map(function (cb) {
                          const cbPct = Math.round(Number(cb.progress_pct || 0));
                          const cbIcon = cb.is_qualified ? '🟢' : (cbPct > 0 ? '🟠' : '⚪');
                          const cbAch = formatLocalMoney(cb.achieved_local || 0, cb.currency_code);
                          const cbReq = formatLocalMoney(cb.target_required_local || 0, cb.currency_code);
                          return '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:0.74rem;font-weight:800;background:rgba(255,255,255,0.65);padding:4px 8px;border-radius:8px;">' +
                              '<span>' + flagSvg(cb.country_code, 14) + ' ' + esc(cb.country_name_ar || cb.country_code) + (cb.is_residency ? ' <small style="color:#64748b;">(التسجيل)</small>' : ' <small style="color:#0284c7;">(أجنبية)</small>') + '</span>' +
                              '<span>' + cbIcon + ' ' + esc(cbAch) + ' / ' + esc(cbReq) + ' (' + cbPct + '%)</span>' +
                          '</div>';
                      }).join('') +
                  '</div>'
                : '') + foreignScopeNoteHtml;

            const sponsorText = node.sponsor_name
                ? (esc(node.sponsor_name) + ' <span style="color:#047857;font-family:Poppins,sans-serif;" dir="ltr">#' + Number(node.sponsor_code) + '</span>')
                : (node.sponsor_code ? ('<span dir="ltr">#' + Number(node.sponsor_code) + '</span>') : 'جذر المؤسسة (#0)');

            const countryLabel = esc(node.country_name_ar || node.country_code || '') + (resCur ? (' (' + esc(resCur) + ')') : '');
            const joinDateStr = formatJoinDate(node.created_at);
            const viewerDepth = Number(node.viewer_depth || 0);
            const depthLabel = viewerDepth === 0
                ? 'أنت (الجذر الحالي)'
                : ('الجيل ' + viewerDepth + (viewerDepth <= 10 ? ' (ضمن أول 10)' : ' (أبعد من 10)'));

            const leftCnt = Number(node.left_team_count !== undefined ? node.left_team_count : 0);
            const rightCnt = Number(node.right_team_count !== undefined ? node.right_team_count : 0);
            const totalTeam = Number(node.subtree_count || (leftCnt + rightCnt));

            const wa = formatWaLink(node.phone, 'أهلاً ' + (node.full_name || '') + ' — فريق SAWYAN');
            const phoneBlockHtml = (node.phone && wa)
                ? '<div class="ts-mm-phone-ok">' +
                      '<div>' +
                          '<div class="ts-mm-phone-num">' + esc(node.phone) + '</div>' +
                          '<div style="font-size:0.7rem;color:#047857;font-weight:700;margin-top:2px;">🔓 ظاهر لك (' + (viewerDepth === 0 ? 'حسابك الشخصي' : 'ضمن أول 10 مستويات أب لاين') + ')</div>' +
                      '</div>' +
                      '<a href="' + esc(wa) + '" target="_blank" rel="noopener noreferrer" class="ts-mm-wa-btn">💬 واتساب مباشر</a>' +
                  '</div>'
                : '<div class="ts-mm-phone-locked">' +
                      (node.is_tombstone_banned
                          ? '🔒 رقم الهاتف غير متاح لحساب مجمّد'
                          : '🔒 رقم الهاتف وزر الواتساب محميان — يظهران فقط لأول 10 مستويات أب لاين فوق العضو') +
                  '</div>';

            const avatarBg = st.key === 'white' ? '#ffffff;color:#0f172a;border-color:#cbd5e1;' : (st.color + ';color:#ffffff;border-color:#ffffff;');

            const ov = document.createElement('div');
            ov.id = 'tsInspectorOverlay';
            ov.className = 'ts-inspector';
            ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
            ov.innerHTML =
                '<div class="ts-inspector-card">' +
                    '<div class="ts-mm-hero">' +
                        '<div class="ts-mm-hero-main">' +
                            '<div class="ts-mm-avatar" style="background:' + avatarBg + '">' +
                                (hasPhoto ? '<img src="' + esc(node.avatar_url) + '" alt="' + esc(firstName) + '">' : esc(node.is_tombstone_banned ? 'مجمّد' : firstName)) +
                            '</div>' +
                            '<div style="min-width:0;">' +
                                '<div class="ts-mm-name">' + esc(node.full_name) + '</div>' +
                                '<div class="ts-mm-sub">' +
                                    '<span class="ts-mm-code">#' + Number(node.member_code) + '</span>' +
                                    '<span class="ts-mm-status" style="background:' + st.soft + ';color:' + st.text + ';">' + st.label + '</span>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        '<button type="button" class="ts-mm-close" onclick="document.getElementById(\'tsInspectorOverlay\').remove()" aria-label="إغلاق">✕</button>' +
                    '</div>' +
                    '<div class="ts-mm-body">' +
                        '<div class="ts-mm-target" style="background:' + st.soft + ';border-color:' + st.color + '44;">' +
                            '<div class="ts-mm-target-top" style="color:' + st.text + ';">' +
                                '<span>🎯 الهدف الشخصي الشهري — ' + flagSvg(boxCC, 14) + ' ' + esc(boxNameAr) + '</span>' +
                                '<span>' + targetTopRight + '</span>' +
                            '</div>' +
                            '<div class="ts-mm-target-vals">' +
                                '<span>' + esc(achLocal) + ' من أصل ' + esc(reqLocal) + '</span>' +
                                '<span style="color:' + st.color + ';" dir="ltr">' + Math.round(pct) + '%</span>' +
                            '</div>' +
                            '<div class="ts-mm-bar"><div class="ts-mm-bar-fill" style="width:' + pct + '%;background:' + st.color + ';"></div></div>' +
                            multiBoxHtml +
                        '</div>' +
                        '<div class="ts-mm-grid">' +
                            '<div class="ts-mm-cell">' +
                                '<div class="ts-mm-lbl">👤 الأب لاين الحقيقي (الراعي)</div>' +
                                '<div class="ts-mm-val">' + sponsorText + '</div>' +
                            '</div>' +
                            '<div class="ts-mm-cell">' +
                                '<div class="ts-mm-lbl">🌍 دولة التسجيل</div>' +
                                '<div class="ts-mm-val">' + flagSvg(node.country_code, 16) + ' ' + countryLabel + '</div>' +
                            '</div>' +
                            '<div class="ts-mm-cell">' +
                                '<div class="ts-mm-lbl">📅 تاريخ الاشتراك</div>' +
                                '<div class="ts-mm-val">' + esc(joinDateStr) + '</div>' +
                            '</div>' +
                            '<div class="ts-mm-cell">' +
                                '<div class="ts-mm-lbl">📍 المستوى في شجرتك</div>' +
                                '<div class="ts-mm-val">' + esc(depthLabel) + '</div>' +
                            '</div>' +
                            '<div class="ts-mm-team">' +
                                '<div>' +
                                    '<div class="ts-mm-lbl">🌳 عدد فريقه</div>' +
                                    '<div class="ts-mm-val">' + totalTeam + ' عضواً</div>' +
                                '</div>' +
                                '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                                    '<span class="ts-arm-pill ts-arm-right">يمين: ' + rightCnt + '</span>' +
                                    '<span class="ts-arm-pill ts-arm-left">يسار: ' + leftCnt + '</span>' +
                                '</div>' +
                            '</div>' +
                        '</div>' +
                        phoneBlockHtml +
                        '<button type="button" class="ts-mm-drill" onclick="document.getElementById(\'tsInspectorOverlay\').remove(); window.SAWYAN.TreeStudio.drillTo(' + Number(node.member_code) + ')">🔍 عرض شجرة هذا العضو كجذر</button>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(ov);
        }
    };
})();
