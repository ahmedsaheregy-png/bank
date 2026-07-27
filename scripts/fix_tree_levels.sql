-- ============================================================================
-- SAWYAN BANK — Fix tree_level for all members (recursive recalculation)
-- ============================================================================
-- المشكلة: أغلب الأعضاء ليهم tree_level=1 حتى لو مش في الجيل الأول
-- الحل: إعادة حساب tree_level بناءً على parent_id بشكل recursive
-- ============================================================================

-- 1) إصلاح الـ root member (لازم يكون level 1)
UPDATE sawyan.members
SET tree_level = 1
WHERE parent_id IS NULL;

-- 2) إصلاح باقي الأعضاء (كل واحد = tree_level أبوه + 1)
-- المرة الأولى — يغطي 3 مستويات
WITH RECURSIVE fix_tree AS (
    -- الأعضاء اللي أبهم هو الـ root مباشر
    SELECT m.id, 2 AS new_level
    FROM sawyan.members m
    JOIN sawyan.members p ON m.parent_id = p.id
    WHERE p.parent_id IS NULL

    UNION ALL

    -- كل الأعضاء اللي تحت أولئك
    SELECT m.id, ft.new_level + 1
    FROM sawyan.members m
    JOIN fix_tree ft ON m.parent_id = ft.id
    WHERE ft.new_level < 20
)
UPDATE sawyan.members m
SET tree_level = ft.new_level
FROM fix_tree ft
WHERE m.id = ft.id;

-- التحقق من النتائج
SELECT member_code, full_name, tree_level, position,
       (SELECT member_code FROM sawyan.members p WHERE p.id = m.parent_id) as parent_code
FROM sawyan.members m
ORDER BY tree_level, member_code;
