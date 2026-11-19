-- ============================================================================
-- SAWYAN ECOSYSTEM — STAGE 8: SCALABLE STANDALONE ACADEMY LMS FOUNDATION
-- Expand & Contract Non-Destructive Migration (D21 + Section 3.4 + Section 8.4)
-- Architecture: Bounded Academy LMS Context ready for:
--   MVP Today  : Tracks -> Ordered Sequential Lessons (Video / Article / Audio / PDF)
--                + Completion Progress Tracking
--   Scale Next : Quizzes & Passing Scores, Certificates, Threaded Comments/Q&A,
--                and Tree-Leader Team-Scoped Uploads with Admin Moderation Queue.
-- NOTE: Zero lowercase bare `sawyan` in string literals so `clone_sql_for_demo`
--       safely clones this file between `sawyan` (Prod) and `sawyan_demo` (Demo).
-- ============================================================================

-- 1. المسارات التدريبية (sawyan.academy_tracks)
CREATE TABLE IF NOT EXISTS sawyan.academy_tracks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                VARCHAR(80) UNIQUE NOT NULL,
    title_i18n          JSONB NOT NULL,
    description_i18n    JSONB NOT NULL DEFAULT '{}'::jsonb,
    icon                VARCHAR(16) NOT NULL DEFAULT '🎓',
    audience            VARCHAR(20) NOT NULL DEFAULT 'all'
                        CHECK (audience IN ('all', 'members', 'leaders', 'merchants')),
    scope_type          VARCHAR(20) NOT NULL DEFAULT 'global'
                        CHECK (scope_type IN ('global', 'country', 'team_subtree')),
    target_country_code CHAR(2),
    owner_member_id     UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_sequential       BOOLEAN NOT NULL DEFAULT true,
    is_published        BOOLEAN NOT NULL DEFAULT true,
    version             INTEGER NOT NULL DEFAULT 1,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_track_leader_scope CHECK (
        (owner_member_id IS NULL AND scope_type <> 'team_subtree')
        OR (owner_member_id IS NOT NULL AND scope_type = 'team_subtree')
    )
);

-- 2. توسيع جدول الدروس القائم دون كسر أي عمود أو عقد سابق (sawyan.academy_courses)
ALTER TABLE sawyan.academy_courses
    ADD COLUMN IF NOT EXISTS track_id               UUID REFERENCES sawyan.academy_tracks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS media_type             VARCHAR(20) NOT NULL DEFAULT 'article',
    ADD COLUMN IF NOT EXISTS duration_minutes       SMALLINT,
    ADD COLUMN IF NOT EXISTS thumbnail_url          TEXT,
    ADD COLUMN IF NOT EXISTS prerequisite_course_id UUID REFERENCES sawyan.academy_courses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS scope_type             VARCHAR(20) NOT NULL DEFAULT 'global',
    ADD COLUMN IF NOT EXISTS target_country_code    CHAR(2),
    ADD COLUMN IF NOT EXISTS author_type            VARCHAR(20) NOT NULL DEFAULT 'company_admin',
    ADD COLUMN IF NOT EXISTS author_admin_id        UUID REFERENCES sawyan.admins(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS author_member_id       UUID REFERENCES sawyan.members(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approval_status        VARCHAR(30) NOT NULL DEFAULT 'approved',
    ADD COLUMN IF NOT EXISTS approved_by_admin_id   UUID REFERENCES sawyan.admins(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS approved_at            TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason       TEXT,
    ADD COLUMN IF NOT EXISTS has_quiz               BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pass_score_pct         SMALLINT NOT NULL DEFAULT 70,
    ADD COLUMN IF NOT EXISTS quiz_schema            JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS allow_comments         BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS is_mandatory           BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS metadata               JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS version                INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
BEGIN
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_media_type
            CHECK (media_type IN ('video', 'audio', 'article', 'pdf', 'mixed'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_duration
            CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 600);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_scope_type
            CHECK (scope_type IN ('global', 'country', 'team_subtree'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_author_type
            CHECK (author_type IN ('company_admin', 'tree_leader'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_approval_status
            CHECK (approval_status IN ('draft', 'pending_admin_approval', 'approved', 'rejected'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_pass_score
            CHECK (pass_score_pct BETWEEN 0 AND 100);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_no_self_prereq
            CHECK (prerequisite_course_id IS DISTINCT FROM id);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER TABLE sawyan.academy_courses ADD CONSTRAINT chk_academy_leader_scope
            CHECK (
                (author_type = 'company_admin')
                OR (author_type = 'tree_leader' AND author_member_id IS NOT NULL AND scope_type = 'team_subtree')
            );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- 3. جدول تتبع تقدم العضو والاختبارات والاجتيازات (sawyan.academy_member_progress)
CREATE TABLE IF NOT EXISTS sawyan.academy_member_progress (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id        UUID NOT NULL REFERENCES sawyan.members(id) ON DELETE CASCADE,
    course_id        UUID NOT NULL REFERENCES sawyan.academy_courses(id) ON DELETE CASCADE,
    status           VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                     CHECK (status IN ('in_progress', 'completed', 'passed', 'failed')),
    progress_pct     SMALLINT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    quiz_score_pct   SMALLINT CHECK (quiz_score_pct IS NULL OR quiz_score_pct BETWEEN 0 AND 100),
    attempts_count   INTEGER NOT NULL DEFAULT 0 CHECK (attempts_count >= 0),
    last_answers     JSONB NOT NULL DEFAULT '[]'::jsonb,
    certificate_code VARCHAR(40) UNIQUE,
    completed_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (member_id, course_id)
);

-- 4. جدول التعليقات التفاعلية والأسئلة تحت كل مادة تدريبية (sawyan.academy_lesson_comments)
CREATE TABLE IF NOT EXISTS sawyan.academy_lesson_comments (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id         UUID NOT NULL REFERENCES sawyan.academy_courses(id) ON DELETE CASCADE,
    member_id         UUID REFERENCES sawyan.members(id) ON DELETE CASCADE,
    admin_id          UUID REFERENCES sawyan.admins(id) ON DELETE SET NULL,
    parent_comment_id UUID REFERENCES sawyan.academy_lesson_comments(id) ON DELETE CASCADE,
    body              TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
    is_pinned         BOOLEAN NOT NULL DEFAULT false,
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'visible'
                      CHECK (moderation_status IN ('visible', 'hidden', 'flagged')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_academy_comment_author_xor CHECK (
        (member_id IS NOT NULL AND admin_id IS NULL)
        OR (member_id IS NULL AND admin_id IS NOT NULL)
    )
);

-- 5. فهارس الأداء المليوني للأكاديمية (Section 3.4)
CREATE INDEX IF NOT EXISTS idx_academy_tracks_order
    ON sawyan.academy_tracks (is_published, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_academy_courses_track_order
    ON sawyan.academy_courses (track_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_academy_courses_approval
    ON sawyan.academy_courses (approval_status, created_at DESC)
    WHERE author_type = 'tree_leader';
CREATE INDEX IF NOT EXISTS idx_academy_courses_author_member
    ON sawyan.academy_courses (author_member_id)
    WHERE author_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_academy_courses_prereq
    ON sawyan.academy_courses (prerequisite_course_id)
    WHERE prerequisite_course_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_academy_progress_member
    ON sawyan.academy_member_progress (member_id, status);
CREATE INDEX IF NOT EXISTS idx_academy_progress_course
    ON sawyan.academy_member_progress (course_id);
CREATE INDEX IF NOT EXISTS idx_academy_comments_course
    ON sawyan.academy_lesson_comments (course_id, created_at DESC)
    WHERE moderation_status = 'visible';
CREATE INDEX IF NOT EXISTS idx_academy_comments_parent
    ON sawyan.academy_lesson_comments (parent_comment_id)
    WHERE parent_comment_id IS NOT NULL;

-- 6. التغطية الكاملة بالـ RLS وأقل امتياز (Section 8.4)
ALTER TABLE sawyan.academy_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.academy_member_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.academy_lesson_comments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE sawyan.academy_tracks, sawyan.academy_member_progress, sawyan.academy_lesson_comments
    FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE sawyan.academy_tracks TO anon, authenticated;
GRANT SELECT ON TABLE sawyan.academy_member_progress, sawyan.academy_lesson_comments TO authenticated;

DROP POLICY IF EXISTS "public_read_published_tracks" ON sawyan.academy_tracks;
CREATE POLICY "public_read_published_tracks" ON sawyan.academy_tracks
    FOR SELECT TO anon, authenticated
    USING (is_published = true AND scope_type = 'global');

DROP POLICY IF EXISTS "public_read_published_academy" ON sawyan.academy_courses;
CREATE POLICY "public_read_published_academy" ON sawyan.academy_courses
    FOR SELECT TO anon, authenticated
    USING (is_published = true AND approval_status = 'approved' AND scope_type = 'global');

DROP POLICY IF EXISTS "member_read_own_academy_progress" ON sawyan.academy_member_progress;
CREATE POLICY "member_read_own_academy_progress" ON sawyan.academy_member_progress
    FOR SELECT TO authenticated
    USING (member_id = sawyan.current_member_id());

DROP POLICY IF EXISTS "authenticated_read_visible_academy_comments" ON sawyan.academy_lesson_comments;
CREATE POLICY "authenticated_read_visible_academy_comments" ON sawyan.academy_lesson_comments
    FOR SELECT TO authenticated
    USING (moderation_status = 'visible');

-- 7. البذرة التأسيسية المتسلسلة للأكاديمية (متوافقة 100% مع قواعد الصياغة ومنع روابط الوهم)
INSERT INTO sawyan.academy_tracks (slug, title_i18n, description_i18n, icon, audience, scope_type, sort_order, is_sequential, is_published)
VALUES
(
    'track-onboarding',
    '{"ar":"١. المسار التأسيسي: تعرّف على مشروع SAWYAN","en":"1. Foundation Track: Welcome to SAWYAN"}'::jsonb,
    '{"ar":"مقدمة شاملة لفلسفة الاستهلاك الاستثماري وآلية البدء بدون رسوم اشتراك.","en":"Introduction to SAWYAN investment-consumption ecosystem."}'::jsonb,
    '🚀',
    'all',
    'global',
    1,
    true,
    true
),
(
    'track-income-plan',
    '{"ar":"٢. مسار خطة الدخل وصندوق الهدف الشهري","en":"2. Income Plan & Monthly Target Box"}'::jsonb,
    '{"ar":"شرح عملي لآلية الـ 75% / 25%، صندوق الهدف ($24.75)، الترحيل Carry On، والحصص الـ 11.","en":"How 75%/25%, Monthly Target ($24.75), Carry On & 11-share Roll-up work."}'::jsonb,
    '📊',
    'members',
    'global',
    2,
    true,
    true
),
(
    'track-leadership',
    '{"ar":"٣. مسار قادة الفرق والتوثيق والسحب الآمن","en":"3. Team Leadership, KYC & Safe Payouts"}'::jsonb,
    '{"ar":"قواعد بناء الفريق، رادار الأجيال العشرة، توثيق المشتريات، وضوابط السحب والـ KYC.","en":"Tree leadership, 10-generation radar, invoice verification, KYC & Day-15 payouts."}'::jsonb,
    '🌳',
    'leaders',
    'global',
    3,
    true,
    true
)
ON CONFLICT (slug) DO UPDATE
   SET title_i18n       = EXCLUDED.title_i18n,
       description_i18n = EXCLUDED.description_i18n,
       icon             = EXCLUDED.icon,
       sort_order       = EXCLUDED.sort_order,
       updated_at       = now();

-- ترقية الدروس التأسيسية القائمة وربطها بالمسارات وإزالة الروابط الوهمية القديمة
UPDATE sawyan.academy_courses ac
   SET track_id = (SELECT id FROM sawyan.academy_tracks WHERE slug = 'track-onboarding' LIMIT 1),
       media_type = 'video',
       duration_minutes = COALESCE(ac.duration_minutes, 5),
       is_mandatory = true,
       approval_status = 'approved',
       media_url = CASE
           WHEN lower(COALESCE(ac.media_url, '')) LIKE '%/academy/welcome%'
             OR lower(COALESCE(ac.media_url, '')) LIKE '%/academy/leaders%'
             OR lower(COALESCE(ac.media_url, '')) LIKE '%/academy/kyc-payouts%'
           THEN NULL
           ELSE ac.media_url
       END,
       content_i18n = jsonb_build_object(
           'ar', 'مرحباً بك في منظومة SAWYAN للاستهلاك الاستثماري (Buy and Make Money). لا توجد أي رسوم تسجيل أو اشتراكات شهرية؛ مشترياتك اليومية المعتادة من التجار المعتمدين بالأسعار الطبيعية للسوق تتحول جزءاً من عمولة التاجر فيها (75% خطة دخل / 25% خزانة) إلى رصيد داخل صندوق هدفك الشهري. في هذه المادة نشرح كيف تبدأ حسابك وتوثق أول فاتورة بكود هويتك خلال ثوانٍ.',
           'en', 'Welcome to the SAWYAN investment-consumption ecosystem (Buy and Make Money). Membership is 100% free with zero recurring fees. Your everyday retail purchases at contracted merchants feed 75% of merchant marketing commission into your Monthly Target Box.'
       ),
       updated_at = now()
 WHERE ac.slug = 'sawyan-welcome-constitution';

UPDATE sawyan.academy_courses ac
   SET track_id = (SELECT id FROM sawyan.academy_tracks WHERE slug = 'track-leadership' LIMIT 1),
       media_type = 'video',
       duration_minutes = COALESCE(ac.duration_minutes, 8),
       approval_status = 'approved',
       media_url = CASE
           WHEN lower(COALESCE(ac.media_url, '')) LIKE '%/academy/leaders%' THEN NULL
           ELSE ac.media_url
       END,
       sort_order = 1,
       updated_at = now()
 WHERE ac.slug = 'leader-10-generations-guide';

UPDATE sawyan.academy_courses ac
   SET track_id = (SELECT id FROM sawyan.academy_tracks WHERE slug = 'track-leadership' LIMIT 1),
       media_type = 'article',
       duration_minutes = COALESCE(ac.duration_minutes, 4),
       approval_status = 'approved',
       media_url = CASE
           WHEN lower(COALESCE(ac.media_url, '')) LIKE '%/academy/kyc-payouts%' THEN NULL
           ELSE ac.media_url
       END,
       sort_order = 2,
       updated_at = now()
 WHERE ac.slug = 'kyc-and-safe-withdrawals';

INSERT INTO sawyan.academy_courses (
    slug, track_id, title_i18n, content_i18n, media_type, media_url,
    duration_minutes, sort_order, scope_type, author_type, approval_status,
    is_published, is_mandatory, allow_comments
)
VALUES (
    'income-plan-2475-explained',
    (SELECT id FROM sawyan.academy_tracks WHERE slug = 'track-income-plan' LIMIT 1),
    '{"ar":"١. شرح صندوق الهدف الشهري ($24.75) والترحيل المستمر (Carry On)","en":"1. Understanding the $24.75 Target Box & Carry On"}'::jsonb,
    '{"ar":"كل فاتورة شراء معتمدة تغذي صندوق هدفك الشهري بالعملة المحلية (بمعادلة $24.75 × سعر الصرف الإداري). إذا لم يكتمل الهدف خلال الشهر، لا يضيع رصيدك أبداً بل يُرحّل تلقائياً عبر عملية Carry On للشهر التالي دون حد زمني. وعند اكتمال الهدف، تتوزع الـ $24.75 بالتساوي على 11 حصة ($2.25 للحصة: الصانع + 10 آباء مؤهلين صعوداً عبر الـ Roll-up)، وتخضع العمولات لمهلة مراجعة 14 يوماً ثم تُتاح للسحب يوم 15 من الشهر التالي.","en":"Approved purchases feed your local Monthly Target Box ($24.75 reference). Unconsumed balances roll over indefinitely via Carry On. Qualified boxes distribute across 11 eligible shares ($2.25 each) up the tree via Bottom-Up Roll-up and settle on Day 15."}'::jsonb,
    'article',
    NULL,
    6,
    1,
    'global',
    'company_admin',
    'approved',
    true,
    true,
    true
)
ON CONFLICT (slug) DO NOTHING;

-- ربط الدرس الثاني في مسار القيادة بتسلسل اختياري واضح عبر prerequisite_course_id إن وُجد الدرس الأول
UPDATE sawyan.academy_courses child
   SET prerequisite_course_id = (
       SELECT p.id FROM sawyan.academy_courses p WHERE p.slug = 'leader-10-generations-guide' LIMIT 1
   )
 WHERE child.slug = 'kyc-and-safe-withdrawals'
   AND child.prerequisite_course_id IS NULL
   AND EXISTS (SELECT 1 FROM sawyan.academy_courses p WHERE p.slug = 'leader-10-generations-guide');

-- 8. تحديث دالة حزمة العضو (get_member_dashboard_bundle) لضمان فلترة الدروس المعتمدة في الشاشة الرئيسية فقط
CREATE OR REPLACE FUNCTION sawyan.filter_academy_url_is_safe(p_url TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_trimmed TEXT;
BEGIN
    v_trimmed := trim(COALESCE(p_url, ''));
    IF v_trimmed = '' THEN
        RETURN true;
    END IF;
    RETURN (v_trimmed !~ '\s') AND (v_trimmed ~* '^https://[a-z0-9.-]+(:[0-9]{1,5})?(/.*)?$');
END;
$$;

-- 9. دالة إدارة الأكاديمية الشاملة للإدارة (sawyan.admin_manage_academy_lms)
CREATE OR REPLACE FUNCTION sawyan.admin_manage_academy_lms(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_entity        VARCHAR DEFAULT 'lesson', -- 'lesson' | 'track' | 'comment'
    p_action        VARCHAR DEFAULT 'list',   -- 'list' | 'upsert' | 'toggle_publish' | 'reorder' | 'delete' | 'approve' | 'reject'
    p_payload       JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm           JSONB;
    v_ent           VARCHAR(20);
    v_act           VARCHAR(20);
    v_id            UUID;
    v_track_id      UUID;
    v_prereq_id     UUID;
    v_slug          VARCHAR(100);
    v_media_url     TEXT;
    v_thumb_url     TEXT;
    v_media_type    VARCHAR(20);
    v_scope_type    VARCHAR(20);
    v_country_code  CHAR(2);
    v_expected_ver  INTEGER;
    v_cur_ver       INTEGER;
    v_cur_sort      INTEGER;
    v_cur_track     UUID;
    v_swap_id       UUID;
    v_swap_sort     INTEGER;
    v_reason        TEXT;
    v_title_ar      TEXT;
    v_tracks        JSONB;
    v_lessons       JSONB;
    v_pending       JSONB;
    v_stats         JSONB;
    v_audit_rec     TEXT := '';
BEGIN
    v_ent := lower(trim(COALESCE(p_entity, 'lesson')));
    v_act := lower(trim(COALESCE(p_action, 'list')));

    IF v_act = 'list' THEN
        v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    ELSE
        v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'data_entry', 'support'], true);
    END IF;

    -- أ) إدارة المسارات التدريبية
    IF v_ent = 'track' THEN
        IF v_act = 'upsert' THEN
            v_id := NULLIF(trim(COALESCE(p_payload->>'id', '')), '')::uuid;
            v_title_ar := trim(COALESCE(p_payload->>'title_ar', ''));
            IF v_title_ar = '' THEN
                RAISE EXCEPTION 'TRACK_TITLE_REQUIRED';
            END IF;
            v_slug := lower(regexp_replace(
                COALESCE(NULLIF(trim(p_payload->>'slug'), ''), 'track-' || substr(md5(clock_timestamp()::text || v_title_ar), 1, 6)),
                '[^a-z0-9\-]+', '-', 'g'
            ));

            IF v_id IS NOT NULL THEN
                SELECT version INTO v_cur_ver FROM sawyan.academy_tracks WHERE id = v_id FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'ACADEMY_TRACK_NOT_FOUND';
                END IF;
                v_expected_ver := NULLIF(p_payload->>'expected_version', '')::integer;
                IF v_expected_ver IS NOT NULL AND v_cur_ver <> v_expected_ver THEN
                    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: Track was modified by another admin.';
                END IF;

                UPDATE sawyan.academy_tracks
                   SET title_i18n       = jsonb_build_object('ar', v_title_ar, 'en', COALESCE(NULLIF(trim(p_payload->>'title_en'), ''), v_title_ar)),
                       description_i18n = jsonb_build_object('ar', COALESCE(trim(p_payload->>'description_ar'), ''), 'en', COALESCE(trim(p_payload->>'description_en'), '')),
                       icon             = COALESCE(NULLIF(trim(p_payload->>'icon'), ''), icon),
                       audience         = COALESCE(NULLIF(trim(p_payload->>'audience'), ''), audience),
                       sort_order       = COALESCE(NULLIF(p_payload->>'sort_order', '')::integer, sort_order),
                       is_sequential    = COALESCE((p_payload->>'is_sequential')::boolean, is_sequential),
                       is_published     = COALESCE((p_payload->>'is_published')::boolean, is_published),
                       version          = version + 1,
                       updated_at       = now()
                 WHERE id = v_id;
                v_audit_rec := v_id::text;
            ELSE
                INSERT INTO sawyan.academy_tracks (
                    slug, title_i18n, description_i18n, icon, audience,
                    scope_type, sort_order, is_sequential, is_published
                ) VALUES (
                    v_slug,
                    jsonb_build_object('ar', v_title_ar, 'en', COALESCE(NULLIF(trim(p_payload->>'title_en'), ''), v_title_ar)),
                    jsonb_build_object('ar', COALESCE(trim(p_payload->>'description_ar'), ''), 'en', COALESCE(trim(p_payload->>'description_en'), '')),
                    COALESCE(NULLIF(trim(p_payload->>'icon'), ''), '🎓'),
                    COALESCE(NULLIF(trim(p_payload->>'audience'), ''), 'all'),
                    'global',
                    COALESCE(NULLIF(p_payload->>'sort_order', '')::integer, 10),
                    COALESCE((p_payload->>'is_sequential')::boolean, true),
                    COALESCE((p_payload->>'is_published')::boolean, true)
                )
                ON CONFLICT (slug) DO UPDATE
                   SET title_i18n       = EXCLUDED.title_i18n,
                       description_i18n = EXCLUDED.description_i18n,
                       icon             = EXCLUDED.icon,
                       audience         = EXCLUDED.audience,
                       sort_order       = EXCLUDED.sort_order,
                       is_sequential    = EXCLUDED.is_sequential,
                       is_published     = EXCLUDED.is_published,
                       version          = sawyan.academy_tracks.version + 1,
                       updated_at       = now()
                RETURNING id INTO v_id;
                v_audit_rec := v_id::text;
            END IF;
        ELSIF v_act = 'toggle_publish' THEN
            v_id := (p_payload->>'id')::uuid;
            UPDATE sawyan.academy_tracks
               SET is_published = NOT is_published, version = version + 1, updated_at = now()
             WHERE id = v_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_TRACK_NOT_FOUND'; END IF;
            v_audit_rec := v_id::text;
        ELSIF v_act = 'delete' THEN
            v_id := (p_payload->>'id')::uuid;
            IF EXISTS (SELECT 1 FROM sawyan.academy_courses WHERE track_id = v_id) THEN
                RAISE EXCEPTION 'TRACK_HAS_LESSONS: Move or delete lessons before deleting this track.';
            END IF;
            DELETE FROM sawyan.academy_tracks WHERE id = v_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_TRACK_NOT_FOUND'; END IF;
            v_audit_rec := v_id::text;
        END IF;

    -- ب) إدارة المواد التدريبية المتسلسلة (شامل مراجعة مواد القادة)
    ELSIF v_ent = 'lesson' THEN
        IF v_act = 'upsert' THEN
            v_id := NULLIF(trim(COALESCE(p_payload->>'id', '')), '')::uuid;
            v_title_ar := trim(COALESCE(p_payload->>'title_ar', ''));
            IF v_title_ar = '' THEN
                RAISE EXCEPTION 'LESSON_TITLE_REQUIRED';
            END IF;

            v_media_url := NULLIF(trim(COALESCE(p_payload->>'media_url', '')), '');
            v_thumb_url := NULLIF(trim(COALESCE(p_payload->>'thumbnail_url', '')), '');
            IF NOT sawyan.filter_academy_url_is_safe(v_media_url) OR NOT sawyan.filter_academy_url_is_safe(v_thumb_url) THEN
                RAISE EXCEPTION 'INVALID_MEDIA_URL_HTTPS_REQUIRED: External media links must begin with https://';
            END IF;

            v_track_id := NULLIF(trim(COALESCE(p_payload->>'track_id', '')), '')::uuid;
            v_prereq_id := NULLIF(trim(COALESCE(p_payload->>'prerequisite_course_id', '')), '')::uuid;
            IF v_id IS NOT NULL AND v_prereq_id = v_id THEN
                RAISE EXCEPTION 'INVALID_SELF_PREREQUISITE';
            END IF;

            v_media_type := lower(trim(COALESCE(NULLIF(p_payload->>'media_type', ''), 'video')));
            v_scope_type := lower(trim(COALESCE(NULLIF(p_payload->>'scope_type', ''), 'global')));
            IF v_scope_type NOT IN ('global', 'country') THEN
                v_scope_type := 'global';
            END IF;
            v_country_code := CASE WHEN v_scope_type = 'country' THEN NULLIF(upper(trim(COALESCE(p_payload->>'target_country_code', ''))), '')::char(2) ELSE NULL END;

            v_slug := lower(regexp_replace(
                COALESCE(NULLIF(trim(p_payload->>'slug'), ''), 'lesson-' || substr(md5(clock_timestamp()::text || v_title_ar), 1, 7)),
                '[^a-z0-9\-]+', '-', 'g'
            ));

            IF v_id IS NOT NULL THEN
                SELECT version INTO v_cur_ver FROM sawyan.academy_courses WHERE id = v_id FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'ACADEMY_LESSON_NOT_FOUND';
                END IF;
                v_expected_ver := NULLIF(p_payload->>'expected_version', '')::integer;
                IF v_expected_ver IS NOT NULL AND v_cur_ver <> v_expected_ver THEN
                    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: Lesson was modified by another admin.';
                END IF;

                UPDATE sawyan.academy_courses
                   SET track_id               = v_track_id,
                       title_i18n             = jsonb_build_object('ar', v_title_ar, 'en', COALESCE(NULLIF(trim(p_payload->>'title_en'), ''), v_title_ar)),
                       content_i18n           = jsonb_build_object('ar', COALESCE(trim(p_payload->>'content_ar'), ''), 'en', COALESCE(trim(p_payload->>'content_en'), '')),
                       media_type             = v_media_type,
                       media_url              = v_media_url,
                       thumbnail_url          = v_thumb_url,
                       duration_minutes       = NULLIF(p_payload->>'duration_minutes', '')::smallint,
                       sort_order             = COALESCE(NULLIF(p_payload->>'sort_order', '')::integer, sort_order),
                       prerequisite_course_id = v_prereq_id,
                       scope_type             = CASE WHEN author_type = 'tree_leader' THEN scope_type ELSE v_scope_type END,
                       target_country_code    = CASE WHEN author_type = 'tree_leader' THEN target_country_code ELSE v_country_code END,
                       is_published           = COALESCE((p_payload->>'is_published')::boolean, is_published),
                       is_mandatory           = COALESCE((p_payload->>'is_mandatory')::boolean, is_mandatory),
                       allow_comments         = COALESCE((p_payload->>'allow_comments')::boolean, allow_comments),
                       has_quiz               = COALESCE((p_payload->>'has_quiz')::boolean, has_quiz),
                       pass_score_pct         = COALESCE(NULLIF(p_payload->>'pass_score_pct', '')::smallint, pass_score_pct),
                       quiz_schema            = COALESCE(p_payload->'quiz_schema', quiz_schema),
                       version                = version + 1,
                       updated_at             = now()
                 WHERE id = v_id;
                v_audit_rec := v_id::text;
            ELSE
                INSERT INTO sawyan.academy_courses (
                    slug, track_id, title_i18n, content_i18n, media_type, media_url, thumbnail_url,
                    duration_minutes, sort_order, prerequisite_course_id, scope_type, target_country_code,
                    author_type, author_admin_id, approval_status, approved_by_admin_id, approved_at,
                    is_published, is_mandatory, allow_comments, has_quiz, pass_score_pct, quiz_schema
                ) VALUES (
                    v_slug,
                    v_track_id,
                    jsonb_build_object('ar', v_title_ar, 'en', COALESCE(NULLIF(trim(p_payload->>'title_en'), ''), v_title_ar)),
                    jsonb_build_object('ar', COALESCE(trim(p_payload->>'content_ar'), ''), 'en', COALESCE(trim(p_payload->>'content_en'), '')),
                    v_media_type,
                    v_media_url,
                    v_thumb_url,
                    NULLIF(p_payload->>'duration_minutes', '')::smallint,
                    COALESCE(NULLIF(p_payload->>'sort_order', '')::integer, 10),
                    v_prereq_id,
                    v_scope_type,
                    v_country_code,
                    'company_admin',
                    p_admin_id,
                    'approved',
                    p_admin_id,
                    now(),
                    COALESCE((p_payload->>'is_published')::boolean, true),
                    COALESCE((p_payload->>'is_mandatory')::boolean, false),
                    COALESCE((p_payload->>'allow_comments')::boolean, true),
                    COALESCE((p_payload->>'has_quiz')::boolean, false),
                    COALESCE(NULLIF(p_payload->>'pass_score_pct', '')::smallint, 70),
                    COALESCE(p_payload->'quiz_schema', '[]'::jsonb)
                )
                RETURNING id INTO v_id;
                v_audit_rec := v_id::text;
            END IF;

        ELSIF v_act = 'toggle_publish' THEN
            v_id := (p_payload->>'id')::uuid;
            UPDATE sawyan.academy_courses
               SET is_published = NOT is_published, version = version + 1, updated_at = now()
             WHERE id = v_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_LESSON_NOT_FOUND'; END IF;
            v_audit_rec := v_id::text;

        ELSIF v_act = 'reorder' THEN
            v_id := (p_payload->>'id')::uuid;
            SELECT sort_order, track_id INTO v_cur_sort, v_cur_track FROM sawyan.academy_courses WHERE id = v_id FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_LESSON_NOT_FOUND'; END IF;

            IF NULLIF(p_payload->>'sort_order', '') IS NOT NULL THEN
                UPDATE sawyan.academy_courses
                   SET sort_order = (p_payload->>'sort_order')::integer, version = version + 1, updated_at = now()
                 WHERE id = v_id;
            ELSIF lower(COALESCE(p_payload->>'direction', '')) = 'up' THEN
                SELECT id, sort_order INTO v_swap_id, v_swap_sort
                  FROM sawyan.academy_courses
                 WHERE track_id IS NOT DISTINCT FROM v_cur_track
                   AND (sort_order < v_cur_sort OR (sort_order = v_cur_sort AND id < v_id))
                 ORDER BY sort_order DESC, id DESC
                 LIMIT 1
                 FOR UPDATE;
                IF v_swap_id IS NOT NULL THEN
                    UPDATE sawyan.academy_courses SET sort_order = CASE WHEN v_swap_sort = v_cur_sort THEN v_cur_sort - 1 ELSE v_swap_sort END, version = version + 1, updated_at = now() WHERE id = v_id;
                    UPDATE sawyan.academy_courses SET sort_order = v_cur_sort, version = version + 1, updated_at = now() WHERE id = v_swap_id;
                ELSE
                    UPDATE sawyan.academy_courses SET sort_order = GREATEST(1, v_cur_sort - 1), version = version + 1, updated_at = now() WHERE id = v_id;
                END IF;
            ELSIF lower(COALESCE(p_payload->>'direction', '')) = 'down' THEN
                SELECT id, sort_order INTO v_swap_id, v_swap_sort
                  FROM sawyan.academy_courses
                 WHERE track_id IS NOT DISTINCT FROM v_cur_track
                   AND (sort_order > v_cur_sort OR (sort_order = v_cur_sort AND id > v_id))
                 ORDER BY sort_order ASC, id ASC
                 LIMIT 1
                 FOR UPDATE;
                IF v_swap_id IS NOT NULL THEN
                    UPDATE sawyan.academy_courses SET sort_order = CASE WHEN v_swap_sort = v_cur_sort THEN v_cur_sort + 1 ELSE v_swap_sort END, version = version + 1, updated_at = now() WHERE id = v_id;
                    UPDATE sawyan.academy_courses SET sort_order = v_cur_sort, version = version + 1, updated_at = now() WHERE id = v_swap_id;
                ELSE
                    UPDATE sawyan.academy_courses SET sort_order = v_cur_sort + 1, version = version + 1, updated_at = now() WHERE id = v_id;
                END IF;
            END IF;
            v_audit_rec := v_id::text;

        ELSIF v_act = 'approve' THEN
            v_id := (p_payload->>'id')::uuid;
            UPDATE sawyan.academy_courses
               SET approval_status      = 'approved',
                   approved_by_admin_id = p_admin_id,
                   approved_at          = now(),
                   rejection_reason     = NULL,
                   is_published         = true,
                   version              = version + 1,
                   updated_at           = now()
             WHERE id = v_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_LESSON_NOT_FOUND'; END IF;
            v_audit_rec := v_id::text;

        ELSIF v_act = 'reject' THEN
            v_id := (p_payload->>'id')::uuid;
            v_reason := trim(COALESCE(p_payload->>'reason', ''));
            IF v_reason = '' THEN
                RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
            END IF;
            UPDATE sawyan.academy_courses
               SET approval_status      = 'rejected',
                   approved_by_admin_id = p_admin_id,
                   approved_at          = now(),
                   rejection_reason     = v_reason,
                   is_published         = false,
                   version              = version + 1,
                   updated_at           = now()
             WHERE id = v_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_LESSON_NOT_FOUND'; END IF;
            v_audit_rec := v_id::text;

        ELSIF v_act = 'delete' THEN
            v_id := (p_payload->>'id')::uuid;
            UPDATE sawyan.academy_courses SET prerequisite_course_id = NULL WHERE prerequisite_course_id = v_id;
            DELETE FROM sawyan.academy_courses WHERE id = v_id;
            IF NOT FOUND THEN RAISE EXCEPTION 'ACADEMY_LESSON_NOT_FOUND'; END IF;
            v_audit_rec := v_id::text;
        END IF;
    END IF;

    IF v_act <> 'list' THEN
        PERFORM sawyan.append_audit_log(
            'admin',
            p_admin_id,
            'ACADEMY_' || upper(v_ent) || '_' || upper(v_act),
            'academy_' || v_ent,
            COALESCE(NULLIF(v_audit_rec, ''), 'batch'),
            NULL,
            p_payload
        );
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'title_i18n', t.title_i18n,
        'description_i18n', t.description_i18n,
        'icon', t.icon,
        'audience', t.audience,
        'scope_type', t.scope_type,
        'target_country_code', t.target_country_code,
        'sort_order', t.sort_order,
        'is_sequential', t.is_sequential,
        'is_published', t.is_published,
        'version', t.version,
        'lessons_count', (SELECT COUNT(*) FROM sawyan.academy_courses c WHERE c.track_id = t.id)
    ) ORDER BY t.sort_order ASC, t.created_at ASC), '[]'::jsonb)
      INTO v_tracks
      FROM sawyan.academy_tracks t;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'track_id', c.track_id,
        'track_title_ar', tr.title_i18n->>'ar',
        'track_icon', tr.icon,
        'title_i18n', c.title_i18n,
        'content_i18n', c.content_i18n,
        'media_type', c.media_type,
        'media_url', c.media_url,
        'thumbnail_url', c.thumbnail_url,
        'duration_minutes', c.duration_minutes,
        'sort_order', c.sort_order,
        'prerequisite_course_id', c.prerequisite_course_id,
        'scope_type', c.scope_type,
        'target_country_code', c.target_country_code,
        'author_type', c.author_type,
        'author_member_id', c.author_member_id,
        'author_name', COALESCE(m.full_name, a.full_name, 'إدارة المنصة'),
        'approval_status', c.approval_status,
        'rejection_reason', c.rejection_reason,
        'is_published', c.is_published,
        'is_mandatory', c.is_mandatory,
        'allow_comments', c.allow_comments,
        'has_quiz', c.has_quiz,
        'pass_score_pct', c.pass_score_pct,
        'version', c.version,
        'completions_count', (SELECT COUNT(*) FROM sawyan.academy_member_progress p WHERE p.course_id = c.id AND p.status IN ('completed', 'passed')),
        'comments_count', (SELECT COUNT(*) FROM sawyan.academy_lesson_comments cm WHERE cm.course_id = c.id AND cm.moderation_status = 'visible'),
        'updated_at', c.updated_at
    ) ORDER BY COALESCE(tr.sort_order, 999) ASC, c.sort_order ASC, c.created_at ASC), '[]'::jsonb)
      INTO v_lessons
      FROM sawyan.academy_courses c
      LEFT JOIN sawyan.academy_tracks tr ON tr.id = c.track_id
      LEFT JOIN sawyan.members m ON m.id = c.author_member_id
      LEFT JOIN sawyan.admins a ON a.id = c.author_admin_id;

    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
      INTO v_pending
      FROM jsonb_array_elements(v_lessons) item
     WHERE item->>'approval_status' = 'pending_admin_approval';

    v_stats := jsonb_build_object(
        'tracks_total', jsonb_array_length(v_tracks),
        'lessons_total', jsonb_array_length(v_lessons),
        'lessons_published', (SELECT COUNT(*) FROM sawyan.academy_courses WHERE is_published = true AND approval_status = 'approved'),
        'pending_leader_reviews', (SELECT COUNT(*) FROM sawyan.academy_courses WHERE approval_status = 'pending_admin_approval'),
        'total_completions', (SELECT COUNT(*) FROM sawyan.academy_member_progress WHERE status IN ('completed', 'passed')),
        'total_comments', (SELECT COUNT(*) FROM sawyan.academy_lesson_comments WHERE moderation_status = 'visible')
    );

    RETURN jsonb_build_object(
        'tracks', v_tracks,
        'lessons', v_lessons,
        'pending_leader_submissions', v_pending,
        'stats', v_stats
    );
END;
$$;

-- 10. دالة قراءة منهج الأكاديمية المتسلسل للعضو (مع فتح الدروس وتصفية فريق القائد عبر tree_closure)
CREATE OR REPLACE FUNCTION sawyan.get_member_academy_catalog(
    p_member_id     UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member       sawyan.members%ROWTYPE;
    v_country_code CHAR(2);
    v_tracks       JSONB;
    v_lessons      JSONB;
    v_total        INT := 0;
    v_completed    INT := 0;
    v_pct          INT := 0;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);

    SELECT c.country_code INTO v_country_code
      FROM sawyan.countries c
     WHERE c.id = v_member.residency_country_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'slug', t.slug,
        'title_i18n', t.title_i18n,
        'description_i18n', t.description_i18n,
        'icon', t.icon,
        'audience', t.audience,
        'scope_type', t.scope_type,
        'sort_order', t.sort_order,
        'is_sequential', t.is_sequential
    ) ORDER BY t.sort_order ASC, t.created_at ASC), '[]'::jsonb)
      INTO v_tracks
      FROM sawyan.academy_tracks t
     WHERE t.is_published = true
       AND (
           t.scope_type = 'global'
           OR (t.scope_type = 'country' AND upper(t.target_country_code) = upper(v_country_code))
           OR (
               t.scope_type = 'team_subtree'
               AND t.owner_member_id IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM sawyan.tree_closure tc
                    WHERE tc.ancestor_id = t.owner_member_id
                      AND tc.descendant_id = v_member.id
               )
           )
       );

    WITH visible_lessons AS (
        SELECT c.*,
               tr.sort_order AS track_sort_order,
               tr.title_i18n AS track_title_i18n,
               tr.icon AS track_icon,
               COALESCE(pr.status, 'not_started') AS member_status,
               COALESCE(pr.progress_pct, 0) AS member_progress_pct,
               pr.completed_at AS member_completed_at,
               (COALESCE(pr.status, '') IN ('completed', 'passed')) AS is_completed,
               (
                   c.prerequisite_course_id IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1 FROM sawyan.academy_member_progress ppre
                        WHERE ppre.member_id = v_member.id
                          AND ppre.course_id = c.prerequisite_course_id
                          AND ppre.status IN ('completed', 'passed')
                   )
               ) AS is_locked,
               CASE
                   WHEN c.author_type = 'tree_leader' THEN COALESCE(lm.full_name, 'قائد الفريق')
                   ELSE 'الأكاديمية الرسمية'
               END AS author_display_name,
               (
                   SELECT COUNT(*) FROM sawyan.academy_lesson_comments cm
                    WHERE cm.course_id = c.id AND cm.moderation_status = 'visible'
               ) AS comments_count
          FROM sawyan.academy_courses c
          LEFT JOIN sawyan.academy_tracks tr ON tr.id = c.track_id
          LEFT JOIN sawyan.academy_member_progress pr ON pr.course_id = c.id AND pr.member_id = v_member.id
          LEFT JOIN sawyan.members lm ON lm.id = c.author_member_id
         WHERE c.is_published = true
           AND c.approval_status = 'approved'
           AND (tr.id IS NULL OR tr.is_published = true)
           AND (
               c.scope_type = 'global'
               OR (c.scope_type = 'country' AND upper(c.target_country_code) = upper(v_country_code))
               OR (
                   c.scope_type = 'team_subtree'
                   AND c.author_member_id IS NOT NULL
                   AND EXISTS (
                       SELECT 1 FROM sawyan.tree_closure tc
                        WHERE tc.ancestor_id = c.author_member_id
                          AND tc.descendant_id = v_member.id
                   )
               )
           )
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', vl.id,
        'slug', vl.slug,
        'track_id', vl.track_id,
        'track_title_i18n', vl.track_title_i18n,
        'track_icon', vl.track_icon,
        'title_i18n', vl.title_i18n,
        'content_i18n', vl.content_i18n,
        'media_type', vl.media_type,
        'media_url', vl.media_url,
        'thumbnail_url', vl.thumbnail_url,
        'duration_minutes', vl.duration_minutes,
        'sort_order', vl.sort_order,
        'prerequisite_course_id', vl.prerequisite_course_id,
        'scope_type', vl.scope_type,
        'author_type', vl.author_type,
        'author_name', vl.author_display_name,
        'is_mandatory', vl.is_mandatory,
        'allow_comments', vl.allow_comments,
        'has_quiz', vl.has_quiz,
        'pass_score_pct', vl.pass_score_pct,
        'member_status', vl.member_status,
        'member_progress_pct', vl.member_progress_pct,
        'member_completed_at', vl.member_completed_at,
        'is_completed', vl.is_completed,
        'is_locked', vl.is_locked,
        'comments_count', vl.comments_count
    ) ORDER BY COALESCE(vl.track_sort_order, 999) ASC, vl.sort_order ASC, vl.created_at ASC), '[]'::jsonb),
           COUNT(*),
           COUNT(*) FILTER (WHERE vl.is_completed)
      INTO v_lessons, v_total, v_completed
      FROM visible_lessons vl;

    v_pct := CASE WHEN v_total > 0 THEN ROUND((v_completed::numeric / v_total::numeric) * 100)::integer ELSE 0 END;

    RETURN jsonb_build_object(
        'tracks', v_tracks,
        'lessons', v_lessons,
        'summary', jsonb_build_object(
            'total_lessons', v_total,
            'completed_lessons', v_completed,
            'completion_pct', v_pct
        )
    );
END;
$$;

-- 11. دالة تسجيل إتمام المادة التدريبية للعضو مع التحقق من تسلسل المتطلب السابق
CREATE OR REPLACE FUNCTION sawyan.member_update_academy_progress(
    p_member_id     UUID,
    p_session_token TEXT,
    p_course_id     UUID,
    p_action        VARCHAR DEFAULT 'complete' -- 'complete' | 'reset'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member       sawyan.members%ROWTYPE;
    v_lesson       sawyan.academy_courses%ROWTYPE;
    v_country_code CHAR(2);
    v_act          VARCHAR(20);
    v_status       VARCHAR(20);
    v_catalog      JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    v_act := lower(trim(COALESCE(p_action, 'complete')));

    SELECT c.country_code INTO v_country_code
      FROM sawyan.countries c
     WHERE c.id = v_member.residency_country_id;

    SELECT * INTO v_lesson
      FROM sawyan.academy_courses ac
     WHERE ac.id = p_course_id;

    IF NOT FOUND
       OR v_lesson.is_published IS NOT TRUE
       OR v_lesson.approval_status <> 'approved'
       OR NOT (
           v_lesson.scope_type = 'global'
           OR (v_lesson.scope_type = 'country' AND upper(v_lesson.target_country_code) = upper(v_country_code))
           OR (
               v_lesson.scope_type = 'team_subtree'
               AND v_lesson.author_member_id IS NOT NULL
               AND EXISTS (
                   SELECT 1 FROM sawyan.tree_closure tc
                    WHERE tc.ancestor_id = v_lesson.author_member_id
                      AND tc.descendant_id = v_member.id
               )
           )
       ) THEN
        RAISE EXCEPTION 'ACADEMY_LESSON_NOT_ACCESSIBLE';
    END IF;

    IF v_act = 'complete' THEN
        IF v_lesson.prerequisite_course_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM sawyan.academy_member_progress ppre
             WHERE ppre.member_id = v_member.id
               AND ppre.course_id = v_lesson.prerequisite_course_id
               AND ppre.status IN ('completed', 'passed')
        ) THEN
            RAISE EXCEPTION 'PREREQUISITE_LESSON_INCOMPLETE: Complete the prerequisite lesson first.';
        END IF;

        INSERT INTO sawyan.academy_member_progress (
            member_id, course_id, status, progress_pct, completed_at, updated_at
        ) VALUES (
            v_member.id, v_lesson.id, 'completed', 100, now(), now()
        )
        ON CONFLICT (member_id, course_id) DO UPDATE
           SET status       = CASE WHEN sawyan.academy_member_progress.status = 'passed' THEN 'passed' ELSE 'completed' END,
               progress_pct = 100,
               completed_at = COALESCE(sawyan.academy_member_progress.completed_at, now()),
               updated_at   = now();
        v_status := 'completed';
    ELSIF v_act = 'reset' THEN
        INSERT INTO sawyan.academy_member_progress (
            member_id, course_id, status, progress_pct, completed_at, updated_at
        ) VALUES (
            v_member.id, v_lesson.id, 'in_progress', 0, NULL, now()
        )
        ON CONFLICT (member_id, course_id) DO UPDATE
           SET status       = 'in_progress',
               progress_pct = 0,
               completed_at = NULL,
               updated_at   = now();
        v_status := 'in_progress';
    ELSE
        RAISE EXCEPTION 'INVALID_PROGRESS_ACTION';
    END IF;

    v_catalog := sawyan.get_member_academy_catalog(v_member.id, p_session_token);

    RETURN jsonb_build_object(
        'success', true,
        'course_id', v_lesson.id,
        'status', v_status,
        'summary', v_catalog->'summary'
    );
END;
$$;

-- 12. قفل الصلاحيات الأقل على الدوال الجديدة
REVOKE ALL ON FUNCTION sawyan.filter_academy_url_is_safe(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_academy_lms(UUID, TEXT, VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_member_academy_catalog(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.member_update_academy_progress(UUID, TEXT, UUID, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.admin_manage_academy_lms(UUID, TEXT, VARCHAR, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_member_academy_catalog(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.member_update_academy_progress(UUID, TEXT, UUID, VARCHAR) TO anon, authenticated, service_role;
