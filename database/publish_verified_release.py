"""
SAWYAN V3.0 — Verified Auto-Publish Pipeline (`database/publish_verified_release.py`)

Runs mandatory pre-publish safety gates before committing & pushing to `origin/main`:
  1. Verifies current git branch (`main` by default).
  2. Synchronizes `/` and `/preview/` 1:1 (`database/sync_dual_site_mirror.py`).
  3. Verifies living docs parity (`database/verify_doc_sync.py`) and syncs private `docs/.git`
     via `database/sync_private_docs_backup.py` if pending/unpushed.
  4. Scans `.git/config` and workspace text files for leaked secret tokens (`sbp_`, `ghp_`, etc.).
  5. Scans active root + `preview/` web files against `forbidden_live_patterns` in
     `specs/ui_dom_rpc_manifest.json`.
  6. Runs `database/verify_ui_and_visual_gates.py --full` unless `--skip-visual-gate` is passed.
  7. Ensures private/sensitive paths (`docs/`, `.env*`, `visual_audit/`, `database/backups/`)
     are never tracked or staged in the public repository.
  8. Commits (when dirty) and pushes via Windows Credential Manager (`GCM_INTERACTIVE=never`).
"""

import argparse
import json
import os
import re
import subprocess
import sys

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
PREVIEW_DIR = os.path.join(REPO_DIR, "preview")
DOCS_DIR = os.path.join(REPO_DIR, "docs")
MANIFEST_PATH = os.path.join(REPO_DIR, "specs", "ui_dom_rpc_manifest.json")

TOKEN_PATTERN = re.compile(
    r"(sbp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk_live_[A-Za-z0-9]{16,})"
)
SECRET_SCAN_EXTS = {".html", ".js", ".css", ".sql", ".py", ".md", ".json", ".yml", ".yaml", ".txt"}
SECRET_SKIP_DIRS = {".git", "docs", "backups", "legacy_archive", "visual_audit", "__pycache__", "node_modules", ".agent"}

WEB_ROOT_SUBDIRS = ["js", "css", "public", "shared", "member-dashboard", "merchant-dashboard", "admin-dashboard"]
WEB_ROOT_FILES = ["index.html", "auth-gateway.html"]
FORBIDDEN_STAGE_PREFIXES = ("docs/", ".env", "visual_audit/", "database/backups/")
FORBIDDEN_STAGE_EXACT = {"docs", ".env", "visual_audit", "database/backups"}
NO_WINDOW_FLAG = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _git_env():
    env = os.environ.copy()
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def run_git(args, repo_dir=REPO_DIR, timeout=30):
    return subprocess.run(
        ["git", "-C", repo_dir] + args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=_git_env(),
        timeout=timeout,
        creationflags=NO_WINDOW_FLAG,
    )


def run_gate_script(script_name, extra_args=None):
    cmd = [sys.executable, os.path.join(DB_DIR, script_name)] + (extra_args or [])
    proc = subprocess.run(cmd, cwd=REPO_DIR, env=os.environ.copy(), text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"Gate failed (exit={proc.returncode}): {script_name} {' '.join(extra_args or [])}")


def scan_for_secrets():
    hits = []
    git_cfg = os.path.join(REPO_DIR, ".git", "config")
    if os.path.exists(git_cfg):
        with open(git_cfg, "r", encoding="utf-8", errors="ignore") as f:
            if TOKEN_PATTERN.search(f.read()):
                hits.append(".git/config")

    for root, dirs, files in os.walk(REPO_DIR):
        dirs[:] = [d for d in dirs if d not in SECRET_SKIP_DIRS]
        for fn in files:
            if os.path.splitext(fn)[1].lower() not in SECRET_SCAN_EXTS:
                continue
            fp = os.path.join(root, fn)
            try:
                with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                    if TOKEN_PATTERN.search(f.read()):
                        hits.append(os.path.relpath(fp, REPO_DIR).replace("\\", "/"))
            except OSError:
                continue
    return hits


def scan_forbidden_web_patterns():
    with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    rules = manifest.get("forbidden_live_patterns", [])

    candidates = []
    for base_dir in (REPO_DIR, PREVIEW_DIR):
        for fn in WEB_ROOT_FILES:
            fp = os.path.join(base_dir, fn)
            if os.path.isfile(fp):
                candidates.append(fp)
        for sub in WEB_ROOT_SUBDIRS:
            sub_path = os.path.join(base_dir, sub)
            if not os.path.isdir(sub_path):
                continue
            for root, dirs, files in os.walk(sub_path):
                dirs[:] = [d for d in dirs if d not in {"__pycache__", "node_modules", ".git"}]
                for fn in files:
                    if fn.endswith((".html", ".js", ".css")):
                        candidates.append(os.path.join(root, fn))

    hits = []
    for fp in candidates:
        rel = os.path.relpath(fp, REPO_DIR).replace("\\", "/")
        try:
            txt = open(fp, "r", encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        for rule in rules:
            if rule.get("scope") == "merchant" and "merchant-dashboard/" not in rel:
                continue
            if rule["pattern"] in txt:
                hits.append(f"{rule['id']} in {rel}")
    return hits


def is_forbidden_repo_path(rel_path):
    norm = rel_path.strip().replace("\\", "/")
    return norm in FORBIDDEN_STAGE_EXACT or norm.startswith(FORBIDDEN_STAGE_PREFIXES)


def count_ahead_commits(branch, repo_dir=REPO_DIR):
    res = run_git(["rev-list", "--count", f"origin/{branch}..HEAD"], repo_dir=repo_dir, timeout=10)
    if res.returncode != 0:
        return 0
    try:
        return int((res.stdout or "0").strip() or "0")
    except ValueError:
        return 0


def parse_args():
    parser = argparse.ArgumentParser(description="SAWYAN V3.0 Verified Auto-Publish Pipeline")
    parser.add_argument("-m", "--message", default="", help="Git commit message (>= 10 chars when dirty)")
    parser.add_argument("--skip-visual-gate", action="store_true", help="Skip Playwright visual gate when already verified")
    parser.add_argument("--dry-run", action="store_true", help="Run all safety gates without committing or pushing")
    parser.add_argument("--allow-branch", action="store_true", help="Allow publishing from a branch other than main")
    return parser.parse_args()


def main():
    args = parse_args()

    # 1. Branch guard
    br = run_git(["rev-parse", "--abbrev-ref", "HEAD"])
    if br.returncode != 0:
        print(f"[PUBLISH FAIL] Unable to detect git branch: {br.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    branch = br.stdout.strip()
    if branch != "main" and not args.allow_branch:
        print(f"[PUBLISH FAIL] Current branch is '{branch}', expected 'main' (pass --allow-branch to override).", file=sys.stderr)
        sys.exit(1)

    # 2. Dual-site mirror sync + docs verification + secret/pattern scans + optional visual gate
    try:
        run_gate_script("sync_dual_site_mirror.py")
        run_gate_script("verify_doc_sync.py")

        docs_git_dir = os.path.join(DOCS_DIR, ".git")
        if os.path.isdir(docs_git_dir):
            docs_dirty = [l for l in run_git(["status", "--porcelain"], repo_dir=DOCS_DIR).stdout.splitlines() if l.strip()]
            docs_ahead = count_ahead_commits("main", repo_dir=DOCS_DIR)
            if docs_dirty or docs_ahead > 0:
                if args.dry_run:
                    print(f"[PUBLISH INFO] Private docs repo pending: dirty={len(docs_dirty)}, ahead={docs_ahead}")
                else:
                    run_gate_script("sync_private_docs_backup.py", ["--silent"])

        secret_hits = scan_for_secrets()
        if secret_hits:
            raise RuntimeError(f"Secret leak detected in {secret_hits}")

        pattern_hits = scan_forbidden_web_patterns()
        if pattern_hits:
            raise RuntimeError(f"Forbidden web pattern(s) detected: {pattern_hits[:8]}")

        if not args.skip_visual_gate:
            run_gate_script("verify_ui_and_visual_gates.py", ["--full"])
    except RuntimeError as exc:
        print(f"[PUBLISH BLOCKED] {exc}", file=sys.stderr)
        sys.exit(1)

    # 3. Private docs isolation check in public repository
    ls_docs = run_git(["ls-files", "docs"])
    if ls_docs.returncode != 0 or ls_docs.stdout.strip():
        print(f"[PUBLISH BLOCKED] Private `docs/` paths tracked in public repo: {ls_docs.stdout.strip()}", file=sys.stderr)
        sys.exit(1)

    st_res = run_git(["status", "--porcelain"])
    if st_res.returncode != 0:
        print(f"[PUBLISH FAIL] git status failed: {st_res.stderr.strip()}", file=sys.stderr)
        sys.exit(1)
    dirty_lines = [l for l in st_res.stdout.splitlines() if l.strip()]
    ahead = count_ahead_commits(branch)

    if not dirty_lines and ahead == 0:
        head_sha = run_git(["rev-parse", "--short", "HEAD"]).stdout.strip()
        print(f"[PUBLISH_OK] Repository already clean and synced with origin/{branch} ({head_sha}).")
        return

    commit_msg = (args.message or "").strip()
    if dirty_lines and len(commit_msg) < 10:
        print("[PUBLISH BLOCKED] Provide a descriptive commit message via -m/--message (>= 10 chars).", file=sys.stderr)
        sys.exit(1)

    if args.dry_run:
        print(f"[DRY_RUN_OK] All pre-publish safety gates passed (branch={branch}, dirty_files={len(dirty_lines)}, ahead={ahead}).")
        return

    # 4. Stage, re-verify isolation on staged index, commit & push
    if dirty_lines:
        add_res = run_git(["add", "-A"], timeout=60)
        if add_res.returncode != 0:
            print(f"[PUBLISH FAIL] git add failed: {add_res.stderr.strip()}", file=sys.stderr)
            sys.exit(1)

        staged = [p for p in run_git(["diff", "--cached", "--name-only"]).stdout.splitlines() if p.strip()]
        blocked_staged = [p for p in staged if is_forbidden_repo_path(p)]
        if blocked_staged:
            run_git(["reset"])
            print(f"[PUBLISH BLOCKED] Unstaged & aborted forbidden path(s): {blocked_staged}", file=sys.stderr)
            sys.exit(1)

        if staged:
            try:
                cmt_res = run_git(["commit", "-m", commit_msg], timeout=120)
            except subprocess.TimeoutExpired:
                print("[PUBLISH FAIL] git commit timed out after 120s.", file=sys.stderr)
                sys.exit(1)
            if cmt_res.returncode != 0:
                print(f"[PUBLISH FAIL] git commit failed: {cmt_res.stderr or cmt_res.stdout}", file=sys.stderr)
                sys.exit(1)

    try:
        push_res = run_git(["push", "-u", "origin", branch], timeout=120)
    except subprocess.TimeoutExpired:
        print(f"[PUBLISH FAIL] git push origin {branch} timed out after 120s.", file=sys.stderr)
        sys.exit(1)

    if push_res.returncode != 0:
        print(f"[PUBLISH FAIL] git push origin {branch} failed: {(push_res.stderr or push_res.stdout).strip()}", file=sys.stderr)
        sys.exit(1)

    short_sha = run_git(["rev-parse", "--short", "HEAD"]).stdout.strip()
    subject = run_git(["log", "-1", "--pretty=%s"]).stdout.strip()
    print(f"[PUBLISH_OK] Pushed {short_sha} to origin/{branch} ({subject})")


if __name__ == "__main__":
    main()
