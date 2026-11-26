"""
SAWYAN V3.0 — /sawyan-robot Generation-4: Persona Experience Auditor
(`database/robot_gen4_experience_audit.py`)

WHY THIS EXISTS
  Gen-2 proves journeys work, Gen-3 proves every button is crash-free and every contract exists.
  Neither answered the Founder's real questions for each persona (Visitor / Member / Merchant /
  Cashier Employee / Admin):
    1. "هل الأرقام صحيحة؟"      — does every number on screen match PostgreSQL, across portals?
    2. "هل الاستخدام سهل؟"      — can a real thumb on a 375px phone read and press everything?
    3. "هل المهمة الأساسية قريبة؟" — is the persona's core action visible without hunting?
  Gen-2/Gen-3 also NEVER logged into the Cashier Employee portal (it always redirected to login),
  so that whole portal was untested. Gen-4 logs in via `?quick=employee`.

FOUR EXPERIENCE GATES (run on every tab of every persona, plus key modals):
  E1  Usability & Ergonomics (mobile-first)
        tap targets < 24px (P1) / < 32px (P2) · text < 11px · contrast < 3:1 · content cut off the
        screen · overlapping text · English text inside the Arabic UI · icon-only buttons without
        a label · empty visible containers.
  E2  Number Hygiene
        NaN / undefined / Infinity / null · money with > 2 decimals · negative money displays ·
        USD / $ shown on member local-currency screens (Financial Lock #3) · impossible percentages.
  E3  Data Truth Reconciliation (DOM == PostgreSQL bundle, and portal == portal)
        Member: wallet, team size, completed ops count, Lock #1 target box == SUM(approved invoices).
        Merchant: balance, credit, today sales, month sales == SUM(completed invoices), commission %.
        Admin: every KPI == recount of its own lists; ledger debit == credit; no negative liabilities.
        Cross-portal: admin view of member #N / merchant M == what that member / merchant sees.
  E4  Core-Task Reachability
        The persona's primary actions must be visible in the first mobile screen (no scrolling)
        and large enough to tap.

Usage:
  python database/robot_gen4_experience_audit.py                       # all personas
  python database/robot_gen4_experience_audit.py --persona member,merchant
  python database/robot_gen4_experience_audit.py --no-screens          # skip screenshots
Writes: visual_audit/experience_audit_report.json (+ visual_audit/experience/*.png)
Exit code 1 only on P0 (wrong number / broken value). P1/P2 are reported for founder triage.
"""

import argparse
import json
import pathlib
import re
import sys
import time

from playwright.sync_api import sync_playwright

DB_DIR = pathlib.Path(__file__).resolve().parent
REPO_DIR = DB_DIR.parent
REPORT_DIR = REPO_DIR / "visual_audit"
SHOT_DIR = REPORT_DIR / "experience"
if str(DB_DIR) not in sys.path:
    sys.path.insert(0, str(DB_DIR))

import verify_autonomous_user_journeys_v2 as gen2  # noqa: E402
import robot_gen3_interaction_crawler as gen3  # noqa: E402

LATIN_ALLOW = {
    "SAWYAN", "USD", "EGP", "TRY", "SAR", "AED", "EUR", "QR", "PIN", "KYC", "GPS", "PDF", "CSV", "SMS",
    "OTP", "VAT", "WIFI", "WI-FI", "WHATSAPP", "IBAN", "SWIFT", "PWA", "ID", "AM", "PM", "OK", "VISA",
    "MASTERCARD", "INSTAPAY", "VODAFONE", "CASH", "APPLE", "GOOGLE", "PAY", "EXCEL", "TOTP", "2FA",
    "LTR", "RTL", "AR", "EN", "TR", "A+", "A-", "LOGO", "SSID", "WIFI:", "BUY", "AND", "MAKE", "MONEY",
}

# ---------------------------------------------------------------------------
# In-page measurement scripts
# ---------------------------------------------------------------------------
JS_E1_E2 = r"""
(cfg) => {
  const vw = innerWidth, vh = innerHeight;
  const scope = (cfg.scopeSel && document.querySelector(cfg.scopeSel)) || document.body;
  const out = { tap: [], tiny: [], contrast: [], cut: [], overlap: [], english: [], techIds: [], iconOnly: [], empty: [], squeeze: [], numbers: [] };
  const isVis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const label = (el) => ((el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.value || el.id || el.tagName) + '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const inHScroll = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 2) return true;
    }
    return false;
  };
  const hiddenByAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden') return true;
    }
    return false;
  };
  const parseRgb = (c) => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const effectiveBg = (el) => {
    let layers = [];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseRgb(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let base = { r: 255, g: 255, b: 255 };
    for (let i = layers.length - 1; i >= 0; i--) {
      const c = layers[i];
      base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) };
    }
    return base;
  };

  const fixedAnc = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.position === 'fixed' || s.position === 'sticky') return p;
    }
    return null;
  };
  const clippedByDesign = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.transform && s.transform !== 'none') return true;
      if (/(hidden|clip)/.test(s.overflowX) || /(hidden|clip)/.test(s.overflow)) {
        const r = p.getBoundingClientRect();
        if (r.left >= -2 && r.right <= vw + 2) return true;
      }
    }
    return false;
  };
  const textOverMedia = (el) => {
    const r = el.getBoundingClientRect();
    const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight) return false;
    return document.elementsFromPoint(x, y).some(n => /^(IMG|VIDEO|CANVAS|IFRAME)$/.test(n.tagName));
  };
  const gradientText = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if ((s.webkitBackgroundClip || s.backgroundClip) === 'text') return true;
      if (s.webkitTextFillColor && /rgba\(0, 0, 0, 0\)|transparent/.test(s.webkitTextFillColor)) return true;
    }
    return false;
  };
  const emojiOnly = (t) => !/[\u0600-\u06FFA-Za-z0-9]/.test(t);
  const selfVisible = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || x > vw || y < 0 || y > innerHeight) return null;
    const top = document.elementFromPoint(x, y);
    return !!top && (el === top || el.contains(top) || top.contains(el));
  };
  const rectsOverlap = (a, b) => {
    const ra = Array.from(a.getClientRects()), rb = Array.from(b.getClientRects());
    let best = 0;
    for (const x of ra) for (const y of rb) {
      const ix = Math.min(x.right, y.right) - Math.max(x.left, y.left);
      const iy = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
      if (ix > 4 && iy > 4) best = Math.max(best, ix * iy);
    }
    return best;
  };

  // ---- E1a tap targets / icon-only buttons
  const interactive = Array.from(scope.querySelectorAll('button, a[href], [onclick], input:not([type=hidden]), select, textarea, [role="button"], summary'));
  const seenTap = new Set();
  for (const el of interactive) {
    if (!isVis(el) || hiddenByAncestor(el)) continue;
    if (el.closest('.sidebar') && vw <= 768) continue;
    if (el.closest('.leaflet-control-container')) continue;
    const s = getComputedStyle(el);
    if (el.tagName === 'A' && s.display === 'inline' && el.parentElement && (el.parentElement.innerText || '').length > (el.innerText || '').length + 20) continue;
    if (el.tagName === 'INPUT' && /checkbox|radio/.test(el.type)) continue;
    const r = el.getBoundingClientRect();
    const m = Math.min(r.width, r.height), mx = Math.max(r.width, r.height);
    const lb = label(el);
    const key = lb + '|' + Math.round(m);
    if (m < 32 && !seenTap.has(key)) {
      seenTap.add(key);
      const sev = (m < 24 && (mx < 44 || m < 20)) ? 'P1' : 'P2';
      out.tap.push({ el: lb, w: Math.round(r.width), h: Math.round(r.height), sev });
    }
    if ((el.tagName === 'BUTTON' || el.getAttribute('role') === 'button')) {
      const txt = (el.innerText || '').trim();
      const hasLetters = /[\u0600-\u06FFA-Za-z]{2,}/.test(txt);
      if (!hasLetters && !el.getAttribute('aria-label') && !el.getAttribute('title')) {
        out.iconOnly.push(txt || '(empty)');
      }
    }
  }

  // ---- leaf text elements
  const leaves = [];
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue || '').trim().length >= 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const seenEl = new Set();
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!el || seenEl.has(el) || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
    seenEl.add(el);
    if (!isVis(el) || hiddenByAncestor(el)) continue;
    if (el.closest('.sidebar') && vw <= 768) continue;
    leaves.push(el);
    if (leaves.length > 1600) break;
  }

  const seenTiny = new Set(), seenCon = new Set(), seenCut = new Set(), seenEn = new Set();
  const boxes = [];
  for (const el of leaves) {
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize) || 16;
    const txt = (el.innerText || '').trim().replace(/\s+/g, ' ');
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue; // screen-reader-only / visually hidden labels
    // E1b tiny text
    if (fs < 11 && /[\u0600-\u06FF0-9A-Za-z]/.test(txt) && !seenTiny.has(txt.slice(0, 40))) {
      seenTiny.add(txt.slice(0, 40));
      out.tiny.push({ text: txt.slice(0, 60), px: fs, sev: fs < 9.5 ? 'P1' : 'P2' });
    }
    // E1h one-word-per-line squeeze (a text column crushed by its siblings on mobile)
    const lh = parseFloat(s.lineHeight) || fs * 1.45;
    const words = txt.split(' ').filter(Boolean).length;
    if (vw <= 480 && words >= 3 && r.width < 95 && r.height >= lh * 2.6 && !el.closest('.leaflet-container')) {
      const row = el.parentElement && el.parentElement.parentElement ? el.parentElement.parentElement.getBoundingClientRect() : null;
      if (row && row.width > 250) out.squeeze.push({ kind: 'TEXT', text: txt.slice(0, 50), w: Math.round(r.width), lines: Math.round(r.height / lh) });
    }
    // E1c contrast
    const fg = parseRgb(s.color);
    if (fg && fg.a > 0.5 && !gradientText(el) && !textOverMedia(el)) {
      const bg = effectiveBg(el);
      if (bg) {
        const L1 = lum(fg), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const large = fs >= 18.5 || (fs >= 14 && Number(s.fontWeight) >= 700);
        const need = large ? 3 : 4.5;
        if (ratio < need && !seenCon.has(txt.slice(0, 40))) {
          seenCon.add(txt.slice(0, 40));
          out.contrast.push({ text: txt.slice(0, 60), ratio: Math.round(ratio * 100) / 100, sev: ratio < 2.5 ? 'P1' : 'P2' });
        }
      }
    }
    // E1d content cut off horizontally
    if ((r.right > vw + 2 || r.left < -2) && !inHScroll(el) && !clippedByDesign(el) && !seenCut.has(txt.slice(0, 40))) {
      const anc = el.closest('[style*="position: fixed"], .modal, .sw-toast, .notification-dropdown');
      if (!anc) { seenCut.add(txt.slice(0, 40)); out.cut.push({ text: txt.slice(0, 60), left: Math.round(r.left), right: Math.round(r.right) }); }
    }
    // E1e English in Arabic UI (technical IDs are reported separately)
    if (!/[\u0600-\u06FF]/.test(txt) && cfg.lang === 'ar' && !el.closest('.leaflet-control-container')) {
      const isTechId = /[0-9a-f]{8}-[0-9a-f]{4}|[0-9a-f]{16,}|\b(Ref|MBR|POS)\b[:\-]/i.test(txt);
      const words = (txt.match(/[A-Za-z][A-Za-z'+-]{2,}/g) || []).filter(w => !cfg.latinAllow.includes(w.toUpperCase()));
      const codeLike = /^[A-Z0-9#@._:\/-]+$/.test(txt.replace(/\s/g, '')) || /@|https?:|www\./.test(txt);
      if (isTechId) {
        if (out.techIds.length < 6 && !seenEn.has(txt.slice(0, 50))) { seenEn.add(txt.slice(0, 50)); out.techIds.push(txt.slice(0, 70)); }
      } else if (words.length >= 2 && !codeLike && !seenEn.has(txt.slice(0, 50))) {
        seenEn.add(txt.slice(0, 50));
        out.english.push(txt.slice(0, 70));
      }
    }
    if (r.top < vh * 2.2 && r.width < vw * 0.95 && txt.length >= 2 && !emojiOnly(txt)) boxes.push({ r, txt: txt.slice(0, 40), el, fx: fixedAnc(el) });
    out.numbers.push(txt.slice(0, 160));
  }
  // E1f overlapping text (first ~2 screens) — per-line client rects, ignoring content scrolling under fixed bars
  const seenOv = new Set();
  for (let i = 0; i < boxes.length && i < 450; i++) {
    for (let j = i + 1; j < boxes.length && j < 450; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.fx !== b.fx) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix <= 4 || iy <= 4) continue;
      // judge only what the eye can actually see: both texts must be on top at their own centre
      const va = selfVisible(a.el), vb = selfVisible(b.el);
      if (va !== true || vb !== true) continue;
      const area = rectsOverlap(a.el, b.el);
      if (area > 40) {
        const key = a.txt + '|' + b.txt;
        if (!seenOv.has(key)) { seenOv.add(key); out.overlap.push({ a: a.txt, b: b.txt, area: Math.round(area) }); }
      }
    }
  }
  // E1g empty visible containers
  if (vw <= 480) {
    scope.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea').forEach(el => {
      if (!isVis(el) || hiddenByAncestor(el)) return;
      const ml = Number(el.getAttribute('maxlength') || 0);
      if (ml > 0 && ml <= 6) return;
      const r = el.getBoundingClientRect();
      const host = el.parentElement ? el.parentElement.getBoundingClientRect() : null;
      if (host && host.width > 150 && el.tagName === 'INPUT') return; // search input embedded inside a wider select/combobox control
      if (r.width < 110) out.squeeze.push({ kind: 'INPUT', text: label(el), w: Math.round(r.width), lines: 1 });
    });
  }
  scope.querySelectorAll('[class*="card"], [class*="panel"], [class*="box"], section').forEach(el => {
    if (!isVis(el) || hiddenByAncestor(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 60 || r.width < 120) return;
    const txt = (el.innerText || '').trim();
    if (!txt && !el.querySelector('img, svg, canvas, iframe, video, input, select, textarea, .leaflet-container')) {
      out.empty.push((el.id ? '#' + el.id : '') + '.' + String(el.className).split(' ')[0]);
    }
  });
  out.numbers = out.numbers.join('\n');
  out.vw = vw;
  return out;
}
"""

# Lesson L23: the friendly Arabic error humanizer can MASK real JavaScript bugs (a TypeError becomes
# "تعذّر إتمام هذا الطلب حالياً لسبب تشغيلي"), so Gen-3/G4 text scanning can never see them. Gen-4 wraps
# SAWYAN.UI.humanizeError in every session and records the RAW error it receives.
JS_INIT_ERROR_TAP = r"""
window.__robotRawErrs = [];
(function () {
  const wrap = () => {
    const ui = window.SAWYAN && window.SAWYAN.UI;
    if (!ui || typeof ui.humanizeError !== 'function' || ui.__robotWrapped) return;
    const orig = ui.humanizeError;
    ui.humanizeError = function (e) {
      try {
        const raw = String((e && (e.stack || e.message)) || e || '');
        window.__robotRawErrs.push(raw.slice(0, 400));
      } catch (_x) {}
      return orig.apply(this, arguments);
    };
    ui.__robotWrapped = true;
  };
  setInterval(wrap, 25);
})();
"""
RE_JS_BUG = re.compile(r"TypeError|ReferenceError|SyntaxError|RangeError|is not a function|is not defined|Cannot read propert|Cannot set propert|Cannot create propert")

JS_TOPMOST_MODAL = r"""
() => {
  const vw = innerWidth, vh = innerHeight;
  let best = null, bestZ = -1;
  document.querySelectorAll('body *').forEach(el => {
    const s = getComputedStyle(el);
    if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') return;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.8 || r.height < vh * 0.6) return;
    if (!(el.innerText || '').trim()) return;
    const z = parseInt(s.zIndex, 10) || 0;
    if (z >= bestZ) { bestZ = z; best = el; }
  });
  if (!best) return null;
  if (!best.id) best.id = 'robotModalScope' + Math.random().toString(36).slice(2, 7);
  return '#' + best.id;
}
"""

# ---------------------------------------------------------------------------
# Python-side E2 number hygiene
# ---------------------------------------------------------------------------
CUR = r"(?:EGP|TRY|USD|SAR|AED|ج\.م|₺|\$|ليرة|جنيه)"
RE_BROKEN = re.compile(r"(?<![A-Za-z])(NaN|undefined|Infinity|null)(?![A-Za-z])")
RE_DEC3 = re.compile(r"\d[\d,]*\.\d{3,}[ \t]*" + CUR + "|" + CUR + r"[ \t]*\d[\d,]*\.\d{3,}")
RE_NEG = re.compile(r"(?:-|−)[ \t]?\d[\d,]*(?:\.\d+)?[ \t]*" + CUR + "|" + CUR + r"[ \t]?(?:-|−)\d")
RE_USD = re.compile(r"\$\s?\d|\d\s?\$|\bUSD\b")
RE_PCT = re.compile(r"(?<![+▲▼\d.])(\d{3,})(?:\.\d+)?\s?%")


def number_hygiene(text, persona, surface):
    issues = []
    for m in set(RE_BROKEN.findall(text)):
        issues.append(("P0", "BROKEN_VALUE_ON_SCREEN", m))
    for m in sorted(set(x.group(0) for x in RE_DEC3.finditer(text)))[:6]:
        issues.append(("P1", "MONEY_WITH_3PLUS_DECIMALS", m))
    for m in sorted(set(x.group(0) for x in RE_NEG.finditer(text)))[:6]:
        issues.append(("P2", "NEGATIVE_MONEY_DISPLAY (review: deduction or error?)", m))
    if persona == "member" and not surface.startswith("wallet") and RE_USD.search(text):
        lines = [ln for ln in text.splitlines() if RE_USD.search(ln)][:4]
        issues.append(("P1", "USD_ON_MEMBER_LOCAL_SCREEN (Lock #3)", " | ".join(x[:80] for x in lines)))
    for m in RE_PCT.finditer(text):
        v = float(m.group(1))
        if v > 100:
            line = next((ln for ln in text.splitlines() if m.group(0) in ln), m.group(0))
            issues.append(("P2", "PERCENT_ABOVE_100", line[:90]))
            break
    return issues


# ---------------------------------------------------------------------------
# Persona definitions
# ---------------------------------------------------------------------------
VISITOR_PAGES = [
    ("home", "preview/index.html"),
    ("merchants_directory", "preview/public/merchants.html"),
    ("auth_gateway", "preview/auth-gateway.html"),
    ("contact", "preview/public/contact.html"),
    ("member_register", "preview/member-dashboard/register.html?ref=1&country=EG"),
    ("merchant_register", "preview/merchant-dashboard/register.html"),
    ("member_login", "preview/member-dashboard/login.html"),
    ("terms", "preview/public/terms.html"),
]

CORE_TASKS = {
    "visitor": [
        ("ابدأ الآن / التسجيل", r"ابدأ الآن|سجّل|سجل الآن|انضم"),
        ("البحث عن متجر", r"ابحث"),
    ],
    "member": [
        ("وثّق فاتورة / كود QR للكاشير", r"وثّق|QR|كود"),
        ("صندوق الهدف الشهري", r"الهدف الشهري"),
    ],
    "merchant": [
        ("الطلبات المعلقة / التوثيق", r"معلق|بانتظار|اعتماد|توثيق"),
        ("الرصيد والشحن", r"الرصيد|شحن"),
    ],
    "employee": [
        ("الطلبات الواردة", r"الطلبات الواردة"),
        ("إنشاء توثيق", r"إنشاء توثيق"),
    ],
    "admin": [
        ("بطاقات المهام المعلقة", r"معلق|بانتظار|مراجعة"),
    ],
}

JS_CORE_TASK = r"""
(cfg) => {
  const rx = new RegExp(cfg.rx);
  const vh = innerHeight;
  const cands = Array.from(document.querySelectorAll('button, a[href], [onclick], [role="button"], h1, h2, h3, h4, [data-spec-id]'));
  let best = null;
  for (const el of cands) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const t = (el.innerText || el.getAttribute('aria-label') || '').trim();
    if (!rx.test(t)) continue;
    if (!best || r.top < best.top) best = { top: Math.round(r.top + scrollY), h: Math.round(r.height), w: Math.round(r.width), text: t.slice(0, 50) };
  }
  return { found: Boolean(best), aboveFold: Boolean(best && best.top < vh), vh, best };
}
"""


# ---------------------------------------------------------------------------
# E3 Data-truth reconciliation per persona
# ---------------------------------------------------------------------------
JS_MEMBER_TRUTH = r"""
() => {
  const b = window.__memberBundleCache || {};
  const p = b.profile || {}, w = b.wallet || {}, t = b.tree_analytics || {};
  const num = (id) => { const e = document.getElementById(id); if (!e) return null; const m = (e.innerText || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
  const txt = (id) => (document.getElementById(id)?.innerText || '').trim();
  const txs = Array.isArray(b.transactions) ? b.transactions : [];
  const boxes = Array.isArray(b.target_boxes) ? b.target_boxes : [];
  const period = b.period_ym || '';
  const sumByCur = {};
  for (const x of txs) {
    if (x.status !== 'completed') continue;
    if ((x.effective_period_ym || '') !== period) continue;
    sumByCur[x.currency_code] = (sumByCur[x.currency_code] || 0) + Number(x.income_plan_share_usd || 0);
  }
  return {
    memberCode: Number(p.member_code || 0),
    currency: p.currency_code, fx: Number(p.fx_rate_to_usd || 0),
    walletUsd: Number(w.balance_usd || 0), walletShown: num('walletBalance'), walletText: txt('walletBalance'),
    teamDb: Number(t.team_size_incl_self || 0), teamShown: num('teamSize'),
    opsDb: Number(p.completed_tx_count || 0), opsShown: num('totalTransactions'),
    opsInList: txs.filter(x => x.status === 'completed').length, listLen: txs.length,
    boxes: boxes.filter(x => !period || x.period_ym === period).map(x => ({ cc: x.country_code, period: x.period_ym, cur: x.currency_code, fx: Number(x.admin_fx_rate || 0), current: Number(x.current_month_purchases_usd || 0), carryIn: Number(x.carry_on_in_usd || 0), target: Number(x.target_required_usd || 0), qualified: Boolean(x.is_qualified) })),
    staleBoxesInBundle: boxes.filter(x => period && x.period_ym !== period).map(x => x.country_code + ':' + x.period_ym),
    sumCompletedShareUsdByCur: sumByCur,
    leftArm: Number(t.left_arm_count || 0), rightArm: Number(t.right_arm_count || 0), downlines: Number(t.total_team_count || 0)
  };
}
"""

JS_MERCHANT_TRUTH = r"""
() => {
  const b = window.__merchantBundleCache || {};
  const p = b.profile || {};
  const num = (id) => { const e = document.getElementById(id); if (!e) return null; const m = (e.innerText || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
  const txs = Array.isArray(b.completed_transactions) ? b.completed_transactions : [];
  const ym = new Date().toISOString().slice(0, 7);
  const monthTx = txs.filter(x => String(x.completed_at || x.created_at || '').slice(0, 7) === ym);
  const breakdown = (document.getElementById('homeBalanceBreakdown')?.innerText || '').replace(/,/g, '');
  const bm = breakdown.match(/(\d+(?:\.\d+)?)[^\d]+(\d+(?:\.\d+)?)/);
  return {
    code: p.merchant_code, currency: p.currency_code,
    freeBalance: Number(p.free_balance || 0), balanceShown: num('pendingPayment'),
    creditLimit: Number(p.credit_limit || 0), breakdownPrepaid: bm ? Number(bm[1]) : null, breakdownCredit: bm ? Number(bm[2]) : null,
    todaySalesDb: Number(p.today_sales_local || 0), todaySalesShown: num('todaySales'),
    monthSalesDb: Number(p.month_sales_local || 0),
    monthSalesFromTx: monthTx.reduce((s, x) => s + Number(x.total_amount || 0), 0),
    monthCommissionFromTx: monthTx.reduce((s, x) => s + Number(x.commission_amount || 0), 0),
    completedCount: txs.length, monthCount: monthTx.length,
    pct: Number(p.deduction_percent || 0), pctShown: num('radarCardContractPct'),
    netCheck: monthTx.filter(x => Math.abs(Number(x.total_amount || 0) - Number(x.commission_amount || 0) - Number(x.merchant_net_amount || 0)) > 0.02).map(x => x.sw_short_code).slice(0, 5)
  };
}
"""

JS_ADMIN_TRUTH = r"""
() => {
  const b = window.__SAWYAN_ADMIN_LIVE_BUNDLE__ || {};
  const k = b.kpis || {};
  const mems = (b.members || []).filter(m => Number(m.member_code) > 0);
  const mers = b.merchants || [];
  const txs = b.transactions || [];
  const countries = b.countries || [];
  const fxOf = (cc) => { const c = countries.find(x => x.country_code === cc); return c ? Number(c.admin_fx_rate || 1) : 1; };
  const zd = b.zero_discrepancy || {};
  const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
  const completed = txs.filter(t => t.status === 'completed');
  return {
    kpis: k,
    recount: {
      members_total: mems.length,
      members_banned: mems.filter(m => m.is_tombstone_banned).length,
      merchants_total: mers.length,
      merchants_isolated: mers.filter(m => m.is_isolated).length,
      transactions_total: txs.length,
      transactions_completed: completed.length,
      transactions_pending: txs.filter(t => /pending/.test(t.status || '')).length,
      member_wallets_payable_usd: Math.round(sum(mems, m => m.wallet_balance_usd) * 100) / 100,
      qualified_members_period: mems.filter(m => m.is_qualified_period).length,
      gmv_local_completed: Math.round(sum(completed, t => t.total_amount) * 100) / 100,
      commission_local_completed: Math.round(sum(completed, t => t.commission_amount) * 100) / 100,
      merchant_cash_usd: Math.round(sum(mers, m => Number(m.actual_cash_balance || 0) / fxOf(m.country_code)) * 100) / 100,
      pending_withdrawals: (b.withdrawals || []).filter(w => w.status === 'pending').length,
      open_disputes: (b.disputes || []).filter(d => !/resolved|closed|rejected/.test(d.status || '')).length
    },
    ledger: { debit: Number(zd.total_debit_usd || 0), credit: Number(zd.total_credit_usd || 0), diff: Number(zd.ledger_diff_usd || 0), unbalanced: Number(zd.unbalanced_entries_count || 0) },
    members: mems.map(m => ({ code: Number(m.member_code), wallet: Number(m.wallet_balance_usd || 0), current: Number(m.current_purchases_usd || 0), boxes: m.country_boxes })),
    merchants: mers.map(m => ({ code: m.merchant_code, cash: Number(m.actual_cash_balance || 0), credit: Number(m.credit_limit || 0), gmv: Number(m.gmv_completed || 0), pct: Number(m.deduction_percent || 0), ops: Number(m.ops_count || 0) })),
    homeText: (document.getElementById('homePage')?.innerText || '').replace(/,/g, '')
  };
}
"""


def close(a, b, tol=0.02):
    try:
        return a is not None and b is not None and abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return False


def add(findings, persona, surface, sev, gate, kind, detail):
    findings.append({"persona": persona, "surface": surface, "severity": sev, "gate": gate, "kind": kind, "detail": detail})


def reconcile_member(t, findings):
    s = "home"
    if t["walletShown"] is None or not close(t["walletShown"], t["walletUsd"] * t["fx"], 0.05):
        add(findings, "member", s, "P0", "E3", "WALLET_DOM_NE_DB", f"shown={t['walletText']} db={t['walletUsd']} USD x fx {t['fx']} = {round(t['walletUsd'] * t['fx'], 2)} {t['currency']}")
    if t["teamShown"] != t["teamDb"] or t["teamDb"] < 1:
        add(findings, "member", s, "P0", "E3", "TEAM_SIZE_DOM_NE_DB", f"shown={t['teamShown']} db={t['teamDb']}")
    if t["leftArm"] + t["rightArm"] != t["downlines"]:
        add(findings, "member", "tree", "P0", "E3", "LEFT_PLUS_RIGHT_NE_TEAM", f"left {t['leftArm']} + right {t['rightArm']} != downlines {t['downlines']}")
    if t["opsShown"] != t["opsDb"]:
        add(findings, "member", s, "P0", "E3", "OPS_COUNT_DOM_NE_DB", f"shown={t['opsShown']} db.completed_tx_count={t['opsDb']}")
    if t["opsDb"] != t["opsInList"]:
        add(findings, "member", "transactions", "P1", "E3", "OPS_COUNT_NE_TRANSACTIONS_LIST (Lock #4)", f"home completed_tx_count={t['opsDb']} but transactions list has {t['opsInList']} completed (of {t['listLen']})")
    for bx in t["boxes"]:
        expect = t["sumCompletedShareUsdByCur"].get(bx["cur"], 0.0)
        if not close(bx["current"], expect, 0.05):
            add(findings, "member", "home", "P0", "E3", "TARGET_BOX_NE_SUM_APPROVED_INVOICES (Lock #1)",
                f"box {bx['cc']}: current_month_purchases_usd={bx['current']} but SUM(income_plan_share_usd of completed {bx['cur']} invoices this month)={round(expect, 2)}")


def reconcile_merchant(t, findings):
    s = "home"
    if t["balanceShown"] is None or not close(t["balanceShown"], t["freeBalance"], 0.05):
        add(findings, "merchant", s, "P0", "E3", "BALANCE_DOM_NE_DB", f"shown={t['balanceShown']} db.free_balance={t['freeBalance']}")
    if t["breakdownPrepaid"] is not None and not close(t["breakdownPrepaid"], t["freeBalance"], 0.05):
        add(findings, "merchant", s, "P0", "E3", "PREPAID_BREAKDOWN_NE_DB", f"shown={t['breakdownPrepaid']} db={t['freeBalance']}")
    if t["breakdownCredit"] is not None and not close(t["breakdownCredit"], t["creditLimit"], 0.05):
        add(findings, "merchant", s, "P0", "E3", "CREDIT_BREAKDOWN_NE_DB", f"shown={t['breakdownCredit']} db={t['creditLimit']}")
    if t["todaySalesShown"] is None or not close(t["todaySalesShown"], t["todaySalesDb"], 0.05):
        add(findings, "merchant", s, "P0", "E3", "TODAY_SALES_DOM_NE_DB", f"shown={t['todaySalesShown']} db={t['todaySalesDb']}")
    if not close(t["monthSalesDb"], t["monthSalesFromTx"], 0.05):
        add(findings, "merchant", "financial", "P1", "E3", "MONTH_SALES_NE_SUM_COMPLETED", f"db.month_sales_local={t['monthSalesDb']} vs SUM(completed this month)={round(t['monthSalesFromTx'], 2)} ({t['monthCount']} tx)")
    if t["pctShown"] is not None and not close(t["pctShown"], t["pct"], 0.05):
        add(findings, "merchant", "radar", "P0", "E3", "COMMISSION_PCT_DOM_NE_DB", f"shown={t['pctShown']} db={t['pct']}")
    if t["netCheck"]:
        add(findings, "merchant", "transactions", "P0", "E3", "INVOICE_NET_NE_TOTAL_MINUS_COMMISSION", f"invoices: {t['netCheck']}")


def reconcile_admin(t, findings):
    k, rc = t["kpis"], t["recount"]
    pairs = [
        ("members_total", "members_total"), ("members_banned", "members_banned"), ("merchants_total", "merchants_total"),
        ("merchants_isolated", "merchants_isolated"), ("transactions_total", "transactions_total"),
        ("transactions_completed", "transactions_completed"), ("member_wallets_payable_usd", "member_wallets_payable_usd"),
        ("qualified_members_period", "qualified_members_period"), ("gmv_local_completed", "gmv_local_completed"),
        ("commission_local_completed", "commission_local_completed"), ("pending_withdrawals", "pending_withdrawals"),
        ("open_disputes", "open_disputes"),
    ]
    for kk, rk in pairs:
        if kk in k and not close(k.get(kk), rc.get(rk), 0.05):
            add(findings, "admin", "home", "P0", "E3", "KPI_NE_RECOUNT", f"kpis.{kk}={k.get(kk)} but recount of its own list={rc.get(rk)}")
    if "merchant_prepaid_float_usd" in k and not close(k.get("merchant_prepaid_float_usd"), rc["merchant_cash_usd"], 0.5):
        add(findings, "admin", "sovereignLive", "P1", "E3", "PREPAID_FLOAT_NE_MERCHANT_BALANCES",
            f"kpis.merchant_prepaid_float_usd={k.get('merchant_prepaid_float_usd')} vs SUM(merchant actual_cash_balance / fx)={rc['merchant_cash_usd']} USD")
    for kk in ("plan_pool_liability_usd", "member_wallets_payable_usd", "s03_suspense_usd", "treasury_revenue_usd"):
        if kk in k and isinstance(k.get(kk), (int, float)) and k.get(kk) < -0.009:
            add(findings, "admin", "sovereignLive", "P1", "E3", "NEGATIVE_BALANCE_KPI", f"kpis.{kk}={k.get(kk)} (a liability/balance shown below zero)")
    lg = t["ledger"]
    if not close(lg["debit"], lg["credit"], 0.01) or abs(lg["diff"]) > 0.009 or lg["unbalanced"] > 0:
        add(findings, "admin", "sovereignLive", "P0", "E3", "LEDGER_NOT_ZERO_DISCREPANCY", json.dumps(lg))
    if k.get("members_total") is not None and str(int(k["members_total"])) not in t["homeText"]:
        add(findings, "admin", "home", "P2", "E3", "KPI_NOT_VISIBLE_ON_HOME", f"members_total={k.get('members_total')} not found in Admin Home text")


def reconcile_cross(member_t, merchant_t, admin_t, findings):
    if admin_t and member_t:
        am = next((m for m in admin_t["members"] if m["code"] == member_t["memberCode"]), None)
        if not am:
            add(findings, "cross", "admin↔member", "P1", "E3", "MEMBER_MISSING_IN_ADMIN", f"member #{member_t['memberCode']}")
        else:
            if not close(am["wallet"], member_t["walletUsd"], 0.01):
                add(findings, "cross", "admin↔member", "P0", "E3", "WALLET_ADMIN_NE_MEMBER", f"#{member_t['memberCode']}: admin={am['wallet']} member={member_t['walletUsd']} USD")
            home_box = next((b for b in member_t["boxes"] if b["cur"] == member_t["currency"]), None)
            if home_box and not close(am["current"], home_box["current"], 0.05):
                add(findings, "cross", "admin↔member", "P0", "E3", "MONTH_BOX_ADMIN_NE_MEMBER", f"#{member_t['memberCode']}: admin current_purchases_usd={am['current']} member box={home_box['current']}")
    if admin_t and merchant_t:
        amr = next((m for m in admin_t["merchants"] if m["code"] == merchant_t["code"]), None)
        if not amr:
            add(findings, "cross", "admin↔merchant", "P1", "E3", "MERCHANT_MISSING_IN_ADMIN", merchant_t["code"])
        else:
            if not close(amr["cash"], merchant_t["freeBalance"], 0.05):
                add(findings, "cross", "admin↔merchant", "P0", "E3", "BALANCE_ADMIN_NE_MERCHANT", f"{merchant_t['code']}: admin actual_cash_balance={amr['cash']} merchant free_balance={merchant_t['freeBalance']}")
            if not close(amr["pct"], merchant_t["pct"], 0.01):
                add(findings, "cross", "admin↔merchant", "P0", "E3", "COMMISSION_PCT_ADMIN_NE_MERCHANT", f"admin={amr['pct']} merchant={merchant_t['pct']}")
            if not close(amr["ops"], merchant_t["completedCount"], 0):
                add(findings, "cross", "admin↔merchant", "P1", "E3", "OPS_COUNT_ADMIN_NE_MERCHANT", f"admin ops_count={amr['ops']} merchant completed list={merchant_t['completedCount']}")


# ---------------------------------------------------------------------------
# Surface audit
# ---------------------------------------------------------------------------
def audit_surface(page, persona, surface, findings, metrics, scope_sel=None, shots=True, lang="ar"):
    try:
        raw_errs = page.evaluate("() => { const r = window.__robotRawErrs || []; window.__robotRawErrs = []; return r; }")
    except Exception:
        raw_errs = []
    for raw in sorted(set(raw_errs)):
        if RE_JS_BUG.search(raw):
            add(findings, persona, surface, "P0", "E2", "JS_BUG_MASKED_AS_FRIENDLY_ERROR (L23)", raw.replace("\n", " ")[:260])
    try:
        res = page.evaluate(JS_E1_E2, {"scopeSel": scope_sel, "lang": lang, "latinAllow": sorted(LATIN_ALLOW)})
    except Exception as e:
        add(findings, persona, surface, "P1", "E1", "AUDIT_EVAL_FAILED", str(e)[:200])
        return
    mobile = res.get("vw", 1440) <= 480
    m = {"tap_small": len(res["tap"]), "tiny_text": len(res["tiny"]), "low_contrast": len(res["contrast"]),
         "cut_off": len(res["cut"]), "overlap": len(res["overlap"]), "english": len(res["english"]),
         "icon_only": len(res["iconOnly"]), "empty": len(res["empty"])}
    metrics.setdefault(persona, {})[surface] = m
    if mobile:
        for x in res["tap"]:
            add(findings, persona, surface, x["sev"], "E1", "TAP_TARGET_TOO_SMALL", f"{x['el']} ({x['w']}x{x['h']}px)")
    for x in res["tiny"]:
        add(findings, persona, surface, x["sev"], "E1", "TEXT_TOO_SMALL", f"{x['text']} ({x['px']}px)")
    for x in res["contrast"]:
        add(findings, persona, surface, x["sev"], "E1", "LOW_CONTRAST_TEXT", f"{x['text']} (ratio {x['ratio']})")
    for x in res["cut"]:
        add(findings, persona, surface, "P1", "E1", "CONTENT_CUT_OFF_SCREEN", f"{x['text']} (left {x['left']}, right {x['right']})")
    for x in res["overlap"][:12]:
        add(findings, persona, surface, "P1", "E1", "TEXT_OVERLAP", f"«{x['a']}» ↔ «{x['b']}» ({x['area']}px²)")
    if res["english"]:
        add(findings, persona, surface, "P2", "E1", "ENGLISH_TEXT_IN_ARABIC_UI", " | ".join(res["english"][:10]))
    if res.get("techIds"):
        add(findings, persona, surface, "P2", "E1", "TECHNICAL_ID_SHOWN_TO_USER", " | ".join(res["techIds"][:4]))
    if res["iconOnly"]:
        add(findings, persona, surface, "P2", "E1", "ICON_BUTTON_WITHOUT_LABEL", " ".join(sorted(set(res["iconOnly"]))[:15]))
    for x in res["empty"][:5]:
        add(findings, persona, surface, "P2", "E1", "EMPTY_VISIBLE_CONTAINER (Lock #5)", x)
    seen_sq = set()
    for x in res.get("squeeze", [])[:8]:
        key = x["kind"] + x["text"][:30]
        if key in seen_sq:
            continue
        seen_sq.add(key)
        if x["kind"] == "INPUT":
            add(findings, persona, surface, "P1", "E1", "SQUEEZED_INPUT_FIELD", f"«{x['text']}» only {x['w']}px wide on mobile")
        else:
            add(findings, persona, surface, "P1", "E1", "TEXT_SQUEEZED_ONE_WORD_PER_LINE", f"«{x['text']}» {x['w']}px wide → {x['lines']} lines")
    for sev, kind, det in number_hygiene(res["numbers"], persona, surface):
        add(findings, persona, surface, sev, "E2", kind, det)
    if shots:
        SHOT_DIR.mkdir(parents=True, exist_ok=True)
        try:
            page.screenshot(path=str(SHOT_DIR / f"{persona}_{surface}.png"), full_page=True)
        except Exception:
            pass


def core_tasks(page, persona, findings, metrics):
    for name, rx in CORE_TASKS.get(persona, []):
        r = page.evaluate(JS_CORE_TASK, {"rx": rx})
        metrics.setdefault("_core_tasks", {}).setdefault(persona, {})[name] = r
        if not r["found"]:
            add(findings, persona, "home", "P1", "E4", "CORE_TASK_NOT_FOUND", name)
        elif not r["aboveFold"]:
            add(findings, persona, "home", "P1", "E4", "CORE_TASK_BELOW_FOLD", f"{name}: first appears at y={r['best']['top']}px (screen {r['vh']}px) — «{r['best']['text']}»")
        elif min(r["best"]["h"], r["best"]["w"]) < 40 and r["vh"] <= 900:
            add(findings, persona, "home", "P2", "E4", "CORE_TASK_SMALL_TARGET", f"{name}: {r['best']['w']}x{r['best']['h']}px «{r['best']['text']}»")


def open_and_audit_modal(page, persona, name, js_open, findings, metrics, shots):
    try:
        ok = page.evaluate(f"() => {{ try {{ {js_open}; return true; }} catch (e) {{ return 'ERR: ' + e.message; }} }}")
    except Exception as e:
        ok = f"ERR: {e}"
    if ok is not True:
        add(findings, persona, f"modal:{name}", "P1", "E1", "MODAL_OPEN_FAILED", str(ok)[:160])
        return
    page.wait_for_timeout(700)
    scope = page.evaluate(JS_TOPMOST_MODAL)
    if not scope:
        add(findings, persona, f"modal:{name}", "P2", "E1", "MODAL_NOT_DETECTED", js_open[:80])
        return
    audit_surface(page, persona, f"modal_{name}", findings, metrics, scope_sel=scope, shots=shots)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
def run(personas, shots):
    findings, metrics, truths = [], {}, {}
    blocked = set()
    httpd, port = gen2.start_server()
    base = f"http://127.0.0.1:{port}"
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            def ctx_for(w, h):
                c = browser.new_context(viewport={"width": w, "height": h}, locale="ar-EG")
                c.add_init_script(JS_INIT_ERROR_TAP)
                gen3._sandbox_routes(c, blocked)
                return c

            if "visitor" in personas:
                c = ctx_for(375, 812)
                pg = c.new_page()
                for surf, rel in VISITOR_PAGES:
                    pg.goto(f"{base}/{rel}", wait_until="domcontentloaded", timeout=30000)
                    pg.wait_for_timeout(1800)
                    if surf == "home":
                        core_tasks(pg, "visitor", findings, metrics)
                    audit_surface(pg, "visitor", surf, findings, metrics, shots=shots)
                c.close()
                print(" [GEN-4] visitor audited")

            for persona, (w, h) in (("member", (375, 812)), ("merchant", (375, 812))):
                if persona not in personas:
                    continue
                c = ctx_for(w, h)
                pg = c.new_page()
                gen3.login(pg, base, persona)
                pg.evaluate("() => { const m = document.getElementById('memberModalOverlay'); if (m) m.classList.remove('active'); if (window.SAWYAN && SAWYAN.AppShell && SAWYAN.AppShell.closeOpenModal) SAWYAN.AppShell.closeOpenModal(); }")
                pg.wait_for_timeout(400)
                home = pg.url.split("#")[0]
                core_tasks(pg, persona, findings, metrics)
                truths[persona] = pg.evaluate(JS_MEMBER_TRUTH if persona == "member" else JS_MERCHANT_TRUTH)
                for tab in gen3._tabs(pg):
                    gen3._recover(pg, home, tab)
                    pg.wait_for_timeout(500)
                    audit_surface(pg, persona, tab, findings, metrics, shots=shots)
                modals = {
                    "member": [("qr", "openQuickMemberQrModal()"), ("withdraw", "openRequestWithdrawalModal()"), ("payout_method", "openAddPayoutMethodModal()")],
                    "merchant": [("topup", "openMerchantTopupModal()"), ("store_kit", "openStoreKitModal()")],
                }[persona]
                for name, js in modals:
                    gen3._recover(pg, home, "home")
                    open_and_audit_modal(pg, persona, name, js, findings, metrics, shots)
                c.close()
                print(f" [GEN-4] {persona} audited")

            if "employee" in personas:
                c = ctx_for(375, 812)
                pg = c.new_page()
                pg.goto(f"{base}/preview/merchant-dashboard/login.html?quick=employee", wait_until="domcontentloaded", timeout=30000)
                try:
                    pg.wait_for_url("**/employee.html**", timeout=25000)
                    pg.wait_for_load_state("networkidle", timeout=20000)
                    pg.wait_for_timeout(1500)
                    core_tasks(pg, "employee", findings, metrics)
                    for tab in ("pending", "create", "today"):
                        pg.evaluate(f"() => typeof switchEmpTab === 'function' && switchEmpTab('{tab}')")
                        pg.wait_for_timeout(900)
                        audit_surface(pg, "employee", tab, findings, metrics, shots=shots)
                except Exception as e:
                    add(findings, "employee", "login", "P0", "E4", "EMPLOYEE_PORTAL_UNREACHABLE", str(e)[:200])
                c.close()
                print(" [GEN-4] employee audited")

            if "admin" in personas:
                for (w, h) in ((1440, 900), (375, 812)):
                    c = ctx_for(w, h)
                    pg = c.new_page()
                    gen3.login(pg, base, "admin")
                    home = pg.url.split("#")[0]
                    if w == 1440:
                        gen3._goto_tab(pg, "home")
                        pg.wait_for_timeout(800)
                        core_tasks(pg, "admin", findings, metrics)
                        truths["admin"] = pg.evaluate(JS_ADMIN_TRUTH)
                    tag = "" if w == 1440 else "@375"
                    for tab in gen3._tabs(pg):
                        gen3._recover(pg, home, tab)
                        pg.wait_for_timeout(600)
                        audit_surface(pg, "admin" if w == 1440 else "admin_mobile", tab + tag, findings, metrics, shots=shots)
                    if w == 1440:
                        gen3._recover(pg, home, "merchants")
                        mid = pg.evaluate("() => ((window.__SAWYAN_ADMIN_LIVE_BUNDLE__ || {}).merchants || [])[0]?.id || ''")
                        if mid:
                            open_and_audit_modal(pg, "admin", "merchant_contract", f"svOpenMerchantContractModal('{mid}')", findings, metrics, shots)
                    c.close()
                print(" [GEN-4] admin audited (1440 + 375)")
            browser.close()
    finally:
        httpd.shutdown()

    if "member" in truths:
        reconcile_member(truths["member"], findings)
    if "merchant" in truths:
        reconcile_merchant(truths["merchant"], findings)
    if "admin" in truths:
        reconcile_admin(truths["admin"], findings)
    reconcile_cross(truths.get("member"), truths.get("merchant"), truths.get("admin"), findings)
    return findings, metrics, truths, sorted(blocked)


def main():
    ap = argparse.ArgumentParser(description="SAWYAN /sawyan-robot Gen-4 Persona Experience Auditor")
    ap.add_argument("--persona", default="visitor,member,merchant,employee,admin")
    ap.add_argument("--no-screens", action="store_true")
    args = ap.parse_args()
    personas = {x.strip() for x in args.persona.split(",") if x.strip()}
    REPORT_DIR.mkdir(exist_ok=True)
    t0 = time.time()
    findings, metrics, truths, blocked = run(personas, not args.no_screens)
    for t in truths.values():
        if isinstance(t, dict):
            t.pop("homeText", None)
    report = {
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "elapsed_sec": round(time.time() - t0, 1),
        "findings": findings, "metrics": metrics, "truths": truths, "sandbox_blocked": blocked,
    }
    out = REPORT_DIR / "experience_audit_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")

    by = {}
    for f in findings:
        by.setdefault(f["persona"], {}).setdefault(f["severity"], 0)
        by[f["persona"]][f["severity"]] += 1
    print(f"\n=== GEN-4 EXPERIENCE AUDIT ({report['elapsed_sec']}s) ===")
    for persona, sev in sorted(by.items()):
        print(f"  {persona:13s} P0={sev.get('P0', 0):3d}  P1={sev.get('P1', 0):3d}  P2={sev.get('P2', 0):3d}")
    p0 = [f for f in findings if f["severity"] == "P0"]
    for f in p0[:40]:
        print("  P0", json.dumps(f, ensure_ascii=False)[:300])
    print(f"  Full report: {out}")
    if p0:
        sys.exit(1)
    print("\n[SAWYAN /sawyan-robot GEN-4 EXPERIENCE AUDIT: NO P0]")


if __name__ == "__main__":
    main()
