-- ============================================================================
-- SAWYAN V3.0 — Stage 14: Unified Verification Flow, Employee Personal-Phone
-- Portal, Forced First-Login PIN Privacy, Owner 48h Override & Admin Settings
-- ============================================================================
-- Scope:
--   1. Admin-configurable operational parameters on sawyan.settings (zero hard-coded limits).
--   2. Employee private PIN lifecycle (must_change_pin) & isolated revocable shift sessions
--      on sawyan.cashier_employees (zero owner financial exposure).
--   3. New Employee Portal RPCs:
--        - verify_cashier_session (INTERNAL ONLY)
--        - authenticate_employee_login
--        - employee_change_pin
--        - employee_lock_session
--        - get_employee_verification_bundle
--        - employee_lookup_member
--        - employee_decide_pending_tx
--        - employee_create_verification_tx
--   4. Upgraded core RPCs:
--        - submit_pos_transaction (dynamic max_pending_per_merchant + Soft Hold = 0 in 10% isolation)
--        - submit_member_pending_purchase (1 unified button, optional receipt, hidden anti-spam guard,
--          blocks remote PIN submission from member phones)
--        - confirm_or_reject_pending_tx (owner approves without PIN + owner 48h override of employee rejection)
--        - manage_merchant_cashier_and_settings (forced must_change_pin + instant session revocation + reset audit log)
--        - get_merchant_dashboard_bundle (exposes must_change_pin, session_active, recent_employee_rejections, verification_settings)
--        - admin_decide_governance_request (persists all 9 new BITEMPORAL_SETTINGS_UPDATE columns)
-- ============================================================================

-- 1. Schema Extensions (Idempotent)
ALTER TABLE sawyan.settings
    ADD COLUMN IF NOT EXISTS employee_shift_hours           SMALLINT NOT NULL DEFAULT 8    CHECK (employee_shift_hours BETWEEN 1 AND 72),
    ADD COLUMN IF NOT EXISTS employee_idle_timeout_mins     SMALLINT NOT NULL DEFAULT 60   CHECK (employee_idle_timeout_mins BETWEEN 5 AND 720),
    ADD COLUMN IF NOT EXISTS spam_reject_threshold          SMALLINT NOT NULL DEFAULT 2    CHECK (spam_reject_threshold >= 0),
    ADD COLUMN IF NOT EXISTS spam_reject_window_hours       SMALLINT NOT NULL DEFAULT 24   CHECK (spam_reject_window_hours BETWEEN 1 AND 720),
    ADD COLUMN IF NOT EXISTS spam_require_receipt_hours     SMALLINT NOT NULL DEFAULT 24   CHECK (spam_require_receipt_hours BETWEEN 1 AND 720),
    ADD COLUMN IF NOT EXISTS max_pending_per_merchant       SMALLINT NOT NULL DEFAULT 2    CHECK (max_pending_per_merchant BETWEEN 1 AND 20),
    ADD COLUMN IF NOT EXISTS live_poll_interval_secs        SMALLINT NOT NULL DEFAULT 8    CHECK (live_poll_interval_secs BETWEEN 3 AND 120),
    ADD COLUMN IF NOT EXISTS allow_zero_hold_in_isolation   BOOLEAN  NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS employee_pin_reconfirm_usd     NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (employee_pin_reconfirm_usd >= 0);

ALTER TABLE sawyan.cashier_employees
    ADD COLUMN IF NOT EXISTS must_change_pin         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS session_token_hash      TEXT,
    ADD COLUMN IF NOT EXISTS session_expires_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS session_last_active_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pin_changed_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS pin_reconfirm_threshold NUMERIC(18,2) CHECK (pin_reconfirm_threshold IS NULL OR pin_reconfirm_threshold >= 0);

-- New employees default to must_change_pin = true while existing seeded rows remain false
ALTER TABLE sawyan.cashier_employees
    ALTER COLUMN must_change_pin SET DEFAULT true;

-- Partial performance indexes
CREATE INDEX IF NOT EXISTS idx_cashier_employees_active_branch
    ON sawyan.cashier_employees (merchant_id, branch_id)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_transactions_rejected_spam_guard
    ON sawyan.transactions (merchant_id, member_id, created_at DESC)
    WHERE status = 'rejected';

-- ============================================================================
-- 2. Internal Employee Session Verification Helper (INTERNAL ONLY)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.verify_cashier_session(
    p_employee_id       UUID,
    p_session_token     TEXT,
    p_allow_must_change BOOLEAN DEFAULT false
) RETURNS sawyan.cashier_employees
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_emp        sawyan.cashier_employees%ROWTYPE;
    v_merch      sawyan.merchants%ROWTYPE;
    v_settings   sawyan.settings%ROWTYPE;
    v_tok_hash   TEXT;
    v_idle_mins  INT := 60;
BEGIN
    IF p_employee_id IS NULL OR NULLIF(trim(COALESCE(p_session_token, '')), '') IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED_EMPLOYEE_SESSION';
    END IF;

    SELECT * INTO v_emp
      FROM sawyan.cashier_employees
     WHERE id = p_employee_id
     FOR UPDATE;

    IF NOT FOUND OR v_emp.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'EMPLOYEE_ACCOUNT_INACTIVE';
    END IF;

    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = v_emp.merchant_id;
    IF NOT FOUND OR v_merch.onboarding_status = 'rejected' OR v_merch.governance_status = 'banned_permanent' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_INACTIVE';
    END IF;

    v_tok_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');
    IF v_emp.session_token_hash IS NULL OR v_emp.session_token_hash <> v_tok_hash THEN
        RAISE EXCEPTION 'UNAUTHORIZED_EMPLOYEE_SESSION';
    END IF;

    IF v_emp.session_expires_at IS NULL OR v_emp.session_expires_at <= now() THEN
        UPDATE sawyan.cashier_employees
           SET session_token_hash     = NULL,
               session_expires_at     = NULL,
               session_last_active_at = NULL
         WHERE id = v_emp.id;
        RAISE EXCEPTION 'EMPLOYEE_SESSION_EXPIRED';
    END IF;

    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;
    v_idle_mins := COALESCE(v_settings.employee_idle_timeout_mins, 60);

    IF v_emp.session_last_active_at IS NOT NULL
       AND (v_emp.session_last_active_at + make_interval(mins => v_idle_mins)) <= now()
    THEN
        UPDATE sawyan.cashier_employees
           SET session_token_hash     = NULL,
               session_expires_at     = NULL,
               session_last_active_at = NULL
         WHERE id = v_emp.id;
        RAISE EXCEPTION 'EMPLOYEE_SESSION_IDLE_LOCKED';
    END IF;

    IF NOT p_allow_must_change AND v_emp.must_change_pin IS TRUE THEN
        RAISE EXCEPTION 'EMPLOYEE_PIN_CHANGE_REQUIRED';
    END IF;

    UPDATE sawyan.cashier_employees
       SET session_last_active_at = now()
     WHERE id = v_emp.id
    RETURNING * INTO v_emp;

    RETURN v_emp;
END;
$$;

-- ============================================================================
-- 3. Employee Personal-Phone Login, Private PIN Change & Quick Lock
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.authenticate_employee_login(
    p_merchant_code TEXT,
    p_employee_code TEXT,
    p_pin           TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_mcode        TEXT;
    v_ecode        TEXT;
    v_pin          TEXT;
    v_merch        sawyan.merchants%ROWTYPE;
    v_branch       sawyan.merchant_branches%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_settings     sawyan.settings%ROWTYPE;
    v_emp          sawyan.cashier_employees%ROWTYPE;
    v_eff          JSONB;
    v_cur_attempts SMALLINT := 0;
    v_new_attempts SMALLINT := 0;
    v_lock_until   TIMESTAMPTZ;
    v_shift_hours  INT := 8;
    v_idle_mins    INT := 60;
    v_poll_secs    INT := 8;
    v_token        TEXT;
    v_tok_hash     TEXT;
    v_exp_at       TIMESTAMPTZ;
    v_dummy        TEXT;
BEGIN
    v_mcode := upper(trim(regexp_replace(COALESCE(p_merchant_code, ''), '^#+', '')));
    v_ecode := upper(trim(COALESCE(p_employee_code, '')));
    v_pin   := trim(COALESCE(p_pin, ''));

    IF v_mcode = '' OR v_ecode = '' OR v_pin !~ '^\d{4}$' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'EMPLOYEE_CREDENTIALS_REQUIRED');
    END IF;

    SELECT * INTO v_merch
      FROM sawyan.merchants
     WHERE upper(merchant_code) = v_mcode;

    IF NOT FOUND THEN
        v_dummy := extensions.crypt(v_pin, '$2a$06$abcdefghijklmnopqrstuu');
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_EMPLOYEE_CREDENTIALS');
    END IF;

    IF v_merch.onboarding_status = 'rejected' OR v_merch.governance_status = 'banned_permanent' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'MERCHANT_ACCOUNT_INACTIVE');
    END IF;

    SELECT * INTO v_emp
      FROM sawyan.cashier_employees
     WHERE merchant_id = v_merch.id
       AND upper(employee_code) = v_ecode
     FOR UPDATE;

    IF NOT FOUND THEN
        v_dummy := extensions.crypt(v_pin, '$2a$06$abcdefghijklmnopqrstuu');
        RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_EMPLOYEE_CREDENTIALS');
    END IF;

    IF v_emp.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'EMPLOYEE_ACCOUNT_INACTIVE');
    END IF;

    IF v_emp.pin_locked_until IS NOT NULL AND v_emp.pin_locked_until > now() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CASHIER_PIN_LOCKED_15M',
            'locked_until', v_emp.pin_locked_until
        );
    END IF;

    v_cur_attempts := CASE
        WHEN v_emp.pin_locked_until IS NOT NULL AND v_emp.pin_locked_until <= now() THEN 0
        ELSE COALESCE(v_emp.failed_pin_attempts, 0)
    END;

    IF v_emp.pin_hash <> extensions.crypt(v_pin, v_emp.pin_hash) THEN
        v_new_attempts := v_cur_attempts + 1;
        v_lock_until   := CASE WHEN v_new_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

        UPDATE sawyan.cashier_employees
           SET failed_pin_attempts = v_new_attempts,
               pin_locked_until    = v_lock_until
         WHERE id = v_emp.id;

        IF v_new_attempts >= 5 THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
            VALUES ('merchant', v_merch.id, 'CashierPinLocked5Attempts', 'in_app',
                    jsonb_build_object('employee_code', v_emp.employee_code, 'employee_name', v_emp.full_name, 'locked_until', v_lock_until));
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'error_code', CASE WHEN v_new_attempts >= 5 THEN 'CASHIER_PIN_LOCKED_15M' ELSE 'INVALID_EMPLOYEE_CREDENTIALS' END,
            'failed_attempts', v_new_attempts,
            'remaining_attempts', GREATEST(0, 5 - v_new_attempts),
            'locked_until', v_lock_until
        );
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_branch  FROM sawyan.merchant_branches WHERE id = v_emp.branch_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_shift_hours := COALESCE(v_settings.employee_shift_hours, 8);
    v_idle_mins   := COALESCE(v_settings.employee_idle_timeout_mins, 60);
    v_poll_secs   := COALESCE(v_settings.live_poll_interval_secs, 8);

    v_token    := 'emp_' || encode(extensions.gen_random_bytes(32), 'hex');
    v_tok_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
    v_exp_at   := now() + make_interval(hours => v_shift_hours);

    UPDATE sawyan.cashier_employees
       SET failed_pin_attempts    = 0,
           pin_locked_until       = NULL,
           session_token_hash     = v_tok_hash,
           session_expires_at     = v_exp_at,
           session_last_active_at = now()
     WHERE id = v_emp.id
    RETURNING * INTO v_emp;

    v_eff := sawyan.compute_merchant_effective_state(v_merch.id);

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_token,
        'must_change_pin', COALESCE(v_emp.must_change_pin, false),
        'session_expires_at', v_exp_at,
        'shift_hours', v_shift_hours,
        'idle_timeout_mins', v_idle_mins,
        'live_poll_interval_secs', v_poll_secs,
        'employee', jsonb_build_object(
            'id', v_emp.id,
            'employee_code', v_emp.employee_code,
            'full_name', v_emp.full_name,
            'merchant_id', v_merch.id,
            'merchant_code', v_merch.merchant_code,
            'business_name', v_merch.business_name,
            'branch_id', v_emp.branch_id,
            'branch_name', COALESCE(v_branch.branch_name, 'الفرع الرئيسي'),
            'currency_code', COALESCE(v_country.currency_code, 'EGP'),
            'max_tx_amount_limit', v_emp.max_tx_amount_limit,
            'can_accept_pos', COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, true),
            'can_reject_pending_manually', COALESCE((v_eff->'effective_access'->>'can_reject_pending_manually')::boolean, true)
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.employee_change_pin(
    p_employee_id   UUID,
    p_session_token TEXT,
    p_current_pin   TEXT,
    p_new_pin       TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_emp sawyan.cashier_employees%ROWTYPE;
    v_cur TEXT;
    v_new TEXT;
BEGIN
    v_emp := sawyan.verify_cashier_session(p_employee_id, p_session_token, true);
    v_cur := trim(COALESCE(p_current_pin, ''));
    v_new := trim(COALESCE(p_new_pin, ''));

    IF v_new !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
    END IF;
    IF v_cur = '' OR v_emp.pin_hash <> extensions.crypt(v_cur, v_emp.pin_hash) THEN
        RAISE EXCEPTION 'INVALID_CURRENT_PIN';
    END IF;
    IF v_new = v_cur THEN
        RAISE EXCEPTION 'NEW_PIN_MUST_DIFFER_FROM_TEMP';
    END IF;

    UPDATE sawyan.cashier_employees
       SET pin_hash            = extensions.crypt(v_new, extensions.gen_salt('bf', 10)),
           must_change_pin     = false,
           pin_changed_at      = now(),
           failed_pin_attempts = 0,
           pin_locked_until    = NULL
     WHERE id = v_emp.id;

    PERFORM sawyan.append_audit_log(
        'merchant', v_emp.merchant_id, 'employee_pin_changed_privately', 'cashier_employees', v_emp.id::text,
        jsonb_build_object('must_change_pin', v_emp.must_change_pin),
        jsonb_build_object('employee_code', v_emp.employee_code, 'must_change_pin', false, 'changed_at', now())
    );

    RETURN jsonb_build_object('success', true, 'must_change_pin', false, 'employee_id', v_emp.id);
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.employee_lock_session(
    p_employee_id   UUID,
    p_session_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_tok_hash TEXT;
BEGIN
    IF p_employee_id IS NULL OR NULLIF(trim(COALESCE(p_session_token, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', true, 'locked', true);
    END IF;
    v_tok_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');
    UPDATE sawyan.cashier_employees
       SET session_token_hash     = NULL,
           session_expires_at     = NULL,
           session_last_active_at = NULL
     WHERE id = p_employee_id
       AND session_token_hash = v_tok_hash;

    RETURN jsonb_build_object('success', true, 'locked', true);
END;
$$;

-- ============================================================================
-- 4. Isolated Employee Verification Bundle, Member Lookup, Decision & Creation
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_employee_verification_bundle(
    p_employee_id   UUID,
    p_session_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_emp          sawyan.cashier_employees%ROWTYPE;
    v_merch        sawyan.merchants%ROWTYPE;
    v_branch       sawyan.merchant_branches%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_settings     sawyan.settings%ROWTYPE;
    v_eff          JSONB;
    v_fx           NUMERIC(18,6) := 1.0;
    v_reconf_local NUMERIC(18,2) := 0.00;
    v_day_start    TIMESTAMPTZ;
BEGIN
    v_emp := sawyan.verify_cashier_session(p_employee_id, p_session_token, false);

    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_emp.merchant_id;
    SELECT * INTO v_branch  FROM sawyan.merchant_branches WHERE id = v_emp.branch_id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
    v_fx  := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
        THEN v_country.admin_fx_rate
        ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
    END;

    IF v_emp.pin_reconfirm_threshold IS NOT NULL AND v_emp.pin_reconfirm_threshold > 0 THEN
        v_reconf_local := v_emp.pin_reconfirm_threshold;
    ELSIF COALESCE(v_settings.employee_pin_reconfirm_usd, 0) > 0 THEN
        v_reconf_local := ROUND((v_settings.employee_pin_reconfirm_usd * v_fx)::numeric, 2);
    END IF;

    v_day_start := (date_trunc('day', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    -- Zero financial leakage: no balances, no commission_amount, no deduction_percent, no owner settings
    RETURN jsonb_build_object(
        'employee', jsonb_build_object(
            'id', v_emp.id,
            'employee_code', v_emp.employee_code,
            'full_name', v_emp.full_name,
            'merchant_id', v_merch.id,
            'merchant_code', v_merch.merchant_code,
            'business_name', v_merch.business_name,
            'branch_id', v_emp.branch_id,
            'branch_name', COALESCE(v_branch.branch_name, 'الفرع الرئيسي'),
            'currency_code', COALESCE(v_country.currency_code, 'EGP'),
            'max_tx_amount_limit', v_emp.max_tx_amount_limit,
            'can_accept_pos', COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, true),
            'can_reject_pending_manually', COALESCE((v_eff->'effective_access'->>'can_reject_pending_manually')::boolean, true),
            'pos_lock_reason_ar', v_eff->>'pos_lock_reason_ar',
            'wifi_ssid', v_merch.metadata->>'wifi_ssid',
            'wifi_password', v_merch.metadata->>'wifi_password'
        ),
        'session_meta', jsonb_build_object(
            'session_expires_at', v_emp.session_expires_at,
            'shift_hours', COALESCE(v_settings.employee_shift_hours, 8),
            'idle_timeout_mins', COALESCE(v_settings.employee_idle_timeout_mins, 60),
            'live_poll_interval_secs', COALESCE(v_settings.live_poll_interval_secs, 8),
            'pin_reconfirm_threshold_local', v_reconf_local
        ),
        'pending_transactions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id,
                'sw_short_code', t.sw_short_code,
                'unique_payment_ref', t.unique_payment_ref,
                'status', t.status,
                'total_amount', t.total_amount,
                'currency_code', t.currency_code,
                'payment_type', t.payment_type,
                'receipt_media_url', t.receipt_media_url,
                'created_at', t.created_at,
                'member_code', m.member_code,
                'member_masked_name', sawyan.mask_member_display_name(m.full_name, m.member_code),
                'zero_hold_in_isolation', COALESCE((t.commission_snapshot->>'zero_hold_in_isolation')::boolean, false)
            ) ORDER BY t.created_at DESC)
            FROM sawyan.transactions t
            JOIN sawyan.members m ON m.id = t.member_id
            WHERE t.merchant_id = v_emp.merchant_id
              AND t.branch_id   = v_emp.branch_id
              AND t.status      = 'pending'
        ), '[]'::jsonb),
        'today_transactions', COALESCE((
            SELECT jsonb_agg(row_to_json(sub)) FROM (
                SELECT t.id, t.sw_short_code, t.status, t.total_amount,
                       t.currency_code, t.payment_type, t.completed_at, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       t.commission_snapshot->>'rejection_reason' AS rejection_reason
                  FROM sawyan.transactions t
                  JOIN sawyan.members m ON m.id = t.member_id
                 WHERE t.merchant_id = v_emp.merchant_id
                   AND t.cashier_employee_id = v_emp.id
                   AND COALESCE(t.completed_at, t.created_at) >= v_day_start
                   AND t.status IN ('completed', 'awaiting_merchant_topup', 'rejected')
                 ORDER BY COALESCE(t.completed_at, t.created_at) DESC
                 LIMIT 60
            ) sub
        ), '[]'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.employee_lookup_member(
    p_employee_id       UUID,
    p_session_token     TEXT,
    p_member_identifier TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_emp    sawyan.cashier_employees%ROWTYPE;
    v_merch  sawyan.merchants%ROWTYPE;
    v_cc     CHAR(2);
    v_raw    TEXT;
    v_digits TEXT;
    v_dial   TEXT;
    v_cand1  TEXT := NULL;
    v_cand2  TEXT := NULL;
    v_code   BIGINT := NULL;
    v_mem    sawyan.members%ROWTYPE;
BEGIN
    v_emp := sawyan.verify_cashier_session(p_employee_id, p_session_token, false);
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = v_emp.merchant_id;

    v_raw := trim(COALESCE(p_member_identifier, ''));
    IF v_raw = '' THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    IF v_raw ~* '^SAWYAN:MEMBER:' THEN
        v_digits := trim(split_part(v_raw, ':', 3));
        IF v_digits !~ '^[0-9]{1,12}$' THEN
            RETURN jsonb_build_object('found', false, 'reason', 'INVALID_QR_FORMAT');
        END IF;
        v_code := v_digits::bigint;
    ELSIF left(v_raw, 1) = '#' OR (v_raw ~ '^[0-9]{1,8}$' AND left(v_raw, 1) <> '0') THEN
        v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');
        IF v_digits !~ '^[0-9]{1,12}$' THEN
            RETURN jsonb_build_object('found', false);
        END IF;
        v_code := v_digits::bigint;
    END IF;

    IF v_code IS NOT NULL THEN
        IF v_code <= 0 THEN
            RETURN jsonb_build_object('found', false, 'reason', 'ROOT_NOT_ALLOWED_AT_POS');
        END IF;
        SELECT * INTO v_mem
          FROM sawyan.members
         WHERE member_code = v_code
           AND is_tombstone_banned = false
           AND status = 'active';
    ELSE
        v_digits := regexp_replace(v_raw, '[^0-9]', '', 'g');
        IF v_digits = '' THEN
            RETURN jsonb_build_object('found', false);
        END IF;

        SELECT country_code INTO v_cc FROM sawyan.countries WHERE id = v_merch.country_id;
        v_dial := CASE v_cc
            WHEN 'EG' THEN '+20'
            WHEN 'TR' THEN '+90'
            WHEN 'SA' THEN '+966'
            WHEN 'AE' THEN '+971'
            WHEN 'DE' THEN '+49'
            WHEN 'US' THEN '+1'
            ELSE '+20'
        END;

        IF left(v_raw, 1) = '+' THEN
            v_cand1 := '+' || v_digits;
        ELSIF left(v_digits, 1) = '0' THEN
            v_cand1 := v_dial || substr(v_digits, 2);
            v_cand2 := '+' || v_digits;
        ELSE
            v_cand1 := '+' || v_digits;
            v_cand2 := v_dial || v_digits;
            IF length(v_digits) <= 12 THEN
                v_code := v_digits::bigint;
            END IF;
        END IF;

        IF v_code IS NOT NULL AND v_code <= 0 THEN
            RETURN jsonb_build_object('found', false, 'reason', 'ROOT_NOT_ALLOWED_AT_POS');
        END IF;

        SELECT * INTO v_mem
          FROM sawyan.members m
         WHERE m.is_tombstone_banned = false
           AND m.status = 'active'
           AND (
               (v_code IS NOT NULL AND m.member_code = v_code)
               OR (v_cand1 IS NOT NULL AND m.phone = v_cand1)
               OR (v_cand2 IS NOT NULL AND m.phone = v_cand2)
           )
         LIMIT 1;
    END IF;

    IF NOT FOUND OR v_mem.member_code <= 0 THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'member_code', v_mem.member_code,
        'masked_name', sawyan.mask_member_display_name(v_mem.full_name, v_mem.member_code)
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.employee_decide_pending_tx(
    p_employee_id      UUID,
    p_session_token    TEXT,
    p_transaction_id   UUID,
    p_decision         VARCHAR(20),
    p_rejection_reason TEXT DEFAULT NULL,
    p_reconfirm_pin    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_emp          sawyan.cashier_employees%ROWTYPE;
    v_merch        sawyan.merchants%ROWTYPE;
    v_branch       sawyan.merchant_branches%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_settings     sawyan.settings%ROWTYPE;
    v_tx           sawyan.transactions%ROWTYPE;
    v_eff          JSONB;
    v_dec          VARCHAR(20);
    v_feed         JSONB;
    v_release_hold NUMERIC(18,6);
    v_reason       TEXT;
    v_fx           NUMERIC(18,6) := 1.0;
    v_reconf_local NUMERIC(18,2) := 0.00;
    v_deadline     TIMESTAMPTZ;
BEGIN
    v_emp := sawyan.verify_cashier_session(p_employee_id, p_session_token, false);
    v_dec := lower(trim(COALESCE(p_decision, '')));

    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_emp.merchant_id;
    SELECT * INTO v_branch  FROM sawyan.merchant_branches WHERE id = v_emp.branch_id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    -- Lock row atomically & enforce branch isolation
    SELECT * INTO v_tx
      FROM sawyan.transactions
     WHERE id = p_transaction_id
       AND merchant_id = v_emp.merchant_id
       AND branch_id   = v_emp.branch_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_TX_NOT_FOUND';
    END IF;
    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'TX_ALREADY_PROCESSED: %', v_tx.status;
    END IF;

    IF v_dec = 'approve' THEN
        IF v_emp.linked_member_id IS NOT NULL AND v_emp.linked_member_id = v_tx.member_id THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
            VALUES ('merchant', v_merch.id, 'CashierSelfPinBlocked', 'in_app',
                    jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'employee_id', v_emp.id, 'employee_code', v_emp.employee_code));
            RAISE EXCEPTION 'CASHIER_SELF_APPROVAL_FORBIDDEN';
        END IF;

        IF v_emp.max_tx_amount_limit IS NOT NULL AND v_tx.total_amount > v_emp.max_tx_amount_limit THEN
            RAISE EXCEPTION 'CASHIER_TX_LIMIT_EXCEEDED: max=%', v_emp.max_tx_amount_limit;
        END IF;

        -- Future-ready Big-Invoice PIN Reconfirmation hook (default 0 = disabled)
        v_fx := CASE
            WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
                 AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
            THEN v_country.admin_fx_rate
            ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
        END;
        IF v_emp.pin_reconfirm_threshold IS NOT NULL AND v_emp.pin_reconfirm_threshold > 0 THEN
            v_reconf_local := v_emp.pin_reconfirm_threshold;
        ELSIF COALESCE(v_settings.employee_pin_reconfirm_usd, 0) > 0 THEN
            v_reconf_local := ROUND((v_settings.employee_pin_reconfirm_usd * v_fx)::numeric, 2);
        END IF;
        IF v_reconf_local > 0 AND v_tx.total_amount >= v_reconf_local THEN
            IF NULLIF(trim(COALESCE(p_reconfirm_pin, '')), '') IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'EMPLOYEE_PIN_RECONFIRM_REQUIRED',
                    'threshold', v_reconf_local
                );
            END IF;
            IF v_emp.pin_hash <> extensions.crypt(trim(p_reconfirm_pin), v_emp.pin_hash) THEN
                RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CASHIER_PIN');
            END IF;
        END IF;

        v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
        IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) THEN
            IF (v_eff->>'financial_status') = 'locked_queue_full' THEN
                RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merch.id;
            ELSE
                RAISE EXCEPTION 'MERCHANT_INACTIVE';
            END IF;
        END IF;

        UPDATE sawyan.transactions
           SET cashier_employee_id = v_emp.id
         WHERE id = v_tx.id;

        v_feed := sawyan.feed_monthly_target_box(v_tx.id, v_merch.id);

        -- Member sees store name ONLY (never employee name)
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceApproved', 'in_app',
                jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'merchant_name', v_merch.business_name));

        -- Owner receives real-time audit alert with employee identity
        IF COALESCE(v_emp.notify_owner_realtime, true) THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
            VALUES ('merchant', v_merch.id, 'EmployeeApprovedPendingTx', 'in_app',
                    jsonb_build_object(
                        'transaction_id', v_tx.id,
                        'sw_short_code', v_tx.sw_short_code,
                        'amount', v_tx.total_amount,
                        'currency_code', v_tx.currency_code,
                        'employee_id', v_emp.id,
                        'employee_code', v_emp.employee_code,
                        'employee_name', v_emp.full_name,
                        'branch_name', COALESCE(v_branch.branch_name, 'الفرع الرئيسي'),
                        'status', COALESCE(v_feed->>'status', 'completed')
                    ));
        END IF;

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'employee_pending_tx_approved', 'transactions', v_tx.id::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('employee_id', v_emp.id, 'employee_code', v_emp.employee_code, 'status', COALESCE(v_feed->>'status', 'completed'))
        );

        RETURN jsonb_build_object(
            'success', true,
            'decision', 'approved',
            'transaction_id', v_tx.id,
            'sw_short_code', v_tx.sw_short_code,
            'status', COALESCE(v_feed->>'status', 'completed')
        );

    ELSIF v_dec = 'reject' THEN
        v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
        IF NOT COALESCE((v_eff->'effective_access'->>'can_reject_pending_manually')::boolean, true) THEN
            RAISE EXCEPTION 'MERCHANT_MANUAL_REJECT_REVOKED_D2';
        END IF;

        v_reason   := COALESCE(NULLIF(trim(COALESCE(p_rejection_reason, '')), ''), 'بيانات الفاتورة غير مطابقة');
        v_deadline := now() + interval '48 hours';

        v_release_hold := COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, 0.00);
        IF v_release_hold > 0 THEN
            UPDATE sawyan.merchants
               SET soft_hold_balance = GREATEST(0, soft_hold_balance - v_release_hold)
             WHERE id = v_merch.id;
        END IF;

        UPDATE sawyan.transactions
           SET status              = 'rejected',
               cashier_employee_id = v_emp.id,
               commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object(
                   'soft_hold_amount', 0.00,
                   'rejected_by_employee_id', v_emp.id,
                   'rejected_by_employee_code', v_emp.employee_code,
                   'rejected_by_employee_name', v_emp.full_name,
                   'rejection_reason', v_reason,
                   'rejected_at', now(),
                   'owner_override_deadline', v_deadline
               )
         WHERE id = v_tx.id;

        PERFORM sawyan.sync_merchant_status_flags(v_merch.id);

        -- Member sees store name + reason ONLY (employee identity hidden from member)
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                jsonb_build_object(
                    'transaction_id', v_tx.id,
                    'sw_short_code', v_tx.sw_short_code,
                    'merchant_name', v_merch.business_name,
                    'reason', v_reason
                ));

        -- Owner receives immediate alert with employee identity + 48h override window
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('merchant', v_merch.id, 'EmployeeRejectedPendingTx', 'in_app',
                jsonb_build_object(
                    'transaction_id', v_tx.id,
                    'sw_short_code', v_tx.sw_short_code,
                    'amount', v_tx.total_amount,
                    'currency_code', v_tx.currency_code,
                    'employee_id', v_emp.id,
                    'employee_code', v_emp.employee_code,
                    'employee_name', v_emp.full_name,
                    'branch_name', COALESCE(v_branch.branch_name, 'الفرع الرئيسي'),
                    'reason', v_reason,
                    'owner_override_deadline', v_deadline
                ));

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'employee_pending_tx_rejected', 'transactions', v_tx.id::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'rejected', 'employee_id', v_emp.id, 'employee_code', v_emp.employee_code, 'reason', v_reason)
        );

        RETURN jsonb_build_object('success', true, 'decision', 'rejected', 'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code);
    ELSE
        RAISE EXCEPTION 'INVALID_DECISION_USE_APPROVE_OR_REJECT';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.employee_create_verification_tx(
    p_employee_id        UUID,
    p_session_token      TEXT,
    p_member_code        BIGINT,
    p_amount             NUMERIC(18,2),
    p_payment_type       VARCHAR(30) DEFAULT 'cash',
    p_idempotency_key    UUID DEFAULT NULL,
    p_unique_payment_ref VARCHAR(120) DEFAULT NULL,
    p_receipt_media_url  TEXT DEFAULT NULL,
    p_reconfirm_pin      TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_emp          sawyan.cashier_employees%ROWTYPE;
    v_merch        sawyan.merchants%ROWTYPE;
    v_branch       sawyan.merchant_branches%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_settings     sawyan.settings%ROWTYPE;
    v_mem          sawyan.members%ROWTYPE;
    v_idem         UUID;
    v_short_code   VARCHAR(20);
    v_pay_ref      VARCHAR(120);
    v_pay_type     VARCHAR(30);
    v_clean_rec    TEXT;
    v_fx           NUMERIC(18,6) := 1.0;
    v_reconf_local NUMERIC(18,2) := 0.00;
    v_pos_res      JSONB;
BEGIN
    v_emp := sawyan.verify_cashier_session(p_employee_id, p_session_token, false);

    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_emp.merchant_id;
    SELECT * INTO v_branch  FROM sawyan.merchant_branches WHERE id = v_emp.branch_id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    IF p_member_code IS NULL OR p_member_code <= 0 THEN
        RAISE EXCEPTION 'VALID_MEMBER_CODE_REQUIRED';
    END IF;
    SELECT * INTO v_mem
      FROM sawyan.members
     WHERE member_code = p_member_code
       AND is_tombstone_banned = false
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBER_NOT_FOUND_OR_INACTIVE';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'POSITIVE_INVOICE_AMOUNT_REQUIRED';
    END IF;

    IF v_emp.max_tx_amount_limit IS NOT NULL AND p_amount > v_emp.max_tx_amount_limit THEN
        RAISE EXCEPTION 'CASHIER_TX_LIMIT_EXCEEDED: max=%', v_emp.max_tx_amount_limit;
    END IF;

    -- Future-ready Big-Invoice PIN Reconfirmation hook (default 0 = disabled)
    v_fx := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
        THEN v_country.admin_fx_rate
        ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
    END;
    IF v_emp.pin_reconfirm_threshold IS NOT NULL AND v_emp.pin_reconfirm_threshold > 0 THEN
        v_reconf_local := v_emp.pin_reconfirm_threshold;
    ELSIF COALESCE(v_settings.employee_pin_reconfirm_usd, 0) > 0 THEN
        v_reconf_local := ROUND((v_settings.employee_pin_reconfirm_usd * v_fx)::numeric, 2);
    END IF;
    IF v_reconf_local > 0 AND p_amount >= v_reconf_local THEN
        IF NULLIF(trim(COALESCE(p_reconfirm_pin, '')), '') IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'EMPLOYEE_PIN_RECONFIRM_REQUIRED',
                'threshold', v_reconf_local
            );
        END IF;
        IF v_emp.pin_hash <> extensions.crypt(trim(p_reconfirm_pin), v_emp.pin_hash) THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'INVALID_CASHIER_PIN');
        END IF;
    END IF;

    v_clean_rec := sawyan.validate_attachment_data(p_receipt_media_url, 480000, true);
    v_idem      := COALESCE(p_idempotency_key, gen_random_uuid());
    v_short_code := 'SW-' || upper(substr(replace(v_idem::text, '-', ''), 1, 6));
    v_pay_ref    := COALESCE(NULLIF(trim(COALESCE(p_unique_payment_ref, '')), ''), 'EMP-' || v_emp.employee_code || '-' || replace(v_idem::text, '-', ''));
    v_pay_type   := CASE lower(trim(COALESCE(p_payment_type, 'cash')))
        WHEN 'card' THEN 'pos_card'
        WHEN 'instapay' THEN 'instant_transfer'
        WHEN 'wallet' THEN 'digital_wallet'
        WHEN '' THEN 'cash'
        ELSE lower(trim(p_payment_type))
    END;

    v_pos_res := sawyan.submit_pos_transaction(
        v_mem.id,
        v_merch.id,
        v_emp.branch_id,
        p_amount,
        v_pay_type,
        v_pay_ref,
        v_short_code,
        v_idem,
        v_emp.id,
        true,
        v_clean_rec
    );

    IF COALESCE(v_pos_res->>'status', '') = 'rejected_self_cashier_pin' THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'CASHIER_SELF_APPROVAL_FORBIDDEN', 'status', 'rejected_self_cashier_pin');
    END IF;

    IF COALESCE(v_emp.notify_owner_realtime, true) THEN
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('merchant', v_merch.id, 'EmployeeCreatedVerificationTx', 'in_app',
                jsonb_build_object(
                    'transaction_id', v_pos_res->>'transaction_id',
                    'sw_short_code', v_short_code,
                    'amount', p_amount,
                    'currency_code', COALESCE(v_country.currency_code, 'EGP'),
                    'employee_id', v_emp.id,
                    'employee_code', v_emp.employee_code,
                    'employee_name', v_emp.full_name,
                    'branch_name', COALESCE(v_branch.branch_name, 'الفرع الرئيسي'),
                    'status', COALESCE(v_pos_res->>'status', 'completed')
                ));
    END IF;

    -- Isolated return (zero merchant balance/commission exposure)
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_pos_res->>'transaction_id',
        'sw_short_code', v_short_code,
        'status', COALESCE(v_pos_res->>'status', 'completed'),
        'total_amount', p_amount,
        'currency_code', COALESCE(v_country.currency_code, 'EGP'),
        'member_masked_name', sawyan.mask_member_display_name(v_mem.full_name, v_mem.member_code)
    );
END;
$$;

-- ============================================================================
-- 5. Upgraded submit_pos_transaction (dynamic max_pending + Soft Hold = 0 in 10% isolation)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.submit_pos_transaction(
    p_member_id           UUID,
    p_merchant_id         UUID,
    p_branch_id           UUID,
    p_amount              NUMERIC(18,2),
    p_payment_type        VARCHAR,
    p_unique_payment_ref  VARCHAR,
    p_sw_short_code       VARCHAR,
    p_idempotency_key     UUID,
    p_cashier_employee_id UUID DEFAULT NULL,
    p_is_instant_pin      BOOLEAN DEFAULT true,
    p_receipt_media_url   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing_idem    sawyan.idempotency_keys%ROWTYPE;
    v_merchant         sawyan.merchants%ROWTYPE;
    v_branch           sawyan.merchant_branches%ROWTYPE;
    v_country          sawyan.countries%ROWTYPE;
    v_settings         sawyan.settings%ROWTYPE;
    v_cashier          sawyan.cashier_employees%ROWTYPE;
    v_eff              JSONB;
    v_fin_status       VARCHAR(30);
    v_gov_status       VARCHAR(30);
    v_fx_rate          NUMERIC(18,6);
    v_comm_amt         NUMERIC(18,6);
    v_pending_cnt      INT;
    v_max_pending      INT;
    v_soft_hold_cap    NUMERIC(18,2);
    v_free_bal         NUMERIC(18,2);
    v_hold_amt         NUMERIC(18,6);
    v_zero_hold_iso    BOOLEAN := false;
    v_queue_cnt        INT;
    v_eff_q_cap        INT;
    v_pay_type         VARCHAR(30);
    v_clean_receipt    TEXT;
    v_tx_id            UUID;
    v_res              JSONB;
BEGIN
    v_pay_type := lower(trim(COALESCE(NULLIF(p_payment_type, ''), 'cash')));
    v_clean_receipt := sawyan.validate_attachment_data(p_receipt_media_url, 480000, true);

    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
    VALUES (p_idempotency_key, p_member_id, 'submit_pos_transaction', encode(extensions.digest(p_unique_payment_ref, 'sha256'), 'hex'))
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
        IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
            RETURN v_existing_idem.response_body;
        END IF;
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    v_eff := sawyan.compute_merchant_effective_state(v_merchant.id);
    v_fin_status := v_eff->>'financial_status';
    v_gov_status := v_eff->>'governance_status';
    v_eff_q_cap  := COALESCE((v_eff->>'effective_queue_cap')::int, 3);

    IF COALESCE(v_merchant.deduction_percent, 0) <= 0 THEN
        RAISE EXCEPTION 'MERCHANT_COMMISSION_NOT_SET_YET';
    END IF;
    IF v_merchant.onboarding_status <> 'approved' THEN
        RAISE EXCEPTION 'MERCHANT_ONBOARDING_INCOMPLETE';
    END IF;
    IF v_gov_status IN ('paused_by_merchant', 'paused_by_admin') THEN
        RAISE EXCEPTION 'MERCHANT_TEMPORARILY_PAUSED';
    END IF;
    IF v_gov_status IN ('suspended_compliance', 'banned_permanent') THEN
        RAISE EXCEPTION 'MERCHANT_COMPLIANCE_SUSPENDED';
    END IF;
    IF v_fin_status = 'unfunded' THEN
        RAISE EXCEPTION 'MERCHANT_UNFUNDED_TOPUP_REQUIRED';
    END IF;
    IF v_fin_status = 'locked_queue_full' THEN
        IF v_merchant.credit_limit > 0 THEN
            RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: D4_CREDIT_LOCKED merchant_id=%', v_merchant.id;
        ELSE
            RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
        END IF;
    END IF;
    IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    SELECT * INTO v_branch
      FROM sawyan.merchant_branches
     WHERE id = p_branch_id AND merchant_id = p_merchant_id AND is_branch_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_MERCHANT_BRANCH';
    END IF;

    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_merchant.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL) AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC LIMIT 1;

    v_fx_rate := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
        THEN v_country.admin_fx_rate
        ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
    END;
    v_comm_amt := ROUND((p_amount * (v_merchant.deduction_percent / 100.0))::numeric, 6);

    IF NOT p_is_instant_pin THEN
        v_max_pending := COALESCE(v_settings.max_pending_per_merchant, 2);

        SELECT COUNT(*) INTO v_pending_cnt
          FROM sawyan.transactions
         WHERE member_id = p_member_id
           AND merchant_id = p_merchant_id
           AND status = 'pending'
           AND COALESCE((commission_snapshot->>'merchant_initiated')::boolean, false) = false;
        IF v_pending_cnt >= v_max_pending THEN
            RAISE EXCEPTION 'MEMBER_PENDING_LIMIT_REACHED: Maximum % pending requests per merchant.', v_max_pending;
        END IF;

        IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pending_remote')::boolean, false) THEN
            -- Inside 10% isolation zone: allow zero-hold request if enabled by Admin settings
            IF COALESCE(v_settings.allow_zero_hold_in_isolation, true) IS TRUE
               AND COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) IS TRUE
            THEN
                v_hold_amt      := 0.00;
                v_zero_hold_iso := true;
            ELSE
                RAISE EXCEPTION 'MERCHANT_ISOLATED_PENDING_BLOCKED';
            END IF;
        ELSE
            v_soft_hold_cap := ROUND((GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit) * (v_settings.unconfirmed_soft_hold_cap_pct / 100.0))::numeric, 2);
            IF (v_merchant.soft_hold_balance + v_comm_amt) > v_soft_hold_cap THEN
                RAISE EXCEPTION 'MERCHANT_SOFT_HOLD_CAP_20PCT_EXCEEDED';
            END IF;
            v_hold_amt := v_comm_amt;
        END IF;

        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url,
            soft_hold_expires_at, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, v_pay_type, 'pending', v_clean_receipt,
            now() + (COALESCE(v_settings.pending_sla_hours, 48) || ' hours')::interval,
            jsonb_build_object(
                'deduction_percent', v_merchant.deduction_percent,
                'company_percent', v_settings.company_percent,
                'merchant_initiated', false,
                'soft_hold_amount', v_hold_amt,
                'zero_hold_in_isolation', v_zero_hold_iso
            )
        ) RETURNING id INTO v_tx_id;

        IF v_hold_amt > 0 THEN
            UPDATE sawyan.merchants
               SET soft_hold_balance = soft_hold_balance + v_hold_amt
             WHERE id = v_merchant.id;
        END IF;

        PERFORM sawyan.sync_merchant_status_flags(v_merchant.id);
        v_res := jsonb_build_object(
            'transaction_id', v_tx_id,
            'status', 'pending',
            'soft_hold_added', v_hold_amt,
            'zero_hold_in_isolation', v_zero_hold_iso
        );

    ELSIF v_pay_type IN ('cod', 'cheque') THEN
        IF p_cashier_employee_id IS NOT NULL THEN
            SELECT * INTO v_cashier FROM sawyan.cashier_employees WHERE id = p_cashier_employee_id;
            IF FOUND THEN
                IF v_cashier.linked_member_id IS NOT NULL AND v_cashier.linked_member_id = p_member_id THEN
                    INSERT INTO sawyan.transactions (
                        member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
                        unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
                        currency_code, fx_rate_used, payment_type, status, receipt_media_url, commission_snapshot
                    ) VALUES (
                        p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
                        p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
                        v_country.currency_code, v_fx_rate, v_pay_type, 'rejected', v_clean_receipt,
                        jsonb_build_object('deduction_percent', v_merchant.deduction_percent, 'company_percent', v_settings.company_percent, 'merchant_initiated', true, 'deferred_clearance', true, 'soft_hold_amount', 0.00)
                    ) RETURNING id INTO v_tx_id;

                    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                    VALUES ('merchant', v_merchant.id, 'CashierSelfPinBlocked', 'in_app',
                            jsonb_build_object('transaction_id', v_tx_id, 'employee_id', v_cashier.id, 'employee_code', v_cashier.employee_code));

                    v_res := jsonb_build_object('status', 'rejected_self_cashier_pin', 'transaction_id', v_tx_id, 'notified_merchant', true);
                    UPDATE sawyan.idempotency_keys SET response_status = 200, response_body = v_res WHERE idempotency_key = p_idempotency_key;
                    RETURN v_res;
                END IF;

                IF v_cashier.max_tx_amount_limit IS NOT NULL AND p_amount > v_cashier.max_tx_amount_limit THEN
                    RAISE EXCEPTION 'CASHIER_TX_LIMIT_EXCEEDED';
                END IF;
            END IF;
        END IF;

        v_free_bal := v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit;
        IF v_free_bal >= v_comm_amt THEN
            v_hold_amt := v_comm_amt;
            UPDATE sawyan.merchants
               SET soft_hold_balance = soft_hold_balance + v_hold_amt
             WHERE id = v_merchant.id;
        ELSE
            SELECT COUNT(*) INTO v_queue_cnt
              FROM sawyan.transactions
             WHERE merchant_id = v_merchant.id
               AND (
                   status = 'awaiting_merchant_topup'
                   OR (
                       status = 'pending'
                       AND COALESCE((commission_snapshot->>'soft_hold_amount')::numeric, 0) = 0
                       AND COALESCE((commission_snapshot->>'deferred_clearance')::boolean, false) = true
                   )
               );
            IF v_queue_cnt >= v_eff_q_cap THEN
                RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
            END IF;
            v_hold_amt := 0.00;
        END IF;

        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url,
            soft_hold_expires_at, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, v_pay_type, 'pending', v_clean_receipt,
            now() + interval '30 days',
            jsonb_build_object(
                'deduction_percent', v_merchant.deduction_percent,
                'company_percent', v_settings.company_percent,
                'merchant_initiated', true,
                'deferred_clearance', true,
                'soft_hold_amount', v_hold_amt
            )
        ) RETURNING id INTO v_tx_id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES
            ('merchant', v_merchant.id, 'DeferredSaleCreated', 'in_app',
             jsonb_build_object('transaction_id', v_tx_id, 'sw_short_code', p_sw_short_code, 'payment_type', v_pay_type, 'amount', p_amount, 'currency_code', v_country.currency_code),
             sawyan.now_utc()),
            ('member', p_member_id, 'DeferredSaleCreated', 'in_app',
             jsonb_build_object('transaction_id', v_tx_id, 'sw_short_code', p_sw_short_code, 'payment_type', v_pay_type, 'amount', p_amount, 'currency_code', v_country.currency_code),
             sawyan.now_utc());

        PERFORM sawyan.sync_merchant_status_flags(v_merchant.id);
        v_res := jsonb_build_object(
            'transaction_id', v_tx_id,
            'status', 'pending',
            'deferred_clearance', true,
            'soft_hold_added', v_hold_amt
        );

    ELSE
        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, v_pay_type, 'pending', v_clean_receipt,
            jsonb_build_object(
                'deduction_percent', v_merchant.deduction_percent,
                'company_percent', v_settings.company_percent,
                'merchant_initiated', true,
                'soft_hold_amount', 0.00
            )
        ) RETURNING id INTO v_tx_id;

        v_res := sawyan.feed_monthly_target_box(v_tx_id, p_member_id) || jsonb_build_object('transaction_id', v_tx_id);
    END IF;

    UPDATE sawyan.idempotency_keys
       SET response_status = 200, response_body = v_res
     WHERE idempotency_key = p_idempotency_key;

    RETURN v_res;
END;
$$;

-- ============================================================================
-- 6. Unified Member Purchase Verification Request (1 Flow, Optional Receipt, Anti-Spam Guard)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.submit_member_pending_purchase(
    p_member_id          UUID,
    p_merchant_id        UUID,
    p_branch_id          UUID,
    p_amount             NUMERIC(18,2),
    p_payment_type       VARCHAR DEFAULT 'cash',
    p_idempotency_key    UUID DEFAULT NULL,
    p_session_token      TEXT DEFAULT NULL,
    p_receipt_url        TEXT DEFAULT NULL,
    p_unique_payment_ref VARCHAR DEFAULT NULL,
    p_employee_code      VARCHAR DEFAULT NULL,
    p_cashier_pin        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member         sawyan.members%ROWTYPE;
    v_merchant       sawyan.merchants%ROWTYPE;
    v_settings       sawyan.settings%ROWTYPE;
    v_eff            JSONB;
    v_fin_status     VARCHAR(30);
    v_gov_status     VARCHAR(30);
    v_idem           UUID;
    v_branch_id      UUID;
    v_short_code     VARCHAR(24);
    v_ref            VARCHAR(128);
    v_pay_type       VARCHAR(30);
    v_clean_rec      TEXT;
    v_spam_thresh    INT;
    v_spam_win_hrs   INT;
    v_spam_req_hrs   INT;
    v_rej_cnt        INT := 0;
    v_last_rej_at    TIMESTAMPTZ;
    v_res            JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PURCHASE_AMOUNT';
    END IF;

    -- Security Hardening (Stage 14): Cashier PIN is strictly forbidden on customer phones
    IF NULLIF(trim(COALESCE(p_employee_code, '')), '') IS NOT NULL
       OR NULLIF(trim(COALESCE(p_cashier_pin, '')), '') IS NOT NULL
    THEN
        RAISE EXCEPTION 'CASHIER_PIN_ONLY_ON_EMPLOYEE_OR_MERCHANT_DEVICE';
    END IF;

    v_pay_type := CASE lower(trim(COALESCE(p_payment_type, 'cash')))
        WHEN 'card' THEN 'pos_card'
        WHEN 'instapay' THEN 'instant_transfer'
        WHEN 'wallet' THEN 'digital_wallet'
        WHEN '' THEN 'cash'
        ELSE lower(trim(p_payment_type))
    END;
    IF v_pay_type NOT IN (
        'cash', 'pos_card', 'instant_transfer', 'iban_swift_sepa', 'digital_wallet',
        'payment_gateway', 'bnpl', 'cheque', 'cod', 'marketplace_escrow'
    ) THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_TYPE: %', p_payment_type;
    END IF;

    v_clean_rec := sawyan.validate_attachment_data(p_receipt_url, 480000, true);

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    v_eff        := sawyan.compute_merchant_effective_state(v_merchant.id);
    v_fin_status := v_eff->>'financial_status';
    v_gov_status := v_eff->>'governance_status';

    IF COALESCE(v_merchant.deduction_percent, 0) <= 0 THEN
        RAISE EXCEPTION 'MERCHANT_COMMISSION_NOT_SET_YET';
    END IF;
    IF v_merchant.onboarding_status <> 'approved' THEN
        RAISE EXCEPTION 'MERCHANT_ONBOARDING_INCOMPLETE';
    END IF;
    IF v_gov_status IN ('paused_by_merchant', 'paused_by_admin') THEN
        RAISE EXCEPTION 'MERCHANT_TEMPORARILY_PAUSED';
    END IF;
    IF v_gov_status IN ('suspended_compliance', 'banned_permanent') THEN
        RAISE EXCEPTION 'MERCHANT_COMPLIANCE_SUSPENDED';
    END IF;
    IF v_fin_status = 'unfunded' THEN
        RAISE EXCEPTION 'MERCHANT_UNFUNDED_TOPUP_REQUIRED';
    END IF;
    IF v_fin_status = 'locked_queue_full' THEN
        RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE id = p_branch_id AND merchant_id = p_merchant_id AND is_branch_active = true;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_MERCHANT_BRANCH';
        END IF;
    ELSE
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE merchant_id = p_merchant_id AND is_branch_active = true
         ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'NO_ACTIVE_MERCHANT_BRANCH';
        END IF;
    END IF;

    -- Hidden Admin-Configurable Anti-Spam Guard (zero friction for honest members)
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_spam_thresh  := COALESCE(v_settings.spam_reject_threshold, 2);
    v_spam_win_hrs := COALESCE(v_settings.spam_reject_window_hours, 24);
    v_spam_req_hrs := COALESCE(v_settings.spam_require_receipt_hours, 24);

    IF v_clean_rec IS NULL AND v_spam_thresh > 0 THEN
        SELECT COUNT(*), MAX(COALESCE(NULLIF(commission_snapshot->>'rejected_at', '')::timestamptz, created_at))
          INTO v_rej_cnt, v_last_rej_at
          FROM sawyan.transactions
         WHERE merchant_id = p_merchant_id
           AND member_id   = v_member.id
           AND status      = 'rejected'
           AND receipt_media_url IS NULL
           AND COALESCE((commission_snapshot->>'cancelled_by_member')::boolean, false) = false
           AND COALESCE(NULLIF(commission_snapshot->>'rejected_at', '')::timestamptz, created_at) >= (now() - make_interval(hours => v_spam_win_hrs));

        IF v_rej_cnt >= v_spam_thresh
           AND v_last_rej_at IS NOT NULL
           AND v_last_rej_at >= (now() - make_interval(hours => v_spam_req_hrs))
        THEN
            RAISE EXCEPTION 'SPAM_GUARD_RECEIPT_REQUIRED: %', v_spam_req_hrs;
        END IF;
    END IF;

    v_idem       := COALESCE(p_idempotency_key, gen_random_uuid());
    v_short_code := 'SW-' || upper(substr(replace(v_idem::text, '-', ''), 1, 6));
    v_ref        := COALESCE(NULLIF(trim(COALESCE(p_unique_payment_ref, '')), ''), 'MBR-' || v_member.member_code || '-' || replace(v_idem::text, '-', ''));

    v_res := sawyan.submit_pos_transaction(
        v_member.id, p_merchant_id, v_branch_id,
        p_amount, v_pay_type, v_ref, v_short_code, v_idem, NULL, false, v_clean_rec
    );

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', p_merchant_id, 'PendingPurchaseRequested', 'in_app',
            jsonb_build_object(
                'transaction_id', v_res->>'transaction_id',
                'branch_id', v_branch_id,
                'sw_short_code', v_short_code,
                'amount', p_amount,
                'payment_type', v_pay_type,
                'member_code', v_member.member_code,
                'has_receipt', (v_clean_rec IS NOT NULL)
            ));

    RETURN v_res || jsonb_build_object('success', true, 'sw_short_code', v_short_code, 'mode', 'unified_pending');
END;
$$;

-- ============================================================================
-- 7. Upgraded confirm_or_reject_pending_tx (Owner PIN-free + 48h Override of Employee Rejection)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.confirm_or_reject_pending_tx(
    p_merchant_id      UUID,
    p_transaction_id   UUID,
    p_decision         VARCHAR(20),
    p_rejection_reason TEXT DEFAULT NULL,
    p_session_token    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_tx           sawyan.transactions%ROWTYPE;
    v_eff          JSONB;
    v_dec          VARCHAR(20);
    v_feed         JSONB;
    v_release_hold NUMERIC(18,6);
    v_reason       TEXT;
    v_is_override  BOOLEAN := false;
    v_deadline     TIMESTAMPTZ;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_dec   := lower(trim(COALESCE(p_decision, '')));

    SELECT * INTO v_tx
      FROM sawyan.transactions
     WHERE id = p_transaction_id AND merchant_id = v_merch.id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_TX_NOT_FOUND';
    END IF;

    IF v_dec = 'approve' THEN
        IF v_tx.status = 'rejected' THEN
            IF NULLIF(COALESCE(v_tx.commission_snapshot->>'rejected_by_employee_id', ''), '') IS NULL THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            v_deadline := COALESCE(
                NULLIF(v_tx.commission_snapshot->>'owner_override_deadline', '')::timestamptz,
                COALESCE(NULLIF(v_tx.commission_snapshot->>'rejected_at', '')::timestamptz, v_tx.created_at) + interval '48 hours'
            );
            IF now() > v_deadline THEN
                RAISE EXCEPTION 'OWNER_OVERRIDE_WINDOW_48H_EXPIRED';
            END IF;
            v_is_override := true;
        ELSIF v_tx.status <> 'pending' THEN
            RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
        END IF;

        v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
        IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) THEN
            IF (v_eff->>'financial_status') = 'locked_queue_full' THEN
                RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merch.id;
            ELSE
                RAISE EXCEPTION 'MERCHANT_INACTIVE';
            END IF;
        END IF;

        IF v_is_override THEN
            -- Restore cleanly to pending with soft_hold_amount = 0.00 so feed_monthly_target_box does not double-release hold
            UPDATE sawyan.transactions
               SET status              = 'pending',
                   cashier_employee_id = NULL,
                   commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object(
                       'soft_hold_amount', 0.00,
                       'owner_overrode_employee_rejection', true,
                       'owner_override_at', now()
                   )
             WHERE id = v_tx.id;
        END IF;

        v_feed := sawyan.feed_monthly_target_box(v_tx.id, v_merch.id);

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES (
            'member',
            v_tx.member_id,
            CASE WHEN v_is_override THEN 'PendingInvoiceApprovedByOwnerOverride' ELSE 'PendingInvoiceApproved' END,
            'in_app',
            jsonb_build_object(
                'transaction_id', v_tx.id,
                'sw_short_code', v_tx.sw_short_code,
                'merchant_name', v_merch.business_name,
                'owner_override', v_is_override
            )
        );

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id,
            CASE WHEN v_is_override THEN 'owner_overrode_employee_rejection' ELSE 'pending_tx_approved' END,
            'transactions', v_tx.id::text,
            jsonb_build_object('status', v_tx.status), v_feed
        );

        RETURN jsonb_build_object(
            'success', true,
            'decision', 'approved',
            'owner_override', v_is_override,
            'transaction_id', v_tx.id,
            'feed', v_feed,
            'result', v_feed
        );

    ELSIF v_dec = 'reject' THEN
        IF v_tx.status <> 'pending' THEN
            RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
        END IF;

        v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
        IF NOT COALESCE((v_eff->'effective_access'->>'can_reject_pending_manually')::boolean, true) THEN
            RAISE EXCEPTION 'MERCHANT_MANUAL_REJECT_REVOKED_D2';
        END IF;

        v_reason       := COALESCE(NULLIF(trim(COALESCE(p_rejection_reason, '')), ''), 'غير مطابق');
        v_release_hold := COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, 0.00);
        IF v_release_hold > 0 THEN
            UPDATE sawyan.merchants
               SET soft_hold_balance = GREATEST(0, soft_hold_balance - v_release_hold)
             WHERE id = v_merch.id;
        END IF;

        UPDATE sawyan.transactions
           SET status              = 'rejected',
               commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object(
                   'soft_hold_amount', 0.00,
                   'rejection_reason', v_reason,
                   'rejected_at', now()
               )
         WHERE id = v_tx.id;

        PERFORM sawyan.sync_merchant_status_flags(v_merch.id);

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                jsonb_build_object(
                    'transaction_id', v_tx.id,
                    'sw_short_code', v_tx.sw_short_code,
                    'merchant_name', v_merch.business_name,
                    'reason', v_reason
                ));

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'pending_tx_rejected', 'transactions', v_tx.id::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'rejected', 'reason', v_reason)
        );
        RETURN jsonb_build_object('success', true, 'decision', 'rejected', 'transaction_id', v_tx.id);
    ELSE
        RAISE EXCEPTION 'INVALID_DECISION_USE_APPROVE_OR_REJECT';
    END IF;
END;
$$;

-- ============================================================================
-- 8. Upgraded manage_merchant_cashier_and_settings (Forced PIN Change, Instant Revocation & Audit)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.manage_merchant_cashier_and_settings(
    p_merchant_id        UUID,
    p_action             VARCHAR(30),
    p_session_token      TEXT DEFAULT NULL,
    p_business_name      VARCHAR(180) DEFAULT NULL,
    p_owner_name         VARCHAR(150) DEFAULT NULL,
    p_phone              VARCHAR(24) DEFAULT NULL,
    p_address            TEXT DEFAULT NULL,
    p_latitude           NUMERIC(9,6) DEFAULT NULL,
    p_longitude          NUMERIC(9,6) DEFAULT NULL,
    p_wifi_ssid          TEXT DEFAULT NULL,
    p_wifi_password      TEXT DEFAULT NULL,
    p_working_hours      TEXT DEFAULT NULL,
    p_current_password   TEXT DEFAULT NULL,
    p_new_password       TEXT DEFAULT NULL,
    p_employee_code      VARCHAR(30) DEFAULT NULL,
    p_employee_name      VARCHAR(150) DEFAULT NULL,
    p_employee_pin       TEXT DEFAULT NULL,
    p_linked_member_code BIGINT DEFAULT NULL,
    p_max_tx_limit       NUMERIC(18,2) DEFAULT NULL,
    p_employee_id        UUID DEFAULT NULL,
    p_branch_id          UUID DEFAULT NULL,
    p_media_patch        JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch       sawyan.merchants%ROWTYPE;
    v_country     sawyan.countries%ROWTYPE;
    v_main_br_id  UUID;
    v_act         VARCHAR(30);
    v_linked_mid  UUID := NULL;
    v_new_emp_id  UUID;
    v_emp_code    VARCHAR(30);
    v_emp_seq     INT;
    v_emp_phone   VARCHAR(24);
    v_notify_rt   BOOLEAN := true;
    v_meta_patch  JSONB := '{}'::jsonb;
    v_logo        TEXT;
    v_cover       TEXT;
    v_img_arr     JSONB := '[]'::jsonb;
    v_img_item    TEXT;
    v_img_cnt     INT := 0;
    v_kyc_obj     JSONB := '{}'::jsonb;
    v_k_key       TEXT;
    v_k_val       TEXT;
    v_new_ded     NUMERIC(5,2) := NULL;
    v_new_type    VARCHAR(20) := NULL;
    v_new_cat     VARCHAR(60) := NULL;
    v_new_email   VARCHAR(255) := NULL;
    v_new_phone   VARCHAR(24) := NULL;
    v_city_gid    BIGINT := NULL;
    v_new_tax_id  VARCHAR(64) := NULL;
    v_eff         JSONB;
    v_portal_mode VARCHAR(30);
    v_prof_eval   JSONB;
    v_pause_note  TEXT;
    v_prev_gov    VARCHAR(30);
    v_target_emp  sawyan.cashier_employees%ROWTYPE;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    v_act := lower(trim(COALESCE(p_action, 'update_profile')));
    v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
    v_portal_mode := COALESCE(v_eff->'effective_access'->>'portal_access_mode', 'full');

    SELECT id INTO v_main_br_id
      FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    IF v_act = 'toggle_merchant_pause' THEN
        v_pause_note := COALESCE(
            NULLIF(trim(COALESCE(p_media_patch->>'pause_reason', '')), ''),
            NULLIF(trim(COALESCE(p_working_hours, '')), '')
        );
        IF v_merch.governance_status = 'paused_by_merchant' THEN
            v_prev_gov := COALESCE(v_merch.pre_pause_governance_status, 'good_standing');
            UPDATE sawyan.merchants
               SET governance_status           = v_prev_gov,
                   pre_pause_governance_status = NULL,
                   governance_reason           = COALESCE(v_pause_note, 'استئناف نشاط المتجر بعد الإجازة المؤقتة'),
                   governance_updated_at       = now()
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        ELSIF v_merch.governance_status IN ('good_standing', 'probation_warning') THEN
            UPDATE sawyan.merchants
               SET pre_pause_governance_status = v_merch.governance_status,
                   governance_status           = 'paused_by_merchant',
                   governance_reason           = COALESCE(v_pause_note, 'إجازة / إغلاق مؤقت بطلب التاجر'),
                   governance_updated_at       = now()
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        ELSE
            RAISE EXCEPTION 'MERCHANT_CANNOT_SELF_PAUSE_UNDER_SANCTION: %', v_merch.governance_status;
        END IF;

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'merchant_pause_toggled', 'merchants', v_merch.id::text,
            NULL, jsonb_build_object('governance_status', v_merch.governance_status, 'reason', v_merch.governance_reason)
        );
        v_eff := sawyan.sync_merchant_status_flags(v_merch.id);
        RETURN jsonb_build_object(
            'success', true,
            'action', 'toggle_merchant_pause',
            'governance_status', v_eff->>'governance_status',
            'pre_pause_governance_status', v_eff->>'pre_pause_governance_status',
            'effective_access', v_eff->'effective_access'
        );
    END IF;

    IF v_act IN ('update_profile', 'update_media') THEN
        IF v_act = 'update_profile' THEN
            IF p_wifi_ssid IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('wifi_ssid', trim(p_wifi_ssid), 'wifi_password', COALESCE(p_wifi_password, ''));
            END IF;
            IF p_working_hours IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('working_hours', trim(p_working_hours));
            END IF;
            IF p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
                v_new_phone := sawyan.validate_and_normalize_e164_phone(v_country.country_code, p_phone);
            END IF;
            IF NULLIF(trim(COALESCE(p_address, '')), '') IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('address_is_fallback', false);
            END IF;
            IF (p_latitude IS NOT NULL AND p_longitude IS NOT NULL) THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('geo_is_fallback', false);
            END IF;
            IF NULLIF(trim(COALESCE(p_new_password, '')), '') IS NOT NULL THEN
                IF char_length(p_new_password) < 8 OR lower(trim(p_new_password)) IN ('123456', '12345678', 'password') THEN
                    RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN';
                END IF;
                IF v_merch.password_hash IS NOT NULL AND (p_current_password IS NULL OR v_merch.password_hash <> extensions.crypt(p_current_password, v_merch.password_hash)) THEN
                    RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
                END IF;
                UPDATE sawyan.merchants SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)) WHERE id = v_merch.id;
            END IF;
        END IF;

        IF p_media_patch IS NOT NULL AND jsonb_typeof(p_media_patch) = 'object' THEN
            IF p_media_patch ? 'logo_url' THEN
                IF trim(COALESCE(p_media_patch->>'logo_url', '')) = '' THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('logo_url', NULL);
                ELSE
                    v_logo := sawyan.validate_attachment_data(p_media_patch->>'logo_url', 200000, true);
                    v_meta_patch := v_meta_patch || jsonb_build_object('logo_url', v_logo);
                END IF;
            END IF;
            IF p_media_patch ? 'cover_image_url' THEN
                IF trim(COALESCE(p_media_patch->>'cover_image_url', '')) = '' THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('cover_image_url', NULL);
                ELSE
                    v_cover := sawyan.validate_attachment_data(p_media_patch->>'cover_image_url', 480000, true);
                    v_meta_patch := v_meta_patch || jsonb_build_object('cover_image_url', v_cover);
                END IF;
            END IF;
            IF p_media_patch ? 'images' AND jsonb_typeof(p_media_patch->'images') = 'array' THEN
                FOR v_img_item IN SELECT elem #>> '{}' FROM jsonb_array_elements(p_media_patch->'images') elem LOOP
                    IF v_img_cnt >= 6 THEN EXIT; END IF;
                    v_img_item := sawyan.validate_attachment_data(v_img_item, 350000, true);
                    IF v_img_item IS NOT NULL THEN
                        v_img_arr := v_img_arr || to_jsonb(v_img_item);
                        v_img_cnt := v_img_cnt + 1;
                    END IF;
                END LOOP;
                v_meta_patch := v_meta_patch || jsonb_build_object('images', v_img_arr);
            END IF;
            IF p_media_patch ? 'kyc_docs' AND jsonb_typeof(p_media_patch->'kyc_docs') = 'object' THEN
                v_kyc_obj := COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb);
                FOR v_k_key, v_k_val IN SELECT key, value FROM jsonb_each_text(p_media_patch->'kyc_docs') LOOP
                    IF v_k_key IN ('commercial_reg', 'tax_card', 'owner_id', 'store_license', 'storefront_photo') THEN
                        v_k_val := sawyan.validate_attachment_data(v_k_val, 480000, true);
                        IF v_k_val IS NOT NULL THEN
                            v_kyc_obj := v_kyc_obj || jsonb_build_object(v_k_key, v_k_val);
                        END IF;
                    END IF;
                END LOOP;
                v_meta_patch := v_meta_patch || jsonb_build_object('kyc_docs', v_kyc_obj);
            END IF;

            IF p_media_patch ? 'commercial_reg_no' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('commercial_reg_no', NULLIF(left(trim(COALESCE(p_media_patch->>'commercial_reg_no', '')), 80), ''));
            END IF;
            IF p_media_patch ? 'tax_id' THEN
                v_new_tax_id := NULLIF(left(trim(COALESCE(p_media_patch->>'tax_id', '')), 64), '');
                v_meta_patch := v_meta_patch || jsonb_build_object('tax_id', v_new_tax_id);
            END IF;
            IF p_media_patch ? 'description' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('description', NULLIF(left(trim(COALESCE(p_media_patch->>'description', '')), 1000), ''));
            END IF;
            IF p_media_patch ? 'district' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('district', NULLIF(left(trim(COALESCE(p_media_patch->>'district', '')), 120), ''));
            END IF;
            IF p_media_patch ? 'city_name' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('city_name', NULLIF(left(trim(COALESCE(p_media_patch->>'city_name', '')), 120), ''));
            END IF;
            IF p_media_patch ? 'city_geoname_id' AND NULLIF(trim(COALESCE(p_media_patch->>'city_geoname_id', '')), '') ~ '^\d+$' THEN
                v_city_gid := (p_media_patch->>'city_geoname_id')::bigint;
                IF EXISTS (SELECT 1 FROM sawyan.geonames_locations WHERE geoname_id = v_city_gid) THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('city_geoname_id', v_city_gid);
                ELSE
                    v_city_gid := NULL;
                END IF;
            END IF;
            IF p_media_patch ? 'google_maps_url' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('google_maps_url', NULLIF(left(trim(COALESCE(p_media_patch->>'google_maps_url', '')), 400), ''));
                IF NULLIF(trim(COALESCE(p_media_patch->>'google_maps_url', '')), '') IS NOT NULL THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('geo_is_fallback', false);
                END IF;
            END IF;
            IF p_media_patch ? 'website_url' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('website_url', NULLIF(left(trim(COALESCE(p_media_patch->>'website_url', '')), 300), ''));
            END IF;
            IF p_media_patch ? 'webhook_url' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('webhook_url', NULLIF(left(trim(COALESCE(p_media_patch->>'webhook_url', '')), 300), ''));
            END IF;
            IF p_media_patch ? 'whatsapp' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('whatsapp', NULLIF(left(trim(COALESCE(p_media_patch->>'whatsapp', '')), 40), ''));
            END IF;
            IF p_media_patch ? 'social' AND jsonb_typeof(p_media_patch->'social') = 'object' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('social', p_media_patch->'social');
            END IF;
            IF p_media_patch ? 'working_hours' AND p_media_patch->'working_hours' IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('working_hours', p_media_patch->'working_hours');
            END IF;
            IF p_media_patch ? 'email' AND NULLIF(trim(COALESCE(p_media_patch->>'email', '')), '') IS NOT NULL THEN
                v_new_email := sawyan.validate_strict_email(p_media_patch->>'email');
                IF EXISTS (SELECT 1 FROM sawyan.merchants WHERE lower(email) = v_new_email AND id <> v_merch.id) THEN
                    RAISE EXCEPTION 'MERCHANT_EMAIL_ALREADY_REGISTERED';
                END IF;
            END IF;
            IF p_media_patch ? 'merchant_type' AND lower(trim(COALESCE(p_media_patch->>'merchant_type', ''))) IN ('physical', 'online', 'both') THEN
                v_new_type := lower(trim(p_media_patch->>'merchant_type'));
            END IF;
            IF p_media_patch ? 'category' AND NULLIF(trim(COALESCE(p_media_patch->>'category', '')), '') IS NOT NULL THEN
                SELECT slug INTO v_new_cat FROM sawyan.categories WHERE slug = lower(trim(p_media_patch->>'category'));
            END IF;
            IF p_media_patch ? 'deduction_percent' AND NULLIF(trim(COALESCE(p_media_patch->>'deduction_percent', '')), '') IS NOT NULL THEN
                IF COALESCE((v_merch.metadata->>'commission_locked')::boolean, false) IS TRUE THEN
                    RAISE EXCEPTION 'MERCHANT_COMMISSION_LOCKED_BY_ADMIN';
                END IF;
                v_new_ded := ROUND((p_media_patch->>'deduction_percent')::numeric, 2);
                IF v_new_ded < 0.50 OR v_new_ded > 95.00 THEN
                    RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
                END IF;
                v_meta_patch := v_meta_patch || jsonb_build_object('commission_pending', false);
            END IF;
        END IF;

        IF v_act = 'update_profile' THEN
            UPDATE sawyan.merchants
               SET business_name       = COALESCE(NULLIF(trim(COALESCE(p_business_name, '')), ''), business_name),
                   owner_name          = COALESCE(NULLIF(trim(COALESCE(p_owner_name, '')), ''), owner_name),
                   phone               = COALESCE(v_new_phone, phone),
                   email               = COALESCE(v_new_email, email),
                   merchant_type       = COALESCE(v_new_type, merchant_type),
                   category            = COALESCE(v_new_cat, category),
                   deduction_percent   = COALESCE(v_new_ded, deduction_percent),
                   tax_registration_no = CASE WHEN p_media_patch ? 'tax_id' THEN v_new_tax_id ELSE tax_registration_no END,
                   address             = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
                   latitude            = COALESCE(p_latitude, latitude),
                   longitude           = COALESCE(p_longitude, longitude),
                   metadata            = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;

            IF v_main_br_id IS NOT NULL THEN
                UPDATE sawyan.merchant_branches
                   SET address         = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
                       latitude        = COALESCE(p_latitude, latitude),
                       longitude       = COALESCE(p_longitude, longitude),
                       city_geoname_id = COALESCE(v_city_gid, city_geoname_id),
                       branch_phone    = COALESCE(v_new_phone, branch_phone)
                 WHERE id = v_main_br_id;
            END IF;
        ELSE
            UPDATE sawyan.merchants
               SET deduction_percent   = COALESCE(v_new_ded, deduction_percent),
                   tax_registration_no = CASE WHEN p_media_patch ? 'tax_id' THEN v_new_tax_id ELSE tax_registration_no END,
                   metadata            = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        END IF;

        IF v_merch.onboarding_status IN ('draft_incomplete', 'needs_correction') THEN
            v_prof_eval := sawyan.evaluate_merchant_profile_complete(v_merch.id);
            IF COALESCE((v_prof_eval->>'is_complete')::boolean, false) IS TRUE THEN
                UPDATE sawyan.merchants
                   SET onboarding_status = 'approved',
                       onboarding_notes  = NULL
                 WHERE id = v_merch.id
                RETURNING * INTO v_merch;
            END IF;
        END IF;

        v_eff := sawyan.sync_merchant_status_flags(v_merch.id);
        SELECT * INTO v_merch FROM sawyan.merchants WHERE id = v_merch.id;

        RETURN jsonb_build_object(
            'success', true,
            'action', CASE WHEN v_act = 'update_media' THEN 'media_updated' ELSE 'profile_updated' END,
            'deduction_percent', v_merch.deduction_percent,
            'commission_pending', COALESCE((v_merch.metadata->>'commission_pending')::boolean, false),
            'onboarding_status', v_eff->>'onboarding_status',
            'financial_status', v_eff->>'financial_status',
            'governance_status', v_eff->>'governance_status',
            'effective_access', v_eff->'effective_access',
            'missing_required_fields', v_eff->'missing_required_fields',
            'logo_url', NULLIF(v_merch.metadata->>'logo_url', ''),
            'cover_image_url', NULLIF(v_merch.metadata->>'cover_image_url', ''),
            'images', CASE WHEN jsonb_typeof(v_merch.metadata->'images') = 'array' THEN v_merch.metadata->'images' ELSE '[]'::jsonb END,
            'kyc_docs', COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb)
        );

    ELSIF v_act IN ('add_cashier', 'toggle_cashier', 'reset_cashier_pin') THEN
        IF v_portal_mode IN ('topup_only', 'appeal_and_repay_only') THEN
            RAISE EXCEPTION 'MERCHANT_PORTAL_RESTRICTED_MODE: %', v_portal_mode;
        END IF;

        IF v_act = 'add_cashier' THEN
            IF trim(COALESCE(p_employee_name, '')) = '' THEN
                RAISE EXCEPTION 'CASHIER_CODE_AND_NAME_REQUIRED';
            END IF;
            IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
                RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
            END IF;

            v_emp_code := NULLIF(upper(trim(COALESCE(p_employee_code, ''))), '');
            IF v_emp_code IS NULL THEN
                SELECT COUNT(*) + 1 INTO v_emp_seq FROM sawyan.cashier_employees WHERE merchant_id = v_merch.id;
                LOOP
                    v_emp_code := 'EMP-' || lpad(v_emp_seq::text, 2, '0');
                    EXIT WHEN NOT EXISTS (SELECT 1 FROM sawyan.cashier_employees WHERE merchant_id = v_merch.id AND upper(employee_code) = v_emp_code);
                    v_emp_seq := v_emp_seq + 1;
                END LOOP;
            ELSIF sawyan.is_reg_field_required('employee_cashier', 'employee_code', 'initial') AND v_emp_code = '' THEN
                RAISE EXCEPTION 'CASHIER_CODE_AND_NAME_REQUIRED';
            END IF;

            v_emp_phone := NULLIF(trim(COALESCE(p_phone, p_media_patch->>'employee_phone', '')), '');
            IF v_emp_phone IS NOT NULL THEN
                v_emp_phone := sawyan.validate_and_normalize_e164_phone(v_country.country_code, v_emp_phone);
            ELSIF sawyan.is_reg_field_required('employee_cashier', 'employee_phone', 'initial') THEN
                RAISE EXCEPTION 'CASHIER_PHONE_REQUIRED';
            END IF;

            IF p_linked_member_code IS NOT NULL AND p_linked_member_code > 0 THEN
                SELECT id INTO v_linked_mid FROM sawyan.members WHERE member_code = p_linked_member_code;
                IF v_linked_mid IS NULL THEN
                    RAISE EXCEPTION 'LINKED_MEMBER_NOT_FOUND';
                END IF;
            ELSIF sawyan.is_reg_field_required('employee_cashier', 'linked_member_code', 'initial') THEN
                RAISE EXCEPTION 'CASHIER_LINKED_MEMBER_REQUIRED';
            END IF;

            IF p_max_tx_limit IS NULL AND sawyan.is_reg_field_required('employee_cashier', 'max_tx_amount_limit', 'initial') THEN
                RAISE EXCEPTION 'CASHIER_MAX_LIMIT_REQUIRED';
            END IF;

            IF p_media_patch IS NOT NULL AND (p_media_patch ? 'notify_owner_realtime') THEN
                v_notify_rt := COALESCE((p_media_patch->>'notify_owner_realtime')::boolean, true);
            END IF;

            INSERT INTO sawyan.cashier_employees (
                merchant_id, branch_id, employee_code, full_name, linked_member_id,
                pin_hash, max_tx_amount_limit, notify_owner_realtime, is_active, must_change_pin
            ) VALUES (
                v_merch.id, COALESCE(p_branch_id, v_main_br_id), v_emp_code, trim(p_employee_name),
                v_linked_mid, extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
                p_max_tx_limit, v_notify_rt, true, true
            ) RETURNING id INTO v_new_emp_id;

            IF v_emp_phone IS NOT NULL THEN
                UPDATE sawyan.merchants
                   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), ARRAY['cashier_phones', v_new_emp_id::text], to_jsonb(v_emp_phone), true)
                 WHERE id = v_merch.id;
            END IF;

            IF v_merch.onboarding_status IN ('draft_incomplete', 'needs_correction') THEN
                v_prof_eval := sawyan.evaluate_merchant_profile_complete(v_merch.id);
                IF COALESCE((v_prof_eval->>'is_complete')::boolean, false) IS TRUE THEN
                    UPDATE sawyan.merchants SET onboarding_status = 'approved', onboarding_notes = NULL WHERE id = v_merch.id;
                END IF;
            END IF;
            PERFORM sawyan.sync_merchant_status_flags(v_merch.id);

            PERFORM sawyan.append_audit_log(
                'merchant', v_merch.id, 'cashier_employee_added', 'cashier_employees', v_new_emp_id::text,
                NULL, jsonb_build_object('employee_code', v_emp_code, 'linked_member_code', p_linked_member_code, 'notify_owner_realtime', v_notify_rt, 'must_change_pin', true)
            );
            RETURN jsonb_build_object('success', true, 'employee_id', v_new_emp_id, 'employee_code', v_emp_code, 'must_change_pin', true);

        ELSIF v_act = 'toggle_cashier' THEN
            UPDATE sawyan.cashier_employees
               SET is_active              = NOT is_active,
                   failed_pin_attempts    = 0,
                   pin_locked_until       = NULL,
                   session_token_hash     = CASE WHEN is_active = true THEN NULL ELSE session_token_hash END,
                   session_expires_at     = CASE WHEN is_active = true THEN NULL ELSE session_expires_at END,
                   session_last_active_at = CASE WHEN is_active = true THEN NULL ELSE session_last_active_at END
             WHERE id = p_employee_id AND merchant_id = v_merch.id
            RETURNING * INTO v_target_emp;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'CASHIER_NOT_FOUND';
            END IF;

            PERFORM sawyan.append_audit_log(
                'merchant', v_merch.id,
                CASE WHEN v_target_emp.is_active THEN 'cashier_employee_reactivated' ELSE 'cashier_employee_deactivated' END,
                'cashier_employees', v_target_emp.id::text,
                NULL, jsonb_build_object('employee_code', v_target_emp.employee_code, 'is_active', v_target_emp.is_active)
            );
            RETURN jsonb_build_object('success', true, 'employee_id', v_target_emp.id, 'is_active', v_target_emp.is_active);

        ELSE
            -- reset_cashier_pin: forces new private PIN on next login + revokes active session immediately + audit log
            IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
                RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
            END IF;
            UPDATE sawyan.cashier_employees
               SET pin_hash               = extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
                   must_change_pin        = true,
                   failed_pin_attempts    = 0,
                   pin_locked_until       = NULL,
                   session_token_hash     = NULL,
                   session_expires_at     = NULL,
                   session_last_active_at = NULL
             WHERE id = p_employee_id AND merchant_id = v_merch.id
            RETURNING * INTO v_target_emp;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'CASHIER_NOT_FOUND';
            END IF;

            PERFORM sawyan.append_audit_log(
                'merchant', v_merch.id, 'cashier_pin_reset_by_owner', 'cashier_employees', v_target_emp.id::text,
                NULL, jsonb_build_object('employee_code', v_target_emp.employee_code, 'must_change_pin', true, 'session_revoked', true)
            );
            RETURN jsonb_build_object('success', true, 'employee_id', v_target_emp.id, 'pin_reset', true, 'must_change_pin', true);
        END IF;
    ELSE
        RAISE EXCEPTION 'UNKNOWN_MERCHANT_MANAGE_ACTION: %', p_action;
    END IF;
END;
$$;

-- ============================================================================
-- 9. Upgraded get_merchant_dashboard_bundle (Employee status, 48h overrides & live settings)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_merchant_dashboard_bundle(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL,
    p_shift_filter  VARCHAR(20) DEFAULT 'today',
    p_branch_id     UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_settings     sawyan.settings%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_eff          JSONB;
    v_fin          VARCHAR(30);
    v_free_bal     NUMERIC(18,2);
    v_free_pct     NUMERIC(6,2);
    v_safe_sales   NUMERIC(18,2);
    v_zone         VARCHAR(20);
    v_today_sales  NUMERIC(18,2);
    v_today_comm   NUMERIC(18,2);
    v_today_cnt    INT;
    v_month_sales  NUMERIC(18,2);
    v_month_comm   NUMERIC(18,2);
    v_shift        JSONB;
    v_radar_1km    JSONB;
    v_radar_2km    JSONB;
    v_radar_3km    JSONB;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_eff   := sawyan.sync_merchant_status_flags(v_merch.id);
    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_merch.id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    SELECT * INTO v_main_br FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    v_fin      := v_eff->>'financial_status';
    v_free_bal := COALESCE((v_eff->>'free_balance')::numeric, 0.00);
    v_free_pct := COALESCE((v_eff->>'free_pct')::numeric, 0.00);
    v_safe_sales := CASE WHEN v_merch.deduction_percent > 0
                         THEN ROUND((GREATEST(0, v_free_bal) / (v_merch.deduction_percent / 100.0))::numeric, 2)
                         ELSE 0.00 END;

    v_zone := CASE v_fin
        WHEN 'healthy_green'  THEN 'GREEN'
        WHEN 'warning_yellow' THEN 'YELLOW'
        WHEN 'warning_red'    THEN 'RED'
        ELSE 'ISOLATED'
    END;

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00), COUNT(*)
      INTO v_today_sales, v_today_comm, v_today_cnt
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('day', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00)
      INTO v_month_sales, v_month_comm
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('month', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    v_shift := sawyan.get_merchant_shift_closing(v_merch.id, p_branch_id, COALESCE(p_shift_filter, 'today'), NULL, NULL, NULL, NULL);
    IF v_main_br.id IS NOT NULL THEN
        v_radar_1km := sawyan.get_merchant_members_density(v_main_br.id, 1.0);
        v_radar_2km := sawyan.get_merchant_members_density(v_main_br.id, 2.0);
        v_radar_3km := sawyan.get_merchant_members_density(v_main_br.id, 3.0);
    END IF;

    RETURN jsonb_build_object(
        'profile', (
            jsonb_build_object(
                'id', v_merch.id,
                'merchant_code', v_merch.merchant_code,
                'business_name', v_merch.business_name,
                'owner_name', v_merch.owner_name,
                'email', v_merch.email,
                'phone', v_merch.phone,
                'category', v_merch.category,
                'merchant_type', v_merch.merchant_type,
                'deduction_percent', v_merch.deduction_percent,
                'commission_pending', COALESCE((v_merch.metadata->>'commission_pending')::boolean, v_merch.deduction_percent <= 0),
                'commission_locked', COALESCE((v_merch.metadata->>'commission_locked')::boolean, false),
                'package_base_amount', v_merch.package_base_amount,
                'actual_cash_balance', v_merch.actual_cash_balance,
                'soft_hold_balance', v_merch.soft_hold_balance,
                'credit_limit', v_merch.credit_limit,
                'free_balance', v_free_bal,
                'free_pct', v_free_pct,
                'safe_sales_capacity', v_safe_sales,
                'zone_status', v_zone,
                'is_active', v_merch.is_active,
                'is_isolated', v_merch.is_isolated,
                'onboarding_status', v_eff->>'onboarding_status',
                'onboarding_notes', v_eff->>'onboarding_notes',
                'financial_status', v_fin,
                'governance_status', v_eff->>'governance_status',
                'pre_pause_governance_status', v_eff->>'pre_pause_governance_status',
                'governance_reason', v_eff->>'governance_reason'
            ) || jsonb_build_object(
                'effective_access', v_eff->'effective_access',
                'violation_counters', v_eff->'violation_counters',
                'effective_queue_cap', v_eff->'effective_queue_cap',
                'effective_isolate_pct', v_eff->'effective_isolate_pct',
                'unsecured_queue_cap_override', v_merch.unsecured_queue_cap_override,
                'isolate_pct_override', v_merch.isolate_pct_override,
                'deferred_settlement_cutoff_time', v_merch.deferred_settlement_cutoff_time,
                'd4_cycle_days_override', v_merch.d4_cycle_days_override,
                'd4_grace_hours_override', v_merch.d4_grace_hours_override,
                'd4_time_trigger_disabled', COALESCE((v_merch.metadata->>'d4_time_trigger_disabled')::boolean, false),
                'd4_effective_cycle_days', v_eff->'d4_effective_cycle_days',
                'd4_effective_cutoff_time', v_eff->'d4_effective_cutoff_time',
                'd4_effective_grace_hours', v_eff->'d4_effective_grace_hours',
                'd4_cycle_close_at', v_eff->'d4_cycle_close_at',
                'd4_grace_due_at', v_eff->'d4_grace_due_at',
                'd4_statement_due_local', v_eff->'d4_statement_due_local',
                'd4_open_cycle_comm_local', v_eff->'d4_open_cycle_comm_local',
                'd4_in_grace_window', v_eff->'d4_in_grace_window',
                'cutoff_breached', v_eff->'cutoff_breached',
                'overdue_days', v_eff->'overdue_days',
                'fifo_default_days', v_eff->'fifo_default_days',
                'warn1_pct', v_eff->'warn1_pct',
                'warn2_pct', v_eff->'warn2_pct',
                'missing_required_fields', v_eff->'missing_required_fields',
                'hide_reason_ar', v_eff->'hide_reason_ar',
                'pos_lock_reason_ar', v_eff->'pos_lock_reason_ar'
            ) || jsonb_build_object(
                'address_is_fallback', COALESCE((v_merch.metadata->>'address_is_fallback')::boolean, false),
                'geo_is_fallback', COALESCE((v_merch.metadata->>'geo_is_fallback')::boolean, false),
                'address', COALESCE(v_merch.address, v_main_br.address),
                'district', NULLIF(v_merch.metadata->>'district', ''),
                'city_name', NULLIF(v_merch.metadata->>'city_name', ''),
                'city_geoname_id', COALESCE(v_main_br.city_geoname_id, NULLIF(v_merch.metadata->>'city_geoname_id', '')::bigint),
                'latitude', COALESCE(v_merch.latitude, v_main_br.latitude),
                'longitude', COALESCE(v_merch.longitude, v_main_br.longitude),
                'google_maps_url', NULLIF(v_merch.metadata->>'google_maps_url', ''),
                'description', NULLIF(v_merch.metadata->>'description', ''),
                'website_url', NULLIF(v_merch.metadata->>'website_url', ''),
                'webhook_url', NULLIF(v_merch.metadata->>'webhook_url', ''),
                'whatsapp', NULLIF(v_merch.metadata->>'whatsapp', ''),
                'social', COALESCE(v_merch.metadata->'social', '{}'::jsonb),
                'commercial_reg_no', NULLIF(v_merch.metadata->>'commercial_reg_no', ''),
                'tax_id', NULLIF(COALESCE(v_merch.tax_registration_no, v_merch.metadata->>'tax_id'), ''),
                'country_code', v_country.country_code,
                'currency_code', v_country.currency_code,
                'wifi_ssid', v_merch.metadata->>'wifi_ssid',
                'wifi_password', v_merch.metadata->>'wifi_password',
                'working_hours', COALESCE(v_merch.metadata->'working_hours', to_jsonb('09:00 - 23:00'::text)),
                'logo_url', NULLIF(v_merch.metadata->>'logo_url', ''),
                'cover_image_url', NULLIF(v_merch.metadata->>'cover_image_url', ''),
                'images', CASE WHEN jsonb_typeof(v_merch.metadata->'images') = 'array' THEN v_merch.metadata->'images' ELSE '[]'::jsonb END,
                'kyc_docs', COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb),
                'today_sales_local', v_today_sales,
                'today_commission_local', v_today_comm,
                'today_merchant_net_local', v_today_sales - v_today_comm,
                'today_completed_count', v_today_cnt,
                'month_sales_local', v_month_sales,
                'month_commission_local', v_month_comm,
                'month_merchant_net_local', v_month_sales - v_month_comm
            )
        ),
        'verification_settings', jsonb_build_object(
            'employee_shift_hours', COALESCE(v_settings.employee_shift_hours, 8),
            'employee_idle_timeout_mins', COALESCE(v_settings.employee_idle_timeout_mins, 60),
            'live_poll_interval_secs', COALESCE(v_settings.live_poll_interval_secs, 8),
            'max_pending_per_merchant', COALESCE(v_settings.max_pending_per_merchant, 2),
            'allow_zero_hold_in_isolation', COALESCE(v_settings.allow_zero_hold_in_isolation, true)
        ),
        'branches', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'branch_code', b.branch_code, 'branch_name', b.branch_name,
                'is_main_branch', b.is_main_branch, 'address', b.address,
                'latitude', b.latitude, 'longitude', b.longitude,
                'daily_commission_cap_local', b.daily_commission_cap_local, 'is_branch_active', b.is_branch_active
            ) ORDER BY b.is_main_branch DESC, b.created_at ASC)
            FROM sawyan.merchant_branches b WHERE b.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'cashiers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ce.id, 'branch_id', ce.branch_id, 'employee_code', ce.employee_code,
                'full_name', ce.full_name, 'linked_member_id', ce.linked_member_id,
                'employee_phone', v_merch.metadata->'cashier_phones'->>ce.id::text,
                'notify_owner_realtime', ce.notify_owner_realtime,
                'failed_pin_attempts', ce.failed_pin_attempts, 'pin_locked_until', ce.pin_locked_until,
                'max_tx_amount_limit', ce.max_tx_amount_limit, 'is_active', ce.is_active,
                'must_change_pin', COALESCE(ce.must_change_pin, false),
                'pin_changed_at', ce.pin_changed_at,
                'session_active', (ce.session_expires_at IS NOT NULL AND ce.session_expires_at > now() AND ce.session_token_hash IS NOT NULL)
            ) ORDER BY ce.employee_code ASC)
            FROM sawyan.cashier_employees ce WHERE ce.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'pending_transactions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'sw_short_code', t.sw_short_code, 'unique_payment_ref', t.unique_payment_ref, 'status', t.status,
                'total_amount', t.total_amount, 'commission_amount', t.commission_amount,
                'merchant_net_amount', t.total_amount - t.commission_amount,
                'currency_code', t.currency_code, 'payment_type', t.payment_type,
                'receipt_media_url', t.receipt_media_url, 'fifo_seq', t.fifo_seq,
                'created_at', t.created_at, 'branch_id', t.branch_id,
                'branch_name', COALESCE(mb.branch_name, 'الفرع الرئيسي'),
                'zero_hold_in_isolation', COALESCE((t.commission_snapshot->>'zero_hold_in_isolation')::boolean, false),
                'member_code', m.member_code,
                'member_masked_name', sawyan.mask_member_display_name(m.full_name, m.member_code)
            ) ORDER BY t.fifo_seq ASC)
            FROM sawyan.transactions t
            JOIN sawyan.members m ON m.id = t.member_id
            LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
            WHERE t.merchant_id = v_merch.id AND t.status IN ('pending', 'awaiting_merchant_topup')
        ), '[]'::jsonb),
        'recent_employee_rejections', COALESCE((
            SELECT jsonb_agg(row_to_json(er)) FROM (
                SELECT t.id, t.sw_short_code, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, t.receipt_media_url, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       t.commission_snapshot->>'rejected_by_employee_code' AS employee_code,
                       t.commission_snapshot->>'rejected_by_employee_name' AS employee_name,
                       t.commission_snapshot->>'rejection_reason'          AS rejection_reason,
                       t.commission_snapshot->>'rejected_at'               AS rejected_at,
                       t.commission_snapshot->>'owner_override_deadline'   AS owner_override_deadline
                  FROM sawyan.transactions t
                  JOIN sawyan.members m ON m.id = t.member_id
                 WHERE t.merchant_id = v_merch.id
                   AND t.status = 'rejected'
                   AND NULLIF(COALESCE(t.commission_snapshot->>'rejected_by_employee_id', ''), '') IS NOT NULL
                   AND now() <= COALESCE(
                       NULLIF(t.commission_snapshot->>'owner_override_deadline', '')::timestamptz,
                       COALESCE(NULLIF(t.commission_snapshot->>'rejected_at', '')::timestamptz, t.created_at) + interval '48 hours'
                   )
                 ORDER BY t.created_at DESC
                 LIMIT 20
            ) er
        ), '[]'::jsonb),
        'completed_transactions', COALESCE((
            SELECT jsonb_agg(row_to_json(sub)) FROM (
                SELECT t.id, t.sw_short_code, t.unique_payment_ref, t.status, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, t.receipt_media_url, (t.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                       t.completed_at, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       mb.branch_name, COALESCE(ce.full_name, 'مالك المتجر') AS cashier_name
                  FROM sawyan.transactions t
                  JOIN sawyan.members m ON m.id = t.member_id
                  LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
                  LEFT JOIN sawyan.cashier_employees ce ON ce.id = t.cashier_employee_id
                 WHERE t.merchant_id = v_merch.id AND t.status IN ('completed', 'reversed')
                 ORDER BY t.created_at DESC LIMIT 100
            ) sub
        ), '[]'::jsonb),
        'b2b_tax_invoices', COALESCE((
            SELECT jsonb_agg(row_to_json(inv)) FROM (
                SELECT invoice_number, document_type, net_commission_amount, vat_rate_applied,
                       vat_amount, gross_invoice_total, currency_code, issued_at
                  FROM sawyan.b2b_tax_invoices
                 WHERE merchant_id = v_merch.id
                 ORDER BY issued_at DESC LIMIT 50
            ) inv
        ), '[]'::jsonb),
        'topup_history', COALESCE((
            SELECT jsonb_agg(row_to_json(tp)) FROM (
                SELECT je.id, je.entry_number, je.description, je.posted_at,
                       jl.amount_local, jl.currency_code
                  FROM sawyan.journal_entries je
                  JOIN sawyan.journal_lines jl ON jl.journal_entry_id = je.id
                 WHERE je.source_type = 'MERCHANT_TOPUP'
                   AND jl.account_code = '2101'
                   AND jl.entity_id = v_merch.id
                 ORDER BY je.posted_at DESC LIMIT 30
            ) tp
        ), '[]'::jsonb),
        'pending_topup_requests', COALESCE((
            SELECT jsonb_agg(row_to_json(pr)) FROM (
                SELECT mc.id,
                       COALESCE((mc.payload_after->>'amount')::numeric, 0.00) AS amount,
                       COALESCE(mc.payload_after->>'payment_ref', '') AS payment_ref,
                       COALESCE(mc.payload_after->>'provider', 'bank_transfer') AS provider,
                       COALESCE(mc.payload_after->>'receipt_note', '') AS receipt_note,
                       mc.created_at
                  FROM sawyan.maker_checker_requests mc
                 WHERE mc.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION'
                   AND mc.target_id = v_merch.id::text
                   AND mc.status = 'pending'
                 ORDER BY mc.created_at DESC LIMIT 20
            ) pr
        ), '[]'::jsonb),
        'shift_closing', v_shift,
        'radar_rings', jsonb_build_object('r1km', v_radar_1km, 'r2km', v_radar_2km, 'r3km', v_radar_3km),
        'flash_offers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', n.id,
                'status', CASE n.event_name
                    WHEN 'MerchantFlashOfferApproved' THEN 'approved'
                    WHEN 'MerchantFlashOfferRejected' THEN 'rejected'
                    ELSE 'pending'
                END,
                'payload', n.payload,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC)
            FROM sawyan.notifications n
            WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
              AND (n.recipient_id = v_merch.id OR n.payload->>'merchant_id' = v_merch.id::text)
        ), '[]'::jsonb),
        'notifications', COALESCE((
            SELECT jsonb_agg(row_to_json(nf)) FROM (
                SELECT id, event_name, payload, is_read, created_at
                  FROM sawyan.notifications
                 WHERE recipient_type = 'merchant' AND recipient_id = v_merch.id
                 ORDER BY created_at DESC LIMIT 25
            ) nf
        ), '[]'::jsonb)
    );
END;
$$;

-- ============================================================================
-- 10. Upgraded admin_decide_governance_request (Persists all 9 new Bitemporal Settings)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_decide_governance_request(
    p_admin_id         UUID,
    p_session_token    TEXT,
    p_request_id       UUID,
    p_decision         VARCHAR,
    p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info    JSONB;
    v_mc_res        JSONB;
    v_req           sawyan.maker_checker_requests%ROWTYPE;
    v_exec_effect   JSONB := '{"effect":"recorded_only"}'::jsonb;
    v_country       sawyan.countries%ROWTYPE;
    v_cur_settings  sawyan.settings%ROWTYPE;
    v_merch_cnt     INT;
    v_new_set_id    INT;
    v_partner_id    UUID;
    v_topup_res     JSONB;
    v_next_month_ts TIMESTAMPTZ;
    v_bg_ym         TEXT;
    v_total_cycles  INT := 0;
    v_unlocked      INT := 0;
    v_adj_cycle     sawyan.settlement_cycles%ROWTYPE;
    v_adj_cid       INT;
    v_debit_acct    VARCHAR(16);
    v_credit_acct   VARCHAR(16);
    v_adj_amt       NUMERIC(18,2);
    v_adj_je_id     UUID;
    v_mer           sawyan.merchants%ROWTYPE;
    v_qtx           RECORD;
    v_released      INT := 0;
    v_eff_res       JSONB;
    v_new_gov       VARCHAR(30);
    v_new_onb       VARCHAR(30);
    v_new_ded       NUMERIC(5,2);
    v_new_cred      NUMERIC(18,2);
BEGIN
    v_admin_info := sawyan.verify_admin_session(
        p_admin_id,
        p_session_token,
        ARRAY['approver', 'finance'],
        true
    );

    v_mc_res := sawyan.decide_maker_checker_request(
        p_request_id,
        p_admin_id,
        p_decision,
        p_rejection_reason
    );

    SELECT * INTO v_req FROM sawyan.maker_checker_requests WHERE id = p_request_id;

    IF lower(trim(p_decision)) = 'approved' THEN
        IF v_req.action_type = 'COUNTRY_LEGAL_TAX_PREP' THEN
            SELECT * INTO v_country
              FROM sawyan.countries
             WHERE country_code = upper(trim(COALESCE(v_req.payload_after->>'country_code', v_req.target_id)))
             FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO sawyan.countries (
                    country_code, country_name_i18n, currency_code, iana_timezone, admin_fx_rate,
                    financial_stopper_usd, monthly_target_usd, compensatory_admin_fee_usd,
                    vat_rate, wht_rate, payout_day, return_cutoff_day,
                    legal_opinion_verified, legal_opinion_doc_url, local_terms_version,
                    min_merchants_threshold, is_active
                ) VALUES (
                    upper(substr(trim(COALESCE(v_req.payload_after->>'country_code', v_req.target_id)), 1, 2)),
                    COALESCE(v_req.payload_after->'country_name_i18n', jsonb_build_object('ar', COALESCE(v_req.payload_after->>'name_ar', v_req.target_id), 'en', COALESCE(v_req.payload_after->>'name_en', v_req.target_id))),
                    upper(substr(trim(COALESCE(v_req.payload_after->>'currency_code', 'USD')), 1, 3)),
                    COALESCE(NULLIF(trim(v_req.payload_after->>'iana_timezone'), ''), 'UTC'),
                    GREATEST(COALESCE((v_req.payload_after->>'admin_fx_rate')::numeric, 1.000000), 0.000001),
                    COALESCE(
                        NULLIF((v_req.payload_after->>'financial_stopper_usd')::numeric, 0),
                        sawyan.calc_country_default_s03_usd(COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, 24.75), NULL, NULL)
                    ),
                    COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, 24.75),
                    COALESCE((v_req.payload_after->>'compensatory_admin_fee_usd')::numeric, 0.00),
                    COALESCE((v_req.payload_after->>'vat_rate')::numeric, 0.0000),
                    COALESCE((v_req.payload_after->>'wht_rate')::numeric, 0.0000),
                    COALESCE((v_req.payload_after->>'payout_day')::smallint, 15),
                    COALESCE((v_req.payload_after->>'return_cutoff_day')::smallint, 14),
                    COALESCE((v_req.payload_after->>'legal_opinion_verified')::boolean, false),
                    NULLIF(trim(v_req.payload_after->>'legal_opinion_doc_url'), ''),
                    COALESCE(NULLIF(trim(v_req.payload_after->>'local_terms_version'), ''), 'v3.0'),
                    GREATEST(COALESCE((v_req.payload_after->>'min_merchants_threshold')::int, 1), 1),
                    CASE WHEN COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false)
                         THEN COALESCE((v_req.payload_after->>'is_active')::boolean, false)
                         ELSE false END
                ) RETURNING * INTO v_country;
            ELSE
                UPDATE sawyan.countries
                   SET country_name_i18n          = CASE
                                                        WHEN v_req.payload_after ? 'country_name_i18n' THEN v_req.payload_after->'country_name_i18n'
                                                        WHEN v_req.payload_after ? 'name_ar' THEN country_name_i18n || jsonb_build_object('ar', v_req.payload_after->>'name_ar', 'en', COALESCE(NULLIF(trim(v_req.payload_after->>'name_en'), ''), country_name_i18n->>'en'))
                                                        ELSE country_name_i18n
                                                    END,
                       currency_code              = COALESCE(NULLIF(upper(substr(trim(v_req.payload_after->>'currency_code'), 1, 3)), ''), currency_code),
                       iana_timezone              = COALESCE(NULLIF(trim(v_req.payload_after->>'iana_timezone'), ''), iana_timezone),
                       admin_fx_rate              = COALESCE((v_req.payload_after->>'admin_fx_rate')::numeric, admin_fx_rate),
                       legal_opinion_verified     = COALESCE((v_req.payload_after->>'legal_opinion_verified')::boolean, legal_opinion_verified),
                       legal_opinion_doc_url      = COALESCE(NULLIF(trim(v_req.payload_after->>'legal_opinion_doc_url'), ''), legal_opinion_doc_url),
                       local_terms_version        = COALESCE(NULLIF(trim(v_req.payload_after->>'local_terms_version'), ''), local_terms_version),
                       financial_stopper_usd      = COALESCE((v_req.payload_after->>'financial_stopper_usd')::numeric, financial_stopper_usd),
                       monthly_target_usd         = COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, monthly_target_usd),
                       compensatory_admin_fee_usd = COALESCE((v_req.payload_after->>'compensatory_admin_fee_usd')::numeric, compensatory_admin_fee_usd),
                       vat_rate                   = COALESCE((v_req.payload_after->>'vat_rate')::numeric, vat_rate),
                       wht_rate                   = COALESCE((v_req.payload_after->>'wht_rate')::numeric, wht_rate),
                       payout_day                 = COALESCE((v_req.payload_after->>'payout_day')::smallint, payout_day),
                       return_cutoff_day          = COALESCE((v_req.payload_after->>'return_cutoff_day')::smallint, return_cutoff_day),
                       min_merchants_threshold    = COALESCE((v_req.payload_after->>'min_merchants_threshold')::int, min_merchants_threshold),
                       is_active                  = CASE
                                                        WHEN v_req.payload_after ? 'is_active' AND ((v_req.payload_after->>'is_active')::boolean = false OR COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false))
                                                        THEN (v_req.payload_after->>'is_active')::boolean
                                                        ELSE is_active
                                                    END,
                       recorded_at                = now()
                 WHERE id = v_country.id
                RETURNING * INTO v_country;
            END IF;

            v_exec_effect := jsonb_build_object('effect', 'country_parameters_updated', 'country_code', v_country.country_code);

        ELSIF v_req.action_type = 'COUNTRY_GATE_D13_ACTIVATION' THEN
            SELECT * INTO v_country
              FROM sawyan.countries
             WHERE country_code = upper(trim(COALESCE(v_req.payload_after->>'country_code', v_req.target_id)))
             FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'COUNTRY_NOT_FOUND'; END IF;

            IF v_req.payload_after ? 'legal_opinion_verified' THEN
                UPDATE sawyan.countries
                   SET legal_opinion_verified  = (v_req.payload_after->>'legal_opinion_verified')::boolean,
                       legal_opinion_doc_url   = COALESCE(NULLIF(trim(v_req.payload_after->>'legal_opinion_doc_url'), ''), legal_opinion_doc_url),
                       local_terms_version     = COALESCE(NULLIF(trim(v_req.payload_after->>'local_terms_version'), ''), local_terms_version),
                       financial_stopper_usd   = COALESCE((v_req.payload_after->>'financial_stopper_usd')::numeric, financial_stopper_usd),
                       min_merchants_threshold = COALESCE((v_req.payload_after->>'min_merchants_threshold')::int, min_merchants_threshold)
                 WHERE id = v_country.id
                RETURNING * INTO v_country;
            END IF;

            SELECT COUNT(*) INTO v_merch_cnt
              FROM sawyan.merchants
             WHERE country_id = v_country.id AND is_active = true;

            IF COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false) IS TRUE THEN
                UPDATE sawyan.countries
                   SET legal_opinion_verified = true,
                       local_terms_version    = COALESCE(NULLIF(trim(local_terms_version), ''), 'v3.0-FOUNDER-SOVEREIGN'),
                       financial_stopper_usd  = CASE
                                                    WHEN COALESCE(financial_stopper_usd, 0) <= 0
                                                    THEN sawyan.calc_country_default_s03_usd(monthly_target_usd, NULL, NULL)
                                                    ELSE financial_stopper_usd
                                                END,
                       is_active              = true,
                       effective_from         = now(),
                       recorded_at            = now()
                 WHERE id = v_country.id
                RETURNING * INTO v_country;

                v_exec_effect := jsonb_build_object(
                    'effect', 'country_activated_by_sovereign_founder',
                    'country_code', v_country.country_code,
                    'effective_from', v_country.effective_from,
                    'active_merchants', v_merch_cnt
                );
            ELSE
                IF v_country.legal_opinion_verified IS NOT TRUE OR COALESCE(trim(v_country.local_terms_version), '') = '' THEN
                    RAISE EXCEPTION 'COUNTRY_GATE_D13_BLOCKED_LEGAL: Written legal opinion and local terms version are mandatory (D18).';
                END IF;
                IF v_country.financial_stopper_usd IS NULL OR v_country.financial_stopper_usd <= 0 THEN
                    RAISE EXCEPTION 'COUNTRY_GATE_D13_BLOCKED_S03: Financial stopper S03 must be > 0 before activation (D14).';
                END IF;
                IF v_merch_cnt < v_country.min_merchants_threshold THEN
                    RAISE EXCEPTION 'COUNTRY_GATE_D13_BLOCKED_MERCHANTS: Active merchants (%) < threshold (%) (T06/D13).', v_merch_cnt, v_country.min_merchants_threshold;
                END IF;

                v_next_month_ts := date_trunc('month', now() + interval '1 month');
                UPDATE sawyan.countries
                   SET is_active      = true,
                       effective_from = v_next_month_ts,
                       recorded_at    = now()
                 WHERE id = v_country.id;

                v_exec_effect := jsonb_build_object(
                    'effect', 'country_activated_d13',
                    'country_code', v_country.country_code,
                    'effective_from', v_next_month_ts,
                    'active_merchants', v_merch_cnt
                );
            END IF;

        ELSIF v_req.action_type = 'BITEMPORAL_SETTINGS_UPDATE' THEN
            SELECT * INTO v_cur_settings
              FROM sawyan.settings
             WHERE country_id IS NULL AND effective_from <= now()
             ORDER BY effective_from DESC, recorded_at DESC
             LIMIT 1;
            IF NOT FOUND THEN
                SELECT * INTO v_cur_settings
                  FROM sawyan.settings
                 WHERE country_id IS NULL
                 ORDER BY effective_from DESC, recorded_at DESC
                 LIMIT 1;
            END IF;

            INSERT INTO sawyan.settings (
                country_id, brand_display_title, company_percent, generations_count,
                numerical_stopper_s01, upline_ceiling_s02, cap_auto_calc, cap_amount,
                monthly_target_usd, payout_day, merchant_warn1_pct, merchant_warn2_pct,
                merchant_isolate_pct, unsecured_queue_cap, unconfirmed_soft_hold_cap_pct,
                wht_threshold_usd, withdrawal_cooldown_hours, dormancy_months,
                fifo_default_days, pending_sla_hours,
                warn_escalated_tx_30d, restrict_escalated_tx_30d,
                warn_lost_disputes_30d, restrict_lost_disputes_30d,
                warn_verified_complaints_30d, restrict_verified_complaints_30d,
                d4_cycle_days, d4_cycle_cutoff_time, d4_grace_hours,
                employee_shift_hours, employee_idle_timeout_mins,
                spam_reject_threshold, spam_reject_window_hours, spam_require_receipt_hours,
                max_pending_per_merchant, live_poll_interval_secs,
                allow_zero_hold_in_isolation, employee_pin_reconfirm_usd,
                effective_from, created_by_admin_id, approved_by_admin_id, change_reason
            ) VALUES (
                NULL,
                'SAWYAN',
                COALESCE((v_req.payload_after->>'company_percent')::numeric, v_cur_settings.company_percent),
                COALESCE((v_req.payload_after->>'numerical_stopper_s01')::int, v_cur_settings.generations_count),
                COALESCE((v_req.payload_after->>'numerical_stopper_s01')::int, v_cur_settings.numerical_stopper_s01),
                COALESCE((v_req.payload_after->>'upline_ceiling_s02')::int, v_cur_settings.upline_ceiling_s02),
                COALESCE((v_req.payload_after->>'cap_auto_calc')::boolean, v_cur_settings.cap_auto_calc),
                COALESCE((v_req.payload_after->>'cap_amount')::numeric, v_cur_settings.cap_amount),
                COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, v_cur_settings.monthly_target_usd),
                COALESCE((v_req.payload_after->>'payout_day')::smallint, v_cur_settings.payout_day),
                COALESCE((v_req.payload_after->>'merchant_warn1_pct')::numeric, v_cur_settings.merchant_warn1_pct),
                COALESCE((v_req.payload_after->>'merchant_warn2_pct')::numeric, v_cur_settings.merchant_warn2_pct),
                COALESCE((v_req.payload_after->>'merchant_isolate_pct')::numeric, v_cur_settings.merchant_isolate_pct),
                COALESCE((v_req.payload_after->>'unsecured_queue_cap')::smallint, v_cur_settings.unsecured_queue_cap),
                COALESCE((v_req.payload_after->>'unconfirmed_soft_hold_cap_pct')::numeric, v_cur_settings.unconfirmed_soft_hold_cap_pct),
                COALESCE((v_req.payload_after->>'wht_threshold_usd')::numeric, v_cur_settings.wht_threshold_usd),
                COALESCE((v_req.payload_after->>'withdrawal_cooldown_hours')::int, v_cur_settings.withdrawal_cooldown_hours),
                COALESCE((v_req.payload_after->>'dormancy_months')::int, v_cur_settings.dormancy_months),
                COALESCE((v_req.payload_after->>'fifo_default_days')::smallint, v_cur_settings.fifo_default_days),
                COALESCE((v_req.payload_after->>'pending_sla_hours')::smallint, v_cur_settings.pending_sla_hours),
                COALESCE((v_req.payload_after->>'warn_escalated_tx_30d')::smallint, v_cur_settings.warn_escalated_tx_30d),
                COALESCE((v_req.payload_after->>'restrict_escalated_tx_30d')::smallint, v_cur_settings.restrict_escalated_tx_30d),
                COALESCE((v_req.payload_after->>'warn_lost_disputes_30d')::smallint, v_cur_settings.warn_lost_disputes_30d),
                COALESCE((v_req.payload_after->>'restrict_lost_disputes_30d')::smallint, v_cur_settings.restrict_lost_disputes_30d),
                COALESCE((v_req.payload_after->>'warn_verified_complaints_30d')::smallint, v_cur_settings.warn_verified_complaints_30d),
                COALESCE((v_req.payload_after->>'restrict_verified_complaints_30d')::smallint, v_cur_settings.restrict_verified_complaints_30d),
                COALESCE((v_req.payload_after->>'d4_cycle_days')::smallint, v_cur_settings.d4_cycle_days, 1),
                COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'d4_cycle_cutoff_time', '')), '')::time, v_cur_settings.d4_cycle_cutoff_time, '23:59:00'::time),
                COALESCE((v_req.payload_after->>'d4_grace_hours')::numeric, v_cur_settings.d4_grace_hours, 2.00),
                COALESCE((v_req.payload_after->>'employee_shift_hours')::smallint, v_cur_settings.employee_shift_hours, 8),
                COALESCE((v_req.payload_after->>'employee_idle_timeout_mins')::smallint, v_cur_settings.employee_idle_timeout_mins, 60),
                COALESCE((v_req.payload_after->>'spam_reject_threshold')::smallint, v_cur_settings.spam_reject_threshold, 2),
                COALESCE((v_req.payload_after->>'spam_reject_window_hours')::smallint, v_cur_settings.spam_reject_window_hours, 24),
                COALESCE((v_req.payload_after->>'spam_require_receipt_hours')::smallint, v_cur_settings.spam_require_receipt_hours, 24),
                COALESCE((v_req.payload_after->>'max_pending_per_merchant')::smallint, v_cur_settings.max_pending_per_merchant, 2),
                COALESCE((v_req.payload_after->>'live_poll_interval_secs')::smallint, v_cur_settings.live_poll_interval_secs, 8),
                COALESCE((v_req.payload_after->>'allow_zero_hold_in_isolation')::boolean, v_cur_settings.allow_zero_hold_in_isolation, true),
                COALESCE((v_req.payload_after->>'employee_pin_reconfirm_usd')::numeric, v_cur_settings.employee_pin_reconfirm_usd, 0.00),
                COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'effective_from', '')), '')::timestamptz, date_trunc('month', now() + interval '1 month')),
                v_req.maker_admin_id,
                p_admin_id,
                v_req.reason
            ) RETURNING id INTO v_new_set_id;

            v_exec_effect := jsonb_build_object('effect', 'bitemporal_settings_version_created', 'settings_id', v_new_set_id);

        ELSIF v_req.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION' THEN
            v_topup_res := sawyan.process_merchant_topup_fifo(
                (v_req.payload_after->>'merchant_id')::uuid,
                (v_req.payload_after->>'amount')::numeric,
                COALESCE(v_req.payload_after->>'payment_ref', 'MC-TOPUP-' || substr(p_request_id::text, 1, 8)),
                p_request_id,
                COALESCE((v_req.payload_after->>'psp_fee')::numeric, 0.00),
                COALESCE(v_req.payload_after->>'provider', 'bank_transfer')
            );
            v_exec_effect := jsonb_build_object('effect', 'merchant_topup_fifo_executed', 'topup_result', v_topup_res);

        ELSIF v_req.action_type = 'MERCHANT_GOVERNANCE_ACTION' THEN
            SELECT * INTO v_mer
              FROM sawyan.merchants
             WHERE id = COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'merchant_id', '')), '')::uuid, v_req.target_id::uuid)
             FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;

            v_new_ded  := NULLIF(trim(COALESCE(v_req.payload_after->>'deduction_percent', '')), '')::numeric;
            v_new_cred := NULLIF(trim(COALESCE(v_req.payload_after->>'credit_limit', '')), '')::numeric;
            v_new_onb  := NULLIF(trim(COALESCE(v_req.payload_after->>'onboarding_status', '')), '');
            v_new_gov  := NULLIF(trim(COALESCE(v_req.payload_after->>'governance_status', '')), '');

            IF v_new_ded IS NOT NULL AND (v_new_ded < 0.50 OR v_new_ded > 95.00) THEN
                RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
            END IF;
            IF v_new_cred IS NOT NULL AND v_new_cred < 0 THEN
                RAISE EXCEPTION 'INVALID_CREDIT_LIMIT_NEGATIVE';
            END IF;

            UPDATE sawyan.merchants
               SET deduction_percent               = COALESCE(v_new_ded, deduction_percent),
                   category                        = COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'category', '')), ''), category),
                   credit_limit                    = COALESCE(v_new_cred, credit_limit),
                   package_base_amount             = GREATEST(package_base_amount, COALESCE(v_new_cred, credit_limit)),
                   onboarding_status               = COALESCE(v_new_onb, onboarding_status),
                   onboarding_notes                = CASE WHEN v_req.payload_after ? 'onboarding_notes' THEN NULLIF(trim(COALESCE(v_req.payload_after->>'onboarding_notes', '')), '') ELSE onboarding_notes END,
                   governance_status               = COALESCE(v_new_gov, governance_status),
                   pre_pause_governance_status     = CASE
                       WHEN v_new_gov IN ('good_standing', 'probation_warning', 'restricted_no_reject', 'suspended_compliance', 'banned_permanent') THEN NULL
                       WHEN v_new_gov IN ('paused_by_admin', 'paused_by_merchant') AND governance_status IN ('good_standing', 'probation_warning') THEN governance_status
                       ELSE pre_pause_governance_status
                   END,
                   governance_reason               = COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'governance_reason', v_req.reason)), ''), governance_reason),
                   governance_updated_at           = CASE WHEN v_new_gov IS NOT NULL THEN now() ELSE governance_updated_at END,
                   unsecured_queue_cap_override    = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_queue_cap_override')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'unsecured_queue_cap_override', '')), '') IS NOT NULL THEN (v_req.payload_after->>'unsecured_queue_cap_override')::smallint
                       ELSE unsecured_queue_cap_override
                   END,
                   isolate_pct_override            = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_isolate_pct_override')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'isolate_pct_override', '')), '') IS NOT NULL THEN (v_req.payload_after->>'isolate_pct_override')::numeric
                       ELSE isolate_pct_override
                   END,
                   deferred_settlement_cutoff_time = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_cutoff_time')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'deferred_settlement_cutoff_time', '')), '') IS NOT NULL THEN (v_req.payload_after->>'deferred_settlement_cutoff_time')::time
                       ELSE deferred_settlement_cutoff_time
                   END,
                   d4_cycle_days_override          = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_d4_cycle_days')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'d4_cycle_days_override', '')), '') IS NOT NULL THEN (v_req.payload_after->>'d4_cycle_days_override')::smallint
                       ELSE d4_cycle_days_override
                   END,
                   d4_grace_hours_override         = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_d4_grace_hours')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'d4_grace_hours_override', '')), '') IS NOT NULL THEN ROUND((v_req.payload_after->>'d4_grace_hours_override')::numeric, 2)
                       ELSE d4_grace_hours_override
                   END,
                   metadata                        = (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                       'contract_reviewed_at', now(),
                       'contract_reviewed_by', p_admin_id,
                       'commission_locked', CASE WHEN COALESCE(v_new_ded, deduction_percent) >= 0.50 AND (COALESCE(v_new_onb, onboarding_status) = 'approved' OR COALESCE(v_new_cred, credit_limit) > 0 OR actual_cash_balance > 0 OR v_new_ded IS NOT NULL) THEN true ELSE COALESCE((metadata->>'commission_locked')::boolean, false) END,
                       'commission_pending', CASE WHEN COALESCE(v_new_ded, deduction_percent) >= 0.50 THEN false ELSE true END
                   )) || CASE
                       WHEN v_req.payload_after ? 'd4_disable_time_trigger' THEN jsonb_build_object('d4_time_trigger_disabled', COALESCE((v_req.payload_after->>'d4_disable_time_trigger')::boolean, false))
                       ELSE '{}'::jsonb
                   END
             WHERE id = v_mer.id
            RETURNING * INTO v_mer;

            FOR v_qtx IN
                SELECT id, commission_amount
                  FROM sawyan.transactions
                 WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup'
                 ORDER BY fifo_seq ASC
            LOOP
                SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
                IF (v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit) >= v_qtx.commission_amount THEN
                    PERFORM sawyan.feed_monthly_target_box(v_qtx.id, p_admin_id);
                    v_released := v_released + 1;
                ELSE
                    EXIT;
                END IF;
            END LOOP;

            v_eff_res := sawyan.sync_merchant_status_flags(v_mer.id);

            IF v_new_gov IS NOT NULL THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES ('merchant', v_mer.id, 'MerchantGovernanceUpdated', 'in_app',
                        jsonb_build_object('governance_status', v_new_gov, 'reason', COALESCE(v_req.reason, 'تحديث امتثال/تعاقد')), now());
            END IF;

            v_exec_effect := jsonb_build_object(
                'effect', 'merchant_governance_action_applied',
                'merchant_id', v_mer.id,
                'released_fifo_count', v_released,
                'lifecycle', v_eff_res
            );

        ELSIF v_req.action_type = 'PARTNER_CONTRACT_D24' THEN
            INSERT INTO sawyan.partners (
                partner_code, full_name, email, phone, auth_user_id,
                partnership_scope, scope_targets, profit_basis, profit_share_pct, contract_ref, is_active
            ) VALUES (
                upper(trim(v_req.payload_after->>'partner_code')),
                trim(v_req.payload_after->>'full_name'),
                lower(trim(v_req.payload_after->>'email')),
                trim(v_req.payload_after->>'phone'),
                gen_random_uuid(),
                COALESCE(v_req.payload_after->>'partnership_scope', 'country'),
                COALESCE(v_req.payload_after->'scope_targets', '{}'::jsonb),
                COALESCE(v_req.payload_after->>'profit_basis', 'net_treasury_after_expenses'),
                (v_req.payload_after->>'profit_share_pct')::numeric,
                trim(v_req.payload_after->>'contract_ref'),
                COALESCE((v_req.payload_after->>'is_active')::boolean, true)
            )
            ON CONFLICT (partner_code) DO UPDATE
               SET full_name         = EXCLUDED.full_name,
                   partnership_scope = EXCLUDED.partnership_scope,
                   scope_targets     = EXCLUDED.scope_targets,
                   profit_basis      = EXCLUDED.profit_basis,
                   profit_share_pct  = EXCLUDED.profit_share_pct,
                   contract_ref      = EXCLUDED.contract_ref,
                   is_active         = EXCLUDED.is_active
            RETURNING id INTO v_partner_id;

            v_exec_effect := jsonb_build_object('effect', 'corporate_partner_registered_d24', 'partner_id', v_partner_id);

        ELSIF v_req.action_type = 'BREAK_GLASS_UNLOCK' THEN
            v_bg_ym := trim(COALESCE(v_req.payload_after->>'period_ym', v_req.target_id));

            SELECT COUNT(*) INTO v_total_cycles
              FROM sawyan.settlement_cycles
             WHERE period_ym = v_bg_ym;
            IF v_total_cycles = 0 THEN
                RAISE EXCEPTION 'SETTLEMENT_CYCLE_NOT_FOUND: %', v_bg_ym;
            END IF;

            UPDATE sawyan.settlement_cycles
               SET is_hard_locked         = false,
                   step_status            = 4,
                   break_glass_expires_at = sawyan.now_utc() + interval '2 hours'
             WHERE period_ym = v_bg_ym
               AND payout_executed_at IS NULL;
            GET DIAGNOSTICS v_unlocked = ROW_COUNT;

            UPDATE sawyan.settlement_cycles
               SET break_glass_expires_at = sawyan.now_utc() + interval '2 hours'
             WHERE period_ym = v_bg_ym
               AND payout_executed_at IS NOT NULL;

            PERFORM sawyan.append_audit_log(
                'admin',
                p_admin_id,
                'break_glass_hard_lock_reopened_2h',
                'settlement_cycles',
                v_bg_ym,
                jsonb_build_object('is_hard_locked', true),
                jsonb_build_object(
                    'is_hard_locked', (v_unlocked = 0),
                    'unlocked_pre_payout_cycles', v_unlocked,
                    'audit_adjustment_only', (v_unlocked = 0),
                    'maker_admin_id', v_req.maker_admin_id,
                    'checker_admin_id', p_admin_id,
                    'reason', v_req.reason
                )
            );

            v_exec_effect := jsonb_build_object(
                'effect', 'break_glass_unlocked_2h',
                'period_ym', v_bg_ym,
                'unlocked_pre_payout_cycles', v_unlocked,
                'audit_adjustment_only', (v_unlocked = 0),
                'window_expires_at', sawyan.now_utc() + interval '2 hours'
            );

        ELSIF v_req.action_type = 'MANUAL_AUDIT_JOURNAL_ADJUSTMENT' THEN
            v_bg_ym       := trim(COALESCE(v_req.payload_after->>'period_ym', v_req.target_id));
            v_debit_acct  := trim(COALESCE(v_req.payload_after->>'debit_account_code', ''));
            v_credit_acct := trim(COALESCE(v_req.payload_after->>'credit_account_code', ''));
            v_adj_amt     := ROUND(COALESCE((v_req.payload_after->>'amount_usd')::numeric, 0.00), 2);
            v_adj_cid     := NULL;

            IF NULLIF(upper(trim(COALESCE(v_req.payload_after->>'country_code', ''))), '') IS NOT NULL THEN
                SELECT id INTO v_adj_cid FROM sawyan.countries WHERE country_code = upper(trim(v_req.payload_after->>'country_code'));
                IF NOT FOUND THEN RAISE EXCEPTION 'COUNTRY_NOT_FOUND'; END IF;
            END IF;

            SELECT * INTO v_adj_cycle
              FROM sawyan.settlement_cycles
             WHERE period_ym = v_bg_ym
               AND (v_adj_cid IS NULL OR country_id = v_adj_cid)
               AND break_glass_expires_at IS NOT NULL
               AND break_glass_expires_at > sawyan.now_utc()
             ORDER BY id ASC
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'BREAK_GLASS_WINDOW_REQUIRED_FOR_MANUAL_AUDIT_ADJUSTMENT';
            END IF;

            IF v_adj_amt <= 0 OR v_debit_acct = '' OR v_credit_acct = '' OR v_debit_acct = v_credit_acct THEN
                RAISE EXCEPTION 'INVALID_MANUAL_AUDIT_JOURNAL_PARAMETERS';
            END IF;

            IF NOT EXISTS (SELECT 1 FROM sawyan.chart_of_accounts WHERE account_code = v_debit_acct)
               OR NOT EXISTS (SELECT 1 FROM sawyan.chart_of_accounts WHERE account_code = v_credit_acct)
            THEN
                RAISE EXCEPTION 'UNKNOWN_COA_ACCOUNT_CODE_IN_MANUAL_ADJUSTMENT';
            END IF;

            INSERT INTO sawyan.journal_entries (
                settlement_cycle_id, source_type, source_id, country_id, fx_rate_used, description, posted_at
            ) VALUES (
                v_adj_cycle.id, 'MANUAL_AUDIT_ADJUSTMENT', p_request_id, v_adj_cycle.country_id, 1.000000, v_req.reason, sawyan.now_utc()
            ) RETURNING id INTO v_adj_je_id;

            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
            VALUES
                (v_adj_je_id, v_debit_acct,  NULLIF(trim(COALESCE(v_req.payload_after->>'debit_entity_type', '')), ''),  NULLIF(trim(COALESCE(v_req.payload_after->>'debit_entity_id', '')), '')::uuid,  v_adj_amt, 0.00, v_adj_amt, 'USD'),
                (v_adj_je_id, v_credit_acct, NULLIF(trim(COALESCE(v_req.payload_after->>'credit_entity_type', '')), ''), NULLIF(trim(COALESCE(v_req.payload_after->>'credit_entity_id', '')), '')::uuid, 0.00, v_adj_amt, v_adj_amt, 'USD');

            PERFORM sawyan.append_audit_log(
                'admin',
                p_admin_id,
                'manual_audit_journal_adjustment_posted',
                'journal_entries',
                v_adj_je_id::text,
                NULL,
                jsonb_build_object('period_ym', v_bg_ym, 'debit_account_code', v_debit_acct, 'credit_account_code', v_credit_acct, 'amount_usd', v_adj_amt, 'reason', v_req.reason)
            );

            v_exec_effect := jsonb_build_object(
                'effect', 'manual_audit_journal_posted',
                'journal_entry_id', v_adj_je_id,
                'period_ym', v_bg_ym,
                'amount_usd', v_adj_amt
            );

        ELSIF v_req.action_type = 'MERCHANT_CREDIT_EXCEPTION_D4' THEN
            UPDATE sawyan.merchants
               SET credit_limit                    = COALESCE((v_req.payload_after->>'credit_limit')::numeric, credit_limit),
                   deferred_settlement_cap_amount  = COALESCE((v_req.payload_after->>'deferred_settlement_cap_amount')::numeric, deferred_settlement_cap_amount),
                   deferred_settlement_cutoff_time = COALESCE((v_req.payload_after->>'deferred_settlement_cutoff_time')::time, deferred_settlement_cutoff_time),
                   d4_cycle_days_override          = COALESCE((v_req.payload_after->>'d4_cycle_days_override')::smallint, d4_cycle_days_override),
                   d4_grace_hours_override         = COALESCE((v_req.payload_after->>'d4_grace_hours_override')::numeric, d4_grace_hours_override)
             WHERE id = (v_req.payload_after->>'merchant_id')::uuid;
            PERFORM sawyan.sync_merchant_status_flags((v_req.payload_after->>'merchant_id')::uuid);
            v_exec_effect := jsonb_build_object('effect', 'merchant_credit_exception_applied_d4', 'merchant_id', v_req.payload_after->>'merchant_id');

        ELSIF v_req.action_type = 'WITHDRAWAL_DUAL_APPROVAL_W05' THEN
            UPDATE sawyan.wallet_transactions SET status = 'completed' WHERE id = (v_req.target_id)::uuid AND transaction_type = 'withdrawal';
            v_exec_effect := jsonb_build_object('effect', 'withdrawal_w05_dual_completed', 'wallet_tx_id', v_req.target_id);
        END IF;
    END IF;

    RETURN v_mc_res || jsonb_build_object('execution', v_exec_effect);
END;
$$;

-- ============================================================================
-- 11. Strict Least-Privilege Grants (Zero Leaked Internal Helpers)
-- ============================================================================
REVOKE ALL ON FUNCTION sawyan.verify_cashier_session(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.verify_cashier_session(UUID, TEXT, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION sawyan.authenticate_employee_login(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_employee_login(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.employee_change_pin(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.employee_change_pin(UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.employee_lock_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.employee_lock_session(UUID, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.get_employee_verification_bundle(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.get_employee_verification_bundle(UUID, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.employee_lookup_member(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.employee_lookup_member(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.employee_decide_pending_tx(UUID, TEXT, UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.employee_decide_pending_tx(UUID, TEXT, UUID, VARCHAR, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.employee_create_verification_tx(UUID, TEXT, BIGINT, NUMERIC, VARCHAR, UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.employee_create_verification_tx(UUID, TEXT, BIGINT, NUMERIC, VARCHAR, UUID, VARCHAR, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.submit_pos_transaction(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.submit_pos_transaction(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, BOOLEAN, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.confirm_or_reject_pending_tx(UUID, UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.confirm_or_reject_pending_tx(UUID, UUID, VARCHAR, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID, JSONB) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION sawyan.admin_decide_governance_request(UUID, TEXT, UUID, VARCHAR, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.admin_decide_governance_request(UUID, TEXT, UUID, VARCHAR, TEXT) TO anon, authenticated, service_role;
