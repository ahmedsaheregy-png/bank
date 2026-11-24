-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 PHASE 1: ENGINEERING & FINANCIAL INTEGRITY FOUNDATION
-- ============================================================================
-- Delivers:
--   1. C4: SHA-256 hashed, 7-day expiring Member & Merchant session tokens
--          (zero plaintext `active_session_token` persisted on disk via BEFORE trigger,
--           automatic session invalidation on password reset, and unified verification).
--   2. DB-Level Double-Entry Enforcement: DEFERRABLE INITIALLY DEFERRED constraint
--          trigger on `sawyan.journal_lines` rejecting any unbalanced journal entry at COMMIT.
--   3. Nightly Zero-Discrepancy Audit Watchdog (`run_nightly_zero_discrepancy_audit`)
--          auto-halting payouts (`K_PAY`, `K_WD`) on any >= 0.01 ledger drift or chain break.
--
-- Strictly Idempotent. ZERO bare lowercase `sawyan` inside string literals for clean cloning.
-- ============================================================================

-- 1. C4: Automatic SHA-256 Hashing + 7-Day Expiry Trigger for Member & Merchant Sessions
CREATE OR REPLACE FUNCTION sawyan.trg_hash_session_token_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_raw_tok TEXT;
    v_pwd_changed BOOLEAN := false;
BEGIN
    IF NEW.metadata IS NULL THEN
        NEW.metadata := '{}'::jsonb;
    END IF;

    IF NEW.metadata ? 'active_session_token' THEN
        v_raw_tok := NULLIF(trim(COALESCE(NEW.metadata->>'active_session_token', '')), '');
        NEW.metadata := NEW.metadata - 'active_session_token';
        IF v_raw_tok IS NOT NULL THEN
            NEW.metadata := NEW.metadata || jsonb_build_object(
                'session_token_sha256', encode(extensions.digest(v_raw_tok, 'sha256'), 'hex'),
                'session_expires_at', (now() + interval '7 days')::text
            );
        ELSE
            NEW.metadata := NEW.metadata - 'session_token_sha256' - 'session_expires_at';
        END IF;
        RETURN NEW;
    END IF;

    -- Auto-revoke existing hashed session when password changes without issuing a new token
    IF TG_OP = 'UPDATE' THEN
        IF TG_TABLE_NAME = 'members' THEN
            v_pwd_changed := (OLD.metadata->>'pwd_bcrypt') IS DISTINCT FROM (NEW.metadata->>'pwd_bcrypt');
        ELSIF TG_TABLE_NAME = 'merchants' THEN
            v_pwd_changed := OLD.password_hash IS DISTINCT FROM NEW.password_hash;
        END IF;

        IF v_pwd_changed THEN
            NEW.metadata := NEW.metadata - 'session_token_sha256' - 'session_expires_at' - 'active_session_token';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.trg_hash_session_token_on_write() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_members_hash_session_token
    BEFORE INSERT OR UPDATE OF metadata ON sawyan.members
    FOR EACH ROW EXECUTE FUNCTION sawyan.trg_hash_session_token_on_write();

CREATE OR REPLACE TRIGGER trg_merchants_hash_session_token
    BEFORE INSERT OR UPDATE OF metadata, password_hash ON sawyan.merchants
    FOR EACH ROW EXECUTE FUNCTION sawyan.trg_hash_session_token_on_write();

-- Backfill: convert any existing plaintext `active_session_token` rows in-place (zero downtime)
UPDATE sawyan.members
   SET metadata = metadata
 WHERE metadata ? 'active_session_token';

UPDATE sawyan.merchants
   SET metadata = metadata
 WHERE metadata ? 'active_session_token';

-- Upgrade `verify_member_session` to verify SHA-256 hash + expiry strictly
CREATE OR REPLACE FUNCTION sawyan.verify_member_session(
    p_member_id     UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS sawyan.members
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member     sawyan.members%ROWTYPE;
    v_saved_hash TEXT;
    v_exp_str    TEXT;
    v_jwt_role   TEXT;
BEGIN
    SELECT * INTO v_member FROM sawyan.members WHERE id = p_member_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND';
    END IF;
    IF v_member.member_code = 0 THEN
        RAISE EXCEPTION 'ROOT_PORTAL_ACCESS_FORBIDDEN';
    END IF;
    IF v_member.is_tombstone_banned OR v_member.status <> 'active' THEN
        RAISE EXCEPTION 'MEMBER_ACCOUNT_INACTIVE';
    END IF;

    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
        RETURN v_member;
    END IF;

    IF auth.uid() IS NOT NULL AND auth.uid() = v_member.auth_user_id THEN
        RETURN v_member;
    END IF;

    IF NULLIF(trim(COALESCE(p_session_token, '')), '') IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
    END IF;

    v_saved_hash := COALESCE(v_member.metadata->>'session_token_sha256', '');
    v_exp_str    := COALESCE(v_member.metadata->>'session_expires_at', '');

    IF v_saved_hash = '' OR v_saved_hash <> encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
    END IF;

    IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
        RAISE EXCEPTION 'MEMBER_SESSION_EXPIRED';
    END IF;

    RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.verify_member_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.verify_member_session(UUID, TEXT) TO service_role;

-- Upgrade `verify_merchant_session` to verify SHA-256 hash + expiry strictly
CREATE OR REPLACE FUNCTION sawyan.verify_merchant_session(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS sawyan.merchants
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch      sawyan.merchants%ROWTYPE;
    v_saved_hash TEXT;
    v_exp_str    TEXT;
    v_jwt_role   TEXT;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;
    IF v_merch.onboarding_status = 'rejected' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_REJECTED';
    END IF;
    IF v_merch.governance_status = 'banned_permanent' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_BANNED';
    END IF;

    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
        RETURN v_merch;
    END IF;

    IF NULLIF(trim(COALESCE(p_session_token, '')), '') IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
    END IF;

    v_saved_hash := COALESCE(v_merch.metadata->>'session_token_sha256', '');
    v_exp_str    := COALESCE(v_merch.metadata->>'session_expires_at', '');

    IF v_saved_hash = '' OR v_saved_hash <> encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
    END IF;

    IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
        RAISE EXCEPTION 'MERCHANT_SESSION_EXPIRED';
    END IF;

    RETURN v_merch;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) TO service_role;

-- Update `merchant_manage_branches_and_refunds` to delegate auth to `verify_merchant_session` (hashed + expiring)
CREATE OR REPLACE FUNCTION sawyan.merchant_manage_branches_and_refunds(
    p_merchant_id       UUID,
    p_session_token     TEXT,
    p_action            VARCHAR,
    p_payload           JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_mer      sawyan.merchants%ROWTYPE;
    v_act      VARCHAR(40);
    v_branches JSONB;
    v_bcode    VARCHAR(30);
    v_claw     JSONB;
    v_notif_id UUID;
    v_rec_img  TEXT;
BEGIN
    v_mer := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_act := lower(trim(COALESCE(p_action, 'list_branches')));

    IF v_act = 'add_branch' THEN
        v_bcode := upper(COALESCE(NULLIF(trim(p_payload->>'branch_code'), ''), 'BR-' || substr(md5(clock_timestamp()::text), 1, 5)));
        INSERT INTO sawyan.merchant_branches (
            merchant_id, branch_code, branch_name, is_main_branch,
            address, latitude, longitude, branch_phone, branch_manager_name, is_branch_active
        ) VALUES (
            v_mer.id,
            v_bcode,
            COALESCE(NULLIF(trim(p_payload->>'branch_name'), ''), v_mer.business_name || ' — فرع إضافي'),
            false,
            COALESCE(NULLIF(trim(p_payload->>'address'), ''), COALESCE(v_mer.address, 'العنوان الرئيسي')),
            COALESCE((p_payload->>'latitude')::numeric, COALESCE(v_mer.latitude, 30.0444)),
            COALESCE((p_payload->>'longitude')::numeric, COALESCE(v_mer.longitude, 31.2357)),
            NULLIF(trim(p_payload->>'branch_phone'), ''),
            NULLIF(trim(p_payload->>'branch_manager_name'), ''),
            true
        );
        PERFORM sawyan.append_audit_log('merchant', v_mer.id, 'merchant_branch_added', 'merchant_branches', v_bcode, NULL, p_payload);

    ELSIF v_act = 'toggle_branch' THEN
        UPDATE sawyan.merchant_branches
           SET is_branch_active = NOT is_branch_active
         WHERE id = (p_payload->>'branch_id')::uuid AND merchant_id = v_mer.id;

    ELSIF v_act = 'assign_cashier_branch' THEN
        UPDATE sawyan.cashier_employees
           SET branch_id = NULLIF(trim(p_payload->>'branch_id'), '')::uuid
         WHERE id = (p_payload->>'cashier_id')::uuid AND merchant_id = v_mer.id;

    ELSIF v_act = 'submit_bank_topup_proof' THEN
        IF COALESCE((p_payload->>'amount_local')::numeric, 0) <= 0 OR length(trim(COALESCE(p_payload->>'bank_ref', ''))) < 3 THEN
            RAISE EXCEPTION 'TOPUP_AMOUNT_AND_BANK_REF_REQUIRED';
        END IF;
        v_rec_img := sawyan.validate_attachment_data(p_payload->>'receipt_image_data', 480000, true);
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'admin', v_mer.id, 'MerchantBankTopupProofPending', 'in_app',
            jsonb_build_object(
                'merchant_id', v_mer.id,
                'merchant_code', v_mer.merchant_code,
                'business_name', v_mer.business_name,
                'amount_local', (p_payload->>'amount_local')::numeric,
                'bank_ref', trim(p_payload->>'bank_ref'),
                'receipt_note', COALESCE(p_payload->>'receipt_note', ''),
                'receipt_image_data', v_rec_img,
                'submitted_at', now()
            )
        ) RETURNING id INTO v_notif_id;
        RETURN jsonb_build_object('status', 'bank_topup_proof_submitted', 'proof_id', v_notif_id);

    ELSIF v_act = 'voluntary_tx_refund' THEN
        v_claw := sawyan.merchant_process_pos_return(
            v_mer.id,
            (p_payload->>'transaction_id')::uuid,
            COALESCE(NULLIF(trim(p_payload->>'reason'), ''), 'مرتجع بضاعة للعميل'),
            NULLIF(trim(COALESCE(p_payload->>'idempotency_key', '')), '')::uuid,
            p_session_token,
            COALESCE(NULLIF(trim(p_payload->>'mode'), ''), 'request_otp'),
            NULLIF(trim(COALESCE(p_payload->>'otp_code', '')), ''),
            NULLIF(trim(COALESCE(p_payload->>'proof_url', '')), '')
        );
        PERFORM sawyan.append_audit_log(
            'merchant',
            v_mer.id,
            'merchant_voluntary_return_flow_' || COALESCE(v_claw->>'status', 'initiated'),
            'transactions',
            (p_payload->>'transaction_id')::text,
            NULL,
            jsonb_build_object('reason', COALESCE(p_payload->>'reason', 'مرتجع بضاعة للعميل'), 'return_flow', v_claw)
        );
        RETURN jsonb_build_object('status', COALESCE(v_claw->>'status', 'awaiting_member_otp'), 'return_flow', v_claw);
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(b)::jsonb ORDER BY b.is_main_branch DESC, b.created_at ASC), '[]'::jsonb)
      INTO v_branches
      FROM sawyan.merchant_branches b
     WHERE b.merchant_id = v_mer.id;

    RETURN jsonb_build_object('branches', v_branches);
END;
$$;

REVOKE ALL ON FUNCTION sawyan.merchant_manage_branches_and_refunds(UUID, TEXT, VARCHAR, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.merchant_manage_branches_and_refunds(UUID, TEXT, VARCHAR, JSONB) TO anon, authenticated, service_role;

-- 2. DB-Level Double-Entry Accounting Balance Enforcement (DEFERRABLE INITIALLY DEFERRED)
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON sawyan.journal_lines (journal_entry_id);

CREATE OR REPLACE FUNCTION sawyan.enforce_journal_entry_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_entry_id UUID;
    v_sum_dr   NUMERIC(18,2);
    v_sum_cr   NUMERIC(18,2);
    v_line_cnt INT;
BEGIN
    v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    IF v_entry_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*),
           COALESCE(SUM(debit_usd), 0.00),
           COALESCE(SUM(credit_usd), 0.00)
      INTO v_line_cnt, v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines
     WHERE journal_entry_id = v_entry_id;

    IF v_line_cnt > 0 AND v_sum_dr <> v_sum_cr THEN
        RAISE EXCEPTION 'LEDGER_UNBALANCED_ENTRY_BLOCKED: journal_entry_id=% debit=% credit=% diff=%',
            v_entry_id, v_sum_dr, v_sum_cr, (v_sum_dr - v_sum_cr);
    END IF;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.enforce_journal_entry_balance() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'trg_journal_lines_zero_discrepancy'
           AND tgrelid = 'sawyan.journal_lines'::regclass
    ) THEN
        CREATE CONSTRAINT TRIGGER trg_journal_lines_zero_discrepancy
            AFTER INSERT OR UPDATE OR DELETE ON sawyan.journal_lines
            DEFERRABLE INITIALLY DEFERRED
            FOR EACH ROW EXECUTE FUNCTION sawyan.enforce_journal_entry_balance();
    END IF;
END $$;

-- 3. Nightly Zero-Discrepancy Audit Watchdog (Auto-Halts K_PAY & K_WD on >= 0.01 Drift)
CREATE OR REPLACE FUNCTION sawyan.run_nightly_zero_discrepancy_audit()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_sum_dr        NUMERIC(18,2);
    v_sum_cr        NUMERIC(18,2);
    v_diff          NUMERIC(18,2);
    v_unbal_entries INT;
    v_bad_pools     INT;
    v_broken_chain  INT;
    v_is_clean      BOOLEAN;
    v_settings_id   INT;
    v_report        JSONB;
BEGIN
    SELECT COALESCE(SUM(debit_usd), 0.00), COALESCE(SUM(credit_usd), 0.00)
      INTO v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines;

    v_diff := ABS(v_sum_dr - v_sum_cr);

    SELECT COUNT(*) INTO v_unbal_entries
      FROM (
          SELECT journal_entry_id
            FROM sawyan.journal_lines
           GROUP BY journal_entry_id
          HAVING COALESCE(SUM(debit_usd), 0.00) <> COALESCE(SUM(credit_usd), 0.00)
      ) u;

    SELECT COUNT(*) INTO v_bad_pools
      FROM sawyan.pool_transactions pt
     WHERE ROUND((pt.total_distributed_usd + pt.rounding_diff_usd)::numeric, 2) <> pt.target_consumed_usd;

    SELECT COUNT(*) INTO v_broken_chain
      FROM (
          SELECT id, prev_row_hash, LAG(row_hash) OVER (ORDER BY id ASC) AS expected_prev
            FROM sawyan.audit_logs
      ) ch
     WHERE ch.expected_prev IS NOT NULL AND ch.prev_row_hash IS DISTINCT FROM ch.expected_prev;

    v_is_clean := (v_diff < 0.01 AND v_unbal_entries = 0 AND v_bad_pools = 0 AND v_broken_chain = 0);

    v_report := jsonb_build_object(
        'checked_at', now(),
        'total_debit_usd', v_sum_dr,
        'total_credit_usd', v_sum_cr,
        'abs_diff_usd', v_diff,
        'unbalanced_entries', v_unbal_entries,
        'mismatched_pools', v_bad_pools,
        'broken_audit_chain_links', v_broken_chain,
        'is_clean', v_is_clean
    );

    IF NOT v_is_clean THEN
        SELECT id INTO v_settings_id
          FROM sawyan.settings
         WHERE country_id IS NULL
         ORDER BY effective_from DESC, recorded_at DESC
         LIMIT 1
         FOR UPDATE;

        IF v_settings_id IS NOT NULL THEN
            UPDATE sawyan.settings
               SET operational_kill_switches = COALESCE(operational_kill_switches, '{}'::jsonb)
                   || jsonb_build_object('K_PAY', true, 'K_WD', true),
                   recorded_at = now()
             WHERE id = v_settings_id;
        END IF;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'admin_queue',
            '00000000-0000-0000-0000-000000000000'::uuid,
            'ZeroDiscrepancyBreachAutoHalt',
            'in_app',
            v_report || jsonb_build_object('auto_halted_switches', jsonb_build_array('K_PAY', 'K_WD'))
        );

        PERFORM sawyan.append_audit_log(
            'system',
            '00000000-0000-0000-0000-000000000000'::uuid,
            'nightly_zero_discrepancy_breach_payouts_halted',
            'journal_lines',
            to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
            NULL,
            v_report
        );
    ELSE
        PERFORM sawyan.append_audit_log(
            'system',
            '00000000-0000-0000-0000-000000000000'::uuid,
            'nightly_zero_discrepancy_passed',
            'journal_lines',
            to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
            NULL,
            v_report
        );
    END IF;

    RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.run_nightly_zero_discrepancy_audit() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.run_nightly_zero_discrepancy_audit() TO service_role;
