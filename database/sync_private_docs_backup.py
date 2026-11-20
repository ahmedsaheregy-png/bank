"""
SAWYAN Living Docs — Automatic Private Repository Backup Helper.

Commits and pushes any changes inside `docs/` to its separate private Git
repository (`docs/.git`), completely isolated from the public `bank` repo.
Authentication uses Windows Credential Manager (never stores tokens on disk).
"""

import datetime
import os
import re
import subprocess
import sys

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
DOCS_DIR = os.path.join(REPO_DIR, "docs")
DOCS_GIT_DIR = os.path.join(DOCS_DIR, ".git")
LOG_PATH = os.path.join(DOCS_GIT_DIR, "auto_backup.log")

TOKEN_PATTERN = re.compile(
    r"(sbp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"
)
BINARY_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip"}
NO_WINDOW_FLAG = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _git_env():
    env = os.environ.copy()
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def _run_git(args, timeout=20):
    return subprocess.run(
        ["git", "-C", DOCS_DIR] + args,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=_git_env(),
        timeout=timeout,
        creationflags=NO_WINDOW_FLAG,
    )


def _append_log(message):
    if not os.path.isdir(DOCS_GIT_DIR):
        return
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    line = f"[{stamp}] {message}\n"
    try:
        lines = []
        if os.path.exists(LOG_PATH):
            with open(LOG_PATH, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
        lines.append(line)
        with open(LOG_PATH, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(lines[-100:])
    except OSError:
        pass


def _scan_docs_for_secrets():
    hits = []
    for root, dirs, files in os.walk(DOCS_DIR):
        dirs[:] = [d for d in dirs if d != ".git"]
        for fn in files:
            ext = os.path.splitext(fn)[1].lower()
            if ext in BINARY_EXTS:
                continue
            fp = os.path.join(root, fn)
            try:
                with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                    if TOKEN_PATTERN.search(f.read()):
                        hits.append(os.path.relpath(fp, DOCS_DIR))
            except OSError:
                continue
    return hits


def sync_private_docs(silent_if_clean=False):
    """Commit and push pending `docs/` updates to the private remote repo."""
    if not os.path.isdir(DOCS_GIT_DIR):
        if not silent_if_clean:
            print("[PRIVATE DOCS SKIP] docs/.git not present.")
        return True

    secret_hits = _scan_docs_for_secrets()
    if secret_hits:
        msg = f"ERROR: Aborted backup — token pattern found in docs/: {secret_hits}"
        _append_log(msg)
        print(f"[PRIVATE DOCS BLOCKED] {msg}", file=sys.stderr)
        return False

    st = _run_git(["status", "--porcelain"])
    if st.returncode != 0:
        _append_log(f"WARN: git status failed: {st.stderr.strip()}")
        if not silent_if_clean:
            print(f"[PRIVATE DOCS WARN] git status failed: {st.stderr.strip()}")
        return True

    changed_lines = [ln for ln in st.stdout.splitlines() if ln.strip()]
    if changed_lines:
        add_res = _run_git(["add", "-A"])
        if add_res.returncode != 0:
            _append_log(f"WARN: git add failed: {add_res.stderr.strip()}")
            return True

        ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        commit_msg = f"chore(docs): auto-backup {ts} ({len(changed_lines)} file(s))"
        cmt_res = _run_git(["commit", "-m", commit_msg])
        if cmt_res.returncode != 0:
            _append_log(f"WARN: git commit failed: {cmt_res.stderr.strip()}")
            return True

    ahead_res = _run_git(["rev-list", "--count", "origin/main..HEAD"])
    ahead = 0
    if ahead_res.returncode != 0:
        ahead = 1
    else:
        try:
            ahead = int(ahead_res.stdout.strip() or "0")
        except ValueError:
            ahead = 1

    sha_res = _run_git(["rev-parse", "--short", "HEAD"])
    short_sha = sha_res.stdout.strip() if sha_res.returncode == 0 else "unknown"

    if ahead > 0:
        try:
            push_res = _run_git(["push", "origin", "main"], timeout=25)
        except subprocess.TimeoutExpired:
            _append_log(f"WARN: Committed locally ({short_sha}); push timed out and will retry.")
            if not silent_if_clean:
                print(f"[PRIVATE DOCS WARN] Committed locally ({short_sha}); push will retry automatically.")
            return True

        if push_res.returncode == 0:
            _append_log(f"OK: Pushed {short_sha} ({ahead} commit(s)) to private origin/main.")
            print(f"[PRIVATE DOCS BACKUP OK] Pushed {short_sha} to private origin/main")
        else:
            err_tail = (push_res.stderr or push_res.stdout or "").strip().splitlines()[-1:] or [""]
            _append_log(f"WARN: Committed locally ({short_sha}); push failed: {err_tail[0]}")
            print(f"[PRIVATE DOCS WARN] Committed locally ({short_sha}); push will retry automatically.")
    elif not silent_if_clean:
        print("[PRIVATE DOCS UP-TO-DATE]")

    return True


def main():
    silent = "--silent" in sys.argv
    ok = sync_private_docs(silent_if_clean=silent)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
