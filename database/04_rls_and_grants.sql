-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STRICT ROW LEVEL SECURITY (RLS) & API GRANTS
-- Replaces all insecure legacy `USING (true)` dev policies (D10 + Section 8.4)
-- ============================================================================

-- 1. منح صلاحيات المخطط والوصول عبر Data API للأدوار المعتمدة فقط
GRANT USAGE ON SCHEMA sawyan TO anon, authenticated, service_role;

-- القراءة العامة المصرح بها فقط (دليل الدول، تصنيفات المتاجر، مدن GeoNames، والأكاديمية المنشورة — يُمنع SELECT المباشر لـ anon على merchants لحماية F01 وأرصدة التجار)
GRANT SELECT ON sawyan.countries, sawyan.categories, sawyan.geonames_locations, sawyan.academy_courses TO anon, authenticated;
GRANT SELECT ON sawyan.merchant_branches TO anon, authenticated;
GRANT SELECT ON sawyan.merchants, sawyan.settings, sawyan.payment_methods TO authenticated;

-- صلاحيات الجلسات المصادق عليها (محكومة بسياسات RLS الصارمة أدناه)
GRANT SELECT, INSERT, UPDATE ON sawyan.members, sawyan.member_contacts, sawyan.reviews,
      sawyan.complaints, sawyan.support_tickets, sawyan.dispute_tickets, sawyan.price_gouging_reports TO authenticated;
GRANT SELECT ON sawyan.monthly_target_boxes, sawyan.transactions, sawyan.wallets,
      sawyan.wallet_transactions, sawyan.pool_transactions, sawyan.commission_distributions,
      sawyan.surplus_distributions, sawyan.compensatory_settlements, sawyan.b2b_tax_invoices,
      sawyan.notifications, sawyan.tree_closure, sawyan.academy_courses, sawyan.orders TO authenticated;

-- سحب كافة صلاحيات التعديل المباشر من العميل على الدفاتر وسجلات التدقيق وجداول التسوية (D21)
REVOKE ALL ON sawyan.audit_logs, sawyan.journal_entries, sawyan.journal_lines,
       sawyan.chart_of_accounts, sawyan.settlement_cycles, sawyan.psp_settlement_batches,
       sawyan.idempotency_keys FROM anon, authenticated;
REVOKE SELECT ON sawyan.merchants FROM anon;
GRANT SELECT ON sawyan.chart_of_accounts TO authenticated;

-- 2. تفعيل Row Level Security على كافة الجداول الـ 43 بلا استثناء (100% RLS Coverage)
ALTER TABLE sawyan.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.geonames_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.tree_closure ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.merchant_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.cashier_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.monthly_target_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.settlement_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.pool_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.commission_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.surplus_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.compensatory_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.b2b_tax_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.psp_settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.shipping ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.maker_checker_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.dispute_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.price_gouging_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.fraud_graph_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.member_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. سياسات القراءة العامة المنضبطة (بدون كشف أسرار أو هواتف أو عمولات F01 أو أرصدة تجار)
CREATE POLICY "public_read_countries" ON sawyan.countries
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_categories" ON sawyan.categories
    FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "public_read_geonames" ON sawyan.geonames_locations
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "public_read_published_academy" ON sawyan.academy_courses
    FOR SELECT TO anon, authenticated USING (is_published = true);

CREATE POLICY "authenticated_read_coa" ON sawyan.chart_of_accounts
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "merchant_owner_read_own_merchant" ON sawyan.merchants
    FOR SELECT TO authenticated
    USING (owner_member_id IS NOT NULL AND owner_member_id = (SELECT id FROM sawyan.members WHERE auth_user_id = (SELECT auth.uid()) LIMIT 1));

CREATE POLICY "public_read_active_branches" ON sawyan.merchant_branches
    FOR SELECT TO anon, authenticated
    USING (is_branch_active = true);

-- دالة مساعدة آمنة لمنع التكرار اللانهائي في سياسات RLS على جدول members
CREATE OR REPLACE FUNCTION sawyan.current_member_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT id FROM sawyan.members WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- 4. سياسات العزل الصارمة للمستخدمين المصادق عليهم (IDOR / BOLA Protection)
CREATE POLICY "member_read_own_and_subtree" ON sawyan.members
    FOR SELECT TO authenticated
    USING (
        auth_user_id = (SELECT auth.uid())
        OR id IN (
            SELECT tc.descendant_id FROM sawyan.tree_closure tc
            WHERE tc.ancestor_id = sawyan.current_member_id()
        )
    );

CREATE POLICY "member_update_own_profile_only" ON sawyan.members
    FOR UPDATE TO authenticated
    USING (auth_user_id = (SELECT auth.uid()))
    WITH CHECK (auth_user_id = (SELECT auth.uid()));

CREATE POLICY "member_read_own_wallet" ON sawyan.wallets
    FOR SELECT TO authenticated
    USING (member_id = sawyan.current_member_id());

CREATE POLICY "member_read_own_wallet_txs" ON sawyan.wallet_transactions
    FOR SELECT TO authenticated
    USING (wallet_id IN (
        SELECT w.id FROM sawyan.wallets w
        WHERE w.member_id = sawyan.current_member_id()
    ));

CREATE POLICY "member_read_own_target_boxes" ON sawyan.monthly_target_boxes
    FOR SELECT TO authenticated
    USING (member_id = sawyan.current_member_id());

CREATE POLICY "member_or_merchant_read_own_tx" ON sawyan.transactions
    FOR SELECT TO authenticated
    USING (
        member_id = sawyan.current_member_id()
        OR merchant_id IN (
            SELECT id FROM sawyan.merchants WHERE owner_member_id = sawyan.current_member_id()
        )
    );

CREATE POLICY "member_manage_own_contacts" ON sawyan.member_contacts
    FOR ALL TO authenticated
    USING (owner_member_id = sawyan.current_member_id())
    WITH CHECK (owner_member_id = sawyan.current_member_id());

CREATE POLICY "actor_read_own_notifications" ON sawyan.notifications
    FOR SELECT TO authenticated
    USING (recipient_id = sawyan.current_member_id());

CREATE POLICY "member_read_own_tree_closure" ON sawyan.tree_closure
    FOR SELECT TO authenticated
    USING (ancestor_id = sawyan.current_member_id() OR descendant_id = sawyan.current_member_id());

CREATE POLICY "partner_read_own_contract" ON sawyan.partners
    FOR SELECT TO authenticated
    USING (auth_user_id = (SELECT auth.uid()));

CREATE POLICY "member_manage_own_reviews" ON sawyan.reviews
    FOR ALL TO authenticated
    USING (member_id = sawyan.current_member_id())
    WITH CHECK (member_id = sawyan.current_member_id());

CREATE POLICY "member_manage_own_complaints" ON sawyan.complaints
    FOR ALL TO authenticated
    USING (complainant_id = sawyan.current_member_id())
    WITH CHECK (complainant_id = sawyan.current_member_id());

CREATE POLICY "member_manage_own_support_tickets" ON sawyan.support_tickets
    FOR ALL TO authenticated
    USING (requester_id = sawyan.current_member_id())
    WITH CHECK (requester_id = sawyan.current_member_id());

CREATE POLICY "member_read_own_orders" ON sawyan.orders
    FOR SELECT TO authenticated
    USING (member_id = sawyan.current_member_id());

CREATE POLICY "authenticated_read_settings" ON sawyan.settings
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "member_read_own_payment_methods" ON sawyan.payment_methods
    FOR SELECT TO authenticated
    USING (member_id = sawyan.current_member_id());

CREATE POLICY "member_manage_own_disputes" ON sawyan.dispute_tickets
    FOR ALL TO authenticated
    USING (member_id = sawyan.current_member_id())
    WITH CHECK (member_id = sawyan.current_member_id());

CREATE POLICY "member_manage_own_gouging_reports" ON sawyan.price_gouging_reports
    FOR ALL TO authenticated
    USING (member_id = sawyan.current_member_id())
    WITH CHECK (member_id = sawyan.current_member_id());

-- 5. سياسات الإداريين والوصول الكامل عبر service_role في الخادم الخلفي
CREATE POLICY "admin_read_self" ON sawyan.admins
    FOR SELECT TO authenticated
    USING (auth_user_id = (SELECT auth.uid()));

CREATE POLICY "admin_read_audit_and_ledger" ON sawyan.audit_logs
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM sawyan.admins a WHERE a.auth_user_id = (SELECT auth.uid()) AND a.is_active = true
    ));
