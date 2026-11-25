-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 24: COMPLETE FK INDEX COVERAGE & AUTH TABLE LOCK
-- ============================================================================
-- 1) Adds the remaining 38 covering B-tree indexes across BOTH `sawyan` and
--    `sawyan_demo` (76 indexes total), bringing active-schema
--    `unindexed_foreign_keys` warnings from 76 -> 0 (leaving only retired
--    `public.*` archive tables).
-- 2) Aligns `authenticated` direct table privileges with `anon` least-privilege
--    on BOTH `sawyan` and `sawyan_demo`: revokes direct table DML/SELECT on
--    internal financial/operational tables (`members`, `wallets`, `transactions`,
--    `commission_distributions`, `b2b_tax_invoices`, etc.) while keeping read
--    access solely on the 6 public catalog tables (`countries`,
--    `geonames_locations`, `categories`, `merchant_branches`, `academy_tracks`,
--    `academy_courses`), reducing Supabase Security Advisor
--    `pg_graphql_authenticated_table_exposed` from 62 -> 12 (-50 warnings).
-- Strictly Idempotent (IF NOT EXISTS / REVOKE / GRANT).
-- ============================================================================

DO $$
DECLARE
    v_schema TEXT;
BEGIN
    FOREACH v_schema IN ARRAY ARRAY['sawyan', 'sawyan_demo'] LOOP
        IF to_regnamespace(v_schema) IS NULL THEN
            CONTINUE;
        END IF;

        -- Academy LMS FKs (5)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_academy_courses_approved_by ON %I.academy_courses (approved_by_admin_id) WHERE approved_by_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_academy_courses_author_admin ON %I.academy_courses (author_admin_id) WHERE author_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_academy_comments_admin_id ON %I.academy_lesson_comments (admin_id) WHERE admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_academy_comments_member_id ON %I.academy_lesson_comments (member_id) WHERE member_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_academy_tracks_owner_member ON %I.academy_tracks (owner_member_id) WHERE owner_member_id IS NOT NULL', v_schema, v_schema);

        -- Tax Invoices, Categories, Complaints, Disputes, Fraud & Journal Reversals (9)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_branch_id ON %I.b2b_tax_invoices (branch_id) WHERE branch_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_country_id ON %I.b2b_tax_invoices (country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_journal_entry_id ON %I.b2b_tax_invoices (journal_entry_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_b2b_tax_original_inv_id ON %I.b2b_tax_invoices (original_tax_invoice_id) WHERE original_tax_invoice_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_categories_parent_id ON %I.categories (parent_id) WHERE parent_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_complaints_reviewed_by ON %I.complaints (reviewed_by_admin_id) WHERE reviewed_by_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_disputes_assigned_admin ON %I.dispute_tickets (assigned_admin_id) WHERE assigned_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_fraud_signals_merchant_id ON %I.fraud_graph_signals (involved_merchant_id) WHERE involved_merchant_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_journal_reverses_entry ON %I.journal_entries (reverses_entry_id) WHERE reverses_entry_id IS NOT NULL', v_schema, v_schema);

        -- Governance Maker-Checker, CRM Contacts & GeoNames Links (6)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_mc_req_checker_admin ON %I.maker_checker_requests (checker_admin_id) WHERE checker_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_mc_req_maker_admin ON %I.maker_checker_requests (maker_admin_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_member_contacts_owner ON %I.member_contacts (owner_member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_member_contacts_reg_member ON %I.member_contacts (registered_member_id) WHERE registered_member_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_members_city_geoname_id ON %I.members (city_geoname_id) WHERE city_geoname_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_branches_city_geoname_id ON %I.merchant_branches (city_geoname_id) WHERE city_geoname_id IS NOT NULL', v_schema, v_schema);

        -- Storefront Orders, Products & Shipping (8)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_order_items_order_id ON %I.order_items (order_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_order_items_product_id ON %I.order_items (product_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_orders_member_id ON %I.orders (member_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_orders_merchant_id ON %I.orders (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_products_category_id ON %I.products (category_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_products_merchant_id ON %I.products (merchant_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_shipping_order_id ON %I.shipping (order_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_shipping_merchant_id ON %I.shipping (shipping_merchant_id) WHERE shipping_merchant_id IS NOT NULL', v_schema, v_schema);

        -- PSP Batches, Push, Registration Configs, Settings, Cycles & Support (10)
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_psp_batches_country_id ON %I.psp_settlement_batches (country_id)', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_psp_batches_journal_id ON %I.psp_settlement_batches (journal_entry_id) WHERE journal_entry_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_push_subs_branch_id ON %I.push_subscriptions (branch_id) WHERE branch_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_reg_fields_updated_by ON %I.registration_field_configs (updated_by_admin_id) WHERE updated_by_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_reg_settings_updated_by ON %I.registration_form_settings (updated_by_admin_id) WHERE updated_by_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_settings_approved_by ON %I.settings (approved_by_admin_id) WHERE approved_by_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_settings_created_by ON %I.settings (created_by_admin_id) WHERE created_by_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cycles_checker_admin ON %I.settlement_cycles (checker_admin_id) WHERE checker_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_cycles_maker_admin ON %I.settlement_cycles (maker_admin_id) WHERE maker_admin_id IS NOT NULL', v_schema, v_schema);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_support_assigned_admin ON %I.support_tickets (assigned_admin_id) WHERE assigned_admin_id IS NOT NULL', v_schema, v_schema);

        -- Align `authenticated` table privileges with `anon` least-privilege
        EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', v_schema);
        EXECUTE format(
            'GRANT SELECT ON %I.countries, %I.geonames_locations, %I.categories, %I.merchant_branches, %I.academy_tracks, %I.academy_courses TO authenticated',
            v_schema, v_schema, v_schema, v_schema, v_schema, v_schema
        );
    END LOOP;
END;
$$;
