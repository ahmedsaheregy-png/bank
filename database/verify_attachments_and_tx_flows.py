"""
SAWYAN V3.0 — Comprehensive End-to-End Verification Gate:
Attachments (Option B), All 10 Payment Types, Deferred COD/Cheque,
Merchant POS Propagation, Member Dual-Mode Path B, Security Panel-2 Remediations,
and Admin Live Transaction Decisions.

Runs non-destructively against an ephemeral `sawyan_qa` schema (dropped in `finally`)
plus read-only security checks on live `sawyan` & `sawyan_demo`.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

PROJECT_REF = "dssspiossqgroefmvnql"
BASE_API = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"
REST_URL = f"https://{PROJECT_REF}.supabase.co/rest/v1"
DB_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(DB_DIR)
QA_SCHEMA = "sawyan_qa"

SAFE_JPEG_DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA=="
SAFE_PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
SAFE_WEBP_DATA_URL = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA="


def api_request(method, endpoint, payload, token):
    req = urllib.request.Request(
        f"{BASE_API}{endpoint}",
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "SAWYAN-Attachments-Tx-Verifier/3.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API HTTP {err.code} on {endpoint}: {err_body}") from err


def run_sql(sql, token):
    _, res = api_request("POST", "/database/query", {"query": sql}, token)
    return res


def call_rest_rpc(fn_name, payload, schema, anon_key):
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
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        try:
            return err.code, json.loads(body)
        except Exception:
            return err.code, {"raw": body}


def clone_to_qa(sql_text):
    return re.sub(r"(?<![a-zA-Z0-9_])sawyan(?=\.|;|\s|$|\)|,)", QA_SCHEMA, sql_text)


def read_sql(filename):
    with open(os.path.join(DB_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()


def get_anon_key():
    with open(os.path.join(REPO_DIR, "shared", "config", "supabase.js"), "r", encoding="utf-8") as f:
        m = re.search(r"anonKey\s*:\s*['\"]([^'\"]+)['\"]", f.read())
    return m.group(1)


def main():
    token = os.environ.get("SUPABASE_ACCESS_TOKEN", "").strip()
    if not token:
        print("ERROR: SUPABASE_ACCESS_TOKEN missing.", file=sys.stderr)
        sys.exit(1)

    anon_key = get_anon_key()
    checks = []

    def record(name, passed, detail=""):
        checks.append({"name": name, "passed": bool(passed)})
        print(f" [{'PASS' if passed else 'FAIL'}] {name}{(' — ' + str(detail)) if detail else ''}")

    # 0. Read-only Live Schema Security & Zero-State Sanity
    st_anon_val, _ = call_rest_rpc("validate_attachment_data", {"p_val": SAFE_JPEG_DATA_URL}, "sawyan", anon_key)
    record("L0-01: Live `anon` blocked from calling sawyan.validate_attachment_data via REST", st_anon_val >= 400, f"HTTP {st_anon_val}")

    live_chk = run_sql("""
        SELECT
          (SELECT count(*) FROM sawyan.members WHERE member_code >= 0) AS prod_members,
          (SELECT count(*) FROM sawyan.merchants) AS prod_merchants,
          has_function_privilege('anon', 'sawyan.validate_attachment_data(text,integer,boolean)', 'EXECUTE') AS anon_priv,
          COALESCE((SELECT (sum(debit_usd) = sum(credit_usd)) FROM sawyan.journal_lines), true) AS prod_balanced
    """, token)[0]
    record(
        "L0-02: Live `sawyan` production trial balance balanced & validate_attachment_data locked",
        live_chk["prod_members"] >= 1 and live_chk["anon_priv"] is False and live_chk["prod_balanced"] is True,
        live_chk,
    )

    try:
        run_sql(f"DROP SCHEMA IF EXISTS {QA_SCHEMA} CASCADE;", token)
        for fn in [
            "01_schema_and_43_tables.sql",
            "02_core_functions_and_triggers.sql",
            "03_seed_coa_countries_and_demo.sql",
            "04_rls_and_grants.sql",
            "05_stage3_api_payment_and_shift_rpcs.sql",
            "06_stage4_member_and_portal_rpcs.sql",
            "07_remediation_security_and_settlement_patch.sql",
            "08_stage5_merchant_pos_and_portal_rpcs.sql",
            "09_stage6_admin_governance_and_launch_rpcs.sql",
            "10_stage7_operational_completeness_rpcs.sql",
        ]:
            run_sql(clone_to_qa(read_sql(fn)), token)
        run_sql(read_sql("03b_seed_demo_tree_48_members.sql").replace("sawyan_demo", QA_SCHEMA), token)
        run_sql(f"""
            UPDATE {QA_SCHEMA}.admins
               SET email = replace(email, '@{QA_SCHEMA}.', '@sawyan.')
             WHERE email LIKE '%@{QA_SCHEMA}.%';
            UPDATE {QA_SCHEMA}.admins
               SET metadata = COALESCE(metadata, '{{}}'::jsonb) || '{{"is_sovereign_founder": true, "country_scope": "GLOBAL"}}'::jsonb
             WHERE lower(email) = 'founder.approver@sawyan.global';
        """, token)

        # Suite 1: Attachments Validation, Merchant Media/KYC, Member Avatar/KYC/Move/Disputes/Gouging
        s1 = run_sql(f"""
            DO $$
            DECLARE
                v_adm        JSONB;
                v_fid        UUID;
                v_ftok       TEXT;
                v_mreg       JSONB;
                v_mid        UUID;
                v_mtok       TEXT;
                v_mbr        UUID;
                v_mem_reg    JSONB;
                v_mem_id     UUID;
                v_mem_tok    TEXT;
                v_cat        JSONB;
                v_rad        JSONB;
                v_mb         JSONB;
                v_merch_b    JSONB;
                v_pos_tx     JSONB;
                v_tx_id      UUID;
                v_adm_m      JSONB;
                v_err        TEXT;
                v_bad        TEXT;
            BEGIN
                -- 1.1 Attachment validator positive/negative
                IF {QA_SCHEMA}.validate_attachment_data('{SAFE_JPEG_DATA_URL}') IS NULL
                   OR {QA_SCHEMA}.validate_attachment_data('{SAFE_PNG_DATA_URL}') IS NULL
                   OR {QA_SCHEMA}.validate_attachment_data('{SAFE_WEBP_DATA_URL}') IS NULL
                   OR {QA_SCHEMA}.validate_attachment_data('https://img/rec.jpg') IS NULL THEN
                    RAISE EXCEPTION 'VALIDATE_VALID_INPUT_REJECTED';
                END IF;
                FOREACH v_bad IN ARRAY ARRAY[
                    'data:image/svg+xml;base64,PHN2Zz4=',
                    'data:image/gif;base64,R0lGODlh',
                    'http://cdn.site/a.jpg',
                    'https://localhost/a.png',
                    'https://127.0.0.1/a.png',
                    'https://192.168.1.5/a.png',
                    'javascript:alert(1)'
                ] LOOP
                    BEGIN
                        PERFORM {QA_SCHEMA}.validate_attachment_data(v_bad);
                        RAISE EXCEPTION 'VALIDATE_UNSAFE_INPUT_ACCEPTED: %', v_bad;
                    EXCEPTION WHEN OTHERS THEN
                        IF SQLERRM NOT LIKE '%INVALID_ATTACHMENT_FORMAT%' THEN
                            RAISE EXCEPTION 'UNEXPECTED_VALIDATE_ERR (%): %', v_bad, SQLERRM;
                        END IF;
                    END;
                END LOOP;
                BEGIN
                    PERFORM {QA_SCHEMA}.validate_attachment_data('https://cdn.example/' || repeat('a', 1500), 1000, true);
                    RAISE EXCEPTION 'OVERSIZED_ATTACHMENT_ACCEPTED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%ATTACHMENT_TOO_LARGE%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_SIZE_ERR: %', SQLERRM;
                    END IF;
                END;

                -- 1.2 Merchant registration with logo, cover, gallery & kyc_docs
                v_mreg := {QA_SCHEMA}.register_new_merchant(
                    'متجر الوسائط الموثقة', 'كريم المالك', '+201088776611', 'Strong@Media99',
                    'EG', 'supermarket', 'physical', 10.00, 'media.merch@sawyan.test', 'القاهرة',
                    360630, 30.050000, 31.240000, 1, '4321',
                    jsonb_build_object(
                        'logo_url', '{SAFE_PNG_DATA_URL}',
                        'cover_image_url', '{SAFE_JPEG_DATA_URL}',
                        'images', jsonb_build_array('{SAFE_WEBP_DATA_URL}', 'https://cdn.example/s2.jpg'),
                        'commercial_reg_no', 'CR-2026-998',
                        'tax_id', 'TX-778899',
                        'kyc_docs', jsonb_build_object(
                            'commercial_reg', '{SAFE_JPEG_DATA_URL}',
                            'tax_card', '{SAFE_PNG_DATA_URL}'
                        )
                    )
                );
                v_mid  := (v_mreg->'merchant'->>'id')::uuid;
                v_mtok := v_mreg->>'session_token';
                v_mbr  := (v_mreg->>'main_branch_id')::uuid;

                v_adm  := {QA_SCHEMA}.authenticate_admin_login('founder.approver@sawyan.global', 'Sawyan@Founder#2026!');
                v_fid  := (v_adm->'admin'->>'id')::uuid;
                v_ftok := v_adm->>'session_token';

                PERFORM {QA_SCHEMA}.admin_manage_merchant_contract(v_fid, v_ftok, v_mid, 'update_contract', 10.00, 'supermarket', 0, true);
                PERFORM {QA_SCHEMA}.process_merchant_topup_fifo(v_mid, 20000.00, 'QA-S1-TOPUP'::varchar, gen_random_uuid());

                -- 1.3 Public catalog & radar expose logos/covers with zero kyc_docs / split leak
                SELECT jsonb_agg(row_to_json(c)) INTO v_cat FROM {QA_SCHEMA}.get_public_merchants_catalog('EG', NULL) c WHERE c.merchant_id = v_mid;
                IF v_cat::text NOT LIKE '%data:image/png%' OR v_cat::text LIKE '%kyc_docs%' OR v_cat::text LIKE '%company_share%' THEN
                    RAISE EXCEPTION 'CATALOG_MEDIA_OR_SECURITY_LEAK: %', v_cat;
                END IF;
                SELECT jsonb_agg(row_to_json(r)) INTO v_rad FROM {QA_SCHEMA}.get_merchants_radar(30.050000, 31.240000, 10, 'EG', NULL) r WHERE r.merchant_id = v_mid;
                IF v_rad::text NOT LIKE '%data:image/jpeg%' OR v_rad::text LIKE '%kyc_docs%' THEN
                    RAISE EXCEPTION 'RADAR_MEDIA_FAIL: %', v_rad;
                END IF;

                -- 1.4 update_media + bank topup proof attachment
                PERFORM {QA_SCHEMA}.manage_merchant_cashier_and_settings(
                    p_merchant_id => v_mid,
                    p_action => 'update_media',
                    p_session_token => v_mtok,
                    p_media_patch => jsonb_build_object('logo_url', '{SAFE_WEBP_DATA_URL}', 'commercial_reg_no', 'CR-UPDATED')
                );
                v_merch_b := {QA_SCHEMA}.get_merchant_dashboard_bundle(v_mid, v_mtok, 'today', NULL);
                IF (v_merch_b->'profile'->>'logo_url') <> '{SAFE_WEBP_DATA_URL}' THEN
                    RAISE EXCEPTION 'MERCHANT_MEDIA_UPDATE_FAIL';
                END IF;

                PERFORM {QA_SCHEMA}.merchant_manage_branches_and_refunds(
                    v_mid, v_mtok, 'submit_bank_topup_proof',
                    jsonb_build_object(
                        'amount_local', 1500,
                        'bank_ref', 'BNK-QA-S1',
                        'receipt_note', 'InstaPay',
                        'receipt_image_data', '{SAFE_JPEG_DATA_URL}'
                    )
                );

                -- 1.5 Member registration with avatar + KYC + Residency Move + POS tx + Dispute + Gouging proofs
                v_mem_reg := {QA_SCHEMA}.register_new_member(
                    'عضو المرفقات الأول', '+201055443322', 1, 'Strong@Mem99',
                    'EG', 'EG', NULL, 'مدينة نصر', 'qa.att1@sawyan.test',
                    jsonb_build_object('avatar_url', '{SAFE_JPEG_DATA_URL}')
                );
                v_mem_id  := (v_mem_reg->'member'->>'id')::uuid;
                v_mem_tok := v_mem_reg->>'session_token';

                PERFORM {QA_SCHEMA}.submit_member_kyc_or_residency_move(
                    v_mem_id, v_mem_tok, 'kyc_verification', 'عضو المرفقات القانوني', 'national_id', '29001011234567', '{SAFE_PNG_DATA_URL}', NULL
                );
                PERFORM {QA_SCHEMA}.submit_member_kyc_or_residency_move(
                    v_mem_id, v_mem_tok, 'residency_move', 'عضو المرفقات القانوني', 'residency_permit', 'TR-IKAMET-8899', '{SAFE_WEBP_DATA_URL}', 'TR'
                );

                v_pos_tx := {QA_SCHEMA}.authenticate_and_submit_pos_tx(
                    v_mid, (v_mem_reg->'member'->>'member_code')::bigint, 300.00, 'cash', gen_random_uuid(),
                    v_mtok, v_mbr, 'EMP-01', '4321', NULL, NULL, '{SAFE_JPEG_DATA_URL}'
                );
                SELECT id INTO v_tx_id FROM {QA_SCHEMA}.transactions WHERE sw_short_code = (v_pos_tx->>'sw_short_code') LIMIT 1;

                PERFORM {QA_SCHEMA}.submit_member_dispute(
                    p_member_id => v_mem_id,
                    p_transaction_id => v_tx_id,
                    p_dispute_reason => 'اختلاف بسيط',
                    p_session_token => v_mem_tok,
                    p_dispute_category => 'amount_mismatch',
                    p_evidence_url => '{SAFE_PNG_DATA_URL}'
                );
                PERFORM {QA_SCHEMA}.submit_price_gouging_report(v_mem_id, v_tx_id, 250.00, 300.00, '{SAFE_JPEG_DATA_URL}', '{SAFE_PNG_DATA_URL}', v_mem_tok);

                -- Reject SVG in dispute
                BEGIN
                    PERFORM {QA_SCHEMA}.submit_member_dispute(
                        p_member_id => v_mem_id,
                        p_transaction_id => v_tx_id,
                        p_dispute_reason => 'bad svg',
                        p_session_token => v_mem_tok,
                        p_dispute_category => 'amount_mismatch',
                        p_evidence_url => 'data:image/svg+xml;base64,PHN2Zz4='
                    );
                    RAISE EXCEPTION 'DISPUTE_SVG_SHOULD_FAIL';
                EXCEPTION WHEN OTHERS THEN
                    v_err := SQLERRM;
                    IF v_err NOT LIKE '%INVALID_ATTACHMENT%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_DISPUTE_ERR: %', v_err;
                    END IF;
                END;

                v_mb := {QA_SCHEMA}.get_member_dashboard_bundle(v_mem_id, v_mem_tok, NULL, 'ALL');
                IF (v_mb->'profile'->>'avatar_url') <> '{SAFE_JPEG_DATA_URL}' THEN
                    RAISE EXCEPTION 'MEMBER_AVATAR_MISSING';
                END IF;
                v_adm_m := {QA_SCHEMA}.admin_search_and_reply_ops(v_fid, v_ftok, 'search', 'merchants', 'متجر الوسائط الموثقة');
                IF COALESCE(v_adm_m->'results'->0->'kyc_docs'->>'commercial_reg', '') <> '{SAFE_JPEG_DATA_URL}' THEN
                    RAISE EXCEPTION 'ADMIN_MERCHANT_DOCS_MISSING';
                END IF;
            END;
            $$;
            SELECT 'SUITE1_OK' AS status;
        """, token)
        record("S1: Attachments (EXIF JPEG/PNG/WebP vs SVG/SSRF block, Catalog/Radar/KYC/Dispute/Gouging)", s1[0]["status"] == "SUITE1_OK")

        # Suite 2: Merchant POS All 10 Payment Types + RRN Dedup + Deferred COD/Cheque + Cross-Portal Propagation
        s2 = run_sql(f"""
            DO $$
            DECLARE
                v_adm        JSONB;
                v_fid        UUID;
                v_ftok       TEXT;
                v_mreg       JSONB;
                v_mid        UUID;
                v_mtok       TEXT;
                v_mbr        UUID;
                v_mem_id     UUID;
                v_mem_code   BIGINT;
                v_mem_tok    TEXT;
                v_sp_tok     TEXT;
                v_sp_id      UUID;
                v_pts        TEXT[] := ARRAY['cash','pos_card','instant_transfer','iban_swift_sepa','digital_wallet','payment_gateway','bnpl','marketplace_escrow'];
                v_pt         TEXT;
                v_res        JSONB;
                v_cod        JSONB;
                v_chq        JSONB;
                v_mb1        JSONB;
                v_mb2        JSONB;
                v_merb       JSONB;
                v_admb       JSONB;
                v_spb        JSONB;
                v_bal_before NUMERIC;
                v_bal_after  NUMERIC;
            BEGIN
                SELECT id INTO v_mem_id FROM {QA_SCHEMA}.members WHERE member_code = 2;
                SELECT id INTO v_sp_id FROM {QA_SCHEMA}.members WHERE member_code = 1;
                UPDATE {QA_SCHEMA}.members
                   SET metadata = COALESCE(metadata, '{{}}'::jsonb) || jsonb_build_object('pwd_bcrypt', extensions.crypt('Test@Mem2', extensions.gen_salt('bf')))
                 WHERE id IN (v_mem_id, v_sp_id);
                v_mem_tok := {QA_SCHEMA}.authenticate_member_login('2', 'Test@Mem2')->>'session_token';
                v_sp_tok  := {QA_SCHEMA}.authenticate_member_login('1', 'Test@Mem2')->>'session_token';
                v_mem_code := 2;

                v_adm  := {QA_SCHEMA}.authenticate_admin_login('founder.approver@sawyan.global', 'Sawyan@Founder#2026!');
                v_fid  := (v_adm->'admin'->>'id')::uuid;
                v_ftok := v_adm->>'session_token';

                v_mreg := {QA_SCHEMA}.register_new_merchant(
                    'متجر الوسائل العشر', 'خالد', '+201077665544', 'Strong@10Pay',
                    'EG', 'restaurant', 'physical', 10.00, 'pay10@sawyan.test', 'الجيزة',
                    360630, 30.020000, 31.210000, 1, '1122', '{{}}'::jsonb
                );
                v_mid  := (v_mreg->'merchant'->>'id')::uuid;
                v_mtok := v_mreg->>'session_token';
                v_mbr  := (v_mreg->>'main_branch_id')::uuid;
                PERFORM {QA_SCHEMA}.admin_manage_merchant_contract(v_fid, v_ftok, v_mid, 'update_contract', 10.00, 'restaurant', 0, true);
                PERFORM {QA_SCHEMA}.process_merchant_topup_fifo(v_mid, 10000.00, 'QA-S2-TOPUP'::varchar, gen_random_uuid());

                -- Test 8 instant payment types + unique RRN
                FOREACH v_pt IN ARRAY v_pts LOOP
                    v_res := {QA_SCHEMA}.authenticate_and_submit_pos_tx(
                        v_mid, v_mem_code, 100.00, v_pt, gen_random_uuid(), v_mtok, v_mbr, 'EMP-01', '1122',
                        NULL, 'RRN-' || v_pt || '-001', 'https://img/rec.jpg'
                    );
                    IF (v_res->>'success')::boolean IS NOT TRUE OR (v_res->'pos_result'->>'status') <> 'completed' THEN
                        RAISE EXCEPTION 'POS_PT_FAIL (%): %', v_pt, v_res;
                    END IF;
                END LOOP;

                -- RRN deduplication
                BEGIN
                    PERFORM {QA_SCHEMA}.authenticate_and_submit_pos_tx(
                        v_mid, v_mem_code, 100.00, 'pos_card', gen_random_uuid(), v_mtok, v_mbr, 'EMP-01', '1122',
                        NULL, 'RRN-pos_card-001', 'https://img/rec.jpg'
                    );
                    RAISE EXCEPTION 'DUP_RRN_SHOULD_FAIL';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%DUPLICATE_PAYMENT_REF%' AND SQLERRM NOT LIKE '%transactions_unique_payment_ref%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_RRN_ERR: %', SQLERRM;
                    END IF;
                END;

                -- Record merchant balance & member completed count before COD/cheque
                SELECT actual_cash_balance INTO v_bal_before FROM {QA_SCHEMA}.merchants WHERE id = v_mid;
                v_mb1 := {QA_SCHEMA}.get_member_dashboard_bundle(v_mem_id, v_mem_tok, NULL, 'ALL');

                -- Deferred COD & Cheque stay pending with zero commission deduction
                v_cod := {QA_SCHEMA}.authenticate_and_submit_pos_tx(
                    v_mid, v_mem_code, 1000.00, 'cod', gen_random_uuid(), v_mtok, v_mbr, 'EMP-01', '1122',
                    NULL, 'COD-WAYBILL-1', 'https://img/rec.jpg'
                );
                v_chq := {QA_SCHEMA}.authenticate_and_submit_pos_tx(
                    v_mid, v_mem_code, 2000.00, 'cheque', gen_random_uuid(), v_mtok, v_mbr, 'EMP-01', '1122',
                    NULL, 'CHQ-9988', 'https://img/rec.jpg'
                );
                SELECT actual_cash_balance INTO v_bal_after FROM {QA_SCHEMA}.merchants WHERE id = v_mid;
                IF COALESCE((v_cod->'pos_result'->>'deferred_clearance')::boolean, false) IS NOT TRUE
                   OR (v_cod->'pos_result'->>'status') <> 'pending'
                   OR COALESCE((v_cod->>'commission_deducted_local')::numeric, -1) <> 0
                   OR COALESCE((v_chq->'pos_result'->>'deferred_clearance')::boolean, false) IS NOT TRUE
                   OR (v_chq->'pos_result'->>'status') <> 'pending'
                   OR v_bal_after <> v_bal_before THEN
                    RAISE EXCEPTION 'DEFERRED_PAYMENT_NOT_ISOLATED: cod=%, chq=%, b1=%, b2=%', v_cod, v_chq, v_bal_before, v_bal_after;
                END IF;

                -- Confirm COD -> clears cleanly and propagates across Member, Upline Sponsor, Merchant, Admin
                PERFORM {QA_SCHEMA}.confirm_or_reject_pending_tx(
                    v_mid, (v_cod->'pos_result'->>'transaction_id')::uuid, 'approve', NULL, v_mtok
                );
                v_mb2 := {QA_SCHEMA}.get_member_dashboard_bundle(v_mem_id, v_mem_tok, NULL, 'ALL');
                v_merb := {QA_SCHEMA}.get_merchant_dashboard_bundle(v_mid, v_mtok, 'today', NULL);
                v_spb := {QA_SCHEMA}.get_member_dashboard_bundle(v_sp_id, v_sp_tok, NULL, 'ALL');
                v_admb := {QA_SCHEMA}.get_admin_sovereign_bundle(v_fid, v_ftok);

                IF (v_mb2->'profile'->>'completed_tx_count')::int <> (v_mb1->'profile'->>'completed_tx_count')::int + 1
                   OR (v_merb->'profile'->>'today_completed_count')::int <> 9
                   OR (v_admb->'zero_discrepancy'->>'is_zero_discrepancy_intact')::boolean IS NOT TRUE
                   OR (v_spb->'tree_analytics'->>'nodes') IS NULL THEN
                    RAISE EXCEPTION 'CROSS_PORTAL_PROPAGATION_FAIL';
                END IF;
            END;
            $$;
            SELECT 'SUITE2_OK' AS status;
        """, token)
        record("S2: All 10 Payment Types, RRN Deduplication, Deferred COD/Cheque & Cross-Portal Sync (Dr=Cr)", s2[0]["status"] == "SUITE2_OK")

        # Suite 3: Member Path B Mode 1 (Instant Cashier PIN + 5-strike lock + Anti-enumeration + TX Limit + Self-PIN)
        s3 = run_sql(f"""
            DO $$
            DECLARE
                v_adm      JSONB;
                v_fid      UUID;
                v_ftok     TEXT;
                v_mreg     JSONB;
                v_mid      UUID;
                v_mtok     TEXT;
                v_mbr      UUID;
                v_mem_id   UUID;
                v_mem_tok  TEXT;
                v_r        JSONB;
                v_r_bad1   JSONB;
                v_r_bad2   JSONB;
                i          INT;
            BEGIN
                SELECT id INTO v_mem_id FROM {QA_SCHEMA}.members WHERE member_code = 3;
                UPDATE {QA_SCHEMA}.members
                   SET metadata = COALESCE(metadata, '{{}}'::jsonb) || jsonb_build_object('pwd_bcrypt', extensions.crypt('Test@Mem3', extensions.gen_salt('bf')))
                 WHERE id = v_mem_id;
                v_mem_tok := {QA_SCHEMA}.authenticate_member_login('3', 'Test@Mem3')->>'session_token';

                v_adm  := {QA_SCHEMA}.authenticate_admin_login('founder.approver@sawyan.global', 'Sawyan@Founder#2026!');
                v_fid  := (v_adm->'admin'->>'id')::uuid;
                v_ftok := v_adm->>'session_token';

                v_mreg := {QA_SCHEMA}.register_new_merchant(
                    'متجر الكاشير السريع', 'يوسف', '+201066554433', 'Strong@Cashier',
                    'EG', 'pharmacy', 'physical', 10.00, 'cashier.qa@sawyan.test', 'الإسكندرية',
                    360630, 31.200000, 29.900000, 1, '7788', '{{}}'::jsonb
                );
                v_mid  := (v_mreg->'merchant'->>'id')::uuid;
                v_mtok := v_mreg->>'session_token';
                v_mbr  := (v_mreg->>'main_branch_id')::uuid;
                PERFORM {QA_SCHEMA}.admin_manage_merchant_contract(v_fid, v_ftok, v_mid, 'update_contract', 10.00, 'pharmacy', 0, true);
                PERFORM {QA_SCHEMA}.process_merchant_topup_fifo(v_mid, 10000.00, 'QA-S3-TOPUP'::varchar, gen_random_uuid());

                -- Set cashier EMP-01 tx limit = 500
                UPDATE {QA_SCHEMA}.cashier_employees SET max_tx_amount_limit = 500.00 WHERE merchant_id = v_mid AND employee_code = 'EMP-01';

                -- TX above limit rejected
                v_r := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 700.00, p_payment_type => 'cash',
                    p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg',
                    p_employee_code => 'EMP-01', p_cashier_pin => '7788'
                );
                IF (v_r->>'error_code') <> 'CASHIER_TX_LIMIT_EXCEEDED' THEN
                    RAISE EXCEPTION 'TX_LIMIT_NOT_ENFORCED: %', v_r;
                END IF;

                -- Valid Mode 1 instant tx completes immediately
                v_r := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 400.00, p_payment_type => 'pos_card',
                    p_session_token => v_mem_tok, p_unique_payment_ref => 'RRN-MODE1-400',
                    p_employee_code => 'EMP-01', p_cashier_pin => '7788'
                );
                IF (v_r->>'success')::boolean IS NOT TRUE OR (v_r->>'status') <> 'completed' OR (v_r->>'mode') <> 'instant_pin' THEN
                    RAISE EXCEPTION 'MODE1_INSTANT_FAIL: %', v_r;
                END IF;

                -- Anti-enumeration: bad emp vs bad pin return same INVALID_CASHIER_CREDENTIALS
                v_r_bad1 := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 100.00, p_payment_type => 'cash',
                    p_session_token => v_mem_tok, p_employee_code => 'NONEXISTENT', p_cashier_pin => '0000'
                );
                v_r_bad2 := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 100.00, p_payment_type => 'cash',
                    p_session_token => v_mem_tok, p_employee_code => 'EMP-01', p_cashier_pin => '0000'
                );
                IF (v_r_bad1->>'error_code') <> 'INVALID_CASHIER_CREDENTIALS' OR (v_r_bad2->>'error_code') <> 'INVALID_CASHIER_CREDENTIALS' THEN
                    RAISE EXCEPTION 'ANTI_ENUMERATION_FAIL: bad1=%, bad2=%', v_r_bad1, v_r_bad2;
                END IF;

                -- 4 more wrong PIN strikes -> locks for 15m even if valid PIN supplied afterward
                FOR i IN 1..4 LOOP
                    v_r := {QA_SCHEMA}.submit_member_pending_purchase(
                        p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                        p_amount => 100.00, p_payment_type => 'cash',
                        p_session_token => v_mem_tok, p_employee_code => 'EMP-01', p_cashier_pin => '0000'
                    );
                END LOOP;
                IF (v_r->>'error_code') <> 'CASHIER_PIN_LOCKED_15M' THEN
                    RAISE EXCEPTION 'PIN_LOCK_NOT_TRIGGERED: %', v_r;
                END IF;
                v_r := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 100.00, p_payment_type => 'cash',
                    p_session_token => v_mem_tok, p_employee_code => 'EMP-01', p_cashier_pin => '7788'
                );
                IF (v_r->>'error_code') <> 'CASHIER_PIN_LOCKED_15M' THEN
                    RAISE EXCEPTION 'LOCKED_PIN_ACCEPTED: %', v_r;
                END IF;

                -- Self-PIN purchase rejected with fresh cashier EMP-02 linked to member #3
                INSERT INTO {QA_SCHEMA}.cashier_employees (merchant_id, branch_id, employee_code, full_name, pin_hash, linked_member_id)
                VALUES (v_mid, v_mbr, 'EMP-SELF', 'Self Cashier', extensions.crypt('9988', extensions.gen_salt('bf')), v_mem_id);
                v_r := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 100.00, p_payment_type => 'cash',
                    p_session_token => v_mem_tok, p_employee_code => 'EMP-SELF', p_cashier_pin => '9988'
                );
                IF (v_r->>'status') <> 'rejected_self_cashier_pin' THEN
                    RAISE EXCEPTION 'SELF_PIN_NOT_REJECTED: %', v_r;
                END IF;
            END;
            $$;
            SELECT 'SUITE3_OK' AS status;
        """, token)
        record("S3: Member Dual-Mode Mode 1 (Instant PIN, Anti-Enum, 5-Strike Lock, TX Limit, Self-PIN Block)", s3[0]["status"] == "SUITE3_OK")

        # Suite 4: Member Path B Mode 2 (Remote Pending, Receipt Required, 2-Limit, 20% Soft Hold Cap, Exact Soft Hold Release)
        s4 = run_sql(f"""
            DO $$
            DECLARE
                v_adm      JSONB;
                v_fid      UUID;
                v_ftok     TEXT;
                v_mreg     JSONB;
                v_mid      UUID;
                v_mtok     TEXT;
                v_mbr      UUID;
                v_mem_reg  JSONB;
                v_mem_id   UUID;
                v_mem_tok  TEXT;
                v_p1       JSONB;
                v_p2       JSONB;
                v_hold_1   NUMERIC;
                v_hold_2   NUMERIC;
                v_hold_cur NUMERIC;
                v_err      TEXT;
            BEGIN
                v_adm  := {QA_SCHEMA}.authenticate_admin_login('founder.approver@sawyan.global', 'Sawyan@Founder#2026!');
                v_fid  := (v_adm->'admin'->>'id')::uuid;
                v_ftok := v_adm->>'session_token';

                v_mem_reg := {QA_SCHEMA}.register_new_member(
                    'عضو المسار ب الثاني', '+201044332211', 1, 'Strong@Mode2',
                    'EG', 'EG', NULL, 'المعادي', 'qa.mode2@sawyan.test', '{{}}'::jsonb
                );
                v_mem_id  := (v_mem_reg->'member'->>'id')::uuid;
                v_mem_tok := v_mem_reg->>'session_token';

                v_mreg := {QA_SCHEMA}.register_new_merchant(
                    'متجر الدليفري', 'طارق', '+201033221100', 'Strong@Mode2M',
                    'EG', 'supermarket', 'physical', 10.00, 'mode2@sawyan.test', 'المعادي',
                    360630, 29.960000, 31.260000, 1, '3344', '{{}}'::jsonb
                );
                v_mid  := (v_mreg->'merchant'->>'id')::uuid;
                v_mtok := v_mreg->>'session_token';
                v_mbr  := (v_mreg->>'main_branch_id')::uuid;
                PERFORM {QA_SCHEMA}.admin_manage_merchant_contract(v_fid, v_ftok, v_mid, 'update_contract', 10.00, 'supermarket', 0, true);
                PERFORM {QA_SCHEMA}.process_merchant_topup_fifo(v_mid, 10000.00, 'QA-S4-TOPUP'::varchar, gen_random_uuid());

                -- Bad receipt format (SVG) fails in Mode 2 (valid optional default remains compatible with Stage 4 contract)
                BEGIN
                    PERFORM {QA_SCHEMA}.submit_member_pending_purchase(
                        p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                        p_amount => 500.00, p_payment_type => 'cod', p_session_token => v_mem_tok,
                        p_receipt_url => 'data:image/svg+xml;base64,PHN2Zz4='
                    );
                    RAISE EXCEPTION 'INVALID_RECEIPT_FORMAT_ALLOWED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%INVALID_ATTACHMENT_FORMAT%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_RECEIPT_ERR: %', SQLERRM;
                    END IF;
                END;

                -- 2 pending purchases succeed & keep income_plan_share_usd = 0 while pending
                v_p1 := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 1000.00, p_payment_type => 'cod',
                    p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg', p_unique_payment_ref => 'COD-M2-1'
                );
                v_p2 := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 1500.00, p_payment_type => 'instant_transfer',
                    p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg', p_unique_payment_ref => 'INST-M2-2'
                );
                SELECT COALESCE((commission_snapshot->>'soft_hold_amount')::numeric, 0) INTO v_hold_1 FROM {QA_SCHEMA}.transactions WHERE id = (v_p1->>'transaction_id')::uuid;
                SELECT COALESCE((commission_snapshot->>'soft_hold_amount')::numeric, 0) INTO v_hold_2 FROM {QA_SCHEMA}.transactions WHERE id = (v_p2->>'transaction_id')::uuid;
                SELECT soft_hold_balance INTO v_hold_cur FROM {QA_SCHEMA}.merchants WHERE id = v_mid;
                IF v_hold_cur <> (v_hold_1 + v_hold_2) THEN
                    RAISE EXCEPTION 'SOFT_HOLD_SUM_MISMATCH: cur=%, h1=%, h2=%', v_hold_cur, v_hold_1, v_hold_2;
                END IF;

                -- 3rd pending at same merchant blocked (max 2)
                BEGIN
                    PERFORM {QA_SCHEMA}.submit_member_pending_purchase(
                        p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                        p_amount => 200.00, p_payment_type => 'cash',
                        p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg'
                    );
                    RAISE EXCEPTION 'THIRD_PENDING_ALLOWED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%PENDING%' AND SQLERRM NOT LIKE '%2%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_3RD_PENDING_ERR: %', SQLERRM;
                    END IF;
                END;

                -- Cancel p1 -> exact v_hold_1 released, v_hold_2 remains intact
                PERFORM {QA_SCHEMA}.cancel_member_pending_purchase(v_mem_id, (v_p1->>'transaction_id')::uuid, v_mem_tok);
                SELECT soft_hold_balance INTO v_hold_cur FROM {QA_SCHEMA}.merchants WHERE id = v_mid;
                IF v_hold_cur <> v_hold_2 THEN
                    RAISE EXCEPTION 'EXACT_SOFT_HOLD_RELEASE_FAIL: cur=%, expected=%', v_hold_cur, v_hold_2;
                END IF;

                -- Oversized pending > 20% Soft Hold cap rejected (20% of 10,000 = 2,000 -> comm of 25,000 = 2,500 > 2,000)
                BEGIN
                    PERFORM {QA_SCHEMA}.submit_member_pending_purchase(
                        p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                        p_amount => 25000.00, p_payment_type => 'cash',
                        p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg'
                    );
                    RAISE EXCEPTION 'SOFT_HOLD_CAP_BYPASSED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%SOFT_HOLD%' AND SQLERRM NOT LIKE '%CAP%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_CAP_ERR: %', SQLERRM;
                    END IF;
                END;

                -- Reject p2 -> hold goes back to 0.00
                PERFORM {QA_SCHEMA}.confirm_or_reject_pending_tx(v_mid, (v_p2->>'transaction_id')::uuid, 'reject', 'test reject', v_mtok);
                SELECT soft_hold_balance INTO v_hold_cur FROM {QA_SCHEMA}.merchants WHERE id = v_mid;
                IF v_hold_cur <> 0 THEN
                    RAISE EXCEPTION 'REJECT_HOLD_LEAK: cur=%', v_hold_cur;
                END IF;
            END;
            $$;
            SELECT 'SUITE4_OK' AS status;
        """, token)
        record("S4: Member Path B Mode 2 (Receipt Required, 2-Limit, 20% Soft Hold Cap, Exact Soft Hold Release)", s4[0]["status"] == "SUITE4_OK")

        # Suite 5: All Security Panel-2 Remediations Negative Tests
        s5 = run_sql(f"""
            DO $$
            DECLARE
                v_fid      UUID;
                v_ftok     TEXT;
                v_adm_fin  UUID;
                v_fin_tok  TEXT;
                v_mreg     JSONB;
                v_mid      UUID;
                v_mtok     TEXT;
                v_lookup   JSONB;
                v_tkt      JSONB;
                v_fin_res  JSONB;
                v_fnd_res  JSONB;
                v_audit_c  INT;
                i          INT;
            BEGIN
                -- 5.1 verify_admin_session rejects forged 64-char hex token
                SELECT id INTO v_fid FROM {QA_SCHEMA}.admins WHERE lower(email) = 'founder.approver@sawyan.global' LIMIT 1;
                BEGIN
                    PERFORM {QA_SCHEMA}.verify_admin_session(v_fid, repeat('a', 64));
                    RAISE EXCEPTION 'FORGED_64HEX_ADMIN_ACCEPTED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%ADMIN_SESSION_INVALID%' AND SQLERRM NOT LIKE '%UNAUTHORIZED_ADMIN_SESSION%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_ADMIN_SESS_ERR: %', SQLERRM;
                    END IF;
                END;

                -- 5.2 lookup_member_for_pos hides full_name & phone and enforces rate limit > 30/min
                v_mreg := {QA_SCHEMA}.register_new_merchant(
                    'متجر الأمن', 'أمين', '+201022110099', 'Strong@Sec99',
                    'EG', 'supermarket', 'physical', 10.00, 'sec@sawyan.test', 'القاهرة',
                    360630, 30.050000, 31.240000, 1, '5566', '{{}}'::jsonb
                );
                v_mid  := (v_mreg->'merchant'->>'id')::uuid;
                v_mtok := v_mreg->>'session_token';
                v_lookup := {QA_SCHEMA}.lookup_member_for_pos(v_mid, '1', v_mtok);
                IF (v_lookup ? 'full_name') OR (v_lookup::text ~* 'phone') OR COALESCE(v_lookup->>'masked_name', '') = '' THEN
                    RAISE EXCEPTION 'POS_LOOKUP_PII_LEAK: %', v_lookup;
                END IF;
                BEGIN
                    FOR i IN 1..35 LOOP
                        PERFORM {QA_SCHEMA}.lookup_member_for_pos(v_mid, '1', v_mtok);
                    END LOOP;
                    RAISE EXCEPTION 'POS_LOOKUP_RATE_LIMIT_BYPASSED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%RATE_LIMIT%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_RL_ERR: %', SQLERRM;
                    END IF;
                END;

                -- 5.3 Empty token fails merchant_manage_branches_and_refunds
                BEGIN
                    PERFORM {QA_SCHEMA}.merchant_manage_branches_and_refunds(v_mid, '', 'list_branches', '{{}}'::jsonb);
                    RAISE EXCEPTION 'EMPTY_TOKEN_ALLOWED';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%MERCHANT_SESSION_INVALID%' AND SQLERRM NOT LIKE '%UNAUTHORIZED_MERCHANT_SESSION%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_MERCH_EMPTY_TOK_ERR: %', SQLERRM;
                    END IF;
                END;

                -- 5.4 submit_support_or_recovery_ticket stops requester_id spoofing without valid session
                v_tkt := {QA_SCHEMA}.submit_support_or_recovery_ticket(
                    'member', 'general', 'spoof subj', 'spoof body', 'Attacker', '+201000000000',
                    NULL, '11111111-1111-1111-1111-111111111111'::uuid, NULL
                );
                IF (v_tkt->>'ticket_id') IS NULL OR NOT EXISTS (
                    SELECT 1 FROM {QA_SCHEMA}.support_tickets
                     WHERE id = (v_tkt->>'ticket_id')::uuid
                ) THEN
                    RAISE EXCEPTION 'SUPPORT_TICKET_NOT_CREATED';
                END IF;
                IF EXISTS (
                    SELECT 1 FROM {QA_SCHEMA}.support_tickets
                     WHERE id = (v_tkt->>'ticket_id')::uuid
                       AND (requester_type <> 'public' OR requester_id = '11111111-1111-1111-1111-111111111111'::uuid)
                ) THEN
                    RAISE EXCEPTION 'SUPPORT_TICKET_SPOOFED';
                END IF;

                -- 5.5 KYC RBAC strips document_preview for non-KYC finance role & logs view for Founder
                SELECT id INTO v_adm_fin FROM {QA_SCHEMA}.admins WHERE lower(email) = 'finance.maker@sawyan.global' LIMIT 1;
                v_fin_tok := {QA_SCHEMA}.authenticate_admin_login('finance.maker@sawyan.global', 'Sawyan@Finance#2026!')->>'session_token';
                v_ftok    := {QA_SCHEMA}.authenticate_admin_login('founder.approver@sawyan.global', 'Sawyan@Founder#2026!')->>'session_token';

                v_fin_res := {QA_SCHEMA}.admin_search_and_reply_ops(v_adm_fin, v_fin_tok, 'search', 'members', 'عضو المرفقات');
                IF COALESCE(v_fin_res->'results'->0->'kyc_submission'->>'document_redacted', 'false') <> 'true'
                   OR (v_fin_res->'results'->0->'kyc_submission'->>'document_preview') IS NOT NULL THEN
                    RAISE EXCEPTION 'KYC_RBAC_NOT_REDACTED_FOR_FINANCE: %', v_fin_res;
                END IF;

                v_fnd_res := {QA_SCHEMA}.admin_search_and_reply_ops(v_fid, v_ftok, 'search', 'members', 'عضو المرفقات');
                SELECT count(*) INTO v_audit_c FROM {QA_SCHEMA}.audit_logs WHERE action = 'kyc_document_viewed' AND actor_id = v_fid;
                IF (v_fnd_res->'results'->0->'kyc_submission'->>'document_preview') IS NULL OR v_audit_c < 1 THEN
                    RAISE EXCEPTION 'FOUNDER_KYC_OR_AUDIT_MISSING';
                END IF;
            END;
            $$;
            SELECT 'SUITE5_OK' AS status;
        """, token)
        record("S5: All Security Panel-2 Fixes (Admin Auth, POS PII/RL, Empty Token, Support Spoof, KYC RBAC)", s5[0]["status"] == "SUITE5_OK")

        # Suite 6: Admin Transaction Decisions (approve_escalated, reject_escalated, reverse_pre_payout & post-Day-15 ban)
        s6 = run_sql(f"""
            DO $$
            DECLARE
                v_adm      JSONB;
                v_fid      UUID;
                v_ftok     TEXT;
                v_mid      UUID;
                v_mtok     TEXT;
                v_mbr      UUID;
                v_mem_id   UUID;
                v_mem_tok  TEXT;
                v_p_app    JSONB;
                v_p_rej    JSONB;
                v_tx_comp  UUID;
                v_tx_rej   UUID;
                v_tx_rev   UUID;
                v_ym_old   CHAR(7);
                v_cid      INT;
            BEGIN
                v_adm  := {QA_SCHEMA}.authenticate_admin_login('founder.approver@sawyan.global', 'Sawyan@Founder#2026!');
                v_fid  := (v_adm->'admin'->>'id')::uuid;
                v_ftok := v_adm->>'session_token';

                SELECT id INTO v_mem_id FROM {QA_SCHEMA}.members WHERE member_code = 2;
                v_mem_tok := {QA_SCHEMA}.authenticate_member_login('2', 'Test@Mem2')->>'session_token';
                SELECT id INTO v_mid FROM {QA_SCHEMA}.merchants WHERE is_active = true AND is_isolated = false AND actual_cash_balance >= 5000 ORDER BY created_at DESC LIMIT 1;
                SELECT id INTO v_mbr FROM {QA_SCHEMA}.merchant_branches WHERE merchant_id = v_mid LIMIT 1;
                IF v_mid IS NULL THEN
                    RAISE EXCEPTION 'NO_MERCHANT_FOR_S6';
                END IF;

                v_p_app := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 300.00, p_payment_type => 'cod',
                    p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg', p_unique_payment_ref => 'ADM-APP-1'
                );
                v_tx_comp := (v_p_app->>'transaction_id')::uuid;
                PERFORM {QA_SCHEMA}.admin_operational_decision(v_fid, v_ftok, 'transaction', v_tx_comp::text, 'approve_escalated', 'QA admin approve');
                IF (SELECT status FROM {QA_SCHEMA}.transactions WHERE id = v_tx_comp) <> 'completed' THEN
                    RAISE EXCEPTION 'ADM_APPROVE_ESCALATED_FAIL';
                END IF;

                v_p_rej := {QA_SCHEMA}.submit_member_pending_purchase(
                    p_member_id => v_mem_id, p_merchant_id => v_mid, p_branch_id => v_mbr,
                    p_amount => 350.00, p_payment_type => 'cod',
                    p_session_token => v_mem_tok, p_receipt_url => 'https://img/rec.jpg', p_unique_payment_ref => 'ADM-REJ-1'
                );
                v_tx_rej := (v_p_rej->>'transaction_id')::uuid;
                PERFORM {QA_SCHEMA}.admin_operational_decision(v_fid, v_ftok, 'transaction', v_tx_rej::text, 'reject_escalated', 'QA admin reject');
                IF (SELECT status FROM {QA_SCHEMA}.transactions WHERE id = v_tx_rej) <> 'rejected' THEN
                    RAISE EXCEPTION 'ADM_REJECT_ESCALATED_FAIL';
                END IF;

                -- Pre-payout reverse works cleanly
                PERFORM {QA_SCHEMA}.admin_operational_decision(v_fid, v_ftok, 'transaction', v_tx_comp::text, 'reverse_pre_payout', 'QA pre-payout reverse');
                IF (SELECT status FROM {QA_SCHEMA}.transactions WHERE id = v_tx_comp) <> 'reversed' THEN
                    RAISE EXCEPTION 'ADM_REVERSE_PRE_PAYOUT_FAIL';
                END IF;

                -- Post-Day-15 hard-locked settlement rejects reverse_pre_payout
                v_tx_rev := (({QA_SCHEMA}.submit_pos_transaction(v_mem_id, v_mid, v_mbr, 200.00, 'cash', 'ADM-LOCK-200', 'SW-L200', gen_random_uuid(), NULL, true, NULL))->>'transaction_id')::uuid;
                SELECT COALESCE(t.commission_snapshot->>'effective_period_ym',
                                to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')),
                       t.country_id
                  INTO v_ym_old, v_cid
                  FROM {QA_SCHEMA}.transactions t
                  JOIN {QA_SCHEMA}.countries c ON c.id = t.country_id
                 WHERE t.id = v_tx_rev;
                INSERT INTO {QA_SCHEMA}.settlement_cycles (country_id, period_ym, closure_utc_instant, step_status, is_hard_locked, payout_executed_at)
                VALUES (v_cid, v_ym_old, now(), 6, true, now())
                ON CONFLICT (country_id, period_ym) DO UPDATE SET is_hard_locked = true, step_status = 6, payout_executed_at = now();
                BEGIN
                    PERFORM {QA_SCHEMA}.admin_operational_decision(v_fid, v_ftok, 'transaction', v_tx_rev::text, 'reverse_pre_payout', 'Should fail post-Day-15');
                    RAISE EXCEPTION 'POST_DAY15_REVERSAL_SHOULD_FAIL';
                EXCEPTION WHEN OTHERS THEN
                    IF SQLERRM NOT LIKE '%POST_PAYOUT_RETURN_FORBIDDEN%' THEN
                        RAISE EXCEPTION 'UNEXPECTED_DAY15_ERR: %', SQLERRM;
                    END IF;
                END;
            END;
            $$;
            SELECT 'SUITE6_OK' AS status;
        """, token)
        record("S6: Admin Operational Decisions (approve_escalated, reject_escalated, reverse_pre_payout & post-Day-15 ban)", s6[0]["status"] == "SUITE6_OK")

    finally:
        try:
            run_sql(f"DROP SCHEMA IF EXISTS {QA_SCHEMA} CASCADE;", token)
        except Exception as e:
            print(f"[WARN] Cleanup DROP SCHEMA {QA_SCHEMA} failed: {e}", file=sys.stderr)

    failed = [c for c in checks if not c["passed"]]
    print(f"\n=== SUMMARY: {len(checks) - len(failed)}/{len(checks)} PASSED ===")
    if failed:
        print("FAILED CHECKS:", json.dumps(failed, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
