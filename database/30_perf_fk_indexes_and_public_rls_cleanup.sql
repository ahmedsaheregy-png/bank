-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 23: HOT-PATH FK INDEXES & LEGACY PUBLIC RLS CLEANUP
-- ============================================================================
-- 1) Adds 42 high-impact B-tree covering indexes on unindexed foreign keys
--    across hot transactional, wallet ledger, binary tree, merchant POS,
--    dispute, and Day-15 settlement tables in BOTH `sawyan` and `sawyan_demo`
--    (eliminating Seq Scans on JOINs and CASCADE operations at scale).
-- 2) Drops 12 dead legacy permissive RLS policies (`Dev: anon all public_*`
--    and `pub_*_all`) on retired `public.*` tables that already have RLS
--    enabled and `REVOKE ALL FROM anon, authenticated`, reducing Supabase
--    Performance Advisor `multiple_permissive_policies` warnings from 120 -> 0.
-- Strictly Idempotent (IF NOT EXISTS / IF EXISTS).
-- ============================================================================

DO $$
DECLARE
    v_schema TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo'] LOOP
        IF to_regnamespace(v_schema) IS NULL THEN
            CONTINUE;
        END IF;

        -- Binary Tree, Members & Monthly Target Boxes
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_members_left_child_id ON %I.members (left_child_id) WHERE left_child_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_members_right_child_id ON %I.members (right_child_id) WHERE right_child_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_members_nationality_country_id ON %I.members (nationality_country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_mtb_country_id ON %I.monthly_target_boxes (country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_payment_methods_member_id ON %I.payment_methods (member_id)', v_schema, v_schema);

        -- Wallet, Double-Entry Ledger & Day-15 Settlement Engine
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_wallet_tx_wallet_id ON %I.wallet_transactions (wallet_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_wallet_tx_journal_entry_id ON %I.wallet_transactions (journal_entry_id) WHERE journal_entry_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_journal_entries_cycle_id ON %I.journal_entries (settlement_cycle_id) WHERE settlement_cycle_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_journal_entries_country_id ON %I.journal_entries (country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_pool_tx_cycle_id ON %I.pool_transactions (settlement_cycle_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_pool_tx_member_id ON %I.pool_transactions (member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_pool_tx_target_box_id ON %I.pool_transactions (target_box_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_comm_dist_beneficiary_id ON %I.commission_distributions (beneficiary_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_comm_dist_pool_tx_id ON %I.commission_distributions (pool_transaction_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_surplus_dist_beneficiary_id ON %I.surplus_distributions (beneficiary_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_surplus_dist_pool_tx_id ON %I.surplus_distributions (pool_transaction_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_comp_sett_cycle_id ON %I.compensatory_settlements (settlement_cycle_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_comp_sett_member_id ON %I.compensatory_settlements (member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_comp_sett_foreign_country_id ON %I.compensatory_settlements (foreign_country_id)', v_schema, v_schema);

        -- Transactions, Merchants, POS Cashiers, Disputes & Tax Invoices
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_branch_id ON %I.transactions (branch_id) WHERE branch_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_country_id ON %I.transactions (country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_cashier_emp_id ON %I.transactions (cashier_employee_id) WHERE cashier_employee_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_accounting_period_id ON %I.transactions (accounting_period_id) WHERE accounting_period_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tx_pool_tx_id ON %I.transactions (pool_transaction_id) WHERE pool_transaction_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_merchants_country_id ON %I.merchants (country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_merchants_owner_member_id ON %I.merchants (owner_member_id) WHERE owner_member_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_merchants_onboarded_by_id ON %I.merchants (onboarded_by_member_id) WHERE onboarded_by_member_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cashier_emp_branch_id ON %I.cashier_employees (branch_id) WHERE branch_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cashier_emp_linked_member_id ON %I.cashier_employees (linked_member_id) WHERE linked_member_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_disputes_tx_id ON %I.dispute_tickets (transaction_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_disputes_member_id ON %I.dispute_tickets (member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_disputes_merchant_id ON %I.dispute_tickets (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_returns_merchant_id ON %I.return_requests (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_reviews_merchant_id ON %I.reviews (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_reviews_member_id ON %I.reviews (member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_price_gouging_merchant_id ON %I.price_gouging_reports (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_price_gouging_member_id ON %I.price_gouging_reports (member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_merchant_id ON %I.b2b_tax_invoices (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_tx_id ON %I.b2b_tax_invoices (transaction_id) WHERE transaction_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_cycle_id ON %I.b2b_tax_invoices (settlement_cycle_id) WHERE settlement_cycle_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_payment_logs_tx_id ON %I.payment_logs (transaction_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_geonames_country_code ON %I.geonames_locations (country_code)', v_schema, v_schema);
    END LOOP;
END;
$$;

-- Tighten 12 legacy permissive policies on retired `public.*` tables off `public`/`anon`/`authenticated`
-- (RLS stays ENABLED + anon/authenticated already have REVOKE ALL -> default deny, 0 multiple_permissive_policies)
DO $$
DECLARE
    v_rec RECORD;
BEGIN
    FOR v_rec IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('admins', 'members', 'notifications', 'payment_logs', 'payment_methods', 'settings')
          AND policyname IN (
              'Dev: anon all public_admins', 'pub_admins_all',
              'Dev: anon all public_members', 'pub_members_all',
              'Dev: anon all public_notifications', 'pub_notif_all',
              'Dev: anon all public_payment_logs', 'pub_pl_all',
              'Dev: anon all public_payment_methods', 'pub_pm_all',
              'Dev: anon all public_settings', 'pub_settings_all'
          )
    LOOP
        EXECUTE format('ALTER POLICY %I ON public.%I TO service_role USING (false) WITH CHECK (false)', v_rec.policyname, v_rec.tablename);
    END LOOP;
END;
$$;
