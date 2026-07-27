-- ============================================================================
-- SAWYAN BANK — Expose `sawyan` schema to PostgREST (v2 — safe, no authenticator)
-- ============================================================================
-- لماذا هذا الملف آمن؟
--   - لا يحتوي على أي ALTER ROLE أو GRANT TO authenticator
--   - يمنح الصلاحيات فقط للأدوار المسموح بها: anon / authenticated / service_role
--   - لا يلمس db_schemas (هذا الإعداد يُفعل من Dashboard فقط — انظر التعليمات أدناه)
-- ============================================================================

-- ============================================================================
-- 1) GRANT USAGE على الـ schema نفسه
-- ============================================================================
GRANT USAGE ON SCHEMA sawyan TO service_role;
GRANT USAGE ON SCHEMA sawyan TO anon;
GRANT USAGE ON SCHEMA sawyan TO authenticated;

-- ============================================================================
-- 2) GRANT على كل الجداول الموجودة في sawyan
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sawyan TO service_role;
GRANT SELECT                                   ON ALL TABLES IN SCHEMA sawyan TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE           ON ALL TABLES IN SCHEMA sawyan TO authenticated;

-- ============================================================================
-- 3) GRANT على الـ sequences (لأن عندنا BIGSERIAL / SERIAL)
-- ============================================================================
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sawyan TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sawyan TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sawyan TO authenticated;

-- ============================================================================
-- 4) GRANT EXECUTE على كل الـ functions في sawyan
-- ============================================================================
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO authenticated;

-- ============================================================================
-- 5) إعادة تحميل schema cache في PostgREST
-- ============================================================================
-- NOTIFY بيقول لـ PostgREST يreload الـ schema cache من غير ما نلمس authenticator
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ✅ تحقق سريع: لائحة الجداول والـ functions في sawyan
-- ============================================================================
SELECT 'sawyan schema exposed successfully' AS status;

SELECT tablename AS table_name
FROM pg_tables
WHERE schemaname = 'sawyan'
ORDER BY tablename;

SELECT proname AS function_name
FROM pg_proc
WHERE pronamespace = 'sawyan'::regnamespace
ORDER BY proname;

-- ============================================================================
-- ⚠️ خطوة إضافية لازم تعملها يدوياً من Supabase Dashboard:
-- ============================================================================
-- 1. افتح Supabase Dashboard → Project Settings → API
-- 2. انزل تحت لـ "Exposed schemas"
-- 3. فعّل الـ checkbox جنب "sawyan"
-- 4. اضغط Save
-- 5. (اختياري) من نفس الصفحة اضغط "Reload schema cache"
--
-- بعد كده الـ frontend هتقدر توصل لـ sawyan.members, sawyan.transactions, إلخ
-- عبر Supabase JS client بدون مشاكل.
-- ============================================================================
