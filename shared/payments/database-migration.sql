-- ============================================
-- سويان - ترقية قاعدة البيانات لنظام الدفع الهجين
-- SAWYAN - Hybrid Payment System Database Migration
-- ============================================
-- 
-- قم بتشغيل هذا الملف في Supabase SQL Editor
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. إضافة أعمدة جديدة لجدول transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'external';
-- Values: 'external' (كاش خارجي) | 'online' (دفع أونلاين)

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS initiator VARCHAR(20) DEFAULT 'customer';
-- Values: 'customer' (بمبادرة العميل) | 'merchant' (بمبادرة التاجر)

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50);
-- مثال: 'iyzico', 'paymob', 'hyperpay', 'mock'

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);
-- رقم العملية من بوابة الدفع

-- 2. إضافة أعمدة الواي فاي للتجار (إذا لم تكن موجودة)
ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS wifi_ssid VARCHAR(100);

ALTER TABLE merchants 
ADD COLUMN IF NOT EXISTS wifi_password VARCHAR(100);

-- 3. إنشاء جدول طرق الدفع المحفوظة
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
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

-- فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_payment_methods_member ON payment_methods(member_id);
CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(member_id, is_default) WHERE is_default = true;

-- 4. إنشاء جدول سجل المدفوعات
CREATE TABLE IF NOT EXISTS payment_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES transactions(id),
    payment_method_id UUID REFERENCES payment_methods(id),
    provider VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    -- Actions: 'authorize', 'capture', 'charge', 'refund', 'tokenize'
    amount DECIMAL(12, 2),
    currency VARCHAR(3) DEFAULT 'EGP',
    status VARCHAR(30) NOT NULL,
    -- Status: 'pending', 'success', 'failed', 'cancelled'
    provider_response JSONB,
    error_message TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرس للبحث
CREATE INDEX IF NOT EXISTS idx_payment_logs_transaction ON payment_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON payment_logs(status);

-- 5. تمكين RLS للجداول الجديدة
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_logs ENABLE ROW LEVEL SECURITY;

-- 6. سياسات RLS لـ payment_methods
CREATE POLICY "Members can view own payment methods" ON payment_methods
    FOR SELECT USING (auth.uid()::text = member_id::text OR auth.role() = 'service_role');

CREATE POLICY "Members can insert own payment methods" ON payment_methods
    FOR INSERT WITH CHECK (auth.uid()::text = member_id::text OR auth.role() = 'service_role');

CREATE POLICY "Members can update own payment methods" ON payment_methods
    FOR UPDATE USING (auth.uid()::text = member_id::text OR auth.role() = 'service_role');

CREATE POLICY "Members can delete own payment methods" ON payment_methods
    FOR DELETE USING (auth.uid()::text = member_id::text OR auth.role() = 'service_role');

-- 7. سياسات RLS لـ payment_logs
CREATE POLICY "Service role can manage payment logs" ON payment_logs
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view related payment logs" ON payment_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM transactions t 
            WHERE t.id = payment_logs.transaction_id 
            AND (t.member_id::text = auth.uid()::text OR t.merchant_id::text = auth.uid()::text)
        )
    );

-- 8. دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق الـ trigger
DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER update_payment_methods_updated_at
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ✅ اكتمل التثبيت
-- Installation Complete
-- ============================================

SELECT 'Migration completed successfully! 🎉' as status;
