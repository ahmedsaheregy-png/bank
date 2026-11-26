import hashlib
import os
import re
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW_DIR = os.path.join(ROOT_DIR, "preview")
CACHE_BUST_PREFIX = "20261121_launch_"
ASSET_TAG_RE = re.compile(
    r"""(<(?:script|link)\b[^>]*?\b(?:src|href)\s*=\s*)(["'])([^"']+?\.(?:js|css))(?:\?[^"']*)?\2""",
    re.I,
)

SYNC_FILES = [
    "index.html",
    "auth-gateway.html",
    "manifest.json",
    "sw.js",
]

SYNC_DIRS = [
    "assets",
    "css",
    "js",
    "public",
    "shared",
    "member-dashboard",
    "merchant-dashboard",
    "admin-dashboard",
]

SKIP_NAMES = {".git", "__pycache__", ".DS_Store", "Thumbs.db", "test_modal.html", "test_submit_runner.html"}


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sync_tree(src_dir, dst_dir):
    copied = 0
    os.makedirs(dst_dir, exist_ok=True)
    for entry in os.listdir(src_dir):
        if entry in SKIP_NAMES:
            continue
        sp = os.path.join(src_dir, entry)
        dp = os.path.join(dst_dir, entry)
        if os.path.isdir(sp):
            copied += sync_tree(sp, dp)
        else:
            if not os.path.exists(dp) or sha256_file(sp) != sha256_file(dp):
                shutil.copy2(sp, dp)
                copied += 1
    # Remove stale files in dst_dir that were deleted in src_dir (like test_modal.html)
    for entry in os.listdir(dst_dir):
        if entry in {".git", "__pycache__"}:
            continue
        sp = os.path.join(src_dir, entry)
        dp = os.path.join(dst_dir, entry)
        if entry in SKIP_NAMES or not os.path.exists(sp):
            if os.path.isdir(dp):
                shutil.rmtree(dp)
            else:
                os.remove(dp)
    return copied


def stamp_content_hash_cache_bust(preview_dir):
    """Automatically stamp deterministic SHA-256 content-hash ?v= params onto local JS/CSS refs in HTML files."""
    updated = 0
    preview_abs = os.path.abspath(preview_dir)
    for root, dirs, files in os.walk(preview_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_NAMES]
        for fn in files:
            if not fn.lower().endswith(".html"):
                continue
            html_path = os.path.join(root, fn)
            try:
                orig = open(html_path, "r", encoding="utf-8", errors="ignore").read()
            except OSError:
                continue

            def _replace(m):
                prefix, quote, clean_ref = m.group(1), m.group(2), m.group(3)
                if re.match(r"^(?:https?:|//|data:)", clean_ref, re.I):
                    return m.group(0)
                asset_path = os.path.abspath(os.path.join(os.path.dirname(html_path), clean_ref))
                if not asset_path.startswith(preview_abs) or not os.path.isfile(asset_path):
                    return m.group(0)
                ver = CACHE_BUST_PREFIX + sha256_file(asset_path)[:8]
                return f"{prefix}{quote}{clean_ref}?v={ver}{quote}"

            stamped = ASSET_TAG_RE.sub(_replace, orig)
            if stamped != orig:
                with open(html_path, "w", encoding="utf-8", newline="") as f:
                    f.write(stamped)
                updated += 1
    return updated


def main():
    stamped_html = stamp_content_hash_cache_bust(PREVIEW_DIR)
    total_copied = 0
    for fname in SYNC_FILES:
        sp = os.path.join(PREVIEW_DIR, fname)
        dp = os.path.join(ROOT_DIR, fname)
        if os.path.exists(sp):
            if not os.path.exists(dp) or sha256_file(sp) != sha256_file(dp):
                shutil.copy2(sp, dp)
                total_copied += 1

    for dname in SYNC_DIRS:
        sp = os.path.join(PREVIEW_DIR, dname)
        dp = os.path.join(ROOT_DIR, dname)
        if os.path.isdir(sp):
            total_copied += sync_tree(sp, dp)

    print(f"[SYNC_OK] Dual-site 1:1 mirror synchronized (`preview/` -> `/`). Hash-stamped HTML: {stamped_html}, Updated files: {total_copied}")


if __name__ == "__main__":
    main()
