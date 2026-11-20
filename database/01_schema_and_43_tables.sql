-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.1 PRODUCTION & PARALLEL SCHEMA (44 TABLES)
-- Constitutional Reference: الملف_التقني_للمطورين.md (V3.1 - Chapters 3 & 4)
-- Decisions Enforced: D0-D28, S01-S10, Multi-Branch, B2B Tax, PSP Recon, D5 OTP
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS sawyan;

-- ============================================================================
-- GROUP 1: CORE USERS, COUNTRIES, GEONAMES, MERCHANTS, BRANCHES & TREE
-- ============================================================================

-- 1. sawyan.countries (بوابة الدول والتوطين القانوني والضريبي)
CREATE TABLE sawyan.countries (
    id                         SERIAL PRIMARY KEY,
    country_code               CHAR(2) UNIQUE NOT NULL,
    country_name_i18n          JSONB NOT NULL,
    currency_code              CHAR(3) NOT NULL,
    iana_timezone              VARCHAR(64) NOT NULL,
    brand_display_title        VARCHAR(60) NOT NULL DEFAULT 'SAWYAN',
    admin_fx_rate              NUMERIC(18,6) NOT NULL DEFAULT 1.000000 CHECK (admin_fx_rate > 0),
    financial_stopper_usd      NUMERIC(18,2) NOT NULL DEFAULT 4605.75 CHECK (financial_stopper_usd > 0),
    monthly_target_usd         NUMERIC(18,2) NOT NULL DEFAULT 24.75 CHECK (monthly_target_usd > 0),
    compensatory_admin_fee_usd NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (compensatory_admin_fee_usd >= 0),
    vat_rate                   NUMERIC(6,4) NOT NULL DEFAULT 0.0000 CHECK (vat_rate >= 0 AND vat_rate < 100),
    wht_rate                   NUMERIC(6,4) NOT NULL DEFAULT 0.0000 CHECK (wht_rate >= 0 AND wht_rate < 100),
    tax_exclusive              BOOLEAN NOT NULL DEFAULT true CHECK (tax_exclusive = true),
    payout_day                 SMALLINT NOT NULL DEFAULT 15 CHECK (payout_day BETWEEN 2 AND 28),
    return_cutoff_day          SMALLINT NOT NULL DEFAULT 14 CHECK (return_cutoff_day < payout_day),
    payout_release_hour        SMALLINT NOT NULL DEFAULT 18 CHECK (payout_release_hour BETWEEN 0 AND 23),
    legal_opinion_verified     BOOLEAN NOT NULL DEFAULT false,
    legal_opinion_doc_url      TEXT,
    local_terms_version        VARCHAR(32),
    min_merchants_threshold    INTEGER NOT NULL DEFAULT 1 CHECK (min_merchants_threshold >= 1),
    activation_notice_days     INTEGER NOT NULL DEFAULT 15 CHECK (activation_notice_days >= 0),
    is_active                  BOOLEAN NOT NULL DEFAULT false,
    effective_from             TIMESTAMPTZ NOT NULL DEFAULT now(),
    recorded_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. sawyan.geonames_locations (محرك المدن والأحياء لـ 240 دولة)
CREATE TABLE sawyan.geonames_locations (
    geoname_id      BIGINT PRIMARY KEY,
    country_code    CHAR(2) NOT NULL REFERENCES sawyan.countries(country_code),
    admin1_name     TEXT,
    city_name       TEXT NOT NULL,
    asciiname       TEXT NOT NULL,
    alternate_names TEXT,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6),
    search_vector   TEXT NOT NULL
);

-- 3. sawyan.admins (الإداريون والمصادقة والأدوار السبعة — D10)
CREATE TABLE sawyan.admins (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name             VARCHAR(150) NOT NULL,
    email                 VARCHAR(255) UNIQUE NOT NULL,
    auth_user_id          UUID UNIQUE NOT NULL,
    must_change_password  BOOLEAN NOT NULL DEFAULT true,
    two_factor_enabled    BOOLEAN NOT NULL DEFAULT true,
    two_factor_secret_enc BYTEA,
    role                  VARCHAR(30) NOT NULL CHECK (role IN (
        'data_entry', 'reviewer', 'approver', 'auditor', 'finance', 'support', 'kyc_officer'
    )),
    is_active             BOOLEAN NOT NULL DEFAULT true,
    last_login_at         TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. sawyan.members (الأعضاء وهيكل الشجرة المزدوج — D7, D9, D22, Point 9, Point 14)
CREATE TABLE sawyan.members (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_code              BIGINT UNIQUE NOT NULL CHECK (member_code >= 0),
    full_name                VARCHAR(150) NOT NULL,
    email                    VARCHAR(255),
    phone                    VARCHAR(24) UNIQUE NOT NULL,
    phone_verified_at        TIMESTAMPTZ,
    nationality_country_id   INT REFERENCES sawyan.countries(id),
    residency_country_id     INT NOT NULL REFERENCES sawyan.countries(id),
    city_geoname_id          BIGINT REFERENCES sawyan.geonames_locations(geoname_id),
    manual_district_fallback VARCHAR(60),
    auth_user_id             UUID UNIQUE NOT NULL,
    sponsor_id               UUID REFERENCES sawyan.members(id),
    parent_member_id         UUID REFERENCES sawyan.members(id),
    placement_side           VARCHAR(12) CHECK (placement_side IN ('left', 'right', 'root_direct')),
    left_child_id            UUID REFERENCES sawyan.members(id),
    right_child_id           UUID REFERENCES sawyan.members(id),
    generation_in_tree       INTEGER NOT NULL CHECK (generation_in_tree >= 0),
    is_active_in_tree        BOOLEAN NOT NULL DEFAULT true,
    is_tombstone_banned      BOOLEAN NOT NULL DEFAULT false,
    kyc_status               VARCHAR(20) NOT NULL DEFAULT 'unverified' CHECK (kyc_status IN (
        'unverified', 'pending', 'verified', 'rejected', 'expired'
    )),
    kyc_docs_enc_ref         TEXT,
    payout_cooldown_until    TIMESTAMPTZ,
    status                   VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_no_self_sponsor CHECK (sponsor_id IS DISTINCT FROM id),
    CONSTRAINT chk_no_self_parent CHECK (parent_member_id IS DISTINCT FROM id),
    CONSTRAINT chk_distinct_children CHECK (
        left_child_id IS NULL OR right_child_id IS NULL OR left_child_id <> right_child_id
    )
);

-- 5. sawyan.tree_closure (مسرّع الاستعلامات الشجرية المليونية — S03 + Point 11)
CREATE TABLE sawyan.tree_closure (
    ancestor_id   UUID NOT NULL REFERENCES sawyan.members(id) ON DELETE CASCADE,
    descendant_id UUID NOT NULL REFERENCES sawyan.members(id) ON DELETE CASCADE,
    depth         INTEGER NOT NULL CHECK (depth >= 0),
    root_arm_side VARCHAR(12) NOT NULL CHECK (root_arm_side IN ('left', 'right', 'self', 'root_direct')),
    PRIMARY KEY (ancestor_id, descendant_id)
);

-- 6. sawyan.merchants (التجار والشحن المسبق والكيان الأم للسلاسل — D4, D15, D19, S01)
CREATE TABLE sawyan.merchants (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_code                   VARCHAR(20) UNIQUE NOT NULL,
    country_id                      INT NOT NULL REFERENCES sawyan.countries(id),
    onboarded_by_member_id          UUID REFERENCES sawyan.members(id),
    business_name                   VARCHAR(180) NOT NULL,
    owner_name                      VARCHAR(150) NOT NULL,
    owner_member_id                 UUID REFERENCES sawyan.members(id),
    email                           VARCHAR(255) UNIQUE NOT NULL,
    phone                           VARCHAR(24) NOT NULL,
    category                        VARCHAR(60) NOT NULL,
    merchant_type                   VARCHAR(20) NOT NULL CHECK (merchant_type IN ('physical', 'online', 'both')),
    deduction_percent               NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (deduction_percent BETWEEN 1.00 AND 40.00),
    package_base_amount             NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (package_base_amount >= 0),
    actual_cash_balance             NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    soft_hold_balance               NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (soft_hold_balance >= 0),
    credit_limit                    NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (credit_limit >= 0),
    deferred_settlement_cutoff_time TIME,
    deferred_settlement_cap_amount  NUMERIC(18,2) CHECK (deferred_settlement_cap_amount IS NULL OR deferred_settlement_cap_amount >= 0),
    is_isolated                     BOOLEAN NOT NULL DEFAULT false,
    address                         TEXT,
    latitude                        NUMERIC(9,6),
    longitude                       NUMERIC(9,6),
    tax_registration_no             VARCHAR(64),
    api_key_hash                    VARCHAR(128),
    webhook_url                     TEXT,
    webhook_secret_enc              BYTEA,
    is_active                       BOOLEAN NOT NULL DEFAULT false,
    password_hash                   TEXT,
    metadata                        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. sawyan.merchant_branches (فروع التاجر المتعددة والسلاسل التجارية)
CREATE TABLE sawyan.merchant_branches (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id                UUID NOT NULL REFERENCES sawyan.merchants(id) ON DELETE CASCADE,
    branch_code                VARCHAR(30) NOT NULL,
    branch_name                VARCHAR(180) NOT NULL,
    is_main_branch             BOOLEAN NOT NULL DEFAULT false,
    city_geoname_id            BIGINT REFERENCES sawyan.geonames_locations(geoname_id),
    address                    TEXT NOT NULL,
    latitude                   NUMERIC(9,6) NOT NULL,
    longitude                  NUMERIC(9,6) NOT NULL,
    branch_phone               VARCHAR(24),
    branch_manager_name        VARCHAR(150),
    daily_commission_cap_local NUMERIC(18,2) CHECK (daily_commission_cap_local IS NULL OR daily_commission_cap_local > 0),
    is_branch_active           BOOLEAN NOT NULL DEFAULT true,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (merchant_id, branch_code)
);

-- 8. sawyan.cashier_employees (موظفو الكاشير المستقلون وكشف التواطؤ — D25)
CREATE TABLE sawyan.cashier_employees (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id           UUID NOT NULL REFERENCES sawyan.merchants(id) ON DELETE CASCADE,
    branch_id             UUID NOT NULL REFERENCES sawyan.merchant_branches(id) ON DELETE CASCADE,
    employee_code         VARCHAR(30) NOT NULL,
    full_name             VARCHAR(150) NOT NULL,
    linked_member_id      UUID REFERENCES sawyan.members(id),
    pin_hash              TEXT NOT NULL,
    failed_pin_attempts   SMALLINT NOT NULL DEFAULT 0 CHECK (failed_pin_attempts >= 0),
    pin_locked_until      TIMESTAMPTZ,
    max_tx_amount_limit   NUMERIC(18,2) CHECK (max_tx_amount_limit IS NULL OR max_tx_amount_limit > 0),
    notify_owner_realtime BOOLEAN NOT NULL DEFAULT false,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (merchant_id, employee_code)
);

-- 9. sawyan.partners (شركاء الشركة الفعليون داخل لوحة الإدارة فقط — D24)
CREATE TABLE sawyan.partners (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_code      VARCHAR(30) UNIQUE NOT NULL,
    full_name         VARCHAR(150) NOT NULL,
    email             VARCHAR(255) UNIQUE NOT NULL,
    phone             VARCHAR(24) NOT NULL,
    auth_user_id      UUID UNIQUE NOT NULL,
    partnership_scope VARCHAR(30) NOT NULL CHECK (partnership_scope IN ('global', 'country', 'sector_merchants')),
    scope_targets     JSONB NOT NULL DEFAULT '{}'::jsonb,
    profit_basis      VARCHAR(40) NOT NULL CHECK (profit_basis IN ('net_treasury_after_expenses', 'gross_treasury_share')),
    profit_share_pct  NUMERIC(6,3) NOT NULL CHECK (profit_share_pct > 0 AND profit_share_pct <= 100),
    contract_ref      VARCHAR(100) NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GROUP 2: TRANSACTIONS, TARGET BOXES, SETTLEMENT CYCLES & BITEMPORAL SETTINGS
-- ============================================================================

-- 10. sawyan.settlement_cycles (دورات الإقفال الشهري ذات الـ 6 خطوات — D3 + D28)
CREATE TABLE sawyan.settlement_cycles (
    id                            BIGSERIAL PRIMARY KEY,
    country_id                    INT NOT NULL REFERENCES sawyan.countries(id),
    period_ym                     CHAR(7) NOT NULL CHECK (period_ym ~ '^\d{4}-\d{2}$'),
    closure_utc_instant           TIMESTAMPTZ NOT NULL,
    step_status                   SMALLINT NOT NULL DEFAULT 1 CHECK (step_status BETWEEN 1 AND 6),
    zero_discrepancy_passed       BOOLEAN NOT NULL DEFAULT false,
    recalc_required               BOOLEAN NOT NULL DEFAULT false,
    ias21_fx_revaluation_entry_id UUID,
    maker_admin_id                UUID REFERENCES sawyan.admins(id),
    checker_admin_id              UUID REFERENCES sawyan.admins(id),
    is_hard_locked                BOOLEAN NOT NULL DEFAULT false,
    payout_executed_at            TIMESTAMPTZ,
    break_glass_expires_at        TIMESTAMPTZ,
    UNIQUE (country_id, period_ym),
    CONSTRAINT chk_cycle_maker_checker CHECK (
        checker_admin_id IS NULL OR checker_admin_id <> maker_admin_id
    )
);

-- 11. sawyan.monthly_target_boxes (صندوق الهدف الشهري لكل عضو ولكل دولة وشهر — D23 + D5 — ممنوع السالب بنيوياً)
CREATE TABLE sawyan.monthly_target_boxes (
    id                          BIGSERIAL PRIMARY KEY,
    member_id                   UUID NOT NULL REFERENCES sawyan.members(id),
    country_id                  INT NOT NULL REFERENCES sawyan.countries(id),
    period_ym                   CHAR(7) NOT NULL CHECK (period_ym ~ '^\d{4}-\d{2}$'),
    carry_on_in_usd             NUMERIC(18,6) NOT NULL DEFAULT 0.000000 CHECK (carry_on_in_usd >= 0),
    current_month_purchases_usd NUMERIC(18,6) NOT NULL DEFAULT 0.000000 CHECK (current_month_purchases_usd >= 0),
    compensatory_incoming_usd   NUMERIC(18,6) NOT NULL DEFAULT 0.000000 CHECK (compensatory_incoming_usd >= 0),
    target_required_usd         NUMERIC(18,2) NOT NULL CHECK (target_required_usd > 0),
    target_consumed_usd         NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (target_consumed_usd >= 0),
    carry_on_out_usd            NUMERIC(18,6) NOT NULL DEFAULT 0.000000 CHECK (carry_on_out_usd >= 0),
    is_qualified                BOOLEAN NOT NULL DEFAULT false,
    qualification_source        VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (qualification_source IN (
        'none', 'local_purchases', 'carry_on', 'compensatory'
    )),
    UNIQUE (member_id, country_id, period_ym)
);

-- 12. sawyan.pool_transactions (وعاء التوزيع بالمسح الصعودي الشهري — D23)
CREATE TABLE sawyan.pool_transactions (
    id                    BIGSERIAL PRIMARY KEY,
    settlement_cycle_id   BIGINT NOT NULL REFERENCES sawyan.settlement_cycles(id),
    member_id             UUID NOT NULL REFERENCES sawyan.members(id),
    target_box_id         BIGINT NOT NULL REFERENCES sawyan.monthly_target_boxes(id),
    source_type           VARCHAR(30) NOT NULL CHECK (source_type IN ('LOCAL_TARGET_BOX', 'COMPENSATORY_SETTLEMENT')),
    target_consumed_usd   NUMERIC(18,2) NOT NULL DEFAULT 24.75,
    deducted_amount_usd   NUMERIC(18,6) NOT NULL,
    company_share_usd     NUMERIC(18,6) NOT NULL,
    members_share_usd     NUMERIC(18,6) NOT NULL,
    share_per_member_usd  NUMERIC(18,6) NOT NULL,
    beneficiaries_count   INTEGER NOT NULL CHECK (beneficiaries_count >= 1),
    total_distributed_usd NUMERIC(18,2) NOT NULL,
    surplus_usd           NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    rounding_diff_usd     NUMERIC(18,6) NOT NULL DEFAULT 0.000000 CHECK (rounding_diff_usd >= 0),
    settings_snapshot     JSONB NOT NULL,
    processed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. sawyan.transactions (فواتير الشراء من الأرض والسوق — D4, D5, D8, D19, D25)
CREATE TABLE sawyan.transactions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id               UUID NOT NULL REFERENCES sawyan.members(id),
    merchant_id             UUID NOT NULL REFERENCES sawyan.merchants(id),
    branch_id               UUID NOT NULL REFERENCES sawyan.merchant_branches(id),
    country_id              INT NOT NULL REFERENCES sawyan.countries(id),
    cashier_employee_id     UUID REFERENCES sawyan.cashier_employees(id),
    sw_short_code           VARCHAR(24) UNIQUE NOT NULL,
    unique_payment_ref      VARCHAR(128) UNIQUE NOT NULL,
    idempotency_key         UUID UNIQUE NOT NULL,
    amount                  NUMERIC(18,2) NOT NULL CHECK (amount > 0),
    total_amount            NUMERIC(18,2) NOT NULL CHECK (total_amount >= amount),
    commission_amount       NUMERIC(18,6) NOT NULL CHECK (commission_amount > 0),
    company_share           NUMERIC(18,6) NOT NULL DEFAULT 0.000000,
    income_plan_share_local NUMERIC(18,6) NOT NULL DEFAULT 0.000000,
    income_plan_share_usd   NUMERIC(18,6) NOT NULL DEFAULT 0.000000,
    vat_amount              NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (vat_amount >= 0),
    currency_code           CHAR(3) NOT NULL,
    fx_rate_used            NUMERIC(18,6) NOT NULL CHECK (fx_rate_used > 0),
    payment_type            VARCHAR(30) NOT NULL CHECK (payment_type IN (
        'cash', 'pos_card', 'instant_transfer', 'iban_swift_sepa', 'digital_wallet',
        'payment_gateway', 'bnpl', 'cheque', 'cod', 'marketplace_escrow'
    )),
    status                  VARCHAR(35) NOT NULL CHECK (status IN (
        'pending', 'completed', 'awaiting_merchant_topup', 'rejected', 'disputed', 'reversed'
    )),
    fifo_seq                BIGSERIAL,
    receipt_media_url       TEXT,
    soft_hold_expires_at    TIMESTAMPTZ,
    commission_snapshot     JSONB NOT NULL,
    accounting_period_id    BIGINT REFERENCES sawyan.settlement_cycles(id),
    pool_transaction_id     BIGINT REFERENCES sawyan.pool_transactions(id),
    completed_at            TIMESTAMPTZ,
    reversed_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. sawyan.commission_distributions (تفصيل حصص المستفيدين الـ 11 — القيد الفعلي بالقطع TRUNC)
CREATE TABLE sawyan.commission_distributions (
    id                     BIGSERIAL PRIMARY KEY,
    pool_transaction_id    BIGINT NOT NULL REFERENCES sawyan.pool_transactions(id),
    beneficiary_id         UUID NOT NULL REFERENCES sawyan.members(id),
    share_amount_usd       NUMERIC(18,2) NOT NULL CHECK (share_amount_usd >= 0),
    beneficiary_generation INTEGER NOT NULL,
    beneficiary_position   SMALLINT NOT NULL CHECK (beneficiary_position BETWEEN 1 AND 11),
    wallet_transaction_id  UUID,
    added_to_wallet        BOOLEAN NOT NULL DEFAULT false
);

-- 15. sawyan.surplus_distributions (توزيع فائض القمة D27 وفائض S03 Pro-Rata D14)
CREATE TABLE sawyan.surplus_distributions (
    id                       BIGSERIAL PRIMARY KEY,
    pool_transaction_id      BIGINT NOT NULL REFERENCES sawyan.pool_transactions(id),
    beneficiary_id           UUID NOT NULL REFERENCES sawyan.members(id),
    surplus_amount_usd       NUMERIC(18,2) NOT NULL CHECK (surplus_amount_usd >= 0),
    distribution_rule        VARCHAR(30) NOT NULL DEFAULT 'equal',
    s03_suspense_excess_usd  NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (s03_suspense_excess_usd >= 0),
    s03_pro_rata_breakdown   JSONB,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. sawyan.compensatory_settlements (تسوية الأهداف التعويضية بالدول الأجنبية — D1)
CREATE TABLE sawyan.compensatory_settlements (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_cycle_id      BIGINT NOT NULL REFERENCES sawyan.settlement_cycles(id),
    member_id                UUID NOT NULL REFERENCES sawyan.members(id),
    foreign_country_id       INT NOT NULL REFERENCES sawyan.countries(id),
    gross_incoming_usd       NUMERIC(18,6) NOT NULL,
    target_box_portion_usd   NUMERIC(18,2) NOT NULL,
    treasury_counterpart_usd NUMERIC(18,2) NOT NULL,
    admin_fee_usd            NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (admin_fee_usd >= 0),
    net_payable_usd          NUMERIC(18,2) NOT NULL CHECK (net_payable_usd >= 0),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. sawyan.settings (جدول المعاملات ثنائي الزمن Bitemporal — D19 + D28)
CREATE TABLE sawyan.settings (
    id                            SERIAL PRIMARY KEY,
    country_id                    INT REFERENCES sawyan.countries(id),
    brand_display_title           VARCHAR(60) NOT NULL DEFAULT 'SAWYAN',
    company_percent               NUMERIC(5,2) NOT NULL DEFAULT 25.00 CHECK (company_percent > 0 AND company_percent < 100),
    generations_count             INTEGER NOT NULL DEFAULT 11 CHECK (generations_count >= 1),
    numerical_stopper_s01         INTEGER NOT NULL DEFAULT 11 CHECK (numerical_stopper_s01 >= 1),
    upline_ceiling_s02            INTEGER NOT NULL DEFAULT 11 CHECK (upline_ceiling_s02 >= 1),
    cap_amount                    NUMERIC(18,2) NOT NULL DEFAULT 4605.75,
    cap_auto_calc                 BOOLEAN NOT NULL DEFAULT true,
    monthly_target_usd            NUMERIC(18,2) NOT NULL DEFAULT 24.75 CHECK (monthly_target_usd > 0),
    payout_day                    SMALLINT NOT NULL DEFAULT 15 CHECK (payout_day BETWEEN 2 AND 28),
    merchant_warn1_pct            NUMERIC(5,2) NOT NULL DEFAULT 30.00,
    merchant_warn2_pct            NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    merchant_isolate_pct          NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    unsecured_queue_cap           SMALLINT NOT NULL DEFAULT 3 CHECK (unsecured_queue_cap >= 1),
    unconfirmed_soft_hold_cap_pct NUMERIC(5,2) NOT NULL DEFAULT 20.00 CHECK (unconfirmed_soft_hold_cap_pct BETWEEN 1.00 AND 100.00),
    wht_threshold_usd             NUMERIC(18,2) NOT NULL DEFAULT 200.00 CHECK (wht_threshold_usd >= 0),
    withdrawal_cooldown_hours     INTEGER NOT NULL DEFAULT 72 CHECK (withdrawal_cooldown_hours >= 0),
    dormancy_months               INTEGER NOT NULL DEFAULT 0 CHECK (dormancy_months >= 0),
    recorded_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_from                TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_admin_id           UUID REFERENCES sawyan.admins(id),
    approved_by_admin_id          UUID REFERENCES sawyan.admins(id),
    change_reason                 TEXT NOT NULL DEFAULT 'Initial Constitution V3.0 Setup',
    CONSTRAINT chk_merchant_pct_ladder CHECK (
        merchant_warn1_pct > merchant_warn2_pct
        AND merchant_warn2_pct > merchant_isolate_pct
        AND merchant_isolate_pct > 0
    ),
    CONSTRAINT chk_settings_maker_checker CHECK (
        created_by_admin_id IS NULL OR approved_by_admin_id IS DISTINCT FROM created_by_admin_id
    )
);

-- ============================================================================
-- GROUP 3: DOUBLE-ENTRY LEDGER, WALLETS, TAX INVOICES & PSP RECONCILIATION
-- ============================================================================

-- 18. sawyan.chart_of_accounts (دليل الحسابات المرقم COA — S02)
CREATE TABLE sawyan.chart_of_accounts (
    account_code        VARCHAR(16) PRIMARY KEY,
    account_name_ar     VARCHAR(150) NOT NULL,
    account_name_en     VARCHAR(150) NOT NULL,
    normal_balance      CHAR(1) NOT NULL CHECK (normal_balance IN ('D', 'C')),
    is_system_protected BOOLEAN NOT NULL DEFAULT true
);

-- 19. sawyan.journal_entries (رأس قيد اليومية المزدوج غير القابل للمحو)
CREATE TABLE sawyan.journal_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number        BIGSERIAL UNIQUE NOT NULL,
    settlement_cycle_id BIGINT REFERENCES sawyan.settlement_cycles(id),
    source_type         VARCHAR(40) NOT NULL CHECK (source_type IN (
        'INVOICE', 'MERCHANT_TOPUP', 'PSP_SETTLEMENT', 'COMPENSATORY_SETTLEMENT',
        'MONTHLY_DISTRIBUTION', 'SURPLUS_SUSPENSE', 'WITHDRAWAL', 'CLAWBACK_REVERSAL',
        'IAS21_REVALUATION', 'TAX_WHT', 'TAX_VAT_B2B', 'ROUNDING_ADJUSTMENT', 'MANUAL_AUDIT_ADJUSTMENT'
    )),
    source_id           UUID NOT NULL,
    country_id          INT REFERENCES sawyan.countries(id),
    fx_rate_used        NUMERIC(18,6) NOT NULL DEFAULT 1.000000 CHECK (fx_rate_used > 0),
    reverses_entry_id   UUID REFERENCES sawyan.journal_entries(id),
    description         TEXT NOT NULL,
    posted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 20. sawyan.journal_lines (بنود القيد المزدوج — توازن صفري صارم)
CREATE TABLE sawyan.journal_lines (
    id               BIGSERIAL PRIMARY KEY,
    journal_entry_id UUID NOT NULL REFERENCES sawyan.journal_entries(id),
    account_code     VARCHAR(16) NOT NULL REFERENCES sawyan.chart_of_accounts(account_code),
    entity_type      VARCHAR(20) CHECK (entity_type IN ('member', 'merchant', 'treasury', 'partner', 'psp')),
    entity_id        UUID,
    debit_usd        NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (debit_usd >= 0),
    credit_usd       NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (credit_usd >= 0),
    amount_local     NUMERIC(18,2) NOT NULL,
    currency_code    CHAR(3) NOT NULL DEFAULT 'USD',
    CONSTRAINT chk_debit_xor_credit CHECK (
        (debit_usd > 0 AND credit_usd = 0) OR (credit_usd > 0 AND debit_usd = 0) OR (debit_usd = 0 AND credit_usd = 0 AND amount_local = 0)
    )
);

-- 21. sawyan.wallets (أرصدة المحافظ المشتقة والمدققة)
CREATE TABLE sawyan.wallets (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id                UUID UNIQUE NOT NULL REFERENCES sawyan.members(id),
    balance_usd              NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (balance_usd >= 0),
    pending_balance_usd      NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (pending_balance_usd >= 0),
    s03_suspense_balance_usd NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (s03_suspense_balance_usd >= 0),
    total_earned_usd         NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (total_earned_usd >= 0),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. sawyan.wallet_transactions (حركات المحفظة — محظور فيها transfer_p2p وclawback_reversal بقرار D24 + D5)
CREATE TABLE sawyan.wallet_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id        UUID NOT NULL REFERENCES sawyan.wallets(id),
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN (
        'commission', 'cashback', 'withdrawal', 'withdrawal_fee', 'wht_tax', 's03_release'
    )),
    amount_usd       NUMERIC(18,2) NOT NULL,
    local_amount     NUMERIC(18,2),
    currency_code    CHAR(3),
    fx_rate_used     NUMERIC(18,6) CHECK (fx_rate_used IS NULL OR fx_rate_used > 0),
    journal_entry_id UUID NOT NULL REFERENCES sawyan.journal_entries(id),
    reference_id     UUID,
    status           VARCHAR(25) NOT NULL CHECK (status IN (
        'pending_settlement', 'available', 'processing_payout', 'completed', 'rejected', 'reversed'
    )),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 23. sawyan.payment_methods (وسائل الاستلام وتهدئة 72 ساعة — W07)
CREATE TABLE sawyan.payment_methods (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id           UUID NOT NULL REFERENCES sawyan.members(id),
    provider            VARCHAR(40) NOT NULL,
    account_holder_name VARCHAR(150) NOT NULL,
    provider_token_enc  BYTEA NOT NULL,
    last_four           CHAR(4),
    card_brand          VARCHAR(30),
    is_verified         BOOLEAN NOT NULL DEFAULT false,
    cooldown_expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '72 hours'),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 24. sawyan.payment_logs (سجلات بوابات الدفع والـ Webhooks)
CREATE TABLE sawyan.payment_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id    UUID REFERENCES sawyan.transactions(id),
    provider          VARCHAR(40) NOT NULL,
    action            VARCHAR(40) NOT NULL,
    amount            NUMERIC(18,2) NOT NULL,
    currency_code     CHAR(3) NOT NULL,
    status            VARCHAR(30) NOT NULL,
    hmac_verified     BOOLEAN NOT NULL DEFAULT false,
    provider_event_id VARCHAR(128),
    provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_event_id)
);

-- 25. sawyan.idempotency_keys (منع تكرار العمليات الحساسة — S05)
CREATE TABLE sawyan.idempotency_keys (
    idempotency_key UUID PRIMARY KEY,
    actor_id        UUID NOT NULL,
    endpoint        VARCHAR(120) NOT NULL,
    request_hash    CHAR(64) NOT NULL,
    response_status SMALLINT,
    response_body   JSONB,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 26. sawyan.b2b_tax_invoices (محرك الفوترة الضريبية المزدوجة B2B Tax-Exclusive وإشعارات الدائن — D19 / Y07)
CREATE TABLE sawyan.b2b_tax_invoices (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number           VARCHAR(50) UNIQUE NOT NULL,
    document_type            VARCHAR(20) NOT NULL CHECK (document_type IN ('tax_invoice', 'credit_note')),
    original_tax_invoice_id  UUID REFERENCES sawyan.b2b_tax_invoices(id),
    merchant_id              UUID NOT NULL REFERENCES sawyan.merchants(id),
    branch_id                UUID REFERENCES sawyan.merchant_branches(id),
    country_id               INT NOT NULL REFERENCES sawyan.countries(id),
    transaction_id           UUID REFERENCES sawyan.transactions(id),
    settlement_cycle_id      BIGINT REFERENCES sawyan.settlement_cycles(id),
    merchant_tax_reg_no      VARCHAR(64),
    net_commission_amount    NUMERIC(18,2) NOT NULL,
    vat_rate_applied         NUMERIC(6,4) NOT NULL DEFAULT 0.0000,
    vat_amount               NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    gross_invoice_total      NUMERIC(18,2) NOT NULL,
    currency_code            CHAR(3) NOT NULL,
    fx_rate_used             NUMERIC(18,6) NOT NULL CHECK (fx_rate_used > 0),
    qr_tlv_base64            TEXT,
    gov_submission_status    VARCHAR(25) NOT NULL DEFAULT 'not_required' CHECK (gov_submission_status IN (
        'not_required', 'pending', 'submitted_reported', 'cleared', 'rejected'
    )),
    journal_entry_id         UUID NOT NULL REFERENCES sawyan.journal_entries(id),
    issued_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_credit_note_origin CHECK (
        document_type <> 'credit_note' OR original_tax_invoice_id IS NOT NULL
    )
);

-- 27. sawyan.psp_settlement_batches (مطابقة تسويات بوابات الدفع والبنوك وعمولات التحصيل)
CREATE TABLE sawyan.psp_settlement_batches (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider                  VARCHAR(40) NOT NULL,
    country_id                INT NOT NULL REFERENCES sawyan.countries(id),
    psp_payout_batch_ref      VARCHAR(128) UNIQUE NOT NULL,
    gross_collected_amount    NUMERIC(18,2) NOT NULL CHECK (gross_collected_amount > 0),
    psp_gateway_fee_amount    NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (psp_gateway_fee_amount >= 0),
    psp_vat_on_fee_amount     NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (psp_vat_on_fee_amount >= 0),
    net_bank_deposited_amount NUMERIC(18,2) NOT NULL CHECK (net_bank_deposited_amount >= 0),
    currency_code             CHAR(3) NOT NULL,
    fx_rate_used              NUMERIC(18,6) NOT NULL CHECK (fx_rate_used > 0),
    fee_bearer                VARCHAR(20) NOT NULL DEFAULT 'company' CHECK (fee_bearer IN ('company', 'merchant')),
    reconciliation_status     VARCHAR(25) NOT NULL DEFAULT 'pending' CHECK (reconciliation_status IN (
        'pending', 'matched_zero_diff', 'discrepancy_flagged'
    )),
    discrepancy_amount        NUMERIC(18,2) NOT NULL DEFAULT 0.00,
    bank_statement_ref        VARCHAR(128),
    journal_entry_id          UUID REFERENCES sawyan.journal_entries(id),
    settled_at                TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- GROUP 4: MARKETPLACE & ESCROW ORDERS (EXPANSION ENGINE)
-- ============================================================================

-- 28. sawyan.categories
CREATE TABLE sawyan.categories (
    id         SERIAL PRIMARY KEY,
    parent_id  INT REFERENCES sawyan.categories(id),
    slug       VARCHAR(80) UNIQUE NOT NULL,
    name_i18n  JSONB NOT NULL,
    risk_level VARCHAR(20) NOT NULL DEFAULT 'standard',
    is_active  BOOLEAN NOT NULL DEFAULT true
);

-- 29. sawyan.products
CREATE TABLE sawyan.products (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id   UUID NOT NULL REFERENCES sawyan.merchants(id),
    category_id   INT NOT NULL REFERENCES sawyan.categories(id),
    title_i18n    JSONB NOT NULL,
    price         NUMERIC(18,2) NOT NULL CHECK (price > 0),
    currency_code CHAR(3) NOT NULL,
    stock_qty     INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 30. sawyan.orders
CREATE TABLE sawyan.orders (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id      UUID NOT NULL REFERENCES sawyan.members(id),
    merchant_id    UUID NOT NULL REFERENCES sawyan.merchants(id),
    transaction_id UUID UNIQUE REFERENCES sawyan.transactions(id),
    escrow_status  VARCHAR(30) NOT NULL CHECK (escrow_status IN (
        'awaiting_payment', 'held_in_escrow', 'shipped', 'delivered', 'released', 'refunded', 'disputed'
    )),
    total_amount   NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
    currency_code  CHAR(3) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 31. sawyan.order_items
CREATE TABLE sawyan.order_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID NOT NULL REFERENCES sawyan.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES sawyan.products(id),
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(18,2) NOT NULL CHECK (unit_price > 0)
);

-- 32. sawyan.shipping
CREATE TABLE sawyan.shipping (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id             UUID NOT NULL REFERENCES sawyan.orders(id) ON DELETE CASCADE,
    shipping_merchant_id UUID REFERENCES sawyan.merchants(id),
    tracking_number      VARCHAR(100),
    carrier_name         VARCHAR(80),
    shipping_fee         NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (shipping_fee >= 0),
    status               VARCHAR(30) NOT NULL,
    delivered_at         TIMESTAMPTZ
);

-- ============================================================================
-- GROUP 5: GOVERNANCE, MAKER-CHECKER, DISPUTES, ANTI-FRAUD, CRM & AUDIT
-- ============================================================================

-- 33. sawyan.maker_checker_requests (سجل الاعتماد المزدوج الإجباري)
CREATE TABLE sawyan.maker_checker_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type       VARCHAR(60) NOT NULL,
    target_entity     VARCHAR(60) NOT NULL,
    target_id         TEXT NOT NULL,
    payload_before    JSONB,
    payload_after     JSONB NOT NULL,
    impact_simulation JSONB,
    reason            TEXT NOT NULL,
    maker_admin_id    UUID NOT NULL REFERENCES sawyan.admins(id),
    checker_admin_id  UUID REFERENCES sawyan.admins(id),
    status            VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    effective_from    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at        TIMESTAMPTZ,
    CONSTRAINT chk_mc_distinct_admins CHECK (checker_admin_id IS NULL OR checker_admin_id <> maker_admin_id)
);

-- 34. sawyan.dispute_tickets (تذكرة النزاع الثلاثية الذكية — D6 + S09 SLA)
CREATE TABLE sawyan.dispute_tickets (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id     UUID NOT NULL REFERENCES sawyan.transactions(id),
    member_id          UUID NOT NULL REFERENCES sawyan.members(id),
    merchant_id        UUID NOT NULL REFERENCES sawyan.merchants(id),
    dispute_category   VARCHAR(30) NOT NULL DEFAULT 'general' CHECK (dispute_category IN (
        'general', 'return_stalled', 'pending_rejected', 'amount_mismatch', 'merchant_return_escalation'
    )),
    dispute_reason     TEXT NOT NULL,
    evidence_url       TEXT,
    audio_url          TEXT,
    audio_duration_sec SMALLINT CHECK (audio_duration_sec IS NULL OR audio_duration_sec <= 60),
    video_url          TEXT,
    video_duration_sec SMALLINT CHECK (video_duration_sec IS NULL OR video_duration_sec <= 15),
    status             VARCHAR(30) NOT NULL CHECK (status IN (
        'awaiting_merchant_friendly', 'escalated_to_admin', 'resolved_member', 'resolved_merchant', 'appealed_72h'
    )),
    sla_deadline_at    TIMESTAMPTZ NOT NULL,
    appeal_deadline_at TIMESTAMPTZ,
    assigned_admin_id  UUID REFERENCES sawyan.admins(id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 35. sawyan.price_gouging_reports (رادار رفع الأسعار على الأعضاء — S10)
CREATE TABLE sawyan.price_gouging_reports (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id        UUID NOT NULL REFERENCES sawyan.transactions(id),
    member_id             UUID NOT NULL REFERENCES sawyan.members(id),
    merchant_id           UUID NOT NULL REFERENCES sawyan.merchants(id),
    shelf_price_photo_url TEXT NOT NULL,
    receipt_photo_url     TEXT NOT NULL,
    declared_price        NUMERIC(18,2) NOT NULL CHECK (declared_price > 0),
    charged_price         NUMERIC(18,2) NOT NULL CHECK (charged_price > declared_price),
    verification_status   VARCHAR(25) NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
        'pending', 'verified_violation', 'dismissed'
    )),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (transaction_id, member_id)
);

-- 36. sawyan.fraud_graph_signals (كاشف الغش الشبكي وتقاطع البصمات — S10 + D25)
CREATE TABLE sawyan.fraud_graph_signals (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_type          VARCHAR(40) NOT NULL CHECK (signal_type IN (
        'shared_device_fingerprint', 'shared_ip_cluster', 'shared_bank_account',
        'end_of_month_2475_cluster', 'cashier_upline_collusion', 'price_gouging_threshold_3'
    )),
    severity             VARCHAR(15) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    involved_member_ids  UUID[] NOT NULL,
    involved_merchant_id UUID REFERENCES sawyan.merchants(id),
    evidence_payload     JSONB NOT NULL,
    status               VARCHAR(25) NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'payout_held', 'cleared', 'confirmed_fraud'
    )),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 37. sawyan.member_contacts (دفتر المعارف الميداني Mini CRM — Point 10)
CREATE TABLE sawyan.member_contacts (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_member_id            UUID NOT NULL REFERENCES sawyan.members(id) ON DELETE CASCADE,
    contact_name               VARCHAR(150) NOT NULL,
    contact_phone_e164         VARCHAR(24),
    registered_member_id       UUID REFERENCES sawyan.members(id),
    last_whatsapp_reminder_at  TIMESTAMPTZ,
    opted_out                  BOOLEAN NOT NULL DEFAULT false,
    notes                      TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 38. sawyan.academy_courses
CREATE TABLE sawyan.academy_courses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         VARCHAR(100) UNIQUE NOT NULL,
    title_i18n   JSONB NOT NULL,
    content_i18n JSONB NOT NULL,
    media_url    TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT false
);

-- 39. sawyan.reviews
CREATE TABLE sawyan.reviews (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID UNIQUE NOT NULL REFERENCES sawyan.transactions(id),
    member_id      UUID NOT NULL REFERENCES sawyan.members(id),
    merchant_id    UUID NOT NULL REFERENCES sawyan.merchants(id),
    rating         SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 40. sawyan.complaints
CREATE TABLE sawyan.complaints (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complainant_id UUID NOT NULL,
    target_type    VARCHAR(20) NOT NULL,
    target_id      UUID NOT NULL,
    subject        VARCHAR(200) NOT NULL,
    details        TEXT NOT NULL,
    status         VARCHAR(30) NOT NULL DEFAULT 'open',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 41. sawyan.support_tickets
CREATE TABLE sawyan.support_tickets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_type    VARCHAR(20) NOT NULL,
    requester_id      UUID NOT NULL,
    category          VARCHAR(50) NOT NULL,
    priority          VARCHAR(15) NOT NULL DEFAULT 'normal',
    status            VARCHAR(25) NOT NULL DEFAULT 'open',
    sla_due_at        TIMESTAMPTZ,
    assigned_admin_id UUID REFERENCES sawyan.admins(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 42. sawyan.notifications (طابور الإشعارات غير المتزامن و Transactional Outbox)
CREATE TABLE sawyan.notifications (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_type VARCHAR(20) NOT NULL,
    recipient_id   UUID NOT NULL,
    event_name     VARCHAR(60) NOT NULL,
    channel        VARCHAR(20) NOT NULL CHECK (channel IN ('in_app', 'push', 'whatsapp', 'email')),
    payload        JSONB NOT NULL,
    is_read        BOOLEAN NOT NULL DEFAULT false,
    dispatched_at  TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 43. sawyan.audit_logs (سجل التدقيق غير القابل للحذف أو التعديل Append-Only)
CREATE TABLE sawyan.audit_logs (
    id             BIGSERIAL PRIMARY KEY,
    actor_type     VARCHAR(20) NOT NULL,
    actor_id       UUID NOT NULL,
    actor_ip       INET,
    action         VARCHAR(80) NOT NULL,
    table_name     VARCHAR(60) NOT NULL,
    record_id      TEXT NOT NULL,
    before_data    JSONB,
    after_data     JSONB,
    recorded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_from TIMESTAMPTZ,
    prev_row_hash  CHAR(64),
    row_hash       CHAR(64) NOT NULL
);

-- 44. sawyan.return_requests (مصافحة المرتجع المزدوجة بـ OTP أو موافقة التطبيق قبل تسليم النقد — D5 + M8 + S05)
CREATE TABLE sawyan.return_requests (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id    UUID NOT NULL REFERENCES sawyan.transactions(id),
    merchant_id       UUID NOT NULL REFERENCES sawyan.merchants(id),
    member_id         UUID NOT NULL REFERENCES sawyan.members(id),
    reason            TEXT NOT NULL,
    otp_sha256        CHAR(64) NOT NULL,
    failed_attempts   SMALLINT NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    max_attempts      SMALLINT NOT NULL DEFAULT 5 CHECK (max_attempts >= 1),
    status            VARCHAR(25) NOT NULL DEFAULT 'pending_otp' CHECK (status IN (
        'pending_otp', 'approved_otp', 'approved_in_app', 'rejected_member', 'locked', 'expired', 'escalated_to_admin'
    )),
    proof_url         TEXT,
    expires_at        TIMESTAMPTZ NOT NULL,
    resolved_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- STRATEGIC PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX idx_geonames_trgm ON sawyan.geonames_locations USING gin (search_vector extensions.gin_trgm_ops);
CREATE INDEX idx_members_sponsor ON sawyan.members (sponsor_id);
CREATE INDEX idx_members_parent ON sawyan.members (parent_member_id);
CREATE INDEX idx_members_country ON sawyan.members (residency_country_id);
CREATE INDEX idx_tree_closure_anc_depth ON sawyan.tree_closure (ancestor_id, depth, root_arm_side);
CREATE INDEX idx_tree_closure_desc_depth ON sawyan.tree_closure (descendant_id, depth);
CREATE INDEX idx_branches_geo_active ON sawyan.merchant_branches (merchant_id, is_branch_active, latitude, longitude);
CREATE INDEX idx_tx_merchant_fifo ON sawyan.transactions (merchant_id, fifo_seq ASC) WHERE status = 'awaiting_merchant_topup';
CREATE INDEX idx_tx_branch_status ON sawyan.transactions (merchant_id, branch_id, status);
CREATE INDEX idx_tx_member_created ON sawyan.transactions (member_id, created_at DESC);
CREATE INDEX idx_settings_bitemporal ON sawyan.settings (country_id, effective_from DESC, recorded_at DESC);
CREATE INDEX idx_journal_lines_entry ON sawyan.journal_lines (journal_entry_id);
CREATE INDEX idx_journal_lines_acct ON sawyan.journal_lines (account_code);
CREATE INDEX idx_notifications_recipient ON sawyan.notifications (recipient_id, is_read, created_at DESC);
CREATE INDEX idx_return_requests_tx_status ON sawyan.return_requests (transaction_id, status);
CREATE INDEX idx_return_requests_member_pending ON sawyan.return_requests (member_id, status) WHERE status = 'pending_otp';

-- ============================================================================
-- STRUCTURAL DATA INTEGRITY & IMMUTABILITY TRIGGERS
-- ============================================================================

-- A. منع تعديل أو حذف السجلات المالية والتدقيقية (Immutable Ledger & Audit Log)
CREATE OR REPLACE FUNCTION sawyan.prevent_immutable_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'IMMUTABLE_RECORD_VIOLATION: Table %.% cannot be updated or deleted directly.', TG_TABLE_SCHEMA, TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER trg_immutable_audit_logs
    BEFORE UPDATE OR DELETE ON sawyan.audit_logs
    FOR EACH ROW EXECUTE FUNCTION sawyan.prevent_immutable_modification();

CREATE TRIGGER trg_immutable_journal_entries
    BEFORE UPDATE OR DELETE ON sawyan.journal_entries
    FOR EACH ROW EXECUTE FUNCTION sawyan.prevent_immutable_modification();

CREATE TRIGGER trg_immutable_journal_lines
    BEFORE UPDATE OR DELETE ON sawyan.journal_lines
    FOR EACH ROW EXECUTE FUNCTION sawyan.prevent_immutable_modification();

-- B. قيد التوازن المزدوج الإلزامي عند نهاية المعاملة (SUM(debit_usd) = SUM(credit_usd))
CREATE OR REPLACE FUNCTION sawyan.enforce_journal_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_entry_id UUID;
    v_sum_dr   NUMERIC(18,2);
    v_sum_cr   NUMERIC(18,2);
BEGIN
    v_entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
    SELECT COALESCE(SUM(debit_usd), 0), COALESCE(SUM(credit_usd), 0)
      INTO v_sum_dr, v_sum_cr
      FROM sawyan.journal_lines
     WHERE journal_entry_id = v_entry_id;

    IF v_sum_dr <> v_sum_cr THEN
        RAISE EXCEPTION 'UNBALANCED_JOURNAL_ENTRY: entry=% debit=% credit=%', v_entry_id, v_sum_dr, v_sum_cr;
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_enforce_journal_balance
    AFTER INSERT OR UPDATE OR DELETE ON sawyan.journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION sawyan.enforce_journal_balance();

-- C. زناد رادار رفع الأسعار عند 3 بلاغات موثقة من أعضاء مختلفين (S10)
CREATE OR REPLACE FUNCTION sawyan.check_price_gouging_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_verified_count INT;
    v_member_ids     UUID[];
BEGIN
    IF NEW.verification_status = 'verified_violation' THEN
        SELECT COUNT(DISTINCT member_id), ARRAY_AGG(DISTINCT member_id)
          INTO v_verified_count, v_member_ids
          FROM sawyan.price_gouging_reports
         WHERE merchant_id = NEW.merchant_id
           AND verification_status = 'verified_violation';

        IF v_verified_count >= 3 THEN
            INSERT INTO sawyan.fraud_graph_signals (
                signal_type, severity, involved_member_ids, involved_merchant_id, evidence_payload, status
            ) VALUES (
                'price_gouging_threshold_3',
                'high',
                v_member_ids,
                NEW.merchant_id,
                jsonb_build_object('verified_reports', v_verified_count, 'trigger_report_id', NEW.id),
                'open'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_price_gouging_threshold
    AFTER INSERT OR UPDATE OF verification_status ON sawyan.price_gouging_reports
    FOR EACH ROW EXECUTE FUNCTION sawyan.check_price_gouging_trigger();
