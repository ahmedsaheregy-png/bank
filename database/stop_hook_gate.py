import json
import os
import subprocess
import sys

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
DOCS_DIR = os.path.join(REPO_DIR, "docs")
STATE_LOCK_PATH = os.path.join(REPO_DIR, "specs", "SAWYAN_STATE_LOCK.json")
VISUAL_GATE = os.path.join(DB_DIR, "verify_ui_and_visual_gates.py")
NO_WINDOW_FLAG = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def _git_env():
    env = os.environ.copy()
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_TERMINAL_PROMPT"] = "0"
    return env


def _git_status_summary(repo_dir):
    if not os.path.isdir(os.path.join(repo_dir, ".git")):
        return 0, 0
    try:
        st = subprocess.run(
            ["git", "-C", repo_dir, "status", "--porcelain"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=_git_env(),
            timeout=5,
            creationflags=NO_WINDOW_FLAG,
        )
        dirty = len([ln for ln in st.stdout.splitlines() if ln.strip()]) if st.returncode == 0 else 0

        ah = subprocess.run(
            ["git", "-C", repo_dir, "rev-list", "--count", "origin/main..HEAD"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=_git_env(),
            timeout=5,
            creationflags=NO_WINDOW_FLAG,
        )
        ahead = int((ah.stdout or "0").strip() or "0") if ah.returncode == 0 else 0
        return dirty, ahead
    except Exception:
        return 0, 0


def main():
    raw = sys.stdin.read().strip()
    payload = {}
    if raw:
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {}

    # Prevent infinite continuation loops per Antigravity Stop Hook contract
    if payload.get("continuationActive"):
        print("{}")
        return

    mode_flag = "--phase0-layout"
    if os.path.exists(STATE_LOCK_PATH):
        try:
            lock = json.load(open(STATE_LOCK_PATH, "r", encoding="utf-8"))
            if lock.get("strict_parity_enabled"):
                mode_flag = "--full"
        except Exception:
            pass

    proc = subprocess.run(
        [sys.executable, VISUAL_GATE, mode_flag],
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=50,
    )

    if proc.returncode != 0:
        reason = (proc.stderr or proc.stdout or "SAWYAN UI/Visual Hard Gate failed.").strip()
        if len(reason) > 900:
            reason = reason[-900:]
        print(json.dumps({
            "decision": "continue",
            "reason": f"SAWYAN Stop Hook blocked turn completion ({mode_flag}):\n{reason}",
        }, ensure_ascii=False))
        return

    dirty_count, ahead_count = _git_status_summary(REPO_DIR)
    docs_dirty, docs_ahead = _git_status_summary(DOCS_DIR)
    if dirty_count > 0 or ahead_count > 0 or docs_dirty > 0 or docs_ahead > 0:
        print(json.dumps({
            "decision": "continue",
            "reason": (
                "SAWYAN Auto-Publish Gate blocked turn completion: unpushed changes remain "
                f"(main dirty={dirty_count}, unpushed_commits={ahead_count}; "
                f"docs dirty={docs_dirty}, docs_unpushed={docs_ahead}). "
                "Run `D:\\Python314\\python.exe database/publish_verified_release.py -m \"<concise conventional commit message>\"` "
                "(and `database/sync_docs_html.py` / `database/sync_private_docs_backup.py` if `docs/` changed) "
                "before delivering the final response (unless intentionally waiting on a user answer/decision)."
            ),
        }, ensure_ascii=False))
        return

    print("{}")


if __name__ == "__main__":
    main()
