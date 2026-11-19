import json
import os
import subprocess
import sys

DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
STATE_LOCK_PATH = os.path.join(REPO_DIR, "specs", "SAWYAN_STATE_LOCK.json")
VISUAL_GATE = os.path.join(DB_DIR, "verify_ui_and_visual_gates.py")


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
        timeout=55,
    )

    if proc.returncode != 0:
        reason = (proc.stderr or proc.stdout or "SAWYAN UI/Visual Hard Gate failed.").strip()
        if len(reason) > 900:
            reason = reason[-900:]
        print(json.dumps({
            "decision": "continue",
            "reason": f"SAWYAN Stop Hook blocked turn completion ({mode_flag}):\n{reason}",
        }, ensure_ascii=False))
    else:
        print("{}")


if __name__ == "__main__":
    main()
