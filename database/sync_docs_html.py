"""
SAWYAN Living Documentation HTML Synchronizer (`database/sync_docs_html.py`)
Converts master Markdown docs in `docs/` into styled, editable HTML documents
while preserving 100% of each template's <head>, toolbar, TOC anchors, and JS.
Pure Python stdlib (zero external pip dependencies).
"""

import html
import os
import re
import sys

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
DOCS_DIR = os.path.join(REPO_DIR, "docs")

SYNC_DATE = "2026-11-19"

CODE_STYLE = (
    "background: #f1f5f9; color: #0f766e; padding: 2px 7px; border-radius: 4px; "
    "font-family: Calibri, Consolas, monospace; font-size: 0.94em; direction: ltr; display: inline-block;"
)
STRONG_STYLE = "color: #0f172a; font-weight: 700;"
PRE_STYLE = (
    "direction: ltr; text-align: left; background: #0f172a; color: #38bdf8; "
    "padding: 15px 18px; border-radius: 10px; overflow-x: auto; "
    "font-family: Consolas, monospace; font-size: 0.96rem; line-height: 1.55;"
)
BQ_STYLE = (
    "background: #f0fdf4; border-right: 5px solid #10b981; padding: 16px 22px; "
    "margin: 20px 0; border-radius: 8px; color: #064e3b; font-size: 1.08rem; line-height: 1.85;"
)
TABLE_STYLE = (
    "width: 100%; border-collapse: collapse; background: #ffffff; "
    "border: 1px solid #cbd5e1; border-radius: 10px; font-size: 1.02rem;"
)
TH_STYLE = "padding: 11px 13px; border: 1px solid #047857; text-align: right; font-weight: 700;"
TD_STYLE = "padding: 10px 13px; border: 1px solid #cbd5e1; vertical-align: top; line-height: 1.75;"

# Exact section anchor mapping for docs/CONSTITUTION_V2.html floating TOC sidebar
CONSTITUTION_SECTION_ANCHORS = [
    ("sec-upline", "heading", lambda txt: "أمان المصادقة" in txt),
    ("sec-merchant-rates", "list", lambda txt: "ضبط النسب المالية للتاجر" in txt),
    ("sec-workflow3", "heading", lambda txt: "الوركفلو الثالث" in txt),
    ("sec-pin", "heading", lambda txt: "المسار (ب) في الشراء من الأرض" in txt),
    ("sec-prepaid", "heading", lambda txt: "الوركفلو الخامس" in txt),
    ("sec-infographics", "heading", lambda txt: "منظومة الإنفوجرافيك والمؤشرات التحفيزية" in txt),
    ("sec-currency", "heading", lambda txt: "منطق العملات وأسعار الصرف العالمية" in txt),
    ("sec-six-locks", "heading", lambda txt: "الأقفال الهندسية والمحاسبية الستة" in txt),
    ("sec-tx-sync", "heading", lambda txt: "شاشة العمليات المكتملة" in txt and "صندوق الهدف" in txt),
    ("sec-tree-lenses", "heading", lambda txt: "شاشة شجرتي الدولية والتقارير الشجرية" in txt),
    ("sec-uncertain", "heading", lambda txt: "الباب السادس: قائمة المراجعة الدورية" in txt),
    ("sec-expansion", "heading", lambda txt: "الباب السابع: خزينة أفكار التوسع" in txt),
    ("sec-chapter8", "heading", lambda txt: "الباب الثامن: دستور المعاملات" in txt),
    ("sec-chapter9", "heading", lambda txt: "الباب التاسع: الركائز الاستراتيجية" in txt),
]

# Exact chapter anchor mapping for docs/TECHNICAL_SPECS.html index links
TECH_CHAPTER_ANCHORS = [
    ("-الباب-الأول-الدستور-الهندسي-وحوكمة-التطوير-والذكاء-الاصطناعي", lambda txt: "الباب الأول:" in txt),
    ("-الباب-الثاني-المعمارية-البرمجية-فصل-الطبقات-التسع-وسجل-القرارات", lambda txt: "الباب الثاني:" in txt),
    ("-الباب-الثالث-هندسة-قواعد-البيانات-القاموس-الكامل-والزمن-الثنائي", lambda txt: "الباب الثالث:" in txt),
    ("-الباب-الرابع-محرك-دفتر-الأستاذ-المزدوج-الدقة-الحسابية-والتسوية-الشهرية", lambda txt: "الباب الرابع:" in txt),
    ("-الباب-الخامس-النواة-البرمجية-في-postgresql-core-sql-functions--triggers", lambda txt: "الباب الخامس:" in txt),
    ("-الباب-السادس-هندسة-الشجرة-المليونية-العدسات-الدولية-وجودة-الواجهة-الأمامية", lambda txt: "الباب السادس:" in txt),
    ("-الباب-السابع-معمارية-التكامل-عقود-الـ-apis-بوابات-الدفع-العالمية-ومنظومة-الكاشير-الأوفلاين", lambda txt: "الباب السابع:" in txt),
    ("-الباب-الثامن-الأمن-السيبراني-zero-trust-مصفوفة-rbac--makerchecker-والامتثال-الدولي", lambda txt: "الباب الثامن:" in txt),
    ("-الباب-التاسع-البنية-التحتية-السحابية-devops--cicd-النسخ-الاحتياطي-pitr-والتعافي-من-الكوارث", lambda txt: "الباب التاسع:" in txt),
    ("-الباب-العاشر-هندسة-الأداء-تحمل-الأعطال-المراقبة-الشاملة-وإدارة-الحوادث-والتغييرات", lambda txt: "الباب العاشر:" in txt),
    ("-الباب-الحادي-عشر-استراتيجية-ضمان-الجودة-الاختبارات-الـ-22-ومتجهات-الاختبار-الذهبية", lambda txt: "الباب الحادي عشر:" in txt),
    ("-الباب-الثاني-عشر-مصفوفة-تتبع-المتطلبات-الشاملة-rtm-وسجل-البنود-المجمّدة-للمراجعة", lambda txt: "الباب الثاني عشر:" in txt),
]


def github_heading_slug(plain_text: str) -> str:
    s = re.sub(r"[`*_\[\]()]", "", plain_text).strip().lower()
    out = []
    for ch in s:
        if ch in "\u060c\u061b\u061f":
            continue
        if ch.isalnum() or "\u0600" <= ch <= "\u06ff" or ch in "-_":
            out.append(ch)
        elif ch == " ":
            out.append("-")
    slug = "".join(out)
    slug = re.sub(r"-{2,}", "-", slug)
    return slug


def format_inline(text: str, allow_br: bool = False) -> str:
    code_tokens = []

    def stash_code(m):
        idx = len(code_tokens)
        code_tokens.append(f'<code style="{CODE_STYLE}">{html.escape(m.group(1))}</code>')
        return f"\x00CODE{idx}\x00"

    text = re.sub(r"`([^`\n]+)`", stash_code, text)

    br_token = "\x00BRTAG\x00"
    if allow_br:
        text = re.sub(r"<br\s*/?>", br_token, text, flags=re.IGNORECASE)

    link_tokens = []

    def stash_link(m):
        idx = len(link_tokens)
        lbl = format_inline_no_links(m.group(1))
        href = html.escape(m.group(2).strip(), quote=True)
        link_tokens.append(f'<a href="{href}" style="color: #047857; font-weight: 700;">{lbl}</a>')
        return f"\x00LINK{idx}\x00"

    text = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", stash_link, text)

    escaped = format_inline_no_links(text)

    for idx, link_html in enumerate(link_tokens):
        escaped = escaped.replace(f"\x00LINK{idx}\x00", link_html)
    for idx, code_html in enumerate(code_tokens):
        escaped = escaped.replace(f"\x00CODE{idx}\x00", code_html)
    if allow_br:
        escaped = escaped.replace(br_token, "<br>")
    return escaped


def format_inline_no_links(text: str) -> str:
    # Escape raw HTML characters first while preserving our placeholder tokens
    escaped = html.escape(text, quote=False)
    escaped = re.sub(
        r"\*\*([^*]+?)\*\*",
        lambda m: f'<strong style="{STRONG_STYLE}">{m.group(1)}</strong>',
        escaped,
    )
    escaped = re.sub(
        r"(?<!\*)\*([^*\n]+?)\*(?!\*)",
        lambda m: f"<em>{m.group(1)}</em>",
        escaped,
    )
    return escaped


def split_table_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    cells = []
    cur = []
    in_code = False
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "`":
            in_code = not in_code
            cur.append(ch)
        elif ch == "\\" and i + 1 < len(s) and s[i + 1] == "|":
            cur.append("|")
            i += 1
        elif ch == "|" and not in_code:
            cells.append("".join(cur).strip())
            cur = []
        else:
            cur.append(ch)
        i += 1
    cells.append("".join(cur).strip())
    return cells


def is_table_separator(line: str) -> bool:
    s = line.strip()
    if "|" not in s:
        return False
    parts = split_table_row(s)
    if not parts:
        return False
    return all(bool(re.match(r"^:?-{1,}:?$", p.strip())) for p in parts if p.strip() != "")


def markdown_to_html(md_text: str, use_constitution_anchors: bool = False) -> str:
    lines = md_text.splitlines()
    n = len(lines)
    i = 0
    out = []
    list_stack = []  # list of ('ul'|'ol', indent)
    assigned_anchors = set()
    used_slugs = set()

    def close_lists():
        while list_stack:
            tag, _ = list_stack.pop()
            out.append(f"</{tag}>")

    def match_sec_anchor(kind: str, raw_text: str):
        if use_constitution_anchors:
            for sid, expected_kind, pred in CONSTITUTION_SECTION_ANCHORS:
                if sid not in assigned_anchors and expected_kind == kind and pred(raw_text):
                    assigned_anchors.add(sid)
                    return sid
        elif kind == "heading":
            for sid, pred in TECH_CHAPTER_ANCHORS:
                if sid not in assigned_anchors and pred(raw_text):
                    assigned_anchors.add(sid)
                    return sid
        return None

    while i < n:
        line = lines[i]
        stripped = line.strip()

        # Blank line
        if not stripped:
            close_lists()
            i += 1
            continue

        # Code fence (including indented fences inside lists)
        fence_m = re.match(r"^(\s*)```([^\n]*)$", line)
        if fence_m:
            close_lists()
            lang = fence_m.group(2).strip()
            code_lines = []
            i += 1
            while i < n and not re.match(r"^\s*```\s*$", lines[i]):
                code_lines.append(lines[i])
                i += 1
            if i < n:
                i += 1
            escaped_code = html.escape("\n".join(code_lines))
            lang_attr = f' data-lang="{html.escape(lang, quote=True)}"' if lang else ""
            out.append(f'<pre style="{PRE_STYLE}"{lang_attr}><code>{escaped_code}</code></pre>')
            continue

        # Horizontal rule
        if re.match(r"^-{3,}$", stripped) or re.match(r"^\*{3,}$", stripped):
            close_lists()
            out.append('<hr style="border: none; border-top: 2px solid #e2e8f0; margin: 30px 0;">')
            i += 1
            continue

        # Headings (# to ####)
        h_m = re.match(r"^(#{1,4})\s+(.*)$", stripped)
        if h_m:
            close_lists()
            lvl = len(h_m.group(1))
            raw_title = h_m.group(2).strip()
            sid = match_sec_anchor("heading", raw_title)
            if sid:
                id_attr = f' id="{sid}"'
            else:
                slug = github_heading_slug(raw_title)
                if slug and slug not in used_slugs:
                    used_slugs.add(slug)
                    id_attr = f' id="{html.escape(slug, quote=True)}"'
                else:
                    id_attr = ""
            out.append(f"<h{lvl}{id_attr}>{format_inline(raw_title)}</h{lvl}>")
            i += 1
            continue

        # Blockquote (including indented >)
        if re.match(r"^\s*>\s?", line):
            close_lists()
            bq_paras = []
            while i < n and re.match(r"^\s*>\s?", lines[i]):
                q_line = re.sub(r"^\s*>\s?", "", lines[i]).rstrip()
                if q_line.strip():
                    bq_paras.append(f'<p style="margin: 0 0 8px 0;">{format_inline(q_line)}</p>')
                i += 1
            out.append(f'<blockquote style="{BQ_STYLE}">\n' + "\n".join(bq_paras) + "\n</blockquote>")
            continue

        # Markdown Table
        if "|" in stripped and i + 1 < n and is_table_separator(lines[i + 1]):
            close_lists()
            headers = split_table_row(lines[i])
            sep_cells = split_table_row(lines[i + 1])
            aligns = []
            for sc in sep_cells:
                sc_s = sc.strip()
                if sc_s.startswith(":") and sc_s.endswith(":"):
                    aligns.append("center")
                elif sc_s.endswith(":"):
                    aligns.append("left")
                else:
                    aligns.append("right")
            i += 2
            rows = []
            while i < n and lines[i].strip() and "|" in lines[i]:
                rows.append(split_table_row(lines[i]))
                i += 1
            tbl_parts = [f'<div style="overflow-x: auto; margin: 16px 0;"><table style="{TABLE_STYLE}">']
            tbl_parts.append('<thead><tr style="background: #065f46; color: #ffffff;">')
            for idx_h, h_cell in enumerate(headers):
                al = aligns[idx_h] if idx_h < len(aligns) else "right"
                tbl_parts.append(
                    f'<th style="padding: 11px 13px; border: 1px solid #047857; text-align: {al}; font-weight: 700;">'
                    f"{format_inline(h_cell, allow_br=True)}</th>"
                )
            tbl_parts.append("</tr></thead><tbody>")
            for r_idx, row in enumerate(rows):
                bg = "#ffffff" if r_idx % 2 == 0 else "#f8fafc"
                tbl_parts.append(f'<tr style="background: {bg};">')
                for idx_c in range(len(headers)):
                    c_txt = row[idx_c] if idx_c < len(row) else ""
                    al = aligns[idx_c] if idx_c < len(aligns) else "right"
                    tbl_parts.append(
                        f'<td style="{TD_STYLE} text-align: {al};">{format_inline(c_txt, allow_br=True)}</td>'
                    )
                tbl_parts.append("</tr>")
            tbl_parts.append("</tbody></table></div>")
            out.append("\n".join(tbl_parts))
            continue

        # Lists (unordered `- ` / `* ` or ordered `1. `)
        ul_m = re.match(r"^(\s*)[-*]\s+(.*)$", line)
        ol_m = re.match(r"^(\s*)(\d+)\.\s+(.*)$", line)
        if ul_m or ol_m:
            if ul_m:
                indent = len(ul_m.group(1))
                ltype = "ul"
                item_text = ul_m.group(2).strip()
                val_attr = ""
            else:
                indent = len(ol_m.group(1))
                ltype = "ol"
                num_val = ol_m.group(2)
                item_text = ol_m.group(3).strip()
                val_attr = f' value="{num_val}"'

            if not list_stack:
                tag_open = (
                    '<ul style="padding-right: 25px; list-style-type: disc; margin: 12px 0;">'
                    if ltype == "ul"
                    else '<ol style="padding-right: 25px; margin: 12px 0;">'
                )
                out.append(tag_open)
                list_stack.append((ltype, indent))
            elif list_stack[-1][0] != ltype and indent == list_stack[-1][1]:
                old_t, _ = list_stack.pop()
                out.append(f"</{old_t}>")
                tag_open = (
                    '<ul style="padding-right: 25px; list-style-type: disc; margin: 12px 0;">'
                    if ltype == "ul"
                    else '<ol style="padding-right: 25px; margin: 12px 0;">'
                )
                out.append(tag_open)
                list_stack.append((ltype, indent))

            li_margin = "22px" if indent >= 2 else "0"
            sid = match_sec_anchor("list", item_text)
            span_anchor = (
                f'<span id="{sid}" style="scroll-margin-top: 90px; display:inline-block;"></span>'
                if sid
                else ""
            )
            out.append(
                f'<li{val_attr} style="margin-right: {li_margin}; margin-bottom: 9px; line-height: 1.85;">'
                f"{span_anchor}{format_inline(item_text)}</li>"
            )
            i += 1
            continue

        # Paragraph (collect consecutive plain lines)
        close_lists()
        para_lines = [stripped]
        i += 1
        while i < n:
            nxt = lines[i]
            nxt_s = nxt.strip()
            if (
                not nxt_s
                or re.match(r"^(#{1,4})\s+", nxt_s)
                or re.match(r"^\s*```", nxt)
                or re.match(r"^\s*>\s?", nxt)
                or re.match(r"^-{3,}$", nxt_s)
                or re.match(r"^\*{3,}$", nxt_s)
                or re.match(r"^(\s*)[-*]\s+", nxt)
                or re.match(r"^(\s*)(\d+)\.\s+", nxt)
                or ("|" in nxt_s and i + 1 < n and is_table_separator(lines[i + 1]))
            ):
                break
            para_lines.append(nxt_s)
            i += 1
        out.append(f'<p style="margin-bottom: 14px; line-height: 1.85;">{format_inline(" ".join(para_lines))}</p>')

    close_lists()
    return "\n".join(out)


def sync_template_html(md_path: str, html_path: str, use_constitution_anchors: bool) -> dict:
    md_text = open(md_path, "r", encoding="utf-8").read()
    tpl = open(html_path, "r", encoding="utf-8").read()

    hb = tpl.find('<div class="hero-banner">')
    if hb == -1:
        raise RuntimeError(f"Template missing .hero-banner in {html_path}")
    hb_end = tpl.find("</div>", hb) + len("</div>")

    end_marker = "\n        </div>\n    </div>\n    <script>"
    end_idx = tpl.rfind(end_marker)
    if end_idx == -1:
        raise RuntimeError(f"Template missing closing #editable-content marker in {html_path}")

    prefix = tpl[:hb_end]
    prefix = re.sub(r"محدّث \d{4}-\d{2}-\d{2}", f"محدّث {SYNC_DATE}", prefix)
    prefix = re.sub(r"Updated \d{4}-\d{2}-\d{2}", f"Updated {SYNC_DATE}", prefix)
    suffix = tpl[end_idx:]

    rendered_body = markdown_to_html(md_text, use_constitution_anchors=use_constitution_anchors)
    new_html = prefix + "\n            " + rendered_body + suffix

    if use_constitution_anchors:
        toc_section = prefix
        toc_ids = re.findall(r'href="#(sec-[^"]+)"', toc_section)
        missing = [sid for sid in toc_ids if f'id="{sid}"' not in rendered_body]
        if missing:
            raise RuntimeError(f"Missing TOC anchor targets in rendered CONSTITUTION_V2.html: {missing}")

    with open(html_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new_html)

    return {"html": html_path, "bytes": len(new_html.encode("utf-8"))}


def sync_portal_hub_html(hub_path: str) -> None:
    if not os.path.exists(hub_path):
        return
    txt = open(hub_path, "r", encoding="utf-8").read()
    txt = re.sub(r"2026-11-\d{2}", SYNC_DATE, txt)
    txt = txt.replace(
        "الجدول الـ 36 في Supabase PostgreSQL",
        "الجداول الـ 47 في Supabase PostgreSQL والشجرة الدائرية الكاملة للإدارة وLMS وGeoNames",
    )
    txt = txt.replace(
        "الجداول الـ 36",
        "الجداول الـ 47",
    )
    txt = txt.replace(
        "وشاشات التاجر والإدارة",
        "وشاشات التاجر والـ 16 وجهة إدارية (شاملةً الشجرة الكاملة بصورة دوائر والأكاديمية المستقلة)",
    )
    with open(hub_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)


def main():
    if not os.path.isdir(DOCS_DIR):
        print("[DOC SYNC BUILD SKIP] `docs/` directory not found.")
        return

    r1 = sync_template_html(
        os.path.join(DOCS_DIR, "الملف_التقني_للمطورين.md"),
        os.path.join(DOCS_DIR, "TECHNICAL_SPECS.html"),
        use_constitution_anchors=False,
    )
    r2 = sync_template_html(
        os.path.join(DOCS_DIR, "وصف_الموقع_البناء_2.md"),
        os.path.join(DOCS_DIR, "CONSTITUTION_V2.html"),
        use_constitution_anchors=True,
    )
    sync_portal_hub_html(os.path.join(DOCS_DIR, "PROJECT_DOCUMENTATION.html"))

    print(f"[DOC HTML SYNC OK] TECHNICAL_SPECS.html ({r1['bytes']:,} bytes)")
    print(f"[DOC HTML SYNC OK] CONSTITUTION_V2.html ({r2['bytes']:,} bytes)")
    print("[DOC HTML SYNC OK] PROJECT_DOCUMENTATION.html date & summary refreshed")

    if "--no-backup" not in sys.argv:
        try:
            if DB_DIR not in sys.path:
                sys.path.insert(0, DB_DIR)
            import sync_private_docs_backup

            sync_private_docs_backup.sync_private_docs()
        except Exception as exc:
            print(f"[PRIVATE DOCS WARN] Auto-backup hook skipped: {exc}")


if __name__ == "__main__":
    main()
