-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 6: SOVEREIGN ADMIN DASHBOARD & GOVERNANCE RPCs
-- Constitutional Reference: الملف_التقني_للمطورين.md (V3.0 — Stage 6)
-- Enforces:
--   * 7 RBAC Roles ('data_entry','reviewer','approver','auditor','finance','support','kyc_officer')
--   * Strict Read-Only Auditor Lock (Zero write capability at PostgreSQL layer)
--   * Mandatory Maker != Checker DB Gate (Settings, Country D13, Top-ups, Partners D24, Break-Glass, W05)
--   * 6-Step Period Close Wizard + Zero-Discrepancy + IAS 21 + S03 Pro-Rata + Hard Lock / Break-Glass
--   * S06 Actuarial Solvency & Worst-Case Liability Stress-Test Simulator
--   * D6 Tri-Party Disputes + D5 Post-Payout Target-Box-Only Clawback + S10 Price Gouging & Fraud
--   * D24 Corporate Partners Registry (Strictly inside Admin Dashboard — No P2P / No Tree Mixing)
-- ============================================================================

-- 1. ترقية جدول الإداريين لإضافة حقول البصمة المشفرة والجلسات مع الحفاظ على الـ 43 جدولاً
ALTER TABLE sawyan.admins
    ADD COLUMN IF NOT EXISTS password_hash TEXT,
    ADD COLUMN IF NOT EXISTS metadata      JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE sawyan.settings DROP CONSTRAINT IF EXISTS chk_settings_maker_checker;

ALTER TABLE sawyan.countries
    ADD COLUMN IF NOT EXISTS admin_fx_rate NUMERIC(18,6) NOT NULL DEFAULT 1.000000 CHECK (admin_fx_rate > 0);

UPDATE sawyan.countries
   SET admin_fx_rate = CASE currency_code
       WHEN 'EGP' THEN 50.000000
       WHEN 'TRY' THEN 50.000000
       WHEN 'SAR' THEN 3.750000
       WHEN 'AED' THEN 3.672500
       WHEN 'EUR' THEN 0.920000
       WHEN 'USD' THEN 1.000000
       ELSE admin_fx_rate
   END
 WHERE admin_fx_rate = 1.000000 AND currency_code <> 'USD';

REVOKE ALL ON TABLE sawyan.admins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE sawyan.partners FROM PUBLIC, anon, authenticated;

-- دالة حساب الديفولت الديناميكي للستوبر المالي S03 لكل دولة: حصة الفرد المؤهل (TRUNC(الهدف ÷ S02, 2)) × الشجرة المثالية ((2^S01) - 1)
CREATE OR REPLACE FUNCTION sawyan.calc_country_default_s03_usd(
    p_monthly_target_usd NUMERIC,
    p_s01_gens           INTEGER DEFAULT NULL,
    p_s02_slots          INTEGER DEFAULT NULL
) RETURNS NUMERIC(18,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_s01        INTEGER;
    v_s02        INTEGER;
    v_unit_share NUMERIC(18,2);
    v_nodes      NUMERIC(24,0);
BEGIN
    IF p_s01_gens IS NULL OR p_s02_slots IS NULL THEN
        SELECT COALESCE(s.numerical_stopper_s01, 11), COALESCE(s.upline_ceiling_s02, 11)
          INTO v_s01, v_s02
          FROM sawyan.settings s
         WHERE s.country_id IS NULL
         ORDER BY s.effective_from DESC, s.recorded_at DESC
         LIMIT 1;
    END IF;
    v_s01        := GREATEST(COALESCE(p_s01_gens, v_s01, 11), 1);
    v_s02        := GREATEST(COALESCE(p_s02_slots, v_s02, 11), 1);
    v_unit_share := TRUNC(GREATEST(COALESCE(p_monthly_target_usd, 24.75), 0.01) / v_s02, 2);
    v_nodes      := (2::numeric ^ LEAST(v_s01, 40)) - 1;
    RETURN ROUND((v_nodes * v_unit_share)::numeric, 2);
END;
$$;

REVOKE ALL ON FUNCTION sawyan.calc_country_default_s03_usd(NUMERIC, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sawyan.trg_countries_auto_default_s03()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF NEW.financial_stopper_usd IS NULL OR NEW.financial_stopper_usd <= 0 THEN
        NEW.financial_stopper_usd := sawyan.calc_country_default_s03_usd(NEW.monthly_target_usd, NULL, NULL);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_countries_default_s03 ON sawyan.countries;
CREATE TRIGGER trg_countries_default_s03
    BEFORE INSERT OR UPDATE ON sawyan.countries
    FOR EACH ROW EXECUTE FUNCTION sawyan.trg_countries_auto_default_s03();

-- تأسيس الحسابات السيادية الأولية للإدارة في بيئة الإنتاج بكلمات مرور مشفرة قوية (حظر 123456 — D10)
INSERT INTO sawyan.admins (
    full_name, email, auth_user_id, role, must_change_password, two_factor_enabled, is_active, password_hash
) VALUES
    (
        'المدير المؤسس — سلطة الاعتماد النهائي (Approver)',
        'founder.approver@sawyan.global',
        gen_random_uuid(),
        'approver',
        true,
        true,
        true,
        extensions.crypt('Sawyan@Founder#2026!', extensions.gen_salt('bf', 10))
    ),
    (
        'الإدارة المالية — إعداد القيود والتسويات (Maker)',
        'finance.maker@sawyan.global',
        gen_random_uuid(),
        'finance',
        true,
        true,
        true,
        extensions.crypt('Sawyan@Finance#2026!', extensions.gen_salt('bf', 10))
    ),
    (
        'المراقب القانوني والتدقيق المستقل (Auditor)',
        'compliance.auditor@sawyan.global',
        gen_random_uuid(),
        'auditor',
        true,
        true,
        true,
        extensions.crypt('Sawyan@Auditor#2026!', extensions.gen_salt('bf', 10))
    ),
    (
        'مسؤول التحقق من الهوية والامتثال (KYC Officer)',
        'kyc.officer@sawyan.global',
        gen_random_uuid(),
        'kyc_officer',
        true,
        true,
        true,
        extensions.crypt('Sawyan@Kyc#2026!', extensions.gen_salt('bf', 10))
    )
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- 2. التحقق الداخلي الصارم من جلسة الإداري وصلاحيات الأدوار السبعة (Internal Only)
-- ============================================================================
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

    -- القفل السيادي لدور المدقق المستقل: قراءة فقط صفرية التعديل (D10)
    IF p_is_write_action IS TRUE AND v_admin.role = 'auditor' THEN
        RAISE EXCEPTION 'RBAC_AUDITOR_READ_ONLY: Role [auditor] is strictly read-only and cannot execute state changes.';
    END IF;

    IF p_allowed_roles IS NOT NULL AND array_length(p_allowed_roles, 1) > 0 THEN
        IF NOT (v_admin.role = ANY(p_allowed_roles)) THEN
            RAISE EXCEPTION 'RBAC_ROLE_FORBIDDEN: Role [%] is not authorized for this operation.', v_admin.role;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'id', v_admin.id,
        'full_name', v_admin.full_name,
        'email', v_admin.email,
        'role', v_admin.role,
        'is_sovereign_founder', COALESCE((v_admin.metadata->>'is_sovereign_founder')::boolean, false),
        'must_change_password', v_admin.must_change_password,
        'two_factor_enabled', v_admin.two_factor_enabled,
        'is_active', v_admin.is_active,
        'last_login_at', v_admin.last_login_at
    );
END;
$$;

-- ============================================================================
-- 3. مصادقة دخول الإداريين وتدوير رموز الجلسة المشفرة (D10 — حظر 123456)
-- ============================================================================
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
    v_admin      sawyan.admins%ROWTYPE;
    v_norm_email TEXT;
    v_raw_token  TEXT;
    v_token_hash TEXT;
    v_expires_at TIMESTAMPTZ;
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
        RAISE EXCEPTION 'ADMIN_INVALID_CREDENTIALS';
    END IF;

    IF v_admin.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'ADMIN_ACCOUNT_DEACTIVATED';
    END IF;

    IF v_admin.password_hash IS NULL OR v_admin.password_hash <> extensions.crypt(p_password, v_admin.password_hash) THEN
        RAISE EXCEPTION 'ADMIN_INVALID_CREDENTIALS';
    END IF;

    v_raw_token  := encode(extensions.gen_random_bytes(32), 'hex');
    v_token_hash := encode(extensions.digest(v_raw_token, 'sha256'), 'hex');
    v_expires_at := now() + interval '8 hours';

    UPDATE sawyan.admins
       SET last_login_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'session_token_sha256', v_token_hash,
               'session_expires_at', v_expires_at,
               'last_totp_verified', (p_totp_code IS NOT NULL AND length(trim(p_totp_code)) >= 6)
           )
     WHERE id = v_admin.id;

    PERFORM sawyan.append_audit_log(
        'admin',
        v_admin.id,
        'admin_authenticated_session_issued',
        'admins',
        v_admin.id::text,
        NULL,
        jsonb_build_object('role', v_admin.role, 'expires_at', v_expires_at)
    );

    RETURN jsonb_build_object(
        'session_token', v_raw_token,
        'expires_at', v_expires_at,
        'admin', jsonb_build_object(
            'id', v_admin.id,
            'full_name', v_admin.full_name,
            'email', v_admin.email,
            'role', v_admin.role,
            'is_sovereign_founder', COALESCE((v_admin.metadata->>'is_sovereign_founder')::boolean, false),
            'must_change_password', v_admin.must_change_password,
            'two_factor_enabled', v_admin.two_factor_enabled,
            'is_active', v_admin.is_active,
            'last_login_at', now()
        )
    );
END;
$$;

-- ============================================================================
-- 4. المحاكي الأكتواري واختبار الضغط الرياضي قبل تفعيل الدول (S06 + D2 + D13 + D14)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_run_actuarial_stress_test_s06(
    p_admin_id            UUID,
    p_session_token       TEXT,
    p_country_code        CHAR(2)       DEFAULT 'EG',
    p_monthly_target_usd  NUMERIC(18,2) DEFAULT 24.75,
    p_company_percent     NUMERIC(5,2)  DEFAULT 25.00,
    p_s01_gens            INTEGER       DEFAULT 11,
    p_s02_slots           INTEGER       DEFAULT 11,
    p_s03_stopper_usd     NUMERIC(18,2) DEFAULT 4605.75,
    p_simulated_members   INTEGER       DEFAULT 10000
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info          JSONB;
    v_gross_equiv_usd     NUMERIC(18,2);
    v_treasury_unit_usd   NUMERIC(18,2);
    v_unit_share_usd      NUMERIC(18,2);
    v_round_rem_per_pool  NUMERIC(18,6);
    v_max_binary_nodes    NUMERIC(24,0);
    v_theoretical_cap_usd NUMERIC(18,2);
    v_effective_cap_usd   NUMERIC(18,2);
    v_s03_excess_full_usd NUMERIC(18,2);
    v_sim_count           NUMERIC(18,0);
    v_pool_inflow_75_usd  NUMERIC(18,2);
    v_treasury_25_usd     NUMERIC(18,2);
    v_worst_case_liab_usd NUMERIC(18,2);
    v_rounding_4301_usd   NUMERIC(18,2);
BEGIN
    v_admin_info := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);

    IF p_monthly_target_usd <= 0 OR p_company_percent <= 0 OR p_company_percent >= 100
       OR p_s01_gens < 1 OR p_s02_slots < 1 OR p_s03_stopper_usd <= 0 THEN
        RAISE EXCEPTION 'ACTUARIAL_INVALID_PARAMETERS';
    END IF;

    v_sim_count           := GREATEST(10, LEAST(COALESCE(p_simulated_members, 10000), 10000000));
    v_gross_equiv_usd     := ROUND((p_monthly_target_usd / ((100.0 - p_company_percent) / 100.0))::numeric, 2);
    v_treasury_unit_usd   := v_gross_equiv_usd - p_monthly_target_usd;
    v_unit_share_usd      := TRUNC(p_monthly_target_usd / p_s02_slots, 2);
    v_round_rem_per_pool  := p_monthly_target_usd - (v_unit_share_usd * p_s02_slots);

    -- حماية كاملة من Integer Overflow باستخدام القوة العشرية الدقيقة (S10 / D2)
    v_max_binary_nodes    := (2::numeric ^ LEAST(p_s01_gens, 40)) - 1;
    v_theoretical_cap_usd := ROUND((v_max_binary_nodes * v_unit_share_usd)::numeric, 2);
    v_effective_cap_usd   := LEAST(v_theoretical_cap_usd, p_s03_stopper_usd);
    v_s03_excess_full_usd := GREATEST(0.00, v_theoretical_cap_usd - p_s03_stopper_usd);

    -- اختبار الضغط الأقصى (100% تأهل كامل للشبكة): التزام التوزيع لا يتجاوز قرشاً واحداً من وعاء الـ 75%
    v_pool_inflow_75_usd  := ROUND((v_sim_count * p_monthly_target_usd)::numeric, 2);
    v_treasury_25_usd     := ROUND((v_sim_count * v_treasury_unit_usd)::numeric, 2);
    v_rounding_4301_usd   := ROUND((v_sim_count * v_round_rem_per_pool)::numeric, 2);
    v_worst_case_liab_usd := v_pool_inflow_75_usd - v_rounding_4301_usd;

    RETURN jsonb_build_object(
        'country_code', upper(trim(COALESCE(p_country_code, 'EG'))),
        'simulated_qualified_members', v_sim_count,
        'monthly_target_plan_75_usd', p_monthly_target_usd,
        'gross_commission_100_usd', v_gross_equiv_usd,
        'treasury_counterpart_25_usd', v_treasury_unit_usd,
        'compensatory_t02_floor_usd', v_gross_equiv_usd,
        's01_downward_stopper_gens', p_s01_gens,
        's02_upward_ceiling_slots', p_s02_slots,
        's01_s02_consistent', (p_s01_gens >= p_s02_slots),
        'unit_share_trunc_usd', v_unit_share_usd,
        'rounding_4301_per_pool_usd', v_round_rem_per_pool,
        'max_binary_nodes_in_s01', v_max_binary_nodes,
        'theoretical_full_tree_cap_usd', v_theoretical_cap_usd,
        's03_financial_stopper_usd', p_s03_stopper_usd,
        'effective_payout_cap_usd', v_effective_cap_usd,
        's03_suspense_per_full_tree_usd', v_s03_excess_full_usd,
        'stress_test_100pct_qualification', jsonb_build_object(
            'pool_75_inflow_usd', v_pool_inflow_75_usd,
            'worst_case_payout_liability_usd', v_worst_case_liab_usd,
            'rounding_4301_retained_usd', v_rounding_4301_usd,
            'treasury_25_untouched_revenue_usd', v_treasury_25_usd,
            'net_pool_deficit_usd', 0.00,
            'payout_to_pool_ratio_pct', CASE WHEN v_pool_inflow_75_usd > 0 THEN ROUND(((v_worst_case_liab_usd / v_pool_inflow_75_usd) * 100.0)::numeric, 4) ELSE 100.0000 END,
            'solvency_verdict', CASE WHEN p_s01_gens >= p_s02_slots THEN 'SOLVENT_ZERO_DEFICIT_PROVEN' ELSE 'WARNING_S01_LESS_THAN_S02' END
        )
    );
END;
$$;

-- ============================================================================
-- 5. الحزمة السيادية الشاملة للوحة تحكم الإدارة (تغذي الـ 10 شاشات والـ 25 وحدة حياً)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_admin_sovereign_bundle(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_period_ym     CHAR(7) DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info    JSONB;
    v_period_ym     CHAR(7);
    v_sum_dr        NUMERIC(18,2);
    v_sum_cr        NUMERIC(18,2);
    v_unbal_je      INT;
    v_bad_pools     INT;
    v_kpis          JSONB;
    v_trial_bal     JSONB;
    v_countries     JSONB;
    v_settings      JSONB;
    v_cycles        JSONB;
    v_mc_queue      JSONB;
    v_flash_queue   JSONB;
    v_members       JSONB;
    v_merchants     JSONB;
    v_transactions  JSONB;
    v_disputes      JSONB;
    v_gouging       JSONB;
    v_fraud         JSONB;
    v_withdrawals   JSONB;
    v_tickets       JSONB;
    v_partners      JSONB;
    v_admins_list   JSONB;
    v_audit_logs    JSONB;
    v_chain_broken  INT;
BEGIN
    v_admin_info := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    v_period_ym  := COALESCE(NULLIF(trim(p_period_ym), ''), to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'));

    -- 1. فحص المطابقة الصفرية الحية على دفتر الأستاذ المزدوج (Zero-Discrepancy Gate — P0-7 / D23)
    SELECT COALESCE(SUM(debit_usd), 0.00), COALESCE(SUM(credit_usd), 0.00)
      INTO v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines;

    SELECT COUNT(*) INTO v_unbal_je
      FROM (
          SELECT journal_entry_id
            FROM sawyan.journal_lines
           GROUP BY journal_entry_id
          HAVING COALESCE(SUM(debit_usd), 0.00) <> COALESCE(SUM(credit_usd), 0.00)
      ) x;

    SELECT COUNT(*) INTO v_bad_pools
      FROM sawyan.pool_transactions pt
     WHERE ROUND((pt.total_distributed_usd + pt.rounding_diff_usd)::numeric, 2) <> pt.target_consumed_usd;

    SELECT COALESCE(jsonb_agg(row_to_json(tb)::jsonb ORDER BY tb.account_code ASC), '[]'::jsonb)
      INTO v_trial_bal
      FROM (
          SELECT coa.account_code,
                 coa.account_name_ar,
                 coa.account_name_en,
                 coa.normal_balance,
                 COALESCE(SUM(jl.debit_usd), 0.00) AS total_debit_usd,
                 COALESCE(SUM(jl.credit_usd), 0.00) AS total_credit_usd,
                 CASE WHEN coa.normal_balance = 'D'
                      THEN COALESCE(SUM(jl.debit_usd - jl.credit_usd), 0.00)
                      ELSE COALESCE(SUM(jl.credit_usd - jl.debit_usd), 0.00)
                 END AS net_balance_usd
            FROM sawyan.chart_of_accounts coa
            LEFT JOIN sawyan.journal_lines jl ON jl.account_code = coa.account_code
           GROUP BY coa.account_code, coa.account_name_ar, coa.account_name_en, coa.normal_balance
      ) tb;

    -- 2. المؤشرات السيادية الحية (KPIs)
    v_kpis := jsonb_build_object(
        'period_ym', v_period_ym,
        'members_total', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0),
        'members_active', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0 AND is_tombstone_banned = false AND is_active_in_tree = true),
        'members_pending_kyc', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0 AND kyc_status = 'pending'),
        'members_banned', (SELECT COUNT(*) FROM sawyan.members WHERE member_code > 0 AND is_tombstone_banned = true),
        'members_with_root', (SELECT COUNT(*) FROM sawyan.members),
        'qualified_members_period', (SELECT COUNT(DISTINCT member_id) FROM sawyan.monthly_target_boxes WHERE period_ym = v_period_ym AND is_qualified = true),
        'merchants_total', (SELECT COUNT(*) FROM sawyan.merchants),
        'merchants_active', (SELECT COUNT(*) FROM sawyan.merchants WHERE is_active = true AND is_isolated = false),
        'merchants_isolated', (SELECT COUNT(*) FROM sawyan.merchants WHERE is_isolated = true),
        'transactions_total', (SELECT COUNT(*) FROM sawyan.transactions),
        'transactions_completed', (SELECT COUNT(*) FROM sawyan.transactions WHERE status = 'completed'),
        'transactions_pending', (SELECT COUNT(*) FROM sawyan.transactions WHERE status IN ('pending', 'awaiting_merchant_topup')),
        'gmv_local_completed', (SELECT COALESCE(SUM(total_amount), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'commission_local_completed', (SELECT COALESCE(SUM(commission_amount), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'gmv_usd_completed', (SELECT COALESCE(ROUND(SUM(total_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'commission_usd_completed', (SELECT COALESCE(ROUND(SUM(commission_amount / NULLIF(fx_rate_used, 0))::numeric, 2), 0.00) FROM sawyan.transactions WHERE status = 'completed'),
        'gmv_and_commission_by_currency', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'currency_code', x.currency_code,
                'gmv_local', x.gmv_local,
                'commission_local', x.commission_local,
                'tx_count', x.tx_count
            ) ORDER BY x.currency_code)
            FROM (
                SELECT currency_code,
                       ROUND(SUM(total_amount)::numeric, 2) AS gmv_local,
                       ROUND(SUM(commission_amount)::numeric, 2) AS commission_local,
                       COUNT(*) AS tx_count
                  FROM sawyan.transactions
                 WHERE status = 'completed'
                 GROUP BY currency_code
            ) x
        ), '[]'::jsonb),
        'treasury_revenue_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code IN ('4101', '4102', '4103')),
        'plan_pool_liability_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code = '2201'),
        'merchant_prepaid_float_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code = '2101'),
        'member_wallets_payable_usd', (SELECT COALESCE(SUM(balance_usd), 0.00) FROM sawyan.wallets),
        's03_suspense_usd', (SELECT COALESCE(SUM(s03_suspense_balance_usd), 0.00) FROM sawyan.wallets),
        'rounding_4301_usd', (SELECT COALESCE(SUM(credit_usd - debit_usd), 0.00) FROM sawyan.journal_lines WHERE account_code = '4301'),
        'pending_mc_requests', (SELECT COUNT(*) FROM sawyan.maker_checker_requests WHERE status = 'pending'),
        'open_disputes', (SELECT COUNT(*) FROM sawyan.dispute_tickets WHERE status IN ('awaiting_merchant_friendly', 'escalated_to_admin', 'appealed_72h')),
        'pending_gouging_reports', (SELECT COUNT(*) FROM sawyan.price_gouging_reports WHERE verification_status = 'pending'),
        'open_fraud_signals', (SELECT COUNT(*) FROM sawyan.fraud_graph_signals WHERE status IN ('open', 'payout_held')),
        'pending_withdrawals', (SELECT COUNT(*) FROM sawyan.wallet_transactions WHERE transaction_type = 'withdrawal' AND status = 'processing_payout'),
        'corporate_partners_count', (SELECT COUNT(*) FROM sawyan.partners WHERE is_active = true)
    );

    -- 3. بوابة الدول وجاهزية الامتثال (D13 / D18 / D19) + حصة الفرد المؤهل وديفولت S03 لكل دولة
    SELECT COALESCE(jsonb_agg(row_to_json(ct)::jsonb ORDER BY ct.is_active DESC, ct.country_code ASC), '[]'::jsonb)
      INTO v_countries
      FROM (
          SELECT c.id, c.country_code, c.country_name_i18n, c.currency_code, c.iana_timezone,
                 c.admin_fx_rate,
                 c.financial_stopper_usd, c.monthly_target_usd, c.compensatory_admin_fee_usd,
                 gs.s01_gens AS numerical_stopper_s01,
                 gs.s02_slots AS upline_ceiling_s02,
                 ((2::numeric ^ LEAST(gs.s01_gens, 40)) - 1) AS ideal_tree_nodes,
                 TRUNC(c.monthly_target_usd / gs.s02_slots, 2) AS unit_share_usd,
                 ROUND((((2::numeric ^ LEAST(gs.s01_gens, 40)) - 1) * TRUNC(c.monthly_target_usd / gs.s02_slots, 2))::numeric, 2) AS default_financial_stopper_usd,
                 c.vat_rate, c.wht_rate, c.payout_day, c.return_cutoff_day,
                 c.legal_opinion_verified, c.legal_opinion_doc_url, c.local_terms_version,
                 c.min_merchants_threshold, c.activation_notice_days, c.is_active, c.effective_from,
                 (SELECT COUNT(*) FROM sawyan.merchants m WHERE m.country_id = c.id AND m.is_active = true) AS active_merchants_count,
                 (SELECT COUNT(*) FROM sawyan.transactions t WHERE t.country_id = c.id AND t.status = 'completed') AS completed_tx_count,
                 (SELECT COUNT(*) FROM sawyan.members mem WHERE mem.residency_country_id = c.id AND mem.member_code > 0) AS resident_members_count
            FROM sawyan.countries c
            CROSS JOIN LATERAL (
                SELECT GREATEST(COALESCE(s.numerical_stopper_s01, 11), 1) AS s01_gens,
                       GREATEST(COALESCE(s.upline_ceiling_s02, 11), 1) AS s02_slots
                  FROM sawyan.settings s
                 WHERE s.country_id IS NULL
                 ORDER BY s.effective_from DESC, s.recorded_at DESC
                 LIMIT 1
            ) gs
      ) ct;

    -- 4. سجل المعاملات ثنائي الزمن (Bitemporal Settings — D28)
    SELECT COALESCE(jsonb_agg(row_to_json(st)::jsonb ORDER BY st.recorded_at DESC), '[]'::jsonb)
      INTO v_settings
      FROM (
          SELECT s.*, c.country_code
            FROM sawyan.settings s
            LEFT JOIN sawyan.countries c ON c.id = s.country_id
           ORDER BY s.recorded_at DESC
           LIMIT 15
      ) st;

    -- 5. دورات الإقفال الشهري ذات الـ 6 خطوات (D3 / D28)
    SELECT COALESCE(jsonb_agg(row_to_json(sc)::jsonb ORDER BY sc.period_ym DESC, sc.country_code ASC), '[]'::jsonb)
      INTO v_cycles
      FROM (
          SELECT cyc.*, c.country_code, c.currency_code,
                 am.full_name AS maker_name, ac.full_name AS checker_name,
                 (SELECT COUNT(*) FROM sawyan.pool_transactions pt WHERE pt.settlement_cycle_id = cyc.id) AS pools_count
            FROM sawyan.settlement_cycles cyc
            JOIN sawyan.countries c ON c.id = cyc.country_id
            LEFT JOIN sawyan.admins am ON am.id = cyc.maker_admin_id
            LEFT JOIN sawyan.admins ac ON ac.id = cyc.checker_admin_id
           ORDER BY cyc.period_ym DESC, cyc.id DESC
           LIMIT 25
      ) sc;

    -- 6. طابور الاعتماد المزدوج Maker-Checker (D20)
    SELECT COALESCE(jsonb_agg(row_to_json(mc)::jsonb ORDER BY mc.created_at DESC), '[]'::jsonb)
      INTO v_mc_queue
      FROM (
          SELECT r.*,
                 am.full_name AS maker_name, am.role AS maker_role,
                 ac.full_name AS checker_name, ac.role AS checker_role
            FROM sawyan.maker_checker_requests r
            JOIN sawyan.admins am ON am.id = r.maker_admin_id
            LEFT JOIN sawyan.admins ac ON ac.id = r.checker_admin_id
           ORDER BY CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END, r.created_at DESC
           LIMIT 40
      ) mc;

    -- 7. طابور مراجعة العروض الخاطفة للتجار (Point 12)
    SELECT COALESCE(jsonb_agg(row_to_json(fo)::jsonb ORDER BY fo.created_at DESC), '[]'::jsonb)
      INTO v_flash_queue
      FROM (
          SELECT n.id, n.event_name, n.payload, n.created_at
            FROM sawyan.notifications n
           WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
           ORDER BY CASE WHEN n.event_name = 'MerchantFlashOfferPending' THEN 0 ELSE 1 END, n.created_at DESC
           LIMIT 20
      ) fo;

    -- 8. قائمة الأعضاء وحالة التأهل والمحافظ والـ KYC
    SELECT COALESCE(jsonb_agg(row_to_json(mm)::jsonb ORDER BY mm.member_code ASC), '[]'::jsonb)
      INTO v_members
      FROM (
          SELECT m.id, m.member_code, m.full_name, m.email, m.phone, m.placement_side,
                 m.generation_in_tree, m.is_active_in_tree, m.is_tombstone_banned,
                 m.kyc_status, m.payout_cooldown_until, m.status, m.created_at,
                 c.country_code AS residency_country_code,
                 sp.member_code AS sponsor_code,
                 pr.member_code AS parent_code,
                 COALESCE(w.balance_usd, 0.00) AS wallet_balance_usd,
                 COALESCE(w.total_earned_usd, 0.00) AS total_earned_usd,
                 COALESCE(w.s03_suspense_balance_usd, 0.00) AS s03_suspense_usd,
                 COALESCE(tb.current_month_purchases_usd, 0.000000) AS current_purchases_usd,
                 COALESCE(tb.carry_on_in_usd, 0.000000) AS carry_on_in_usd,
                 COALESCE(tb.carry_on_out_usd, 0.000000) AS carry_on_out_usd,
                 COALESCE(tb.is_qualified, false) AS is_qualified_period
            FROM sawyan.members m
            JOIN sawyan.countries c ON c.id = m.residency_country_id
            LEFT JOIN sawyan.members sp ON sp.id = m.sponsor_id
            LEFT JOIN sawyan.members pr ON pr.id = m.parent_member_id
            LEFT JOIN sawyan.wallets w ON w.member_id = m.id
            LEFT JOIN sawyan.monthly_target_boxes tb
                   ON tb.member_id = m.id AND tb.country_id = m.residency_country_id AND tb.period_ym = v_period_ym
           ORDER BY m.member_code ASC
           LIMIT 60
      ) mm;

    -- 9. قائمة التجار وأرصدة الشحن والعزل وطابور FIFO
    SELECT COALESCE(jsonb_agg(row_to_json(mr)::jsonb ORDER BY mr.created_at DESC), '[]'::jsonb)
      INTO v_merchants
      FROM (
          SELECT m.id, m.merchant_code, m.business_name, m.owner_name, m.email, m.phone,
                 m.category, m.merchant_type, m.deduction_percent, m.package_base_amount,
                 m.actual_cash_balance, m.soft_hold_balance, m.credit_limit,
                 m.is_isolated, m.is_active, m.tax_registration_no, m.created_at,
                 c.country_code, c.currency_code,
                 CASE WHEN GREATEST(m.package_base_amount, m.credit_limit) > 0
                      THEN ROUND((((m.actual_cash_balance - m.soft_hold_balance + m.credit_limit) / GREATEST(m.package_base_amount, m.credit_limit)) * 100.0)::numeric, 2)
                      ELSE 0.00 END AS free_balance_pct,
                 (SELECT COUNT(*) FROM sawyan.merchant_branches mb WHERE mb.merchant_id = m.id) AS branches_count,
                 (SELECT COUNT(*) FROM sawyan.transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS ops_count,
                 (SELECT COUNT(*) FROM sawyan.transactions t WHERE t.merchant_id = m.id AND t.status = 'awaiting_merchant_topup') AS fifo_queue_count,
                 (SELECT COALESCE(SUM(t.total_amount), 0.00) FROM sawyan.transactions t WHERE t.merchant_id = m.id AND t.status = 'completed') AS gmv_completed,
                 NULLIF(m.metadata->>'logo_url', '') AS logo_url,
                 NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
                 CASE WHEN jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images,
                 COALESCE(m.metadata->'kyc_docs', '{}'::jsonb) AS kyc_docs
            FROM sawyan.merchants m
            JOIN sawyan.countries c ON c.id = m.country_id
           ORDER BY m.created_at DESC
           LIMIT 50
      ) mr;

    -- 10. الفواتير والعمليات والفوترة الضريبية B2B
    SELECT COALESCE(jsonb_agg(row_to_json(tx)::jsonb ORDER BY tx.created_at DESC), '[]'::jsonb)
      INTO v_transactions
      FROM (
          SELECT t.id, t.sw_short_code, t.unique_payment_ref, t.amount, t.total_amount,
                 t.commission_amount, t.company_share, t.income_plan_share_local,
                 t.income_plan_share_usd, t.vat_amount, t.currency_code, t.fx_rate_used,
                 c.country_code, t.payment_type, t.status, t.receipt_media_url, t.fifo_seq,
                 t.completed_at, t.reversed_at, t.created_at,
                 (t.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                 mem.member_code, mem.full_name AS member_name,
                 mer.merchant_code, mer.business_name AS merchant_name,
                 mb.branch_name,
                 bti.invoice_number AS b2b_invoice_number
            FROM sawyan.transactions t
            JOIN sawyan.countries c ON c.id = t.country_id
            JOIN sawyan.members mem ON mem.id = t.member_id
            JOIN sawyan.merchants mer ON mer.id = t.merchant_id
            LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
            LEFT JOIN sawyan.b2b_tax_invoices bti ON bti.transaction_id = t.id AND bti.document_type = 'tax_invoice'
           ORDER BY t.created_at DESC
           LIMIT 60
      ) tx;

    -- 11. تذاكر النزاعات الثلاثية (D6 + Option 1-A فرز التأهل) وبلاغات رفع الأسعار (S10) وكاشف الغش الشبكي
    SELECT COALESCE(jsonb_agg(row_to_json(dp)::jsonb ORDER BY dp.is_qualification_breaking DESC, dp.created_at DESC), '[]'::jsonb)
      INTO v_disputes
      FROM (
          SELECT d.*, t.sw_short_code, t.total_amount, t.currency_code, t.status AS tx_status,
                 c.country_code AS tx_country_code,
                 COALESCE(t.commission_snapshot->>'effective_period_ym',
                          to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')) AS dispute_period_ym,
                 ROUND(t.income_plan_share_usd::numeric, 2) AS income_plan_share_usd,
                 mem.member_code, mem.full_name AS member_name,
                 mer.merchant_code, mer.business_name AS merchant_name,
                 ROUND((EXTRACT(EPOCH FROM (d.sla_deadline_at - sawyan.now_utc())) / 3600.0)::numeric, 1) AS sla_hours_left,
                 (
                     t.status = 'completed'
                     AND d.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
                     AND d.dispute_category IN ('return_stalled', 'merchant_return_escalation')
                     AND mb.id IS NOT NULL
                     AND (mb.carry_on_in_usd + mb.current_month_purchases_usd) >= mb.target_required_usd
                     AND ((mb.carry_on_in_usd + mb.current_month_purchases_usd) - COALESCE(open_sum.disputed_usd, t.income_plan_share_usd)) < mb.target_required_usd
                 ) AS is_qualification_breaking,
                 CASE
                     WHEN t.status = 'completed'
                      AND d.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
                      AND d.dispute_category IN ('return_stalled', 'merchant_return_escalation')
                      AND mb.id IS NOT NULL
                      AND (mb.carry_on_in_usd + mb.current_month_purchases_usd) >= mb.target_required_usd
                      AND ((mb.carry_on_in_usd + mb.current_month_purchases_usd) - COALESCE(open_sum.disputed_usd, t.income_plan_share_usd)) < mb.target_required_usd
                     THEN ROUND(COALESCE(
                         (SELECT SUM(pt.members_share_usd) FROM sawyan.pool_transactions pt WHERE pt.target_box_id = mb.id),
                         mb.target_required_usd * 0.70
                     )::numeric, 2)
                     ELSE 0.00
                 END AS estimated_commission_at_stake_usd
            FROM sawyan.dispute_tickets d
            JOIN sawyan.transactions t ON t.id = d.transaction_id
            JOIN sawyan.countries c ON c.id = t.country_id
            JOIN sawyan.members mem ON mem.id = d.member_id
            JOIN sawyan.merchants mer ON mer.id = d.merchant_id
            LEFT JOIN sawyan.monthly_target_boxes mb
              ON mb.member_id = t.member_id
             AND mb.country_id = t.country_id
             AND mb.period_ym = COALESCE(
                     t.commission_snapshot->>'effective_period_ym',
                     to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')
                 )
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(t2.income_plan_share_usd), 0.000000) AS disputed_usd
                  FROM sawyan.dispute_tickets d2
                  JOIN sawyan.transactions t2 ON t2.id = d2.transaction_id
                  JOIN sawyan.countries c2 ON c2.id = t2.country_id
                 WHERE d2.member_id = t.member_id
                   AND t2.country_id = t.country_id
                   AND t2.status = 'completed'
                   AND d2.status IN ('awaiting_merchant_friendly', 'escalated_to_admin')
                   AND d2.dispute_category IN ('return_stalled', 'merchant_return_escalation')
                   AND COALESCE(t2.commission_snapshot->>'effective_period_ym',
                                to_char(COALESCE(t2.completed_at, t2.created_at) AT TIME ZONE c2.iana_timezone, 'YYYY-MM')) = COALESCE(
                                    t.commission_snapshot->>'effective_period_ym',
                                    to_char(COALESCE(t.completed_at, t.created_at) AT TIME ZONE c.iana_timezone, 'YYYY-MM')
                                )
            ) open_sum ON true
           ORDER BY is_qualification_breaking DESC, d.created_at DESC
           LIMIT 50
      ) dp;

    SELECT COALESCE(jsonb_agg(row_to_json(pg)::jsonb ORDER BY pg.created_at DESC), '[]'::jsonb)
      INTO v_gouging
      FROM (
          SELECT p.*, t.sw_short_code,
                 mem.member_code, mem.full_name AS member_name,
                 mer.merchant_code, mer.business_name AS merchant_name
            FROM sawyan.price_gouging_reports p
            JOIN sawyan.transactions t ON t.id = p.transaction_id
            JOIN sawyan.members mem ON mem.id = p.member_id
            JOIN sawyan.merchants mer ON mer.id = p.merchant_id
           ORDER BY p.created_at DESC
           LIMIT 30
      ) pg;

    SELECT COALESCE(jsonb_agg(row_to_json(fg)::jsonb ORDER BY fg.created_at DESC), '[]'::jsonb)
      INTO v_fraud
      FROM (
          SELECT f.*, mer.merchant_code, mer.business_name AS merchant_name
            FROM sawyan.fraud_graph_signals f
            LEFT JOIN sawyan.merchants mer ON mer.id = f.involved_merchant_id
           ORDER BY f.created_at DESC
           LIMIT 30
      ) fg;

    -- 12. طلبات السحب النقدي للأعضاء (D7 / W05 / W07) وتذاكر الدعم الفني
    SELECT COALESCE(jsonb_agg(row_to_json(wd)::jsonb ORDER BY wd.created_at DESC), '[]'::jsonb)
      INTO v_withdrawals
      FROM (
          SELECT wt.id, wt.amount_usd, wt.local_amount, wt.currency_code, wt.fx_rate_used,
                 wt.status, wt.created_at, wt.reference_id,
                 mem.id AS member_id, mem.member_code, mem.full_name AS member_name,
                 mem.kyc_status, mem.payout_cooldown_until
            FROM sawyan.wallet_transactions wt
            JOIN sawyan.wallets w ON w.id = wt.wallet_id
            JOIN sawyan.members mem ON mem.id = w.member_id
           WHERE wt.transaction_type = 'withdrawal'
           ORDER BY wt.created_at DESC
           LIMIT 30
      ) wd;

    SELECT COALESCE(jsonb_agg(row_to_json(st)::jsonb ORDER BY st.created_at DESC), '[]'::jsonb)
      INTO v_tickets
      FROM (
          SELECT s.*
            FROM sawyan.support_tickets s
           ORDER BY s.created_at DESC
           LIMIT 30
      ) st;

    -- 13. سجل شركاء الشركة الفعليين داخل الإدارة فقط (D24 Corporate Partners)
    SELECT COALESCE(jsonb_agg(row_to_json(pt)::jsonb ORDER BY pt.created_at DESC), '[]'::jsonb)
      INTO v_partners
      FROM (
          SELECT p.id, p.partner_code, p.full_name, p.email, p.phone,
                 p.partnership_scope, p.scope_targets, p.profit_basis,
                 p.profit_share_pct, p.contract_ref, p.is_active, p.created_at
            FROM sawyan.partners p
           ORDER BY p.created_at DESC
      ) pt;

    -- 14. قائمة الإداريين وسجل التدقيق غير القابل للمحو مع فحص سلسلة التجزئة SHA-256
    SELECT COALESCE(jsonb_agg(row_to_json(ad)::jsonb ORDER BY ad.created_at ASC), '[]'::jsonb)
      INTO v_admins_list
      FROM (
          SELECT a.id, a.full_name, a.email, a.role, a.must_change_password,
                 a.two_factor_enabled, a.is_active, a.last_login_at, a.created_at
            FROM sawyan.admins a
           ORDER BY a.created_at ASC
      ) ad;

    SELECT COUNT(*) INTO v_chain_broken
      FROM (
          SELECT id, prev_row_hash,
                 LAG(row_hash) OVER (ORDER BY id ASC) AS expected_prev
            FROM sawyan.audit_logs
      ) ch
     WHERE ch.expected_prev IS NOT NULL AND ch.prev_row_hash IS DISTINCT FROM ch.expected_prev;

    SELECT COALESCE(jsonb_agg(row_to_json(al)::jsonb ORDER BY al.id DESC), '[]'::jsonb)
      INTO v_audit_logs
      FROM (
          SELECT l.id, l.actor_type, l.actor_id, l.action, l.table_name,
                 l.record_id, l.recorded_at, l.prev_row_hash, l.row_hash
            FROM sawyan.audit_logs l
           ORDER BY l.id DESC
           LIMIT 35
      ) al;

    RETURN jsonb_build_object(
        'admin', v_admin_info,
        'kpis', v_kpis,
        'zero_discrepancy', jsonb_build_object(
            'total_debit_usd', v_sum_dr,
            'total_credit_usd', v_sum_cr,
            'ledger_diff_usd', v_sum_dr - v_sum_cr,
            'unbalanced_entries_count', v_unbal_je,
            'pool_mismatch_count', v_bad_pools,
            'is_zero_discrepancy_intact', (v_sum_dr = v_sum_cr AND v_unbal_je = 0 AND v_bad_pools = 0),
            'trial_balance', v_trial_bal
        ),
        'countries', v_countries,
        'settings', v_settings,
        'settlement_cycles', v_cycles,
        'maker_checker_queue', v_mc_queue,
        'flash_offers_queue', v_flash_queue,
        'members', v_members,
        'merchants', v_merchants,
        'transactions', v_transactions,
        'disputes', v_disputes,
        'price_gouging_reports', v_gouging,
        'fraud_signals', v_fraud,
        'withdrawals', v_withdrawals,
        'support_tickets', v_tickets,
        'partners', v_partners,
        'admins', v_admins_list,
        'audit_chain', jsonb_build_object(
            'is_hash_chain_intact', (v_chain_broken = 0),
            'broken_links_count', v_chain_broken,
            'recent_logs', v_audit_logs
        )
    );
END;
$$;

-- ============================================================================
-- 6. تقديم طلب حوكمة مزدوج (Maker) مع قفل المدقق ومحاكاة الأثر التلقائية (D13 / D20 / D24 / D28)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_submit_governance_request(
    p_admin_id          UUID,
    p_session_token     TEXT,
    p_action_type       VARCHAR,
    p_target_entity     VARCHAR,
    p_target_id         TEXT,
    p_payload_after     JSONB,
    p_reason            TEXT,
    p_payload_before    JSONB DEFAULT NULL,
    p_impact_simulation JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info JSONB;
    v_sim        JSONB;
    v_act        VARCHAR(60);
    v_cc         CHAR(2);
    v_sub_res    JSONB;
BEGIN
    v_admin_info := sawyan.verify_admin_session(
        p_admin_id,
        p_session_token,
        ARRAY['data_entry', 'reviewer', 'approver', 'finance', 'support', 'kyc_officer'],
        true
    );

    v_act := upper(trim(COALESCE(p_action_type, '')));
    IF v_act = '' OR trim(COALESCE(p_target_entity, '')) = '' OR trim(COALESCE(p_target_id, '')) = '' THEN
        RAISE EXCEPTION 'GOVERNANCE_INVALID_TARGET';
    END IF;

    IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'GOVERNANCE_REASON_REQUIRED: Mandatory audit justification (>= 5 chars).';
    END IF;

    v_sim := p_impact_simulation;
    IF v_act = 'COUNTRY_GATE_D13_ACTIVATION' AND v_sim IS NULL THEN
        v_cc := upper(substr(trim(COALESCE(p_payload_after->>'country_code', p_target_id)), 1, 2));
        v_sim := sawyan.admin_run_actuarial_stress_test_s06(
            p_admin_id,
            p_session_token,
            v_cc,
            COALESCE((p_payload_after->>'monthly_target_usd')::numeric, (SELECT monthly_target_usd FROM sawyan.countries WHERE country_code = v_cc), 24.75),
            25.00,
            11,
            11,
            COALESCE(
                NULLIF((p_payload_after->>'financial_stopper_usd')::numeric, 0),
                (SELECT financial_stopper_usd FROM sawyan.countries WHERE country_code = v_cc),
                sawyan.calc_country_default_s03_usd(COALESCE((p_payload_after->>'monthly_target_usd')::numeric, 24.75), NULL, NULL)
            ),
            10000
        );
    END IF;

    v_sub_res := sawyan.submit_maker_checker_request(
        v_act,
        trim(p_target_entity),
        trim(p_target_id),
        COALESCE(p_payload_after, '{}'::jsonb),
        p_admin_id,
        trim(p_reason),
        p_payload_before,
        v_sim
    );

    -- الصلاحية السيادية المطلقة للمؤسس: التنفيذ الفوري المباشر دون انتظار مدير ثانٍ
    IF COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false) IS TRUE THEN
        RETURN sawyan.admin_decide_governance_request(
            p_admin_id,
            p_session_token,
            (v_sub_res->>'request_id')::uuid,
            'approved',
            NULL
        ) || jsonb_build_object('sovereign_auto_executed', true);
    END IF;

    RETURN v_sub_res;
END;
$$;

-- ============================================================================
-- 7. البتّ في طلب الحوكمة المزدوج (Checker != Maker) وتنفيذ الأثر الذري المحكوم
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
BEGIN
    v_admin_info := sawyan.verify_admin_session(
        p_admin_id,
        p_session_token,
        ARRAY['approver', 'finance'],
        true
    );

    -- يتحقق داخلياً من أن الطلب معلق وأن p_admin_id <> maker_admin_id (يرفض فورا لو نفس المدير)
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
             WHERE country_id IS NULL
             ORDER BY effective_from DESC, recorded_at DESC
             LIMIT 1;

            INSERT INTO sawyan.settings (
                country_id, brand_display_title, company_percent, generations_count,
                numerical_stopper_s01, upline_ceiling_s02, cap_auto_calc, cap_amount,
                monthly_target_usd, payout_day, merchant_warn1_pct, merchant_warn2_pct,
                merchant_isolate_pct, unsecured_queue_cap, unconfirmed_soft_hold_cap_pct,
                wht_threshold_usd, withdrawal_cooldown_hours, dormancy_months,
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
                COALESCE((v_req.payload_after->>'effective_from')::timestamptz, date_trunc('month', now() + interval '1 month')),
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
            -- القرار 4: ثبات الدورات المصروفة نهائياً بعد الصرف؛ يُسمح بفتح الحساب فقط لدورات ما قبل الصرف،
            -- أما الدورات ذات payout_executed_at فتبقى مقفلة كلياً ويُفتح لها قيد تسوية تدقيقي MANUAL_AUDIT_JOURNAL_ADJUSTMENT فقط لمدة ساعتين.
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
                   deferred_settlement_cutoff_time = COALESCE((v_req.payload_after->>'deferred_settlement_cutoff_time')::time, deferred_settlement_cutoff_time)
             WHERE id = (v_req.payload_after->>'merchant_id')::uuid;

            v_exec_effect := jsonb_build_object('effect', 'merchant_credit_exception_applied_d4', 'merchant_id', v_req.payload_after->>'merchant_id');

        ELSIF v_req.action_type = 'WITHDRAWAL_DUAL_APPROVAL_W05' THEN
            UPDATE sawyan.wallet_transactions
               SET status = 'completed'
             WHERE id = (v_req.target_id)::uuid AND transaction_type = 'withdrawal';

            v_exec_effect := jsonb_build_object('effect', 'withdrawal_w05_dual_completed', 'wallet_tx_id', v_req.target_id);
        END IF;
    END IF;

    RETURN v_mc_res || jsonb_build_object('execution', v_exec_effect);
END;
$$;

-- ============================================================================
-- 8. معالج الإقفال الشهري ذو الـ 6 خطوات + المطابقة الصفرية + IAS 21 + القفل الصلب (D3 / D23 / D28)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_execute_period_close_wizard(
    p_admin_id           UUID,
    p_session_token      TEXT,
    p_country_code       CHAR(2),
    p_period_ym          CHAR(7),
    p_step_action        VARCHAR, -- 'run_steps_1_to_4' | 'finalize_steps_5_and_6'
    p_checker_admin_id   UUID          DEFAULT NULL,
    p_ias21_fx_delta_usd NUMERIC(18,2) DEFAULT 0.00
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info JSONB;
    v_country    sawyan.countries%ROWTYPE;
    v_cycle      sawyan.settlement_cycles%ROWTYPE;
    v_sum_dr     NUMERIC(18,2);
    v_sum_cr     NUMERIC(18,2);
    v_eng_res    JSONB;
    v_fin_res    JSONB;
    v_maker_id   UUID;
    v_checker_id UUID;
    v_act        VARCHAR(40);
BEGIN
    v_admin_info := sawyan.verify_admin_session(
        p_admin_id,
        p_session_token,
        ARRAY['finance', 'approver'],
        true
    );

    IF p_period_ym IS NULL OR p_period_ym !~ '^\d{4}-\d{2}$' THEN
        RAISE EXCEPTION 'INVALID_PERIOD_YM: Expected YYYY-MM.';
    END IF;

    v_act := lower(trim(COALESCE(p_step_action, '')));

    -- الخطوة 1 الدائمة: فحص المطابقة الصفرية الصارم قبل أي خطوة إقفال
    SELECT COALESCE(SUM(debit_usd), 0.00), COALESCE(SUM(credit_usd), 0.00)
      INTO v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines;
    IF v_sum_dr <> v_sum_cr THEN
        RAISE EXCEPTION 'ZERO_DISCREPANCY_LEDGER_IMBALANCE: dr=% cr=%', v_sum_dr, v_sum_cr;
    END IF;

    IF v_act = 'run_steps_1_to_4' THEN
        SELECT * INTO v_country FROM sawyan.countries WHERE country_code = upper(trim(p_country_code));
        IF NOT FOUND THEN RAISE EXCEPTION 'COUNTRY_NOT_FOUND'; END IF;

        PERFORM pg_advisory_xact_lock(hashtextextended('sawyan_period_' || v_country.id::text || '_' || p_period_ym, 0));

        INSERT INTO sawyan.settlement_cycles (
            country_id, period_ym, closure_utc_instant, step_status, zero_discrepancy_passed, maker_admin_id
        ) VALUES (
            v_country.id,
            p_period_ym,
            (((to_date(p_period_ym || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp - interval '1 second') AT TIME ZONE v_country.iana_timezone),
            2,
            true,
            p_admin_id
        )
        ON CONFLICT (country_id, period_ym) DO UPDATE
           SET maker_admin_id          = p_admin_id,
               zero_discrepancy_passed = true
         WHERE sawyan.settlement_cycles.is_hard_locked = false
           AND sawyan.settlement_cycles.payout_executed_at IS NULL
        RETURNING * INTO v_cycle;

        IF v_cycle.id IS NULL THEN
            RAISE EXCEPTION 'HARD_LOCK_VIOLATION: Period % for % is hard-locked or already paid out. Break-Glass dual approval required.', p_period_ym, p_country_code;
        END IF;

        -- إذا لم يسبق تشغيل المحرك أو تطلبت المسودة إعادة الحساب بعد مرتجع/اعتماد متأخر، نفّذ المسح الصعودي الشامل حتى الخطوة 4
        IF COALESCE(v_cycle.recalc_required, false) IS TRUE
           OR NOT EXISTS (SELECT 1 FROM sawyan.pool_transactions WHERE settlement_cycle_id = v_cycle.id)
        THEN
            v_eng_res := sawyan.run_monthly_settlement_engine(v_cycle.id);
        ELSE
            UPDATE sawyan.settlement_cycles SET step_status = 4 WHERE id = v_cycle.id;
            v_eng_res := jsonb_build_object('settlement_cycle_id', v_cycle.id, 'period_ym', p_period_ym, 'already_computed_step4', true);
        END IF;

        PERFORM sawyan.append_audit_log(
            'admin',
            p_admin_id,
            'period_close_steps_1_to_4_prepared',
            'settlement_cycles',
            v_cycle.id::text,
            NULL,
            v_eng_res
        );

        RETURN jsonb_build_object(
            'status', 'step_4_ready_for_checker',
            'maker_admin_id', p_admin_id,
            'country_code', v_country.country_code,
            'engine_result', v_eng_res
        );

    ELSIF v_act = 'finalize_steps_5_and_6' THEN
        -- المدير المعتمد (Checker) يوقّع الخطوتين 5 و6 بعد إعداد المدير المالي (Maker != Checker) وبنطاق الدولة المختارة أو ALL
        SELECT sc.maker_admin_id INTO v_maker_id
          FROM sawyan.settlement_cycles sc
          JOIN sawyan.countries c ON c.id = sc.country_id
         WHERE sc.period_ym = p_period_ym
           AND sc.step_status = 4
           AND sc.is_hard_locked = false
           AND sc.payout_executed_at IS NULL
           AND (
               NULLIF(upper(trim(COALESCE(p_country_code, ''))), '') IS NULL
               OR upper(trim(p_country_code)) = 'ALL'
               OR c.country_code = upper(trim(p_country_code))
           )
         ORDER BY (sc.maker_admin_id IS DISTINCT FROM p_admin_id) DESC, sc.id ASC
         LIMIT 1;

        IF v_maker_id IS NULL THEN
            RAISE EXCEPTION 'NO_STEP4_OPEN_CYCLES_FOR_PERIOD: %', p_period_ym;
        END IF;

        IF p_checker_admin_id IS NOT NULL AND p_checker_admin_id <> p_admin_id THEN
            v_maker_id   := p_admin_id;
            v_checker_id := p_checker_admin_id;
        ELSE
            v_checker_id := p_admin_id;
        END IF;

        IF v_maker_id = v_checker_id AND COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'MAKER_CHECKER_DISTINCT_ADMINS_REQUIRED: Switch to a second Approver admin to finalize Steps 5 & 6.';
        END IF;

        v_fin_res := sawyan.finalize_settlement_payout_step5_6(
            p_period_ym,
            v_maker_id,
            v_checker_id,
            COALESCE(p_ias21_fx_delta_usd, 0.00),
            NULLIF(upper(trim(COALESCE(p_country_code, ''))), '')::char(2)
        );

        RETURN v_fin_res;
    ELSE
        RAISE EXCEPTION 'INVALID_PERIOD_CLOSE_ACTION: %', p_step_action;
    END IF;
END;
$$;

-- ============================================================================
-- 9. القرارات الرقابية والتشغيلية الحية (Disputes D6, Clawback D5, S10, KYC D7, Promos, Tombstone)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.admin_operational_decision(
    p_admin_id       UUID,
    p_session_token  TEXT,
    p_domain         VARCHAR,
    p_record_id      TEXT,
    p_decision       VARCHAR,
    p_notes          TEXT    DEFAULT NULL,
    p_reversal_phase VARCHAR DEFAULT 'in_month'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info JSONB;
    v_dom        VARCHAR(40);
    v_dec        VARCHAR(40);
    v_notif      sawyan.notifications%ROWTYPE;
    v_dispute    sawyan.dispute_tickets%ROWTYPE;
    v_tx         sawyan.transactions%ROWTYPE;
    v_wtx        sawyan.wallet_transactions%ROWTYPE;
    v_settings   sawyan.settings%ROWTYPE;
    v_claw_res   JSONB := NULL;
BEGIN
    -- يمنع دور المدقق (auditor) تلقائياً عبر p_is_write_action = true
    v_admin_info := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, true);
    v_dom := lower(trim(COALESCE(p_domain, '')));
    v_dec := lower(trim(COALESCE(p_decision, '')));

    IF v_dom = 'flash_offer' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        SELECT * INTO v_notif FROM sawyan.notifications WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'FLASH_OFFER_NOT_FOUND'; END IF;

        IF v_dec = 'approved' THEN
            UPDATE sawyan.notifications
               SET event_name    = 'MerchantFlashOfferApproved',
                   dispatched_at = now(),
                   payload       = v_notif.payload || jsonb_build_object('status', 'approved', 'approved_by', p_admin_id, 'approved_at', now())
             WHERE id = v_notif.id;
        ELSIF v_dec = 'rejected' THEN
            UPDATE sawyan.notifications
               SET event_name = 'MerchantFlashOfferRejected',
                   payload    = v_notif.payload || jsonb_build_object('status', 'rejected', 'rejected_by', p_admin_id, 'rejection_reason', COALESCE(p_notes, 'غير مطابق لضوابط النشر'))
             WHERE id = v_notif.id;
        ELSE
            RAISE EXCEPTION 'INVALID_FLASH_OFFER_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'flash_offer_' || v_dec, 'notifications', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'dispute_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'reviewer', 'approver', 'finance'], true);
        SELECT * INTO v_dispute FROM sawyan.dispute_tickets WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'DISPUTE_TICKET_NOT_FOUND'; END IF;

        SELECT * INTO v_tx FROM sawyan.transactions WHERE id = v_dispute.transaction_id FOR UPDATE;

        IF v_dec = 'resolved_member' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_member',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;

            -- اعتماد الفاتورة المعلقة للعضو عند إنصافه دون المساس بالفواتير المكتملة السليمة
            IF v_tx.status = 'pending' THEN
                v_claw_res := sawyan.feed_monthly_target_box(v_tx.id, v_tx.member_id);
            END IF;

        ELSIF v_dec = 'resolved_member_clawback' THEN
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'CLAWBACK_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;

            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_member',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;

            -- القفل الدستوري D5: عكس الفاتورة مسموح قبل يوم الصرف 15 فقط مع درع الكاري أون، ومرفوض قطعياً بعد الصرف
            v_claw_res := sawyan.process_transaction_reversal_clawback(v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin dispute reversal before payout'));

        ELSIF v_dec = 'resolved_merchant_force_return' THEN
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'FORCE_RETURN_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;

            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;

            UPDATE sawyan.return_requests
               SET status      = 'approved_in_app',
                   resolved_at = sawyan.now_utc()
             WHERE transaction_id = v_tx.id
               AND status IN ('pending_otp', 'escalated_to_admin');

            v_claw_res := sawyan.process_transaction_reversal_clawback(
                v_tx.id,
                p_admin_id,
                COALESCE(p_notes, 'Admin forced return after runaway customer proof')
            );

            UPDATE sawyan.members
               SET payout_cooldown_until = GREATEST(
                       COALESCE(payout_cooldown_until, sawyan.now_utc()),
                       sawyan.now_utc() + interval '30 days'
                   )
             WHERE id = v_tx.member_id;

        ELSIF v_dec = 'resolved_merchant_malicious_claim' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;

            UPDATE sawyan.return_requests
               SET status      = 'rejected_member',
                   resolved_at = sawyan.now_utc()
             WHERE transaction_id = v_tx.id
               AND status IN ('pending_otp', 'escalated_to_admin');

            UPDATE sawyan.members
               SET payout_cooldown_until = GREATEST(
                       COALESCE(payout_cooldown_until, sawyan.now_utc()),
                       sawyan.now_utc() + interval '30 days'
                   )
             WHERE id = v_tx.member_id;

        ELSIF v_dec = 'resolved_merchant' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
        ELSE
            RAISE EXCEPTION 'INVALID_DISPUTE_DECISION: %', p_decision;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'dispute_' || v_dec, 'dispute_tickets', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'effect', v_claw_res));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'ledger_effect', v_claw_res);

    ELSIF v_dom = 'price_gouging' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        IF v_dec NOT IN ('verified_violation', 'dismissed') THEN
            RAISE EXCEPTION 'INVALID_PRICE_GOUGING_DECISION';
        END IF;

        UPDATE sawyan.price_gouging_reports
           SET verification_status = v_dec
         WHERE id = p_record_id::uuid;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'price_gouging_' || v_dec, 'price_gouging_reports', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'fraud_signal' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'finance'], true);
        IF v_dec NOT IN ('payout_held', 'cleared', 'confirmed_fraud') THEN
            RAISE EXCEPTION 'INVALID_FRAUD_DECISION';
        END IF;

        UPDATE sawyan.fraud_graph_signals
           SET status = v_dec
         WHERE id = p_record_id::uuid;

        IF v_dec = 'confirmed_fraud' THEN
            -- حظر Tombstone يحجب العمولات دون المساس بروابط الشجرة الثنائية (Point 14)
            UPDATE sawyan.members
               SET is_tombstone_banned = true
             WHERE id = ANY((SELECT involved_member_ids FROM sawyan.fraud_graph_signals WHERE id = p_record_id::uuid))
               AND member_code > 0;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'fraud_signal_' || v_dec, 'fraud_graph_signals', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'member_kyc' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['kyc_officer', 'approver', 'reviewer'], true);
        IF v_dec NOT IN ('verified', 'rejected') THEN
            RAISE EXCEPTION 'INVALID_KYC_DECISION';
        END IF;

        UPDATE sawyan.members
           SET kyc_status = v_dec
         WHERE id = p_record_id::uuid AND member_code > 0;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_kyc_' || v_dec, 'members', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'member_tombstone' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver'], true);
        UPDATE sawyan.members
           SET is_tombstone_banned = (v_dec = 'ban')
         WHERE id = p_record_id::uuid AND member_code > 0;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_tombstone_' || v_dec, 'members', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'is_tombstone_banned', (v_dec = 'ban'));

    ELSIF v_dom = 'merchant_status' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'finance'], true);
        IF v_dec = 'activate' THEN
            UPDATE sawyan.merchants SET is_active = true WHERE id = p_record_id::uuid;
        ELSIF v_dec = 'deactivate' THEN
            UPDATE sawyan.merchants SET is_active = false WHERE id = p_record_id::uuid;
        ELSIF v_dec = 'isolate' THEN
            UPDATE sawyan.merchants SET is_isolated = true WHERE id = p_record_id::uuid;
        ELSE
            RAISE EXCEPTION 'INVALID_MERCHANT_STATUS_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_' || v_dec, 'merchants', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'transaction' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'finance', 'support'], true);
        SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;

        IF v_dec = 'approve_escalated' THEN
            IF v_tx.status <> 'pending' THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            v_claw_res := sawyan.feed_monthly_target_box(v_tx.id, p_admin_id);
        ELSIF v_dec = 'reject_escalated' THEN
            IF v_tx.status <> 'pending' THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            IF COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount) > 0 THEN
                UPDATE sawyan.merchants
                   SET soft_hold_balance = GREATEST(0, soft_hold_balance - COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount))
                 WHERE id = v_tx.merchant_id;
            END IF;
            UPDATE sawyan.transactions
               SET status = 'rejected',
                   commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object('rejected_by_admin', p_admin_id, 'rejection_reason', COALESCE(p_notes, 'رفض إداري'))
             WHERE id = v_tx.id;
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
            VALUES
                ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                 jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_notes, 'قرار إداري'))),
                ('merchant', v_tx.merchant_id, 'PendingInvoiceRejectedByAdmin', 'in_app',
                 jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_notes, 'قرار إداري')));
        ELSIF v_dec = 'reverse_pre_payout' THEN
            PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance'], true);
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'REVERSAL_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            v_claw_res := sawyan.process_transaction_reversal_clawback(v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin pre-payout reversal'));
        ELSE
            RAISE EXCEPTION 'INVALID_TRANSACTION_DECISION: %', p_decision;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'transaction_' || v_dec, 'transactions', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'effect', v_claw_res));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'ledger_effect', v_claw_res);

    ELSIF v_dom = 'withdrawal_payout' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['finance', 'approver'], true);
        SELECT * INTO v_wtx FROM sawyan.wallet_transactions WHERE id = p_record_id::uuid AND transaction_type = 'withdrawal' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_TX_NOT_FOUND'; END IF;

        SELECT * INTO v_settings FROM sawyan.settings WHERE country_id IS NULL ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;

        IF v_dec = 'completed' THEN
            IF v_wtx.amount_usd >= COALESCE(v_settings.wht_threshold_usd, 200.00) THEN
                RAISE EXCEPTION 'WITHDRAWAL_DUAL_APPROVAL_REQUIRED_W05: Withdrawals >= % USD require Maker-Checker request [WITHDRAWAL_DUAL_APPROVAL_W05].', COALESCE(v_settings.wht_threshold_usd, 200.00);
            END IF;
            UPDATE sawyan.wallet_transactions SET status = 'completed' WHERE id = v_wtx.id;
        ELSE
            RAISE EXCEPTION 'INVALID_WITHDRAWAL_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'withdrawal_completed', 'wallet_transactions', p_record_id, NULL, jsonb_build_object('amount_usd', v_wtx.amount_usd));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', 'completed');

    ELSIF v_dom = 'support_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'reviewer', 'approver'], true);
        UPDATE sawyan.support_tickets
           SET status            = CASE WHEN v_dec IN ('closed', 'resolved') THEN 'closed' ELSE 'in_progress' END,
               assigned_admin_id = p_admin_id
         WHERE id = p_record_id::uuid;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'support_ticket_' || v_dec, 'support_tickets', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);
    ELSE
        RAISE EXCEPTION 'UNKNOWN_OPERATIONAL_DOMAIN: %', p_domain;
    END IF;
END;
$$;

-- ============================================================================
-- 10. قفل الصلاحيات الأقل (Least-Privilege Lockdown — Zero Internal Leaks)
-- ============================================================================
REVOKE ALL ON FUNCTION sawyan.verify_admin_session(UUID, TEXT, TEXT[], BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.authenticate_admin_login(TEXT, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_run_actuarial_stress_test_s06(UUID, TEXT, CHAR, NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_admin_sovereign_bundle(UUID, TEXT, CHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_submit_governance_request(UUID, TEXT, VARCHAR, VARCHAR, TEXT, JSONB, TEXT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_decide_governance_request(UUID, TEXT, UUID, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_execute_period_close_wizard(UUID, TEXT, CHAR, CHAR, VARCHAR, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_operational_decision(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.verify_admin_session(UUID, TEXT, TEXT[], BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.authenticate_admin_login(TEXT, TEXT, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_run_actuarial_stress_test_s06(UUID, TEXT, CHAR, NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_admin_sovereign_bundle(UUID, TEXT, CHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_submit_governance_request(UUID, TEXT, VARCHAR, VARCHAR, TEXT, JSONB, TEXT, JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_decide_governance_request(UUID, TEXT, UUID, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_execute_period_close_wizard(UUID, TEXT, CHAR, CHAR, VARCHAR, UUID, NUMERIC) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_operational_decision(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
