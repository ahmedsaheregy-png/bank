-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 STAGE 10: MERCHANT 3-AXIS LIFECYCLE, LIVE RISK SETTINGS,
-- MEMBER MERCHANTS COMPLAINTS, D4 INSTANT CUTOFF LOCK & TERMINOLOGY CLEANUP
-- ============================================================================
-- Strictly Idempotent (Expand & Contract). Safe to re-run on BOTH `sawyan` & `sawyan_demo`.
-- ZERO bare lowercase `sawyan` inside string literals for clean regex cloning.
-- ============================================================================

-- 1. ترقية جدول التجار بأعمدة المحاور الثلاثة واستثناءات المخاطر وبدء التأخر (Guarded One-Time Backfill)
DO $$
DECLARE
    v_had_col BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
          FROM pg_attribute
         WHERE attrelid = 'sawyan.merchants'::regclass
           AND attname  = 'onboarding_status'
           AND NOT attisdropped
    ) INTO v_had_col;

    ALTER TABLE sawyan.merchants
        ADD COLUMN IF NOT EXISTS onboarding_status             VARCHAR(30) NOT NULL DEFAULT 'approved',
        ADD COLUMN IF NOT EXISTS onboarding_notes              TEXT,
        ADD COLUMN IF NOT EXISTS governance_status             VARCHAR(30) NOT NULL DEFAULT 'good_standing',
        ADD COLUMN IF NOT EXISTS pre_pause_governance_status   VARCHAR(30),
        ADD COLUMN IF NOT EXISTS governance_reason             TEXT,
        ADD COLUMN IF NOT EXISTS governance_updated_at         TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS unsecured_queue_cap_override  SMALLINT,
        ADD COLUMN IF NOT EXISTS isolate_pct_override          NUMERIC(5,2),
        ADD COLUMN IF NOT EXISTS overdue_since_at              TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS d4_cycle_days_override        SMALLINT,
        ADD COLUMN IF NOT EXISTS d4_grace_hours_override       NUMERIC(5,2);

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_onboarding_status_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_onboarding_status_v3
            CHECK (onboarding_status IN ('draft_incomplete', 'needs_correction', 'approved', 'rejected'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_governance_status_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_governance_status_v3
            CHECK (governance_status IN (
                'good_standing', 'probation_warning', 'restricted_no_reject',
                'paused_by_merchant', 'paused_by_admin', 'suspended_compliance', 'banned_permanent'
            ));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_pre_pause_gov_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_pre_pause_gov_v3
            CHECK (pre_pause_governance_status IS NULL OR pre_pause_governance_status IN ('good_standing', 'probation_warning'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_queue_cap_override_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_queue_cap_override_v3
            CHECK (unsecured_queue_cap_override IS NULL OR unsecured_queue_cap_override >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_isolate_pct_override_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_isolate_pct_override_v3
            CHECK (isolate_pct_override IS NULL OR (isolate_pct_override > 0 AND isolate_pct_override < 100));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_d4_cycle_days_override_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_d4_cycle_days_override_v3
            CHECK (d4_cycle_days_override IS NULL OR (d4_cycle_days_override >= 1 AND d4_cycle_days_override <= 90));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.merchants'::regclass AND c.conname = 'chk_merch_d4_grace_hours_override_v3'
    ) THEN
        ALTER TABLE sawyan.merchants
            ADD CONSTRAINT chk_merch_d4_grace_hours_override_v3
            CHECK (d4_grace_hours_override IS NULL OR (d4_grace_hours_override >= 0 AND d4_grace_hours_override <= 168));
    END IF;

    IF NOT v_had_col THEN
        UPDATE sawyan.merchants
           SET onboarding_status = CASE
                   WHEN deduction_percent <= 0 OR COALESCE((metadata->>'commission_pending')::boolean, false)
                   THEN 'draft_incomplete'
                   ELSE 'approved'
               END,
               governance_status = CASE
                   WHEN is_active = false AND deduction_percent > 0
                   THEN 'paused_by_admin'
                   ELSE 'good_standing'
               END;
    END IF;
END $$;

-- 2. ترقية جدول الإعدادات لقبول 0 في سقف طابور النفاد + إضافة عتبات الامتثال والتصعيد الحية
DO $$
DECLARE
    v_con RECORD;
BEGIN
    FOR v_con IN
        SELECT c.conname
          FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.settings'::regclass
           AND c.contype = 'c'
           AND pg_get_constraintdef(c.oid) ILIKE '%unsecured_queue_cap%'
    LOOP
        EXECUTE format('ALTER TABLE sawyan.settings DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;

    ALTER TABLE sawyan.settings
        ADD COLUMN IF NOT EXISTS fifo_default_days               SMALLINT NOT NULL DEFAULT 14,
        ADD COLUMN IF NOT EXISTS pending_sla_hours               SMALLINT NOT NULL DEFAULT 48,
        ADD COLUMN IF NOT EXISTS warn_escalated_tx_30d           SMALLINT NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS restrict_escalated_tx_30d       SMALLINT NOT NULL DEFAULT 5,
        ADD COLUMN IF NOT EXISTS warn_lost_disputes_30d          SMALLINT NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS restrict_lost_disputes_30d      SMALLINT NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS warn_verified_complaints_30d    SMALLINT NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS restrict_verified_complaints_30d SMALLINT NOT NULL DEFAULT 3,
        ADD COLUMN IF NOT EXISTS d4_cycle_days                   SMALLINT NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS d4_cycle_cutoff_time            TIME     NOT NULL DEFAULT '23:59:00',
        ADD COLUMN IF NOT EXISTS d4_grace_hours                  NUMERIC(5,2) NOT NULL DEFAULT 2.00;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.settings'::regclass AND c.conname = 'chk_settings_unsecured_queue_cap_v3'
    ) THEN
        ALTER TABLE sawyan.settings
            ADD CONSTRAINT chk_settings_unsecured_queue_cap_v3
            CHECK (unsecured_queue_cap >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.settings'::regclass AND c.conname = 'chk_settings_compliance_thresholds_v3'
    ) THEN
        ALTER TABLE sawyan.settings
            ADD CONSTRAINT chk_settings_compliance_thresholds_v3
            CHECK (
                fifo_default_days >= 1
                AND pending_sla_hours >= 1
                AND warn_escalated_tx_30d >= 1
                AND restrict_escalated_tx_30d >= warn_escalated_tx_30d
                AND warn_lost_disputes_30d >= 1
                AND restrict_lost_disputes_30d >= warn_lost_disputes_30d
                AND warn_verified_complaints_30d >= 1
                AND restrict_verified_complaints_30d >= warn_verified_complaints_30d
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.settings'::regclass AND c.conname = 'chk_settings_d4_cycle_v3'
    ) THEN
        ALTER TABLE sawyan.settings
            ADD CONSTRAINT chk_settings_d4_cycle_v3
            CHECK (
                d4_cycle_days >= 1 AND d4_cycle_days <= 90
                AND d4_grace_hours >= 0 AND d4_grace_hours <= 168
            );
    END IF;
END $$;

-- 3. ترقية جدول الشكاوى لتصنيف شكاوى الأعضاء المباشرة ضد التجار (التهرب من التوثيق/المخالفات)
ALTER TABLE sawyan.complaints
    ADD COLUMN IF NOT EXISTS category             VARCHAR(40) NOT NULL DEFAULT 'other',
    ADD COLUMN IF NOT EXISTS evidence_url         TEXT,
    ADD COLUMN IF NOT EXISTS admin_notes          TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_by_admin_id UUID REFERENCES sawyan.admins(id),
    ADD COLUMN IF NOT EXISTS reviewed_at          TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'sawyan.complaints'::regclass AND c.conname = 'chk_complaints_category_v3'
    ) THEN
        ALTER TABLE sawyan.complaints
            ADD CONSTRAINT chk_complaints_category_v3
            CHECK (category IN ('refused_verification', 'evasion_excuse', 'hidden_fee', 'bad_conduct', 'other'));
    END IF;
END $$;

-- 4. جعل السجل التجاري وصورته اختياريين افتراضياً للتاجر مع قابلية الإلزام مستقبلاً من باني النماذج
UPDATE sawyan.registration_field_configs
   SET required_in_dashboard = false,
       updated_at            = now()
 WHERE form_type = 'merchant'
   AND field_key IN ('commercial_reg_no', 'commercial_doc_url');

CREATE OR REPLACE FUNCTION sawyan.seed_default_registration_configs(
    p_form_type   VARCHAR(24) DEFAULT NULL,
    p_force_reset BOOLEAN DEFAULT false
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_target VARCHAR(24) := NULLIF(lower(trim(COALESCE(p_form_type, ''))), '');
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _tmp_def_reg_settings (
        form_type                VARCHAR(24),
        page_title_ar            TEXT,
        page_subtitle_ar         TEXT,
        optional_divider_text_ar TEXT,
        dashboard_banner_text_ar TEXT
    ) ON COMMIT DROP;
    TRUNCATE _tmp_def_reg_settings;

    INSERT INTO _tmp_def_reg_settings VALUES
    (
        'merchant',
        'انضمام شريك تجاري جديد إلى شبكة SAWYAN',
        'استمارة تسجيل موحدة وآمنة بنظام التوطين الجغرافي، التحقق التلقائي، وتحديد العمولة بالمرونة الكاملة.',
        'بيانات إضافية لرفع ثقة العملاء (يمكنك تعبئتها الآن أو استكمالها لاحقاً من لوحة التحكم)',
        'أهلاً بك في SAWYAN! استكمل الخانات الأساسية التالية لإكمال تفعيل متجرك وظهوره على الخريطة.'
    ),
    (
        'member',
        'تسجيل عضو جديد في شبكة SAWYAN',
        'انضم مجاناً خلال دقيقة واحصل على عائدات الاستهلاك الاستثماري من كافة المتاجر المشاركة.',
        'بيانات اختيارية إضافية (يمكنك استكمالها لاحقاً من لوحتك أو عند أول سحب أرباح)',
        'أهلاً بك! استكمل الخانات الاختيارية وتوثيق الهوية KYC من لوحتك قبل أول عملية سحب.'
    ),
    (
        'employee_cashier',
        'إضافة موظف كاشير جديد لدى التاجر (PIN 4 أرقام)',
        'صلاحية مخصصة لتوثيق الفواتير الفوري أمام العملاء وحساب تقفيل الورديات بشكل مستقل عن مالك المتجر.',
        'بيانات اختيارية لرفع الأمان ومنع التلاعب لدى موظف الكاشير.',
        'قم بتحديث بيانات موظفي الكاشير وصلاحياتهم من تبويب إعدادات المتجر والموظفين.'
    ),
    (
        'employee_admin',
        'تعيين موظف إداري في الشركة',
        'إنشاء حساب موظف بصلاحيات محددة ونطاق دولة (يُجبر على تغيير كلمة المرور عند أول دخول)',
        'بيانات تواصل إضافية اختيارية للموظف الإداري.',
        'إدارة حسابات الموظفين الإداريين حصرية للمؤسس السيادي.'
    );

    INSERT INTO sawyan.registration_form_settings (
        form_type, page_title_ar, page_subtitle_ar, optional_divider_text_ar, dashboard_banner_text_ar
    )
    SELECT s.form_type, s.page_title_ar, s.page_subtitle_ar, s.optional_divider_text_ar, s.dashboard_banner_text_ar
      FROM _tmp_def_reg_settings s
     WHERE v_target IS NULL OR s.form_type = v_target
    ON CONFLICT (form_type) DO UPDATE
       SET page_title_ar            = CASE WHEN p_force_reset THEN EXCLUDED.page_title_ar            ELSE sawyan.registration_form_settings.page_title_ar END,
           page_subtitle_ar         = CASE WHEN p_force_reset THEN EXCLUDED.page_subtitle_ar         ELSE sawyan.registration_form_settings.page_subtitle_ar END,
           optional_divider_text_ar = CASE WHEN p_force_reset THEN EXCLUDED.optional_divider_text_ar ELSE sawyan.registration_form_settings.optional_divider_text_ar END,
           dashboard_banner_text_ar = CASE WHEN p_force_reset THEN EXCLUDED.dashboard_banner_text_ar ELSE sawyan.registration_form_settings.dashboard_banner_text_ar END,
           updated_at               = CASE WHEN p_force_reset THEN now() ELSE sawyan.registration_form_settings.updated_at END;

    CREATE TEMP TABLE IF NOT EXISTS _tmp_def_reg_fields (
        form_type             VARCHAR(24),
        field_key             VARCHAR(64),
        section_group         VARCHAR(32),
        display_mode          VARCHAR(24),
        show_in_initial       BOOLEAN,
        required_in_initial   BOOLEAN,
        show_in_dashboard     BOOLEAN,
        required_in_dashboard BOOLEAN,
        is_system_locked      BOOLEAN,
        label_ar              TEXT,
        placeholder_ar        TEXT,
        help_text_ar          TEXT,
        sort_order            INT,
        extra_config          JSONB
    ) ON COMMIT DROP;
    TRUNCATE _tmp_def_reg_fields;

    INSERT INTO _tmp_def_reg_fields VALUES
    ('merchant', 'business_name',        'basic',     'initial_required', true,  true,  true,  true,  true,  'اسم النشاط التجاري / العلامة',                 'مثال: سوبر ماركت الأمل',                                  'الاسم التجاري الظاهر للعملاء في دليل المتاجر والفواتير', 10, '{}'::jsonb),
    ('merchant', 'owner_name',           'basic',     'initial_required', true,  true,  true,  true,  true,  'اسم المالك الكامل',                            'الاسم الثلاثي أو الرباعي للمالك',                        'الاسم القانوني لصاحب المشروع أو المفوّض بالتوقيع', 20, '{}'::jsonb),
    ('merchant', 'email',                'basic',     'initial_required', true,  true,  true,  true,  false, 'البريد الإلكتروني',                            'merchant@example.com',                                    'يجب أن يكون بريداً صحيحاً (يحتوي على @ ونقطة مثل name@domain.com) لاستلام الفواتير واستعادة الحساب', 30, '{}'::jsonb),
    ('merchant', 'merchant_type',        'activity',  'initial_required', true,  true,  true,  true,  true,  'نوع النشاط التجاري',                           '',                                                        'اختر طبيعة نشاطك ليجهّز النظام الحقول المناسبة لمشروعك', 40, '{"widget":"cards"}'::jsonb),
    ('merchant', 'business_category',    'activity',  'initial_required', true,  true,  true,  true,  true,  'فئة النشاط التجاري',                           'اختر فئة النشاط...',                                       'التصنيف الذي يظهر فيه متجرك عند بحث الأعضاء', 50, '{}'::jsonb),
    ('merchant', 'country_code',         'location',  'initial_required', true,  true,  true,  true,  true,  'دولة النشاط التجاري',                          'اختر الدولة...',                                          'يحدد العملة المحلية ومفتاح الهاتف والمدن تلقائياً', 60, '{}'::jsonb),
    ('merchant', 'city',                 'location',  'initial_required', true,  true,  true,  true,  false, 'المحافظة / المدينة',                           'اختر المدينة...',                                         'اختر المدينة أو اكتبها يدوياً إذا لم تجدها في القائمة', 70, '{}'::jsonb),
    ('merchant', 'district',             'location',  'initial_required', true,  true,  true,  true,  false, 'الحي / المنطقة',                               'اختر الحي أو ابحث عنه...',                                'مطلوب للمحلات على الأرض ليصل إليك العملاء بسهولة (واختياري للمتجر الإلكتروني فقط)', 80, '{}'::jsonb),
    ('merchant', 'phone',                'basic',     'initial_required', true,  true,  true,  true,  true,  'رقم الهاتف النشط',                             'باقي رقم الموبايل بدون مفتاح الدولة',                     'يُضاف مفتاح الدولة تلقائياً حسب الدولة المختارة مع فحص عدد الأرقام الصحيح', 90, '{}'::jsonb),
    ('merchant', 'onboarded_by_code',    'basic',     'initial_required', true,  true,  false, false, false, 'كود العضو المرشّح للمتجر',                     'أدخل كود العضو أو 0 للتسجيل عن طريق الشركة',              'اكتب كود العضو الذي دعاك، أو اكتب 0 (أو اضغط الزر السريع) إذا سجّلت عبر شركة SAWYAN مباشرة', 100, '{"allow_zero_company":true}'::jsonb),
    ('merchant', 'password',             'security',  'initial_required', true,  true,  false, false, true,  'كلمة مرور حساب التاجر',                        'أدخل كلمة مرور قوية (8 أحرف على الأقل)',                  'لحماية لوحة التحكم وتوثيق الفواتير — تجنّب كلمات المرور البسيطة', 110, '{}'::jsonb),
    ('merchant', 'terms_consent',        'security',  'initial_required', true,  true,  false, false, true,  'الموافقة على الشروط والأحكام وسياسة الخصوصية', '',                                                        'إقرار بصحة البيانات وقبول قواعد العمل في شبكة SAWYAN', 120, '{}'::jsonb),
    ('merchant', 'commission_percent',   'commercial','initial_optional', true,  false, true,  true,  false, 'كم أقصى نسبة تستطيع ردّها لسويًا كلما اشترى أعضاؤها منك؟ (%)', 'مثال: 10',                                     'أقصى نسبة من المبيعات تستطيع استقطاعها لسويًا نظير حشد آلاف المشترين نحو مشروعك', 130, '{"min":0.5,"max":95}'::jsonb),
    ('merchant', 'business_description', 'activity',  'initial_optional', true,  false, true,  false, false, 'وصف مختصر عن النشاط',                          'اذكر أبرز منتجاتك أو خدماتك التي تميّز متجرك...',          'يساعد الأعضاء على فهم تخصص متجرك ويزيد ثقتهم عند الشراء', 140, '{}'::jsonb),
    ('merchant', 'address',              'location',  'initial_optional', true,  false, true,  true,  false, 'العنوان التفصيلي',                             'اسم الشارع، رقم العقار، أقرب معلم معروف...',               'العنوان الدقيق للفرع الرئيسي الظاهر لعملاء المتجر', 150, '{}'::jsonb),
    ('merchant', 'geo_location',         'location',  'initial_optional', true,  false, true,  true,  false, 'الموقع على خرائط جوجل (اللاقط التلقائي)',       'الصق رابط خرائط جوجل أو اضغط التقاط موقعي الحالي',         'التقط موقع متجرك تلقائياً أو حرّك الدبوس على الخريطة ليظهر متجرك على رادار القرب وخرائط جوجل', 160, '{"has_geo_picker":true}'::jsonb),
    ('merchant', 'website_url',          'online',    'initial_optional', true,  false, true,  false, false, 'رابط الموقع أو المتجر الإلكتروني',             'https://yourstore.com',                                   'يظهر للمتاجر الإلكترونية أو التي تمتلك موقعاً للطلب أونلاين', 170, '{}'::jsonb),
    ('merchant', 'whatsapp',             'social',    'initial_optional', true,  false, true,  false, false, 'رقم واتساب للتواصل مع العملاء',                 'رقم الواتساب أو اضغط نفس رقم الهاتف',                     'رقم مخصص لاستفسارات العملاء وطلبات التوصيل', 180, '{}'::jsonb),
    ('merchant', 'logo_url',             'media',     'initial_optional', true,  false, true,  false, false, 'شعار النشاط (Logo)',                           'ارفع صورة الشعار الواضحة',                                'يفضّل شعار واضح بخلفية مناسبة ليظهر على بطاقة متجرك', 190, '{}'::jsonb),
    ('merchant', 'cover_image_url',      'media',     'initial_optional', true,  false, true,  false, false, 'صورة الواجهة / الغلاف',                        'ارفع صورة واجهة المحل أو غلاف المتجر',                    'تعطي انطباعاً قوياً واحترافياً لمتجرك أمام الأعضاء', 200, '{}'::jsonb),
    ('merchant', 'gallery_images',       'media',     'dashboard_only',   false, false, true,  false, false, 'صور إضافية للمتجر والمنتجات (حتى 6 صور)',     'اختر صوراً تعرض منتجاتك أو أجواء المكان',                'تُرفع من لوحة التاجر لإبراز جودة المنتجات والخدمة', 210, '{}'::jsonb),
    ('merchant', 'working_hours',        'location',  'dashboard_only',   false, false, true,  false, false, 'مواعيد العمل الأسبوعية',                       'حدد ساعات الفتح والإغلاق لكل يوم',                        'تُستكمل من لوحة التاجر مع خيار تعميم نفس الموعد لجميع الأيام', 220, '{}'::jsonb),
    ('merchant', 'social_links',         'social',    'dashboard_only',   false, false, true,  false, false, 'روابط التواصل الاجتماعي',                      'فيسبوك، إنستغرام، X، تيك توك',                            'تُربط في ملف المتجر لمتابعة العملاء لعروضك', 230, '{}'::jsonb),
    ('merchant', 'commercial_reg_no',    'kyc',       'dashboard_only',   false, false, true,  false, false, 'رقم السجل التجاري / الرخصة',                   'مثال: 1010456789',                                        'اختياري افتراضياً — ويمكن للإدارة جعله إلزامياً من باني النماذج متى لزم', 240, '{}'::jsonb),
    ('merchant', 'tax_id',               'kyc',       'dashboard_only',   false, false, true,  false, false, 'الرقم الضريبي للمنشأة',                        'مثال: 300-456-789',                                       'يُستخدم عند إصدار فواتير العمولات الضريبية الرسمية', 250, '{}'::jsonb),
    ('merchant', 'commercial_doc_url',   'kyc',       'dashboard_only',   false, false, true,  false, false, 'صورة السجل التجاري أو رخصة النشاط',            'ارفع صورة واضحة من السجل أو الرخصة',                      'اختياري افتراضياً — مستند توثيق رسمي متاح عند تفعيله من الإدارة', 260, '{}'::jsonb),
    ('merchant', 'tax_doc_url',          'kyc',       'dashboard_only',   false, false, true,  false, false, 'صورة البطاقة الضريبية أو إثبات المقر',         'ارفع صورة البطاقة الضريبية أو عقد المقر',                 'مستند داعم يسرّع مراجعة واعتماد حساب التاجر', 270, '{}'::jsonb),
    ('merchant', 'webhook_url',          'online',    'dashboard_only',   false, false, true,  false, false, 'رابط الربط التقني المباشر (Webhook)',          'https://yourstore.com/webhook',                           'للمتاجر الإلكترونية التي تملك فريقاً تقنياً للربط الآلي', 280, '{}'::jsonb),
    ('merchant', 'initial_cashier_pin',  'pos',       'dashboard_only',   false, false, true,  false, false, 'رمز PIN لموظف الكاشير الرئيسي (4 أرقام)',       'مثال: 2580',                                              'رقم سري ثابت من 4 أرقام خاص بموظف الكاشير لاعتماد فواتير العملاء أمامه فوراً باسمه وحماية صاحب المحل', 290, '{}'::jsonb),

    ('member', 'full_name',              'basic',    'initial_required', true,  true,  true,  true,  true,  'الاسم الكامل',                                 'أدخل اسمك الثلاثي أو الرباعي كما في الهوية',              'يُستخدم في حسابك وبطاقة عضويتك ويُشترط تطابقه مع الهوية عند السحب', 10, '{}'::jsonb),
    ('member', 'sponsor_code',           'basic',    'initial_required', true,  true,  false, false, true,  'كود الشخص الداعي لك (الراعي)',                  'أدخل كود العضو الذي دعاك',                                'يظهر اسم الراعي مباشرة للتأكد قبل إتمام التسجيل وتسكينك في شجرته', 20, '{}'::jsonb),
    ('member', 'country_of_residence',   'location', 'initial_required', true,  true,  true,  true,  true,  'دولة الإقامة الحالية',                         'اختر دولة إقامتك الحالية...',                             '⚠️ لحماية أرباحك: حدد دولة إقامتك الحالية بدقة — تُقفل بعد التسجيل وتحدد عملة حسابك', 30, '{}'::jsonb),
    ('member', 'phone',                  'basic',    'initial_required', true,  true,  true,  true,  true,  'رقم الهاتف النشط',                             'باقي رقم الموبايل بدون مفتاح الدولة',                     'مقترن تلقائياً بمفتاح الدولة المختارة مع فحص عدد الأرقام القياسي', 40, '{}'::jsonb),
    ('member', 'password',               'security', 'initial_required', true,  true,  false, false, true,  'كلمة المرور',                                  'أدخل كلمة مرور قوية (8 أحرف على الأقل)',                  'لحماية محفظتك وبياناتك — يجب مطابقتها في خانة التأكيد', 50, '{}'::jsonb),
    ('member', 'terms_consent',          'security', 'initial_required', true,  true,  false, false, true,  'الموافقة على الشروط والأحكام وسياسة الخصوصية', '',                                                        'إقرار بقبول ضوابط العضوية المجانية والعمل في SAWYAN', 60, '{}'::jsonb),
    ('member', 'city',                   'location', 'initial_optional', true,  false, true,  true,  false, 'المحافظة / المدينة',                           'اختر المدينة...',                                         'لعرض المتاجر والعروض المتاحة في مدينتك', 70, '{}'::jsonb),
    ('member', 'district',               'location', 'initial_optional', true,  false, true,  false, false, 'الحي / المنطقة',                               'اختر الحي أو ابحث عنه...',                                'يساعد في ترتيب أقرب المتاجر داخل حيك', 80, '{}'::jsonb),
    ('member', 'email',                  'basic',    'initial_optional', true,  false, true,  false, false, 'البريد الإلكتروني',                            'example@domain.com',                                      'يُشترط أن يكون بريداً صحيحاً (يحتوي على @ ونقطة في موقعها الصحيح) لاستعادة كلمة المرور', 90, '{}'::jsonb),
    ('member', 'nationality',            'profile',  'initial_optional', true,  false, true,  false, false, 'الجنسية',                                      'اختر الجنسية...',                                         'حقل تعريفي مستقل ولا يؤثر على عملة حسابك أو أرباحك', 100, '{}'::jsonb),
    ('member', 'gender',                 'profile',  'initial_optional', true,  false, true,  false, false, 'النوع (الجنس)',                                'اختر...',                                                 'معلومة إحصائية اختيارية', 110, '{}'::jsonb),
    ('member', 'home_gps',               'location', 'initial_optional', true,  false, true,  false, false, 'موقع السكن على الخريطة (اللاقط التلقائي)',     'اضغط التقاط موقعي الحالي أو حرّك الدبوس على منطقتك',      'لعرض أقرب المتاجر حولك وإظهار موقعك كعلم مجهول بدون اسم لتحفيز انضمام تجار منطقتك', 120, '{"has_geo_picker":true}'::jsonb),
    ('member', 'national_id_kyc',        'kyc',      'dashboard_only',   false, false, true,  true,  false, 'توثيق الهوية الوطنية / جواز السفر (KYC)',      'رقم الهوية وصورة الوثيقة الواضحة',                        'مطلوب مرة واحدة من داخل لوحتك قبل أول طلب سحب أرباح', 130, '{}'::jsonb),

    ('employee_cashier', 'employee_code',         'pos', 'initial_optional', true, false, true, false, false, 'كود موظف الكاشير',                     'تلقائي مثل EMP-02 (أو اكتب كوداً مخصصاً)',                'يُستخدم لتمييز الموظف عند اعتماد الفواتير، ويُولّد تلقائياً إذا تركته فارغاً', 10, '{}'::jsonb),
    ('employee_cashier', 'full_name',             'pos', 'initial_required', true, true,  true, true,  true,  'اسم موظف الكاشير الكامل',               'الاسم الكامل للموظف',                                     'يظهر في سجل المبيعات والورديات لمعرفة من اعتمد كل فاتورة', 20, '{}'::jsonb),
    ('employee_cashier', 'cashier_pin',           'pos', 'initial_required', true, true,  true, true,  true,  'رمز PIN السري الخاص بالموظف (4 أرقام)', 'أدخل 4 أرقام مثل: 2580',                                  'رمز مستقل لكل موظف كاشير لتوثيق الفواتير أمام العملاء بضغطة واحدة', 30, '{}'::jsonb),
    ('employee_cashier', 'branch_id',             'pos', 'initial_required', true, true,  true, true,  true,  'الفرع التابع له الموظف',                'اختر الفرع...',                                           'تحديد الفرع الذي يعمل به الموظف لتقفيل وردياته بدقة', 40, '{}'::jsonb),
    ('employee_cashier', 'employee_phone',        'pos', 'initial_optional', true, false, true, false, false, 'رقم هاتف الموظف',                       'رقم هاتف الموظف للتواصل الإداري',                         'اختياري لسهولة تواصل مالك المتجر مع الموظف', 50, '{}'::jsonb),
    ('employee_cashier', 'linked_member_code',    'pos', 'initial_optional', true, false, true, false, false, 'كود عضوية الموظف في SAWYAN (إن وجد)',   'مثال: 105',                                               'لحماية متجرك: يمنع الموظف من توثيق فواتير لنفسه وينبهك عند أي تواطؤ مع فريقه', 60, '{}'::jsonb),
    ('employee_cashier', 'max_tx_amount_limit',   'pos', 'initial_optional', true, false, true, false, false, 'سقف الفاتورة المسموح باعتمادها فوراً',   'فارغ = بلا حد أقصى (مثال: 2000)',                         'أي فاتورة تتجاوز هذا المبلغ تتحول تلقائياً لموافقة صاحب المحل', 70, '{}'::jsonb),
    ('employee_cashier', 'notify_owner_realtime', 'pos', 'initial_optional', true, false, true, false, false, 'إشعار فوري لصاحب المحل مع كل فاتورة',   '',                                                        'تفعيل تنبيه لحظي للمالك فور اعتماد الموظف لأي فاتورة', 80, '{"widget":"checkbox"}'::jsonb),

    ('employee_admin', 'full_name',        'admin_staff', 'initial_required', true, true,  true, true,  true,  'الاسم الكامل للموظف الإداري',   'الاسم الكامل كما في العقد الوظيفي',                    'يظهر في سجل التدقيق والعمليات التي ينفذها الموظف', 10, '{}'::jsonb),
    ('employee_admin', 'email',            'admin_staff', 'initial_required', true, true,  true, true,  true,  'البريد الإلكتروني الوظيفي',      'name@SAWYAN.global',                                    'بريد صحيح بصيغة name@domain.com يُستخدم لتسجيل الدخول إلى بوابة الإدارة', 20, '{}'::jsonb),
    ('employee_admin', 'role',             'admin_staff', 'initial_required', true, true,  true, true,  true,  'الدور الوظيفي (الصلاحية)',      'اختر الدور الوظيفي...',                                 'يحدد الصلاحيات المسموحة للموظف وفق فصل المهام الإدارية', 30, '{}'::jsonb),
    ('employee_admin', 'country_scope',    'admin_staff', 'initial_required', true, true,  true, true,  true,  'نطاق الدولة المصرح به',         'اختر النطاق (عالمي أو دولة محددة)...',                  'يحصر صلاحية اطلاع الموظف على دولة محددة أو يفتح جميع الدول', 40, '{}'::jsonb),
    ('employee_admin', 'initial_password', 'admin_staff', 'initial_required', true, true,  false, false, true, 'كلمة المرور المبدئية (8+ أحرف)', 'أدخل أو ولّد كلمة مرور قوية',                           'يُجبر الموظف على تغييرها تلقائياً عند أول تسجيل دخول', 50, '{}'::jsonb),
    ('employee_admin', 'staff_phone',      'admin_staff', 'initial_optional', true, false, true, false, false, 'رقم الهاتف الوظيفي',            '+201012345678',                                         'للتواصل السريع مع الموظف في الحالات التشغيلية العاجلة', 60, '{}'::jsonb);

    INSERT INTO sawyan.registration_field_configs (
        form_type, field_key, section_group, display_mode,
        show_in_initial, required_in_initial, show_in_dashboard, required_in_dashboard,
        is_system_locked, label_ar, placeholder_ar, help_text_ar, sort_order, extra_config
    )
    SELECT f.form_type, f.field_key, f.section_group, f.display_mode,
           f.show_in_initial, f.required_in_initial, f.show_in_dashboard, f.required_in_dashboard,
           f.is_system_locked, f.label_ar, f.placeholder_ar, f.help_text_ar, f.sort_order, f.extra_config
      FROM _tmp_def_reg_fields f
     WHERE v_target IS NULL OR f.form_type = v_target
    ON CONFLICT (form_type, field_key) DO UPDATE
       SET section_group         = EXCLUDED.section_group,
           is_system_locked      = EXCLUDED.is_system_locked,
           extra_config          = COALESCE(sawyan.registration_field_configs.extra_config, '{}'::jsonb) || EXCLUDED.extra_config,
           display_mode          = CASE WHEN p_force_reset THEN EXCLUDED.display_mode          ELSE sawyan.registration_field_configs.display_mode END,
           show_in_initial       = CASE WHEN p_force_reset THEN EXCLUDED.show_in_initial       ELSE sawyan.registration_field_configs.show_in_initial END,
           required_in_initial   = CASE WHEN p_force_reset THEN EXCLUDED.required_in_initial   ELSE sawyan.registration_field_configs.required_in_initial END,
           show_in_dashboard     = CASE WHEN p_force_reset THEN EXCLUDED.show_in_dashboard     ELSE sawyan.registration_field_configs.show_in_dashboard END,
           required_in_dashboard = CASE WHEN p_force_reset THEN EXCLUDED.required_in_dashboard ELSE sawyan.registration_field_configs.required_in_dashboard END,
           label_ar              = CASE WHEN p_force_reset THEN EXCLUDED.label_ar              ELSE sawyan.registration_field_configs.label_ar END,
           placeholder_ar        = CASE WHEN p_force_reset THEN EXCLUDED.placeholder_ar        ELSE sawyan.registration_field_configs.placeholder_ar END,
           help_text_ar          = CASE WHEN p_force_reset THEN EXCLUDED.help_text_ar          ELSE sawyan.registration_field_configs.help_text_ar END,
           sort_order            = CASE WHEN p_force_reset THEN EXCLUDED.sort_order            ELSE sawyan.registration_field_configs.sort_order END,
           updated_at            = CASE WHEN p_force_reset THEN now() ELSE sawyan.registration_field_configs.updated_at END;
END;
$$;

-- ============================================================================
-- 5. المحرك الدستوري لحالات التاجر الثلاثية (Authoritative State Engine — service_role)
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.evaluate_merchant_profile_complete(
    p_merchant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_fld          RECORD;
    v_missing      TEXT[] := ARRAY[]::TEXT[];
    v_ok           BOOLEAN;
    v_addr_fb      BOOLEAN;
    v_geo_fb       BOOLEAN;
    v_meta         JSONB;
    v_social       JSONB;
    v_wh           JSONB;
    v_has_cashier  BOOLEAN := false;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('is_complete', false, 'missing_fields', jsonb_build_array('merchant_not_found'));
    END IF;

    SELECT * INTO v_main_br
      FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC
     LIMIT 1;

    v_meta    := COALESCE(v_merch.metadata, '{}'::jsonb);
    v_addr_fb := COALESCE((v_meta->>'address_is_fallback')::boolean, false);
    v_geo_fb  := COALESCE((v_meta->>'geo_is_fallback')::boolean, false);

    SELECT EXISTS (
        SELECT 1 FROM sawyan.cashier_employees WHERE merchant_id = v_merch.id AND is_active = true
    ) INTO v_has_cashier;

    IF COALESCE(v_merch.deduction_percent, 0) < 0.50 OR COALESCE((v_meta->>'commission_pending')::boolean, false) THEN
        v_missing := array_append(v_missing, 'commission_percent');
    END IF;

    FOR v_fld IN
        SELECT field_key
          FROM sawyan.registration_field_configs
         WHERE form_type = 'merchant'
           AND show_in_dashboard = true
           AND required_in_dashboard = true
           AND display_mode <> 'hidden'
         ORDER BY sort_order ASC
    LOOP
        v_ok := true;
        CASE v_fld.field_key
            WHEN 'commission_percent' THEN
                v_ok := COALESCE(v_merch.deduction_percent, 0) >= 0.50 AND NOT COALESCE((v_meta->>'commission_pending')::boolean, false);
            WHEN 'business_name' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.business_name, '')), '') IS NOT NULL;
            WHEN 'owner_name' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.owner_name, '')), '') IS NOT NULL;
            WHEN 'email' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.email, '')), '') IS NOT NULL;
            WHEN 'phone' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.phone, '')), '') IS NOT NULL;
            WHEN 'merchant_type' THEN
                v_ok := v_merch.merchant_type IN ('physical', 'online', 'both');
            WHEN 'business_category' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.category, '')), '') IS NOT NULL;
            WHEN 'country_code' THEN
                v_ok := v_merch.country_id IS NOT NULL;
            WHEN 'city' THEN
                v_ok := v_main_br.city_geoname_id IS NOT NULL
                        OR NULLIF(trim(COALESCE(v_meta->>'city_geoname_id', '')), '') IS NOT NULL
                        OR NULLIF(trim(COALESCE(v_meta->>'city_name', '')), '') IS NOT NULL
                        OR (NULLIF(trim(COALESCE(v_merch.address, v_main_br.address, '')), '') IS NOT NULL AND NOT v_addr_fb);
            WHEN 'district' THEN
                IF v_merch.merchant_type IN ('physical', 'both') THEN
                    v_ok := NULLIF(trim(COALESCE(v_meta->>'district', '')), '') IS NOT NULL
                            OR (NULLIF(trim(COALESCE(v_merch.address, v_main_br.address, '')), '') IS NOT NULL AND NOT v_addr_fb);
                END IF;
            WHEN 'address' THEN
                IF v_merch.merchant_type IN ('physical', 'both') THEN
                    v_ok := (NULLIF(trim(COALESCE(v_merch.address, v_main_br.address, '')), '') IS NOT NULL AND NOT v_addr_fb);
                END IF;
            WHEN 'geo_location' THEN
                IF v_merch.merchant_type IN ('physical', 'both') THEN
                    v_ok := (
                        (COALESCE(v_merch.latitude, v_main_br.latitude) IS NOT NULL AND COALESCE(v_merch.longitude, v_main_br.longitude) IS NOT NULL AND NOT v_geo_fb)
                        OR NULLIF(trim(COALESCE(v_meta->>'google_maps_url', '')), '') IS NOT NULL
                    );
                END IF;
            WHEN 'website_url' THEN
                IF v_merch.merchant_type IN ('online', 'both') THEN
                    v_ok := NULLIF(trim(COALESCE(v_meta->>'website_url', '')), '') IS NOT NULL;
                END IF;
            WHEN 'business_description' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'description', '')), '') IS NOT NULL;
            WHEN 'whatsapp' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'whatsapp', '')), '') IS NOT NULL;
            WHEN 'logo_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'logo_url', '')), '') IS NOT NULL;
            WHEN 'cover_image_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'cover_image_url', '')), '') IS NOT NULL;
            WHEN 'gallery_images' THEN
                v_ok := jsonb_typeof(v_meta->'images') = 'array' AND jsonb_array_length(v_meta->'images') > 0;
            WHEN 'working_hours' THEN
                v_wh := v_meta->'working_hours';
                v_ok := v_wh IS NOT NULL AND jsonb_typeof(v_wh) <> 'null' AND NULLIF(trim(v_wh::text), '') NOT IN ('""', '{}', 'null');
            WHEN 'social_links' THEN
                v_social := v_meta->'social';
                v_ok := v_social IS NOT NULL AND jsonb_typeof(v_social) = 'object' AND (
                    NULLIF(trim(COALESCE(v_social->>'facebook', '')), '') IS NOT NULL
                    OR NULLIF(trim(COALESCE(v_social->>'instagram', '')), '') IS NOT NULL
                    OR NULLIF(trim(COALESCE(v_social->>'twitter', '')), '') IS NOT NULL
                    OR NULLIF(trim(COALESCE(v_social->>'tiktok', '')), '') IS NOT NULL
                );
            WHEN 'commercial_reg_no' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'commercial_reg_no', '')), '') IS NOT NULL;
            WHEN 'tax_id' THEN
                v_ok := NULLIF(trim(COALESCE(v_merch.tax_registration_no, v_meta->>'tax_id', '')), '') IS NOT NULL;
            WHEN 'commercial_doc_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta #>> '{kyc_docs,commercial_reg}', '')), '') IS NOT NULL;
            WHEN 'tax_doc_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta #>> '{kyc_docs,tax_card}', '')), '') IS NOT NULL;
            WHEN 'webhook_url' THEN
                v_ok := NULLIF(trim(COALESCE(v_meta->>'webhook_url', '')), '') IS NOT NULL;
            WHEN 'initial_cashier_pin' THEN
                v_ok := v_has_cashier;
            ELSE
                v_ok := true;
        END CASE;

        IF NOT COALESCE(v_ok, false) AND NOT (v_fld.field_key = ANY(v_missing)) THEN
            v_missing := array_append(v_missing, v_fld.field_key);
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'is_complete', (cardinality(v_missing) = 0),
        'missing_fields', to_jsonb(v_missing)
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.compute_merchant_d4_cycle_info(
    p_merchant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch             sawyan.merchants%ROWTYPE;
    v_country           sawyan.countries%ROWTYPE;
    v_settings          sawyan.settings%ROWTYPE;
    v_now_utc           TIMESTAMPTZ := sawyan.now_utc();
    v_tz                TEXT;
    v_time_disabled     BOOLEAN := false;
    v_cycle_days        INT := 1;
    v_cutoff_time       TIME := '23:59:00'::time;
    v_grace_hours       NUMERIC(5,2) := 2.00;
    v_debt_start_utc    TIMESTAMPTZ;
    v_local_debt        TIMESTAMP;
    v_base_days_offset  INT := 0;
    v_cycle_close_local TIMESTAMP;
    v_cycle_close_utc   TIMESTAMPTZ := NULL;
    v_grace_due_utc     TIMESTAMPTZ := NULL;
    v_next_start_utc    TIMESTAMPTZ := NULL;
    v_total_debt        NUMERIC(18,2) := 0.00;
    v_post_comm         NUMERIC(18,2) := 0.00;
    v_statement_due     NUMERIC(18,2) := 0.00;
    v_open_cycle_comm   NUMERIC(18,2) := 0.00;
    v_in_grace          BOOLEAN := false;
    v_breached          BOOLEAN := false;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= v_now_utc
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_tz := COALESCE(NULLIF(trim(v_country.iana_timezone), ''), 'UTC');
    v_time_disabled := COALESCE((v_merch.metadata->>'d4_time_trigger_disabled')::boolean, false);
    v_cycle_days := GREATEST(1, LEAST(90, COALESCE(v_merch.d4_cycle_days_override, v_settings.d4_cycle_days, 1)::int));
    v_cutoff_time := COALESCE(v_merch.deferred_settlement_cutoff_time, v_settings.d4_cycle_cutoff_time, '23:59:00'::time);
    v_grace_hours := GREATEST(0.00, LEAST(168.00, COALESCE(v_merch.d4_grace_hours_override, v_settings.d4_grace_hours, 2.00)::numeric));

    IF v_merch.credit_limit > 0 AND NOT v_time_disabled AND v_merch.actual_cash_balance < 0 THEN
        v_total_debt := ROUND(ABS(v_merch.actual_cash_balance)::numeric, 2);
        v_debt_start_utc := COALESCE(
            NULLIF(trim(COALESCE(v_merch.metadata->>'d4_debt_started_at', '')), '')::timestamptz,
            v_now_utc
        );
        v_local_debt := v_debt_start_utc AT TIME ZONE v_tz;
        v_base_days_offset := (CASE WHEN v_local_debt::time >= v_cutoff_time THEN 1 ELSE 0 END) + (v_cycle_days - 1);
        v_cycle_close_local := (v_local_debt::date + v_base_days_offset) + v_cutoff_time;
        v_cycle_close_utc := v_cycle_close_local AT TIME ZONE v_tz;
        v_grace_due_utc := v_cycle_close_utc + (v_grace_hours::text || ' hours')::interval;

        IF v_now_utc < v_cycle_close_utc THEN
            v_statement_due   := 0.00;
            v_open_cycle_comm := v_total_debt;
            v_in_grace        := false;
            v_breached        := false;
        ELSE
            SELECT COALESCE(SUM(tx.commission_amount + COALESCE(tx.vat_amount, 0.00)), 0.00),
                   MIN(COALESCE(tx.completed_at, tx.created_at))
              INTO v_post_comm, v_next_start_utc
              FROM sawyan.transactions tx
             WHERE tx.merchant_id = v_merch.id
               AND tx.status = 'completed'
               AND COALESCE(tx.completed_at, tx.created_at) >= v_cycle_close_utc;

            v_statement_due   := GREATEST(0.00, ROUND((v_total_debt - v_post_comm)::numeric, 2));
            v_open_cycle_comm := LEAST(v_total_debt, ROUND(v_post_comm::numeric, 2));
            v_in_grace        := (v_statement_due > 0 AND v_now_utc >= v_cycle_close_utc AND v_now_utc < v_grace_due_utc);
            v_breached        := (v_statement_due > 0 AND v_now_utc >= v_grace_due_utc);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'd4_effective_cycle_days', v_cycle_days,
        'd4_effective_cutoff_time', to_char(v_cutoff_time, 'HH24:MI:SS'),
        'd4_effective_grace_hours', v_grace_hours,
        'd4_time_trigger_disabled', v_time_disabled,
        'd4_cycle_close_at', v_cycle_close_utc,
        'd4_grace_due_at', v_grace_due_utc,
        'd4_next_debt_start_at', v_next_start_utc,
        'd4_statement_due_local', v_statement_due,
        'd4_open_cycle_comm_local', v_open_cycle_comm,
        'd4_in_grace_window', v_in_grace,
        'd4_cutoff_breached', v_breached
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.is_merchant_d4_cutoff_breached(
    p_merchant_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE((sawyan.compute_merchant_d4_cycle_info(p_merchant_id)->>'d4_cutoff_breached')::boolean, false);
$$;

CREATE OR REPLACE FUNCTION sawyan.compute_merchant_effective_state(
    p_merchant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch               sawyan.merchants%ROWTYPE;
    v_country             sawyan.countries%ROWTYPE;
    v_settings            sawyan.settings%ROWTYPE;
    v_now_utc             TIMESTAMPTZ := sawyan.now_utc();
    v_has_active_branch   BOOLEAN := false;
    v_fifo_count          INT := 0;
    v_oldest_fifo_at      TIMESTAMPTZ := NULL;
    v_pending_count       INT := 0;
    v_escalated_30d       INT := 0;
    v_lost_disputes_30d   INT := 0;
    v_verified_comp_30d   INT := 0;
    v_open_comp_cnt       INT := 0;
    v_gouging_distinct    INT := 0;
    v_free_bal            NUMERIC(18,2);
    v_denom               NUMERIC(18,2);
    v_free_pct            NUMERIC(6,2);
    v_eff_iso_pct         NUMERIC(5,2);
    v_eff_queue_cap       INT;
    v_d4_info             JSONB;
    v_cutoff_breached     BOOLEAN := false;
    v_overdue_ref_ts      TIMESTAMPTZ := NULL;
    v_overdue_days        INT := 0;
    v_fin_status          VARCHAR(30);
    v_can_login           BOOLEAN;
    v_portal_mode         VARCHAR(30);
    v_visible_radar       BOOLEAN;
    v_can_pos             BOOLEAN;
    v_can_remote_pending  BOOLEAN;
    v_can_reject_manual   BOOLEAN;
    v_can_flash           BOOLEAN;
    v_prof_eval           JSONB;
    v_hide_reason_ar      TEXT := NULL;
    v_pos_lock_reason_ar  TEXT := NULL;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings
      FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL)
       AND effective_from <= v_now_utc
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    SELECT EXISTS (
        SELECT 1 FROM sawyan.merchant_branches WHERE merchant_id = v_merch.id AND is_branch_active = true
    ) INTO v_has_active_branch;

    SELECT COUNT(*), MIN(created_at)
      INTO v_fifo_count, v_oldest_fifo_at
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id AND status = 'awaiting_merchant_topup';

    SELECT COUNT(*) INTO v_pending_count
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id AND status = 'pending';

    SELECT COUNT(*) INTO v_escalated_30d
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND created_at >= now() - interval '30 days'
       AND (
           (status = 'pending' AND created_at <= now() - (COALESCE(v_settings.pending_sla_hours, 48) || ' hours')::interval)
           OR COALESCE((commission_snapshot->>'admin_escalated_resolved')::boolean, false) = true
       );

    SELECT COUNT(*) INTO v_lost_disputes_30d
      FROM sawyan.dispute_tickets
     WHERE merchant_id = v_merch.id
       AND status = 'resolved_member'
       AND created_at >= now() - interval '30 days';

    SELECT COUNT(*) FILTER (WHERE status = 'verified' AND created_at >= now() - interval '30 days'),
           COUNT(*) FILTER (WHERE status = 'open')
      INTO v_verified_comp_30d, v_open_comp_cnt
      FROM sawyan.complaints
     WHERE target_type = 'merchant'
       AND target_id = v_merch.id;

    SELECT COUNT(DISTINCT member_id) INTO v_gouging_distinct
      FROM sawyan.price_gouging_reports
     WHERE merchant_id = v_merch.id
       AND verification_status = 'verified_violation';

    v_free_bal      := v_merch.actual_cash_balance - v_merch.soft_hold_balance + v_merch.credit_limit;
    v_denom         := GREATEST(v_merch.package_base_amount, v_merch.credit_limit);
    v_free_pct      := CASE WHEN v_denom > 0 THEN ROUND(((v_free_bal / v_denom) * 100.0)::numeric, 2) ELSE 0.00 END;
    v_eff_iso_pct   := COALESCE(v_merch.isolate_pct_override, v_settings.merchant_isolate_pct, 10.00);
    v_eff_queue_cap := CASE
        WHEN v_merch.unsecured_queue_cap_override IS NOT NULL THEN v_merch.unsecured_queue_cap_override::int
        WHEN v_merch.credit_limit > 0 THEN 0
        ELSE COALESCE(v_settings.unsecured_queue_cap, 3)::int
    END;

    v_d4_info         := sawyan.compute_merchant_d4_cycle_info(v_merch.id);
    v_cutoff_breached := COALESCE((v_d4_info->>'d4_cutoff_breached')::boolean, false);

    v_overdue_ref_ts := CASE
        WHEN v_oldest_fifo_at IS NOT NULL AND v_merch.overdue_since_at IS NOT NULL THEN LEAST(v_oldest_fifo_at, v_merch.overdue_since_at)
        ELSE COALESCE(v_oldest_fifo_at, v_merch.overdue_since_at)
    END;
    v_overdue_days := CASE
        WHEN v_overdue_ref_ts IS NOT NULL AND (v_fifo_count > 0 OR v_free_bal < 0 OR v_cutoff_breached)
        THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now_utc - v_overdue_ref_ts)) / 86400.0)::int)
        ELSE 0
    END;

    IF v_merch.actual_cash_balance <= 0 AND v_merch.credit_limit = 0 AND v_merch.package_base_amount = 0 AND v_fifo_count = 0 THEN
        v_fin_status := 'unfunded';
    ELSIF v_cutoff_breached
       OR (v_merch.credit_limit > 0 AND v_free_bal <= 0)
       OR (v_fifo_count >= v_eff_queue_cap AND (v_fifo_count > 0 OR v_free_bal <= 0))
       OR (v_free_bal < 0 AND v_merch.credit_limit = 0) THEN
        v_fin_status := 'locked_queue_full';
    ELSIF v_fifo_count > 0 OR v_free_bal <= 0 THEN
        v_fin_status := 'depleted_fifo_grace';
    ELSIF v_free_pct <= v_eff_iso_pct THEN
        v_fin_status := 'isolated_low_balance';
    ELSIF v_free_pct <= COALESCE(v_settings.merchant_warn2_pct, 20.00) THEN
        v_fin_status := 'warning_red';
    ELSIF v_free_pct <= COALESCE(v_settings.merchant_warn1_pct, 30.00) THEN
        v_fin_status := 'warning_yellow';
    ELSE
        v_fin_status := 'healthy_green';
    END IF;

    v_can_login := (v_merch.onboarding_status <> 'rejected' AND v_merch.governance_status <> 'banned_permanent');

    IF NOT v_can_login THEN
        v_portal_mode := 'blocked';
    ELSIF v_merch.governance_status = 'suspended_compliance' THEN
        v_portal_mode := 'appeal_and_repay_only';
    ELSIF v_merch.onboarding_status IN ('draft_incomplete', 'needs_correction') THEN
        v_portal_mode := 'complete_profile_only';
    ELSIF v_fin_status = 'locked_queue_full' THEN
        v_portal_mode := 'topup_only';
    ELSE
        v_portal_mode := 'full';
    END IF;

    v_visible_radar := (
        v_merch.onboarding_status = 'approved'
        AND v_fin_status IN ('healthy_green', 'warning_yellow', 'warning_red')
        AND v_merch.governance_status IN ('good_standing', 'probation_warning')
        AND COALESCE(v_merch.deduction_percent, 0) >= 0.50
        AND v_has_active_branch
    );

    v_can_pos := (
        v_merch.onboarding_status = 'approved'
        AND v_fin_status IN ('healthy_green', 'warning_yellow', 'warning_red', 'isolated_low_balance', 'depleted_fifo_grace')
        AND v_merch.governance_status IN ('good_standing', 'probation_warning', 'restricted_no_reject')
        AND COALESCE(v_merch.deduction_percent, 0) >= 0.50
        AND v_has_active_branch
    );

    v_can_remote_pending := (
        v_can_pos
        AND v_fin_status IN ('healthy_green', 'warning_yellow', 'warning_red')
    );

    v_can_reject_manual := (
        v_merch.governance_status NOT IN ('restricted_no_reject', 'suspended_compliance', 'banned_permanent')
    );

    v_can_flash := (
        v_visible_radar
        AND v_fin_status = 'healthy_green'
        AND v_merch.governance_status = 'good_standing'
    );

    -- أسباب التقييد بلغة المتجر/توثيق الفواتير الواضحة
    IF v_merch.onboarding_status <> 'approved' THEN
        v_hide_reason_ar := CASE v_merch.onboarding_status
            WHEN 'draft_incomplete' THEN 'المتجر قيد استكمال البيانات الأساسية أو نسبة المساهمة قبل الظهور في الدليل.'
            WHEN 'needs_correction' THEN 'يوجد طلب تعديل أو استيفاء بيانات من الإدارة — راجع ملاحظات التأهيل.'
            WHEN 'rejected' THEN 'طلب الانضمام مرفوض من الإدارة.'
            ELSE 'بانتظار الاعتماد.'
        END;
        v_pos_lock_reason_ar := 'توثيق الفواتير الفوري للمتجر مغلق لحين استكمال البيانات والاعتماد.';
    ELSIF v_merch.governance_status NOT IN ('good_standing', 'probation_warning') THEN
        v_hide_reason_ar := CASE v_merch.governance_status
            WHEN 'restricted_no_reject' THEN 'المتجر مخفي مؤقتاً عن الدليل وممنوع من الرفض اليدوي بسبب تصعيد مخالفات أو شكاوى.'
            WHEN 'paused_by_merchant' THEN 'المتجر في وضع إجازة / إغلاق مؤقت بطلب التاجر.'
            WHEN 'paused_by_admin' THEN 'المتجر موقوف مؤقتاً من الإدارة.'
            WHEN 'suspended_compliance' THEN 'تم تعليق المتجر امتثالياً لتجاوز مهلة السداد أو جسامة المخالفات.'
            WHEN 'banned_permanent' THEN 'الحساب محظور نهائياً من شبكة SAWYAN.'
            ELSE NULL
        END;
        IF NOT v_can_pos THEN
            v_pos_lock_reason_ar := 'تسجيل الفواتير وتوثيقها لدى المتجر مغلق حالياً وفق حالة الحوكمة.';
        END IF;
    ELSIF NOT v_visible_radar THEN
        v_hide_reason_ar := CASE v_fin_status
            WHEN 'unfunded' THEN 'المتجر معتمد بياناتياً لكنه بلا تمويل بعد (0 شحن و0 حد ائتمان) — اشحن الرصيد للظهور في الدليل.'
            WHEN 'isolated_low_balance' THEN 'الرصيد الحر هبط إلى عتبة العزل الوقائي — اشحن محفظة المتجر لإعادة الظهور في الدليل.'
            WHEN 'depleted_fifo_grace' THEN 'الرصيد نافد والمتجر في مهلة طابور الانتظار FIFO — مخفي عن الدليل لحين الشحن.'
            WHEN 'locked_queue_full' THEN 'المتجر معزول ومقفل لامتلاء طابور النفاد أو تجاوز حد الائتمان D4.'
            ELSE CASE WHEN NOT v_has_active_branch THEN 'لا يوجد فرع نشط للمتجر.' ELSE NULL END
        END;
    END IF;

    IF v_pos_lock_reason_ar IS NULL AND NOT v_can_pos THEN
        v_pos_lock_reason_ar := CASE v_fin_status
            WHEN 'unfunded' THEN 'توثيق الفواتير الفوري مغلق حتى شحن المحفظة أو اعتماد حد ائتماني (D4).'
            WHEN 'locked_queue_full' THEN CASE WHEN v_merch.credit_limit > 0 THEN 'إيقاف فوري لتوثيق الفواتير بسبب استنفاد حد الائتمان D4 أو تجاوز مهلة سداد دورة الائتمان.' ELSE 'إيقاف تام لتسجيل الفواتير لامتلاء طابور ما بعد نفاد الرصيد — يرجى الشحن فوراً.' END
            ELSE 'توثيق الفواتير لدى المتجر مقيد حالياً.'
        END;
    END IF;

    v_prof_eval := sawyan.evaluate_merchant_profile_complete(v_merch.id);

    RETURN jsonb_build_object(
        'merchant_id', v_merch.id,
        'merchant_code', v_merch.merchant_code,
        'onboarding_status', v_merch.onboarding_status,
        'onboarding_notes', v_merch.onboarding_notes,
        'financial_status', v_fin_status,
        'governance_status', v_merch.governance_status,
        'pre_pause_governance_status', v_merch.pre_pause_governance_status,
        'governance_reason', v_merch.governance_reason,
        'free_balance', v_free_bal,
        'free_pct', v_free_pct,
        'effective_isolate_pct', v_eff_iso_pct,
        'effective_queue_cap', v_eff_queue_cap,
        'fifo_queue_count', v_fifo_count,
        'pending_count', v_pending_count,
        'cutoff_breached', v_cutoff_breached,
        'overdue_days', v_overdue_days,
        'fifo_default_days', COALESCE(v_settings.fifo_default_days, 14),
        'warn1_pct', COALESCE(v_settings.merchant_warn1_pct, 30.00),
        'warn2_pct', COALESCE(v_settings.merchant_warn2_pct, 20.00),
        'missing_required_fields', COALESCE(v_prof_eval->'missing_fields', '[]'::jsonb),
        'profile_complete', COALESCE((v_prof_eval->>'is_complete')::boolean, false),
        'hide_reason_ar', v_hide_reason_ar,
        'pos_lock_reason_ar', v_pos_lock_reason_ar
    ) || v_d4_info || jsonb_build_object(
        'effective_access', jsonb_build_object(
            'can_login_portal', v_can_login,
            'portal_access_mode', v_portal_mode,
            'is_visible_on_radar', v_visible_radar,
            'can_accept_pos', v_can_pos,
            'can_accept_pending_remote', v_can_remote_pending,
            'can_reject_pending_manually', v_can_reject_manual,
            'can_submit_flash_offer', v_can_flash
        ),
        'violation_counters', jsonb_build_object(
            'escalated_pending_30d', v_escalated_30d,
            'lost_disputes_30d', v_lost_disputes_30d,
            'verified_complaints_30d', v_verified_comp_30d,
            'open_complaints_count', v_open_comp_cnt,
            'verified_price_gouging_count', v_gouging_distinct,
            'warn_escalated_tx_30d', COALESCE(v_settings.warn_escalated_tx_30d, 3),
            'restrict_escalated_tx_30d', COALESCE(v_settings.restrict_escalated_tx_30d, 5),
            'warn_lost_disputes_30d', COALESCE(v_settings.warn_lost_disputes_30d, 2),
            'restrict_lost_disputes_30d', COALESCE(v_settings.restrict_lost_disputes_30d, 3),
            'warn_verified_complaints_30d', COALESCE(v_settings.warn_verified_complaints_30d, 2),
            'restrict_verified_complaints_30d', COALESCE(v_settings.restrict_verified_complaints_30d, 3)
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.sync_merchant_status_flags(
    p_merchant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch       sawyan.merchants%ROWTYPE;
    v_country     sawyan.countries%ROWTYPE;
    v_eff         JSONB;
    v_fin         VARCHAR(30);
    v_gov         VARCHAR(30);
    v_fifo        INT;
    v_free        NUMERIC(18,2);
    v_cutoff_br   BOOLEAN;
    v_over_days   INT;
    v_def_days    INT;
    v_vc          JSONB;
    v_esc_30d     INT;
    v_lost_30d    INT;
    v_comp_30d    INT;
    v_goug_cnt    INT;
    v_w_esc       INT;
    v_r_esc       INT;
    v_w_lost      INT;
    v_r_lost      INT;
    v_w_comp      INT;
    v_r_comp      INT;
    v_new_gov     VARCHAR(30) := NULL;
    v_new_reason  TEXT := NULL;
    v_local_today TEXT;
    v_can_login   BOOLEAN;
    v_vis_radar   BOOLEAN;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;

    v_eff       := sawyan.compute_merchant_effective_state(p_merchant_id);
    v_fin       := v_eff->>'financial_status';
    v_gov       := v_eff->>'governance_status';
    v_fifo      := COALESCE((v_eff->>'fifo_queue_count')::int, 0);
    v_free      := COALESCE((v_eff->>'free_balance')::numeric, 0);
    v_cutoff_br := COALESCE((v_eff->>'cutoff_breached')::boolean, false);
    v_over_days := COALESCE((v_eff->>'overdue_days')::int, 0);
    v_def_days  := COALESCE((v_eff->>'fifo_default_days')::int, 14);
    v_vc        := v_eff->'violation_counters';
    v_esc_30d   := COALESCE((v_vc->>'escalated_pending_30d')::int, 0);
    v_lost_30d  := COALESCE((v_vc->>'lost_disputes_30d')::int, 0);
    v_comp_30d  := COALESCE((v_vc->>'verified_complaints_30d')::int, 0);
    v_goug_cnt  := COALESCE((v_vc->>'verified_price_gouging_count')::int, 0);
    v_w_esc     := COALESCE((v_vc->>'warn_escalated_tx_30d')::int, 3);
    v_r_esc     := COALESCE((v_vc->>'restrict_escalated_tx_30d')::int, 5);
    v_w_lost    := COALESCE((v_vc->>'warn_lost_disputes_30d')::int, 2);
    v_r_lost    := COALESCE((v_vc->>'restrict_lost_disputes_30d')::int, 3);
    v_w_comp    := COALESCE((v_vc->>'warn_verified_complaints_30d')::int, 2);
    v_r_comp    := COALESCE((v_vc->>'restrict_verified_complaints_30d')::int, 3);

    -- أ) ضبط مؤقت بدء التأخر overdue_since_at وعلامات دين D4
    IF v_fifo > 0 OR v_free < 0 OR v_cutoff_br THEN
        IF v_merch.overdue_since_at IS NULL THEN
            UPDATE sawyan.merchants SET overdue_since_at = sawyan.now_utc() WHERE id = p_merchant_id;
        END IF;
    ELSIF v_merch.overdue_since_at IS NOT NULL THEN
        UPDATE sawyan.merchants SET overdue_since_at = NULL WHERE id = p_merchant_id;
    END IF;

    IF v_merch.actual_cash_balance >= 0 AND (v_merch.metadata ? 'd4_debt_started_at') THEN
        v_local_today := to_char(sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM-DD');
        UPDATE sawyan.merchants
           SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'd4_debt_started_at')
                          || jsonb_build_object('last_d4_settlement_date', v_local_today)
         WHERE id = p_merchant_id;
    END IF;

    -- ب) التصعيدات التلقائية التصاعدية الصارمة (Auto-Escalations)
    IF v_over_days >= v_def_days AND v_gov NOT IN ('suspended_compliance', 'banned_permanent') THEN
        v_new_gov    := 'suspended_compliance';
        v_new_reason := 'تصعيد امتثال تلقائي: استمرار مديونية/طابور FIFO أو عدم السداد لمدة >= ' || v_def_days || ' يوماً';
    ELSIF (
        v_goug_cnt >= 3
        OR v_esc_30d >= v_r_esc
        OR v_lost_30d >= v_r_lost
        OR v_comp_30d >= v_r_comp
    ) AND v_gov IN ('good_standing', 'probation_warning') THEN
        v_new_gov := 'restricted_no_reject';
        IF v_goug_cnt >= 3 THEN
            v_new_reason := 'تقييد تلقائي (درجة 2 / S10): وصول بلاغات التلاعب بالأسعار الموثقة إلى ' || v_goug_cnt || ' أعضاء';
        ELSE
            v_new_reason := 'تقييد تلقائي (درجة 2): تجاوز سقف المخالفات خلال 30 يوماً (معلقة متأخرة=' || v_esc_30d || '، نزاعات خاسرة=' || v_lost_30d || '، شكاوى موثقة=' || v_comp_30d || ')';
        END IF;
    ELSIF (
        v_esc_30d >= v_w_esc
        OR v_lost_30d >= v_w_lost
        OR v_comp_30d >= v_w_comp
    ) AND v_gov = 'good_standing' THEN
        v_new_gov    := 'probation_warning';
        v_new_reason := 'تحت المراقبة والإنذار (درجة 1): رصد تنبيهات امتثال خلال 30 يوماً (معلقة متأخرة=' || v_esc_30d || '، نزاعات خاسرة=' || v_lost_30d || '، شكاوى موثقة=' || v_comp_30d || ')';
    END IF;

    IF v_new_gov IS NOT NULL AND v_new_gov IS DISTINCT FROM v_merch.governance_status THEN
        UPDATE sawyan.merchants
           SET governance_status           = v_new_gov,
               pre_pause_governance_status = CASE WHEN v_new_gov IN ('restricted_no_reject', 'suspended_compliance', 'banned_permanent') THEN NULL ELSE pre_pause_governance_status END,
               governance_reason           = v_new_reason,
               governance_updated_at       = now()
         WHERE id = p_merchant_id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES
            ('merchant', p_merchant_id, 'MerchantComplianceAutoEscalated', 'in_app',
             jsonb_build_object('merchant_code', v_merch.merchant_code, 'new_governance_status', v_new_gov, 'reason', v_new_reason), now()),
            ('admin', p_merchant_id, 'MerchantComplianceAutoEscalated', 'in_app',
             jsonb_build_object('merchant_id', p_merchant_id, 'merchant_code', v_merch.merchant_code, 'business_name', v_merch.business_name, 'new_governance_status', v_new_gov, 'reason', v_new_reason), now());

        PERFORM sawyan.append_audit_log(
            'system', p_merchant_id, 'merchant_auto_escalated_' || v_new_gov, 'merchants', p_merchant_id::text,
            jsonb_build_object('governance_status', v_merch.governance_status),
            jsonb_build_object('governance_status', v_new_gov, 'reason', v_new_reason)
        );
    END IF;

    -- ج) مزامنة العمودين الموروثين is_active & is_isolated بدقة
    v_eff       := sawyan.compute_merchant_effective_state(p_merchant_id);
    v_can_login := COALESCE((v_eff->'effective_access'->>'can_login_portal')::boolean, true);
    v_vis_radar := COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false);

    UPDATE sawyan.merchants
       SET is_active   = v_can_login,
           is_isolated = NOT v_vis_radar
     WHERE id = p_merchant_id
       AND (is_active IS DISTINCT FROM v_can_login OR is_isolated IS DISTINCT FROM (NOT v_vis_radar));

    RETURN v_eff;
END;
$$;

-- 6. ترقية زناد بلاغات رفع الأسعار S10 لتشغيل sync_merchant_status_flags فور 3 بلاغات موثقة
CREATE OR REPLACE FUNCTION sawyan.check_price_gouging_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_verified_count INT;
    v_member_ids     UUID[];
BEGIN
    IF NEW.verification_status = 'verified_violation' THEN
        SELECT COUNT(DISTINCT member_id), ARRAY_AGG(DISTINCT member_id)
          INTO v_verified_count, v_member_ids
          FROM sawyan.price_gouging_reports
         WHERE merchant_id = NEW.merchant_id
           AND verification_status = 'verified_violation';

        IF v_verified_count >= 3 THEN
            INSERT INTO sawyan.fraud_graph_signals (
                signal_type, severity, involved_member_ids, involved_merchant_id, evidence_payload, status
            ) VALUES (
                'price_gouging_threshold_3',
                'high',
                v_member_ids,
                NEW.merchant_id,
                jsonb_build_object('verified_reports', v_verified_count, 'trigger_report_id', NEW.id),
                'open'
            );
            PERFORM sawyan.sync_merchant_status_flags(NEW.merchant_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 7. ترقية دوال التاجر والعمليات والبحث والإدارة لتعمل بالمحاور الثلاثة بالكامل
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.verify_merchant_session(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL
) RETURNS sawyan.merchants
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch    sawyan.merchants%ROWTYPE;
    v_stored   TEXT;
    v_jwt_role TEXT;
BEGIN
    SELECT * INTO v_merch FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;
    IF v_merch.onboarding_status = 'rejected' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_REJECTED';
    END IF;
    IF v_merch.governance_status = 'banned_permanent' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_BANNED';
    END IF;

    v_jwt_role := NULLIF(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
        RETURN v_merch;
    END IF;

    v_stored := v_merch.metadata->>'active_session_token';
    IF v_stored IS NOT NULL AND p_session_token IS NOT NULL AND v_stored = p_session_token THEN
        RETURN v_merch;
    END IF;

    IF p_session_token = 'DEMO_PREVIEW_MERCHANT_EG1' AND v_merch.email LIKE '%@merchant.demo' THEN
        RETURN v_merch;
    END IF;

    RAISE EXCEPTION 'UNAUTHORIZED_MERCHANT_SESSION';
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.authenticate_merchant_login(
    p_identifier TEXT,
    p_password   TEXT
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_ident        TEXT;
    v_phone_clean  TEXT;
    v_digits       TEXT;
    v_local_suffix TEXT;
    v_match_count  INT;
    v_merch        sawyan.merchants%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_token        TEXT;
    v_eff          JSONB;
BEGIN
    v_ident := trim(COALESCE(p_identifier, ''));
    IF v_ident = '' OR COALESCE(p_password, '') = '' THEN
        RAISE EXCEPTION 'CREDENTIALS_REQUIRED';
    END IF;

    IF trim(p_password) = '123456' THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED';
    END IF;

    v_phone_clean := regexp_replace(v_ident, '[\s\-\(\)]+', '', 'g');
    v_digits := regexp_replace(v_phone_clean, '[^0-9]', '', 'g');

    SELECT * INTO v_merch
      FROM sawyan.merchants
     WHERE upper(merchant_code) = upper(v_ident)
        OR lower(email) = lower(v_ident)
        OR phone = v_phone_clean
        OR (v_digits <> '' AND phone = '+' || v_digits)
     LIMIT 1;

    IF NOT FOUND AND length(v_digits) >= 8 AND position('@' IN v_ident) = 0 THEN
        v_local_suffix := regexp_replace(v_digits, '^0+', '');
        IF length(v_local_suffix) >= 8 THEN
            SELECT count(*) INTO v_match_count
              FROM sawyan.merchants
             WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || v_local_suffix;
            IF v_match_count = 1 THEN
                SELECT * INTO v_merch
                  FROM sawyan.merchants
                 WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE '%' || v_local_suffix
                 LIMIT 1;
            END IF;
        END IF;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_MERCHANT_CREDENTIALS';
    END IF;
    IF v_merch.onboarding_status = 'rejected' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_REJECTED';
    END IF;
    IF v_merch.governance_status = 'banned_permanent' THEN
        RAISE EXCEPTION 'MERCHANT_ACCOUNT_BANNED';
    END IF;
    IF v_merch.password_hash IS NULL OR v_merch.password_hash <> extensions.crypt(p_password, v_merch.password_hash) THEN
        RAISE EXCEPTION 'INVALID_MERCHANT_CREDENTIALS';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    v_token := encode(extensions.gen_random_bytes(32), 'hex');

    UPDATE sawyan.merchants
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('active_session_token', v_token, 'last_login_at', now())
     WHERE id = v_merch.id;

    v_eff := sawyan.sync_merchant_status_flags(v_merch.id);

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_token,
        'merchant', jsonb_build_object(
            'id', v_merch.id,
            'merchant_code', v_merch.merchant_code,
            'business_name', v_merch.business_name,
            'owner_name', v_merch.owner_name,
            'email', v_merch.email,
            'phone', v_merch.phone,
            'category', v_merch.category,
            'merchant_type', v_merch.merchant_type,
            'deduction_percent', v_merch.deduction_percent,
            'country_code', v_country.country_code,
            'currency_code', v_country.currency_code,
            'onboarding_status', v_eff->>'onboarding_status',
            'financial_status', v_eff->>'financial_status',
            'governance_status', v_eff->>'governance_status',
            'effective_access', v_eff->'effective_access',
            'must_change_password', COALESCE((v_merch.metadata->>'must_change_password')::boolean, false)
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.register_new_merchant(
    p_business_name            VARCHAR(180),
    p_owner_name               VARCHAR(150),
    p_phone                    VARCHAR(24),
    p_password                 TEXT,
    p_country_code             CHAR(2) DEFAULT 'EG',
    p_category                 VARCHAR(60) DEFAULT 'supermarket',
    p_merchant_type            VARCHAR(20) DEFAULT 'physical',
    p_deduction_percent        NUMERIC(5,2) DEFAULT NULL,
    p_email                    VARCHAR(255) DEFAULT NULL,
    p_address                  TEXT DEFAULT NULL,
    p_city_geoname_id          BIGINT DEFAULT NULL,
    p_latitude                 NUMERIC(9,6) DEFAULT NULL,
    p_longitude                NUMERIC(9,6) DEFAULT NULL,
    p_onboarded_by_member_code BIGINT DEFAULT NULL,
    p_initial_cashier_pin      TEXT DEFAULT NULL,
    p_metadata                 JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_country        sawyan.countries%ROWTYPE;
    v_clean_name     VARCHAR(180);
    v_clean_owner    VARCHAR(150);
    v_clean_phone    VARCHAR(24);
    v_clean_email    VARCHAR(255);
    v_cat_slug       VARCHAR(60);
    v_mtype          VARCHAR(20);
    v_onboarder_id   UUID := NULL;
    v_onboarder_src  VARCHAR(30) := NULL;
    v_seq_num        BIGINT;
    v_mcode          VARCHAR(20);
    v_pw_hash        TEXT;
    v_session_token  TEXT;
    v_merch_id       UUID;
    v_branch_id      UUID;
    v_lat            NUMERIC(9,6);
    v_lng            NUMERIC(9,6);
    v_eff_pct        NUMERIC(5,2);
    v_comm_pending   BOOLEAN := false;
    v_safe_meta      JSONB := '{}'::jsonb;
    v_logo           TEXT;
    v_cover          TEXT;
    v_img_arr        JSONB := '[]'::jsonb;
    v_img_item       TEXT;
    v_img_cnt        INT := 0;
    v_kyc_obj        JSONB := '{}'::jsonb;
    v_k_key          TEXT;
    v_k_val          TEXT;
    v_district       TEXT;
    v_city_name      TEXT;
    v_comm_reg       TEXT;
    v_tax_id         TEXT;
    v_addr_fallback  BOOLEAN := false;
    v_geo_fallback   BOOLEAN := false;
    v_prof_eval      JSONB;
    v_onboard_st     VARCHAR(30);
    v_eff            JSONB;
BEGIN
    v_clean_name := trim(COALESCE(p_business_name, ''));
    IF char_length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'MERCHANT_BUSINESS_NAME_REQUIRED';
    END IF;

    IF p_password IS NULL OR char_length(p_password) < 8 OR lower(trim(p_password)) IN ('123456', '12345678', 'password', 'qwerty123') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN';
    END IF;

    SELECT * INTO v_country FROM sawyan.countries WHERE country_code = upper(trim(COALESCE(p_country_code, 'EG')));
    IF NOT FOUND THEN
        RAISE EXCEPTION 'COUNTRY_NOT_SUPPORTED: %', p_country_code;
    END IF;
    IF NOT v_country.is_active THEN
        RAISE EXCEPTION 'COUNTRY_GATE_INACTIVE_D13: %', v_country.country_code;
    END IF;

    v_clean_owner := trim(COALESCE(p_owner_name, ''));
    IF v_clean_owner = '' AND sawyan.is_reg_field_required('merchant', 'owner_name', 'initial') THEN
        RAISE EXCEPTION 'MERCHANT_OWNER_NAME_REQUIRED';
    END IF;
    v_clean_owner := COALESCE(NULLIF(v_clean_owner, ''), v_clean_name);

    v_clean_phone := sawyan.validate_and_normalize_e164_phone(v_country.country_code, p_phone);

    v_clean_email := sawyan.validate_strict_email(p_email);
    IF v_clean_email IS NULL AND sawyan.is_reg_field_required('merchant', 'email', 'initial') THEN
        RAISE EXCEPTION 'MERCHANT_EMAIL_REQUIRED';
    END IF;

    v_mtype := lower(trim(COALESCE(p_merchant_type, 'physical')));
    IF v_mtype NOT IN ('physical', 'online', 'both') THEN
        v_mtype := 'physical';
    END IF;

    IF p_deduction_percent IS NULL THEN
        IF sawyan.is_reg_field_required('merchant', 'commission_percent', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_COMMISSION_REQUIRED';
        END IF;
        v_eff_pct := 0.00;
        v_comm_pending := true;
    ELSE
        IF p_deduction_percent < 0.50 OR p_deduction_percent > 95.00 THEN
            RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
        END IF;
        v_eff_pct := ROUND(p_deduction_percent::numeric, 2);
        v_comm_pending := false;
    END IF;

    SELECT slug INTO v_cat_slug FROM sawyan.categories WHERE slug = lower(trim(COALESCE(p_category, 'other')));
    IF NOT FOUND THEN
        v_cat_slug := 'other';
    END IF;

    IF p_onboarded_by_member_code IS NULL THEN
        IF sawyan.is_reg_field_required('merchant', 'onboarded_by_code', 'initial') THEN
            RAISE EXCEPTION 'ONBOARDER_CODE_REQUIRED';
        END IF;
    ELSIF p_onboarded_by_member_code = 0 THEN
        SELECT id INTO v_onboarder_id FROM sawyan.members WHERE member_code = 0 LIMIT 1;
        v_onboarder_src := 'company_direct';
    ELSIF p_onboarded_by_member_code > 0 THEN
        SELECT id INTO v_onboarder_id FROM sawyan.members WHERE member_code = p_onboarded_by_member_code AND is_tombstone_banned = false;
        IF v_onboarder_id IS NULL THEN
            RAISE EXCEPTION 'ONBOARDER_MEMBER_NOT_FOUND: %', p_onboarded_by_member_code;
        END IF;
        v_onboarder_src := 'member_ambassador';
    ELSE
        RAISE EXCEPTION 'ONBOARDER_MEMBER_NOT_FOUND: %', p_onboarded_by_member_code;
    END IF;

    v_district  := NULLIF(trim(COALESCE(p_metadata->>'district', '')), '');
    v_city_name := NULLIF(trim(COALESCE(p_metadata->>'city_name', '')), '');
    v_comm_reg  := NULLIF(trim(COALESCE(p_metadata->>'commercial_reg_no', '')), '');
    v_tax_id    := NULLIF(trim(COALESCE(p_metadata->>'tax_id', '')), '');

    -- حظر إعادة تسجيل التاجر المحظور نهائياً بالهاتف أو السجل أو الرقم الضريبي
    IF EXISTS (
        SELECT 1
          FROM sawyan.merchants bm
         WHERE bm.governance_status = 'banned_permanent'
           AND (
               bm.phone = v_clean_phone
               OR (v_comm_reg IS NOT NULL AND NULLIF(trim(COALESCE(bm.metadata->>'commercial_reg_no', '')), '') = v_comm_reg)
               OR (v_tax_id IS NOT NULL AND NULLIF(trim(COALESCE(bm.tax_registration_no, bm.metadata->>'tax_id', '')), '') = v_tax_id)
           )
    ) THEN
        RAISE EXCEPTION 'MERCHANT_BANNED_RE_REGISTRATION_BLOCKED';
    END IF;

    IF sawyan.is_reg_field_required('merchant', 'city', 'initial')
       AND p_city_geoname_id IS NULL AND v_city_name IS NULL AND NULLIF(trim(COALESCE(p_address, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MERCHANT_CITY_REQUIRED';
    END IF;

    IF v_mtype IN ('physical', 'both')
       AND sawyan.is_reg_field_required('merchant', 'district', 'initial')
       AND v_district IS NULL AND NULLIF(trim(COALESCE(p_address, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MERCHANT_DISTRICT_REQUIRED';
    END IF;

    IF sawyan.is_reg_field_required('merchant', 'address', 'initial') AND NULLIF(trim(COALESCE(p_address, '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_ADDRESS_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'business_description', 'initial') AND NULLIF(trim(COALESCE(p_metadata->>'description', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_DESCRIPTION_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'website_url', 'initial') AND v_mtype IN ('online', 'both') AND NULLIF(trim(COALESCE(p_metadata->>'website_url', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_WEBSITE_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'whatsapp', 'initial') AND NULLIF(trim(COALESCE(p_metadata->>'whatsapp', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_WHATSAPP_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'geo_location', 'initial') AND (p_latitude IS NULL OR p_longitude IS NULL) AND NULLIF(trim(COALESCE(p_metadata->>'google_maps_url', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_GEO_LOCATION_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'commercial_reg_no', 'initial') AND v_comm_reg IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_COMMERCIAL_REG_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'tax_id', 'initial') AND v_tax_id IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_TAX_ID_REQUIRED';
    END IF;

    IF p_initial_cashier_pin IS NOT NULL AND trim(p_initial_cashier_pin) <> '' AND trim(p_initial_cashier_pin) !~ '^\d{4}$' THEN
        RAISE EXCEPTION 'INVALID_CASHIER_PIN_FORMAT';
    END IF;
    IF (p_initial_cashier_pin IS NULL OR trim(p_initial_cashier_pin) = '') AND sawyan.is_reg_field_required('merchant', 'initial_cashier_pin', 'initial') THEN
        RAISE EXCEPTION 'INITIAL_CASHIER_PIN_REQUIRED';
    END IF;

    IF EXISTS (SELECT 1 FROM sawyan.merchants WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'MERCHANT_PHONE_ALREADY_REGISTERED';
    END IF;

    IF v_clean_email IS NOT NULL AND EXISTS (SELECT 1 FROM sawyan.merchants WHERE lower(email) = v_clean_email) THEN
        RAISE EXCEPTION 'MERCHANT_EMAIL_ALREADY_REGISTERED';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_merchant_code_seq'));
    SELECT COUNT(*) + 101 INTO v_seq_num FROM sawyan.merchants WHERE country_id = v_country.id;
    LOOP
        v_mcode := 'M-' || v_country.country_code || '-' || v_seq_num::text;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM sawyan.merchants WHERE merchant_code = v_mcode);
        v_seq_num := v_seq_num + 1;
    END LOOP;

    IF v_clean_email IS NULL THEN
        v_clean_email := lower(replace(v_mcode, '-', '')) || '@merchants.SAWYAN.global';
    END IF;

    v_pw_hash       := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(32), 'hex');

    v_addr_fallback := (NULLIF(trim(COALESCE(p_address, '')), '') IS NULL);
    v_geo_fallback  := ((p_latitude IS NULL OR p_longitude IS NULL) AND NULLIF(trim(COALESCE(p_metadata->>'google_maps_url', '')), '') IS NULL);

    v_lat := COALESCE(p_latitude, CASE WHEN v_country.country_code = 'TR' THEN 41.008200 WHEN v_country.country_code = 'SA' THEN 24.713552 ELSE 30.044400 END);
    v_lng := COALESCE(p_longitude, CASE WHEN v_country.country_code = 'TR' THEN 28.978400 WHEN v_country.country_code = 'SA' THEN 46.675296 ELSE 31.235700 END);

    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        IF v_district IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('district', left(v_district, 120)); END IF;
        IF v_city_name IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('city_name', left(v_city_name, 120)); END IF;
        IF p_city_geoname_id IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('city_geoname_id', p_city_geoname_id); END IF;
        IF p_metadata ? 'description' AND NULLIF(trim(COALESCE(p_metadata->>'description', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('description', left(trim(p_metadata->>'description'), 1000));
        END IF;
        IF p_metadata ? 'website_url' AND NULLIF(trim(COALESCE(p_metadata->>'website_url', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('website_url', left(trim(p_metadata->>'website_url'), 300));
        END IF;
        IF p_metadata ? 'webhook_url' AND NULLIF(trim(COALESCE(p_metadata->>'webhook_url', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('webhook_url', left(trim(p_metadata->>'webhook_url'), 300));
        END IF;
        IF p_metadata ? 'whatsapp' AND NULLIF(trim(COALESCE(p_metadata->>'whatsapp', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('whatsapp', left(trim(p_metadata->>'whatsapp'), 40));
        END IF;
        IF p_metadata ? 'google_maps_url' AND NULLIF(trim(COALESCE(p_metadata->>'google_maps_url', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('google_maps_url', left(trim(p_metadata->>'google_maps_url'), 400));
        END IF;
        IF p_metadata ? 'social' AND jsonb_typeof(p_metadata->'social') = 'object' THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('social', p_metadata->'social');
        END IF;
        IF p_metadata ? 'working_hours' AND p_metadata->'working_hours' IS NOT NULL AND jsonb_typeof(p_metadata->'working_hours') <> 'null' THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('working_hours', p_metadata->'working_hours');
        END IF;
        IF v_comm_reg IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('commercial_reg_no', left(v_comm_reg, 80));
        END IF;
        IF v_tax_id IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('tax_id', left(v_tax_id, 80));
        END IF;
        IF p_metadata ? 'wifi_ssid' AND NULLIF(trim(COALESCE(p_metadata->>'wifi_ssid', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('wifi_ssid', left(trim(p_metadata->>'wifi_ssid'), 80));
        END IF;

        v_logo := sawyan.validate_attachment_data(p_metadata->>'logo_url', 200000, true);
        IF v_logo IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('logo_url', v_logo); END IF;
        IF v_logo IS NULL AND sawyan.is_reg_field_required('merchant', 'logo_url', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_LOGO_REQUIRED';
        END IF;

        v_cover := sawyan.validate_attachment_data(p_metadata->>'cover_image_url', 480000, true);
        IF v_cover IS NOT NULL THEN v_safe_meta := v_safe_meta || jsonb_build_object('cover_image_url', v_cover); END IF;
        IF v_cover IS NULL AND sawyan.is_reg_field_required('merchant', 'cover_image_url', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_COVER_REQUIRED';
        END IF;

        IF p_metadata ? 'images' AND jsonb_typeof(p_metadata->'images') = 'array' THEN
            FOR v_img_item IN SELECT elem #>> '{}' FROM jsonb_array_elements(p_metadata->'images') elem LOOP
                IF v_img_cnt >= 6 THEN EXIT; END IF;
                v_img_item := sawyan.validate_attachment_data(v_img_item, 350000, true);
                IF v_img_item IS NOT NULL THEN
                    v_img_arr := v_img_arr || to_jsonb(v_img_item);
                    v_img_cnt := v_img_cnt + 1;
                END IF;
            END LOOP;
            IF v_img_cnt > 0 THEN v_safe_meta := v_safe_meta || jsonb_build_object('images', v_img_arr); END IF;
        END IF;

        IF p_metadata ? 'kyc_docs' AND jsonb_typeof(p_metadata->'kyc_docs') = 'object' THEN
            FOR v_k_key, v_k_val IN SELECT key, value FROM jsonb_each_text(p_metadata->'kyc_docs') LOOP
                IF v_k_key IN ('commercial_reg', 'tax_card', 'owner_id', 'store_license', 'storefront_photo') THEN
                    v_k_val := sawyan.validate_attachment_data(v_k_val, 480000, true);
                    IF v_k_val IS NOT NULL THEN v_kyc_obj := v_kyc_obj || jsonb_build_object(v_k_key, v_k_val); END IF;
                END IF;
            END LOOP;
            IF v_kyc_obj <> '{}'::jsonb THEN v_safe_meta := v_safe_meta || jsonb_build_object('kyc_docs', v_kyc_obj); END IF;
        END IF;
    END IF;

    IF v_onboarder_src IS NOT NULL THEN
        v_safe_meta := v_safe_meta || jsonb_build_object('onboarded_source', v_onboarder_src);
    END IF;
    v_safe_meta := v_safe_meta || jsonb_build_object(
        'commission_pending', v_comm_pending,
        'commission_locked', false,
        'address_is_fallback', v_addr_fallback,
        'geo_is_fallback', v_geo_fallback
    );

    INSERT INTO sawyan.merchants (
        merchant_code, country_id, onboarded_by_member_id, business_name, owner_name,
        email, phone, category, merchant_type, deduction_percent,
        package_base_amount, actual_cash_balance, soft_hold_balance, credit_limit,
        is_isolated, address, latitude, longitude, is_active,
        onboarding_status, governance_status, tax_registration_no,
        password_hash, metadata
    ) VALUES (
        v_mcode, v_country.id, v_onboarder_id, v_clean_name, v_clean_owner,
        v_clean_email, v_clean_phone, v_cat_slug, v_mtype, v_eff_pct,
        0.00, 0.00, 0.00, 0.00,
        true, COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), COALESCE(v_city_name || COALESCE(' - ' || v_district, ''), v_clean_name || ' - الفرع الرئيسي')),
        v_lat, v_lng, true,
        'draft_incomplete', 'good_standing', v_tax_id,
        v_pw_hash,
        v_safe_meta || jsonb_build_object('active_session_token', v_session_token, 'last_login_at', now())
    ) RETURNING id INTO v_merch_id;

    INSERT INTO sawyan.merchant_branches (
        merchant_id, branch_code, branch_name, is_main_branch, city_geoname_id,
        address, latitude, longitude, branch_phone, branch_manager_name, is_branch_active
    ) VALUES (
        v_merch_id, 'BR-01', 'الفرع الرئيسي — ' || v_clean_name, true, p_city_geoname_id,
        COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), COALESCE(v_city_name || COALESCE(' - ' || v_district, ''), 'الفرع الرئيسي')),
        v_lat, v_lng, v_clean_phone, v_clean_owner, true
    ) RETURNING id INTO v_branch_id;

    IF p_initial_cashier_pin IS NOT NULL AND trim(p_initial_cashier_pin) ~ '^\d{4}$' THEN
        INSERT INTO sawyan.cashier_employees (
            merchant_id, branch_id, employee_code, full_name, pin_hash, is_active
        ) VALUES (
            v_merch_id, v_branch_id, 'EMP-01', 'المالك / المُوثِّق الرئيسي — ' || v_clean_owner,
            extensions.crypt(trim(p_initial_cashier_pin), extensions.gen_salt('bf', 10)), true
        );
    END IF;

    v_prof_eval  := sawyan.evaluate_merchant_profile_complete(v_merch_id);
    v_onboard_st := CASE WHEN COALESCE((v_prof_eval->>'is_complete')::boolean, false) THEN 'approved' ELSE 'draft_incomplete' END;

    UPDATE sawyan.merchants
       SET onboarding_status = v_onboard_st
     WHERE id = v_merch_id;

    v_eff := sawyan.sync_merchant_status_flags(v_merch_id);

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch_id, 'merchant_registered_v3', 'merchants', v_merch_id::text,
        NULL, jsonb_build_object(
            'merchant_code', v_mcode, 'country', v_country.country_code,
            'deduction_percent', v_eff_pct, 'commission_pending', v_comm_pending,
            'onboarding_status', v_onboard_st
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_session_token,
        'main_branch_id', v_branch_id,
        'merchant', jsonb_build_object(
            'id', v_merch_id,
            'merchant_code', v_mcode,
            'business_name', v_clean_name,
            'owner_name', v_clean_owner,
            'email', v_clean_email,
            'phone', v_clean_phone,
            'country_code', v_country.country_code,
            'currency_code', v_country.currency_code,
            'category', v_cat_slug,
            'merchant_type', v_mtype,
            'deduction_percent', v_eff_pct,
            'commission_pending', v_comm_pending,
            'onboarding_status', v_eff->>'onboarding_status',
            'financial_status', v_eff->>'financial_status',
            'governance_status', v_eff->>'governance_status',
            'effective_access', v_eff->'effective_access'
        )
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.manage_merchant_cashier_and_settings(
    p_merchant_id        UUID,
    p_action             VARCHAR(30),
    p_session_token      TEXT DEFAULT NULL,
    p_business_name      VARCHAR(180) DEFAULT NULL,
    p_owner_name         VARCHAR(150) DEFAULT NULL,
    p_phone              VARCHAR(24) DEFAULT NULL,
    p_address            TEXT DEFAULT NULL,
    p_latitude           NUMERIC(9,6) DEFAULT NULL,
    p_longitude          NUMERIC(9,6) DEFAULT NULL,
    p_wifi_ssid          TEXT DEFAULT NULL,
    p_wifi_password      TEXT DEFAULT NULL,
    p_working_hours      TEXT DEFAULT NULL,
    p_current_password   TEXT DEFAULT NULL,
    p_new_password       TEXT DEFAULT NULL,
    p_employee_code      VARCHAR(30) DEFAULT NULL,
    p_employee_name      VARCHAR(150) DEFAULT NULL,
    p_employee_pin       TEXT DEFAULT NULL,
    p_linked_member_code BIGINT DEFAULT NULL,
    p_max_tx_limit       NUMERIC(18,2) DEFAULT NULL,
    p_employee_id        UUID DEFAULT NULL,
    p_branch_id          UUID DEFAULT NULL,
    p_media_patch        JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch       sawyan.merchants%ROWTYPE;
    v_country     sawyan.countries%ROWTYPE;
    v_main_br_id  UUID;
    v_act         VARCHAR(30);
    v_linked_mid  UUID := NULL;
    v_new_emp_id  UUID;
    v_emp_code    VARCHAR(30);
    v_emp_seq     INT;
    v_emp_phone   VARCHAR(24);
    v_notify_rt   BOOLEAN := true;
    v_meta_patch  JSONB := '{}'::jsonb;
    v_logo        TEXT;
    v_cover       TEXT;
    v_img_arr     JSONB := '[]'::jsonb;
    v_img_item    TEXT;
    v_img_cnt     INT := 0;
    v_kyc_obj     JSONB := '{}'::jsonb;
    v_k_key       TEXT;
    v_k_val       TEXT;
    v_new_ded     NUMERIC(5,2) := NULL;
    v_new_type    VARCHAR(20) := NULL;
    v_new_cat     VARCHAR(60) := NULL;
    v_new_email   VARCHAR(255) := NULL;
    v_new_phone   VARCHAR(24) := NULL;
    v_city_gid    BIGINT := NULL;
    v_new_tax_id  VARCHAR(64) := NULL;
    v_eff         JSONB;
    v_portal_mode VARCHAR(30);
    v_prof_eval   JSONB;
    v_pause_note  TEXT;
    v_prev_gov    VARCHAR(30);
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    v_act := lower(trim(COALESCE(p_action, 'update_profile')));
    v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
    v_portal_mode := COALESCE(v_eff->'effective_access'->>'portal_access_mode', 'full');

    SELECT id INTO v_main_br_id
      FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    -- تبديل وضع الإجازة / الإغلاق المؤقت بطلب التاجر
    IF v_act = 'toggle_merchant_pause' THEN
        v_pause_note := COALESCE(
            NULLIF(trim(COALESCE(p_media_patch->>'pause_reason', '')), ''),
            NULLIF(trim(COALESCE(p_working_hours, '')), '')
        );
        IF v_merch.governance_status = 'paused_by_merchant' THEN
            v_prev_gov := COALESCE(v_merch.pre_pause_governance_status, 'good_standing');
            UPDATE sawyan.merchants
               SET governance_status           = v_prev_gov,
                   pre_pause_governance_status = NULL,
                   governance_reason           = COALESCE(v_pause_note, 'استئناف نشاط المتجر بعد الإجازة المؤقتة'),
                   governance_updated_at       = now()
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        ELSIF v_merch.governance_status IN ('good_standing', 'probation_warning') THEN
            UPDATE sawyan.merchants
               SET pre_pause_governance_status = v_merch.governance_status,
                   governance_status           = 'paused_by_merchant',
                   governance_reason           = COALESCE(v_pause_note, 'إجازة / إغلاق مؤقت بطلب التاجر'),
                   governance_updated_at       = now()
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        ELSE
            RAISE EXCEPTION 'MERCHANT_CANNOT_SELF_PAUSE_UNDER_SANCTION: %', v_merch.governance_status;
        END IF;

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'merchant_pause_toggled', 'merchants', v_merch.id::text,
            NULL, jsonb_build_object('governance_status', v_merch.governance_status, 'reason', v_merch.governance_reason)
        );
        v_eff := sawyan.sync_merchant_status_flags(v_merch.id);
        RETURN jsonb_build_object(
            'success', true,
            'action', 'toggle_merchant_pause',
            'governance_status', v_eff->>'governance_status',
            'pre_pause_governance_status', v_eff->>'pre_pause_governance_status',
            'effective_access', v_eff->'effective_access'
        );
    END IF;

    IF v_act IN ('update_profile', 'update_media') THEN
        IF v_act = 'update_profile' THEN
            IF p_wifi_ssid IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('wifi_ssid', trim(p_wifi_ssid), 'wifi_password', COALESCE(p_wifi_password, ''));
            END IF;
            IF p_working_hours IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('working_hours', trim(p_working_hours));
            END IF;
            IF p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
                v_new_phone := sawyan.validate_and_normalize_e164_phone(v_country.country_code, p_phone);
            END IF;
            IF NULLIF(trim(COALESCE(p_address, '')), '') IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('address_is_fallback', false);
            END IF;
            IF (p_latitude IS NOT NULL AND p_longitude IS NOT NULL) THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('geo_is_fallback', false);
            END IF;
            IF NULLIF(trim(COALESCE(p_new_password, '')), '') IS NOT NULL THEN
                IF char_length(p_new_password) < 8 OR lower(trim(p_new_password)) IN ('123456', '12345678', 'password') THEN
                    RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN';
                END IF;
                IF v_merch.password_hash IS NOT NULL AND (p_current_password IS NULL OR v_merch.password_hash <> extensions.crypt(p_current_password, v_merch.password_hash)) THEN
                    RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
                END IF;
                UPDATE sawyan.merchants SET password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)) WHERE id = v_merch.id;
            END IF;
        END IF;

        IF p_media_patch IS NOT NULL AND jsonb_typeof(p_media_patch) = 'object' THEN
            IF p_media_patch ? 'logo_url' THEN
                IF trim(COALESCE(p_media_patch->>'logo_url', '')) = '' THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('logo_url', NULL);
                ELSE
                    v_logo := sawyan.validate_attachment_data(p_media_patch->>'logo_url', 200000, true);
                    v_meta_patch := v_meta_patch || jsonb_build_object('logo_url', v_logo);
                END IF;
            END IF;
            IF p_media_patch ? 'cover_image_url' THEN
                IF trim(COALESCE(p_media_patch->>'cover_image_url', '')) = '' THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('cover_image_url', NULL);
                ELSE
                    v_cover := sawyan.validate_attachment_data(p_media_patch->>'cover_image_url', 480000, true);
                    v_meta_patch := v_meta_patch || jsonb_build_object('cover_image_url', v_cover);
                END IF;
            END IF;
            IF p_media_patch ? 'images' AND jsonb_typeof(p_media_patch->'images') = 'array' THEN
                FOR v_img_item IN SELECT elem #>> '{}' FROM jsonb_array_elements(p_media_patch->'images') elem LOOP
                    IF v_img_cnt >= 6 THEN EXIT; END IF;
                    v_img_item := sawyan.validate_attachment_data(v_img_item, 350000, true);
                    IF v_img_item IS NOT NULL THEN
                        v_img_arr := v_img_arr || to_jsonb(v_img_item);
                        v_img_cnt := v_img_cnt + 1;
                    END IF;
                END LOOP;
                v_meta_patch := v_meta_patch || jsonb_build_object('images', v_img_arr);
            END IF;
            IF p_media_patch ? 'kyc_docs' AND jsonb_typeof(p_media_patch->'kyc_docs') = 'object' THEN
                v_kyc_obj := COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb);
                FOR v_k_key, v_k_val IN SELECT key, value FROM jsonb_each_text(p_media_patch->'kyc_docs') LOOP
                    IF v_k_key IN ('commercial_reg', 'tax_card', 'owner_id', 'store_license', 'storefront_photo') THEN
                        v_k_val := sawyan.validate_attachment_data(v_k_val, 480000, true);
                        IF v_k_val IS NOT NULL THEN
                            v_kyc_obj := v_kyc_obj || jsonb_build_object(v_k_key, v_k_val);
                        END IF;
                    END IF;
                END LOOP;
                v_meta_patch := v_meta_patch || jsonb_build_object('kyc_docs', v_kyc_obj);
            END IF;

            IF p_media_patch ? 'commercial_reg_no' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('commercial_reg_no', NULLIF(left(trim(COALESCE(p_media_patch->>'commercial_reg_no', '')), 80), ''));
            END IF;
            IF p_media_patch ? 'tax_id' THEN
                v_new_tax_id := NULLIF(left(trim(COALESCE(p_media_patch->>'tax_id', '')), 64), '');
                v_meta_patch := v_meta_patch || jsonb_build_object('tax_id', v_new_tax_id);
            END IF;
            IF p_media_patch ? 'description' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('description', NULLIF(left(trim(COALESCE(p_media_patch->>'description', '')), 1000), ''));
            END IF;
            IF p_media_patch ? 'district' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('district', NULLIF(left(trim(COALESCE(p_media_patch->>'district', '')), 120), ''));
            END IF;
            IF p_media_patch ? 'city_name' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('city_name', NULLIF(left(trim(COALESCE(p_media_patch->>'city_name', '')), 120), ''));
            END IF;
            IF p_media_patch ? 'city_geoname_id' AND NULLIF(trim(COALESCE(p_media_patch->>'city_geoname_id', '')), '') ~ '^\d+$' THEN
                v_city_gid := (p_media_patch->>'city_geoname_id')::bigint;
                IF EXISTS (SELECT 1 FROM sawyan.geonames_locations WHERE geoname_id = v_city_gid) THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('city_geoname_id', v_city_gid);
                ELSE
                    v_city_gid := NULL;
                END IF;
            END IF;
            IF p_media_patch ? 'google_maps_url' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('google_maps_url', NULLIF(left(trim(COALESCE(p_media_patch->>'google_maps_url', '')), 400), ''));
                IF NULLIF(trim(COALESCE(p_media_patch->>'google_maps_url', '')), '') IS NOT NULL THEN
                    v_meta_patch := v_meta_patch || jsonb_build_object('geo_is_fallback', false);
                END IF;
            END IF;
            IF p_media_patch ? 'website_url' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('website_url', NULLIF(left(trim(COALESCE(p_media_patch->>'website_url', '')), 300), ''));
            END IF;
            IF p_media_patch ? 'webhook_url' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('webhook_url', NULLIF(left(trim(COALESCE(p_media_patch->>'webhook_url', '')), 300), ''));
            END IF;
            IF p_media_patch ? 'whatsapp' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('whatsapp', NULLIF(left(trim(COALESCE(p_media_patch->>'whatsapp', '')), 40), ''));
            END IF;
            IF p_media_patch ? 'social' AND jsonb_typeof(p_media_patch->'social') = 'object' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('social', p_media_patch->'social');
            END IF;
            IF p_media_patch ? 'working_hours' AND p_media_patch->'working_hours' IS NOT NULL THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('working_hours', p_media_patch->'working_hours');
            END IF;
            IF p_media_patch ? 'email' AND NULLIF(trim(COALESCE(p_media_patch->>'email', '')), '') IS NOT NULL THEN
                v_new_email := sawyan.validate_strict_email(p_media_patch->>'email');
                IF EXISTS (SELECT 1 FROM sawyan.merchants WHERE lower(email) = v_new_email AND id <> v_merch.id) THEN
                    RAISE EXCEPTION 'MERCHANT_EMAIL_ALREADY_REGISTERED';
                END IF;
            END IF;
            IF p_media_patch ? 'merchant_type' AND lower(trim(COALESCE(p_media_patch->>'merchant_type', ''))) IN ('physical', 'online', 'both') THEN
                v_new_type := lower(trim(p_media_patch->>'merchant_type'));
            END IF;
            IF p_media_patch ? 'category' AND NULLIF(trim(COALESCE(p_media_patch->>'category', '')), '') IS NOT NULL THEN
                SELECT slug INTO v_new_cat FROM sawyan.categories WHERE slug = lower(trim(p_media_patch->>'category'));
            END IF;
            IF p_media_patch ? 'deduction_percent' AND NULLIF(trim(COALESCE(p_media_patch->>'deduction_percent', '')), '') IS NOT NULL THEN
                IF COALESCE((v_merch.metadata->>'commission_locked')::boolean, false) IS TRUE THEN
                    RAISE EXCEPTION 'MERCHANT_COMMISSION_LOCKED_BY_ADMIN';
                END IF;
                v_new_ded := ROUND((p_media_patch->>'deduction_percent')::numeric, 2);
                IF v_new_ded < 0.50 OR v_new_ded > 95.00 THEN
                    RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
                END IF;
                v_meta_patch := v_meta_patch || jsonb_build_object('commission_pending', false);
            END IF;
        END IF;

        IF v_act = 'update_profile' THEN
            UPDATE sawyan.merchants
               SET business_name       = COALESCE(NULLIF(trim(COALESCE(p_business_name, '')), ''), business_name),
                   owner_name          = COALESCE(NULLIF(trim(COALESCE(p_owner_name, '')), ''), owner_name),
                   phone               = COALESCE(v_new_phone, phone),
                   email               = COALESCE(v_new_email, email),
                   merchant_type       = COALESCE(v_new_type, merchant_type),
                   category            = COALESCE(v_new_cat, category),
                   deduction_percent   = COALESCE(v_new_ded, deduction_percent),
                   tax_registration_no = CASE WHEN p_media_patch ? 'tax_id' THEN v_new_tax_id ELSE tax_registration_no END,
                   address             = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
                   latitude            = COALESCE(p_latitude, latitude),
                   longitude           = COALESCE(p_longitude, longitude),
                   metadata            = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;

            IF v_main_br_id IS NOT NULL THEN
                UPDATE sawyan.merchant_branches
                   SET address         = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
                       latitude        = COALESCE(p_latitude, latitude),
                       longitude       = COALESCE(p_longitude, longitude),
                       city_geoname_id = COALESCE(v_city_gid, city_geoname_id),
                       branch_phone    = COALESCE(v_new_phone, branch_phone)
                 WHERE id = v_main_br_id;
            END IF;
        ELSE
            UPDATE sawyan.merchants
               SET deduction_percent   = COALESCE(v_new_ded, deduction_percent),
                   tax_registration_no = CASE WHEN p_media_patch ? 'tax_id' THEN v_new_tax_id ELSE tax_registration_no END,
                   metadata            = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        END IF;

        -- الانتقال التلقائي إلى approved فور استيفاء كافة الخانات الإلزامية باللوحة (بدون حاجة لموافقة إدارية يدوية)
        IF v_merch.onboarding_status IN ('draft_incomplete', 'needs_correction') THEN
            v_prof_eval := sawyan.evaluate_merchant_profile_complete(v_merch.id);
            IF COALESCE((v_prof_eval->>'is_complete')::boolean, false) IS TRUE THEN
                UPDATE sawyan.merchants
                   SET onboarding_status = 'approved',
                       onboarding_notes  = NULL
                 WHERE id = v_merch.id
                RETURNING * INTO v_merch;
            END IF;
        END IF;

        v_eff := sawyan.sync_merchant_status_flags(v_merch.id);
        SELECT * INTO v_merch FROM sawyan.merchants WHERE id = v_merch.id;

        RETURN jsonb_build_object(
            'success', true,
            'action', CASE WHEN v_act = 'update_media' THEN 'media_updated' ELSE 'profile_updated' END,
            'deduction_percent', v_merch.deduction_percent,
            'commission_pending', COALESCE((v_merch.metadata->>'commission_pending')::boolean, false),
            'onboarding_status', v_eff->>'onboarding_status',
            'financial_status', v_eff->>'financial_status',
            'governance_status', v_eff->>'governance_status',
            'effective_access', v_eff->'effective_access',
            'missing_required_fields', v_eff->'missing_required_fields',
            'logo_url', NULLIF(v_merch.metadata->>'logo_url', ''),
            'cover_image_url', NULLIF(v_merch.metadata->>'cover_image_url', ''),
            'images', CASE WHEN jsonb_typeof(v_merch.metadata->'images') = 'array' THEN v_merch.metadata->'images' ELSE '[]'::jsonb END,
            'kyc_docs', COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb)
        );

    ELSIF v_act IN ('add_cashier', 'toggle_cashier', 'reset_cashier_pin') THEN
        IF v_portal_mode IN ('topup_only', 'appeal_and_repay_only') THEN
            RAISE EXCEPTION 'MERCHANT_PORTAL_RESTRICTED_MODE: %', v_portal_mode;
        END IF;

        IF v_act = 'add_cashier' THEN
            IF trim(COALESCE(p_employee_name, '')) = '' THEN
                RAISE EXCEPTION 'CASHIER_CODE_AND_NAME_REQUIRED';
            END IF;
            IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
                RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
            END IF;

            v_emp_code := NULLIF(upper(trim(COALESCE(p_employee_code, ''))), '');
            IF v_emp_code IS NULL THEN
                SELECT COUNT(*) + 1 INTO v_emp_seq FROM sawyan.cashier_employees WHERE merchant_id = v_merch.id;
                LOOP
                    v_emp_code := 'EMP-' || lpad(v_emp_seq::text, 2, '0');
                    EXIT WHEN NOT EXISTS (SELECT 1 FROM sawyan.cashier_employees WHERE merchant_id = v_merch.id AND upper(employee_code) = v_emp_code);
                    v_emp_seq := v_emp_seq + 1;
                END LOOP;
            ELSIF sawyan.is_reg_field_required('employee_cashier', 'employee_code', 'initial') AND v_emp_code = '' THEN
                RAISE EXCEPTION 'CASHIER_CODE_AND_NAME_REQUIRED';
            END IF;

            v_emp_phone := NULLIF(trim(COALESCE(p_phone, p_media_patch->>'employee_phone', '')), '');
            IF v_emp_phone IS NOT NULL THEN
                v_emp_phone := sawyan.validate_and_normalize_e164_phone(v_country.country_code, v_emp_phone);
            ELSIF sawyan.is_reg_field_required('employee_cashier', 'employee_phone', 'initial') THEN
                RAISE EXCEPTION 'CASHIER_PHONE_REQUIRED';
            END IF;

            IF p_linked_member_code IS NOT NULL AND p_linked_member_code > 0 THEN
                SELECT id INTO v_linked_mid FROM sawyan.members WHERE member_code = p_linked_member_code;
                IF v_linked_mid IS NULL THEN
                    RAISE EXCEPTION 'LINKED_MEMBER_NOT_FOUND';
                END IF;
            ELSIF sawyan.is_reg_field_required('employee_cashier', 'linked_member_code', 'initial') THEN
                RAISE EXCEPTION 'CASHIER_LINKED_MEMBER_REQUIRED';
            END IF;

            IF p_max_tx_limit IS NULL AND sawyan.is_reg_field_required('employee_cashier', 'max_tx_amount_limit', 'initial') THEN
                RAISE EXCEPTION 'CASHIER_MAX_LIMIT_REQUIRED';
            END IF;

            IF p_media_patch IS NOT NULL AND (p_media_patch ? 'notify_owner_realtime') THEN
                v_notify_rt := COALESCE((p_media_patch->>'notify_owner_realtime')::boolean, true);
            END IF;

            INSERT INTO sawyan.cashier_employees (
                merchant_id, branch_id, employee_code, full_name, linked_member_id,
                pin_hash, max_tx_amount_limit, notify_owner_realtime, is_active
            ) VALUES (
                v_merch.id, COALESCE(p_branch_id, v_main_br_id), v_emp_code, trim(p_employee_name),
                v_linked_mid, extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
                p_max_tx_limit, v_notify_rt, true
            ) RETURNING id INTO v_new_emp_id;

            IF v_emp_phone IS NOT NULL THEN
                UPDATE sawyan.merchants
                   SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), ARRAY['cashier_phones', v_new_emp_id::text], to_jsonb(v_emp_phone), true)
                 WHERE id = v_merch.id;
            END IF;

            IF v_merch.onboarding_status IN ('draft_incomplete', 'needs_correction') THEN
                v_prof_eval := sawyan.evaluate_merchant_profile_complete(v_merch.id);
                IF COALESCE((v_prof_eval->>'is_complete')::boolean, false) IS TRUE THEN
                    UPDATE sawyan.merchants SET onboarding_status = 'approved', onboarding_notes = NULL WHERE id = v_merch.id;
                END IF;
            END IF;
            PERFORM sawyan.sync_merchant_status_flags(v_merch.id);

            PERFORM sawyan.append_audit_log(
                'merchant', v_merch.id, 'cashier_employee_added', 'cashier_employees', v_new_emp_id::text,
                NULL, jsonb_build_object('employee_code', v_emp_code, 'linked_member_code', p_linked_member_code, 'notify_owner_realtime', v_notify_rt)
            );
            RETURN jsonb_build_object('success', true, 'employee_id', v_new_emp_id, 'employee_code', v_emp_code);

        ELSIF v_act = 'toggle_cashier' THEN
            UPDATE sawyan.cashier_employees
               SET is_active           = NOT is_active,
                   failed_pin_attempts = 0,
                   pin_locked_until    = NULL
             WHERE id = p_employee_id AND merchant_id = v_merch.id;
            RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id);

        ELSE
            IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
                RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
            END IF;
            UPDATE sawyan.cashier_employees
               SET pin_hash            = extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
                   failed_pin_attempts = 0,
                   pin_locked_until    = NULL
             WHERE id = p_employee_id AND merchant_id = v_merch.id;
            RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_reset', true);
        END IF;
    ELSE
        RAISE EXCEPTION 'UNKNOWN_MERCHANT_MANAGE_ACTION: %', p_action;
    END IF;
END;
$$;

-- ============================================================================
-- 8. تحديث بوابات الفواتير والرصيد الفعلي وتغذية الهدف وإشعارات العتبات 30/20/10
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.feed_monthly_target_box(
    p_transaction_id UUID,
    p_actor_id       UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_tx            sawyan.transactions%ROWTYPE;
    v_member        sawyan.members%ROWTYPE;
    v_merchant      sawyan.merchants%ROWTYPE;
    v_branch        sawyan.merchant_branches%ROWTYPE;
    v_country       sawyan.countries%ROWTYPE;
    v_settings      sawyan.settings%ROWTYPE;
    v_cashier       sawyan.cashier_employees%ROWTYPE;
    v_prev_eff      JSONB;
    v_new_eff       JSONB;
    v_prev_fin      VARCHAR(30);
    v_new_fin       VARCHAR(30);
    v_eff_q_cap     INT;
    v_prev_status   VARCHAR(35);
    v_free_balance  NUMERIC(18,2);
    v_company_pct   NUMERIC(5,2);
    v_company_amt   NUMERIC(18,6);
    v_plan_local    NUMERIC(18,6);
    v_plan_usd      NUMERIC(18,6);
    v_debit_usd     NUMERIC(18,2);
    v_comp_usd_2    NUMERIC(18,2);
    v_plan_usd_2    NUMERIC(18,2);
    v_fx_diff_usd   NUMERIC(18,2);
    v_period_ym     CHAR(7);
    v_tx_ym         CHAR(7);
    v_curr_ym       CHAR(7);
    v_local_now     TIMESTAMP;
    v_past_cutoff   BOOLEAN := false;
    v_queue_count   INTEGER;
    v_branch_today  NUMERIC(18,2);
    v_in_tree       BOOLEAN := false;
    v_journal_id    UUID;
    v_vat_rate      NUMERIC(6,4);
    v_vat_amt_local NUMERIC(18,2);
    v_vat_amt_usd   NUMERIC(18,2);
    v_tax_inv_num   VARCHAR(50);
    v_tax_seq       BIGINT;
    v_release_hold  NUMERIC(18,6) := 0.000000;
    v_was_qualified BOOLEAN := false;
    v_now_qualified BOOLEAN := false;
BEGIN
    SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_transaction_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'TX_NOT_FOUND: %', p_transaction_id;
    END IF;
    IF v_tx.status = 'completed' THEN
        RETURN jsonb_build_object('status', 'already_completed', 'transaction_id', p_transaction_id);
    END IF;
    v_prev_status := v_tx.status;

    SELECT * INTO v_member   FROM sawyan.members WHERE id = v_tx.member_id;
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = v_tx.merchant_id FOR UPDATE;
    SELECT * INTO v_branch   FROM sawyan.merchant_branches WHERE id = v_tx.branch_id;
    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_tx.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_tx.country_id OR country_id IS NULL)
       AND effective_from <= v_tx.created_at
     ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC
     LIMIT 1;

    v_prev_eff  := sawyan.compute_merchant_effective_state(v_merchant.id);
    v_prev_fin  := v_prev_eff->>'financial_status';
    v_eff_q_cap := COALESCE((v_prev_eff->>'effective_queue_cap')::int, CASE WHEN v_merchant.credit_limit > 0 THEN 0 ELSE COALESCE(v_settings.unsecured_queue_cap, 3) END);

    IF v_tx.cashier_employee_id IS NOT NULL THEN
        SELECT * INTO v_cashier FROM sawyan.cashier_employees WHERE id = v_tx.cashier_employee_id;
        IF FOUND THEN
            IF v_cashier.linked_member_id IS NOT NULL AND v_cashier.linked_member_id = v_tx.member_id THEN
                UPDATE sawyan.transactions SET status = 'rejected' WHERE id = v_tx.id;
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                VALUES ('merchant', v_merchant.id, 'CashierSelfPinBlocked', 'in_app',
                        jsonb_build_object('transaction_id', v_tx.id, 'employee_id', v_cashier.id, 'employee_code', v_cashier.employee_code));
                RETURN jsonb_build_object('status', 'rejected_self_cashier_pin', 'transaction_id', v_tx.id, 'notified_merchant', true);
            END IF;

            IF v_cashier.max_tx_amount_limit IS NOT NULL AND v_tx.amount > v_cashier.max_tx_amount_limit THEN
                RAISE EXCEPTION 'CASHIER_TX_LIMIT_EXCEEDED';
            END IF;

            IF v_cashier.linked_member_id IS NOT NULL THEN
                SELECT EXISTS (
                    SELECT 1 FROM sawyan.tree_closure
                     WHERE (ancestor_id = v_cashier.linked_member_id AND descendant_id = v_tx.member_id AND depth > 0)
                        OR (ancestor_id = v_tx.member_id AND descendant_id = v_cashier.linked_member_id AND depth > 0)
                ) INTO v_in_tree;

                IF v_in_tree THEN
                    INSERT INTO sawyan.fraud_graph_signals (
                        signal_type, severity, involved_member_ids, involved_merchant_id, evidence_payload, status
                    ) VALUES (
                        'cashier_upline_collusion', 'medium', ARRAY[v_cashier.linked_member_id, v_tx.member_id],
                        v_merchant.id, jsonb_build_object('transaction_id', v_tx.id, 'employee_id', v_cashier.id), 'open'
                    );
                    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                    VALUES ('merchant', v_merchant.id, 'CashierTreeAlert', 'in_app',
                            jsonb_build_object('transaction_id', v_tx.id, 'employee_code', v_cashier.employee_code));
                END IF;
            END IF;
        END IF;
    END IF;

    IF v_branch.daily_commission_cap_local IS NOT NULL THEN
        SELECT COALESCE(SUM(commission_amount), 0) INTO v_branch_today
          FROM sawyan.transactions
         WHERE branch_id = v_branch.id
           AND status = 'completed'
           AND (created_at AT TIME ZONE v_country.iana_timezone)::date = (v_tx.created_at AT TIME ZONE v_country.iana_timezone)::date;
        IF (v_branch_today + v_tx.commission_amount) > v_branch.daily_commission_cap_local THEN
            RAISE EXCEPTION 'BRANCH_DAILY_CAP_EXCEEDED: branch=%', v_branch.id;
        END IF;
    END IF;

    v_release_hold := CASE
        WHEN v_prev_status = 'pending'
        THEN COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount)
        ELSE 0.000000
    END;

    v_free_balance := v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit;
    IF v_prev_status = 'pending' AND v_release_hold > 0 THEN
        v_free_balance := v_free_balance + LEAST(v_merchant.soft_hold_balance, v_release_hold);
    END IF;

    IF v_free_balance < v_tx.commission_amount THEN
        SELECT COUNT(*) INTO v_queue_count
          FROM sawyan.transactions
         WHERE merchant_id = v_merchant.id AND status = 'awaiting_merchant_topup';

        IF v_queue_count >= v_eff_q_cap THEN
            RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
        END IF;

        UPDATE sawyan.transactions
           SET status = 'awaiting_merchant_topup'
         WHERE id = v_tx.id;

        UPDATE sawyan.merchants
           SET is_isolated       = true,
               soft_hold_balance = CASE WHEN v_prev_status = 'pending' AND v_release_hold > 0
                                        THEN GREATEST(0, soft_hold_balance - v_release_hold)
                                        ELSE soft_hold_balance END
         WHERE id = v_merchant.id;

        PERFORM sawyan.sync_merchant_status_flags(v_merchant.id);

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES
            ('member', v_tx.member_id, 'TransactionAwaitingMerchantTopup', 'in_app',
             jsonb_build_object(
                 'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code,
                 'merchant_name', v_merchant.business_name, 'total_amount', v_tx.total_amount,
                 'currency_code', v_tx.currency_code, 'fifo_seq', v_tx.fifo_seq
             )),
            ('merchant', v_merchant.id, 'MerchantIsolatedFifoQueued', 'in_app',
             jsonb_build_object(
                 'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code,
                 'total_amount', v_tx.total_amount, 'required_commission', v_tx.commission_amount,
                 'currency_code', v_tx.currency_code, 'fifo_seq', v_tx.fifo_seq
             )),
            ('admin', v_merchant.id, 'AdminMerchantIsolatedFifoAlert', 'in_app',
             jsonb_build_object(
                 'merchant_id', v_merchant.id, 'merchant_code', v_merchant.merchant_code,
                 'business_name', v_merchant.business_name, 'transaction_id', v_tx.id,
                 'sw_short_code', v_tx.sw_short_code, 'total_amount', v_tx.total_amount,
                 'required_commission', v_tx.commission_amount, 'currency_code', v_tx.currency_code,
                 'fifo_seq', v_tx.fifo_seq
             ));

        PERFORM sawyan.append_audit_log(
            'system', COALESCE(p_actor_id, v_merchant.id), 'tx_queued_fifo_merchant_isolated',
            'transactions', v_tx.id::text, NULL,
            jsonb_build_object(
                'merchant_code', v_merchant.merchant_code, 'sw_short_code', v_tx.sw_short_code,
                'fifo_seq', v_tx.fifo_seq, 'required_commission', v_tx.commission_amount
            )
        );

        RETURN jsonb_build_object('status', 'awaiting_merchant_topup', 'fifo_seq', v_tx.fifo_seq);
    END IF;

    v_company_pct := COALESCE(v_settings.company_percent, 25.00);
    v_company_amt := ROUND((v_tx.commission_amount * (v_company_pct / 100.0))::numeric, 6);
    v_plan_local  := v_tx.commission_amount - v_company_amt;
    v_plan_usd    := v_plan_local / v_tx.fx_rate_used;

    v_local_now := sawyan.now_utc() AT TIME ZONE v_country.iana_timezone;
    v_curr_ym   := to_char(v_local_now, 'YYYY-MM');
    v_tx_ym     := to_char(v_tx.created_at AT TIME ZONE v_country.iana_timezone, 'YYYY-MM');

    IF v_prev_status = 'awaiting_merchant_topup' OR v_tx.payment_type IN ('cod', 'cheque') THEN
        v_period_ym := v_curr_ym;
    ELSE
        SELECT (
            EXISTS (
                SELECT 1 FROM sawyan.settlement_cycles sc
                 WHERE sc.country_id = v_country.id
                   AND sc.period_ym = v_tx_ym
                   AND (sc.is_hard_locked IS TRUE OR sc.step_status >= 5 OR sc.payout_executed_at IS NOT NULL)
            )
            OR v_local_now >= ((to_date(v_tx_ym || '-01', 'YYYY-MM-DD') + interval '1 month')::timestamp + (v_country.return_cutoff_day || ' days')::interval)
        ) INTO v_past_cutoff;

        v_period_ym := CASE WHEN COALESCE(v_past_cutoff, false) THEN v_curr_ym ELSE v_tx_ym END;
    END IF;

    PERFORM pg_advisory_xact_lock_shared(hashtext('sawyan_period_lock_' || v_country.id::text || '_' || v_period_ym));

    v_vat_rate      := COALESCE(v_country.vat_rate, 0.0000);
    v_vat_amt_local := ROUND((v_tx.commission_amount * (v_vat_rate / 100.0))::numeric, 2);
    v_vat_amt_usd   := ROUND((v_vat_amt_local / v_tx.fx_rate_used)::numeric, 2);

    UPDATE sawyan.merchants
       SET actual_cash_balance = actual_cash_balance - v_tx.commission_amount - v_vat_amt_local,
           soft_hold_balance   = CASE WHEN v_prev_status = 'pending' AND v_release_hold > 0
                                      THEN GREATEST(0, soft_hold_balance - v_release_hold)
                                      ELSE soft_hold_balance END,
           metadata            = CASE
               WHEN (actual_cash_balance - v_tx.commission_amount - v_vat_amt_local) < 0
                    AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'd4_debt_started_at')
               THEN COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('d4_debt_started_at', sawyan.now_utc())
               ELSE COALESCE(metadata, '{}'::jsonb)
           END
     WHERE id = v_merchant.id
    RETURNING * INTO v_merchant;

    SELECT COALESCE(is_qualified, false) INTO v_was_qualified
      FROM sawyan.monthly_target_boxes
     WHERE member_id = v_tx.member_id AND country_id = v_tx.country_id AND period_ym = v_period_ym;
    v_was_qualified := COALESCE(v_was_qualified, false);

    INSERT INTO sawyan.monthly_target_boxes (
        member_id, country_id, period_ym, current_month_purchases_usd, target_required_usd,
        is_qualified, qualification_source
    ) VALUES (
        v_tx.member_id, v_tx.country_id, v_period_ym, v_plan_usd, v_country.monthly_target_usd,
        ((v_plan_usd >= v_country.monthly_target_usd) AND NOT COALESCE(v_member.is_tombstone_banned, false)),
        CASE WHEN (v_plan_usd >= v_country.monthly_target_usd) AND NOT COALESCE(v_member.is_tombstone_banned, false) THEN 'local_purchases' ELSE 'none' END
    )
    ON CONFLICT (member_id, country_id, period_ym) DO UPDATE
       SET current_month_purchases_usd = sawyan.monthly_target_boxes.current_month_purchases_usd + EXCLUDED.current_month_purchases_usd,
           is_qualified = (((sawyan.monthly_target_boxes.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd + EXCLUDED.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                           AND NOT COALESCE(v_member.is_tombstone_banned, false)),
           qualification_source = CASE
               WHEN ((sawyan.monthly_target_boxes.carry_on_in_usd + sawyan.monthly_target_boxes.current_month_purchases_usd + EXCLUDED.current_month_purchases_usd) >= sawyan.monthly_target_boxes.target_required_usd)
                    AND NOT COALESCE(v_member.is_tombstone_banned, false)
               THEN CASE WHEN sawyan.monthly_target_boxes.carry_on_in_usd >= sawyan.monthly_target_boxes.target_required_usd THEN 'carry_on' ELSE 'local_purchases' END
               ELSE 'none'
           END
    RETURNING is_qualified INTO v_now_qualified;

    v_debit_usd   := ROUND((v_tx.commission_amount / v_tx.fx_rate_used)::numeric, 2);
    v_comp_usd_2  := ROUND((v_company_amt / v_tx.fx_rate_used)::numeric, 2);
    v_plan_usd_2  := ROUND(v_plan_usd::numeric, 2);
    v_fx_diff_usd := v_debit_usd - (v_comp_usd_2 + v_plan_usd_2);

    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('INVOICE', v_tx.id, v_tx.country_id, v_tx.fx_rate_used, 'POS Verified Commission Split 25/75 + B2B Tax')
    RETURNING id INTO v_journal_id;

    IF (v_debit_usd + v_vat_amt_usd) > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '2101', 'merchant', v_merchant.id, v_debit_usd + v_vat_amt_usd, 0.00, v_tx.commission_amount + v_vat_amt_local, v_tx.currency_code);
    END IF;
    IF v_comp_usd_2 > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '4101', 'treasury', NULL, 0.00, v_comp_usd_2, v_company_amt, v_tx.currency_code);
    END IF;
    IF v_plan_usd_2 > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '2201', 'member', v_tx.member_id, 0.00, v_plan_usd_2, v_plan_local, v_tx.currency_code);
    END IF;
    IF v_vat_amt_usd > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '2402', 'treasury', NULL, 0.00, v_vat_amt_usd, v_vat_amt_local, v_tx.currency_code);
    END IF;
    IF v_fx_diff_usd > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '4301', 'treasury', NULL, 0.00, v_fx_diff_usd, ROUND((v_fx_diff_usd * v_tx.fx_rate_used)::numeric, 2), v_tx.currency_code);
    ELSIF v_fx_diff_usd < 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_id, '4301', 'treasury', NULL, ABS(v_fx_diff_usd), 0.00, ROUND((ABS(v_fx_diff_usd) * v_tx.fx_rate_used)::numeric, 2), v_tx.currency_code);
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_tax_seq_' || v_country.id::text));
    SELECT COUNT(*) + 1 INTO v_tax_seq FROM sawyan.b2b_tax_invoices WHERE country_id = v_country.id;
    v_tax_inv_num := 'SAWYAN-TAX-' || v_country.country_code || '-' || replace(v_period_ym, '-', '') || '-' || LPAD(v_tax_seq::text, 6, '0');

    INSERT INTO sawyan.b2b_tax_invoices (
        invoice_number, document_type, merchant_id, branch_id, country_id, transaction_id,
        merchant_tax_reg_no, net_commission_amount, vat_rate_applied, vat_amount, gross_invoice_total,
        currency_code, fx_rate_used, journal_entry_id
    ) VALUES (
        v_tax_inv_num, 'tax_invoice', v_merchant.id, v_tx.branch_id, v_country.id, v_tx.id,
        v_merchant.tax_registration_no, ROUND(v_tx.commission_amount::numeric, 2), v_vat_rate, v_vat_amt_local,
        ROUND(v_tx.commission_amount::numeric, 2) + v_vat_amt_local,
        v_tx.currency_code, v_tx.fx_rate_used, v_journal_id
    );

    UPDATE sawyan.transactions
       SET status                  = 'completed',
           company_share           = v_company_amt,
           income_plan_share_local = v_plan_local,
           income_plan_share_usd   = v_plan_usd,
           vat_amount              = v_vat_amt_local,
           completed_at            = COALESCE(completed_at, sawyan.now_utc()),
           commission_snapshot     = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object('effective_period_ym', v_period_ym)
     WHERE id = v_tx.id;

    -- مزامنة الحالة الفعالة + إشعارات عبور عتبات الرصيد 30% / 20% / 10% (Edge-Triggered)
    v_new_eff := sawyan.sync_merchant_status_flags(v_merchant.id);
    v_new_fin := v_new_eff->>'financial_status';

    IF v_new_fin IS DISTINCT FROM v_prev_fin THEN
        IF v_new_fin = 'warning_yellow' AND v_prev_fin = 'healthy_green' THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
            VALUES ('merchant', v_merchant.id, 'MerchantBalanceWarning30', 'in_app',
                    jsonb_build_object('free_pct', v_new_eff->'free_pct', 'free_balance', v_new_eff->'free_balance', 'currency_code', v_tx.currency_code), now());
        ELSIF v_new_fin = 'warning_red' AND v_prev_fin IN ('healthy_green', 'warning_yellow') THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
            VALUES ('merchant', v_merchant.id, 'MerchantBalanceCritical20', 'in_app',
                    jsonb_build_object('free_pct', v_new_eff->'free_pct', 'free_balance', v_new_eff->'free_balance', 'currency_code', v_tx.currency_code), now());
        ELSIF v_new_fin IN ('isolated_low_balance', 'depleted_fifo_grace', 'locked_queue_full')
              AND v_prev_fin IN ('healthy_green', 'warning_yellow', 'warning_red') THEN
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
            VALUES ('merchant', v_merchant.id, 'MerchantBalanceIsolated10', 'in_app',
                    jsonb_build_object('free_pct', v_new_eff->'free_pct', 'free_balance', v_new_eff->'free_balance', 'financial_status', v_new_fin, 'currency_code', v_tx.currency_code), now());
        END IF;
    END IF;

    IF v_period_ym < v_curr_ym THEN
        PERFORM sawyan.recalculate_target_box_and_cascade(v_tx.member_id, v_tx.country_id, v_period_ym, v_curr_ym);
        UPDATE sawyan.settlement_cycles
           SET recalc_required = true,
               zero_discrepancy_passed = false
         WHERE period_ym = v_period_ym
           AND is_hard_locked = false
           AND payout_executed_at IS NULL
           AND recalc_required = false
           AND (country_id = v_country.id OR v_country.id = v_member.residency_country_id);
    END IF;

    IF v_prev_status <> 'pending' OR p_actor_id IS DISTINCT FROM v_merchant.id THEN
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES (
            'member', v_tx.member_id, 'TransactionCompleted', 'in_app',
            jsonb_build_object(
                'transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code,
                'merchant_name', v_merchant.business_name, 'amount', v_tx.total_amount,
                'currency_code', v_tx.currency_code, 'payment_type', v_tx.payment_type,
                'reward_added_local', ROUND(v_plan_local::numeric, 2), 'period_ym', v_period_ym
            ),
            sawyan.now_utc()
        );
    END IF;

    IF v_now_qualified AND NOT v_was_qualified THEN
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES (
            'member', v_tx.member_id, 'MonthlyTargetQualified', 'in_app',
            jsonb_build_object(
                'period_ym', v_period_ym, 'country_code', v_country.country_code,
                'target_required_usd', v_country.monthly_target_usd, 'trigger_tx_id', v_tx.id
            ),
            sawyan.now_utc()
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'completed',
        'plan_added_usd', v_plan_usd,
        'b2b_tax_invoice_number', v_tax_inv_num,
        'journal_entry_id', v_journal_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.process_merchant_topup_fifo(
    p_merchant_id     UUID,
    p_topup_amount    NUMERIC(18,2),
    p_payment_ref     VARCHAR,
    p_idempotency_key UUID,
    p_psp_fee         NUMERIC(18,2) DEFAULT 0.00,
    p_provider        VARCHAR DEFAULT 'bank_transfer'
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing_idem  sawyan.idempotency_keys%ROWTYPE;
    v_merchant       sawyan.merchants%ROWTYPE;
    v_country        sawyan.countries%ROWTYPE;
    v_settings       sawyan.settings%ROWTYPE;
    v_queued_tx      RECORD;
    v_released_count INT := 0;
    v_remaining_q    INT := 0;
    v_free_pct       NUMERIC(5,2) := 0;
    v_fx_rate        NUMERIC(18,6) := 1.000000;
    v_journal_topup  UUID;
    v_journal_psp    UUID;
    v_gross_usd      NUMERIC(18,2);
    v_fee_usd        NUMERIC(18,2);
    v_net_usd        NUMERIC(18,2);
    v_now_utc        TIMESTAMPTZ := sawyan.now_utc();
    v_pre_d4         JSONB;
    v_pre_stmt_due   NUMERIC(18,2) := 0.00;
    v_pre_close_at   TIMESTAMPTZ := NULL;
    v_next_start_utc TIMESTAMPTZ := NULL;
    v_eff            JSONB;
    v_res_body       JSONB;
BEGIN
    IF p_topup_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_TOPUP_AMOUNT';
    END IF;
    IF p_psp_fee < 0 OR p_psp_fee >= p_topup_amount THEN
        RAISE EXCEPTION 'INVALID_PSP_FEE';
    END IF;

    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
    VALUES (p_idempotency_key, p_merchant_id, 'process_merchant_topup_fifo', encode(extensions.digest(p_payment_ref, 'sha256'), 'hex'))
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
        IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
            RETURN v_existing_idem.response_body;
        END IF;
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_merchant.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL)
       AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

    v_fx_rate := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
        THEN v_country.admin_fx_rate
        ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
    END;

    v_gross_usd := ROUND((p_topup_amount / v_fx_rate)::numeric, 2);
    v_fee_usd   := ROUND((p_psp_fee / v_fx_rate)::numeric, 2);
    v_net_usd   := v_gross_usd - v_fee_usd;

    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('MERCHANT_TOPUP', p_merchant_id, v_country.id, v_fx_rate, 'Merchant Prepaid Top-Up: ' || p_payment_ref)
    RETURNING id INTO v_journal_topup;

    INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
    VALUES
        (v_journal_topup, '1102', 'psp', NULL, v_gross_usd, 0.00, p_topup_amount, v_country.currency_code),
        (v_journal_topup, '2101', 'merchant', p_merchant_id, 0.00, v_gross_usd, p_topup_amount, v_country.currency_code);

    INSERT INTO sawyan.journal_entries (source_type, source_id, country_id, fx_rate_used, description)
    VALUES ('PSP_SETTLEMENT', p_merchant_id, v_country.id, v_fx_rate, 'PSP Batch Settlement Reconciliation: ' || p_payment_ref)
    RETURNING id INTO v_journal_psp;

    INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
    VALUES
        (v_journal_psp, '1101', 'treasury', NULL, v_net_usd, 0.00, p_topup_amount - p_psp_fee, v_country.currency_code),
        (v_journal_psp, '1102', 'psp', NULL, 0.00, v_gross_usd, p_topup_amount, v_country.currency_code);

    IF v_fee_usd > 0 THEN
        INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
        VALUES (v_journal_psp, '5301', 'treasury', NULL, v_fee_usd, 0.00, p_psp_fee, v_country.currency_code);
    END IF;

    INSERT INTO sawyan.psp_settlement_batches (
        provider, country_id, psp_payout_batch_ref, gross_collected_amount, psp_gateway_fee_amount,
        net_bank_deposited_amount, currency_code, fx_rate_used, reconciliation_status, discrepancy_amount,
        journal_entry_id, settled_at
    ) VALUES (
        p_provider, v_country.id, p_payment_ref, p_topup_amount, p_psp_fee,
        p_topup_amount - p_psp_fee, v_country.currency_code, v_fx_rate, 'matched_zero_diff', 0.00,
        v_journal_psp, now()
    );

    v_pre_d4       := sawyan.compute_merchant_d4_cycle_info(p_merchant_id);
    v_pre_stmt_due := COALESCE((v_pre_d4->>'d4_statement_due_local')::numeric, 0.00);
    v_pre_close_at := NULLIF(COALESCE(v_pre_d4->>'d4_cycle_close_at', ''), '')::timestamptz;

    -- شحن الرصيد الفعلي وقفل النسبة على أول تمويل + تصفير دين D4 إذا أصبحت المحفظة >= 0
    UPDATE sawyan.merchants
       SET actual_cash_balance = actual_cash_balance + p_topup_amount,
           package_base_amount = GREATEST(package_base_amount, actual_cash_balance + p_topup_amount),
           metadata            = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('commission_locked', CASE WHEN deduction_percent >= 0.50 THEN true ELSE COALESCE((metadata->>'commission_locked')::boolean, false) END)
               || CASE
                      WHEN (actual_cash_balance + p_topup_amount) >= 0
                      THEN jsonb_build_object('last_d4_settlement_date', to_char(v_now_utc AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM-DD'))
                      ELSE '{}'::jsonb
                  END
     WHERE id = p_merchant_id
    RETURNING * INTO v_merchant;

    FOR v_queued_tx IN
        SELECT id, commission_amount
          FROM sawyan.transactions
         WHERE merchant_id = p_merchant_id AND status = 'awaiting_merchant_topup'
         ORDER BY fifo_seq ASC
    LOOP
        SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
        IF (v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit) >= v_queued_tx.commission_amount THEN
            PERFORM sawyan.feed_monthly_target_box(v_queued_tx.id, p_merchant_id);
            v_released_count := v_released_count + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF v_merchant.credit_limit > 0 AND v_merchant.actual_cash_balance < 0
       AND v_pre_close_at IS NOT NULL AND v_now_utc >= v_pre_close_at
       AND p_topup_amount >= v_pre_stmt_due THEN
        SELECT COALESCE(MIN(COALESCE(tx.completed_at, tx.created_at)), v_now_utc)
          INTO v_next_start_utc
          FROM sawyan.transactions tx
         WHERE tx.merchant_id = p_merchant_id
           AND tx.status = 'completed'
           AND COALESCE(tx.completed_at, tx.created_at) >= v_pre_close_at;

        UPDATE sawyan.merchants
           SET metadata = COALESCE(metadata, '{}'::jsonb)
                          || jsonb_build_object(
                              'd4_debt_started_at', v_next_start_utc,
                              'last_d4_settlement_date', to_char(v_now_utc AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'), 'YYYY-MM-DD')
                          )
         WHERE id = p_merchant_id;
    END IF;

    SELECT COUNT(*) INTO v_remaining_q
      FROM sawyan.transactions
     WHERE merchant_id = p_merchant_id AND status = 'awaiting_merchant_topup';

    -- الشحن وحده لا يرفع تعليق الامتثال ولا الإيقاف الإداري ولا التقييد (sync_merchant_status_flags تحكم الجميع)
    v_eff := sawyan.sync_merchant_status_flags(p_merchant_id);
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    v_free_pct := COALESCE((v_eff->>'free_pct')::numeric, 0.00);

    v_res_body := jsonb_build_object(
        'released_fifo_count', v_released_count,
        'remaining_queue', v_remaining_q,
        'free_balance_pct', ROUND(v_free_pct, 2),
        'is_isolated', v_merchant.is_isolated,
        'financial_status', v_eff->>'financial_status',
        'governance_status', v_eff->>'governance_status'
    );

    UPDATE sawyan.idempotency_keys
       SET response_status = 200, response_body = v_res_body
     WHERE idempotency_key = p_idempotency_key;

    RETURN v_res_body;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.submit_pos_transaction(
    p_member_id           UUID,
    p_merchant_id         UUID,
    p_branch_id           UUID,
    p_amount              NUMERIC(18,2),
    p_payment_type        VARCHAR,
    p_unique_payment_ref  VARCHAR,
    p_sw_short_code       VARCHAR,
    p_idempotency_key     UUID,
    p_cashier_employee_id UUID DEFAULT NULL,
    p_is_instant_pin      BOOLEAN DEFAULT true,
    p_receipt_media_url   TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_existing_idem    sawyan.idempotency_keys%ROWTYPE;
    v_merchant         sawyan.merchants%ROWTYPE;
    v_branch           sawyan.merchant_branches%ROWTYPE;
    v_country          sawyan.countries%ROWTYPE;
    v_settings         sawyan.settings%ROWTYPE;
    v_cashier          sawyan.cashier_employees%ROWTYPE;
    v_eff              JSONB;
    v_fin_status       VARCHAR(30);
    v_gov_status       VARCHAR(30);
    v_fx_rate          NUMERIC(18,6);
    v_comm_amt         NUMERIC(18,6);
    v_pending_cnt      INT;
    v_soft_hold_cap    NUMERIC(18,2);
    v_free_bal         NUMERIC(18,2);
    v_hold_amt         NUMERIC(18,6);
    v_queue_cnt        INT;
    v_eff_q_cap        INT;
    v_pay_type         VARCHAR(30);
    v_clean_receipt    TEXT;
    v_tx_id            UUID;
    v_res              JSONB;
BEGIN
    v_pay_type := lower(trim(COALESCE(NULLIF(p_payment_type, ''), 'cash')));
    v_clean_receipt := sawyan.validate_attachment_data(p_receipt_media_url, 480000, true);

    SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
    IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
        RETURN v_existing_idem.response_body;
    END IF;

    INSERT INTO sawyan.idempotency_keys (idempotency_key, actor_id, endpoint, request_hash)
    VALUES (p_idempotency_key, p_member_id, 'submit_pos_transaction', encode(extensions.digest(p_unique_payment_ref, 'sha256'), 'hex'))
    ON CONFLICT (idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        SELECT * INTO v_existing_idem FROM sawyan.idempotency_keys WHERE idempotency_key = p_idempotency_key;
        IF FOUND AND v_existing_idem.response_body IS NOT NULL THEN
            RETURN v_existing_idem.response_body;
        END IF;
    END IF;

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    -- حراسة المحاور الثلاثة الصارمة قبل تمرير أي فاتورة
    v_eff := sawyan.compute_merchant_effective_state(v_merchant.id);
    v_fin_status := v_eff->>'financial_status';
    v_gov_status := v_eff->>'governance_status';
    v_eff_q_cap  := COALESCE((v_eff->>'effective_queue_cap')::int, 3);

    IF COALESCE(v_merchant.deduction_percent, 0) <= 0 THEN
        RAISE EXCEPTION 'MERCHANT_COMMISSION_NOT_SET_YET';
    END IF;
    IF v_merchant.onboarding_status <> 'approved' THEN
        RAISE EXCEPTION 'MERCHANT_ONBOARDING_INCOMPLETE';
    END IF;
    IF v_gov_status IN ('paused_by_merchant', 'paused_by_admin') THEN
        RAISE EXCEPTION 'MERCHANT_TEMPORARILY_PAUSED';
    END IF;
    IF v_gov_status IN ('suspended_compliance', 'banned_permanent') THEN
        RAISE EXCEPTION 'MERCHANT_COMPLIANCE_SUSPENDED';
    END IF;
    IF v_fin_status = 'unfunded' THEN
        RAISE EXCEPTION 'MERCHANT_UNFUNDED_TOPUP_REQUIRED';
    END IF;
    IF v_fin_status = 'locked_queue_full' THEN
        IF v_merchant.credit_limit > 0 THEN
            RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: D4_CREDIT_LOCKED merchant_id=%', v_merchant.id;
        ELSE
            RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
        END IF;
    END IF;
    IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    SELECT * INTO v_branch
      FROM sawyan.merchant_branches
     WHERE id = p_branch_id AND merchant_id = p_merchant_id AND is_branch_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_MERCHANT_BRANCH';
    END IF;

    SELECT * INTO v_country  FROM sawyan.countries WHERE id = v_merchant.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merchant.country_id OR country_id IS NULL) AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

    v_fx_rate := CASE
        WHEN COALESCE(v_country.admin_fx_rate, 0) > 0
             AND NOT (v_country.admin_fx_rate = 1.000000 AND v_country.currency_code IN ('EGP', 'TRY', 'SAR', 'AED', 'EUR'))
        THEN v_country.admin_fx_rate
        ELSE CASE v_country.currency_code WHEN 'EGP' THEN 50.0 WHEN 'TRY' THEN 50.0 WHEN 'SAR' THEN 3.75 WHEN 'AED' THEN 3.6725 WHEN 'EUR' THEN 0.92 ELSE 1.0 END
    END;
    v_comm_amt := ROUND((p_amount * (v_merchant.deduction_percent / 100.0))::numeric, 6);

    IF NOT p_is_instant_pin THEN
        IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pending_remote')::boolean, false) THEN
            RAISE EXCEPTION 'MERCHANT_ISOLATED_PENDING_BLOCKED';
        END IF;

        SELECT COUNT(*) INTO v_pending_cnt
          FROM sawyan.transactions
         WHERE member_id = p_member_id
           AND merchant_id = p_merchant_id
           AND status = 'pending'
           AND COALESCE((commission_snapshot->>'merchant_initiated')::boolean, false) = false;
        IF v_pending_cnt >= 2 THEN
            RAISE EXCEPTION 'MEMBER_PENDING_LIMIT_REACHED: Maximum 2 pending requests per merchant.';
        END IF;

        v_soft_hold_cap := ROUND((GREATEST(v_merchant.package_base_amount, v_merchant.credit_limit) * (v_settings.unconfirmed_soft_hold_cap_pct / 100.0))::numeric, 2);
        IF (v_merchant.soft_hold_balance + v_comm_amt) > v_soft_hold_cap THEN
            RAISE EXCEPTION 'MERCHANT_SOFT_HOLD_CAP_20PCT_EXCEEDED';
        END IF;

        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url,
            soft_hold_expires_at, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, v_pay_type, 'pending', v_clean_receipt,
            now() + (COALESCE(v_settings.pending_sla_hours, 48) || ' hours')::interval,
            jsonb_build_object(
                'deduction_percent', v_merchant.deduction_percent,
                'company_percent', v_settings.company_percent,
                'merchant_initiated', false,
                'soft_hold_amount', v_comm_amt
            )
        ) RETURNING id INTO v_tx_id;

        UPDATE sawyan.merchants
           SET soft_hold_balance = soft_hold_balance + v_comm_amt
         WHERE id = v_merchant.id;

        PERFORM sawyan.sync_merchant_status_flags(v_merchant.id);
        v_res := jsonb_build_object('transaction_id', v_tx_id, 'status', 'pending', 'soft_hold_added', v_comm_amt);

    ELSIF v_pay_type IN ('cod', 'cheque') THEN
        IF p_cashier_employee_id IS NOT NULL THEN
            SELECT * INTO v_cashier FROM sawyan.cashier_employees WHERE id = p_cashier_employee_id;
            IF FOUND THEN
                IF v_cashier.linked_member_id IS NOT NULL AND v_cashier.linked_member_id = p_member_id THEN
                    INSERT INTO sawyan.transactions (
                        member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
                        unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
                        currency_code, fx_rate_used, payment_type, status, receipt_media_url, commission_snapshot
                    ) VALUES (
                        p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
                        p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
                        v_country.currency_code, v_fx_rate, v_pay_type, 'rejected', v_clean_receipt,
                        jsonb_build_object('deduction_percent', v_merchant.deduction_percent, 'company_percent', v_settings.company_percent, 'merchant_initiated', true, 'deferred_clearance', true, 'soft_hold_amount', 0.00)
                    ) RETURNING id INTO v_tx_id;

                    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                    VALUES ('merchant', v_merchant.id, 'CashierSelfPinBlocked', 'in_app',
                            jsonb_build_object('transaction_id', v_tx_id, 'employee_id', v_cashier.id, 'employee_code', v_cashier.employee_code));

                    v_res := jsonb_build_object('status', 'rejected_self_cashier_pin', 'transaction_id', v_tx_id, 'notified_merchant', true);
                    UPDATE sawyan.idempotency_keys SET response_status = 200, response_body = v_res WHERE idempotency_key = p_idempotency_key;
                    RETURN v_res;
                END IF;

                IF v_cashier.max_tx_amount_limit IS NOT NULL AND p_amount > v_cashier.max_tx_amount_limit THEN
                    RAISE EXCEPTION 'CASHIER_TX_LIMIT_EXCEEDED';
                END IF;
            END IF;
        END IF;

        v_free_bal := v_merchant.actual_cash_balance - v_merchant.soft_hold_balance + v_merchant.credit_limit;
        IF v_free_bal >= v_comm_amt THEN
            v_hold_amt := v_comm_amt;
            UPDATE sawyan.merchants
               SET soft_hold_balance = soft_hold_balance + v_hold_amt
             WHERE id = v_merchant.id;
        ELSE
            SELECT COUNT(*) INTO v_queue_cnt
              FROM sawyan.transactions
             WHERE merchant_id = v_merchant.id
               AND (
                   status = 'awaiting_merchant_topup'
                   OR (
                       status = 'pending'
                       AND COALESCE((commission_snapshot->>'soft_hold_amount')::numeric, 0) = 0
                       AND COALESCE((commission_snapshot->>'deferred_clearance')::boolean, false) = true
                   )
               );
            IF v_queue_cnt >= v_eff_q_cap THEN
                RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
            END IF;
            v_hold_amt := 0.00;
        END IF;

        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url,
            soft_hold_expires_at, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, v_pay_type, 'pending', v_clean_receipt,
            now() + interval '30 days',
            jsonb_build_object(
                'deduction_percent', v_merchant.deduction_percent,
                'company_percent', v_settings.company_percent,
                'merchant_initiated', true,
                'deferred_clearance', true,
                'soft_hold_amount', v_hold_amt
            )
        ) RETURNING id INTO v_tx_id;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES
            ('merchant', v_merchant.id, 'DeferredSaleCreated', 'in_app',
             jsonb_build_object('transaction_id', v_tx_id, 'sw_short_code', p_sw_short_code, 'payment_type', v_pay_type, 'amount', p_amount, 'currency_code', v_country.currency_code),
             sawyan.now_utc()),
            ('member', p_member_id, 'DeferredSaleCreated', 'in_app',
             jsonb_build_object('transaction_id', v_tx_id, 'sw_short_code', p_sw_short_code, 'payment_type', v_pay_type, 'amount', p_amount, 'currency_code', v_country.currency_code),
             sawyan.now_utc());

        PERFORM sawyan.sync_merchant_status_flags(v_merchant.id);
        v_res := jsonb_build_object(
            'transaction_id', v_tx_id,
            'status', 'pending',
            'deferred_clearance', true,
            'soft_hold_added', v_hold_amt
        );

    ELSE
        INSERT INTO sawyan.transactions (
            member_id, merchant_id, branch_id, country_id, cashier_employee_id, sw_short_code,
            unique_payment_ref, idempotency_key, amount, total_amount, commission_amount,
            currency_code, fx_rate_used, payment_type, status, receipt_media_url, commission_snapshot
        ) VALUES (
            p_member_id, p_merchant_id, p_branch_id, v_country.id, p_cashier_employee_id, p_sw_short_code,
            p_unique_payment_ref, p_idempotency_key, p_amount, p_amount, v_comm_amt,
            v_country.currency_code, v_fx_rate, v_pay_type, 'pending', v_clean_receipt,
            jsonb_build_object(
                'deduction_percent', v_merchant.deduction_percent,
                'company_percent', v_settings.company_percent,
                'merchant_initiated', true,
                'soft_hold_amount', 0.00
            )
        ) RETURNING id INTO v_tx_id;

        v_res := sawyan.feed_monthly_target_box(v_tx_id, p_member_id) || jsonb_build_object('transaction_id', v_tx_id);
    END IF;

    UPDATE sawyan.idempotency_keys
       SET response_status = 200, response_body = v_res
     WHERE idempotency_key = p_idempotency_key;

    RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.confirm_or_reject_pending_tx(
    p_merchant_id      UUID,
    p_transaction_id   UUID,
    p_decision         VARCHAR(20),
    p_rejection_reason TEXT DEFAULT NULL,
    p_session_token    TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_tx           sawyan.transactions%ROWTYPE;
    v_eff          JSONB;
    v_dec          VARCHAR(20);
    v_feed         JSONB;
    v_release_hold NUMERIC(18,6);
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_dec   := lower(trim(COALESCE(p_decision, '')));

    SELECT * INTO v_tx
      FROM sawyan.transactions
     WHERE id = p_transaction_id AND merchant_id = v_merch.id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_TX_NOT_FOUND';
    END IF;
    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
    END IF;

    IF v_dec = 'approve' THEN
        v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
        IF NOT COALESCE((v_eff->'effective_access'->>'can_accept_pos')::boolean, false) THEN
            IF (v_eff->>'financial_status') = 'locked_queue_full' THEN
                RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merch.id;
            ELSE
                RAISE EXCEPTION 'MERCHANT_INACTIVE';
            END IF;
        END IF;
        v_feed := sawyan.feed_monthly_target_box(v_tx.id, v_merch.id);
        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceApproved', 'in_app',
                jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'merchant_name', v_merch.business_name));
        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'pending_tx_approved', 'transactions', v_tx.id::text,
            jsonb_build_object('status', 'pending'), v_feed
        );
        RETURN jsonb_build_object('success', true, 'decision', 'approved', 'transaction_id', v_tx.id, 'feed', v_feed);

    ELSIF v_dec = 'reject' THEN
        v_eff := sawyan.compute_merchant_effective_state(v_merch.id);
        IF NOT COALESCE((v_eff->'effective_access'->>'can_reject_pending_manually')::boolean, true) THEN
            RAISE EXCEPTION 'MERCHANT_MANUAL_REJECT_REVOKED_D2';
        END IF;

        v_release_hold := COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount);
        IF v_release_hold > 0 THEN
            UPDATE sawyan.merchants
               SET soft_hold_balance = GREATEST(0, soft_hold_balance - v_release_hold)
             WHERE id = v_merch.id;
        END IF;

        UPDATE sawyan.transactions
           SET status = 'rejected'
         WHERE id = v_tx.id;

        PERFORM sawyan.sync_merchant_status_flags(v_merch.id);

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
        VALUES ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_rejection_reason, 'غير مطابق')));

        PERFORM sawyan.append_audit_log(
            'merchant', v_merch.id, 'pending_tx_rejected', 'transactions', v_tx.id::text,
            jsonb_build_object('status', 'pending'),
            jsonb_build_object('status', 'rejected', 'reason', p_rejection_reason)
        );
        RETURN jsonb_build_object('success', true, 'decision', 'rejected', 'transaction_id', v_tx.id);
    ELSE
        RAISE EXCEPTION 'INVALID_DECISION_USE_APPROVE_OR_REJECT';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.cancel_member_pending_purchase(
    p_member_id      UUID,
    p_transaction_id UUID,
    p_session_token  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member       sawyan.members%ROWTYPE;
    v_tx           sawyan.transactions%ROWTYPE;
    v_release_hold NUMERIC(18,6);
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);

    SELECT * INTO v_tx
      FROM sawyan.transactions
     WHERE id = p_transaction_id
       AND member_id = v_member.id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PENDING_PURCHASE_NOT_FOUND';
    END IF;
    IF v_tx.status <> 'pending' THEN
        RAISE EXCEPTION 'ONLY_PENDING_PURCHASE_CAN_BE_CANCELLED: %', v_tx.status;
    END IF;

    v_release_hold := COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount);
    IF v_release_hold > 0 THEN
        UPDATE sawyan.merchants
           SET soft_hold_balance = GREATEST(0, soft_hold_balance - v_release_hold)
         WHERE id = v_tx.merchant_id;
    END IF;

    UPDATE sawyan.transactions
       SET status = 'rejected',
           commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb)
               || jsonb_build_object('cancelled_by_member', true, 'cancelled_at', now())
     WHERE id = v_tx.id;

    PERFORM sawyan.sync_merchant_status_flags(v_tx.merchant_id);

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', v_tx.merchant_id, 'PendingInvoiceCancelledByMember', 'in_app',
            jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code));

    PERFORM sawyan.append_audit_log(
        'member', v_member.id, 'member_cancelled_pending_purchase', 'transactions', v_tx.id::text,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object('status', 'rejected', 'soft_hold_released', v_release_hold)
    );

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx.id,
        'sw_short_code', v_tx.sw_short_code,
        'status', 'rejected'
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.submit_member_pending_purchase(
    p_member_id          UUID,
    p_merchant_id        UUID,
    p_branch_id          UUID,
    p_amount             NUMERIC(18,2),
    p_payment_type       VARCHAR DEFAULT 'cash',
    p_idempotency_key    UUID DEFAULT NULL,
    p_session_token      TEXT DEFAULT NULL,
    p_receipt_url        TEXT DEFAULT NULL,
    p_unique_payment_ref VARCHAR DEFAULT NULL,
    p_employee_code      VARCHAR DEFAULT NULL,
    p_cashier_pin        TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member       sawyan.members%ROWTYPE;
    v_merchant     sawyan.merchants%ROWTYPE;
    v_eff          JSONB;
    v_fin_status   VARCHAR(30);
    v_gov_status   VARCHAR(30);
    v_cashier      sawyan.cashier_employees%ROWTYPE;
    v_idem         UUID;
    v_branch_id    UUID;
    v_short_code   VARCHAR(24);
    v_ref          VARCHAR(128);
    v_pay_type     VARCHAR(30);
    v_clean_rec    TEXT;
    v_emp_code     VARCHAR(30);
    v_pin          TEXT;
    v_is_instant   BOOLEAN := false;
    v_rl_obj       JSONB;
    v_rl_cnt       INT := 0;
    v_rl_win       TIMESTAMPTZ;
    v_cur_attempts SMALLINT := 0;
    v_new_attempts SMALLINT := 0;
    v_lock_until   TIMESTAMPTZ;
    v_dummy_chk    TEXT;
    v_res          JSONB;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PURCHASE_AMOUNT';
    END IF;

    v_pay_type := CASE lower(trim(COALESCE(p_payment_type, 'cash')))
        WHEN 'card' THEN 'pos_card'
        WHEN 'instapay' THEN 'instant_transfer'
        WHEN 'wallet' THEN 'digital_wallet'
        WHEN '' THEN 'cash'
        ELSE lower(trim(p_payment_type))
    END;
    IF v_pay_type NOT IN (
        'cash', 'pos_card', 'instant_transfer', 'iban_swift_sepa', 'digital_wallet',
        'payment_gateway', 'bnpl', 'cheque', 'cod', 'marketplace_escrow'
    ) THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_TYPE: %', p_payment_type;
    END IF;

    v_clean_rec := sawyan.validate_attachment_data(p_receipt_url, 480000, true);

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;

    v_eff        := sawyan.compute_merchant_effective_state(v_merchant.id);
    v_fin_status := v_eff->>'financial_status';
    v_gov_status := v_eff->>'governance_status';

    IF COALESCE(v_merchant.deduction_percent, 0) <= 0 THEN
        RAISE EXCEPTION 'MERCHANT_COMMISSION_NOT_SET_YET';
    END IF;
    IF v_merchant.onboarding_status <> 'approved' THEN
        RAISE EXCEPTION 'MERCHANT_ONBOARDING_INCOMPLETE';
    END IF;
    IF v_gov_status IN ('paused_by_merchant', 'paused_by_admin') THEN
        RAISE EXCEPTION 'MERCHANT_TEMPORARILY_PAUSED';
    END IF;
    IF v_gov_status IN ('suspended_compliance', 'banned_permanent') THEN
        RAISE EXCEPTION 'MERCHANT_COMPLIANCE_SUSPENDED';
    END IF;
    IF v_fin_status = 'unfunded' THEN
        RAISE EXCEPTION 'MERCHANT_UNFUNDED_TOPUP_REQUIRED';
    END IF;
    IF v_fin_status = 'locked_queue_full' THEN
        RAISE EXCEPTION 'MERCHANT_QUEUE_FULL_BLOCKED: merchant_id=%', v_merchant.id;
    END IF;

    IF p_branch_id IS NOT NULL THEN
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE id = p_branch_id AND merchant_id = p_merchant_id AND is_branch_active = true;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_MERCHANT_BRANCH';
        END IF;
    ELSE
        SELECT id INTO v_branch_id
          FROM sawyan.merchant_branches
         WHERE merchant_id = p_merchant_id AND is_branch_active = true
         ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;
        IF v_branch_id IS NULL THEN
            RAISE EXCEPTION 'NO_ACTIVE_MERCHANT_BRANCH';
        END IF;
    END IF;

    v_idem       := COALESCE(p_idempotency_key, gen_random_uuid());
    v_short_code := 'SW-' || upper(substr(replace(v_idem::text, '-', ''), 1, 6));
    v_ref        := COALESCE(NULLIF(trim(COALESCE(p_unique_payment_ref, '')), ''), 'MBR-' || v_member.member_code || '-' || replace(v_idem::text, '-', ''));

    v_emp_code   := NULLIF(upper(trim(COALESCE(p_employee_code, ''))), '');
    v_pin        := NULLIF(trim(COALESCE(p_cashier_pin, '')), '');
    v_is_instant := (v_emp_code IS NOT NULL OR v_pin IS NOT NULL);

    IF v_is_instant THEN
        IF v_pay_type IN ('cod', 'cheque') THEN
            RAISE EXCEPTION 'DEFERRED_PAYMENT_REQUIRES_PENDING_MODE';
        END IF;
        IF v_emp_code IS NULL OR v_pin IS NULL OR v_pin !~ '^\d{4}$' THEN
            RAISE EXCEPTION 'CASHIER_CODE_AND_4DIGIT_PIN_REQUIRED';
        END IF;

        v_rl_obj := COALESCE(v_member.metadata #> ARRAY['pin_rl', p_merchant_id::text], '{}'::jsonb);
        v_rl_cnt := COALESCE((v_rl_obj->>'cnt')::int, 0);
        v_rl_win := CASE WHEN COALESCE(v_rl_obj->>'win', '') <> '' THEN (v_rl_obj->>'win')::timestamptz ELSE NULL END;
        IF v_rl_win IS NOT NULL AND v_rl_win > (now() - interval '15 minutes') AND v_rl_cnt >= 5 THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'CASHIER_PIN_LOCKED_15M', 'locked_until', v_rl_win + interval '15 minutes');
        END IF;

        SELECT * INTO v_cashier
          FROM sawyan.cashier_employees
         WHERE merchant_id = p_merchant_id AND upper(employee_code) = v_emp_code
         FOR UPDATE;

        IF NOT FOUND OR v_cashier.is_active IS NOT TRUE THEN
            v_dummy_chk := extensions.crypt(v_pin, '$2a$06$abcdefghijklmnopqrstuu');
            v_rl_cnt := CASE WHEN v_rl_win IS NULL OR v_rl_win <= (now() - interval '15 minutes') THEN 1 ELSE v_rl_cnt + 1 END;
            v_rl_win := CASE WHEN v_rl_win IS NULL OR v_rl_win <= (now() - interval '15 minutes') THEN now() ELSE v_rl_win END;
            UPDATE sawyan.members
               SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), ARRAY['pin_rl', p_merchant_id::text], jsonb_build_object('cnt', v_rl_cnt, 'win', v_rl_win), true)
             WHERE id = v_member.id;
            RETURN jsonb_build_object(
                'success', false,
                'error_code', CASE WHEN v_rl_cnt >= 5 THEN 'CASHIER_PIN_LOCKED_15M' ELSE 'INVALID_CASHIER_CREDENTIALS' END,
                'remaining_attempts', GREATEST(0, 5 - v_rl_cnt)
            );
        END IF;

        IF v_cashier.pin_locked_until IS NOT NULL AND v_cashier.pin_locked_until > now() THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'CASHIER_PIN_LOCKED_15M', 'locked_until', v_cashier.pin_locked_until);
        END IF;

        v_cur_attempts := CASE
            WHEN v_cashier.pin_locked_until IS NOT NULL AND v_cashier.pin_locked_until <= now() THEN 0
            ELSE COALESCE(v_cashier.failed_pin_attempts, 0)
        END;

        IF v_cashier.pin_hash <> extensions.crypt(v_pin, v_cashier.pin_hash) THEN
            v_new_attempts := v_cur_attempts + 1;
            v_lock_until := CASE WHEN v_new_attempts >= 5 THEN now() + interval '15 minutes' ELSE NULL END;

            UPDATE sawyan.cashier_employees
               SET failed_pin_attempts = v_new_attempts,
                   pin_locked_until    = v_lock_until
             WHERE id = v_cashier.id;

            v_rl_cnt := CASE WHEN v_rl_win IS NULL OR v_rl_win <= (now() - interval '15 minutes') THEN 1 ELSE v_rl_cnt + 1 END;
            v_rl_win := CASE WHEN v_rl_win IS NULL OR v_rl_win <= (now() - interval '15 minutes') THEN now() ELSE v_rl_win END;
            UPDATE sawyan.members
               SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), ARRAY['pin_rl', p_merchant_id::text], jsonb_build_object('cnt', v_rl_cnt, 'win', v_rl_win), true)
             WHERE id = v_member.id;

            IF v_new_attempts >= 5 THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
                VALUES ('merchant', p_merchant_id, 'CashierPinLocked5Attempts', 'in_app',
                        jsonb_build_object('employee_code', v_cashier.employee_code, 'locked_until', v_lock_until, 'member_code', v_member.member_code));
            END IF;

            RETURN jsonb_build_object(
                'success', false,
                'error_code', CASE WHEN v_new_attempts >= 5 THEN 'CASHIER_PIN_LOCKED_15M' ELSE 'INVALID_CASHIER_CREDENTIALS' END,
                'failed_attempts', v_new_attempts,
                'remaining_attempts', GREATEST(0, 5 - v_new_attempts),
                'locked_until', v_lock_until
            );
        END IF;

        IF v_cashier.failed_pin_attempts > 0 OR v_cashier.pin_locked_until IS NOT NULL THEN
            UPDATE sawyan.cashier_employees SET failed_pin_attempts = 0, pin_locked_until = NULL WHERE id = v_cashier.id;
        END IF;
        IF v_rl_cnt > 0 THEN
            UPDATE sawyan.members SET metadata = COALESCE(metadata, '{}'::jsonb) #- ARRAY['pin_rl', p_merchant_id::text] WHERE id = v_member.id;
        END IF;

        IF v_cashier.max_tx_amount_limit IS NOT NULL AND p_amount > v_cashier.max_tx_amount_limit THEN
            RETURN jsonb_build_object('success', false, 'error_code', 'CASHIER_TX_LIMIT_EXCEEDED', 'max_limit', v_cashier.max_tx_amount_limit);
        END IF;

        v_res := sawyan.submit_pos_transaction(
            v_member.id, p_merchant_id, COALESCE(v_branch_id, v_cashier.branch_id),
            p_amount, v_pay_type, v_ref, v_short_code, v_idem, v_cashier.id, true, v_clean_rec
        );

        RETURN v_res || jsonb_build_object(
            'success', COALESCE((v_res->>'status') <> 'rejected_self_cashier_pin', true),
            'sw_short_code', v_short_code,
            'mode', 'instant_pin'
        );
    END IF;

    IF v_clean_rec IS NULL THEN
        RAISE EXCEPTION 'RECEIPT_REQUIRED_FOR_REMOTE_PURCHASE';
    END IF;

    v_res := sawyan.submit_pos_transaction(
        v_member.id, p_merchant_id, v_branch_id,
        p_amount, v_pay_type, v_ref, v_short_code, v_idem, NULL, false, v_clean_rec
    );

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', p_merchant_id, 'PendingPurchaseRequested', 'in_app',
            jsonb_build_object('sw_short_code', v_short_code, 'amount', p_amount, 'payment_type', v_pay_type, 'member_code', v_member.member_code));

    RETURN v_res || jsonb_build_object('success', true, 'sw_short_code', v_short_code, 'mode', 'pending_remote');
END;
$$;

-- ============================================================================
-- 9. تحديث الدليل العام والرادار والعروض الخاطفة ولوحة التاجر
-- ============================================================================

DROP FUNCTION IF EXISTS sawyan.get_public_merchants_catalog(CHAR, VARCHAR);
CREATE OR REPLACE FUNCTION sawyan.get_public_merchants_catalog(
    p_country_code CHAR(2) DEFAULT NULL,
    p_category     VARCHAR DEFAULT NULL
) RETURNS TABLE (
    merchant_id       UUID,
    branch_id         UUID,
    merchant_code     VARCHAR,
    business_name     VARCHAR,
    branch_name       VARCHAR,
    category          VARCHAR,
    merchant_type     VARCHAR,
    country_code      CHAR(2),
    currency_code     CHAR(3),
    address           TEXT,
    plan_cashback_pct NUMERIC,
    latitude          NUMERIC,
    longitude         NUMERIC,
    logo_url          TEXT,
    cover_image_url   TEXT,
    images            JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT m.id,
           mb.id,
           m.merchant_code,
           m.business_name,
           mb.branch_name,
           m.category,
           m.merchant_type,
           c.country_code,
           c.currency_code,
           mb.address,
           ROUND((m.deduction_percent * ((100.0 - COALESCE(s.company_percent, 25.0)) / 100.0))::numeric, 2) AS plan_cashback_pct,
           mb.latitude,
           mb.longitude,
           NULLIF(m.metadata->>'logo_url', '') AS logo_url,
           NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
           CASE WHEN pg_catalog.jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images
      FROM sawyan.merchant_branches mb
      JOIN sawyan.merchants m ON m.id = mb.merchant_id
      JOIN sawyan.countries c ON c.id = m.country_id
      LEFT JOIN LATERAL (
          SELECT company_percent, merchant_isolate_pct FROM sawyan.settings
           WHERE (country_id = m.country_id OR country_id IS NULL) AND effective_from <= now()
           ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC LIMIT 1
      ) s ON true
     WHERE m.onboarding_status = 'approved'
       AND m.governance_status IN ('good_standing', 'probation_warning')
       AND m.deduction_percent >= 0.50
       AND m.is_active = true
       AND m.is_isolated = false
       AND mb.is_branch_active = true
       AND (m.actual_cash_balance - m.soft_hold_balance + m.credit_limit) > 0
       AND GREATEST(m.package_base_amount, m.credit_limit) > 0
       AND (((m.actual_cash_balance - m.soft_hold_balance + m.credit_limit) / GREATEST(m.package_base_amount, m.credit_limit)) * 100.0) > COALESCE(m.isolate_pct_override, s.merchant_isolate_pct, 10.00)
       AND NOT sawyan.is_merchant_d4_cutoff_breached(m.id)
       AND NOT EXISTS (
           SELECT 1 FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'awaiting_merchant_topup'
       )
       AND (p_country_code IS NULL OR c.country_code = upper(trim(p_country_code)))
       AND (p_category IS NULL OR m.category = p_category)
     ORDER BY m.business_name ASC, mb.is_main_branch DESC;
$$;

DROP FUNCTION IF EXISTS sawyan.get_merchants_radar(NUMERIC, NUMERIC, NUMERIC, CHAR, VARCHAR);
CREATE OR REPLACE FUNCTION sawyan.get_merchants_radar(
    p_lat          NUMERIC,
    p_lng          NUMERIC,
    p_radius_km    NUMERIC DEFAULT 10.0,
    p_country_code CHAR(2) DEFAULT NULL,
    p_category     VARCHAR DEFAULT NULL
) RETURNS TABLE (
    merchant_id       UUID,
    branch_id         UUID,
    business_name     VARCHAR,
    branch_name       VARCHAR,
    category          VARCHAR,
    distance_km       NUMERIC,
    plan_cashback_pct NUMERIC,
    latitude          NUMERIC,
    longitude         NUMERIC,
    logo_url          TEXT,
    cover_image_url   TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT m.id,
           mb.id,
           m.business_name,
           mb.branch_name,
           m.category,
           ROUND((6371.0 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(p_lat)) * cos(radians(mb.latitude)) * cos(radians(mb.longitude) - radians(p_lng))
               + sin(radians(p_lat)) * sin(radians(mb.latitude))
           ))))::numeric, 2) AS distance_km,
           ROUND((
               m.deduction_percent * ((100.0 - COALESCE(s.company_percent, 25.0)) / 100.0)
           )::numeric, 2) AS plan_cashback_pct,
           mb.latitude,
           mb.longitude,
           NULLIF(m.metadata->>'logo_url', '') AS logo_url,
           NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url
      FROM sawyan.merchant_branches mb
      JOIN sawyan.merchants m ON m.id = mb.merchant_id
      JOIN sawyan.countries c ON c.id = m.country_id
      LEFT JOIN LATERAL (
          SELECT company_percent, merchant_isolate_pct FROM sawyan.settings
           WHERE (country_id = m.country_id OR country_id IS NULL) AND effective_from <= now()
           ORDER BY country_id NULLS LAST, effective_from DESC, recorded_at DESC LIMIT 1
      ) s ON true
     WHERE m.onboarding_status = 'approved'
       AND m.governance_status IN ('good_standing', 'probation_warning')
       AND m.deduction_percent >= 0.50
       AND m.is_active = true
       AND m.is_isolated = false
       AND mb.is_branch_active = true
       AND (m.actual_cash_balance - m.soft_hold_balance + m.credit_limit) > 0
       AND GREATEST(m.package_base_amount, m.credit_limit) > 0
       AND (((m.actual_cash_balance - m.soft_hold_balance + m.credit_limit) / GREATEST(m.package_base_amount, m.credit_limit)) * 100.0) > COALESCE(m.isolate_pct_override, s.merchant_isolate_pct, 10.00)
       AND NOT sawyan.is_merchant_d4_cutoff_breached(m.id)
       AND NOT EXISTS (
           SELECT 1 FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'awaiting_merchant_topup'
       )
       AND (p_country_code IS NULL OR c.country_code = p_country_code)
       AND (p_category IS NULL OR m.category = p_category)
       AND (6371.0 * acos(LEAST(1.0, GREATEST(-1.0,
               cos(radians(p_lat)) * cos(radians(mb.latitude)) * cos(radians(mb.longitude) - radians(p_lng))
               + sin(radians(p_lat)) * sin(radians(mb.latitude))
           )))) <= p_radius_km
     ORDER BY distance_km ASC;
$$;

CREATE OR REPLACE FUNCTION sawyan.submit_merchant_flash_offer(
    p_merchant_id   UUID,
    p_title         TEXT,
    p_body          TEXT,
    p_discount_hint VARCHAR DEFAULT NULL,
    p_actor_id      UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merchant       sawyan.merchants%ROWTYPE;
    v_eff            JSONB;
    v_free_pct       NUMERIC(5,2);
    v_warn1_pct      NUMERIC(5,2);
    v_combined_text  TEXT;
    v_weekly_count   INT;
    v_offer_id       UUID;
BEGIN
    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND: %', p_merchant_id;
    END IF;

    v_eff       := sawyan.compute_merchant_effective_state(p_merchant_id);
    v_free_pct  := COALESCE((v_eff->>'free_pct')::numeric, 0.00);
    v_warn1_pct := COALESCE((v_eff->>'warn1_pct')::numeric, 30.00);

    IF NOT COALESCE((v_eff->'effective_access'->>'can_submit_flash_offer')::boolean, false) THEN
        IF v_merchant.onboarding_status <> 'approved'
           OR v_merchant.governance_status <> 'good_standing'
           OR COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false) IS NOT TRUE
        THEN
            RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_MERCHANT_INACTIVE_OR_ISOLATED';
        END IF;
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_WALLET_NOT_GREEN: free_pct=% <= warn1=%', ROUND(v_free_pct, 2), v_warn1_pct;
    END IF;

    IF trim(COALESCE(p_title, '')) = '' OR trim(COALESCE(p_body, '')) = '' THEN
        RAISE EXCEPTION 'FLASH_OFFER_EMPTY_TITLE_OR_BODY';
    END IF;

    v_combined_text := COALESCE(p_title, '') || ' ' || COALESCE(p_body, '') || ' ' || COALESCE(p_discount_hint, '');
    IF v_combined_text ~* '(https?://|www\.|[a-z0-9-]+\.(com|net|org|io|app|co|me|eg|tr|sa|de)\b|t\.me/|wa\.me/)' THEN
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT: External links are strictly prohibited.';
    END IF;
    IF v_combined_text ~ '([0-9٠-٩][\s\-\(\)\.]{0,2}){7,}' THEN
        RAISE EXCEPTION 'FLASH_OFFER_BLOCKED_PROHIBITED_CONTENT: Direct phone or payment numbers are strictly prohibited.';
    END IF;

    SELECT COUNT(*) INTO v_weekly_count
      FROM sawyan.notifications
     WHERE event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved')
       AND payload->>'merchant_id' = p_merchant_id::text
       AND created_at >= now() - interval '7 days';

    IF v_weekly_count >= 2 THEN
        RAISE EXCEPTION 'FLASH_OFFER_WEEKLY_LIMIT_EXCEEDED: Maximum 2 flash offers per 7 days.';
    END IF;

    INSERT INTO sawyan.notifications (
        recipient_type, recipient_id, event_name, channel, payload
    ) VALUES (
        'admin_queue',
        p_merchant_id,
        'MerchantFlashOfferPending',
        'in_app',
        jsonb_build_object(
            'status', 'pending_admin_approval',
            'merchant_id', p_merchant_id,
            'business_name', v_merchant.business_name,
            'title', trim(p_title),
            'body', trim(p_body),
            'discount_hint', p_discount_hint,
            'free_balance_pct', ROUND(v_free_pct, 2),
            'submitted_at', now()
        )
    ) RETURNING id INTO v_offer_id;

    PERFORM sawyan.append_audit_log(
        'merchant',
        COALESCE(p_actor_id, p_merchant_id),
        'merchant_flash_offer_submitted',
        'notifications',
        v_offer_id::text,
        NULL,
        jsonb_build_object('merchant_id', p_merchant_id, 'title', trim(p_title), 'free_pct', ROUND(v_free_pct, 2))
    );

    RETURN jsonb_build_object(
        'offer_id', v_offer_id,
        'status', 'pending_admin_approval',
        'free_balance_pct', ROUND(v_free_pct, 2),
        'weekly_remaining', GREATEST(0, 2 - (v_weekly_count + 1))
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.get_merchant_dashboard_bundle(
    p_merchant_id   UUID,
    p_session_token TEXT DEFAULT NULL,
    p_shift_filter  VARCHAR(20) DEFAULT 'today',
    p_branch_id     UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch        sawyan.merchants%ROWTYPE;
    v_country      sawyan.countries%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_eff          JSONB;
    v_fin          VARCHAR(30);
    v_free_bal     NUMERIC(18,2);
    v_free_pct     NUMERIC(6,2);
    v_safe_sales   NUMERIC(18,2);
    v_zone         VARCHAR(20);
    v_today_sales  NUMERIC(18,2);
    v_today_comm   NUMERIC(18,2);
    v_today_cnt    INT;
    v_month_sales  NUMERIC(18,2);
    v_month_comm   NUMERIC(18,2);
    v_shift        JSONB;
    v_radar_1km    JSONB;
    v_radar_2km    JSONB;
    v_radar_3km    JSONB;
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    v_eff   := sawyan.sync_merchant_status_flags(v_merch.id);
    SELECT * INTO v_merch   FROM sawyan.merchants WHERE id = v_merch.id;
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;

    SELECT * INTO v_main_br FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    v_fin      := v_eff->>'financial_status';
    v_free_bal := COALESCE((v_eff->>'free_balance')::numeric, 0.00);
    v_free_pct := COALESCE((v_eff->>'free_pct')::numeric, 0.00);
    v_safe_sales := CASE WHEN v_merch.deduction_percent > 0
                         THEN ROUND((GREATEST(0, v_free_bal) / (v_merch.deduction_percent / 100.0))::numeric, 2)
                         ELSE 0.00 END;

    v_zone := CASE v_fin
        WHEN 'healthy_green'  THEN 'GREEN'
        WHEN 'warning_yellow' THEN 'YELLOW'
        WHEN 'warning_red'    THEN 'RED'
        ELSE 'ISOLATED'
    END;

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00), COUNT(*)
      INTO v_today_sales, v_today_comm, v_today_cnt
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('day', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00)
      INTO v_month_sales, v_month_comm
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('month', sawyan.now_utc() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    v_shift := sawyan.get_merchant_shift_closing(v_merch.id, p_branch_id, COALESCE(p_shift_filter, 'today'), NULL, NULL, NULL, NULL);
    IF v_main_br.id IS NOT NULL THEN
        v_radar_1km := sawyan.get_merchant_members_density(v_main_br.id, 1.0);
        v_radar_2km := sawyan.get_merchant_members_density(v_main_br.id, 2.0);
        v_radar_3km := sawyan.get_merchant_members_density(v_main_br.id, 3.0);
    END IF;

    RETURN jsonb_build_object(
        'profile', (
            jsonb_build_object(
                'id', v_merch.id,
                'merchant_code', v_merch.merchant_code,
                'business_name', v_merch.business_name,
                'owner_name', v_merch.owner_name,
                'email', v_merch.email,
                'phone', v_merch.phone,
                'category', v_merch.category,
                'merchant_type', v_merch.merchant_type,
                'deduction_percent', v_merch.deduction_percent,
                'commission_pending', COALESCE((v_merch.metadata->>'commission_pending')::boolean, v_merch.deduction_percent <= 0),
                'commission_locked', COALESCE((v_merch.metadata->>'commission_locked')::boolean, false),
                'package_base_amount', v_merch.package_base_amount,
                'actual_cash_balance', v_merch.actual_cash_balance,
                'soft_hold_balance', v_merch.soft_hold_balance,
                'credit_limit', v_merch.credit_limit,
                'free_balance', v_free_bal,
                'free_pct', v_free_pct,
                'safe_sales_capacity', v_safe_sales,
                'zone_status', v_zone,
                'is_active', v_merch.is_active,
                'is_isolated', v_merch.is_isolated,
                'onboarding_status', v_eff->>'onboarding_status',
                'onboarding_notes', v_eff->>'onboarding_notes',
                'financial_status', v_fin,
                'governance_status', v_eff->>'governance_status',
                'pre_pause_governance_status', v_eff->>'pre_pause_governance_status',
                'governance_reason', v_eff->>'governance_reason'
            ) || jsonb_build_object(
                'effective_access', v_eff->'effective_access',
                'violation_counters', v_eff->'violation_counters',
                'effective_queue_cap', v_eff->'effective_queue_cap',
                'effective_isolate_pct', v_eff->'effective_isolate_pct',
                'unsecured_queue_cap_override', v_merch.unsecured_queue_cap_override,
                'isolate_pct_override', v_merch.isolate_pct_override,
                'deferred_settlement_cutoff_time', v_merch.deferred_settlement_cutoff_time,
                'd4_cycle_days_override', v_merch.d4_cycle_days_override,
                'd4_grace_hours_override', v_merch.d4_grace_hours_override,
                'd4_time_trigger_disabled', COALESCE((v_merch.metadata->>'d4_time_trigger_disabled')::boolean, false),
                'd4_effective_cycle_days', v_eff->'d4_effective_cycle_days',
                'd4_effective_cutoff_time', v_eff->'d4_effective_cutoff_time',
                'd4_effective_grace_hours', v_eff->'d4_effective_grace_hours',
                'd4_cycle_close_at', v_eff->'d4_cycle_close_at',
                'd4_grace_due_at', v_eff->'d4_grace_due_at',
                'd4_statement_due_local', v_eff->'d4_statement_due_local',
                'd4_open_cycle_comm_local', v_eff->'d4_open_cycle_comm_local',
                'd4_in_grace_window', v_eff->'d4_in_grace_window',
                'cutoff_breached', v_eff->'cutoff_breached',
                'overdue_days', v_eff->'overdue_days',
                'fifo_default_days', v_eff->'fifo_default_days',
                'warn1_pct', v_eff->'warn1_pct',
                'warn2_pct', v_eff->'warn2_pct',
                'missing_required_fields', v_eff->'missing_required_fields',
                'hide_reason_ar', v_eff->'hide_reason_ar',
                'pos_lock_reason_ar', v_eff->'pos_lock_reason_ar'
            ) || jsonb_build_object(
                'address_is_fallback', COALESCE((v_merch.metadata->>'address_is_fallback')::boolean, false),
                'geo_is_fallback', COALESCE((v_merch.metadata->>'geo_is_fallback')::boolean, false),
                'address', COALESCE(v_merch.address, v_main_br.address),
                'district', NULLIF(v_merch.metadata->>'district', ''),
                'city_name', NULLIF(v_merch.metadata->>'city_name', ''),
                'city_geoname_id', COALESCE(v_main_br.city_geoname_id, NULLIF(v_merch.metadata->>'city_geoname_id', '')::bigint),
                'latitude', COALESCE(v_merch.latitude, v_main_br.latitude),
                'longitude', COALESCE(v_merch.longitude, v_main_br.longitude),
                'google_maps_url', NULLIF(v_merch.metadata->>'google_maps_url', ''),
                'description', NULLIF(v_merch.metadata->>'description', ''),
                'website_url', NULLIF(v_merch.metadata->>'website_url', ''),
                'webhook_url', NULLIF(v_merch.metadata->>'webhook_url', ''),
                'whatsapp', NULLIF(v_merch.metadata->>'whatsapp', ''),
                'social', COALESCE(v_merch.metadata->'social', '{}'::jsonb),
                'commercial_reg_no', NULLIF(v_merch.metadata->>'commercial_reg_no', ''),
                'tax_id', NULLIF(COALESCE(v_merch.tax_registration_no, v_merch.metadata->>'tax_id'), ''),
                'country_code', v_country.country_code,
                'currency_code', v_country.currency_code,
                'wifi_ssid', v_merch.metadata->>'wifi_ssid',
                'wifi_password', v_merch.metadata->>'wifi_password',
                'working_hours', COALESCE(v_merch.metadata->'working_hours', to_jsonb('09:00 - 23:00'::text)),
                'logo_url', NULLIF(v_merch.metadata->>'logo_url', ''),
                'cover_image_url', NULLIF(v_merch.metadata->>'cover_image_url', ''),
                'images', CASE WHEN jsonb_typeof(v_merch.metadata->'images') = 'array' THEN v_merch.metadata->'images' ELSE '[]'::jsonb END,
                'kyc_docs', COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb),
                'today_sales_local', v_today_sales,
                'today_commission_local', v_today_comm,
                'today_merchant_net_local', v_today_sales - v_today_comm,
                'today_completed_count', v_today_cnt,
                'month_sales_local', v_month_sales,
                'month_commission_local', v_month_comm,
                'month_merchant_net_local', v_month_sales - v_month_comm
            )
        ),
        'branches', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', b.id, 'branch_code', b.branch_code, 'branch_name', b.branch_name,
                'is_main_branch', b.is_main_branch, 'address', b.address,
                'latitude', b.latitude, 'longitude', b.longitude,
                'daily_commission_cap_local', b.daily_commission_cap_local, 'is_branch_active', b.is_branch_active
            ) ORDER BY b.is_main_branch DESC, b.created_at ASC)
            FROM sawyan.merchant_branches b WHERE b.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'cashiers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ce.id, 'branch_id', ce.branch_id, 'employee_code', ce.employee_code,
                'full_name', ce.full_name, 'linked_member_id', ce.linked_member_id,
                'employee_phone', v_merch.metadata->'cashier_phones'->>ce.id::text,
                'notify_owner_realtime', ce.notify_owner_realtime,
                'failed_pin_attempts', ce.failed_pin_attempts, 'pin_locked_until', ce.pin_locked_until,
                'max_tx_amount_limit', ce.max_tx_amount_limit, 'is_active', ce.is_active
            ) ORDER BY ce.employee_code ASC)
            FROM sawyan.cashier_employees ce WHERE ce.merchant_id = v_merch.id
        ), '[]'::jsonb),
        'pending_transactions', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', t.id, 'sw_short_code', t.sw_short_code, 'unique_payment_ref', t.unique_payment_ref, 'status', t.status,
                'total_amount', t.total_amount, 'commission_amount', t.commission_amount,
                'merchant_net_amount', t.total_amount - t.commission_amount,
                'currency_code', t.currency_code, 'payment_type', t.payment_type,
                'receipt_media_url', t.receipt_media_url, 'fifo_seq', t.fifo_seq,
                'created_at', t.created_at,
                'member_code', m.member_code,
                'member_masked_name', sawyan.mask_member_display_name(m.full_name, m.member_code)
            ) ORDER BY t.fifo_seq ASC)
            FROM sawyan.transactions t
            JOIN sawyan.members m ON m.id = t.member_id
            WHERE t.merchant_id = v_merch.id AND t.status IN ('pending', 'awaiting_merchant_topup')
        ), '[]'::jsonb),
        'completed_transactions', COALESCE((
            SELECT jsonb_agg(row_to_json(sub)) FROM (
                SELECT t.id, t.sw_short_code, t.unique_payment_ref, t.status, t.total_amount, t.commission_amount,
                       (t.total_amount - t.commission_amount) AS merchant_net_amount,
                       t.currency_code, t.payment_type, t.receipt_media_url, (t.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                       t.completed_at, t.created_at,
                       sawyan.mask_member_display_name(m.full_name, m.member_code) AS member_masked_name,
                       mb.branch_name, COALESCE(ce.full_name, 'مالك المتجر (توثيق مباشر)') AS cashier_name
                  FROM sawyan.transactions t
                  JOIN sawyan.members m ON m.id = t.member_id
                  LEFT JOIN sawyan.merchant_branches mb ON mb.id = t.branch_id
                  LEFT JOIN sawyan.cashier_employees ce ON ce.id = t.cashier_employee_id
                 WHERE t.merchant_id = v_merch.id AND t.status IN ('completed', 'reversed')
                 ORDER BY t.created_at DESC LIMIT 100
            ) sub
        ), '[]'::jsonb),
        'b2b_tax_invoices', COALESCE((
            SELECT jsonb_agg(row_to_json(inv)) FROM (
                SELECT invoice_number, document_type, net_commission_amount, vat_rate_applied,
                       vat_amount, gross_invoice_total, currency_code, issued_at
                  FROM sawyan.b2b_tax_invoices
                 WHERE merchant_id = v_merch.id
                 ORDER BY issued_at DESC LIMIT 50
            ) inv
        ), '[]'::jsonb),
        'topup_history', COALESCE((
            SELECT jsonb_agg(row_to_json(tp)) FROM (
                SELECT je.id, je.entry_number, je.description, je.posted_at,
                       jl.amount_local, jl.currency_code
                  FROM sawyan.journal_entries je
                  JOIN sawyan.journal_lines jl ON jl.journal_entry_id = je.id
                 WHERE je.source_type = 'MERCHANT_TOPUP'
                   AND jl.account_code = '2101'
                   AND jl.entity_id = v_merch.id
                 ORDER BY je.posted_at DESC LIMIT 30
            ) tp
        ), '[]'::jsonb),
        'shift_closing', v_shift,
        'radar_rings', jsonb_build_object('r1km', v_radar_1km, 'r2km', v_radar_2km, 'r3km', v_radar_3km),
        'flash_offers', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', n.id,
                'status', CASE n.event_name
                    WHEN 'MerchantFlashOfferApproved' THEN 'approved'
                    WHEN 'MerchantFlashOfferRejected' THEN 'rejected'
                    ELSE 'pending'
                END,
                'payload', n.payload,
                'created_at', n.created_at
            ) ORDER BY n.created_at DESC)
            FROM sawyan.notifications n
            WHERE n.event_name IN ('MerchantFlashOfferPending', 'MerchantFlashOfferApproved', 'MerchantFlashOfferRejected')
              AND (n.recipient_id = v_merch.id OR n.payload->>'merchant_id' = v_merch.id::text)
        ), '[]'::jsonb),
        'notifications', COALESCE((
            SELECT jsonb_agg(row_to_json(nf)) FROM (
                SELECT id, event_name, payload, is_read, created_at
                  FROM sawyan.notifications
                 WHERE recipient_type = 'merchant' AND recipient_id = v_merch.id
                 ORDER BY created_at DESC LIMIT 25
            ) nf
        ), '[]'::jsonb)
    );
END;
$$;

-- ============================================================================
-- 10. منظومة شكاوى الأعضاء المباشرة ضد التجار + ربطها بالحوكمة والإدارة
-- ============================================================================

CREATE OR REPLACE FUNCTION sawyan.submit_member_merchant_complaint(
    p_member_id     UUID,
    p_merchant_id   UUID,
    p_category      VARCHAR,
    p_subject       VARCHAR,
    p_details       TEXT,
    p_evidence_url  TEXT DEFAULT NULL,
    p_session_token TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member      sawyan.members%ROWTYPE;
    v_merchant    sawyan.merchants%ROWTYPE;
    v_cat         VARCHAR(40);
    v_subj        VARCHAR(200);
    v_det         TEXT;
    v_clean_ev    TEXT;
    v_comp_id     UUID;
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);

    SELECT * INTO v_merchant FROM sawyan.merchants WHERE id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_NOT_FOUND';
    END IF;

    v_cat := lower(trim(COALESCE(p_category, 'other')));
    IF v_cat NOT IN ('refused_verification', 'evasion_excuse', 'hidden_fee', 'bad_conduct', 'other') THEN
        RAISE EXCEPTION 'INVALID_COMPLAINT_CATEGORY: %', p_category;
    END IF;

    v_subj := left(trim(COALESCE(p_subject, '')), 200);
    v_det  := trim(COALESCE(p_details, ''));
    IF char_length(v_subj) < 3 THEN
        RAISE EXCEPTION 'COMPLAINT_SUBJECT_REQUIRED';
    END IF;
    IF char_length(v_det) < 10 THEN
        RAISE EXCEPTION 'COMPLAINT_DETAILS_TOO_SHORT';
    END IF;

    IF EXISTS (
        SELECT 1 FROM sawyan.complaints
         WHERE complainant_id = v_member.id
           AND target_type = 'merchant'
           AND target_id = v_merchant.id
           AND created_at >= now() - interval '24 hours'
    ) THEN
        RAISE EXCEPTION 'COMPLAINT_RATE_LIMIT_24H';
    END IF;

    v_clean_ev := sawyan.validate_attachment_data(p_evidence_url, 480000, true);

    INSERT INTO sawyan.complaints (
        complainant_id, target_type, target_id, category, subject, details, evidence_url, status
    ) VALUES (
        v_member.id, 'merchant', v_merchant.id, v_cat, v_subj, v_det, v_clean_ev, 'open'
    ) RETURNING id INTO v_comp_id;

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
    VALUES ('admin', v_merchant.id, 'MerchantComplaintFiled', 'in_app',
            jsonb_build_object(
                'complaint_id', v_comp_id,
                'merchant_id', v_merchant.id,
                'merchant_code', v_merchant.merchant_code,
                'business_name', v_merchant.business_name,
                'member_code', v_member.member_code,
                'category', v_cat,
                'subject', v_subj
            ), now());

    PERFORM sawyan.append_audit_log(
        'member', v_member.id, 'merchant_complaint_submitted', 'complaints', v_comp_id::text,
        NULL, jsonb_build_object('merchant_id', v_merchant.id, 'category', v_cat)
    );

    RETURN jsonb_build_object(
        'success', true,
        'complaint_id', v_comp_id,
        'status', 'open',
        'category', v_cat
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.admin_operational_decision(
    p_admin_id       UUID,
    p_session_token  TEXT,
    p_domain         VARCHAR,
    p_record_id      TEXT,
    p_decision       VARCHAR,
    p_notes          TEXT    DEFAULT NULL,
    p_reversal_phase VARCHAR DEFAULT 'in_month'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info JSONB;
    v_dom        VARCHAR(40);
    v_dec        VARCHAR(40);
    v_notif      sawyan.notifications%ROWTYPE;
    v_dispute    sawyan.dispute_tickets%ROWTYPE;
    v_comp       sawyan.complaints%ROWTYPE;
    v_tx         sawyan.transactions%ROWTYPE;
    v_wtx        sawyan.wallet_transactions%ROWTYPE;
    v_settings   sawyan.settings%ROWTYPE;
    v_claw_res   JSONB := NULL;
BEGIN
    v_admin_info := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, true);
    v_dom := lower(trim(COALESCE(p_domain, '')));
    v_dec := lower(trim(COALESCE(p_decision, '')));

    IF v_dom = 'flash_offer' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        SELECT * INTO v_notif FROM sawyan.notifications WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'FLASH_OFFER_NOT_FOUND'; END IF;

        IF v_dec = 'approved' THEN
            UPDATE sawyan.notifications
               SET event_name    = 'MerchantFlashOfferApproved',
                   dispatched_at = now(),
                   payload       = v_notif.payload || jsonb_build_object('status', 'approved', 'approved_by', p_admin_id, 'approved_at', now())
             WHERE id = v_notif.id;
        ELSIF v_dec = 'rejected' THEN
            UPDATE sawyan.notifications
               SET event_name = 'MerchantFlashOfferRejected',
                   payload    = v_notif.payload || jsonb_build_object('status', 'rejected', 'rejected_by', p_admin_id, 'rejection_reason', COALESCE(p_notes, 'غير مطابق لضوابط النشر'))
             WHERE id = v_notif.id;
        ELSE
            RAISE EXCEPTION 'INVALID_FLASH_OFFER_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'flash_offer_' || v_dec, 'notifications', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'merchant_complaint' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        IF v_dec NOT IN ('verified', 'dismissed') THEN
            RAISE EXCEPTION 'INVALID_COMPLAINT_DECISION: %', p_decision;
        END IF;
        SELECT * INTO v_comp FROM sawyan.complaints WHERE id = p_record_id::uuid AND target_type = 'merchant' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_COMPLAINT_NOT_FOUND'; END IF;

        UPDATE sawyan.complaints
           SET status               = v_dec,
               admin_notes          = COALESCE(NULLIF(trim(p_notes), ''), admin_notes),
               reviewed_by_admin_id = p_admin_id,
               reviewed_at          = now()
         WHERE id = v_comp.id;

        IF v_dec = 'verified' THEN
            PERFORM sawyan.sync_merchant_status_flags(v_comp.target_id);
        END IF;

        INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
        VALUES
            ('member', v_comp.complainant_id, 'MerchantComplaintUpdated', 'in_app',
             jsonb_build_object('complaint_id', v_comp.id, 'decision', v_dec, 'notes', p_notes), now()),
            ('merchant', v_comp.target_id, 'MerchantComplaintUpdated', 'in_app',
             jsonb_build_object('complaint_id', v_comp.id, 'decision', v_dec, 'notes', p_notes), now());

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_complaint_' || v_dec, 'complaints', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'merchant_id', v_comp.target_id));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'merchant_id', v_comp.target_id);

    ELSIF v_dom = 'dispute_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'reviewer', 'approver', 'finance'], true);
        SELECT * INTO v_dispute FROM sawyan.dispute_tickets WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'DISPUTE_TICKET_NOT_FOUND'; END IF;

        SELECT * INTO v_tx FROM sawyan.transactions WHERE id = v_dispute.transaction_id FOR UPDATE;

        IF v_dec = 'resolved_member' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_member',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            IF v_tx.status = 'pending' THEN
                v_claw_res := sawyan.feed_monthly_target_box(v_tx.id, v_tx.member_id);
            END IF;
            PERFORM sawyan.sync_merchant_status_flags(v_dispute.merchant_id);

        ELSIF v_dec = 'resolved_member_clawback' THEN
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'CLAWBACK_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_member',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            v_claw_res := sawyan.process_transaction_reversal_clawback(v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin dispute reversal before payout'));
            PERFORM sawyan.sync_merchant_status_flags(v_dispute.merchant_id);

        ELSIF v_dec = 'resolved_merchant_force_return' THEN
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'FORCE_RETURN_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            UPDATE sawyan.return_requests
               SET status      = 'approved_in_app',
                   resolved_at = sawyan.now_utc()
             WHERE transaction_id = v_tx.id
               AND status IN ('pending_otp', 'escalated_to_admin');
            v_claw_res := sawyan.process_transaction_reversal_clawback(
                v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin forced return after runaway customer proof')
            );
            UPDATE sawyan.members
               SET payout_cooldown_until = GREATEST(COALESCE(payout_cooldown_until, sawyan.now_utc()), sawyan.now_utc() + interval '30 days')
             WHERE id = v_tx.member_id;

        ELSIF v_dec = 'resolved_merchant_malicious_claim' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
            UPDATE sawyan.return_requests
               SET status      = 'rejected_member',
                   resolved_at = sawyan.now_utc()
             WHERE transaction_id = v_tx.id
               AND status IN ('pending_otp', 'escalated_to_admin');
            UPDATE sawyan.members
               SET payout_cooldown_until = GREATEST(COALESCE(payout_cooldown_until, sawyan.now_utc()), sawyan.now_utc() + interval '30 days')
             WHERE id = v_tx.member_id;

        ELSIF v_dec = 'resolved_merchant' THEN
            UPDATE sawyan.dispute_tickets
               SET status             = 'resolved_merchant',
                   assigned_admin_id  = p_admin_id,
                   appeal_deadline_at = sawyan.now_utc() + interval '72 hours'
             WHERE id = v_dispute.id;
        ELSE
            RAISE EXCEPTION 'INVALID_DISPUTE_DECISION: %', p_decision;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'dispute_' || v_dec, 'dispute_tickets', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'effect', v_claw_res));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'ledger_effect', v_claw_res);

    ELSIF v_dom = 'price_gouging' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'support'], true);
        IF v_dec NOT IN ('verified_violation', 'dismissed') THEN
            RAISE EXCEPTION 'INVALID_PRICE_GOUGING_DECISION';
        END IF;
        UPDATE sawyan.price_gouging_reports SET verification_status = v_dec WHERE id = p_record_id::uuid;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'price_gouging_' || v_dec, 'price_gouging_reports', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'fraud_signal' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['reviewer', 'approver', 'finance'], true);
        IF v_dec NOT IN ('payout_held', 'cleared', 'confirmed_fraud') THEN
            RAISE EXCEPTION 'INVALID_FRAUD_DECISION';
        END IF;
        UPDATE sawyan.fraud_graph_signals SET status = v_dec WHERE id = p_record_id::uuid;
        IF v_dec = 'confirmed_fraud' THEN
            UPDATE sawyan.members
               SET is_tombstone_banned = true
             WHERE id = ANY((SELECT involved_member_ids FROM sawyan.fraud_graph_signals WHERE id = p_record_id::uuid))
               AND member_code > 0;
        END IF;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'fraud_signal_' || v_dec, 'fraud_graph_signals', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'member_kyc' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['kyc_officer', 'approver', 'reviewer'], true);
        IF v_dec NOT IN ('verified', 'rejected') THEN
            RAISE EXCEPTION 'INVALID_KYC_DECISION';
        END IF;
        UPDATE sawyan.members SET kyc_status = v_dec WHERE id = p_record_id::uuid AND member_code > 0;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_kyc_' || v_dec, 'members', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'member_tombstone' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver'], true);
        UPDATE sawyan.members SET is_tombstone_banned = (v_dec = 'ban') WHERE id = p_record_id::uuid AND member_code > 0;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'member_tombstone_' || v_dec, 'members', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'is_tombstone_banned', (v_dec = 'ban'));

    ELSIF v_dom = 'merchant_status' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'finance'], true);
        IF v_dec = 'activate' THEN
            UPDATE sawyan.merchants
               SET governance_status           = CASE WHEN governance_status IN ('paused_by_admin', 'paused_by_merchant')
                                                      THEN COALESCE(pre_pause_governance_status, 'good_standing')
                                                      ELSE 'good_standing' END,
                   pre_pause_governance_status = NULL,
                   governance_reason           = COALESCE(NULLIF(trim(p_notes), ''), 'تفعيل المتجر إدارياً'),
                   governance_updated_at       = now()
             WHERE id = p_record_id::uuid;
        ELSIF v_dec = 'deactivate' THEN
            UPDATE sawyan.merchants
               SET pre_pause_governance_status = CASE WHEN governance_status IN ('good_standing', 'probation_warning') THEN governance_status ELSE pre_pause_governance_status END,
                   governance_status           = 'paused_by_admin',
                   governance_reason           = COALESCE(NULLIF(trim(p_notes), ''), 'إيقاف مؤقت إدارياً'),
                   governance_updated_at       = now()
             WHERE id = p_record_id::uuid;
        ELSIF v_dec = 'isolate' THEN
            UPDATE sawyan.merchants
               SET pre_pause_governance_status = CASE WHEN governance_status IN ('good_standing', 'probation_warning') THEN governance_status ELSE pre_pause_governance_status END,
                   governance_status           = 'restricted_no_reject',
                   governance_reason           = COALESCE(NULLIF(trim(p_notes), ''), 'عزل وتقييد المتجر إدارياً'),
                   governance_updated_at       = now()
             WHERE id = p_record_id::uuid;
        ELSE
            RAISE EXCEPTION 'INVALID_MERCHANT_STATUS_DECISION';
        END IF;

        PERFORM sawyan.sync_merchant_status_flags(p_record_id::uuid);
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'merchant_' || v_dec, 'merchants', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);

    ELSIF v_dom = 'transaction' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer', 'finance', 'support'], true);
        SELECT * INTO v_tx FROM sawyan.transactions WHERE id = p_record_id::uuid FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'TX_NOT_FOUND'; END IF;

        IF v_dec = 'approve_escalated' THEN
            IF v_tx.status <> 'pending' THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            UPDATE sawyan.transactions
               SET commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb)
                   || jsonb_build_object('admin_escalated_resolved', true, 'escalated_resolved_by', p_admin_id)
             WHERE id = v_tx.id;
            v_claw_res := sawyan.feed_monthly_target_box(v_tx.id, p_admin_id);
        ELSIF v_dec = 'reject_escalated' THEN
            IF v_tx.status <> 'pending' THEN
                RAISE EXCEPTION 'TX_NOT_IN_PENDING_STATE: %', v_tx.status;
            END IF;
            IF COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount) > 0 THEN
                UPDATE sawyan.merchants
                   SET soft_hold_balance = GREATEST(0, soft_hold_balance - COALESCE((v_tx.commission_snapshot->>'soft_hold_amount')::numeric, v_tx.commission_amount))
                 WHERE id = v_tx.merchant_id;
            END IF;
            UPDATE sawyan.transactions
               SET status = 'rejected',
                   commission_snapshot = COALESCE(commission_snapshot, '{}'::jsonb) || jsonb_build_object('rejected_by_admin', p_admin_id, 'rejection_reason', COALESCE(p_notes, 'رفض إداري'))
             WHERE id = v_tx.id;
            PERFORM sawyan.sync_merchant_status_flags(v_tx.merchant_id);
            INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
            VALUES
                ('member', v_tx.member_id, 'PendingInvoiceRejected', 'in_app',
                 jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_notes, 'قرار إداري'))),
                ('merchant', v_tx.merchant_id, 'PendingInvoiceRejectedByAdmin', 'in_app',
                 jsonb_build_object('transaction_id', v_tx.id, 'sw_short_code', v_tx.sw_short_code, 'reason', COALESCE(p_notes, 'قرار إداري')));
        ELSIF v_dec = 'reverse_pre_payout' THEN
            PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance'], true);
            IF v_tx.status <> 'completed' THEN
                RAISE EXCEPTION 'REVERSAL_REQUIRES_COMPLETED_TX: tx_status=%', v_tx.status;
            END IF;
            v_claw_res := sawyan.process_transaction_reversal_clawback(v_tx.id, p_admin_id, COALESCE(p_notes, 'Admin pre-payout reversal'));
            PERFORM sawyan.sync_merchant_status_flags(v_tx.merchant_id);
        ELSE
            RAISE EXCEPTION 'INVALID_TRANSACTION_DECISION: %', p_decision;
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'transaction_' || v_dec, 'transactions', p_record_id, NULL, jsonb_build_object('notes', p_notes, 'effect', v_claw_res));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec, 'ledger_effect', v_claw_res);

    ELSIF v_dom = 'withdrawal_payout' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['finance', 'approver'], true);
        SELECT * INTO v_wtx FROM sawyan.wallet_transactions WHERE id = p_record_id::uuid AND transaction_type = 'withdrawal' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'WITHDRAWAL_TX_NOT_FOUND'; END IF;

        SELECT * INTO v_settings FROM sawyan.settings
         WHERE country_id IS NULL AND effective_from <= now()
         ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;
        IF NOT FOUND THEN
            SELECT * INTO v_settings FROM sawyan.settings WHERE country_id IS NULL ORDER BY effective_from DESC, recorded_at DESC LIMIT 1;
        END IF;

        IF v_dec = 'completed' THEN
            IF v_wtx.amount_usd >= COALESCE(v_settings.wht_threshold_usd, 200.00) THEN
                RAISE EXCEPTION 'WITHDRAWAL_DUAL_APPROVAL_REQUIRED_W05: Withdrawals >= % USD require Maker-Checker request [WITHDRAWAL_DUAL_APPROVAL_W05].', COALESCE(v_settings.wht_threshold_usd, 200.00);
            END IF;
            UPDATE sawyan.wallet_transactions SET status = 'completed' WHERE id = v_wtx.id;
        ELSE
            RAISE EXCEPTION 'INVALID_WITHDRAWAL_DECISION';
        END IF;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'withdrawal_completed', 'wallet_transactions', p_record_id, NULL, jsonb_build_object('amount_usd', v_wtx.amount_usd));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', 'completed');

    ELSIF v_dom = 'support_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'reviewer', 'approver'], true);
        UPDATE sawyan.support_tickets
           SET status            = CASE WHEN v_dec IN ('closed', 'resolved') THEN 'closed' ELSE 'in_progress' END,
               assigned_admin_id = p_admin_id
         WHERE id = p_record_id::uuid;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'support_ticket_' || v_dec, 'support_tickets', p_record_id, NULL, jsonb_build_object('notes', p_notes));
        RETURN jsonb_build_object('domain', v_dom, 'record_id', p_record_id, 'status', v_dec);
    ELSE
        RAISE EXCEPTION 'UNKNOWN_OPERATIONAL_DOMAIN: %', p_domain;
    END IF;
END;
$$;

-- ============================================================================
-- 11. الحوكمة ثنائية الاعتماد Maker-Checker للإعدادات الحية وعقود التجار
-- ============================================================================

ALTER TABLE sawyan.maker_checker_requests
    DROP CONSTRAINT IF EXISTS chk_mc_distinct_admins;

CREATE OR REPLACE FUNCTION sawyan.decide_maker_checker_request(
    p_request_id       UUID,
    p_checker_admin_id UUID,
    p_decision         VARCHAR,
    p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_req        sawyan.maker_checker_requests%ROWTYPE;
    v_checker    sawyan.admins%ROWTYPE;
    v_dec        VARCHAR(20);
    v_is_founder BOOLEAN;
BEGIN
    v_dec := lower(trim(COALESCE(p_decision, '')));
    IF v_dec NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'INVALID_MAKER_CHECKER_DECISION: %', p_decision;
    END IF;

    SELECT * INTO v_checker FROM sawyan.admins WHERE id = p_checker_admin_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ACTIVE_CHECKER_ADMIN_REQUIRED';
    END IF;

    v_is_founder := COALESCE((v_checker.metadata->>'is_sovereign_founder')::boolean, false);

    SELECT * INTO v_req FROM sawyan.maker_checker_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MAKER_CHECKER_REQUEST_NOT_FOUND';
    END IF;

    IF v_req.status <> 'pending' THEN
        RAISE EXCEPTION 'MAKER_CHECKER_ALREADY_DECIDED: status=%', v_req.status;
    END IF;

    IF p_checker_admin_id = v_req.maker_admin_id AND NOT v_is_founder THEN
        RAISE EXCEPTION 'MAKER_CANNOT_APPROVE_OWN_REQUEST: Maker and Checker must be distinct admins.';
    END IF;

    UPDATE sawyan.maker_checker_requests
       SET checker_admin_id = p_checker_admin_id,
           status           = v_dec,
           decided_at       = now()
     WHERE id = p_request_id;

    PERFORM sawyan.append_audit_log(
        'admin',
        p_checker_admin_id,
        CASE WHEN v_is_founder AND p_checker_admin_id = v_req.maker_admin_id
             THEN 'sovereign_founder_direct_' || v_dec
             ELSE 'maker_checker_' || v_dec
        END,
        'maker_checker_requests',
        p_request_id::text,
        jsonb_build_object('status', 'pending'),
        jsonb_build_object(
            'status', v_dec,
            'checker_admin_id', p_checker_admin_id,
            'sovereign_founder_override', (v_is_founder AND p_checker_admin_id = v_req.maker_admin_id),
            'rejection_reason', p_rejection_reason
        )
    );

    RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', v_dec,
        'maker_admin_id', v_req.maker_admin_id,
        'checker_admin_id', p_checker_admin_id,
        'sovereign_founder_override', (v_is_founder AND p_checker_admin_id = v_req.maker_admin_id)
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.admin_decide_governance_request(
    p_admin_id         UUID,
    p_session_token    TEXT,
    p_request_id       UUID,
    p_decision         VARCHAR,
    p_rejection_reason TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_admin_info    JSONB;
    v_mc_res        JSONB;
    v_req           sawyan.maker_checker_requests%ROWTYPE;
    v_exec_effect   JSONB := '{"effect":"recorded_only"}'::jsonb;
    v_country       sawyan.countries%ROWTYPE;
    v_cur_settings  sawyan.settings%ROWTYPE;
    v_merch_cnt     INT;
    v_new_set_id    INT;
    v_partner_id    UUID;
    v_topup_res     JSONB;
    v_next_month_ts TIMESTAMPTZ;
    v_bg_ym         TEXT;
    v_total_cycles  INT := 0;
    v_unlocked      INT := 0;
    v_adj_cycle     sawyan.settlement_cycles%ROWTYPE;
    v_adj_cid       INT;
    v_debit_acct    VARCHAR(16);
    v_credit_acct   VARCHAR(16);
    v_adj_amt       NUMERIC(18,2);
    v_adj_je_id     UUID;
    v_mer           sawyan.merchants%ROWTYPE;
    v_qtx           RECORD;
    v_released      INT := 0;
    v_eff_res       JSONB;
    v_new_gov       VARCHAR(30);
    v_new_onb       VARCHAR(30);
    v_new_ded       NUMERIC(5,2);
    v_new_cred      NUMERIC(18,2);
BEGIN
    v_admin_info := sawyan.verify_admin_session(
        p_admin_id,
        p_session_token,
        ARRAY['approver', 'finance'],
        true
    );

    v_mc_res := sawyan.decide_maker_checker_request(
        p_request_id,
        p_admin_id,
        p_decision,
        p_rejection_reason
    );

    SELECT * INTO v_req FROM sawyan.maker_checker_requests WHERE id = p_request_id;

    IF lower(trim(p_decision)) = 'approved' THEN
        IF v_req.action_type = 'COUNTRY_LEGAL_TAX_PREP' THEN
            SELECT * INTO v_country
              FROM sawyan.countries
             WHERE country_code = upper(trim(COALESCE(v_req.payload_after->>'country_code', v_req.target_id)))
             FOR UPDATE;

            IF NOT FOUND THEN
                INSERT INTO sawyan.countries (
                    country_code, country_name_i18n, currency_code, iana_timezone, admin_fx_rate,
                    financial_stopper_usd, monthly_target_usd, compensatory_admin_fee_usd,
                    vat_rate, wht_rate, payout_day, return_cutoff_day,
                    legal_opinion_verified, legal_opinion_doc_url, local_terms_version,
                    min_merchants_threshold, is_active
                ) VALUES (
                    upper(substr(trim(COALESCE(v_req.payload_after->>'country_code', v_req.target_id)), 1, 2)),
                    COALESCE(v_req.payload_after->'country_name_i18n', jsonb_build_object('ar', COALESCE(v_req.payload_after->>'name_ar', v_req.target_id), 'en', COALESCE(v_req.payload_after->>'name_en', v_req.target_id))),
                    upper(substr(trim(COALESCE(v_req.payload_after->>'currency_code', 'USD')), 1, 3)),
                    COALESCE(NULLIF(trim(v_req.payload_after->>'iana_timezone'), ''), 'UTC'),
                    GREATEST(COALESCE((v_req.payload_after->>'admin_fx_rate')::numeric, 1.000000), 0.000001),
                    COALESCE(
                        NULLIF((v_req.payload_after->>'financial_stopper_usd')::numeric, 0),
                        sawyan.calc_country_default_s03_usd(COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, 24.75), NULL, NULL)
                    ),
                    COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, 24.75),
                    COALESCE((v_req.payload_after->>'compensatory_admin_fee_usd')::numeric, 0.00),
                    COALESCE((v_req.payload_after->>'vat_rate')::numeric, 0.0000),
                    COALESCE((v_req.payload_after->>'wht_rate')::numeric, 0.0000),
                    COALESCE((v_req.payload_after->>'payout_day')::smallint, 15),
                    COALESCE((v_req.payload_after->>'return_cutoff_day')::smallint, 14),
                    COALESCE((v_req.payload_after->>'legal_opinion_verified')::boolean, false),
                    NULLIF(trim(v_req.payload_after->>'legal_opinion_doc_url'), ''),
                    COALESCE(NULLIF(trim(v_req.payload_after->>'local_terms_version'), ''), 'v3.0'),
                    GREATEST(COALESCE((v_req.payload_after->>'min_merchants_threshold')::int, 1), 1),
                    CASE WHEN COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false)
                         THEN COALESCE((v_req.payload_after->>'is_active')::boolean, false)
                         ELSE false END
                ) RETURNING * INTO v_country;
            ELSE
                UPDATE sawyan.countries
                   SET country_name_i18n          = CASE
                                                        WHEN v_req.payload_after ? 'country_name_i18n' THEN v_req.payload_after->'country_name_i18n'
                                                        WHEN v_req.payload_after ? 'name_ar' THEN country_name_i18n || jsonb_build_object('ar', v_req.payload_after->>'name_ar', 'en', COALESCE(NULLIF(trim(v_req.payload_after->>'name_en'), ''), country_name_i18n->>'en'))
                                                        ELSE country_name_i18n
                                                    END,
                       currency_code              = COALESCE(NULLIF(upper(substr(trim(v_req.payload_after->>'currency_code'), 1, 3)), ''), currency_code),
                       iana_timezone              = COALESCE(NULLIF(trim(v_req.payload_after->>'iana_timezone'), ''), iana_timezone),
                       admin_fx_rate              = COALESCE((v_req.payload_after->>'admin_fx_rate')::numeric, admin_fx_rate),
                       legal_opinion_verified     = COALESCE((v_req.payload_after->>'legal_opinion_verified')::boolean, legal_opinion_verified),
                       legal_opinion_doc_url      = COALESCE(NULLIF(trim(v_req.payload_after->>'legal_opinion_doc_url'), ''), legal_opinion_doc_url),
                       local_terms_version        = COALESCE(NULLIF(trim(v_req.payload_after->>'local_terms_version'), ''), local_terms_version),
                       financial_stopper_usd      = COALESCE((v_req.payload_after->>'financial_stopper_usd')::numeric, financial_stopper_usd),
                       monthly_target_usd         = COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, monthly_target_usd),
                       compensatory_admin_fee_usd = COALESCE((v_req.payload_after->>'compensatory_admin_fee_usd')::numeric, compensatory_admin_fee_usd),
                       vat_rate                   = COALESCE((v_req.payload_after->>'vat_rate')::numeric, vat_rate),
                       wht_rate                   = COALESCE((v_req.payload_after->>'wht_rate')::numeric, wht_rate),
                       payout_day                 = COALESCE((v_req.payload_after->>'payout_day')::smallint, payout_day),
                       return_cutoff_day          = COALESCE((v_req.payload_after->>'return_cutoff_day')::smallint, return_cutoff_day),
                       min_merchants_threshold    = COALESCE((v_req.payload_after->>'min_merchants_threshold')::int, min_merchants_threshold),
                       is_active                  = CASE
                                                        WHEN v_req.payload_after ? 'is_active' AND ((v_req.payload_after->>'is_active')::boolean = false OR COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false))
                                                        THEN (v_req.payload_after->>'is_active')::boolean
                                                        ELSE is_active
                                                    END,
                       recorded_at                = now()
                 WHERE id = v_country.id
                RETURNING * INTO v_country;
            END IF;

            v_exec_effect := jsonb_build_object('effect', 'country_parameters_updated', 'country_code', v_country.country_code);

        ELSIF v_req.action_type = 'COUNTRY_GATE_D13_ACTIVATION' THEN
            SELECT * INTO v_country
              FROM sawyan.countries
             WHERE country_code = upper(trim(COALESCE(v_req.payload_after->>'country_code', v_req.target_id)))
             FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'COUNTRY_NOT_FOUND'; END IF;

            IF v_req.payload_after ? 'legal_opinion_verified' THEN
                UPDATE sawyan.countries
                   SET legal_opinion_verified  = (v_req.payload_after->>'legal_opinion_verified')::boolean,
                       legal_opinion_doc_url   = COALESCE(NULLIF(trim(v_req.payload_after->>'legal_opinion_doc_url'), ''), legal_opinion_doc_url),
                       local_terms_version     = COALESCE(NULLIF(trim(v_req.payload_after->>'local_terms_version'), ''), local_terms_version),
                       financial_stopper_usd   = COALESCE((v_req.payload_after->>'financial_stopper_usd')::numeric, financial_stopper_usd),
                       min_merchants_threshold = COALESCE((v_req.payload_after->>'min_merchants_threshold')::int, min_merchants_threshold)
                 WHERE id = v_country.id
                RETURNING * INTO v_country;
            END IF;

            SELECT COUNT(*) INTO v_merch_cnt
              FROM sawyan.merchants
             WHERE country_id = v_country.id AND is_active = true;

            IF COALESCE((v_admin_info->>'is_sovereign_founder')::boolean, false) IS TRUE THEN
                UPDATE sawyan.countries
                   SET legal_opinion_verified = true,
                       local_terms_version    = COALESCE(NULLIF(trim(local_terms_version), ''), 'v3.0-FOUNDER-SOVEREIGN'),
                       financial_stopper_usd  = CASE
                                                    WHEN COALESCE(financial_stopper_usd, 0) <= 0
                                                    THEN sawyan.calc_country_default_s03_usd(monthly_target_usd, NULL, NULL)
                                                    ELSE financial_stopper_usd
                                                END,
                       is_active              = true,
                       effective_from         = now(),
                       recorded_at            = now()
                 WHERE id = v_country.id
                RETURNING * INTO v_country;

                v_exec_effect := jsonb_build_object(
                    'effect', 'country_activated_by_sovereign_founder',
                    'country_code', v_country.country_code,
                    'effective_from', v_country.effective_from,
                    'active_merchants', v_merch_cnt
                );
            ELSE
                IF v_country.legal_opinion_verified IS NOT TRUE OR COALESCE(trim(v_country.local_terms_version), '') = '' THEN
                    RAISE EXCEPTION 'COUNTRY_GATE_D13_BLOCKED_LEGAL: Written legal opinion and local terms version are mandatory (D18).';
                END IF;
                IF v_country.financial_stopper_usd IS NULL OR v_country.financial_stopper_usd <= 0 THEN
                    RAISE EXCEPTION 'COUNTRY_GATE_D13_BLOCKED_S03: Financial stopper S03 must be > 0 before activation (D14).';
                END IF;
                IF v_merch_cnt < v_country.min_merchants_threshold THEN
                    RAISE EXCEPTION 'COUNTRY_GATE_D13_BLOCKED_MERCHANTS: Active merchants (%) < threshold (%) (T06/D13).', v_merch_cnt, v_country.min_merchants_threshold;
                END IF;

                v_next_month_ts := date_trunc('month', now() + interval '1 month');
                UPDATE sawyan.countries
                   SET is_active      = true,
                       effective_from = v_next_month_ts,
                       recorded_at    = now()
                 WHERE id = v_country.id;

                v_exec_effect := jsonb_build_object(
                    'effect', 'country_activated_d13',
                    'country_code', v_country.country_code,
                    'effective_from', v_next_month_ts,
                    'active_merchants', v_merch_cnt
                );
            END IF;

        ELSIF v_req.action_type = 'BITEMPORAL_SETTINGS_UPDATE' THEN
            SELECT * INTO v_cur_settings
              FROM sawyan.settings
             WHERE country_id IS NULL AND effective_from <= now()
             ORDER BY effective_from DESC, recorded_at DESC
             LIMIT 1;
            IF NOT FOUND THEN
                SELECT * INTO v_cur_settings
                  FROM sawyan.settings
                 WHERE country_id IS NULL
                 ORDER BY effective_from DESC, recorded_at DESC
                 LIMIT 1;
            END IF;

            INSERT INTO sawyan.settings (
                country_id, brand_display_title, company_percent, generations_count,
                numerical_stopper_s01, upline_ceiling_s02, cap_auto_calc, cap_amount,
                monthly_target_usd, payout_day, merchant_warn1_pct, merchant_warn2_pct,
                merchant_isolate_pct, unsecured_queue_cap, unconfirmed_soft_hold_cap_pct,
                wht_threshold_usd, withdrawal_cooldown_hours, dormancy_months,
                fifo_default_days, pending_sla_hours,
                warn_escalated_tx_30d, restrict_escalated_tx_30d,
                warn_lost_disputes_30d, restrict_lost_disputes_30d,
                warn_verified_complaints_30d, restrict_verified_complaints_30d,
                d4_cycle_days, d4_cycle_cutoff_time, d4_grace_hours,
                effective_from, created_by_admin_id, approved_by_admin_id, change_reason
            ) VALUES (
                NULL,
                'SAWYAN',
                COALESCE((v_req.payload_after->>'company_percent')::numeric, v_cur_settings.company_percent),
                COALESCE((v_req.payload_after->>'numerical_stopper_s01')::int, v_cur_settings.generations_count),
                COALESCE((v_req.payload_after->>'numerical_stopper_s01')::int, v_cur_settings.numerical_stopper_s01),
                COALESCE((v_req.payload_after->>'upline_ceiling_s02')::int, v_cur_settings.upline_ceiling_s02),
                COALESCE((v_req.payload_after->>'cap_auto_calc')::boolean, v_cur_settings.cap_auto_calc),
                COALESCE((v_req.payload_after->>'cap_amount')::numeric, v_cur_settings.cap_amount),
                COALESCE((v_req.payload_after->>'monthly_target_usd')::numeric, v_cur_settings.monthly_target_usd),
                COALESCE((v_req.payload_after->>'payout_day')::smallint, v_cur_settings.payout_day),
                COALESCE((v_req.payload_after->>'merchant_warn1_pct')::numeric, v_cur_settings.merchant_warn1_pct),
                COALESCE((v_req.payload_after->>'merchant_warn2_pct')::numeric, v_cur_settings.merchant_warn2_pct),
                COALESCE((v_req.payload_after->>'merchant_isolate_pct')::numeric, v_cur_settings.merchant_isolate_pct),
                COALESCE((v_req.payload_after->>'unsecured_queue_cap')::smallint, v_cur_settings.unsecured_queue_cap),
                COALESCE((v_req.payload_after->>'unconfirmed_soft_hold_cap_pct')::numeric, v_cur_settings.unconfirmed_soft_hold_cap_pct),
                COALESCE((v_req.payload_after->>'wht_threshold_usd')::numeric, v_cur_settings.wht_threshold_usd),
                COALESCE((v_req.payload_after->>'withdrawal_cooldown_hours')::int, v_cur_settings.withdrawal_cooldown_hours),
                COALESCE((v_req.payload_after->>'dormancy_months')::int, v_cur_settings.dormancy_months),
                COALESCE((v_req.payload_after->>'fifo_default_days')::smallint, v_cur_settings.fifo_default_days),
                COALESCE((v_req.payload_after->>'pending_sla_hours')::smallint, v_cur_settings.pending_sla_hours),
                COALESCE((v_req.payload_after->>'warn_escalated_tx_30d')::smallint, v_cur_settings.warn_escalated_tx_30d),
                COALESCE((v_req.payload_after->>'restrict_escalated_tx_30d')::smallint, v_cur_settings.restrict_escalated_tx_30d),
                COALESCE((v_req.payload_after->>'warn_lost_disputes_30d')::smallint, v_cur_settings.warn_lost_disputes_30d),
                COALESCE((v_req.payload_after->>'restrict_lost_disputes_30d')::smallint, v_cur_settings.restrict_lost_disputes_30d),
                COALESCE((v_req.payload_after->>'warn_verified_complaints_30d')::smallint, v_cur_settings.warn_verified_complaints_30d),
                COALESCE((v_req.payload_after->>'restrict_verified_complaints_30d')::smallint, v_cur_settings.restrict_verified_complaints_30d),
                COALESCE((v_req.payload_after->>'d4_cycle_days')::smallint, v_cur_settings.d4_cycle_days, 1),
                COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'d4_cycle_cutoff_time', '')), '')::time, v_cur_settings.d4_cycle_cutoff_time, '23:59:00'::time),
                COALESCE((v_req.payload_after->>'d4_grace_hours')::numeric, v_cur_settings.d4_grace_hours, 2.00),
                COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'effective_from', '')), '')::timestamptz, date_trunc('month', now() + interval '1 month')),
                v_req.maker_admin_id,
                p_admin_id,
                v_req.reason
            ) RETURNING id INTO v_new_set_id;

            v_exec_effect := jsonb_build_object('effect', 'bitemporal_settings_version_created', 'settings_id', v_new_set_id);

        ELSIF v_req.action_type = 'MERCHANT_TOPUP_BANK_VERIFICATION' THEN
            v_topup_res := sawyan.process_merchant_topup_fifo(
                (v_req.payload_after->>'merchant_id')::uuid,
                (v_req.payload_after->>'amount')::numeric,
                COALESCE(v_req.payload_after->>'payment_ref', 'MC-TOPUP-' || substr(p_request_id::text, 1, 8)),
                p_request_id,
                COALESCE((v_req.payload_after->>'psp_fee')::numeric, 0.00),
                COALESCE(v_req.payload_after->>'provider', 'bank_transfer')
            );
            v_exec_effect := jsonb_build_object('effect', 'merchant_topup_fifo_executed', 'topup_result', v_topup_res);

        ELSIF v_req.action_type = 'MERCHANT_GOVERNANCE_ACTION' THEN
            SELECT * INTO v_mer
              FROM sawyan.merchants
             WHERE id = COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'merchant_id', '')), '')::uuid, v_req.target_id::uuid)
             FOR UPDATE;
            IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;

            v_new_ded  := NULLIF(trim(COALESCE(v_req.payload_after->>'deduction_percent', '')), '')::numeric;
            v_new_cred := NULLIF(trim(COALESCE(v_req.payload_after->>'credit_limit', '')), '')::numeric;
            v_new_onb  := NULLIF(trim(COALESCE(v_req.payload_after->>'onboarding_status', '')), '');
            v_new_gov  := NULLIF(trim(COALESCE(v_req.payload_after->>'governance_status', '')), '');

            IF v_new_ded IS NOT NULL AND (v_new_ded < 0.50 OR v_new_ded > 95.00) THEN
                RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
            END IF;
            IF v_new_cred IS NOT NULL AND v_new_cred < 0 THEN
                RAISE EXCEPTION 'INVALID_CREDIT_LIMIT_NEGATIVE';
            END IF;

            UPDATE sawyan.merchants
               SET deduction_percent               = COALESCE(v_new_ded, deduction_percent),
                   category                        = COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'category', '')), ''), category),
                   credit_limit                    = COALESCE(v_new_cred, credit_limit),
                   package_base_amount             = GREATEST(package_base_amount, COALESCE(v_new_cred, credit_limit)),
                   onboarding_status               = COALESCE(v_new_onb, onboarding_status),
                   onboarding_notes                = CASE WHEN v_req.payload_after ? 'onboarding_notes' THEN NULLIF(trim(COALESCE(v_req.payload_after->>'onboarding_notes', '')), '') ELSE onboarding_notes END,
                   governance_status               = COALESCE(v_new_gov, governance_status),
                   pre_pause_governance_status     = CASE
                       WHEN v_new_gov IN ('good_standing', 'probation_warning', 'restricted_no_reject', 'suspended_compliance', 'banned_permanent') THEN NULL
                       WHEN v_new_gov IN ('paused_by_admin', 'paused_by_merchant') AND governance_status IN ('good_standing', 'probation_warning') THEN governance_status
                       ELSE pre_pause_governance_status
                   END,
                   governance_reason               = COALESCE(NULLIF(trim(COALESCE(v_req.payload_after->>'governance_reason', v_req.reason)), ''), governance_reason),
                   governance_updated_at           = CASE WHEN v_new_gov IS NOT NULL THEN now() ELSE governance_updated_at END,
                   unsecured_queue_cap_override    = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_queue_cap_override')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'unsecured_queue_cap_override', '')), '') IS NOT NULL THEN (v_req.payload_after->>'unsecured_queue_cap_override')::smallint
                       ELSE unsecured_queue_cap_override
                   END,
                   isolate_pct_override            = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_isolate_pct_override')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'isolate_pct_override', '')), '') IS NOT NULL THEN (v_req.payload_after->>'isolate_pct_override')::numeric
                       ELSE isolate_pct_override
                   END,
                   deferred_settlement_cutoff_time = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_cutoff_time')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'deferred_settlement_cutoff_time', '')), '') IS NOT NULL THEN (v_req.payload_after->>'deferred_settlement_cutoff_time')::time
                       ELSE deferred_settlement_cutoff_time
                   END,
                   d4_cycle_days_override          = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_d4_cycle_days')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'d4_cycle_days_override', '')), '') IS NOT NULL THEN (v_req.payload_after->>'d4_cycle_days_override')::smallint
                       ELSE d4_cycle_days_override
                   END,
                   d4_grace_hours_override         = CASE
                       WHEN COALESCE((v_req.payload_after->>'clear_d4_grace_hours')::boolean, false) THEN NULL
                       WHEN NULLIF(trim(COALESCE(v_req.payload_after->>'d4_grace_hours_override', '')), '') IS NOT NULL THEN ROUND((v_req.payload_after->>'d4_grace_hours_override')::numeric, 2)
                       ELSE d4_grace_hours_override
                   END,
                   metadata                        = (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                       'contract_reviewed_at', now(),
                       'contract_reviewed_by', p_admin_id,
                       'commission_locked', CASE WHEN COALESCE(v_new_ded, deduction_percent) >= 0.50 AND (COALESCE(v_new_onb, onboarding_status) = 'approved' OR COALESCE(v_new_cred, credit_limit) > 0 OR actual_cash_balance > 0 OR v_new_ded IS NOT NULL) THEN true ELSE COALESCE((metadata->>'commission_locked')::boolean, false) END,
                       'commission_pending', CASE WHEN COALESCE(v_new_ded, deduction_percent) >= 0.50 THEN false ELSE true END
                   )) || CASE
                       WHEN v_req.payload_after ? 'd4_disable_time_trigger' THEN jsonb_build_object('d4_time_trigger_disabled', COALESCE((v_req.payload_after->>'d4_disable_time_trigger')::boolean, false))
                       ELSE '{}'::jsonb
                   END
             WHERE id = v_mer.id
            RETURNING * INTO v_mer;

            FOR v_qtx IN
                SELECT id, commission_amount
                  FROM sawyan.transactions
                 WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup'
                 ORDER BY fifo_seq ASC
            LOOP
                SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
                IF (v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit) >= v_qtx.commission_amount THEN
                    PERFORM sawyan.feed_monthly_target_box(v_qtx.id, p_admin_id);
                    v_released := v_released + 1;
                ELSE
                    EXIT;
                END IF;
            END LOOP;

            v_eff_res := sawyan.sync_merchant_status_flags(v_mer.id);

            IF v_new_gov IS NOT NULL THEN
                INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload, dispatched_at)
                VALUES ('merchant', v_mer.id, 'MerchantGovernanceUpdated', 'in_app',
                        jsonb_build_object('governance_status', v_new_gov, 'reason', COALESCE(v_req.reason, 'تحديث امتثال/تعاقد')), now());
            END IF;

            v_exec_effect := jsonb_build_object(
                'effect', 'merchant_governance_action_applied',
                'merchant_id', v_mer.id,
                'released_fifo_count', v_released,
                'lifecycle', v_eff_res
            );

        ELSIF v_req.action_type = 'PARTNER_CONTRACT_D24' THEN
            INSERT INTO sawyan.partners (
                partner_code, full_name, email, phone, auth_user_id,
                partnership_scope, scope_targets, profit_basis, profit_share_pct, contract_ref, is_active
            ) VALUES (
                upper(trim(v_req.payload_after->>'partner_code')),
                trim(v_req.payload_after->>'full_name'),
                lower(trim(v_req.payload_after->>'email')),
                trim(v_req.payload_after->>'phone'),
                gen_random_uuid(),
                COALESCE(v_req.payload_after->>'partnership_scope', 'country'),
                COALESCE(v_req.payload_after->'scope_targets', '{}'::jsonb),
                COALESCE(v_req.payload_after->>'profit_basis', 'net_treasury_after_expenses'),
                (v_req.payload_after->>'profit_share_pct')::numeric,
                trim(v_req.payload_after->>'contract_ref'),
                COALESCE((v_req.payload_after->>'is_active')::boolean, true)
            )
            ON CONFLICT (partner_code) DO UPDATE
               SET full_name         = EXCLUDED.full_name,
                   partnership_scope = EXCLUDED.partnership_scope,
                   scope_targets     = EXCLUDED.scope_targets,
                   profit_basis      = EXCLUDED.profit_basis,
                   profit_share_pct  = EXCLUDED.profit_share_pct,
                   contract_ref      = EXCLUDED.contract_ref,
                   is_active         = EXCLUDED.is_active
            RETURNING id INTO v_partner_id;

            v_exec_effect := jsonb_build_object('effect', 'corporate_partner_registered_d24', 'partner_id', v_partner_id);

        ELSIF v_req.action_type = 'BREAK_GLASS_UNLOCK' THEN
            v_bg_ym := trim(COALESCE(v_req.payload_after->>'period_ym', v_req.target_id));

            SELECT COUNT(*) INTO v_total_cycles
              FROM sawyan.settlement_cycles
             WHERE period_ym = v_bg_ym;
            IF v_total_cycles = 0 THEN
                RAISE EXCEPTION 'SETTLEMENT_CYCLE_NOT_FOUND: %', v_bg_ym;
            END IF;

            UPDATE sawyan.settlement_cycles
               SET is_hard_locked         = false,
                   step_status            = 4,
                   break_glass_expires_at = sawyan.now_utc() + interval '2 hours'
             WHERE period_ym = v_bg_ym
               AND payout_executed_at IS NULL;
            GET DIAGNOSTICS v_unlocked = ROW_COUNT;

            UPDATE sawyan.settlement_cycles
               SET break_glass_expires_at = sawyan.now_utc() + interval '2 hours'
             WHERE period_ym = v_bg_ym
               AND payout_executed_at IS NOT NULL;

            PERFORM sawyan.append_audit_log(
                'admin',
                p_admin_id,
                'break_glass_hard_lock_reopened_2h',
                'settlement_cycles',
                v_bg_ym,
                jsonb_build_object('is_hard_locked', true),
                jsonb_build_object(
                    'is_hard_locked', (v_unlocked = 0),
                    'unlocked_pre_payout_cycles', v_unlocked,
                    'audit_adjustment_only', (v_unlocked = 0),
                    'maker_admin_id', v_req.maker_admin_id,
                    'checker_admin_id', p_admin_id,
                    'reason', v_req.reason
                )
            );

            v_exec_effect := jsonb_build_object(
                'effect', 'break_glass_unlocked_2h',
                'period_ym', v_bg_ym,
                'unlocked_pre_payout_cycles', v_unlocked,
                'audit_adjustment_only', (v_unlocked = 0),
                'window_expires_at', sawyan.now_utc() + interval '2 hours'
            );

        ELSIF v_req.action_type = 'MANUAL_AUDIT_JOURNAL_ADJUSTMENT' THEN
            v_bg_ym       := trim(COALESCE(v_req.payload_after->>'period_ym', v_req.target_id));
            v_debit_acct  := trim(COALESCE(v_req.payload_after->>'debit_account_code', ''));
            v_credit_acct := trim(COALESCE(v_req.payload_after->>'credit_account_code', ''));
            v_adj_amt     := ROUND(COALESCE((v_req.payload_after->>'amount_usd')::numeric, 0.00), 2);
            v_adj_cid     := NULL;

            IF NULLIF(upper(trim(COALESCE(v_req.payload_after->>'country_code', ''))), '') IS NOT NULL THEN
                SELECT id INTO v_adj_cid FROM sawyan.countries WHERE country_code = upper(trim(v_req.payload_after->>'country_code'));
                IF NOT FOUND THEN RAISE EXCEPTION 'COUNTRY_NOT_FOUND'; END IF;
            END IF;

            SELECT * INTO v_adj_cycle
              FROM sawyan.settlement_cycles
             WHERE period_ym = v_bg_ym
               AND (v_adj_cid IS NULL OR country_id = v_adj_cid)
               AND break_glass_expires_at IS NOT NULL
               AND break_glass_expires_at > sawyan.now_utc()
             ORDER BY id ASC
             LIMIT 1;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'BREAK_GLASS_WINDOW_REQUIRED_FOR_MANUAL_AUDIT_ADJUSTMENT';
            END IF;

            IF v_adj_amt <= 0 OR v_debit_acct = '' OR v_credit_acct = '' OR v_debit_acct = v_credit_acct THEN
                RAISE EXCEPTION 'INVALID_MANUAL_AUDIT_JOURNAL_PARAMETERS';
            END IF;

            IF NOT EXISTS (SELECT 1 FROM sawyan.chart_of_accounts WHERE account_code = v_debit_acct)
               OR NOT EXISTS (SELECT 1 FROM sawyan.chart_of_accounts WHERE account_code = v_credit_acct)
            THEN
                RAISE EXCEPTION 'UNKNOWN_COA_ACCOUNT_CODE_IN_MANUAL_ADJUSTMENT';
            END IF;

            INSERT INTO sawyan.journal_entries (
                settlement_cycle_id, source_type, source_id, country_id, fx_rate_used, description, posted_at
            ) VALUES (
                v_adj_cycle.id, 'MANUAL_AUDIT_ADJUSTMENT', p_request_id, v_adj_cycle.country_id, 1.000000, v_req.reason, sawyan.now_utc()
            ) RETURNING id INTO v_adj_je_id;

            INSERT INTO sawyan.journal_lines (journal_entry_id, account_code, entity_type, entity_id, debit_usd, credit_usd, amount_local, currency_code)
            VALUES
                (v_adj_je_id, v_debit_acct,  NULLIF(trim(COALESCE(v_req.payload_after->>'debit_entity_type', '')), ''),  NULLIF(trim(COALESCE(v_req.payload_after->>'debit_entity_id', '')), '')::uuid,  v_adj_amt, 0.00, v_adj_amt, 'USD'),
                (v_adj_je_id, v_credit_acct, NULLIF(trim(COALESCE(v_req.payload_after->>'credit_entity_type', '')), ''), NULLIF(trim(COALESCE(v_req.payload_after->>'credit_entity_id', '')), '')::uuid, 0.00, v_adj_amt, v_adj_amt, 'USD');

            PERFORM sawyan.append_audit_log(
                'admin',
                p_admin_id,
                'manual_audit_journal_adjustment_posted',
                'journal_entries',
                v_adj_je_id::text,
                NULL,
                jsonb_build_object('period_ym', v_bg_ym, 'debit_account_code', v_debit_acct, 'credit_account_code', v_credit_acct, 'amount_usd', v_adj_amt, 'reason', v_req.reason)
            );

            v_exec_effect := jsonb_build_object(
                'effect', 'manual_audit_journal_posted',
                'journal_entry_id', v_adj_je_id,
                'period_ym', v_bg_ym,
                'amount_usd', v_adj_amt
            );

        ELSIF v_req.action_type = 'MERCHANT_CREDIT_EXCEPTION_D4' THEN
            UPDATE sawyan.merchants
               SET credit_limit                    = COALESCE((v_req.payload_after->>'credit_limit')::numeric, credit_limit),
                   deferred_settlement_cap_amount  = COALESCE((v_req.payload_after->>'deferred_settlement_cap_amount')::numeric, deferred_settlement_cap_amount),
                   deferred_settlement_cutoff_time = COALESCE((v_req.payload_after->>'deferred_settlement_cutoff_time')::time, deferred_settlement_cutoff_time),
                   d4_cycle_days_override          = COALESCE((v_req.payload_after->>'d4_cycle_days_override')::smallint, d4_cycle_days_override),
                   d4_grace_hours_override         = COALESCE((v_req.payload_after->>'d4_grace_hours_override')::numeric, d4_grace_hours_override)
             WHERE id = (v_req.payload_after->>'merchant_id')::uuid;
            PERFORM sawyan.sync_merchant_status_flags((v_req.payload_after->>'merchant_id')::uuid);
            v_exec_effect := jsonb_build_object('effect', 'merchant_credit_exception_applied_d4', 'merchant_id', v_req.payload_after->>'merchant_id');

        ELSIF v_req.action_type = 'WITHDRAWAL_DUAL_APPROVAL_W05' THEN
            UPDATE sawyan.wallet_transactions SET status = 'completed' WHERE id = (v_req.target_id)::uuid AND transaction_type = 'withdrawal';
            v_exec_effect := jsonb_build_object('effect', 'withdrawal_w05_dual_completed', 'wallet_tx_id', v_req.target_id);
        END IF;
    END IF;

    RETURN v_mc_res || jsonb_build_object('execution', v_exec_effect);
END;
$$;

-- اسقاط النسخ القديمة (13 و 22 معاملاً) لضمان عدم تعارض التوقيع في PostgREST، ثم إنشاء النسخة المطورة (27 معاملاً)
DROP FUNCTION IF EXISTS sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT, VARCHAR, VARCHAR, SMALLINT, BOOLEAN, NUMERIC, BOOLEAN, TIME, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION sawyan.admin_manage_merchant_contract(
    p_admin_id                        UUID,
    p_session_token                   TEXT,
    p_merchant_id                     UUID,
    p_action                          VARCHAR,
    p_deduction_percent               NUMERIC DEFAULT NULL,
    p_category                        VARCHAR DEFAULT NULL,
    p_credit_limit                    NUMERIC DEFAULT NULL,
    p_is_active                       BOOLEAN DEFAULT NULL,
    p_is_isolated                     BOOLEAN DEFAULT NULL,
    p_topup_amount_local              NUMERIC DEFAULT NULL,
    p_topup_bank_ref                  TEXT    DEFAULT NULL,
    p_topup_proof_notif_id            UUID    DEFAULT NULL,
    p_reason                          TEXT    DEFAULT 'تحديث تعاقدي معتمد من إدارة علاقات التجار',
    p_onboarding_status               VARCHAR DEFAULT NULL,
    p_governance_status               VARCHAR DEFAULT NULL,
    p_unsecured_queue_cap_override    SMALLINT DEFAULT NULL,
    p_clear_queue_cap_override        BOOLEAN DEFAULT false,
    p_isolate_pct_override            NUMERIC DEFAULT NULL,
    p_clear_isolate_pct_override      BOOLEAN DEFAULT false,
    p_deferred_settlement_cutoff_time TIME    DEFAULT NULL,
    p_clear_cutoff_time               BOOLEAN DEFAULT false,
    p_onboarding_notes                TEXT    DEFAULT NULL,
    p_d4_cycle_days_override          SMALLINT DEFAULT NULL,
    p_clear_d4_cycle_days             BOOLEAN DEFAULT false,
    p_d4_grace_hours_override         NUMERIC DEFAULT NULL,
    p_clear_d4_grace_hours            BOOLEAN DEFAULT false,
    p_d4_disable_time_trigger         BOOLEAN DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm           JSONB;
    v_mer           sawyan.merchants%ROWTYPE;
    v_act           VARCHAR(30);
    v_mc_res        JSONB;
    v_qtx           RECORD;
    v_released      INT := 0;
    v_rem_q         INT := 0;
    v_free_bal      NUMERIC(18,2) := 0.00;
    v_eff           JSONB;
    v_is_founder    BOOLEAN := false;
    v_eff_gov       VARCHAR(30);
    v_eff_onb       VARCHAR(30);
    v_cred_changed  BOOLEAN := false;
    v_needs_mc      BOOLEAN := false;
    v_payload       JSONB;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance', 'reviewer'], true);
    v_act := lower(trim(COALESCE(p_action, 'update_contract')));
    v_is_founder := COALESCE((v_adm->>'is_sovereign_founder')::boolean, false);

    SELECT * INTO v_mer FROM sawyan.merchants WHERE id = p_merchant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MERCHANT_NOT_FOUND'; END IF;

    IF v_act = 'approve_bank_topup' THEN
        IF COALESCE(p_topup_amount_local, 0) <= 0 OR length(trim(COALESCE(p_topup_bank_ref, ''))) < 3 THEN
            RAISE EXCEPTION 'VALID_TOPUP_AMOUNT_AND_BANK_REF_REQUIRED';
        END IF;

        v_mc_res := sawyan.admin_submit_governance_request(
            p_admin_id,
            p_session_token,
            'MERCHANT_TOPUP_BANK_VERIFICATION',
            'merchants',
            v_mer.id::text,
            jsonb_build_object(
                'merchant_id', v_mer.id,
                'amount', p_topup_amount_local,
                'payment_ref', trim(p_topup_bank_ref),
                'psp_fee', 0.00,
                'provider', 'bank_transfer'
            ),
            COALESCE(NULLIF(trim(p_reason), ''), 'شحن رصيد بنكي موثق مرجع ' || trim(p_topup_bank_ref))
        );

        IF p_topup_proof_notif_id IS NOT NULL THEN
            UPDATE sawyan.notifications
               SET event_name = 'MerchantBankTopupProofProcessed',
                   is_read    = true
             WHERE id = p_topup_proof_notif_id;
        END IF;

        RETURN v_mc_res;
    END IF;

    IF p_deduction_percent IS NOT NULL AND (p_deduction_percent < 0.50 OR p_deduction_percent > 95.00) THEN
        RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
    END IF;
    IF p_credit_limit IS NOT NULL AND p_credit_limit < 0 THEN
        RAISE EXCEPTION 'INVALID_CREDIT_LIMIT_NEGATIVE';
    END IF;
    IF p_d4_cycle_days_override IS NOT NULL AND (p_d4_cycle_days_override < 1 OR p_d4_cycle_days_override > 90) THEN
        RAISE EXCEPTION 'INVALID_D4_CYCLE_DAYS_RANGE';
    END IF;
    IF p_d4_grace_hours_override IS NOT NULL AND (p_d4_grace_hours_override < 0 OR p_d4_grace_hours_override > 168) THEN
        RAISE EXCEPTION 'INVALID_D4_GRACE_HOURS_RANGE';
    END IF;

    v_eff_onb := NULLIF(lower(trim(COALESCE(p_onboarding_status, ''))), '');
    IF v_eff_onb IS NOT NULL AND v_eff_onb NOT IN ('draft_incomplete', 'needs_correction', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'INVALID_ONBOARDING_STATUS: %', p_onboarding_status;
    END IF;

    v_eff_gov := NULLIF(lower(trim(COALESCE(p_governance_status, ''))), '');
    IF v_eff_gov IS NOT NULL AND v_eff_gov NOT IN (
        'good_standing', 'probation_warning', 'restricted_no_reject',
        'paused_by_merchant', 'paused_by_admin', 'suspended_compliance', 'banned_permanent'
    ) THEN
        RAISE EXCEPTION 'INVALID_GOVERNANCE_STATUS: %', p_governance_status;
    END IF;

    -- توافق رجعي مع الاستدعاءات التي تمرر p_is_active فقط
    IF v_eff_gov IS NULL THEN
        IF p_is_active IS FALSE THEN
            v_eff_gov := 'paused_by_admin';
        ELSIF p_is_active IS TRUE AND v_mer.governance_status IN ('paused_by_admin', 'paused_by_merchant') THEN
            v_eff_gov := COALESCE(v_mer.pre_pause_governance_status, 'good_standing');
        END IF;
    END IF;

    v_cred_changed := (p_credit_limit IS NOT NULL AND p_credit_limit IS DISTINCT FROM v_mer.credit_limit);
    v_needs_mc := (
        NOT v_is_founder
        AND (
            v_cred_changed
            OR v_eff_gov IN ('suspended_compliance', 'banned_permanent')
        )
    );

    IF v_needs_mc THEN
        v_payload := jsonb_strip_nulls(jsonb_build_object(
            'merchant_id', v_mer.id,
            'deduction_percent', p_deduction_percent,
            'category', NULLIF(trim(COALESCE(p_category, '')), ''),
            'credit_limit', p_credit_limit,
            'onboarding_status', v_eff_onb,
            'onboarding_notes', NULLIF(trim(COALESCE(p_onboarding_notes, '')), ''),
            'governance_status', v_eff_gov,
            'governance_reason', NULLIF(trim(COALESCE(p_reason, '')), ''),
            'unsecured_queue_cap_override', p_unsecured_queue_cap_override,
            'clear_queue_cap_override', CASE WHEN p_clear_queue_cap_override THEN true ELSE NULL END,
            'isolate_pct_override', p_isolate_pct_override,
            'clear_isolate_pct_override', CASE WHEN p_clear_isolate_pct_override THEN true ELSE NULL END,
            'deferred_settlement_cutoff_time', CASE WHEN p_deferred_settlement_cutoff_time IS NOT NULL THEN p_deferred_settlement_cutoff_time::text ELSE NULL END,
            'clear_cutoff_time', CASE WHEN p_clear_cutoff_time THEN true ELSE NULL END,
            'd4_cycle_days_override', p_d4_cycle_days_override,
            'clear_d4_cycle_days', CASE WHEN p_clear_d4_cycle_days THEN true ELSE NULL END,
            'd4_grace_hours_override', p_d4_grace_hours_override,
            'clear_d4_grace_hours', CASE WHEN p_clear_d4_grace_hours THEN true ELSE NULL END,
            'd4_disable_time_trigger', p_d4_disable_time_trigger
        ));

        v_mc_res := sawyan.admin_submit_governance_request(
            p_admin_id,
            p_session_token,
            'MERCHANT_GOVERNANCE_ACTION',
            'merchants',
            v_mer.id::text,
            v_payload,
            COALESCE(NULLIF(trim(p_reason), ''), 'طلب حوكمة/حد ائتمان D4 بانتظار المعتمد المالي/المؤسس')
        );
        RETURN v_mc_res || jsonb_build_object(
            'pending_maker_checker', true,
            'merchant_id', v_mer.id,
            'merchant_code', v_mer.merchant_code
        );
    END IF;

    UPDATE sawyan.merchants
       SET deduction_percent               = COALESCE(p_deduction_percent, deduction_percent),
           category                        = COALESCE(NULLIF(trim(p_category), ''), category),
           credit_limit                    = COALESCE(p_credit_limit, credit_limit),
           package_base_amount             = GREATEST(package_base_amount, COALESCE(p_credit_limit, credit_limit)),
           onboarding_status               = COALESCE(v_eff_onb, onboarding_status),
           onboarding_notes                = CASE
               WHEN p_onboarding_notes IS NOT NULL THEN NULLIF(trim(p_onboarding_notes), '')
               WHEN v_eff_onb = 'approved' THEN NULL
               ELSE onboarding_notes
           END,
           governance_status               = COALESCE(v_eff_gov, governance_status),
           pre_pause_governance_status     = CASE
               WHEN v_eff_gov IN ('good_standing', 'probation_warning', 'restricted_no_reject', 'suspended_compliance', 'banned_permanent') THEN NULL
               WHEN v_eff_gov IN ('paused_by_admin', 'paused_by_merchant') AND governance_status IN ('good_standing', 'probation_warning') THEN governance_status
               ELSE pre_pause_governance_status
           END,
           governance_reason               = CASE
               WHEN v_eff_gov IS NOT NULL OR NULLIF(trim(COALESCE(p_reason, '')), '') IS NOT NULL
               THEN COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), governance_reason)
               ELSE governance_reason
           END,
           governance_updated_at           = CASE WHEN v_eff_gov IS NOT NULL THEN now() ELSE governance_updated_at END,
           unsecured_queue_cap_override    = CASE
               WHEN p_clear_queue_cap_override THEN NULL
               WHEN p_unsecured_queue_cap_override IS NOT NULL THEN p_unsecured_queue_cap_override
               ELSE unsecured_queue_cap_override
           END,
           isolate_pct_override            = CASE
               WHEN p_clear_isolate_pct_override THEN NULL
               WHEN p_isolate_pct_override IS NOT NULL THEN ROUND(p_isolate_pct_override::numeric, 2)
               ELSE isolate_pct_override
           END,
           deferred_settlement_cutoff_time = CASE
               WHEN p_clear_cutoff_time THEN NULL
               WHEN p_deferred_settlement_cutoff_time IS NOT NULL THEN p_deferred_settlement_cutoff_time
               ELSE deferred_settlement_cutoff_time
           END,
           d4_cycle_days_override          = CASE
               WHEN p_clear_d4_cycle_days THEN NULL
               WHEN p_d4_cycle_days_override IS NOT NULL THEN p_d4_cycle_days_override
               ELSE d4_cycle_days_override
           END,
           d4_grace_hours_override         = CASE
               WHEN p_clear_d4_grace_hours THEN NULL
               WHEN p_d4_grace_hours_override IS NOT NULL THEN ROUND(p_d4_grace_hours_override::numeric, 2)
               ELSE d4_grace_hours_override
           END,
           metadata                        = (COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'contract_reviewed_at', now(),
               'contract_reviewed_by', p_admin_id,
               'commission_locked', CASE
                   WHEN COALESCE(p_deduction_percent, deduction_percent) >= 0.50
                        AND (COALESCE(v_eff_onb, onboarding_status) = 'approved' OR COALESCE(p_credit_limit, credit_limit) > 0 OR actual_cash_balance > 0 OR p_deduction_percent IS NOT NULL)
                   THEN true
                   ELSE COALESCE((metadata->>'commission_locked')::boolean, false)
               END,
               'commission_pending', CASE WHEN COALESCE(p_deduction_percent, deduction_percent) >= 0.50 THEN false ELSE true END
           )) || CASE
               WHEN p_d4_disable_time_trigger IS NOT NULL THEN jsonb_build_object('d4_time_trigger_disabled', p_d4_disable_time_trigger)
               ELSE '{}'::jsonb
           END
     WHERE id = v_mer.id
    RETURNING * INTO v_mer;

    FOR v_qtx IN
        SELECT id, commission_amount
          FROM sawyan.transactions
         WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup'
         ORDER BY fifo_seq ASC
    LOOP
        SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
        IF (v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit) >= v_qtx.commission_amount THEN
            PERFORM sawyan.feed_monthly_target_box(v_qtx.id, p_admin_id);
            v_released := v_released + 1;
        ELSE
            EXIT;
        END IF;
    END LOOP;

    v_eff := sawyan.sync_merchant_status_flags(v_mer.id);
    IF p_is_isolated IS TRUE AND COALESCE((v_eff->'effective_access'->>'is_visible_on_radar')::boolean, false) THEN
        UPDATE sawyan.merchants SET is_isolated = true WHERE id = v_mer.id;
    END IF;

    SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
    SELECT COUNT(*) INTO v_rem_q FROM sawyan.transactions WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup';
    v_free_bal := v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit;

    PERFORM sawyan.append_audit_log(
        'admin', p_admin_id, 'merchant_contract_updated', 'merchants', v_mer.id::text, NULL,
        jsonb_build_object(
            'deduction_percent', v_mer.deduction_percent,
            'credit_limit', v_mer.credit_limit,
            'onboarding_status', v_mer.onboarding_status,
            'governance_status', v_mer.governance_status,
            'financial_status', v_eff->>'financial_status',
            'actual_cash_balance', v_mer.actual_cash_balance,
            'soft_hold_balance', v_mer.soft_hold_balance,
            'free_balance', v_free_bal,
            'is_active', v_mer.is_active,
            'is_isolated', v_mer.is_isolated,
            'released_fifo_count', v_released,
            'remaining_queue', v_rem_q,
            'reason', p_reason
        )
    );

    RETURN jsonb_build_object(
        'merchant_id', v_mer.id,
        'merchant_code', v_mer.merchant_code,
        'deduction_percent', v_mer.deduction_percent,
        'credit_limit', v_mer.credit_limit,
        'onboarding_status', v_mer.onboarding_status,
        'governance_status', v_mer.governance_status,
        'financial_status', v_eff->>'financial_status',
        'effective_access', v_eff->'effective_access',
        'actual_cash_balance', v_mer.actual_cash_balance,
        'soft_hold_balance', v_mer.soft_hold_balance,
        'free_balance', v_free_bal,
        'is_active', v_mer.is_active,
        'is_isolated', v_mer.is_isolated,
        'released_fifo_count', v_released,
        'remaining_queue', v_rem_q,
        'pending_maker_checker', false
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.admin_search_and_reply_ops(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_action        VARCHAR,
    p_entity        VARCHAR DEFAULT 'members',
    p_query         TEXT    DEFAULT NULL,
    p_record_id     UUID    DEFAULT NULL,
    p_reply_text    TEXT    DEFAULT NULL,
    p_new_status    VARCHAR DEFAULT 'closed'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm          JSONB;
    v_scope        VARCHAR(10);
    v_q            TEXT;
    v_results      JSONB := '[]'::jsonb;
    v_can_view_kyc BOOLEAN := false;
    v_viewed_cnt   INT := 0;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, (lower(trim(p_action)) <> 'search'));
    SELECT COALESCE(metadata->>'country_scope', 'GLOBAL') INTO v_scope FROM sawyan.admins WHERE id = p_admin_id;
    v_q := lower(trim(COALESCE(p_query, '')));
    v_can_view_kyc := COALESCE(v_adm->>'role', '') IN ('kyc_officer', 'approver', 'reviewer', 'auditor');

    IF lower(trim(p_action)) = 'reply_support_ticket' THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['support', 'approver', 'reviewer'], true);
        UPDATE sawyan.support_tickets
           SET admin_reply       = trim(COALESCE(p_reply_text, '')),
               status            = COALESCE(NULLIF(trim(p_new_status), ''), 'closed'),
               assigned_admin_id = p_admin_id,
               updated_at        = now()
         WHERE id = p_record_id;
        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'support_ticket_replied', 'support_tickets', p_record_id::text, NULL, jsonb_build_object('status', p_new_status));
        RETURN jsonb_build_object('status', 'replied', 'ticket_id', p_record_id);
    END IF;

    IF lower(trim(p_entity)) = 'members' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb),
               COUNT(*) FILTER (WHERE NULLIF(t.kyc_doc_len, 0) > 0 OR NULLIF(t.res_doc_len, 0) > 0)
          INTO v_results, v_viewed_cnt
          FROM (
              SELECT m.id, m.member_code, m.full_name, m.email, m.phone,
                     c.country_code, m.kyc_status, m.kyc_docs_enc_ref,
                     m.is_active_in_tree, m.is_tombstone_banned, m.placement_side, m.generation_in_tree,
                     sp.member_code AS sponsor_code, sp.full_name AS sponsor_name,
                     COALESCE(w.balance_usd, 0.00) AS wallet_balance_usd,
                     COALESCE(w.total_earned_usd, 0.00) AS total_earned_usd,
                     COALESCE(w.s03_suspense_balance_usd, 0.00) AS s03_suspense_usd,
                     CASE
                         WHEN m.metadata ? 'kyc_submission' THEN
                             CASE WHEN v_can_view_kyc THEN m.metadata->'kyc_submission'
                                  ELSE (m.metadata->'kyc_submission') || '{"document_preview": null, "document_redacted": true}'::jsonb
                             END
                         ELSE NULL
                     END AS kyc_submission,
                     CASE
                         WHEN m.metadata ? 'pending_residency_move' THEN
                             CASE WHEN v_can_view_kyc THEN m.metadata->'pending_residency_move'
                                  ELSE (m.metadata->'pending_residency_move') || '{"document_preview": null, "document_redacted": true}'::jsonb
                             END
                         ELSE NULL
                     END AS pending_residency_move,
                     COALESCE(length(m.metadata #>> '{kyc_submission,document_preview}'), 0) AS kyc_doc_len,
                     COALESCE(length(m.metadata #>> '{pending_residency_move,document_preview}'), 0) AS res_doc_len,
                     m.created_at
                FROM sawyan.members m
                JOIN sawyan.countries c ON c.id = m.residency_country_id
                LEFT JOIN sawyan.members sp ON sp.id = m.sponsor_id
                LEFT JOIN sawyan.wallets w ON w.member_id = m.id
               WHERE m.member_code > 0
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (v_q = '' OR m.member_code::text = regexp_replace(v_q, '^#', '') OR lower(m.full_name) LIKE '%' || v_q || '%' OR m.phone LIKE '%' || v_q || '%' OR lower(COALESCE(m.email, '')) LIKE '%' || v_q || '%')
               ORDER BY m.created_at DESC
               LIMIT 100
          ) t;

        IF v_can_view_kyc AND v_viewed_cnt > 0 THEN
            PERFORM sawyan.append_audit_log('admin', p_admin_id, 'kyc_document_viewed', 'members', 'kyc_view:' || v_scope || ':' || COALESCE(NULLIF(v_q, ''), 'all'), NULL, jsonb_build_object('role', v_adm->>'role', 'viewed_count', v_viewed_cnt, 'query', v_q));
        END IF;

    ELSIF lower(trim(p_entity)) = 'merchants' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT m.id, m.merchant_code, m.business_name, m.owner_name, m.email, m.phone,
                     c.country_code, c.currency_code, m.category, m.merchant_type,
                     m.deduction_percent, m.package_base_amount, m.actual_cash_balance, m.soft_hold_balance,
                     m.credit_limit, m.tax_registration_no, m.is_active, m.is_isolated, m.created_at,
                     m.onboarding_status, m.onboarding_notes, m.governance_status, m.pre_pause_governance_status,
                     m.governance_reason, m.governance_updated_at, m.unsecured_queue_cap_override,
                     m.isolate_pct_override, m.deferred_settlement_cutoff_time, m.overdue_since_at,
                     m.d4_cycle_days_override, m.d4_grace_hours_override,
                     COALESCE((m.metadata->>'d4_time_trigger_disabled')::boolean, false) AS d4_time_trigger_disabled,
                     sawyan.compute_merchant_effective_state(m.id) AS lifecycle,
                     NULLIF(m.metadata->>'logo_url', '') AS logo_url,
                     NULLIF(m.metadata->>'cover_image_url', '') AS cover_image_url,
                     CASE WHEN jsonb_typeof(m.metadata->'images') = 'array' THEN m.metadata->'images' ELSE '[]'::jsonb END AS images,
                     COALESCE(m.metadata->'kyc_docs', '{}'::jsonb) AS kyc_docs,
                     (SELECT COUNT(*) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'completed') AS ops_count,
                     (SELECT COUNT(*) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'awaiting_merchant_topup') AS fifo_queue_count,
                     (SELECT COALESCE(SUM(tx.commission_amount), 0.00) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'awaiting_merchant_topup') AS fifo_required_comm_local,
                     (SELECT COALESCE(SUM(tx.total_amount), 0.00) FROM sawyan.transactions tx WHERE tx.merchant_id = m.id AND tx.status = 'completed') AS gmv_local
                FROM sawyan.merchants m
                JOIN sawyan.countries c ON c.id = m.country_id
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (v_q = '' OR lower(m.merchant_code) LIKE '%' || v_q || '%' OR lower(m.business_name) LIKE '%' || v_q || '%' OR m.phone LIKE '%' || v_q || '%')
               ORDER BY m.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'merchant_complaints' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT cp.id, cp.complainant_id, cp.target_id AS merchant_id, cp.category, cp.subject,
                     cp.details, cp.evidence_url, cp.status, cp.admin_notes, cp.reviewed_at, cp.created_at,
                     mem.member_code, mem.full_name AS member_name,
                     mer.merchant_code, mer.business_name AS merchant_name, mer.governance_status,
                     c.country_code
                FROM sawyan.complaints cp
                JOIN sawyan.members mem ON mem.id = cp.complainant_id
                JOIN sawyan.merchants mer ON mer.id = cp.target_id
                JOIN sawyan.countries c ON c.id = mer.country_id
               WHERE cp.target_type = 'merchant'
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (
                     v_q = ''
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR lower(mer.merchant_code) LIKE '%' || v_q || '%'
                     OR lower(cp.subject) LIKE '%' || v_q || '%'
                     OR lower(cp.status) = v_q
                     OR lower(cp.category) = v_q
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                 )
               ORDER BY CASE WHEN cp.status = 'open' THEN 0 ELSE 1 END, cp.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'transactions' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT tx.id, tx.sw_short_code, tx.unique_payment_ref, tx.amount, tx.total_amount,
                     tx.commission_amount, tx.company_share, tx.income_plan_share_local,
                     tx.income_plan_share_usd, tx.vat_amount, tx.currency_code, tx.fx_rate_used,
                     c.country_code, tx.payment_type, tx.status, tx.receipt_media_url, tx.fifo_seq,
                     tx.completed_at, tx.reversed_at, tx.created_at,
                     (tx.cashier_employee_id IS NOT NULL) AS is_instant_pin,
                     mem.member_code, mem.full_name AS member_name,
                     mer.merchant_code, mer.business_name AS merchant_name,
                     mb.branch_name,
                     bti.invoice_number AS b2b_invoice_number
                FROM sawyan.transactions tx
                JOIN sawyan.countries c ON c.id = tx.country_id
                JOIN sawyan.members mem ON mem.id = tx.member_id
                JOIN sawyan.merchants mer ON mer.id = tx.merchant_id
                LEFT JOIN sawyan.merchant_branches mb ON mb.id = tx.branch_id
                LEFT JOIN sawyan.b2b_tax_invoices bti ON bti.transaction_id = tx.id AND bti.document_type = 'tax_invoice'
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (
                     v_q = ''
                     OR lower(tx.sw_short_code) LIKE '%' || v_q || '%'
                     OR lower(tx.unique_payment_ref) LIKE '%' || v_q || '%'
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR lower(mer.merchant_code) LIKE '%' || v_q || '%'
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                     OR lower(tx.status) = v_q
                     OR lower(tx.payment_type) = v_q
                 )
               ORDER BY tx.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'disputes' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT d.*, tx.sw_short_code, tx.total_amount, tx.currency_code, tx.status AS tx_status,
                     c.country_code AS tx_country_code,
                     ROUND(tx.income_plan_share_usd::numeric, 2) AS income_plan_share_usd,
                     mem.member_code, mem.full_name AS member_name,
                     mer.merchant_code, mer.business_name AS merchant_name
                FROM sawyan.dispute_tickets d
                JOIN sawyan.transactions tx ON tx.id = d.transaction_id
                JOIN sawyan.countries c ON c.id = tx.country_id
                JOIN sawyan.members mem ON mem.id = d.member_id
                JOIN sawyan.merchants mer ON mer.id = d.merchant_id
               WHERE (v_scope = 'GLOBAL' OR c.country_code = v_scope)
                 AND (
                     v_q = ''
                     OR lower(tx.sw_short_code) LIKE '%' || v_q || '%'
                     OR lower(mer.business_name) LIKE '%' || v_q || '%'
                     OR mem.member_code::text = regexp_replace(v_q, '^#', '')
                     OR lower(d.status) = v_q
                 )
               ORDER BY d.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'support_tickets' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT s.*
                FROM sawyan.support_tickets s
               WHERE v_q = '' OR lower(COALESCE(s.subject, '')) LIKE '%' || v_q || '%' OR lower(COALESCE(s.message_body, '')) LIKE '%' || v_q || '%' OR lower(s.status) = v_q
               ORDER BY s.created_at DESC
               LIMIT 100
          ) t;

    ELSIF lower(trim(p_entity)) = 'bank_topup_proofs' THEN
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb) INTO v_results
          FROM (
              SELECT n.id, n.recipient_id AS merchant_id, n.event_name, n.payload, n.created_at,
                     mer.merchant_code, mer.business_name, c.country_code, c.currency_code
                FROM sawyan.notifications n
                JOIN sawyan.merchants mer ON mer.id = n.recipient_id
                JOIN sawyan.countries c ON c.id = mer.country_id
               WHERE n.event_name IN ('MerchantBankTopupSubmitted', 'MerchantBankTopupProofProcessed')
                 AND (v_scope = 'GLOBAL' OR c.country_code = v_scope)
               ORDER BY n.created_at DESC
               LIMIT 50
          ) t;
    END IF;

    RETURN jsonb_build_object('entity', p_entity, 'scope', v_scope, 'results', v_results);
END;
$$;

-- ============================================================================
-- 12. قفل الصلاحيات الأقل (Least-Privilege Lockdown) ومزامنة كافة التجار الحاليين
-- ============================================================================

REVOKE ALL ON FUNCTION sawyan.seed_default_registration_configs(VARCHAR, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.evaluate_merchant_profile_complete(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.compute_merchant_d4_cycle_info(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.is_merchant_d4_cutoff_breached(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.compute_merchant_effective_state(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.sync_merchant_status_flags(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.check_price_gouging_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.feed_monthly_target_box(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.process_merchant_topup_fifo(UUID, NUMERIC, VARCHAR, UUID, NUMERIC, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.decide_maker_checker_request(UUID, UUID, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.seed_default_registration_configs(VARCHAR, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.evaluate_merchant_profile_complete(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.compute_merchant_d4_cycle_info(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.is_merchant_d4_cutoff_breached(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.compute_merchant_effective_state(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.sync_merchant_status_flags(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.check_price_gouging_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.verify_merchant_session(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.feed_monthly_target_box(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.process_merchant_topup_fifo(UUID, NUMERIC, VARCHAR, UUID, NUMERIC, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.decide_maker_checker_request(UUID, UUID, VARCHAR, TEXT) TO service_role;

REVOKE ALL ON FUNCTION sawyan.authenticate_merchant_login(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.register_new_merchant(VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BIGINT, NUMERIC, NUMERIC, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_pos_transaction(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.confirm_or_reject_pending_tx(UUID, UUID, VARCHAR, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.cancel_member_pending_purchase(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_public_merchants_catalog(CHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_merchants_radar(NUMERIC, NUMERIC, NUMERIC, CHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_merchant_flash_offer(UUID, TEXT, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_member_merchant_complaint(UUID, UUID, VARCHAR, VARCHAR, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_operational_decision(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_decide_governance_request(UUID, TEXT, UUID, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT, VARCHAR, VARCHAR, SMALLINT, BOOLEAN, NUMERIC, BOOLEAN, TIME, BOOLEAN, TEXT, SMALLINT, BOOLEAN, NUMERIC, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_search_and_reply_ops(UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID, TEXT, VARCHAR) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION sawyan.authenticate_merchant_login(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.register_new_merchant(VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BIGINT, NUMERIC, NUMERIC, BIGINT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_pos_transaction(UUID, UUID, UUID, NUMERIC, VARCHAR, VARCHAR, VARCHAR, UUID, UUID, BOOLEAN, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.confirm_or_reject_pending_tx(UUID, UUID, VARCHAR, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.cancel_member_pending_purchase(UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_public_merchants_catalog(CHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchants_radar(NUMERIC, NUMERIC, NUMERIC, CHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_merchant_flash_offer(UUID, TEXT, TEXT, VARCHAR, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_merchant_complaint(UUID, UUID, VARCHAR, VARCHAR, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_operational_decision(UUID, TEXT, VARCHAR, TEXT, VARCHAR, TEXT, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_decide_governance_request(UUID, TEXT, UUID, VARCHAR, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT, VARCHAR, VARCHAR, SMALLINT, BOOLEAN, NUMERIC, BOOLEAN, TIME, BOOLEAN, TEXT, SMALLINT, BOOLEAN, NUMERIC, BOOLEAN, BOOLEAN) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_search_and_reply_ops(UUID, TEXT, VARCHAR, VARCHAR, TEXT, UUID, TEXT, VARCHAR) TO anon, authenticated, service_role;

-- مزامنة الحالة الفعالة لجميع التجار الحاليين عند تطبيق الترحيل
DO $$
DECLARE
    v_m RECORD;
BEGIN
    FOR v_m IN SELECT id FROM sawyan.merchants LOOP
        PERFORM sawyan.sync_merchant_status_flags(v_m.id);
    END LOOP;
END $$;
