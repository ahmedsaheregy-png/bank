import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)


def get_anon_key():
    cfg_path = os.path.join(REPO_DIR, "preview", "shared", "config", "supabase.js")
    with open(cfg_path, "r", encoding="utf-8") as f:
        txt = f.read()
    m = re.search(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+", txt)
    if not m:
        raise RuntimeError("Could not locate Supabase anon key in supabase.js")
    return m.group(0)


def run_sql(sql, token):
    req = urllib.request.Request(
        f"{BASE_API}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-Stage6-Verifier/3.0",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else []


def call_rpc(fn_name, payload, schema, anon_key):
    req = urllib.request.Request(
        f"{REST_URL}/rpc/{fn_name}",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Profile": schema,
            "Accept-Profile": schema,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        try:
            return err.code, json.loads(body)
        except Exception:
            return err.code, {"message": body}


def assert_true(cond, label, detail=""):
    if not cond:
        print(f" [FAIL] {label} :: {detail}", file=sys.stderr)
        sys.exit(1)
    print(f" [PASS] {label}")


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN required.", file=sys.stderr)
        sys.exit(1)
    anon_key = get_anon_key()

    # 1. D10 Weak Password Block ('123456') on Both Schemas
    st_p, body_p = call_rpc("authenticate_admin_login", {"p_email": "founder.approver@sawyan.global", "p_password": "123456"}, "sawyan", anon_key)
    st_d, body_d = call_rpc("authenticate_admin_login", {"p_email": "demo.maker@sawyan.local", "p_password": "123456"}, "sawyan_demo", anon_key)
    assert_true(
        st_p >= 400 and "CONSTITUTIONAL_SECURITY_VIOLATION" in json.dumps(body_p)
        and st_d >= 400 and "CONSTITUTIONAL_SECURITY_VIOLATION" in json.dumps(body_d),
        "1. D10 Weak password '123456' strictly blocked on both `sawyan` & `sawyan_demo`",
    )

    # 2. Production Sovereign Admin Auth & Zero-Secret Bundle (`sawyan`)
    st, prod_auth = call_rpc(
        "authenticate_admin_login",
        {"p_email": "founder.approver@sawyan.global", "p_password": "Sawyan@Founder#2026!", "p_totp_code": "112233"},
        "sawyan",
        anon_key,
    )
    assert_true(st == 200 and len(prod_auth.get("session_token", "")) == 64, "2a. Production Founder Approver Bcrypt login & 64-hex session token", prod_auth)

    st, prod_bundle = call_rpc(
        "get_admin_sovereign_bundle",
        {"p_admin_id": prod_auth["admin"]["id"], "p_session_token": prod_auth["session_token"], "p_period_ym": "2026-11"},
        "sawyan",
        anon_key,
    )
    raw_prod_str = json.dumps(prod_bundle)
    assert_true(
        st == 200
        and prod_bundle["zero_discrepancy"]["is_zero_discrepancy_intact"] is True
        and prod_bundle["audit_chain"]["is_hash_chain_intact"] is True
        and "password_hash" not in raw_prod_str,
        "2b. Production `sawyan` Sovereign Bundle intact, zero-discrepancy = $0.00, zero password_hash exposure",
    )

    # 3. Authenticate Demo Maker, Checker, Auditor, and KYC Officer (`sawyan_demo`)
    _, maker_auth = call_rpc("authenticate_admin_login", {"p_email": "demo.maker@sawyan.local", "p_password": "Demo@Maker2026"}, "sawyan_demo", anon_key)
    _, checker_auth = call_rpc("authenticate_admin_login", {"p_email": "demo.checker@sawyan.local", "p_password": "Demo@Checker2026"}, "sawyan_demo", anon_key)
    _, auditor_auth = call_rpc("authenticate_admin_login", {"p_email": "demo.auditor@sawyan.local", "p_password": "Demo@Auditor2026"}, "sawyan_demo", anon_key)
    _, kyc_auth = call_rpc("authenticate_admin_login", {"p_email": "demo.kyc@sawyan.local", "p_password": "Demo@Kyc2026"}, "sawyan_demo", anon_key)

    maker_id, maker_tok = maker_auth["admin"]["id"], maker_auth["session_token"]
    checker_id, checker_tok = checker_auth["admin"]["id"], checker_auth["session_token"]
    auditor_id, auditor_tok = auditor_auth["admin"]["id"], auditor_auth["session_token"]
    kyc_id, kyc_tok = kyc_auth["admin"]["id"], kyc_auth["session_token"]

    # 4. RBAC Strict Read-Only Auditor Lock
    st_read, _ = call_rpc("get_admin_sovereign_bundle", {"p_admin_id": auditor_id, "p_session_token": auditor_tok}, "sawyan_demo", anon_key)
    st_write1, err_w1 = call_rpc(
        "admin_submit_governance_request",
        {
            "p_admin_id": auditor_id,
            "p_session_token": auditor_tok,
            "p_action_type": "BITEMPORAL_SETTINGS_UPDATE",
            "p_target_entity": "settings",
            "p_target_id": "GLOBAL",
            "p_payload_after": {"wht_threshold_usd": 250},
            "p_reason": "Auditor illegal write attempt",
        },
        "sawyan_demo",
        anon_key,
    )
    st_write2, err_w2 = call_rpc(
        "admin_execute_period_close_wizard",
        {
            "p_admin_id": auditor_id,
            "p_session_token": auditor_tok,
            "p_country_code": "EG",
            "p_period_ym": "2026-09",
            "p_step_action": "run_steps_1_to_4",
        },
        "sawyan_demo",
        anon_key,
    )
    assert_true(
        st_read == 200
        and st_write1 >= 400 and "RBAC_AUDITOR_READ_ONLY" in json.dumps(err_w1)
        and st_write2 >= 400 and "RBAC_AUDITOR_READ_ONLY" in json.dumps(err_w2),
        "3. RBAC Auditor Read-Only Lock: allowed read, strictly blocked from governance & period close writes",
    )

    # 5. S06 Actuarial Stress-Test Simulator
    st_act, act = call_rpc(
        "admin_run_actuarial_stress_test_s06",
        {
            "p_admin_id": auditor_id,
            "p_session_token": auditor_tok,
            "p_country_code": "EG",
            "p_monthly_target_usd": 24.75,
            "p_company_percent": 25.0,
            "p_s01_gens": 11,
            "p_s02_slots": 11,
            "p_s03_stopper_usd": 4605.75,
            "p_simulated_members": 10000,
        },
        "sawyan_demo",
        anon_key,
    )
    assert_true(
        st_act == 200
        and float(act["unit_share_trunc_usd"]) == 2.25
        and int(act["max_binary_nodes_in_s01"]) == 2047
        and float(act["theoretical_full_tree_cap_usd"]) == 4605.75
        and float(act["stress_test_100pct_qualification"]["net_pool_deficit_usd"]) == 0.00
        and act["stress_test_100pct_qualification"]["solvency_verdict"] == "SOLVENT_ZERO_DEFICIT_PROVEN",
        "4. S06 Actuarial Simulator: 2047 * $2.25 = $4,605.75, 10,000-member stress test = $0.00 deficit",
        act,
    )

    # 6. Maker == Checker Self-Approval Block + Maker != Checker Bitemporal Settings Approval
    _, self_mc = call_rpc(
        "admin_submit_governance_request",
        {
            "p_admin_id": checker_id,
            "p_session_token": checker_tok,
            "p_action_type": "BITEMPORAL_SETTINGS_UPDATE",
            "p_target_entity": "settings",
            "p_target_id": "GLOBAL",
            "p_payload_after": {"wht_threshold_usd": 200.00},
            "p_reason": "Self-approval negative test",
        },
        "sawyan_demo",
        anon_key,
    )
    st_self, err_self = call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_request_id": self_mc["request_id"], "p_decision": "approved"},
        "sawyan_demo",
        anon_key,
    )
    # Reject self_mc via maker (finance role) to clean pending queue
    call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": maker_id, "p_session_token": maker_tok, "p_request_id": self_mc["request_id"], "p_decision": "rejected", "p_rejection_reason": "Self-approval QA cleanup"},
        "sawyan_demo",
        anon_key,
    )

    _, valid_mc = call_rpc(
        "admin_submit_governance_request",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_action_type": "BITEMPORAL_SETTINGS_UPDATE",
            "p_target_entity": "settings",
            "p_target_id": "GLOBAL",
            "p_payload_after": {"wht_threshold_usd": 200.00, "withdrawal_cooldown_hours": 72},
            "p_reason": "Constitutional Stage 6 Maker-Checker Verification",
        },
        "sawyan_demo",
        anon_key,
    )
    st_ok, ok_mc = call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_request_id": valid_mc["request_id"], "p_decision": "approved"},
        "sawyan_demo",
        anon_key,
    )
    assert_true(
        st_self >= 400 and "MAKER_CANNOT_APPROVE_OWN_REQUEST" in json.dumps(err_self)
        and st_ok == 200 and ok_mc["execution"]["effect"] == "bitemporal_settings_version_created",
        "5. Maker == Checker blocked at PostgreSQL layer; Maker != Checker creates bitemporal settings version",
        ok_mc,
    )

    # 7. Country Activation Gate D13 / T06 (SA has 0 merchants -> must block activation!)
    _, sa_mc = call_rpc(
        "admin_submit_governance_request",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_action_type": "COUNTRY_GATE_D13_ACTIVATION",
            "p_target_entity": "countries",
            "p_target_id": "SA",
            "p_payload_after": {
                "country_code": "SA",
                "legal_opinion_verified": True,
                "legal_opinion_doc_url": "https://legal.sawyan.global/SA.pdf",
                "local_terms_version": "v3.0-SA",
            },
            "p_reason": "Attempt SA activation before merchant threshold",
        },
        "sawyan_demo",
        anon_key,
    )
    st_sa, err_sa = call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_request_id": sa_mc["request_id"], "p_decision": "approved"},
        "sawyan_demo",
        anon_key,
    )
    call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_request_id": sa_mc["request_id"], "p_decision": "rejected", "p_rejection_reason": "T06 merchant threshold not met"},
        "sawyan_demo",
        anon_key,
    )
    assert_true(
        st_sa >= 400 and "COUNTRY_GATE_D13_BLOCKED_MERCHANTS" in json.dumps(err_sa),
        "6. Country Activation Gate D13/T06 blocks activating SA with 0 active merchants",
        err_sa,
    )

    # 8. Corporate Partners D24 (Admin-Only Dual Approval without touching Members Tree)
    mem_before = run_sql("SELECT COUNT(*) AS c FROM sawyan_demo.members;", token)[0]["c"]
    _, ptr_mc = call_rpc(
        "admin_submit_governance_request",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_action_type": "PARTNER_CONTRACT_D24",
            "p_target_entity": "partners",
            "p_target_id": "PTR-TR-002",
            "p_payload_after": {
                "partner_code": "PTR-TR-002",
                "full_name": "مجموعة البوسفور الاستثمارية",
                "email": "bosphorus.partner@sawyan.demo",
                "phone": "+905339991122",
                "partnership_scope": "country",
                "scope_targets": {"country_code": "TR"},
                "profit_basis": "net_treasury_after_expenses",
                "profit_share_pct": 4.5,
                "contract_ref": "CONTRACT-SW-TR-2026-02",
                "is_active": True,
            },
            "p_reason": "Approve Turkey corporate partner D24",
        },
        "sawyan_demo",
        anon_key,
    )
    st_ptr, res_ptr = call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_request_id": ptr_mc["request_id"], "p_decision": "approved"},
        "sawyan_demo",
        anon_key,
    )
    mem_after = run_sql("SELECT COUNT(*) AS c FROM sawyan_demo.members;", token)[0]["c"]
    assert_true(
        st_ptr == 200 and res_ptr["execution"]["effect"] == "corporate_partner_registered_d24" and mem_before == mem_after,
        "7. D24 Corporate Partner registered via Maker-Checker strictly inside `partners` with zero tree mixing",
    )

    # 9. 6-Step Period Close + IAS 21 + Hard Lock + Break-Glass on Isolated Period '2026-08'
    run_sql("""
        DELETE FROM sawyan_demo.surplus_distributions WHERE pool_transaction_id IN (
            SELECT pt.id FROM sawyan_demo.pool_transactions pt JOIN sawyan_demo.settlement_cycles sc ON sc.id = pt.settlement_cycle_id WHERE sc.period_ym = '2026-08'
        );
        DELETE FROM sawyan_demo.commission_distributions WHERE pool_transaction_id IN (
            SELECT pt.id FROM sawyan_demo.pool_transactions pt JOIN sawyan_demo.settlement_cycles sc ON sc.id = pt.settlement_cycle_id WHERE sc.period_ym = '2026-08'
        );
        DELETE FROM sawyan_demo.pool_transactions WHERE settlement_cycle_id IN (
            SELECT id FROM sawyan_demo.settlement_cycles WHERE period_ym = '2026-08'
        );
        DELETE FROM sawyan_demo.settlement_cycles WHERE period_ym = '2026-08';
        INSERT INTO sawyan_demo.monthly_target_boxes (member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd, is_qualified, qualification_source)
        SELECT m.id, m.residency_country_id, '2026-08', 24.75, 24.75, true, 'local_purchases'
          FROM sawyan_demo.members m WHERE m.member_code = 1
        ON CONFLICT (member_id, country_id, period_ym) DO UPDATE SET current_month_purchases_usd = 24.75, is_qualified = true, target_consumed_usd = 0;
        -- Fund 2201 liability for the synthetic test box so double-entry settlement stays 100% zero-discrepancy
        DO $$
        DECLARE v_je UUID; v_m1 UUID; v_eg INT;
        BEGIN
            SELECT id, residency_country_id INTO v_m1, v_eg FROM sawyan_demo.members WHERE member_code = 1;
            IF NOT EXISTS (SELECT 1 FROM sawyan_demo.journal_entries WHERE description = 'QA_STAGE6_2026_08_FUND') THEN
                INSERT INTO sawyan_demo.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
                VALUES ('INVOICE', v_m1, v_eg, 1.000000, 'QA_STAGE6_2026_08_FUND') RETURNING id INTO v_je;
                INSERT INTO sawyan_demo.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code) VALUES
                (v_je, '1101', 'treasury', NULL, 24.75, 0.00, 24.75, 'USD'),
                (v_je, '2201', 'member', v_m1, 0.00, 24.75, 24.75, 'USD');
            END IF;
        END $$;
    """, token)

    st_c14, res_c14 = call_rpc(
        "admin_execute_period_close_wizard",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_country_code": "EG",
            "p_period_ym": "2026-08",
            "p_step_action": "run_steps_1_to_4",
        },
        "sawyan_demo",
        anon_key,
    )
    st_self56, err_self56 = call_rpc(
        "admin_execute_period_close_wizard",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_country_code": "EG",
            "p_period_ym": "2026-08",
            "p_step_action": "finalize_steps_5_and_6",
        },
        "sawyan_demo",
        anon_key,
    )
    st_c56, res_c56 = call_rpc(
        "admin_execute_period_close_wizard",
        {
            "p_admin_id": checker_id,
            "p_session_token": checker_tok,
            "p_country_code": "EG",
            "p_period_ym": "2026-08",
            "p_step_action": "finalize_steps_5_and_6",
            "p_ias21_fx_delta_usd": 5.50,
        },
        "sawyan_demo",
        anon_key,
    )
    st_locked, err_locked = call_rpc(
        "admin_execute_period_close_wizard",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_country_code": "EG",
            "p_period_ym": "2026-08",
            "p_step_action": "run_steps_1_to_4",
        },
        "sawyan_demo",
        anon_key,
    )
    assert_true(
        st_c14 == 200
        and st_self56 >= 400 and "MAKER_CHECKER_DISTINCT_ADMINS_REQUIRED" in json.dumps(err_self56)
        and st_c56 == 200
        and st_locked >= 400 and "HARD_LOCK_VIOLATION" in json.dumps(err_locked),
        "8a. 6-Step Period Close + IAS 21 ($5.50) + Maker!=Checker + Step 6 Hard Lock verified",
        res_c56,
    )

    # Break-Glass Unlock via Maker-Checker
    _, bg_mc = call_rpc(
        "admin_submit_governance_request",
        {
            "p_admin_id": maker_id,
            "p_session_token": maker_tok,
            "p_action_type": "BREAK_GLASS_UNLOCK",
            "p_target_entity": "settlement_cycles",
            "p_target_id": "2026-08",
            "p_payload_after": {"period_ym": "2026-08"},
            "p_reason": "Emergency audited Break-Glass verification",
        },
        "sawyan_demo",
        anon_key,
    )
    st_bg, res_bg = call_rpc(
        "admin_decide_governance_request",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_request_id": bg_mc["request_id"], "p_decision": "approved"},
        "sawyan_demo",
        anon_key,
    )
    # Re-lock cleanly back to Step 6 so 2026-08 stays closed
    run_sql("UPDATE sawyan_demo.settlement_cycles SET is_hard_locked = true, step_status = 6, break_glass_expires_at = NULL WHERE period_ym = '2026-08';", token)
    assert_true(
        st_bg == 200 and res_bg["execution"]["effect"] == "break_glass_unlocked_2h",
        "8b. Break-Glass dual-approval unlock (2h window + audit log) verified",
    )

    # 10. KYC Officer Verification + Tombstone Ban Preservation of Tree Closure
    target_mem = run_sql("SELECT id FROM sawyan_demo.members WHERE member_code = 2;", token)[0]["id"]
    closure_before = run_sql("SELECT COUNT(*) AS c FROM sawyan_demo.tree_closure;", token)[0]["c"]
    st_kyc, _ = call_rpc(
        "admin_operational_decision",
        {"p_admin_id": kyc_id, "p_session_token": kyc_tok, "p_domain": "member_kyc", "p_record_id": target_mem, "p_decision": "verified"},
        "sawyan_demo",
        anon_key,
    )
    st_ban, _ = call_rpc(
        "admin_operational_decision",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_domain": "member_tombstone", "p_record_id": target_mem, "p_decision": "ban"},
        "sawyan_demo",
        anon_key,
    )
    st_unban, _ = call_rpc(
        "admin_operational_decision",
        {"p_admin_id": checker_id, "p_session_token": checker_tok, "p_domain": "member_tombstone", "p_record_id": target_mem, "p_decision": "unban"},
        "sawyan_demo",
        anon_key,
    )
    closure_after = run_sql("SELECT COUNT(*) AS c FROM sawyan_demo.tree_closure;", token)[0]["c"]
    assert_true(
        st_kyc == 200 and st_ban == 200 and st_unban == 200 and closure_before == closure_after,
        "9. KYC Officer verification & Approver Tombstone ban/unban preserve 100% of binary `tree_closure` links",
    )

    # 11. Final Ledger Zero-Discrepancy, Audit Chain & D24 Public Partner Removal Check
    _, final_bundle = call_rpc("get_admin_sovereign_bundle", {"p_admin_id": checker_id, "p_session_token": checker_tok}, "sawyan_demo", anon_key)
    partner_dir_root = os.path.exists(os.path.join(REPO_DIR, "partner-dashboard"))
    partner_dir_prev = os.path.exists(os.path.join(REPO_DIR, "preview", "partner-dashboard"))
    assert_true(
        final_bundle["zero_discrepancy"]["is_zero_discrepancy_intact"] is True
        and final_bundle["audit_chain"]["is_hash_chain_intact"] is True
        and not partner_dir_root and not partner_dir_prev,
        "10. Final `sawyan_demo` Ledger Dr==Cr ($0.00 diff), Audit SHA-256 chain intact, public `partner-dashboard/` removed",
    )

    print("\n[STAGE 6 SOVEREIGN ADMIN VERIFICATION: 10/10 ALL GREEN]")


if __name__ == "__main__":
    main()
