-- ============================================================================
-- 🌳 SAWYAN BANK — تفعيل schema sawyan في PostgREST
-- ============================================================================
-- السبب: PostgREST (الـ REST API) بيشتغل على public فقط افتراضياً
-- محتاجين نظيف الـ sawyan schema للـ API exposures
-- ============================================================================

-- 1) نمنح service_role صلاحية USAGE على schema sawyan
GRANT USAGE ON SCHEMA sawyan TO service_role;
GRANT USAGE ON SCHEMA sawyan TO anon;
GRANT USAGE ON SCHEMA sawyan TO authenticated;

-- 2) نمنح صلاحيات على كل الجداول في sawyan
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sawyan TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA sawyan TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA sawyan TO authenticated;

-- 3) نمنح صلاحيات على الـ sequences (لأن عندنا BIGSERIAL و SERIAL)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sawyan TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sawyan TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA sawyan TO authenticated;

-- 4) نفعّل الـ functions في sawyan للـ service_role
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sawyan TO authenticated;

-- 5) نحدّث PostgREST عشان يكتشف schema sawyan
-- Supabase بيوفر function جاهزة لإعادة تحميل الـ schema cache
NOTIFY pgrst, 'reload schema';

-- 6) بديل: نضيف sawyan للـ db_schemas في الـ config
-- ده بيتعمل عبر Supabase Dashboard → Project Settings → API
-- أو عبر:
ALTER ROLE "authenticator" SET db_schemas = 'public, sawyan';

-- 7) إعادة تحميل الـ schema cache مرة تانية بعد تغيير الـ config
NOTIFY pgrst, 'reload schema';

-- ✅ تحقق
SELECT 'Sawyan schema exposure done!' AS status;

-- عرض كل الجداول في sawyan
SELECT tablename FROM pg_tables WHERE schemaname = 'sawyan' ORDER BY tablename;

-- عرض كل الـ functions في sawyan
SELECT proname FROM pg_proc WHERE pronamespace = 'sawyan'::regnamespace ORDER BY proname;
