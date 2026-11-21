import hashlib
import os
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW_DIR = os.path.join(ROOT_DIR, "preview")

SYNC_FILES = [
    "index.html",
    "auth-gateway.html",
    "manifest.json",
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


def main():
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

    print(f"[SYNC_OK] Dual-site 1:1 mirror synchronized (`preview/` -> `/`). Updated files: {total_copied}")


if __name__ == "__main__":
    main()
