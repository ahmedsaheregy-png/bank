-- ============================================================================
-- 🌳 SAWYAN BANK — Phase 2 Supplement (الجداول والـ functions الناقصة)
-- ============================================================================
-- سبب الملف ده:
--   الـ master SQL script اتنفّذ جزئياً — الـ basic tables اتنشأت،
--   بس الـ pool tables والـ functions مش موجودة.
--   الملف ده بينشئ اللي ناقص بس بدون ما يلمس اللي موجود.
-- ============================================================================

-- ============================================================================
-- 1) جدول pool_transactions (سجل دخول البول)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sawyan.pool_transactions (
    id BIGSERIAL PRIMARY KEY,
    transaction_id UUID,  -- مرجع لـ sawyan.transactions(id)
    member_id UUID NOT NULL,  -- العضو اللي عمل العملية
    amount NUMERIC(12,2) NOT NULL,  -- مبلغ العملية
    pool_amount NUMERIC(12,2) NOT NULL,  -- المبلغ اللي دخل البول
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_pool_tx_member ON sawyan.pool_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_pool_tx_transaction ON sawyan.pool_transactions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pool_tx_created ON sawyan.pool_transactions(created_at DESC);

COMMENT ON TABLE sawyan.pool_transactions IS 'سجل عمليات دخول البول — كل عملية شراء بتنشئ سجل هنا';

-- ============================================================================
-- 2) جدول commission_distributions (تفاصيل توزيع العمولات)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sawyan.commission_distributions (
    id BIGSERIAL PRIMARY KEY,
    pool_transaction_id BIGINT REFERENCES sawyan.pool_transactions(id) ON DELETE CASCADE,
    beneficiary_id UUID NOT NULL,  -- العضو المستفيد
    level INT NOT NULL,  -- مستوى العضو بالنسبة للعملية (0 = العضو نفسه، 1 = أبوه، إلخ)
    amount NUMERIC(12,2) NOT NULL,  -- العمولة اللي وصلته
    percentage NUMERIC(5,2) NOT NULL,  -- النسبة المئوية
    is_stopper BOOLEAN DEFAULT FALSE,  -- هل ده الستوبر؟
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_dist_pool ON sawyan.commission_distributions(pool_transaction_id);
CREATE INDEX IF NOT EXISTS idx_commission_dist_beneficiary ON sawyan.commission_distributions(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_commission_dist_created ON sawyan.commission_distributions(created_at DESC);

COMMENT ON TABLE sawyan.commission_distributions IS 'تفاصيل توزيع عمولة كل عملية على المستفيدين';

-- ============================================================================
-- 3) جدول surplus_distributions (توزيع الفائض - مؤقت)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sawyan.surplus_distributions (
    id BIGSERIAL PRIMARY KEY,
    pool_transaction_id BIGINT REFERENCES sawyan.pool_transactions(id) ON DELETE CASCADE,
    total_surplus NUMERIC(12,2) NOT NULL,
    beneficiary_count INT DEFAULT 0,
    per_beneficiary_amount NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE sawyan.surplus_distributions IS 'توزيع الفائض بعد الستوبر (مؤقت)';

-- ============================================================================
-- 4) جدول complaints (الشكاوى)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sawyan.complaints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID,
    transaction_id UUID,
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open',  -- open / in_progress / resolved / closed
    priority TEXT DEFAULT 'normal',  -- low / normal / high / urgent
    assigned_to UUID,
    resolution TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_complaints_member ON sawyan.complaints(member_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON sawyan.complaints(status);

-- ============================================================================
-- 5) Function: update_updated_at_column
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6) Function: recalculate_default_cap
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.recalculate_default_cap()
RETURNS VOID AS $$
DECLARE
    cap_count INT;
    default_cap_value INT := 10;
BEGIN
    SELECT COUNT(*) INTO cap_count
    FROM sawyan.settings
    WHERE key = 'default_cap';
    
    IF cap_count = 0 THEN
        INSERT INTO sawyan.settings (key, value, description)
        VALUES ('default_cap', jsonb_build_object('value', default_cap_value), 'الحد الأقصى للستوبر');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7) Function: is_in_downline (هل العضو في downline عضو آخر)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.is_in_downline(
    ancestor_id UUID,
    descendant_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    current_id UUID;
    depth INT := 0;
    max_depth INT := 50;
BEGIN
    IF ancestor_id IS NULL OR descendant_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    IF ancestor_id = descendant_id THEN
        RETURN TRUE;
    END IF;
    
    current_id := descendant_id;
    
    WHILE current_id IS NOT NULL AND depth < max_depth LOOP
        SELECT parent_id INTO current_id FROM sawyan.members WHERE id = current_id;
        
        IF current_id = ancestor_id THEN
            RETURN TRUE;
        END IF;
        
        depth := depth + 1;
    END LOOP;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8) Function: is_placement_available (هل المكان متاح)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.is_placement_available(
    parent_member_id UUID,
    desired_position TEXT  -- 'left' or 'right'
)
RETURNS BOOLEAN AS $$
DECLARE
    existing_count INT;
BEGIN
    SELECT COUNT(*) INTO existing_count
    FROM sawyan.members
    WHERE parent_id = parent_member_id
      AND position = desired_position;
    
    RETURN existing_count = 0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9) Function: get_downline (كل الـ downline لعضو معين)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_downline(
    member_id UUID,
    max_depth INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    member_code TEXT,
    full_name TEXT,
    parent_id UUID,
    pos TEXT,
    tree_level INT,
    depth INT
) AS $$
WITH RECURSIVE downline AS (
    SELECT 
        m.id, m.member_code, m.full_name, m.parent_id, m.position AS pos, m.tree_level, 0 AS depth
    FROM sawyan.members m
    WHERE m.id = member_id
    
    UNION ALL
    
    SELECT 
        m.id, m.member_code, m.full_name, m.parent_id, m.position AS pos, m.tree_level, d.depth + 1
    FROM sawyan.members m
    JOIN downline d ON m.parent_id = d.id
    WHERE d.depth < max_depth
)
SELECT * FROM downline;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 10) Function: get_uplines (كل الـ uplines لعضو معين حتى root)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.get_uplines(
    member_id UUID,
    max_depth INT DEFAULT 50
)
RETURNS TABLE (
    id UUID,
    member_code TEXT,
    full_name TEXT,
    parent_id UUID,
    pos TEXT,
    tree_level INT,
    depth INT,
    is_stopper BOOLEAN
) AS $$
WITH RECURSIVE uplines AS (
    SELECT 
        m.id, m.member_code, m.full_name, m.parent_id, m.position AS pos, m.tree_level, 0 AS depth, FALSE AS is_stopper
    FROM sawyan.members m
    WHERE m.id = member_id
    
    UNION ALL
    
    SELECT 
        m.id, m.member_code, m.full_name, m.parent_id, m.position AS pos, m.tree_level, u.depth + 1 AS depth,
        CASE WHEN u.depth + 1 >= 10 THEN TRUE ELSE FALSE END AS is_stopper
    FROM sawyan.members m
    JOIN uplines u ON m.id = u.parent_id
    WHERE u.depth < max_depth
)
SELECT * FROM uplines;
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- 11) Function: auto_set_member_placement (تعيين مكان العضو الجديد تلقائياً)
-- ============================================================================
CREATE OR REPLACE FUNCTION sawyan.auto_set_member_placement()
RETURNS TRIGGER AS $$
DECLARE
    sponsor_uuid UUID;
    sponsor_has_left BOOLEAN;
    sponsor_has_right BOOLEAN;
BEGIN
    -- لو الـ parent_id محدد والـ position محددة، نسيبها زي ما هي
    IF NEW.parent_id IS NOT NULL AND NEW.position IS NOT NULL THEN
        -- التحقق من إن المكان متاح
        IF NOT sawyan.is_placement_available(NEW.parent_id, NEW.position) THEN
            RAISE EXCEPTION 'Position % under parent % is already taken', NEW.position, NEW.parent_id;
        END IF;
        NEW.tree_level := (
            SELECT COALESCE(tree_level, 0) + 1 FROM sawyan.members WHERE id = NEW.parent_id
        );
        RETURN NEW;
    END IF;
    
    -- لو مفيش parent، نحاول نستخدم sponsor كـ parent
    IF NEW.sponsor_id IS NOT NULL THEN
        sponsor_uuid := NEW.sponsor_id::UUID;
        sponsor_has_left := EXISTS (
            SELECT 1 FROM sawyan.members WHERE parent_id = sponsor_uuid AND position = 'left'
        );
        sponsor_has_right := EXISTS (
            SELECT 1 FROM sawyan.members WHERE parent_id = sponsor_uuid AND position = 'right'
        );
        
        IF NOT sponsor_has_left THEN
            NEW.parent_id := sponsor_uuid;
            NEW.position := 'left';
        ELSIF NOT sponsor_has_right THEN
            NEW.parent_id := sponsor_uuid;
            NEW.position := 'right';
        END IF;
        
        NEW.tree_level := (
            SELECT COALESCE(tree_level, 0) + 1 FROM sawyan.members WHERE id = NEW.parent_id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12) Trigger: auto_set_member_placement
-- ============================================================================
DROP TRIGGER IF EXISTS trg_auto_set_member_placement ON sawyan.members;
CREATE TRIGGER trg_auto_set_member_placement
    BEFORE INSERT ON sawyan.members
    FOR EACH ROW
    EXECUTE FUNCTION sawyan.auto_set_member_placement();

-- ============================================================================
-- 13) Trigger: update_updated_at على كل الجداول اللي عندها updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS trg_members_updated ON sawyan.members;
CREATE TRIGGER trg_members_updated BEFORE UPDATE ON sawyan.members
    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_merchants_updated ON sawyan.merchants;
CREATE TRIGGER trg_merchants_updated BEFORE UPDATE ON sawyan.merchants
    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_transactions_updated ON sawyan.transactions;
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON sawyan.transactions
    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_settings_updated ON sawyan.settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON sawyan.settings
    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_wallets_updated ON sawyan.wallets;
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON sawyan.wallets
    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_complaints_updated ON sawyan.complaints;
CREATE TRIGGER trg_complaints_updated BEFORE UPDATE ON sawyan.complaints
    FOR EACH ROW EXECUTE FUNCTION sawyan.update_updated_at_column();

-- ============================================================================
-- 14) Function: distribute_transaction_commission
-- ============================================================================
-- دي أهم function في الـ Phase 2 — بتعمل توزيع العمولات للعملية الواحدة
-- من العضو اللي عمل العملية، لفوق لحد الستوبر (level 10)

CREATE OR REPLACE FUNCTION sawyan.distribute_transaction_commission(
    p_transaction_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_transaction RECORD;
    v_member_id UUID;
    v_pool_amount NUMERIC(12,2);
    v_plan_share NUMERIC(12,2);
    v_member_share NUMERIC(12,2);
    v_upline_share NUMERIC(12,2);
    v_upline_record RECORD;
    v_pool_tx_id BIGINT;
    v_total_distributed NUMERIC(12,2) := 0;
    v_stopper_level INT := 10;
    v_upline_count INT := 0;
    v_distribution RECORD;
    v_settings JSONB;
    v_member_percentage NUMERIC;
    v_upline_percentage NUMERIC;
    v_stopper_percentage NUMERIC;
BEGIN
    -- نجيب بيانات العملية
    SELECT * INTO v_transaction
    FROM sawyan.transactions
    WHERE id = p_transaction_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'transaction not found');
    END IF;
    
    -- نجيب إعدادات العمولات من settings
    SELECT value INTO v_settings FROM sawyan.settings WHERE key = 'commission_split' LIMIT 1;
    v_member_percentage := COALESCE((v_settings->>'member_share')::NUMERIC, 50);
    v_upline_percentage := COALESCE((v_settings->>'upline_share')::NUMERIC, 5);
    v_stopper_percentage := COALESCE((v_settings->>'stopper_share')::NUMERIC, 10);
    
    v_member_id := v_transaction.member_id;
    v_pool_amount := COALESCE(v_transaction.members_share, v_transaction.commission_amount, 0);
    
    IF v_pool_amount <= 0 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'no pool amount');
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
    
    -- نوزع على الـ uplines من 1 لحد 10
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
    
    RETURN jsonb_build_object(
        'success', TRUE,
        'pool_transaction_id', v_pool_tx_id,
        'pool_amount', v_pool_amount,
        'total_distributed', v_total_distributed,
        'upline_count', v_upline_count,
        'remaining_in_pool', v_pool_amount - v_total_distributed
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 15) Views
-- ============================================================================
CREATE OR REPLACE VIEW sawyan.v_pool_stats AS
SELECT 
    DATE(created_at) AS date,
    COUNT(*) AS total_pool_transactions,
    SUM(pool_amount) AS total_pool_amount,
    SUM(amount) AS total_transaction_volume
FROM sawyan.pool_transactions
GROUP BY DATE(created_at)
ORDER BY DATE(created_at) DESC;

CREATE OR REPLACE VIEW sawyan.v_member_commission_stats AS
SELECT 
    cd.beneficiary_id,
    m.member_code,
    m.full_name,
    COUNT(*) AS commission_count,
    SUM(cd.amount) AS total_commission_earned,
    MAX(cd.created_at) AS last_commission_at
FROM sawyan.commission_distributions cd
JOIN sawyan.members m ON m.id = cd.beneficiary_id
GROUP BY cd.beneficiary_id, m.member_code, m.full_name;

CREATE OR REPLACE VIEW sawyan.v_tree_overview AS
SELECT 
    m.id,
    m.member_code,
    m.full_name,
    m.parent_id,
    m.position AS pos,
    m.tree_level,
    m.sponsor_id,
    (SELECT COUNT(*) FROM sawyan.members c WHERE c.parent_id = m.id) AS children_count,
    (SELECT full_name FROM sawyan.members p WHERE p.id = m.parent_id) AS parent_name
FROM sawyan.members m;

-- ============================================================================
-- 16) GRANTs على الجداول والـ functions الجديدة
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.pool_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.pool_transactions TO authenticated;
GRANT SELECT ON sawyan.pool_transactions TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.commission_distributions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.commission_distributions TO authenticated;
GRANT SELECT ON sawyan.commission_distributions TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.surplus_distributions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.surplus_distributions TO authenticated;
GRANT SELECT ON sawyan.surplus_distributions TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.complaints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sawyan.complaints TO authenticated;
GRANT SELECT ON sawyan.complaints TO anon;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA sawyan TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA sawyan TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA sawyan TO authenticated;

-- ============================================================================
-- 17) إعادة تحميل schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ✅ تحقق
-- ============================================================================
SELECT 'Phase 2 supplement applied successfully' AS status;

SELECT tablename FROM pg_tables WHERE schemaname = 'sawyan' ORDER BY tablename;
SELECT proname FROM pg_proc WHERE pronamespace = 'sawyan'::regnamespace ORDER BY proname;
