-- ============================================
-- SAWYAN BANK - Complete Database Schema
-- ============================================
-- يُشغّل هذا الملف في Supabase SQL Editor مرة واحدة لإنشاء قاعدة البيانات الكاملة
-- Run this file ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--
-- الاستخدام:
--   1. افتح Supabase Dashboard للمشروع dssspiossqgroefmvnql
--   2. SQL Editor → New Query
--   3. الصق محتوى هذا الملف بالكامل
--   4. اضغط Run
--
-- بعد التشغيل ستتمكن من تسجيل الدخول بـ:
--   Email:    admin@sawyan.com
--   Password: 123456
-- ============================================

-- إنشاء schema منفصل إن لم يكن موجوداً
CREATE SCHEMA IF NOT EXISTS sawyan AUTHORIZATION postgres;

-- تفعيل extension لـ gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. جدول الأدمن (admins)
-- ============================================
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

COMMENT ON TABLE sawyan.admins IS 'مديرو النظام - يمكنهم الدخول للوحة admin-dashboard';

-- ============================================
-- 2. جدول الأعضاء (members)
-- ============================================
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
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sawyan.members IS 'الأعضاء المسجلون في النظام الشركي';

CREATE INDEX IF NOT EXISTS idx_members_sponsor ON sawyan.members(sponsor_id);
CREATE INDEX IF NOT EXISTS idx_members_code ON sawyan.members(member_code);
CREATE INDEX IF NOT EXISTS idx_members_email ON sawyan.members(email);

-- ============================================
-- 3. جدول التجار (merchants)
-- ============================================
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
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sawyan.merchants IS 'التجار المسجلون في المنصة';

CREATE INDEX IF NOT EXISTS idx_merchants_code ON sawyan.merchants(merchant_code);

-- ============================================
-- 4. جدول المعاملات (transactions)
-- ============================================
CREATE TABLE IF NOT EXISTS sawyan.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    merchant_id UUID REFERENCES sawyan.merchants(id) ON DELETE SET NULL,
    amount DECIMAL(12, 2) NOT NULL,
    commission_amount DECIMAL(12, 2) DEFAULT 0,
    payment_type VARCHAR(20) DEFAULT 'external',
    initiator VARCHAR(20) DEFAULT 'customer',
    payment_provider VARCHAR(50),
    payment_reference VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE sawyan.transactions IS 'سجل جميع المعاملات المالية';

CREATE INDEX IF NOT EXISTS idx_transactions_member ON sawyan.transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant ON sawyan.transactions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON sawyan.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON sawyan.transactions(created_at DESC);

-- ============================================
-- 5. جدول طرق الدفع المحفوظة (payment_methods)
-- ============================================
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

-- ============================================
-- 6. جدول سجل المدفوعات (payment_logs)
-- ============================================
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

-- ============================================
-- 7. Row Level Security (RLS)
-- ============================================
ALTER TABLE sawyan.admins          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.merchants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.payment_logs    ENABLE ROW LEVEL SECURITY;

-- سياسات admins: فقط service_role يمكنه الإدارة، الأدمن نفسه يمكنه القراءة
DROP POLICY IF EXISTS "Admins can read own row" ON sawyan.admins;
CREATE POLICY "Admins can read own row" ON sawyan.admins
    FOR SELECT USING (auth.role() = 'service_role' OR true);  -- anon يسمح بالقراءة للتسجيل (سيتم التحقق من الباسوورد في الـ JS)

-- للتبسيط في وضع التطوير: نسمح بـ anon SELECT على admins/members/merchants
-- في الإنتاج: غيّر هذه السياسات لتتطلب auth.uid()
DROP POLICY IF EXISTS "Dev: anon read members" ON sawyan.members;
CREATE POLICY "Dev: anon read members" ON sawyan.members
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Dev: anon read merchants" ON sawyan.merchants;
CREATE POLICY "Dev: anon read merchants" ON sawyan.merchants
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Dev: anon read transactions" ON sawyan.transactions;
CREATE POLICY "Dev: anon read transactions" ON sawyan.transactions
    FOR SELECT USING (true);

-- ============================================
-- 8. دالة تحديث updated_at تلقائياً
-- ============================================
CREATE OR REPLACE FUNCTION sawyan.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_admins_updated_at          ON sawyan.admins;
DROP TRIGGER IF EXISTS update_members_updated_at         ON sawyan.members;
DROP TRIGGER IF EXISTS update_merchants_updated_at       ON sawyan.merchants;
DROP TRIGGER IF EXISTS update_transactions_updated_at    ON sawyan.transactions;
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON sawyan.payment_methods;

CREATE TRIGGER update_admins_updated_at          BEFORE UPDATE ON sawyan.admins          FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();
CREATE TRIGGER update_members_updated_at         BEFORE UPDATE ON sawyan.members         FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();
CREATE TRIGGER update_merchants_updated_at       BEFORE UPDATE ON sawyan.merchants       FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at    BEFORE UPDATE ON sawyan.transactions    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON sawyan.payment_methods FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

-- ============================================
-- 9. بيانات أولية - المدير الافتراضي
-- ============================================
-- Email:    admin@sawyan.com
-- Password: 123456
-- (كلمة المرور مخزنة كـ plaintext مؤقتاً لأن login.html يقارنها مباشرة - يُنصح بترحيلها لـ bcrypt في الإنتاج)
INSERT INTO sawyan.admins (full_name, email, password_hash, role, is_active)
VALUES ('مدير النظام', 'admin@sawyan.com', '123456', 'super_admin', true)
ON CONFLICT (email) DO UPDATE
SET full_name = EXCLUDED.full_name,
    password_hash = EXCLUDED.password_hash,
    role = EXCLUDED.role,
    is_active = true;

-- ============================================
-- 10. بيانات تجريبية اختيارية (للتجربة فقط)
-- ============================================
INSERT INTO sawyan.merchants (business_name, owner_name, email, merchant_code, category, is_active)
SELECT 'مطعم الديوان', 'أحمد الديوان', 'restaurant@aldiwan.com', 'M-001', 'restaurant', true
WHERE NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = 'M-001');

INSERT INTO sawyan.merchants (business_name, owner_name, email, merchant_code, category, is_active)
SELECT 'بوتيك الأناقة', 'سارة الأناقة', 'boutique@alanaga.com', 'M-002', 'fashion', true
WHERE NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = 'M-002');

INSERT INTO sawyan.merchants (business_name, owner_name, email, merchant_code, category, is_active)
SELECT 'كافيه البيدر', 'خالد البيدر', 'cafe@albayader.com', 'M-003', 'cafe', true
WHERE NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = 'M-003');

INSERT INTO sawyan.members (full_name, email, phone, member_code, status, is_active)
SELECT 'عضو تجريبي 1', 'member1@example.com', '01000000001', 'SAW-0001', 'active', true
WHERE NOT EXISTS (SELECT 1 FROM sawyan.members WHERE member_code = 'SAW-0001');

-- ============================================
-- ✅ تم! تحقق من النتيجة:
-- ============================================
SELECT '✅ Schema created successfully!' as status;

SELECT 'Admin users:' as info;
SELECT id, full_name, email, role, is_active FROM sawyan.admins;

SELECT 'Merchants count:' as info;
SELECT COUNT(*) as total FROM sawyan.merchants;

SELECT 'Members count:' as info;
SELECT COUNT(*) as total FROM sawyan.members;
