import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
PREVIEW_DIR = os.path.join(REPO_DIR, "preview")

INTERNAL_ONLY_FUNCTIONS = {
    "feed_monthly_target_box",
    "process_merchant_topup_fifo",
    "process_transaction_reversal_clawback",
    "recalculate_target_box_and_cascade",
    "run_monthly_settlement_engine",
    "finalize_settlement_payout_step5_6",
    "process_payment_webhook",
    "submit_maker_checker_request",
    "decide_maker_checker_request",
    "verify_member_session",
    "verify_merchant_session",
    "verify_admin_session",
    "verify_cashier_session",
    "enqueue_and_dispatch_push",
    "trg_fn_notifications_dispatch_push",
    "trg_fn_employee_revoke_push",
    "append_audit_log",
    "filter_academy_url_is_safe",
    "validate_attachment_data",
    "evaluate_merchant_profile_complete",
    "compute_merchant_d4_cycle_info",
    "is_merchant_d4_cutoff_breached",
    "compute_merchant_effective_state",
    "sync_merchant_status_flags",
    "auth_rate_limit_guard",
}

MIRROR_DIRS = ["assets", "css", "js", "public", "shared", "member-dashboard", "merchant-dashboard", "admin-dashboard"]
MIRROR_FILES = ["index.html", "auth-gateway.html", "manifest.json", "sw.js"]
SKIP_NAMES = {".git", "__pycache__", ".DS_Store", "Thumbs.db", "test_modal.html", "test_submit_runner.html"}


def run_sql(sql, token):
    req = urllib.request.Request(
        f"{BASE_API}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-ZeroDefectGate/3.0",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else []


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN is required.", file=sys.stderr)
        sys.exit(1)

    failures = []

    def check(cond, msg):
        if cond:
            print(f" [GATE PASS] {msg}")
        else:
            print(f" [GATE FAIL] {msg}", file=sys.stderr)
            failures.append(msg)

    # 1. Live DB RLS + Security Definer search_path + Least-Privilege Gate
    sec = run_sql("""
        SELECT
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'sawyan' AND rowsecurity = false) AS prod_rls_off,
            (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'sawyan_demo' AND rowsecurity = false) AS demo_rls_off,
            (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname IN ('sawyan', 'sawyan_demo') AND p.prosecdef = true
                AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))) AS secdef_no_search_path,
            has_table_privilege('anon', 'sawyan.merchants', 'SELECT') AS anon_prod_merchants_select,
            has_table_privilege('anon', 'sawyan.members', 'SELECT') AS anon_prod_members_select;
    """, token)[0]

    check(sec["prod_rls_off"] == 0 and sec["demo_rls_off"] == 0, "100% of tables in `sawyan` & `sawyan_demo` have RLS enabled (0 unguarded tables)")
    check(sec["secdef_no_search_path"] == 0, "100% of SECURITY DEFINER functions enforce explicit `search_path`")
    check(not sec["anon_prod_merchants_select"] and not sec["anon_prod_members_select"], "Zero raw `anon` SELECT on `sawyan.merchants` or `sawyan.members`")

    fn_rows = run_sql("""
        SELECT p.proname, COALESCE(p.proargnames, ARRAY[]::text[]) AS argnames,
               has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'sawyan';
    """, token)
    db_fns = {}
    leaked_internal = []
    for r in fn_rows:
        db_fns.setdefault(r["proname"], set()).update(r["argnames"] or [])
        if r["proname"] in INTERNAL_ONLY_FUNCTIONS and r["anon_exec"]:
            leaked_internal.append(r["proname"])

    check(len(leaked_internal) == 0, f"Zero internal functions callable by `anon` (leaked={leaked_internal})")

    # 2. Automated SQL <-> JS RPC Signature Contract Matcher
    api_js_path = os.path.join(PREVIEW_DIR, "shared", "api", "sawyan-api.js")
    with open(api_js_path, "r", encoding="utf-8") as f:
        api_js = f.read()

    rpc_calls = re.findall(r"callRpc\(\s*'([a-z0-9_]+)'\s*,\s*\{([^}]*)\}", api_js, flags=re.DOTALL)
    contract_errors = []
    for fn_name, body in rpc_calls:
        js_args = set(re.findall(r"\b(p_[a-z0-9_]+)\s*:", body))
        if fn_name not in db_fns:
            contract_errors.append(f"Missing DB function: {fn_name}")
        else:
            missing_args = js_args - db_fns[fn_name]
            if missing_args:
                contract_errors.append(f"{fn_name} unknown params: {sorted(missing_args)}")
    check(len(contract_errors) == 0 and len(rpc_calls) >= 15, f"SQL <-> JS RPC Contract Match ({len(rpc_calls)} RPCs verified, errors={contract_errors})")

    # 3. Anti-Wipe Floor + Real D29/D30 Playwright Visual & Spec Parity Gate (replaces vanity byte-only check)
    merch_js_size = os.path.getsize(os.path.join(PREVIEW_DIR, "merchant-dashboard", "js", "dashboard.js"))
    admin_js_dir = os.path.join(PREVIEW_DIR, "admin-dashboard", "js")
    admin_js_size = sum(os.path.getsize(os.path.join(admin_js_dir, x)) for x in os.listdir(admin_js_dir) if x.endswith(".js"))
    check(merch_js_size >= 60_000, f"Merchant UI non-wipe floor intact ({merch_js_size:,} bytes >= 60,000)")
    check(admin_js_size >= 250_000, f"Admin UI non-wipe floor intact ({admin_js_size:,} bytes >= 250,000)")

    import subprocess
    ui_gate_script = os.path.join(DB_DIR, "verify_ui_and_visual_gates.py")
    lock_file = os.path.join(REPO_DIR, "specs", "SAWYAN_STATE_LOCK.json")
    ui_mode = "--phase0-layout"
    if os.path.exists(lock_file):
        try:
            lock_data = json.load(open(lock_file, "r", encoding="utf-8"))
            if lock_data.get("strict_parity_enabled"):
                ui_mode = "--full"
        except Exception:
            pass
    ui_proc = subprocess.run([sys.executable, ui_gate_script, ui_mode], cwd=REPO_DIR, capture_output=True, text=True, encoding="utf-8", errors="replace")
    check(ui_proc.returncode == 0, f"D29/D30 Visual Collision & Spec-to-DOM Gate ({ui_mode}) passed (rc={ui_proc.returncode})")
    if ui_proc.returncode != 0:
        print(ui_proc.stderr or ui_proc.stdout, file=sys.stderr)

    # 4. 100% SHA-256 Dual-Site Mirror Parity Gate (`preview/` == `/`)
    mismatches = []
    for fname in MIRROR_FILES:
        p1, p2 = os.path.join(PREVIEW_DIR, fname), os.path.join(REPO_DIR, fname)
        if not os.path.exists(p2) or sha256_file(p1) != sha256_file(p2):
            mismatches.append(fname)
    for dname in MIRROR_DIRS:
        for root, dirs, files in os.walk(os.path.join(PREVIEW_DIR, dname)):
            dirs[:] = [d for d in dirs if d not in SKIP_NAMES]
            for fn in files:
                if fn in SKIP_NAMES:
                    continue
                sp = os.path.join(root, fn)
                rel = os.path.relpath(sp, PREVIEW_DIR)
                dp = os.path.join(REPO_DIR, rel)
                if not os.path.exists(dp) or sha256_file(sp) != sha256_file(dp):
                    mismatches.append(rel)
    check(len(mismatches) == 0, f"100% SHA-256 parity between `/` and `/preview/` (mismatches={mismatches[:5]})")

    # 5. Zero Leaked Secrets Scan across Repo & .git/config
    secret_hits = []
    token_re = re.compile(r"(sbp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})")
    git_cfg = os.path.join(REPO_DIR, ".git", "config")
    if os.path.exists(git_cfg):
        with open(git_cfg, "r", encoding="utf-8", errors="ignore") as f:
            if token_re.search(f.read()):
                secret_hits.append(".git/config")
    for root, dirs, files in os.walk(REPO_DIR):
        dirs[:] = [d for d in dirs if d not in {".git", "backups", "__pycache__", "node_modules", ".agent"}]
        for fn in files:
            if fn.endswith((".html", ".js", ".css", ".sql", ".py", ".md", ".json")):
                fp = os.path.join(root, fn)
                with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                    if token_re.search(f.read()):
                        secret_hits.append(os.path.relpath(fp, REPO_DIR))
    check(len(secret_hits) == 0, f"Zero leaked tokens across repo & .git/config (hits={secret_hits})")

    if failures:
        print(f"\nZERO-DEFECT GATE BLOCKED DELIVERY ({len(failures)} failures).", file=sys.stderr)
        sys.exit(1)
    print("\n[ZERO-DEFECT HARD GATE: 100% GREEN]")


if __name__ == "__main__":
    main()
