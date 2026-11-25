"""
SAWYAN V3.0 — Stage 18 Static DOM, HTML5 Validity & UX Hygiene Gate
(`database/verify_dom_and_form_lint.py`)

Hard pre-publish & CI gate that mathematically prevents silly UI/HTML5 bugs
from EVER reaching production again:
  1. RULE_HTML5_STEP_MISMATCH:
     - Any `<input type="number">` whose numeric `value` violates `(value - min) % step == 0`
     - Any `<input type="number">` with `step > 1` where `min` is NOT a multiple of `step`
       (e.g. `min="1" step="50"` which rejected `2000` and forced `2001/3001/20001`!)
     - Any money/amount/topup/credit/price `<input type="number">` with `step > 1`
       (must use `step="any"` or `step="0.01"` or `step="1"`).
  2. RULE_NO_NATIVE_DIALOGS:
     - Forbids raw `alert(...)`, `confirm(...)`, `prompt(...)` in active portals
       (must use `SAWYAN.UI.alert/confirm/prompt/toast`).
  3. RULE_NO_FAKE_AUTO_REF:
     - Forbids pre-filling merchant bank transfer reference inputs with synthetic `REF-${Date.now()}`.
  4. RULE_NO_WINDOWS_ARROW_EMOJI:
     - Forbids raw Windows arrow emojis (`⬅️`) inside `index.html` step cards.
"""
import math
import pathlib
import re
import sys

REPO_DIR = pathlib.Path(__file__).resolve().parent.parent

SCAN_ROOTS = [
    REPO_DIR / "index.html",
    REPO_DIR / "auth-gateway.html",
    REPO_DIR / "public",
    REPO_DIR / "shared",
    REPO_DIR / "member-dashboard",
    REPO_DIR / "merchant-dashboard",
    REPO_DIR / "admin-dashboard",
]

MONEY_HINTS = (
    "topup", "amt", "amount", "credit", "price", "balance", "salary",
    "wht", "repin", "budget", "limit", "مبلغ", "شحن", "سقف", "قيمة", "سحب", "ائتمان"
)

ALLOW_NATIVE_DIALOG_FILES = {
    "shared/components/ui-feedback.js",
}


def iter_source_files():
    for root in SCAN_ROOTS:
        if root.is_file():
            yield root
        elif root.is_dir():
            for p in sorted(root.rglob("*")):
                if p.suffix.lower() in (".html", ".js") and "__pycache__" not in p.parts:
                    yield p


def try_float(s):
    if s is None:
        return None
    s = s.strip()
    if not s or "${" in s or "' +" in s or '" +' in s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def is_multiple(delta, step, eps=1e-6):
    if step <= 0:
        return True
    q = delta / step
    return abs(q - round(q)) <= eps


def check_file(path: pathlib.Path):
    rel = path.relative_to(REPO_DIR).as_posix()
    txt = path.read_text(encoding="utf-8", errors="ignore")
    errors = []

    # 1. Inspect every <input type="number" ...>
    for m in re.finditer(r"<input\b[^>]*>", txt, re.I):
        tag = m.group(0)
        if not re.search(r'\btype\s*=\s*["\']number["\']', tag, re.I):
            continue
        line_no = txt[:m.start()].count("\n") + 1
        st_m = re.search(r'\bstep\s*=\s*["\']([^"\']+)["\']', tag, re.I)
        mn_m = re.search(r'\bmin\s*=\s*["\']([^"\']+)["\']', tag, re.I)
        val_m = re.search(r'\bvalue\s*=\s*["\']([^"\']+)["\']', tag, re.I)

        st_raw = st_m.group(1).strip() if st_m else None
        step_v = None if (st_raw is None or st_raw.lower() == "any") else try_float(st_raw)
        min_v = try_float(mn_m.group(1)) if mn_m else None
        val_v = try_float(val_m.group(1)) if val_m else None

        # A) Non-aligned min + step > 1 (e.g. min="1" step="50" or min="1" step="10")
        if step_v is not None and step_v > 1 and min_v is not None and min_v > 0:
            if not is_multiple(min_v, step_v):
                errors.append(
                    f"[RULE_HTML5_STEP_MISMATCH] {rel}:{line_no} -> min={min_v} with step={step_v} "
                    f"rejects round multiples! Use step='any' or step='1'."
                )

        # B) Default value itself violates HTML5 (value - base) % step == 0
        if step_v is not None and val_v is not None:
            base = min_v if min_v is not None else 0.0
            if not is_multiple(val_v - base, step_v):
                errors.append(
                    f"[RULE_HTML5_STEP_MISMATCH] {rel}:{line_no} -> default value={val_v} is INVALID "
                    f"for min={base} step={step_v}!"
                )

        # C) Money / financial amount inputs must never force coarse step > 1
        tag_lc = tag.lower()
        if step_v is not None and step_v > 1 and any(h in tag_lc for h in MONEY_HINTS):
            errors.append(
                f"[RULE_MONEY_INPUT_COARSE_STEP] {rel}:{line_no} -> monetary input has step={step_v}; "
                f"must use step='any' or step='0.01' so exact transfer/credit amounts pass."
            )

    # 2. Forbid fake auto-generated REF-Date.now() inside merchant top-up inputs
    if re.search(r'id=["\'](?:svTopupRefInput|svMerProofRef)["\'][^>]*value=["\']REF-', txt):
        errors.append(
            f"[RULE_NO_FAKE_AUTO_REF] {rel} -> merchant bank top-up ref input must not pre-fill fake REF-Date.now()."
        )

    # 3. Forbid raw native alert/confirm/prompt calls in active JS/HTML (ignoring comments & SAWYAN.UI methods)
    if rel not in ALLOW_NATIVE_DIALOG_FILES:
        for i, line in enumerate(txt.splitlines(), 1):
            stripped = line.strip()
            if stripped.startswith("//") or stripped.startswith("*") or stripped.startswith("<!--"):
                continue
            # Strip inline comments outside strings (heuristic)
            code_part = re.sub(r"//.*$", "", stripped)
            for fn in ("alert", "confirm", "prompt"):
                # Match bare `alert(` or `window.alert(` but NOT `.alert(` (like SAWYAN.UI.alert) or `function alert(`
                if re.search(rf"(?:^|[^.\w$])(?:window\.)?{fn}\s*\(", code_part):
                    if f"function {fn}" in code_part:
                        continue
                    # Allow fallback guard ONLY if it's strictly a dead branch or UI helper
                    if "SAWYAN.UI" in code_part or "SAWYAN?.UI" in code_part:
                        continue
                    errors.append(
                        f"[RULE_NO_NATIVE_DIALOGS] {rel}:{i} -> native browser `{fn}()` detected: {stripped[:100]}"
                    )

    # 4. Forbid Windows emoji arrows in homepage steps
    if rel == "index.html" and "⬅️" in txt:
        errors.append(f"[RULE_NO_WINDOWS_ARROW_EMOJI] {rel} -> replace raw ⬅️ emoji with crisp SVG arrow.")

    # 5. Enforce Gate 11 unified cache-bust prefix (`v=20261121_launch`) on HTML asset links
    if path.suffix.lower() == ".html":
        for vm in re.finditer(r'(?:src|href)=["\']([^"\']+\?v=([^"\'&]+))["\']', txt, re.I):
            full_ref, ver_val = vm.group(1), vm.group(2)
            if "20261121_launch" not in ver_val:
                lno = txt[:vm.start()].count("\n") + 1
                errors.append(
                    f"[RULE_UNIFIED_CACHE_BUST] {rel}:{lno} -> '{full_ref}' missing Gate-11 prefix '20261121_launch'."
                )

    return errors


def main():
    all_errors = []
    checked = 0
    for p in iter_source_files():
        checked += 1
        all_errors.extend(check_file(p))

    if all_errors:
        print(f"[DOM/FORM LINT FAIL] Found {len(all_errors)} violation(s) across {checked} files:")
        for e in all_errors:
            print("  -", e)
        sys.exit(1)

    print(f"[DOM/FORM LINT PASS] 0 HTML5 step/validity traps, 0 native dialogs, 0 fake topup refs across {checked} files.")


if __name__ == "__main__":
    main()
