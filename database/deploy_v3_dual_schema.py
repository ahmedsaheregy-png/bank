import json
import os
import re
import sys
import urllib.request
import urllib.error

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_FILE = os.path.join(DB_DIR, "backups", "legacy_sawyan_backup_2026-11-17.json")


def api_request(method, endpoint, payload, token):
    url = f"{BASE_API}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "SAWYAN-Deployer/3.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {err.code} on {endpoint}: {body}")


def run_sql(sql, token, label="SQL"):
    print(f" -> Executing [{label}] ({len(sql)} chars)...")
    _, res = api_request("POST", "/database/query", {"query": sql}, token)
    return res


def clone_sql_for_demo(sql_text):
    # Replace lowercase schema identifier `sawyan` only when bounded cleanly (never inside 'SAWYAN' or `sawyan_tree_placement_`)
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", "sawyan_demo", sql_text)


def read_sql(filename):
    path = os.path.join(DB_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: Set SUPABASE_ACCESS_TOKEN environment variable before running.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(BACKUP_FILE) or os.path.getsize(BACKUP_FILE) == 0:
        print(f"ERROR: Legacy backup missing at {BACKUP_FILE}. Aborting schema rebuild!", file=sys.stderr)
        sys.exit(1)

    allow_destructive = "--allow-destructive-reset" in sys.argv
    if not allow_destructive:
        try:
            existing = run_sql("""
                SELECT
                    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sawyan' AND table_name = 'members') AS has_members_tbl,
                    COALESCE((SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0), 0) AS real_members,
                    COALESCE((SELECT COUNT(*) FROM sawyan.transactions), 0) AS real_txs;
            """, token)
            info = existing[0] if existing else {}
            if info.get("has_members_tbl", 0) > 0 and (info.get("real_members", 0) > 0 or info.get("real_txs", 0) > 0):
                print(
                    f"ERROR: Production schema `sawyan` already contains live data "
                    f"(members={info.get('real_members')}, transactions={info.get('real_txs')}). "
                    f"Use non-destructive migration `11_migration_zero_liability_d5.sql` instead, "
                    f"or pass `--allow-destructive-reset` explicitly if wiping is intended.",
                    file=sys.stderr,
                )
                sys.exit(1)
        except Exception:
            pass

    print("1. Resetting and rebuilding schemas (`sawyan` Production & `sawyan_demo` Parallel)...")
    run_sql("DROP SCHEMA IF EXISTS sawyan CASCADE; DROP SCHEMA IF EXISTS sawyan_demo CASCADE;", token, "Drop Legacy Schemas")

    sql_01 = read_sql("01_schema_and_43_tables.sql")
    sql_02 = read_sql("02_core_functions_and_triggers.sql")
    sql_03 = read_sql("03_seed_coa_countries_and_demo.sql")
    sql_04 = read_sql("04_rls_and_grants.sql")
    sql_05 = read_sql("05_stage3_api_payment_and_shift_rpcs.sql")
    sql_06 = read_sql("06_stage4_member_and_portal_rpcs.sql")
    sql_07 = read_sql("07_remediation_security_and_settlement_patch.sql")
    sql_08 = read_sql("08_stage5_merchant_pos_and_portal_rpcs.sql")
    sql_09 = read_sql("09_stage6_admin_governance_and_launch_rpcs.sql")
    sql_10 = read_sql("10_stage7_operational_completeness_rpcs.sql")
    sql_03b = read_sql("03b_seed_demo_tree_48_members.sql")

    # Deploy Production (`sawyan`)
    run_sql(sql_01, token, "Production 01_schema_and_43_tables")
    run_sql(sql_02, token, "Production 02_core_functions_and_triggers")
    run_sql(sql_03, token, "Production 03_seed_foundation")
    run_sql(sql_04, token, "Production 04_rls_and_grants")
    run_sql(sql_05, token, "Production 05_stage3_rpcs")
    run_sql(sql_06, token, "Production 06_stage4_member_and_portal_rpcs")
    run_sql(sql_07, token, "Production 07_remediation_security_and_settlement_patch")
    run_sql(sql_08, token, "Production 08_stage5_merchant_pos_and_portal_rpcs")
    run_sql(sql_09, token, "Production 09_stage6_admin_governance_and_launch_rpcs")
    run_sql(sql_10, token, "Production 10_stage7_operational_completeness_rpcs")

    # Deploy Parallel Demo (`sawyan_demo`)
    run_sql(clone_sql_for_demo(sql_01), token, "Parallel Demo 01_schema_and_43_tables")
    run_sql(clone_sql_for_demo(sql_02), token, "Parallel Demo 02_core_functions_and_triggers")
    run_sql(clone_sql_for_demo(sql_03), token, "Parallel Demo 03_seed_foundation")
    run_sql(clone_sql_for_demo(sql_04), token, "Parallel Demo 04_rls_and_grants")
    run_sql(clone_sql_for_demo(sql_05), token, "Parallel Demo 05_stage3_rpcs")
    run_sql(clone_sql_for_demo(sql_06), token, "Parallel Demo 06_stage4_member_and_portal_rpcs")
    run_sql(sql_03b, token, "Parallel Demo 03b_seed_48_tree")
    run_sql(clone_sql_for_demo(sql_07), token, "Parallel Demo 07_remediation_security_and_settlement_patch")
    run_sql(clone_sql_for_demo(sql_08), token, "Parallel Demo 08_stage5_merchant_pos_and_portal_rpcs")
    run_sql(clone_sql_for_demo(sql_09), token, "Parallel Demo 09_stage6_admin_governance_and_launch_rpcs")
    run_sql(clone_sql_for_demo(sql_10), token, "Parallel Demo 10_stage7_operational_completeness_rpcs")

    demo_stage5_seed = """
    UPDATE sawyan_demo.members
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('password_hash', extensions.crypt('Demo@Sawyan2026', extensions.gen_salt('bf', 10)))
     WHERE member_code = 1;

    UPDATE sawyan_demo.merchants
       SET password_hash = extensions.crypt('Demo@Merchant2026', extensions.gen_salt('bf', 10)),
           metadata      = COALESCE(metadata, '{}'::jsonb) || '{"wifi_ssid":"AlNokhba-Guest-WiFi","wifi_password":"Sawyan2026","working_hours":"يومياً 08:00 ص - 01:00 ص"}'::jsonb
     WHERE merchant_code IN ('M-EG-001', 'M-TR-001');

    UPDATE sawyan_demo.cashier_employees
       SET pin_hash = extensions.crypt('2580', extensions.gen_salt('bf', 10))
     WHERE employee_code = 'EMP-01';

    UPDATE sawyan_demo.admins
       SET full_name            = 'أحمد المالي — مُنشئ الطلبات (Maker)',
           role                 = 'finance',
           must_change_password = false,
           is_active            = true,
           password_hash        = extensions.crypt('Demo@Maker2026', extensions.gen_salt('bf', 10))
     WHERE email = 'demo.maker@sawyan.local';

    UPDATE sawyan_demo.admins
       SET full_name            = 'منى الرقابة — سلطة الاعتماد (Checker)',
           role                 = 'approver',
           must_change_password = false,
           is_active            = true,
           password_hash        = extensions.crypt('Demo@Checker2026', extensions.gen_salt('bf', 10))
     WHERE email = 'demo.checker@sawyan.local';

    INSERT INTO sawyan_demo.admins (full_name, email, auth_user_id, role, must_change_password, two_factor_enabled, is_active, password_hash)
    VALUES
        ('خالد المدقق — قراءة فقط (Auditor)', 'demo.auditor@sawyan.local', gen_random_uuid(), 'auditor', false, true, true, extensions.crypt('Demo@Auditor2026', extensions.gen_salt('bf', 10))),
        ('سارة الامتثال — مسؤول الهوية (KYC)', 'demo.kyc@sawyan.local', gen_random_uuid(), 'kyc_officer', false, true, true, extensions.crypt('Demo@Kyc2026', extensions.gen_salt('bf', 10)))
    ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, is_active = true;

    INSERT INTO sawyan_demo.admins (full_name, email, auth_user_id, role, must_change_password, two_factor_enabled, is_active, password_hash, metadata)
    VALUES (
        'المؤسس السيادي — إدارة مطلقة (Sovereign Founder)',
        'demo.founder@sawyan.local',
        gen_random_uuid(),
        'approver',
        false,
        true,
        true,
        extensions.crypt('Demo@Founder2026', extensions.gen_salt('bf', 10)),
        '{"is_sovereign_founder": true}'::jsonb
    )
    ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name, role = EXCLUDED.role, must_change_password = false,
           is_active = true, password_hash = EXCLUDED.password_hash,
           metadata = COALESCE(sawyan_demo.admins.metadata, '{}'::jsonb) || '{"is_sovereign_founder": true}'::jsonb;

    INSERT INTO sawyan_demo.partners (
        partner_code, full_name, email, phone, auth_user_id, partnership_scope, scope_targets, profit_basis, profit_share_pct, contract_ref, is_active
    ) VALUES (
        'PTR-EG-001', 'مجموعة النيل للاستثمار الاستراتيجي', 'partners.eg@sawyan.demo', '+201009998877', gen_random_uuid(),
        'country', '{"country_code":"EG"}'::jsonb, 'net_treasury_after_expenses', 5.000, 'CONTRACT-SW-EG-2026-01', true
    ) ON CONFLICT (partner_code) DO NOTHING;
    """
    run_sql(demo_stage5_seed, token, "Parallel Demo Stage 5 & 6 Bcrypt Seed")

    # Allow read-only preview inspection on `sawyan_demo` for anon visitors of /preview/ (strictly isolated from `sawyan`, masking metadata/phone/email/pin_hash)
    demo_preview_rls = """
    REVOKE SELECT ON sawyan_demo.members, sawyan_demo.cashier_employees FROM anon;
    GRANT SELECT (
        id, member_code, full_name, residency_country_id, nationality_country_id,
        city_geoname_id, manual_district_fallback, parent_member_id, sponsor_id, placement_side,
        generation_in_tree, is_active_in_tree, kyc_status, status, created_at
    ) ON sawyan_demo.members TO anon;
    GRANT SELECT (
        id, merchant_id, branch_id, employee_code, full_name, linked_member_id,
        failed_pin_attempts, pin_locked_until, max_tx_amount_limit, notify_owner_realtime, is_active
    ) ON sawyan_demo.cashier_employees TO anon;
    GRANT SELECT ON sawyan_demo.tree_closure, sawyan_demo.monthly_target_boxes,
          sawyan_demo.transactions, sawyan_demo.settings TO anon;
    GRANT EXECUTE ON FUNCTION sawyan_demo.get_tree_analytics_with_country_lens(UUID, CHAR, CHAR) TO anon;
    GRANT EXECUTE ON FUNCTION sawyan_demo.get_merchant_shift_closing(UUID, UUID, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, UUID) TO anon;
    GRANT EXECUTE ON FUNCTION sawyan_demo.public_verify_transaction(VARCHAR) TO anon;
    GRANT EXECUTE ON FUNCTION sawyan_demo.lookup_sponsor_by_code(BIGINT) TO anon;
    CREATE POLICY "demo_anon_read_members" ON sawyan_demo.members FOR SELECT TO anon USING (true);
    CREATE POLICY "demo_anon_read_closure" ON sawyan_demo.tree_closure FOR SELECT TO anon USING (true);
    CREATE POLICY "demo_anon_read_boxes" ON sawyan_demo.monthly_target_boxes FOR SELECT TO anon USING (true);
    CREATE POLICY "demo_anon_read_tx" ON sawyan_demo.transactions FOR SELECT TO anon USING (true);
    CREATE POLICY "demo_anon_read_settings" ON sawyan_demo.settings FOR SELECT TO anon USING (true);
    CREATE POLICY "demo_anon_read_cashiers" ON sawyan_demo.cashier_employees FOR SELECT TO anon USING (true);
    """
    run_sql(demo_preview_rls, token, "Parallel Demo Read Policies")

    # Expose both `sawyan` and `sawyan_demo` via Supabase PostgREST Data API
    print("2. Updating PostgREST Data API exposed schemas...")
    _, pg_cfg = api_request("GET", "/postgrest", None, token)
    current_schemas = pg_cfg.get("db_schema", "public, graphql_public")
    schema_list = [s.strip() for s in current_schemas.split(",") if s.strip()]
    for needed in ["sawyan", "sawyan_demo"]:
        if needed not in schema_list:
            schema_list.append(needed)
    new_db_schema = ", ".join(schema_list)
    api_request("PATCH", "/postgrest", {"db_schema": new_db_schema}, token)
    run_sql("NOTIFY pgrst, 'reload schema'; NOTIFY pgrst, 'reload config';", token, "Reload PostgREST Schema & Config")

    # Verify table counts and demo tree count
    verify_sql = """
    SELECT
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sawyan' AND table_type = 'BASE TABLE') AS prod_tables,
      (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'sawyan_demo' AND table_type = 'BASE TABLE') AS demo_tables,
      (SELECT COUNT(*) FROM sawyan.members) AS prod_members,
      (SELECT COUNT(*) FROM sawyan_demo.members) AS demo_members,
      (SELECT cap_amount FROM sawyan.settings WHERE country_id IS NULL LIMIT 1) AS prod_cap_amount,
      (SELECT COUNT(*) FROM sawyan.chart_of_accounts) AS coa_count;
    """
    res = run_sql(verify_sql, token, "Verify Dual Schema Counts")
    print("DEPLOYMENT VERIFICATION:", json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
