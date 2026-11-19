-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.1 NON-DESTRUCTIVE FORWARD MIGRATION (ZERO-LIABILITY D5)
-- Safe to run on live `sawyan` (or cloned via `clone_sql_for_demo` for `sawyan_demo`)
-- Preserves 100% of existing members, merchants, ledger entries, and wallets.
-- Run updated SQL files (02, 06, 07, 08, 09, 10) right after this migration,
-- or deploy cleanly via schema migration + PostgREST schema reload.
-- ============================================================================

BEGIN;

-- 1. Pre-flight Safety Assertion: Abort if legacy accounts 1301/3101/5201 still carry non-zero balances
DO $$
DECLARE
    v_legacy_bal NUMERIC(18,2) := 0.00;
BEGIN
    SELECT COALESCE(SUM(ABS(debit_usd - credit_usd)), 0.00)
      INTO v_legacy_bal
      FROM sawyan.journal_lines
     WHERE account_code IN ('1301', '3101', '5201');

    IF v_legacy_bal <> 0.00 THEN
        RAISE EXCEPTION 'MIGRATION_ABORTED_NONZERO_LEGACY_ACCOUNTS: Legacy accounts 1301/3101/5201 have net balance %.2f. Post manual audit clearing entries before migrating.', v_legacy_bal;
    END IF;
END $$;

-- 2. Non-destructive schema extensions & constitutional column cleanup
ALTER TABLE sawyan.countries
    ADD COLUMN IF NOT EXISTS payout_release_hour SMALLINT NOT NULL DEFAULT 18;

ALTER TABLE sawyan.settlement_cycles
    ADD COLUMN IF NOT EXISTS recalc_required    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payout_executed_at TIMESTAMPTZ;

ALTER TABLE sawyan.transactions
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversed_at  TIMESTAMPTZ;

ALTER TABLE sawyan.dispute_tickets
    ADD COLUMN IF NOT EXISTS dispute_category VARCHAR(30) NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS evidence_url     TEXT;

ALTER TABLE sawyan.monthly_target_boxes
    DROP COLUMN IF EXISTS negative_clawback_usd;

ALTER TABLE sawyan.settings
    DROP COLUMN IF EXISTS rolling_reserve_pct;

-- Ensure payout_release_hour, dispute_category, wallet_transactions & journal_entries constraints match V3.1
DO $$
DECLARE
    v_con RECORD;
BEGIN
    -- Refresh journal_entries.source_type CHECK to allow MANUAL_AUDIT_ADJUSTMENT
    FOR v_con IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'sawyan.journal_entries'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%source_type%'
    LOOP
        EXECUTE format('ALTER TABLE sawyan.journal_entries DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;
    ALTER TABLE sawyan.journal_entries ADD CONSTRAINT chk_journal_source_type CHECK (
        source_type IN (
            'INVOICE', 'MERCHANT_TOPUP', 'PSP_SETTLEMENT', 'COMPENSATORY_SETTLEMENT',
            'MONTHLY_DISTRIBUTION', 'SURPLUS_SUSPENSE', 'WITHDRAWAL', 'CLAWBACK_REVERSAL',
            'IAS21_REVALUATION', 'TAX_WHT', 'TAX_VAT_B2B', 'ROUNDING_ADJUSTMENT', 'MANUAL_AUDIT_ADJUSTMENT'
        )
    );

    -- Refresh wallet_transactions.transaction_type CHECK (clawback_reversal permanently banned D5)
    IF NOT EXISTS (SELECT 1 FROM sawyan.wallet_transactions WHERE transaction_type = 'clawback_reversal') THEN
        FOR v_con IN
            SELECT conname FROM pg_constraint
             WHERE conrelid = 'sawyan.wallet_transactions'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) LIKE '%transaction_type%'
        LOOP
            EXECUTE format('ALTER TABLE sawyan.wallet_transactions DROP CONSTRAINT IF EXISTS %I', v_con.conname);
        END LOOP;
        ALTER TABLE sawyan.wallet_transactions ADD CONSTRAINT chk_wallet_tx_type CHECK (
            transaction_type IN ('commission', 'cashback', 'withdrawal', 'withdrawal_fee', 'wht_tax', 's03_release')
        );
    END IF;

    -- Refresh dispute_tickets.dispute_category CHECK
    FOR v_con IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'sawyan.dispute_tickets'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%dispute_category%'
    LOOP
        EXECUTE format('ALTER TABLE sawyan.dispute_tickets DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;
    ALTER TABLE sawyan.dispute_tickets ADD CONSTRAINT chk_dispute_category CHECK (
        dispute_category IN ('general', 'return_stalled', 'pending_rejected', 'amount_mismatch', 'merchant_return_escalation')
    );

    -- Refresh countries.payout_release_hour CHECK
    FOR v_con IN
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'sawyan.countries'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%payout_release_hour%'
    LOOP
        EXECUTE format('ALTER TABLE sawyan.countries DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;
    ALTER TABLE sawyan.countries ADD CONSTRAINT chk_payout_release_hour CHECK (
        payout_release_hour BETWEEN 0 AND 23
    );
END $$;

-- Remove legacy CoA accounts only if zero historical journal lines reference them
DELETE FROM sawyan.chart_of_accounts coa
 WHERE coa.account_code IN ('1301', '3101', '5201')
   AND NOT EXISTS (
       SELECT 1 FROM sawyan.journal_lines jl WHERE jl.account_code = coa.account_code
   );

-- 3. Create Table #44: sawyan.return_requests + Strict RLS Lockdown (No direct anon/authenticated SELECT)
CREATE TABLE IF NOT EXISTS sawyan.return_requests (
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

CREATE INDEX IF NOT EXISTS idx_return_requests_tx_status ON sawyan.return_requests (transaction_id, status);
CREATE INDEX IF NOT EXISTS idx_return_requests_member_pending ON sawyan.return_requests (member_id, status) WHERE status = 'pending_otp';

ALTER TABLE sawyan.return_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sawyan.return_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sawyan.return_requests TO service_role;

-- Backfill completed_at for existing completed transactions cleanly
UPDATE sawyan.transactions
   SET completed_at = COALESCE(completed_at, created_at)
 WHERE status IN ('completed', 'reversed')
   AND completed_at IS NULL;

-- 4. Drop obsolete PostgreSQL function overloads before deploying V3.1 definitions
DROP FUNCTION IF EXISTS sawyan.process_transaction_reversal_clawback(UUID, VARCHAR, UUID, CHAR);
DROP FUNCTION IF EXISTS sawyan.finalize_settlement_payout_step5_6(CHAR, UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS sawyan.merchant_process_pos_return(UUID, UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS sawyan.submit_member_dispute(UUID, UUID, TEXT, TEXT, TEXT, SMALLINT, TEXT, SMALLINT);

NOTIFY pgrst, 'reload schema';

COMMIT;
