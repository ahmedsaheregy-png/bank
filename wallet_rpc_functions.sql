-- ============================================================================
-- SAWYAN BANK — Wallet Helper RPC Functions
-- ============================================================================
-- إنشاء دوال RPC لتحديث رصيد المحفظة بشكل آمن (atomic)
-- الـ frontend بيستدعيهم مع fallback لـ direct update لو مش موجودين
--
-- التشغيل: Supabase SQL Editor → الصق المحتوى → Run
-- ============================================================================

-- ============================================================================
-- 1) add_wallet_balance(p_member_id, p_amount, p_description, p_transaction_type, p_reference_id)
-- ============================================================================
-- بيضيف مبلغ لرصيد المحفظة + يسجل عملية في wallet_transactions بشكل atomic
-- Returns: JSONB { success, wallet_id, new_balance, wallet_transaction_id }
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.add_wallet_balance(
    p_member_id UUID,
    p_amount NUMERIC(12,2),
    p_description TEXT DEFAULT NULL,
    p_transaction_type VARCHAR(30) DEFAULT 'commission',
    p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_wtx_id UUID;
    v_ref_uuid UUID;
BEGIN
    -- التحقق من المبلغ
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'invalid amount');
    END IF;

    -- جلب المحفظة (مع lock للصف عشان نضمن atomic update)
    SELECT id, balance, total_earned INTO v_wallet
    FROM sawyan.wallets
    WHERE member_id = p_member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'wallet not found');
    END IF;

    -- تحويل الـ reference_id لـ UUID لو ممكن
    BEGIN
        v_ref_uuid := p_reference_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_ref_uuid := NULL;
    END;

    -- تحديث الرصيد + الإجمالي المكتسب
    UPDATE sawyan.wallets
    SET balance = balance + p_amount,
        total_earned = COALESCE(total_earned, 0) + p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- إدراج سجل المحفظة
    INSERT INTO sawyan.wallet_transactions (
        wallet_id, transaction_type, amount, description, reference_id, status
    ) VALUES (
        v_wallet.id, p_transaction_type, p_amount, p_description, v_ref_uuid, 'completed'
    )
    RETURNING id INTO v_wtx_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'wallet_id', v_wallet.id,
        'new_balance', v_wallet.balance + p_amount,
        'wallet_transaction_id', v_wtx_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 2) deduct_wallet_balance(p_member_id, p_amount, p_description, p_metadata)
-- ============================================================================
-- بيخصم مبلغ من رصيد المحفظة (لطلبات السحب) + يسجل العملية بشكل atomic
-- Returns: JSONB { success, wallet_id, new_balance, wallet_transaction_id }
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.deduct_wallet_balance(
    p_member_id UUID,
    p_amount NUMERIC(12,2),
    p_description TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_wallet RECORD;
    v_wtx_id UUID;
BEGIN
    -- التحقق من المبلغ
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'invalid amount');
    END IF;

    -- جلب المحفظة مع lock
    SELECT id, balance, pending_balance INTO v_wallet
    FROM sawyan.wallets
    WHERE member_id = p_member_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'wallet not found');
    END IF;

    -- التحقق من الرصيد الكافي
    IF v_wallet.balance < p_amount THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'insufficient balance');
    END IF;

    -- خصم من balance + إضافة لـ pending_balance (لين السحب يتعمل)
    UPDATE sawyan.wallets
    SET balance = balance - p_amount,
        pending_balance = COALESCE(pending_balance, 0) + p_amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- إدراج طلب السحب (status = pending لين الأدمن يوافق)
    INSERT INTO sawyan.wallet_transactions (
        wallet_id, transaction_type, amount, description, status
    ) VALUES (
        v_wallet.id, 'withdrawal', p_amount, p_description, 'pending'
    )
    RETURNING id INTO v_wtx_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'wallet_id', v_wallet.id,
        'wallet_transaction_id', v_wtx_id,
        'new_balance', v_wallet.balance - p_amount,
        'pending_balance', v_wallet.pending_balance + p_amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3) approve_withdrawal(p_wallet_transaction_id)
-- ============================================================================
-- لما الأدمن يوافق على طلب السحب: ينقل المبلغ من pending_balance لـ total_withdrawn
-- Returns: JSONB { success, new_balance, new_pending_balance }
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.approve_withdrawal(
    p_wallet_transaction_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_wtx RECORD;
    v_wallet RECORD;
BEGIN
    -- جلب طلب السحب
    SELECT id, wallet_id, amount, status INTO v_wtx
    FROM sawyan.wallet_transactions
    WHERE id = p_wallet_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'withdrawal not found');
    END IF;

    IF v_wtx.status <> 'pending' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'withdrawal already processed');
    END IF;

    -- جلب المحفظة
    SELECT id, balance, pending_balance, total_withdrawn INTO v_wallet
    FROM sawyan.wallets
    WHERE id = v_wtx.wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'wallet not found');
    END IF;

    -- خصم من pending_balance + إضافة لـ total_withdrawn
    UPDATE sawyan.wallets
    SET pending_balance = GREATEST(COALESCE(pending_balance, 0) - v_wtx.amount, 0),
        total_withdrawn = COALESCE(total_withdrawn, 0) + v_wtx.amount,
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- تحديث حالة طلب السحب
    UPDATE sawyan.wallet_transactions
    SET status = 'approved'
    WHERE id = v_wtx.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_balance', v_wallet.balance,
        'new_pending_balance', GREATEST(v_wallet.pending_balance - v_wtx.amount, 0),
        'new_total_withdrawn', COALESCE(v_wallet.total_withdrawn, 0) + v_wtx.amount
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4) reject_withdrawal(p_wallet_transaction_id, p_reason)
-- ============================================================================
-- لما الأدمن يرفض طلب السحب: يرجّع المبلغ من pending_balance لـ balance
-- Returns: JSONB { success, new_balance, new_pending_balance }
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.reject_withdrawal(
    p_wallet_transaction_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_wtx RECORD;
    v_wallet RECORD;
BEGIN
    -- جلب طلب السحب
    SELECT id, wallet_id, amount, status INTO v_wtx
    FROM sawyan.wallet_transactions
    WHERE id = p_wallet_transaction_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'withdrawal not found');
    END IF;

    IF v_wtx.status <> 'pending' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'withdrawal already processed');
    END IF;

    -- جلب المحفظة
    SELECT id, balance, pending_balance INTO v_wallet
    FROM sawyan.wallets
    WHERE id = v_wtx.wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'wallet not found');
    END IF;

    -- رجوع المبلغ من pending_balance لـ balance
    UPDATE sawyan.wallets
    SET balance = balance + v_wtx.amount,
        pending_balance = GREATEST(COALESCE(pending_balance, 0) - v_wtx.amount, 0),
        updated_at = NOW()
    WHERE id = v_wallet.id;

    -- تحديث حالة طلب السحب + سبب الرفض
    UPDATE sawyan.wallet_transactions
    SET status = 'rejected',
        description = COALESCE(description, '') || CASE WHEN p_reason IS NOT NULL THEN ' | سبب الرفض: ' || p_reason ELSE '' END
    WHERE id = v_wtx.id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_balance', v_wallet.balance + v_wtx.amount,
        'new_pending_balance', GREATEST(v_wallet.pending_balance - v_wtx.amount, 0)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- GRANTs
-- ============================================================================
GRANT EXECUTE ON FUNCTION sawyan.add_wallet_balance(UUID, NUMERIC, TEXT, VARCHAR, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.deduct_wallet_balance(UUID, NUMERIC, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.approve_withdrawal(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sawyan.reject_withdrawal(UUID, TEXT) TO anon, authenticated;

-- إعادة تحميل schema cache لـ PostgREST
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ✅ تم! اختبر:
-- ============================================================================
-- SELECT sawyan.add_wallet_balance(
--     '<member-uuid>'::UUID,
--     50.00,
--     'test add',
--     'commission',
--     NULL
-- );
