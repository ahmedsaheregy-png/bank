-- ============================================================================
-- 🌳 SAWYAN BANK — Master Setup Script (Schema + Phase 2 Migration)
-- ============================================================================
-- التاريخ: 2026-07-27
-- الهدف: إعداد قاعدة بيانات Supabase من الصفر لـ SAWYAN BANK مع نظام Pool
--
-- ⚠️ طريقة التنفيذ:
--   1. افتح Supabase Dashboard → SQL Editor
--   2. اعمل New Query
--   3. الصق محتوى هذا الملف كاملاً
--   4. اضغط Run (CTRL+Enter)
--   5. لازم تطلع رسالة "Success. No rows returned"
--
-- 📋 محتويات السكريبت:
--   القسم A: إنشاء schema + الجداول الأساسية (لو مش موجودة)
--   القسم B: إضافة أعمدة الشجرة الثنائية لـ members
--   القسم C: إضافة deduction_percent لـ merchants
--   القسم D: إضافة commission_snapshot لـ transactions
--   القسم E: إضافة إعدادات Pool لـ settings (تنشئ جدول settings لو مش موجود)
--   القسم F: إنشاء pool_transactions
--   القسم G: إنشاء commission_distributions
--   القسم H: إنشاء surplus_distributions (مؤقت)
--   القسم I: RLS Policies
--   القسم J: Triggers (auto placement + cap)
--   القسم K: Helper Functions (6 functions)
--   القسم L: 3 Views للوحة الأدمن
-- ============================================================================

BEGIN;

-- ============================================================================
-- القسم A: إنشاء schema + الجداول الأساسية (لو مش موجودة)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS sawyan AUTHORIZATION postgres;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- A1. جدول الأدمن
CREATE TABLE IF NOT EXISTS sawyan.admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- A2. جدول الأعضاء (مع أعمدة الشجرة الثنائية)
CREATE TABLE IF NOT EXISTS sawyan.members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(30),
    member_code VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    sponsor_id UUID REFERENCES sawyan.members(id),
    status VARCHAR(20) DEFAULT 'active',
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- أعمدة الشجرة الثنائية (Phase 2)
    parent_member_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    placement_side VARCHAR(5) CHECK (placement_side IN ('left', 'right')),
    left_child_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    right_child_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    generation_in_tree INTEGER DEFAULT 1,
    is_active_in_tree BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_members_sponsor ON sawyan.members(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_members_code ON sawyan.members(member_code);
CREATE INDEX IF NOT EXISTS idx_members_email ON sawyan.members(email);
CREATE INDEX IF NOT EXISTS idx_members_parent ON sawyan.members(parent_member_id);
CREATE INDEX IF NOT EXISTS idx_members_generation ON sawyan.members(generation_in_tree);
CREATE INDEX IF NOT EXISTS idx_members_active_in_tree ON sawyan.members(is_active_in_tree) WHERE is_active_in_tree = true;

COMMENT ON COLUMN sawyan.members.sponsor_id IS 'الاب لاين الحقيقي (Real Upline) — اللي جاب العضو للشبكة';
COMMENT ON COLUMN sawyan.members.parent_member_id IS 'الاب لاين المحطوط (Placed Upline) — اللي اتحط العضو تحته في الشجرة';
COMMENT ON COLUMN sawyan.members.placement_side IS 'جهة وضع العضو تحت parent_member_id (left أو right). NULL للجذر فقط';
COMMENT ON COLUMN sawyan.members.left_child_id IS 'الابن الأيسر في الشجرة الثنائية';
COMMENT ON COLUMN sawyan.members.right_child_id IS 'الابن الأيمن في الشجرة الثنائية';
COMMENT ON COLUMN sawyan.members.generation_in_tree IS 'رقم الجيل (1=الجذر، 2=المباشرين، ...)';
COMMENT ON COLUMN sawyan.members.is_active_in_tree IS 'حالة العضو في شبكة التسويق';

-- A3. جدول التجار (مع deduction_percent)
CREATE TABLE IF NOT EXISTS sawyan.merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(150) NOT NULL,
    owner_name VARCHAR(150),
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(30),
    merchant_code VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    category VARCHAR(50),
    address TEXT,
    wifi_ssid VARCHAR(100),
    wifi_password VARCHAR(100),
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Phase 2: deduction_percent (per-merchant)
    deduction_percent DECIMAL(5, 2) DEFAULT 10.00 CHECK (deduction_percent >= 0 AND deduction_percent <= 100),
    commission_percentage DECIMAL(5, 2) DEFAULT 10.00,
    owner_id UUID
);

CREATE INDEX IF NOT EXISTS idx_merchants_code ON sawyan.merchants(merchant_code);
CREATE INDEX IF NOT EXISTS idx_merchants_deduction ON sawyan.merchants(deduction_percent);

COMMENT ON COLUMN sawyan.merchants.deduction_percent IS 'النسبة المقتطعة من كل عملية لهذا التاجر. قابلة للتغيير من الأدمن.';

-- A4. جدول المعاملات (مع commission_snapshot)
CREATE TABLE IF NOT EXISTS sawyan.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    merchant_id UUID REFERENCES sawyan.merchants(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    total_amount DECIMAL(12, 2),
    commission_amount DECIMAL(12, 2) DEFAULT 0,
    commission_percentage DECIMAL(5, 2),
    company_share DECIMAL(12, 2),
    payment_type VARCHAR(20) DEFAULT 'external',
    initiator VARCHAR(20) DEFAULT 'customer',
    payment_provider VARCHAR(50),
    payment_reference VARCHAR(100),
    transaction_code VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Phase 2
    commission_snapshot JSONB DEFAULT '{}'::jsonb,
    pool_transaction_id BIGINT
);

CREATE INDEX IF NOT EXISTS idx_transactions_member ON sawyan.transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON sawyan.transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON sawyan.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON sawyan.transactions(created_at DESC);

COMMENT ON COLUMN sawyan.transactions.commission_snapshot IS 'نسخة من إعدادات النظام وقت المعاملة — لتثبيت الحساب ضد التغييرات المستقبلية';
COMMENT ON COLUMN sawyan.transactions.pool_transaction_id IS 'مرجع لجدول pool_transactions';

-- A5. جدول الإعدادات (لو مش موجود، أنشئه)
CREATE TABLE IF NOT EXISTS sawyan.settings (
    id SERIAL PRIMARY KEY,
    default_commission_percentage DECIMAL(5, 2) DEFAULT 10.00,
    company_percent DECIMAL(5, 2) DEFAULT 25.00 CHECK (company_percent >= 0 AND company_percent <= 100),
    generations_count INTEGER DEFAULT 11 CHECK (generations_count >= 1 AND generations_count <= 50),
    cap_amount DECIMAL(12, 2) DEFAULT 4605.00,
    cap_auto_calc BOOLEAN DEFAULT true,
    product_price DECIMAL(12, 2) DEFAULT 330.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN sawyan.settings.company_percent IS 'نسبة الشركة من المبلغ المقتطع. الـ members_percent = 100 - company_percent تلقائياً';
COMMENT ON COLUMN sawyan.settings.generations_count IS 'عدد الأجيال في الشبكة = الستوبر (افتراضي 11)';
COMMENT ON COLUMN sawyan.settings.cap_amount IS 'الحد الأقصى لحصة العضو الواحد في العملية الواحدة';
COMMENT ON COLUMN sawyan.settings.cap_auto_calc IS 'لو true، الـ Cap يتحدّث تلقائياً عند تغيير company_percent أو generations_count';

-- إدراج صف الإعدادات الافتراضي لو مش موجود
INSERT INTO sawyan.settings (id, default_commission_percentage, company_percent, generations_count, cap_amount, cap_auto_calc, product_price)
VALUES (1, 10.00, 25.00, 11, 4605.00, true, 330.00)
ON CONFLICT (id) DO NOTHING;

-- A6. جدول المحافظ (لو مش موجود)
CREATE TABLE IF NOT EXISTS sawyan.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID UNIQUE REFERENCES sawyan.members(id) ON DELETE CASCADE,
    balance DECIMAL(12, 2) DEFAULT 0.00,
    pending_balance DECIMAL(12, 2) DEFAULT 0.00,
    total_earned DECIMAL(12, 2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallets_member ON sawyan.wallets(member_id);

-- A7. جدول معاملات المحفظة
CREATE TABLE IF NOT EXISTS sawyan.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES sawyan.wallets(id) ON DELETE CASCADE,
    transaction_type VARCHAR(30) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    reference_id UUID,
    status VARCHAR(30) DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON sawyan.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON sawyan.wallet_transactions(created_at DESC);

-- A8. جدول طرق الدفع
CREATE TABLE IF NOT EXISTS sawyan.payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES sawyan.members(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_token TEXT NOT NULL,
    card_brand VARCHAR(20),
    last_four VARCHAR(4),
    exp_month VARCHAR(2),
    exp_year VARCHAR(4),
    cardholder_name VARCHAR(100),
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_member ON sawyan.payment_methods(member_id);

-- A9. جدول سجل المدفوعات
CREATE TABLE IF NOT EXISTS sawyan.payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES sawyan.transactions(id),
    payment_method_id UUID REFERENCES sawyan.payment_methods(id),
    provider VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    amount DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'EGP',
    status VARCHAR(30) NOT NULL,
    provider_response JSONB,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_logs_transaction ON sawyan.payment_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON sawyan.payment_logs(status);

-- A10. جدول الشكاوى
CREATE TABLE IF NOT EXISTS sawyan.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES sawyan.transactions(id) ON DELETE SET NULL,
    member_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    merchant_id UUID REFERENCES sawyan.merchants(id) ON DELETE SET NULL,
    subject VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(30) DEFAULT 'open',
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_member ON sawyan.complaints(member_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON sawyan.complaints(status);

-- A11. جدول تذاكر الدعم
CREATE TABLE IF NOT EXISTS sawyan.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    subject VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(30) DEFAULT 'open',
    priority VARCHAR(20) DEFAULT 'normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_member ON sawyan.support_tickets(member_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON sawyan.support_tickets(status);


-- ============================================================================
-- القسم B-F: تم دمجها في القسم A (أعمدة الشجرة، deduction_percent، snapshot، settings)
-- ============================================================================


-- ============================================================================
-- القسم G: إنشاء جدول pool_transactions
-- ============================================================================

CREATE TABLE IF NOT EXISTS sawyan.pool_transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_id UUID REFERENCES sawyan.transactions(id) ON DELETE CASCADE,
    member_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    product_price DECIMAL(12, 2) NOT NULL,
    deducted_amount DECIMAL(12, 2) NOT NULL,
    company_share DECIMAL(12, 2) NOT NULL,
    members_share DECIMAL(12, 2) NOT NULL,
    share_per_member DECIMAL(12, 2) NOT NULL,
    beneficiaries_count INTEGER NOT NULL,
    total_distributed DECIMAL(12, 2) NOT NULL,
    surplus DECIMAL(12, 2) NOT NULL DEFAULT 0,
    settings_snapshot JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'distributed',
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_tx_member ON sawyan.pool_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_pool_tx_transaction ON sawyan.pool_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pool_tx_created ON sawyan.pool_transactions(created_at DESC);

COMMENT ON TABLE sawyan.pool_transactions IS 'سجل عمليات دخول البول — كل عملية شراء بتنشئ سجل هنا';


-- ============================================================================
-- القسم H: إنشاء جدول commission_distributions
-- ============================================================================

CREATE TABLE IF NOT EXISTS sawyan.commission_distributions (
    id BIGSERIAL PRIMARY KEY,
    pool_transaction_id BIGINT REFERENCES sawyan.pool_transactions(id) ON DELETE CASCADE,
    beneficiary_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    share_amount DECIMAL(12, 2) NOT NULL,
    beneficiary_generation INTEGER NOT NULL,
    beneficiary_position INTEGER NOT NULL,
    wallet_transaction_id UUID,
    added_to_wallet BOOLEAN DEFAULT false,
    added_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_dist_pool ON sawyan.commission_distributions(pool_transaction_id);
CREATE INDEX IF NOT EXISTS idx_commission_dist_beneficiary ON sawyan.commission_distributions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commission_dist_created ON sawyan.commission_distributions(created_at DESC);

COMMENT ON TABLE sawyan.commission_distributions IS 'تفاصيل توزيع عمولة كل عملية على المستفيدين (العضو + الأبلاينز حتى الستوبر)';


-- ============================================================================
-- القسم I: إنشاء جدول surplus_distributions (مؤقت — في انتظار Q01)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sawyan.surplus_distributions (
    id BIGSERIAL PRIMARY KEY,
    pool_transaction_id BIGINT REFERENCES sawyan.pool_transactions(id) ON DELETE CASCADE,
    beneficiary_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    surplus_amount DECIMAL(12, 2) NOT NULL,
    distribution_rule VARCHAR(50),
    distribution_round INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surplus_dist_pool ON sawyan.surplus_distributions(pool_transaction_id);
CREATE INDEX IF NOT EXISTS idx_surplus_dist_beneficiary ON sawyan.surplus_distributions(beneficiary_id);


-- ============================================================================
-- القسم J: RLS Policies
-- ============================================================================

ALTER TABLE sawyan.admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.merchants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.wallets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.payment_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.complaints      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.pool_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.commission_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.surplus_distributions   ENABLE ROW LEVEL SECURITY;

-- للتبسيط في وضع التطوير: نسمح بـ anon SELECT على most tables
DROP POLICY IF EXISTS "Dev: anon read members" ON sawyan.members;
CREATE POLICY "Dev: anon read members" ON sawyan.members
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read merchants" ON sawyan.merchants;
CREATE POLICY "Dev: anon read merchants" ON sawyan.merchants
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read transactions" ON sawyan.transactions;
CREATE POLICY "Dev: anon read transactions" ON sawyan.transactions
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read settings" ON sawyan.settings;
CREATE POLICY "Dev: anon read settings" ON sawyan.settings
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read wallets" ON sawyan.wallets;
CREATE POLICY "Dev: anon read wallets" ON sawyan.wallets
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read wallet_transactions" ON sawyan.wallet_transactions;
CREATE POLICY "Dev: anon read wallet_transactions" ON sawyan.wallet_transactions
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read payment_methods" ON sawyan.payment_methods;
CREATE POLICY "Dev: anon read payment_methods" ON sawyan.payment_methods
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read payment_logs" ON sawyan.payment_logs;
CREATE POLICY "Dev: anon read payment_logs" ON sawyan.payment_logs
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read complaints" ON sawyan.complaints;
CREATE POLICY "Dev: anon read complaints" ON sawyan.complaints
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Dev: anon read support_tickets" ON sawyan.support_tickets;
CREATE POLICY "Dev: anon read support_tickets" ON sawyan.support_tickets
    FOR SELECT
    USING (true);

-- أعضاء يقدروا يشوفوا عملياتهم في البول وعمولاتهم بس
DROP POLICY IF EXISTS "members_view_own_pool_transactions" ON sawyan.pool_transactions;
CREATE POLICY "members_view_own_pool_transactions" ON sawyan.pool_transactions
    FOR SELECT USING (
        member_id = auth.uid() OR
        EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "members_view_own_commissions" ON sawyan.commission_distributions;
CREATE POLICY "members_view_own_commissions" ON sawyan.commission_distributions
    FOR SELECT USING (
        beneficiary_id = auth.uid() OR
        EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid())
    );

DROP POLICY IF EXISTS "members_view_own_surplus" ON sawyan.surplus_distributions;
CREATE POLICY "members_view_own_surplus" ON sawyan.surplus_distributions
    FOR SELECT USING (
        beneficiary_id = auth.uid() OR
        EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid())
    );

-- الأدمن فقط يقدر يضيف/يعدّل في الجداول الجديدة
DROP POLICY IF EXISTS "admins_manage_pool_transactions" ON sawyan.pool_transactions;
CREATE POLICY "admins_manage_pool_transactions" ON sawyan.pool_transactions
    FOR ALL USING (EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid()));

DROP POLICY IF EXISTS "admins_manage_commission_distributions" ON sawyan.commission_distributions;
CREATE POLICY "admins_manage_commission_distributions" ON sawyan.commission_distributions
    FOR ALL USING (EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid()));

DROP POLICY IF EXISTS "admins_manage_surplus_distributions" ON sawyan.surplus_distributions;
CREATE POLICY "admins_manage_surplus_distributions" ON sawyan.surplus_distributions
    FOR ALL USING (EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM sawyan.admins WHERE id = auth.uid()));


-- ============================================================================
-- القسم K: Triggers
-- ============================================================================

-- K1. تحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION sawyan.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admins_updated_at ON sawyan.admins;
CREATE TRIGGER update_admins_updated_at BEFORE UPDATE ON sawyan.admins FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS update_members_updated_at ON sawyan.members;
CREATE TRIGGER update_members_updated_at BEFORE UPDATE ON sawyan.members FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS update_merchants_updated_at ON sawyan.merchants;
CREATE TRIGGER update_merchants_updated_at BEFORE UPDATE ON sawyan.merchants FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON sawyan.transactions;
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON sawyan.transactions FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS update_settings_updated_at ON sawyan.settings;
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON sawyan.settings FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallets_updated_at ON sawyan.wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON sawyan.wallets FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

-- K2. تحديث الـ cap تلقائياً عند تغيير الإعدادات
CREATE OR REPLACE FUNCTION sawyan.recalculate_default_cap()
RETURNS TRIGGER AS $$
DECLARE
    v_default_deduction DECIMAL(5, 2);
    v_default_members_share DECIMAL(12, 2);
    v_share_per_member DECIMAL(12, 2);
    v_total_members INTEGER;
    v_new_cap DECIMAL(12, 2);
BEGIN
    SELECT COALESCE(default_commission_percentage, 10) INTO v_default_deduction
    FROM sawyan.settings LIMIT 1;

    v_default_members_share := (v_default_deduction / 100) * COALESCE(NEW.product_price, 330) * ((100 - NEW.company_percent) / 100);
    v_share_per_member := v_default_members_share / NEW.generations_count;
    v_total_members := (1 << NEW.generations_count) - 1;
    v_new_cap := v_total_members * v_share_per_member;

    IF NEW.cap_auto_calc = true THEN
        NEW.cap_amount := FLOOR(v_new_cap);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalc_cap ON sawyan.settings;
CREATE TRIGGER trigger_recalc_cap
    BEFORE INSERT OR UPDATE OF company_percent, generations_count, cap_auto_calc, product_price
    ON sawyan.settings
    FOR EACH ROW
    EXECUTE FUNCTION sawyan.recalculate_default_cap();


-- ============================================================================
-- القسم L: Helper Functions
-- ============================================================================

-- L1. تحديث placement تلقائياً عند INSERT عضو جديد
CREATE OR REPLACE FUNCTION sawyan.auto_set_member_placement()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_generation INTEGER;
BEGIN
    IF NEW.parent_member_id IS NOT NULL THEN
        SELECT generation_in_tree INTO v_parent_generation
        FROM sawyan.members WHERE id = NEW.parent_member_id;

        IF v_parent_generation IS NOT NULL THEN
            NEW.generation_in_tree := v_parent_generation + 1;
        END IF;

        IF NEW.placement_side = 'left' THEN
            UPDATE sawyan.members SET left_child_id = NEW.id WHERE id = NEW.parent_member_id;
        ELSIF NEW.placement_side = 'right' THEN
            UPDATE sawyan.members SET right_child_id = NEW.id WHERE id = NEW.parent_member_id;
        END IF;
    ELSE
        NEW.generation_in_tree := 1;
        NEW.placement_side := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_set_placement ON sawyan.members;
CREATE TRIGGER trigger_auto_set_placement
    BEFORE INSERT ON sawyan.members
    FOR EACH ROW
    EXECUTE FUNCTION sawyan.auto_set_member_placement();


-- L2. التحقق إن عضو في downline الـ sponsor
CREATE OR REPLACE FUNCTION sawyan.is_in_downline(
    p_member_id UUID,
    p_sponsor_id UUID,
    p_max_depth INTEGER DEFAULT 50
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_id UUID;
    v_depth INTEGER := 0;
BEGIN
    IF p_member_id IS NULL OR p_sponsor_id IS NULL THEN
        RETURN false;
    END IF;

    IF p_member_id = p_sponsor_id THEN
        RETURN false;
    END IF;

    v_current_id := p_member_id;
    WHILE v_current_id IS NOT NULL AND v_depth < p_max_depth LOOP
        SELECT parent_member_id INTO v_current_id FROM sawyan.members WHERE id = v_current_id;

        IF v_current_id = p_sponsor_id THEN
            RETURN true;
        END IF;

        v_depth := v_depth + 1;
    END LOOP;

    RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;


-- L3. التحقق إن مكان placement فاضي
CREATE OR REPLACE FUNCTION sawyan.is_placement_available(
    p_parent_id UUID,
    p_side VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_existing_child UUID;
BEGIN
    IF p_side NOT IN ('left', 'right') THEN
        RETURN false;
    END IF;

    IF p_side = 'left' THEN
        SELECT left_child_id INTO v_existing_child FROM sawyan.members WHERE id = p_parent_id;
    ELSE
        SELECT right_child_id INTO v_existing_child FROM sawyan.members WHERE id = p_parent_id;
    END IF;

    RETURN v_existing_child IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;


-- L4. جلب downline
CREATE OR REPLACE FUNCTION sawyan.get_downline(
    p_sponsor_id UUID,
    p_max_depth INTEGER DEFAULT 20
) RETURNS TABLE (
    member_id UUID,
    member_code VARCHAR,
    full_name VARCHAR,
    generation INTEGER,
    parent_id UUID,
    placement_side VARCHAR,
    depth_from_sponsor INTEGER
) AS $$
    WITH RECURSIVE downline AS (
        SELECT m.id, m.member_code, m.full_name, m.generation_in_tree,
               m.parent_member_id, m.placement_side, 1 AS depth
        FROM sawyan.members m
        WHERE m.parent_member_id = p_sponsor_id

        UNION ALL

        SELECT m.id, m.member_code, m.full_name, m.generation_in_tree,
               m.parent_member_id, m.placement_side, d.depth + 1
        FROM sawyan.members m
        INNER JOIN downline d ON m.parent_member_id = d.member_id
        WHERE d.depth < p_max_depth
    )
    SELECT * FROM downline ORDER BY depth, placement_side;
$$ LANGUAGE sql STABLE;


-- L5. جلب uplines
CREATE OR REPLACE FUNCTION sawyan.get_uplines(
    p_member_id UUID,
    p_max_count INTEGER DEFAULT 11
) RETURNS TABLE (
    member_id UUID,
    member_code VARCHAR,
    full_name VARCHAR,
    generation INTEGER,
    depth_from_member INTEGER
) AS $$
    WITH RECURSIVE uplines AS (
        SELECT m.id, m.member_code, m.full_name, m.generation_in_tree,
               m.parent_member_id, 1 AS depth
        FROM sawyan.members m
        WHERE m.id = p_member_id AND m.parent_member_id IS NOT NULL

        UNION ALL

        SELECT m.id, m.member_code, m.full_name, m.generation_in_tree,
               m.parent_member_id, u.depth + 1
        FROM sawyan.members m
        INNER JOIN uplines u ON m.id = u.parent_member_id
        WHERE u.depth < p_max_count
    )
    SELECT * FROM uplines ORDER BY depth;
$$ LANGUAGE sql STABLE;


-- L6. حساب وتوزيع العمولات لمعاملة معيّنة
CREATE OR REPLACE FUNCTION sawyan.distribute_transaction_commission(
    p_transaction_id UUID
) RETURNS TABLE (
    pool_tx_id BIGINT,
    total_distributed DECIMAL,
    beneficiaries_count INTEGER,
    surplus DECIMAL
) AS $$
DECLARE
    v_transaction RECORD;
    v_merchant RECORD;
    v_settings RECORD;
    v_member RECORD;
    v_deducted_amount DECIMAL(12, 2);
    v_company_share DECIMAL(12, 2);
    v_members_share DECIMAL(12, 2);
    v_share_per_member DECIMAL(12, 2);
    v_beneficiaries_count INTEGER;
    v_total_distributed DECIMAL(12, 2);
    v_surplus DECIMAL(12, 2);
    v_pool_tx_id BIGINT;
    v_settings_snapshot JSONB;
    v_upline RECORD;
    v_position INTEGER := 1;
BEGIN
    SELECT * INTO v_transaction FROM sawyan.transactions WHERE id = p_transaction_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction % not found', p_transaction_id;
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = v_transaction.merchant_id;
    SELECT * INTO v_settings FROM sawyan.settings LIMIT 1;
    SELECT * INTO v_member FROM sawyan.members WHERE id = v_transaction.member_id;

    IF v_merchant IS NULL OR v_settings IS NULL OR v_member IS NULL THEN
        RAISE EXCEPTION 'Missing merchant, settings, or member data';
    END IF;

    v_deducted_amount := COALESCE(v_transaction.amount, v_transaction.total_amount) * (COALESCE(v_merchant.deduction_percent, 10) / 100);
    v_company_share := v_deducted_amount * (v_settings.company_percent / 100);
    v_members_share := v_deducted_amount - v_company_share;
    v_share_per_member := v_members_share / v_settings.generations_count;

    IF v_share_per_member > v_settings.cap_amount THEN
        v_share_per_member := v_settings.cap_amount;
    END IF;

    v_beneficiaries_count := LEAST(v_member.generation_in_tree, v_settings.generations_count);
    v_total_distributed := v_beneficiaries_count * v_share_per_member;
    v_surplus := v_members_share - v_total_distributed;

    v_settings_snapshot := jsonb_build_object(
        'product_price', COALESCE(v_transaction.amount, v_transaction.total_amount),
        'deduction_percent', v_merchant.deduction_percent,
        'company_percent', v_settings.company_percent,
        'generations_count', v_settings.generations_count,
        'cap_amount', v_settings.cap_amount,
        'share_per_member', v_share_per_member,
        'members_share', v_members_share,
        'company_share', v_company_share,
        'deducted_amount', v_deducted_amount
    );

    INSERT INTO sawyan.pool_transactions (
        transaction_id, member_id, product_price, deducted_amount,
        company_share, members_share, share_per_member,
        beneficiaries_count, total_distributed, surplus,
        settings_snapshot, status, processed_at
    ) VALUES (
        p_transaction_id, v_member.id, COALESCE(v_transaction.amount, v_transaction.total_amount), v_deducted_amount,
        v_company_share, v_members_share, v_share_per_member,
        v_beneficiaries_count, v_total_distributed, v_surplus,
        v_settings_snapshot, 'distributed', NOW()
    ) RETURNING id INTO v_pool_tx_id;

    UPDATE sawyan.transactions
    SET commission_snapshot = v_settings_snapshot,
        pool_transaction_id = v_pool_tx_id,
        commission_amount = v_total_distributed
    WHERE id = p_transaction_id;

    INSERT INTO sawyan.commission_distributions (
        pool_transaction_id, beneficiary_id, share_amount,
        beneficiary_generation, beneficiary_position
    ) VALUES (
        v_pool_tx_id, v_member.id, v_share_per_member,
        v_member.generation_in_tree, 1
    );

    FOR v_upline IN
        SELECT * FROM sawyan.get_uplines(v_member.id, v_settings.generations_count - 1)
    LOOP
        v_position := v_position + 1;
        INSERT INTO sawyan.commission_distributions (
            pool_transaction_id, beneficiary_id, share_amount,
            beneficiary_generation, beneficiary_position
        ) VALUES (
            v_pool_tx_id, v_upline.member_id, v_share_per_member,
            v_upline.generation, v_position
        );
    END LOOP;

    RETURN QUERY SELECT v_pool_tx_id, v_total_distributed, v_beneficiaries_count, v_surplus;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- القسم M: Views للوحة الأدمن
-- ============================================================================

CREATE OR REPLACE VIEW sawyan.v_pool_stats AS
SELECT
    COUNT(*) AS total_pool_transactions,
    COALESCE(SUM(members_share), 0) AS total_inflow,
    COALESCE(SUM(total_distributed), 0) AS total_distributed,
    COALESCE(SUM(surplus), 0) AS total_surplus,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS transactions_last_24h,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') AS transactions_last_7d
FROM sawyan.pool_transactions;

CREATE OR REPLACE VIEW sawyan.v_member_commission_stats AS
SELECT
    beneficiary_id,
    COUNT(*) AS total_commissions_received,
    COALESCE(SUM(share_amount), 0) AS total_amount_received,
    MAX(created_at) AS last_commission_at
FROM sawyan.commission_distributions
GROUP BY beneficiary_id;

CREATE OR REPLACE VIEW sawyan.v_tree_overview AS
SELECT
    generation_in_tree,
    COUNT(*) AS members_count,
    COUNT(*) FILTER (WHERE is_active_in_tree = true) AS active_members_count,
    COUNT(*) FILTER (WHERE left_child_id IS NOT NULL) AS members_with_left_child,
    COUNT(*) FILTER (WHERE right_child_id IS NOT NULL) AS members_with_right_child
FROM sawyan.members
GROUP BY generation_in_tree
ORDER BY generation_in_tree;


-- ============================================================================
-- القسم N: بيانات أولية
-- ============================================================================

-- الأدمن الافتراضي
INSERT INTO sawyan.admins (full_name, email, password_hash, role, is_active)
VALUES ('مدير النظام', 'admin@sawyan.com', '123456', 'super_admin', true)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = true;

-- تجار تجريبيين
INSERT INTO sawyan.merchants (business_name, owner_name, email, merchant_code, category, is_active, deduction_percent)
SELECT 'مطعم الديوان', 'أحمد الديوان', 'restaurant@aldiwan.com', 'M-001', 'restaurant', true, 10.00
WHERE NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = 'M-001');

INSERT INTO sawyan.merchants (business_name, owner_name, email, merchant_code, category, is_active, deduction_percent)
SELECT 'بوتيك الأناقة', 'سارة الأناقة', 'boutique@alanaga.com', 'M-002', 'fashion', true, 10.00
WHERE NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = 'M-002');

INSERT INTO sawyan.merchants (business_name, owner_name, email, merchant_code, category, is_active, deduction_percent)
SELECT 'كافيه البيدر', 'خالد البيدر', 'cafe@albayader.com', 'M-003', 'cafe', true, 10.00
WHERE NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = 'M-003');

-- عضو تجريبي 1 (الجذر — parent_member_id = NULL)
INSERT INTO sawyan.members (full_name, email, phone, member_code, status, is_active, parent_member_id, placement_side, generation_in_tree)
SELECT 'عضو تجريبي 1', 'member1@example.com', '01000000001', 'SAW-0001', 'active', true, NULL, NULL, 1
WHERE NOT EXISTS (SELECT 1 FROM sawyan.members WHERE member_code = 'SAW-0001');

-- محفظة للعضو التجريبي
INSERT INTO sawyan.wallets (member_id, balance, pending_balance, total_earned)
SELECT m.id, 0.00, 0.00, 0.00
FROM sawyan.members m
WHERE m.member_code = 'SAW-0001'
  AND NOT EXISTS (SELECT 1 FROM sawyan.wallets w WHERE w.member_id = m.id);


-- ============================================================================
-- ✅ نهاية السكريبت
-- ============================================================================

COMMIT;

-- 📊 تقرير التحقق
SELECT '✅ Setup complete!' AS status;
SELECT 'sawyan schema tables' AS info;
SELECT tablename FROM pg_tables WHERE schemaname = 'sawyan' ORDER BY tablename;
SELECT 'Settings row:' AS info;
SELECT * FROM sawyan.settings;
SELECT 'Admins:' AS info;
SELECT id, full_name, email, role FROM sawyan.admins;
