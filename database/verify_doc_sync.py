"""
SAWYAN Living Documentation Sync Verification Gate (`database/verify_doc_sync.py`)
Verifies that:
  1. Every required RPC across Member, Merchant, and Admin portals in
     `specs/ui_dom_rpc_manifest.json` (plus `search_geonames_locations`) is
     documented in `docs/الملف_التقني_للمطورين.md`.
  2. Major shipped screens/capabilities (`networkTreePage`, `academyAdminPage`,
     `get_admin_full_tree`, `168` countries GeoNames) are documented in
     `docs/وصف_الموقع_البناء_2.md` and `docs/الملف_التقني_للمطورين.md`.
  3. Generated HTML versions (`TECHNICAL_SPECS.html`, `CONSTITUTION_V2.html`)
     are fresh (>= Markdown mtime), non-empty (>= 100 KB), synced with latest
     shipped features, and all `href="#sec-..."` TOC anchors resolve cleanly.

Note: `docs/` is listed in `.gitignore` on remote clones. If `docs/` is absent,
this script exits 0 cleanly with `[DOC SYNC SKIP]` so CI never breaks.
"""

import json
import os
import re
import sys

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
DOCS_DIR = os.path.join(REPO_DIR, "docs")
MANIFEST_PATH = os.path.join(REPO_DIR, "specs", "ui_dom_rpc_manifest.json")


def main():
    if not os.path.isdir(DOCS_DIR):
        print("[DOC SYNC SKIP] `docs/` directory is not present (gitignored local docs).")
        return

    manifest = json.load(open(MANIFEST_PATH, "r", encoding="utf-8"))

    tech_md_path = os.path.join(DOCS_DIR, "الملف_التقني_للمطورين.md")
    const_md_path = os.path.join(DOCS_DIR, "وصف_الموقع_البناء_2.md")
    tech_html_path = os.path.join(DOCS_DIR, "TECHNICAL_SPECS.html")
    const_html_path = os.path.join(DOCS_DIR, "CONSTITUTION_V2.html")

    failures = []

    for p in [tech_md_path, const_md_path, tech_html_path, const_html_path]:
        if not os.path.exists(p):
            failures.append(f"Missing required documentation file: {os.path.relpath(p, REPO_DIR)}")

    if failures:
        for f in failures:
            print(f"[DOC SYNC FAIL] {f}", file=sys.stderr)
        sys.exit(1)

    tech_md = open(tech_md_path, "r", encoding="utf-8").read()
    const_md = open(const_md_path, "r", encoding="utf-8").read()
    tech_html = open(tech_html_path, "r", encoding="utf-8").read()
    const_html = open(const_html_path, "r", encoding="utf-8").read()

    # 1. Verify all required RPCs from manifest + search_geonames_locations are documented in tech MD
    required_rpcs = set()
    for portal_cfg in manifest.get("portals", {}).values():
        for rpc_name in portal_cfg.get("required_rpcs", []):
            required_rpcs.add(rpc_name)
    required_rpcs.add("search_geonames_locations")

    missing_rpcs = sorted(r for r in required_rpcs if r not in tech_md)
    if missing_rpcs:
        failures.append(f"RPCs missing from `الملف_التقني_للمطورين.md`: {missing_rpcs}")

    # 2. Verify recent major shipped features are present in both living docs
    for marker in ["networkTreePage", "academyAdminPage", "get_admin_full_tree", "search_geonames_locations", "168"]:
        if marker not in const_md:
            failures.append(f"Missing feature marker `{marker}` in `وصف_الموقع_البناء_2.md`")
        if marker not in tech_md:
            failures.append(f"Missing feature marker `{marker}` in `الملف_التقني_للمطورين.md`")

    # 2b. Automatically verify every numbered SQL migration (>= 25) is documented in `الملف_التقني_للمطورين.md`
    undocumented_migrations = []
    for fn in sorted(os.listdir(DB_DIR)):
        m = re.match(r"^(\d+)_.*\.sql$", fn)
        if m and int(m.group(1)) >= 25:
            if fn not in tech_md:
                undocumented_migrations.append(fn)
    if undocumented_migrations:
        failures.append(
            f"SQL migrations (>= 25) missing from `الملف_التقني_للمطورين.md`: {undocumented_migrations}"
        )

    # 3. Verify HTML sizes, freshness vs Markdown mtimes, and synced content
    for label, md_p, html_p, html_txt in [
        ("TECHNICAL_SPECS.html", tech_md_path, tech_html_path, tech_html),
        ("CONSTITUTION_V2.html", const_md_path, const_html_path, const_html),
    ]:
        size_b = os.path.getsize(html_p)
        if size_b < 100_000:
            failures.append(f"{label} unexpectedly small ({size_b:,} bytes < 100,000)")
        md_mtime = os.path.getmtime(md_p)
        html_mtime = os.path.getmtime(html_p)
        if html_mtime + 2.0 < md_mtime:
            failures.append(f"{label} is older than its Markdown source; run `database/sync_docs_html.py`")
        for kw in ["get_admin_full_tree", "networkTreePage", "admin_manage_academy_lms", "search_geonames_locations"]:
            if kw not in html_txt:
                failures.append(f"{label} missing synced keyword `{kw}`; run `database/sync_docs_html.py`")

    # 3b. Verify UNCERTAIN_REVIEW.html & tools/living-docs/ viewer mirrors stay fresh with Markdown sources
    uncertain_md_path = os.path.join(DOCS_DIR, "بنود_غير_متأكد_للمراجعة.md")
    uncertain_html_path = os.path.join(DOCS_DIR, "UNCERTAIN_REVIEW.html")
    if os.path.exists(uncertain_md_path) and os.path.exists(uncertain_html_path):
        if os.path.getmtime(uncertain_html_path) + 2.0 < os.path.getmtime(uncertain_md_path):
            failures.append("UNCERTAIN_REVIEW.html is older than بنود_غير_متأكد_للمراجعة.md; run `database/sync_docs_html.py`")

    living_dir = os.path.join(REPO_DIR, "tools", "living-docs")
    if os.path.isdir(living_dir):
        for md_p, viewer_fn in [
            (const_md_path, "doc1_site_operations.html"),
            (tech_md_path, "doc3_technical_specs.html"),
            (uncertain_md_path, "doc4_uncertain_review.html"),
        ]:
            vp = os.path.join(living_dir, viewer_fn)
            if os.path.exists(md_p) and os.path.exists(vp):
                if os.path.getmtime(vp) + 2.0 < os.path.getmtime(md_p):
                    failures.append(f"tools/living-docs/{viewer_fn} is older than its Markdown source; run `database/sync_docs_html.py`")

    # 4. Verify all CONSTITUTION_V2.html TOC anchor links resolve to valid DOM ids
    ec_idx = const_html.find('id="editable-content"')
    if ec_idx == -1:
        failures.append('CONSTITUTION_V2.html missing `id="editable-content"` container')
    else:
        toc_part = const_html[:ec_idx]
        body_part = const_html[ec_idx:]
        toc_ids = re.findall(r'href="#(sec-[^"]+)"', toc_part)
        if len(toc_ids) < 10:
            failures.append(f"CONSTITUTION_V2.html TOC has too few anchor links ({len(toc_ids)})")
        missing_anchors = [sid for sid in toc_ids if f'id="{sid}"' not in body_part]
        if missing_anchors:
            failures.append(f"CONSTITUTION_V2.html TOC anchors missing in body: {missing_anchors}")

    if failures:
        for f in failures:
            print(f"[DOC SYNC FAIL] {f}", file=sys.stderr)
        sys.exit(1)

    print(f"[DOC SYNC PASS] {len(required_rpcs)} RPCs & shipped screens verified in Markdown docs")
    print("[DOC SYNC PASS] TECHNICAL_SPECS.html & CONSTITUTION_V2.html fresh, valid, and TOC-verified")
    print("\n[DOC SYNC GATE: 100% GREEN]")


if __name__ == "__main__":
    main()
