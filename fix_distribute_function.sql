-- ============================================================================
-- 🌳 SAWYAN BANK — Fix distribute_transaction_commission to match real schema
-- ============================================================================
-- السبب:
--   transactions table الحقيقي فيه company_share + plan_share (مش members_share)
--   لازم نحدّث الـ function عشان تستخدم plan_share
-- ============================================================================

-- ============================================================================
-- 1) Drop old function if exists
-- ============================================================================
DROP FUNCTION IF EXISTS sawyan.distribute_transaction_commission(UUID);

-- ============================================================================
-- 2) Recreate with correct column name (plan_share = members_share)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.distribute_transaction_commission(
    p_transaction_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_transaction RECORD;
    v_member_id UUID;
    v_pool_amount NUMERIC(12,2);
    v_member_share NUMERIC(12,2);
    v_upline_share NUMERIC(12,2);
    v_upline_record RECORD;
    v_pool_tx_id BIGINT;
    v_total_distributed NUMERIC(12,2) := 0;
    v_stopper_level INT := 10;
    v_upline_count INT := 0;
    v_settings JSONB;
    v_pool_config JSONB;
    v_member_percentage NUMERIC;
    v_upline_percentage NUMERIC;
    v_stopper_percentage NUMERIC;
    v_generations INT;
BEGIN
    -- نجيب بيانات العملية
    SELECT * INTO v_transaction
    FROM sawyan.transactions
    WHERE id = p_transaction_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'transaction not found');
    END IF;
    
    -- نجيب إعدادات الـ pool من settings
    -- نقراها كم JSONB block واحد
    SELECT value INTO v_pool_config FROM sawyan.settings WHERE key = 'pool_config' LIMIT 1;
    
    v_generations := COALESCE((v_pool_config->>'generations_count')::INT, 11);
    v_member_percentage := COALESCE((v_pool_config->>'member_percentage')::NUMERIC, 50);
    v_upline_percentage := COALESCE((v_pool_config->>'upline_percentage')::NUMERIC, 5);
    v_stopper_percentage := COALESCE((v_pool_config->>'stopper_percentage')::NUMERIC, 10);
    v_stopper_level := v_generations - 1;  -- max_depth = N - 1
    
    v_member_id := v_transaction.member_id;
    -- plan_share هو الاسم الحقيقي في الـ DB (يساوي members_share = deducted - company_share)
    v_pool_amount := COALESCE(v_transaction.plan_share, v_transaction.commission_amount, 0);
    
    IF v_pool_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'no pool amount (plan_share is 0)');
    END IF;
    
    -- ننشئ pool_transaction
    INSERT INTO sawyan.pool_transactions (transaction_id, member_id, amount, pool_amount)
    VALUES (p_transaction_id, v_member_id, v_transaction.total_amount, v_pool_amount)
    RETURNING id INTO v_pool_tx_id;
    
    -- العمولة للعضو نفسه (level 0)
    v_member_share := (v_pool_amount * v_member_percentage) / 100;
    
    INSERT INTO sawyan.commission_distributions (
        pool_transaction_id, beneficiary_id, level, amount, percentage, is_stopper
    ) VALUES (
        v_pool_tx_id, v_member_id, 0, v_member_share, v_member_percentage, FALSE
    );
    
    v_total_distributed := v_total_distributed + v_member_share;
    
    -- نوزع على الـ uplines من 1 لحد الستوبر (N-1 levels above)
    FOR v_upline_record IN 
        SELECT * FROM sawyan.get_uplines(v_member_id, v_stopper_level)
        WHERE depth > 0 AND depth <= v_stopper_level
        ORDER BY depth ASC
    LOOP
        v_upline_count := v_upline_count + 1;
        v_upline_share := (v_pool_amount * v_upline_percentage) / 100;
        
        INSERT INTO sawyan.commission_distributions (
            pool_transaction_id, beneficiary_id, level, amount, percentage, is_stopper
        ) VALUES (
            v_pool_tx_id, v_upline_record.id, v_upline_record.depth, 
            v_upline_share, v_upline_percentage, 
            (v_upline_record.depth = v_stopper_level)
        );
        
        v_total_distributed := v_total_distributed + v_upline_share;
        
        -- لو ده الستوبر، نوقف
        IF v_upline_record.depth = v_stopper_level THEN
            EXIT;
        END IF;
    END LOOP;
    
    -- الزيادة (surplus) نحسبها ونخزنها لو فيه
    DECLARE
        v_surplus NUMERIC(12,2) := v_pool_amount - v_total_distributed;
    BEGIN
        IF v_surplus > 0 THEN
            INSERT INTO sawyan.surplus_distributions (
                pool_transaction_id, total_surplus, beneficiary_count, per_beneficiary_amount
            ) VALUES (
                v_pool_tx_id, v_surplus, v_upline_count + 1, 0
            );
        END IF;
    END;
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'pool_transaction_id', v_pool_tx_id,
        'pool_amount', v_pool_amount,
        'member_share', v_member_share,
        'upline_count', v_upline_count,
        'upline_share_each', v_upline_share,
        'total_distributed', v_total_distributed,
        'remaining_in_pool', v_pool_amount - v_total_distributed,
        'stopper_level', v_stopper_level
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3) GRANT EXECUTE
-- ============================================================================
GRANT EXECUTE ON FUNCTION sawyan.distribute_transaction_commission(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.distribute_transaction_commission(UUID) TO anon;
GRANT EXECUTE ON FUNCTION sawyan.distribute_transaction_commission(UUID) TO authenticated;

-- ============================================================================
-- 4) إعادة تحميل schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ✅ تحقق
-- ============================================================================
SELECT 'distribute_transaction_commission fixed successfully' AS status;
SELECT proname FROM pg_proc WHERE pronamespace = 'sawyan'::regnamespace ORDER BY proname;
