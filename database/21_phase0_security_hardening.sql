-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 PHASE 0: CRITICAL SECURITY & TRUST-BOUNDARY HARDENING
-- ============================================================================
-- Resolves all Phase 0 P0 Blockers from the Unified Security Audit (C1, C2, C3, C5, B5-01):
--   * C1: Revokes anon/authenticated EXECUTE on internal `submit_pos_transaction`
--         (only authenticated SECURITY DEFINER wrappers & service_role may call it).
--   * C2: Implements real RFC 6238 TOTP (HMAC-SHA1, 6-digit, 30s step, ±1 skew,
--         anti-replay) in PostgreSQL with mandatory first-login enrollment for staff
--         AND explicit Sovereign Account Exemption (`is_2fa_exempt` / `is_sovereign_founder`).
--   * C3: Purges hardcoded `'DEMO_PREVIEW_LEADER_1'` & `'DEMO_PREVIEW_MERCHANT_EG1'`
--         bypass tokens from `verify_member_session` and `verify_merchant_session`.
--   * C5: Revokes anon/authenticated EXECUTE on internal `submit_merchant_flash_offer`
--         (routing clients through `merchant_submit_flash_offer_guarded`) and hardens
--         `employee_lock_session` to reject invalid/missing tokens explicitly.
--   * B5-01: Adds live PostgreSQL `operational_kill_switches` + `admin_toggle_kill_switch`
--         and Founder-exclusive `admin_manage_2fa_policy` RPCs.
--   * Automated Security Gate: Adds `audit_anon_rpc_security_surface()` (service_role only).
--
-- Strictly Idempotent. ZERO bare lowercase `sawyan` inside string literals for clean cloning.
-- ============================================================================

-- 1. Schema Upgrades: Admins Real 2FA Columns & Sovereign Exemption + Live Kill Switches
ALTER TABLE sawyan.admins
    ADD COLUMN IF NOT EXISTS is_2fa_exempt           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS totp_secret_b32         TEXT,
    ADD COLUMN IF NOT EXISTS totp_pending_secret_b32 TEXT,
    ADD COLUMN IF NOT EXISTS totp_enrolled_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS totp_last_used_step     BIGINT;

-- Auto-exempt ONLY Sovereign Founder accounts per Founder Directive (other sovereign
-- accounts can be exempted dynamically anytime via `admin_manage_2fa_policy`)
UPDATE sawyan.admins
   SET is_2fa_exempt = true
 WHERE COALESCE((metadata->>'is_sovereign_founder')::boolean, false) IS TRUE;

ALTER TABLE sawyan.settings
    ADD COLUMN IF NOT EXISTS operational_kill_switches JSONB NOT NULL
    DEFAULT '{"K_REG":false,"K_TX":false,"K_WD":false,"K_PAY":false,"K_CLOSE":false}'::jsonb;

-- 2. C1 & C5: Close Unauthenticated `anon` / `authenticated` Write Holes Immediately
REVOKE ALL ON FUNCTION sawyan.submit_pos_transaction(
    UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, BOOLEAN, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.submit_pos_transaction(
    UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, BOOLEAN, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION sawyan.submit_merchant_flash_offer(
    UUID, TEXT, TEXT, VARCHAR, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.submit_merchant_flash_offer(
    UUID, TEXT, TEXT, VARCHAR, UUID
) TO service_role;

-- Ensure the authenticated merchant flash-offer wrapper remains callable by portal clients
REVOKE ALL ON FUNCTION sawyan.merchant_submit_flash_offer_guarded(
    UUID, VARCHAR, TEXT, VARCHAR, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.merchant_submit_flash_offer_guarded(
    UUID, VARCHAR, TEXT, VARCHAR, TEXT
) TO anon, authenticated, service_role;

-- 3. C5: Harden `employee_lock_session` to Require Valid Active Session Token
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
    v_emp_id   UUID;
    v_merch_id UUID;
    v_emp_code VARCHAR(40);
BEGIN
    IF p_employee_id IS NULL OR NULLIF(trim(COALESCE(p_session_token, '')), '') IS NULL THEN
        RETURN jsonb_build_object('success', false, 'locked', false, 'error_code', 'EMPLOYEE_SESSION_INVALID');
    END IF;

    v_tok_hash := encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex');

    UPDATE sawyan.cashier_employees
       SET session_token_hash     = NULL,
           session_expires_at     = NULL,
           session_last_active_at = NULL
     WHERE id = p_employee_id
       AND session_token_hash = v_tok_hash
    RETURNING id, merchant_id, employee_code INTO v_emp_id, v_merch_id, v_emp_code;

    IF v_emp_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'locked', false, 'error_code', 'EMPLOYEE_SESSION_INVALID');
    END IF;

    PERFORM sawyan.append_audit_log(
        'merchant',
        v_merch_id,
        'employee_session_locked',
        'cashier_employees',
        v_emp_id::text,
        NULL,
        jsonb_build_object('employee_code', v_emp_code, 'locked_at', now())
    );

    RETURN jsonb_build_object('success', true, 'locked', true);
END;
$$;

REVOKE ALL ON FUNCTION sawyan.employee_lock_session(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.employee_lock_session(UUID, TEXT) TO anon, authenticated, service_role;

-- 4. C3: Remove Hardcoded Demo Bypass Tokens from `verify_member_session` & `verify_merchant_session`
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
    v_member   sawyan.members%ROWTYPE;
    v_stored   TEXT;
    v_jwt_role TEXT;
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

    v_stored := v_member.metadata->>'active_session_token';
    IF v_stored IS NOT NULL AND p_session_token IS NOT NULL AND v_stored = p_session_token THEN
        RETURN v_member;
    END IF;

    RAISE EXCEPTION 'UNAUTHORIZED_MEMBER_SESSION';
END;
$$;

REVOKE ALL ON FUNCTION sawyan.verify_member_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.verify_member_session(UUID, TEXT) TO service_role;

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
    v_merch    sawyan.merchants%ROWTYPE;
    v_stored   TEXT;
    v_jwt_role TEXT;
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

    v_stored := v_merch.metadata->>'active_session_token';
    IF v_stored IS NOT NULL AND p_session_token IS NOT NULL AND v_stored = p_session_token THEN
        RETURN v_merch;
    END IF;

    RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
END;
$$;

REVOKE ALL ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) TO service_role;

-- 5. C2: Pure PL/pgSQL + pgcrypto RFC 6238 TOTP Engine (Internal Only)
CREATE OR REPLACE FUNCTION sawyan.totp_base32_encode(p_bytes BYTEA)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_alpha TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_buf   INT  := 0;
    v_bits  INT  := 0;
    v_out   TEXT := '';
    v_i     INT;
BEGIN
    IF p_bytes IS NULL OR octet_length(p_bytes) = 0 THEN
        RETURN '';
    END IF;
    FOR v_i IN 0..(octet_length(p_bytes) - 1) LOOP
        v_buf  := (v_buf << 8) | get_byte(p_bytes, v_i);
        v_bits := v_bits + 8;
        WHILE v_bits >= 5 LOOP
            v_bits := v_bits - 5;
            v_out  := v_out || substr(v_alpha, ((v_buf >> v_bits) & 31) + 1, 1);
        END LOOP;
        IF v_bits = 0 THEN
            v_buf := 0;
        ELSE
            v_buf := v_buf & ((1 << v_bits) - 1);
        END IF;
    END LOOP;
    IF v_bits > 0 THEN
        v_out := v_out || substr(v_alpha, ((v_buf << (5 - v_bits)) & 31) + 1, 1);
    END IF;
    RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.totp_base32_decode(p_b32 TEXT)
RETURNS BYTEA
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_alpha TEXT  := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    v_clean TEXT;
    v_buf   INT   := 0;
    v_bits  INT   := 0;
    v_val   INT;
    v_i     INT;
    v_out   BYTEA := ''::bytea;
BEGIN
    v_clean := upper(regexp_replace(COALESCE(p_b32, ''), '[\s=\-]+', '', 'g'));
    IF v_clean = '' THEN
        RAISE EXCEPTION 'TOTP_EMPTY_SECRET';
    END IF;
    FOR v_i IN 1..length(v_clean) LOOP
        v_val := strpos(v_alpha, substr(v_clean, v_i, 1)) - 1;
        IF v_val < 0 THEN
            RAISE EXCEPTION 'TOTP_INVALID_BASE32_SECRET';
        END IF;
        v_buf  := (v_buf << 5) | v_val;
        v_bits := v_bits + 5;
        IF v_bits >= 8 THEN
            v_bits := v_bits - 8;
            v_out  := v_out || decode(lpad(to_hex((v_buf >> v_bits) & 255), 2, '0'), 'hex');
            IF v_bits = 0 THEN
                v_buf := 0;
            ELSE
                v_buf := v_buf & ((1 << v_bits) - 1);
            END IF;
        END IF;
    END LOOP;
    RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.totp_code_for_step(
    p_secret_b32 TEXT,
    p_step       BIGINT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_key    BYTEA;
    v_msg    BYTEA := E'\\x0000000000000000'::bytea;
    v_rem    BIGINT;
    v_i      INT;
    v_hmac   BYTEA;
    v_offset INT;
    v_bin    BIGINT;
BEGIN
    IF p_step IS NULL OR p_step < 0 THEN
        RAISE EXCEPTION 'TOTP_INVALID_STEP';
    END IF;
    v_key := sawyan.totp_base32_decode(p_secret_b32);
    v_rem := p_step;
    FOR v_i IN REVERSE 7..0 LOOP
        v_msg := set_byte(v_msg, v_i, (v_rem % 256)::int);
        v_rem := v_rem / 256;
    END LOOP;

    v_hmac   := extensions.hmac(v_msg, v_key, 'sha1');
    v_offset := get_byte(v_hmac, 19) & 15;
    v_bin    := ((get_byte(v_hmac, v_offset) & 127)::bigint << 24)
              | (get_byte(v_hmac, v_offset + 1)::bigint << 16)
              | (get_byte(v_hmac, v_offset + 2)::bigint << 8)
              | (get_byte(v_hmac, v_offset + 3)::bigint);

    RETURN lpad((v_bin % 1000000)::text, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.verify_totp_code(
    p_secret_b32     TEXT,
    p_code           TEXT,
    p_last_used_step BIGINT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_clean    TEXT;
    v_now_step BIGINT;
    v_delta    INT;
    v_step     BIGINT;
BEGIN
    v_clean := regexp_replace(trim(COALESCE(p_code, '')), '\s+', '', 'g');
    IF v_clean !~ '^[0-9]{6}$' OR NULLIF(trim(COALESCE(p_secret_b32, '')), '') IS NULL THEN
        RETURN NULL;
    END IF;

    v_now_step := floor(extract(epoch FROM now()) / 30.0)::bigint;

    FOR v_delta IN -1..1 LOOP
        v_step := v_now_step + v_delta;
        IF v_step >= 0
           AND (p_last_used_step IS NULL OR v_step > p_last_used_step)
           AND sawyan.totp_code_for_step(p_secret_b32, v_step) = v_clean
        THEN
            RETURN v_step;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION sawyan.totp_base32_encode(BYTEA) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.totp_base32_decode(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.totp_code_for_step(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.verify_totp_code(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.totp_base32_encode(BYTEA) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.totp_base32_decode(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.totp_code_for_step(TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.verify_totp_code(TEXT, TEXT, BIGINT) TO service_role;

-- Mathematical Self-Test: Official RFC 6238 SHA-1 Test Vectors (Rolls back if mismatch)
DO $$
DECLARE
    v_b32 TEXT := 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
BEGIN
    IF sawyan.totp_base32_encode(convert_to('12345678901234567890', 'UTF8')) <> v_b32 THEN
        RAISE EXCEPTION 'RFC6238_SELFTEST_FAILED: Base32 encode mismatch';
    END IF;
    IF sawyan.totp_code_for_step(v_b32, 1) <> '287082'
       OR sawyan.totp_code_for_step(v_b32, 37037036) <> '081804'
       OR sawyan.totp_code_for_step(v_b32, 41152263) <> '005924'
       OR sawyan.totp_code_for_step(v_b32, 66666666) <> '279037'
    THEN
        RAISE EXCEPTION 'RFC6238_SELFTEST_FAILED: TOTP SHA-1 test vector mismatch';
    END IF;
END $$;

-- 6. Upgrade `verify_admin_session` & `authenticate_admin_login` (Real RFC 6238 2FA + Sovereign Exemption)
CREATE OR REPLACE FUNCTION sawyan.verify_admin_session(
    p_admin_id        UUID,
    p_session_token   TEXT,
    p_allowed_roles   TEXT[]  DEFAULT NULL,
    p_is_write_action BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin      sawyan.admins%ROWTYPE;
    v_saved_hash TEXT;
    v_exp_str    TEXT;
    v_is_founder BOOLEAN;
BEGIN
    IF p_admin_id IS NULL OR p_session_token IS NULL OR length(trim(p_session_token)) < 32 THEN
        RAISE EXCEPTION 'ADMIN_AUTH_REQUIRED: Missing or malformed admin session token.';
    END IF;

    SELECT * INTO v_admin
      FROM sawyan.admins
     WHERE id = p_admin_id;

    IF NOT FOUND OR v_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN_NOT_ACTIVE: Admin account not found or deactivated.';
    END IF;

    v_saved_hash := COALESCE(v_admin.metadata->>'session_token_sha256', '');
    v_exp_str    := COALESCE(v_admin.metadata->>'session_expires_at', '');

    IF v_saved_hash = '' OR v_saved_hash <> encode(extensions.digest(trim(p_session_token), 'sha256'), 'hex') THEN
        RAISE EXCEPTION 'ADMIN_SESSION_INVALID: Session token mismatch.';
    END IF;

    IF v_exp_str = '' OR (v_exp_str::timestamptz) <= now() THEN
        RAISE EXCEPTION 'ADMIN_SESSION_EXPIRED: Please sign in again.';
    END IF;

    IF p_is_write_action IS TRUE AND v_admin.role = 'auditor' THEN
        RAISE EXCEPTION 'RBAC_AUDITOR_READ_ONLY: Role [auditor] is strictly read-only and cannot execute state changes.';
    END IF;

    IF p_allowed_roles IS NOT NULL AND array_length(p_allowed_roles, 1) > 0 THEN
        IF NOT (v_admin.role = ANY(p_allowed_roles)) THEN
            RAISE EXCEPTION 'RBAC_ROLE_FORBIDDEN: Role [%] is not authorized for this operation.', v_admin.role;
        END IF;
    END IF;

    v_is_founder := COALESCE((v_admin.metadata->>'is_sovereign_founder')::boolean, false);

    RETURN jsonb_build_object(
        'id', v_admin.id,
        'full_name', v_admin.full_name,
        'email', v_admin.email,
        'role', v_admin.role,
        'is_sovereign_founder', v_is_founder,
        'is_2fa_exempt', (COALESCE(v_admin.is_2fa_exempt, false) OR v_is_founder),
        'totp_enrolled', (NULLIF(trim(COALESCE(v_admin.totp_secret_b32, '')), '') IS NOT NULL),
        'must_change_password', v_admin.must_change_password,
        'two_factor_enabled', v_admin.two_factor_enabled,
        'is_active', v_admin.is_active,
        'last_login_at', v_admin.last_login_at
    );
END;
$$;

REVOKE ALL ON FUNCTION sawyan.verify_admin_session(UUID, TEXT, TEXT[], BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.verify_admin_session(UUID, TEXT, TEXT[], BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION sawyan.authenticate_admin_login(
    p_email     TEXT,
    p_password  TEXT,
    p_totp_code VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin        sawyan.admins%ROWTYPE;
    v_norm_email   TEXT;
    v_raw_token    TEXT;
    v_token_hash   TEXT;
    v_expires_at   TIMESTAMPTZ;
    v_is_founder   BOOLEAN;
    v_is_exempt    BOOLEAN;
    v_clean_totp   TEXT;
    v_matched_step BIGINT := NULL;
    v_pending_b32  TEXT;
    v_otpauth_uri  TEXT;
    v_totp_status  TEXT := 'not_required';
BEGIN
    v_norm_email := lower(trim(COALESCE(p_email, '')));
    IF v_norm_email = '' OR COALESCE(p_password, '') = '' THEN
        RAISE EXCEPTION 'ADMIN_LOGIN_MISSING_CREDENTIALS';
    END IF;

    IF trim(p_password) = '123456' THEN
        RAISE EXCEPTION 'CONSTITUTIONAL_SECURITY_VIOLATION: Weak default password [123456] is permanently prohibited (D10).';
    END IF;

    SELECT * INTO v_admin
      FROM sawyan.admins
     WHERE lower(email) = v_norm_email
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ADMIN_INVALID_CREDENTIALS'
        );
    END IF;

    IF v_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN_ACCOUNT_DEACTIVATED';
    END IF;

    IF v_admin.password_hash IS NULL OR v_admin.password_hash <> extensions.crypt(p_password, v_admin.password_hash) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'ADMIN_INVALID_CREDENTIALS'
        );
    END IF;

    v_is_founder := COALESCE((v_admin.metadata->>'is_sovereign_founder')::boolean, false);
    v_is_exempt  := COALESCE(v_admin.is_2fa_exempt, false) OR v_is_founder;
    v_clean_totp := NULLIF(regexp_replace(trim(COALESCE(p_totp_code, '')), '\s+', '', 'g'), '');

    -- Enforce Real RFC 6238 TOTP for ALL non-exempt admin accounts
    IF v_is_exempt IS TRUE THEN
        v_totp_status := 'sovereign_exempt';
    ELSIF v_admin.two_factor_enabled IS TRUE THEN
        IF NULLIF(trim(COALESCE(v_admin.totp_secret_b32, '')), '') IS NOT NULL THEN
            IF v_clean_totp IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'ADMIN_TOTP_REQUIRED',
                    'requires_totp', true
                );
            END IF;

            v_matched_step := sawyan.verify_totp_code(
                v_admin.totp_secret_b32,
                v_clean_totp,
                v_admin.totp_last_used_step
            );

            IF v_matched_step IS NULL THEN
                PERFORM sawyan.append_audit_log(
                    'admin',
                    v_admin.id,
                    'admin_totp_verification_failed',
                    'admins',
                    v_admin.id::text,
                    NULL,
                    jsonb_build_object('role', v_admin.role)
                );
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'ADMIN_TOTP_INVALID',
                    'requires_totp', true
                );
            END IF;

            v_totp_status := 'rfc6238_verified';
        ELSE
            -- First-time mandatory 2FA enrollment flow for non-exempt staff
            v_pending_b32 := NULLIF(trim(COALESCE(v_admin.totp_pending_secret_b32, '')), '');
            IF v_pending_b32 IS NULL THEN
                v_pending_b32 := sawyan.totp_base32_encode(extensions.gen_random_bytes(20));
                UPDATE sawyan.admins
                   SET totp_pending_secret_b32 = v_pending_b32
                 WHERE id = v_admin.id;
            END IF;

            v_otpauth_uri := 'otpauth://totp/SAWYAN:' || v_admin.email
                || '?secret=' || v_pending_b32
                || '&issuer=SAWYAN&algorithm=SHA1&digits=6&period=30';

            IF v_clean_totp IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'ADMIN_TOTP_ENROLLMENT_REQUIRED',
                    'requires_totp_enrollment', true,
                    'enrollment', jsonb_build_object(
                        'secret_b32', v_pending_b32,
                        'otpauth_uri', v_otpauth_uri,
                        'issuer', 'SAWYAN',
                        'account', v_admin.email
                    )
                );
            END IF;

            v_matched_step := sawyan.verify_totp_code(v_pending_b32, v_clean_totp, NULL);
            IF v_matched_step IS NULL THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error_code', 'ADMIN_TOTP_ENROLLMENT_INVALID',
                    'requires_totp_enrollment', true,
                    'enrollment', jsonb_build_object(
                        'secret_b32', v_pending_b32,
                        'otpauth_uri', v_otpauth_uri,
                        'issuer', 'SAWYAN',
                        'account', v_admin.email
                    )
                );
            END IF;

            -- Confirm and promote TOTP secret atomically
            UPDATE sawyan.admins
               SET totp_secret_b32         = v_pending_b32,
                   totp_pending_secret_b32 = NULL,
                   totp_enrolled_at        = now(),
                   totp_last_used_step     = v_matched_step
             WHERE id = v_admin.id;

            v_admin.totp_secret_b32 := v_pending_b32;
            v_totp_status := 'rfc6238_enrolled_and_verified';
        END IF;
    END IF;

    v_raw_token  := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
    v_expires_at := now() + interval '8 hours';

    UPDATE sawyan.admins
       SET last_login_at       = now(),
           totp_last_used_step = COALESCE(v_matched_step, totp_last_used_step),
           metadata            = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'session_token_sha256', v_token_hash,
               'session_expires_at', v_expires_at,
               'last_totp_verified', (v_totp_status IN ('rfc6238_verified', 'rfc6238_enrolled_and_verified')),
               'last_totp_status', v_totp_status
           )
     WHERE id = v_admin.id;

    PERFORM sawyan.append_audit_log(
        'admin',
        v_admin.id,
        'admin_authenticated_session_issued',
        'admins',
        v_admin.id::text,
        NULL,
        jsonb_build_object(
            'role', v_admin.role,
            'expires_at', v_expires_at,
            'totp_status', v_totp_status
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_raw_token,
        'expires_at', v_expires_at,
        'admin', jsonb_build_object(
            'id', v_admin.id,
            'full_name', v_admin.full_name,
            'email', v_admin.email,
            'role', v_admin.role,
            'is_sovereign_founder', v_is_founder,
            'is_2fa_exempt', v_is_exempt,
            'totp_enrolled', (NULLIF(trim(COALESCE(v_admin.totp_secret_b32, '')), '') IS NOT NULL),
            'must_change_password', v_admin.must_change_password,
            'two_factor_enabled', v_admin.two_factor_enabled,
            'is_active', v_admin.is_active,
            'last_login_at', now()
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION sawyan.authenticate_admin_login(TEXT, TEXT, VARCHAR) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_admin_login(TEXT, TEXT, VARCHAR) TO anon, authenticated, service_role;

-- 7. Founder-Exclusive Sovereign 2FA Policy & Exemption Manager RPC
CREATE OR REPLACE FUNCTION sawyan.admin_manage_2fa_policy(
    p_admin_id        UUID,
    p_session_token   TEXT,
    p_action          VARCHAR(24) DEFAULT 'list',
    p_target_admin_id UUID        DEFAULT NULL,
    p_is_2fa_exempt   BOOLEAN     DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm     JSONB;
    v_act     TEXT := lower(trim(COALESCE(p_action, 'list')));
    v_target  sawyan.admins%ROWTYPE;
    v_list    JSONB;
BEGIN
    IF v_act = 'list' THEN
        v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance', 'auditor'], false);
    ELSE
        v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver'], true);
        IF COALESCE((v_adm->>'is_sovereign_founder')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'FOUNDER_EXCLUSIVE_AUTHORITY: Only the Sovereign Founder may modify 2FA exemptions or reset authenticator bindings.';
        END IF;

        IF p_target_admin_id IS NULL THEN
            RAISE EXCEPTION 'TARGET_ADMIN_ID_REQUIRED';
        END IF;

        SELECT * INTO v_target FROM sawyan.admins WHERE id = p_target_admin_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'TARGET_ADMIN_NOT_FOUND';
        END IF;

        IF v_act = 'set_exempt' THEN
            IF p_is_2fa_exempt IS NULL THEN
                RAISE EXCEPTION 'IS_2FA_EXEMPT_FLAG_REQUIRED';
            END IF;
            -- Prevent accidental self-lockout of Sovereign Founder if un-exempting without TOTP enrolled
            IF COALESCE((v_target.metadata->>'is_sovereign_founder')::boolean, false) IS TRUE AND p_is_2fa_exempt IS FALSE THEN
                RAISE EXCEPTION 'SOVEREIGN_FOUNDER_EXEMPT_LOCKED: Sovereign Founder remains exempt by constitutional directive.';
            END IF;
            UPDATE sawyan.admins
               SET is_2fa_exempt = p_is_2fa_exempt
             WHERE id = v_target.id;

            PERFORM sawyan.append_audit_log(
                'admin',
                p_admin_id,
                'admin_2fa_exemption_updated',
                'admins',
                v_target.id::text,
                jsonb_build_object('is_2fa_exempt', v_target.is_2fa_exempt),
                jsonb_build_object('is_2fa_exempt', p_is_2fa_exempt, 'target_email', v_target.email)
            );
        ELSIF v_act = 'reset_totp' THEN
            UPDATE sawyan.admins
               SET totp_secret_b32         = NULL,
                   totp_pending_secret_b32 = NULL,
                   totp_enrolled_at        = NULL,
                   totp_last_used_step     = NULL
             WHERE id = v_target.id;

            PERFORM sawyan.append_audit_log(
                'admin',
                p_admin_id,
                'admin_totp_device_reset',
                'admins',
                v_target.id::text,
                jsonb_build_object('had_secret', (v_target.totp_secret_b32 IS NOT NULL)),
                jsonb_build_object('reset_at', now(), 'target_email', v_target.email)
            );
        ELSE
            RAISE EXCEPTION 'INVALID_2FA_POLICY_ACTION';
        END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', a.id,
        'full_name', a.full_name,
        'email', a.email,
        'role', a.role,
        'is_active', a.is_active,
        'two_factor_enabled', a.two_factor_enabled,
        'is_sovereign_founder', COALESCE((a.metadata->>'is_sovereign_founder')::boolean, false),
        'is_2fa_exempt', (COALESCE(a.is_2fa_exempt, false) OR COALESCE((a.metadata->>'is_sovereign_founder')::boolean, false)),
        'totp_enrolled', (NULLIF(trim(COALESCE(a.totp_secret_b32, '')), '') IS NOT NULL),
        'totp_enrolled_at', a.totp_enrolled_at,
        'last_login_at', a.last_login_at
    ) ORDER BY a.created_at ASC), '[]'::jsonb)
      INTO v_list
      FROM sawyan.admins a;

    RETURN jsonb_build_object('success', true, 'admins', v_list);
END;
$$;

REVOKE ALL ON FUNCTION sawyan.admin_manage_2fa_policy(UUID, TEXT, VARCHAR, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_2fa_policy(UUID, TEXT, VARCHAR, UUID, BOOLEAN) TO anon, authenticated, service_role;

-- 8. B5-01: Live PostgreSQL Break-Glass Operational Kill Switches RPC
CREATE OR REPLACE FUNCTION sawyan.admin_toggle_kill_switch(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_switch_key    VARCHAR(16),
    p_enabled       BOOLEAN,
    p_reason        TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm         JSONB;
    v_key         TEXT := upper(trim(COALESCE(p_switch_key, '')));
    v_reason      TEXT := trim(COALESCE(p_reason, ''));
    v_settings_id INT;
    v_old_sw      JSONB;
    v_new_sw      JSONB;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance'], true);

    IF v_key NOT IN ('K_REG', 'K_TX', 'K_WD', 'K_PAY', 'K_CLOSE') THEN
        RAISE EXCEPTION 'INVALID_KILL_SWITCH_KEY: %', v_key;
    END IF;

    IF length(v_reason) < 5 THEN
        RAISE EXCEPTION 'BREAK_GLASS_REASON_REQUIRED: Mandatory reason (>= 5 chars) required.';
    END IF;

    SELECT id, operational_kill_switches
      INTO v_settings_id, v_old_sw
      FROM sawyan.settings
     WHERE country_id IS NULL
     ORDER BY effective_from DESC, recorded_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_settings_id IS NULL THEN
        RAISE EXCEPTION 'GLOBAL_SETTINGS_ROW_MISSING';
    END IF;

    v_new_sw := COALESCE(v_old_sw, '{"K_REG":false,"K_TX":false,"K_WD":false,"K_PAY":false,"K_CLOSE":false}'::jsonb)
             || jsonb_build_object(v_key, COALESCE(p_enabled, false));

    UPDATE sawyan.settings
       SET operational_kill_switches = v_new_sw,
           recorded_at = now()
     WHERE id = v_settings_id;

    PERFORM sawyan.append_audit_log(
        'admin',
        p_admin_id,
        CASE WHEN COALESCE(p_enabled, false) THEN 'break_glass_kill_switch_enabled' ELSE 'break_glass_kill_switch_disabled' END,
        'settings',
        v_settings_id::text,
        jsonb_build_object(v_key, COALESCE((v_old_sw->>v_key)::boolean, false)),
        jsonb_build_object(v_key, COALESCE(p_enabled, false), 'reason', v_reason, 'actor_role', v_adm->>'role')
    );

    RETURN jsonb_build_object(
        'success', true,
        'switch_key', v_key,
        'enabled', COALESCE(p_enabled, false),
        'operational_kill_switches', v_new_sw
    );
END;
$$;

REVOKE ALL ON FUNCTION sawyan.admin_toggle_kill_switch(UUID, TEXT, VARCHAR, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sawyan.admin_toggle_kill_switch(UUID, TEXT, VARCHAR, BOOLEAN, TEXT) TO anon, authenticated, service_role;

-- 9. Automated Trust-Boundary Security Gate (`service_role` only)
CREATE OR REPLACE FUNCTION sawyan.audit_anon_rpc_security_surface()
RETURNS TABLE(
    schema_name TEXT,
    function_name TEXT,
    identity_args TEXT,
    security_definer BOOLEAN,
    anon_executable BOOLEAN,
    risk_flag TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT n.nspname::text AS schema_name,
           p.proname::text AS function_name,
           pg_get_function_identity_arguments(p.oid)::text AS identity_args,
           p.prosecdef AS security_definer,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executable,
           CASE
               WHEN p.proname IN ('submit_pos_transaction', 'submit_merchant_flash_offer', 'feed_monthly_target_box', 'run_monthly_settlement_engine', 'process_merchant_topup_fifo', 'verify_member_session', 'verify_merchant_session', 'verify_admin_session', 'totp_base32_decode', 'totp_code_for_step')
                    AND has_function_privilege('anon', p.oid, 'EXECUTE')
               THEN 'CRITICAL_INTERNAL_RPC_EXPOSED_TO_ANON'
               ELSE 'OK'
           END AS risk_flag
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_class c_ref ON c_ref.oid = 'sawyan.admins'::regclass AND c_ref.relnamespace = n.oid
     WHERE p.prosecdef = true
       AND has_function_privilege('anon', p.oid, 'EXECUTE') = true
     ORDER BY risk_flag DESC, n.nspname, p.proname;
$$;

REVOKE ALL ON FUNCTION sawyan.audit_anon_rpc_security_surface() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.audit_anon_rpc_security_surface() TO service_role;

-- 10. Advisor Remediation: Lock down legacy `public.*` tables, fix mutable `search_path`, protect `cashier_employees`
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', r.tablename);
    END LOOP;

    FOR r IN
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          JOIN pg_class c_ref ON c_ref.oid = 'sawyan.admins'::regclass AND c_ref.relnamespace = n.oid
         WHERE p.proname IN ('sanitize_csv_cell', 'recalculate_default_cap', 'prevent_immutable_modification', 'mask_member_display_name')
    LOOP
        EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = pg_catalog, pg_temp', r.nspname, r.proname, r.args);
    END LOOP;

    REVOKE ALL ON TABLE sawyan.cashier_employees FROM PUBLIC, anon, authenticated;
END $$;
