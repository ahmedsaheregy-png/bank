-- ============================================================================
-- SAWYAN ECOSYSTEM — STAGE 9: DYNAMIC REGISTRATION & PROFILE FORM BUILDER,
-- STRICT EMAIL / ITU-T E.164 PHONE VALIDATION, SMART GEO-PICKER SUPPORT,
-- DEFERRED MERCHANT ONBOARDING COMPLETION & ANONYMIZED MAP PINS
-- ============================================================================
-- Architecture Rules Enforced:
--   * 100% Idempotent Expand & Contract Migration across `sawyan` & `sawyan_demo`
--   * Explicit RLS enabled + zero raw `anon`/`authenticated` table access
--   * Explicit `SET search_path = pg_catalog, pg_temp` on all SECURITY DEFINER RPCs
--   * ZERO bare lowercase `sawyan` inside SQL string literals for clean dual-schema clone
-- ============================================================================

-- 1. جداول حوكمة نماذج التسجيل والاستكمال (sawyan.registration_form_settings & registration_field_configs)
CREATE TABLE IF NOT EXISTS sawyan.registration_form_settings (
    form_type                VARCHAR(24) PRIMARY KEY CHECK (form_type IN (
        'merchant', 'member', 'employee_cashier', 'employee_admin'
    )),
    page_title_ar            TEXT NOT NULL,
    page_subtitle_ar         TEXT NOT NULL,
    optional_divider_text_ar TEXT NOT NULL,
    dashboard_banner_text_ar TEXT NOT NULL,
    updated_by_admin_id      UUID REFERENCES sawyan.admins(id) ON DELETE SET NULL,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sawyan.registration_field_configs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_type             VARCHAR(24) NOT NULL CHECK (form_type IN (
        'merchant', 'member', 'employee_cashier', 'employee_admin'
    )),
    field_key             VARCHAR(64) NOT NULL,
    section_group         VARCHAR(32) NOT NULL DEFAULT 'basic',
    display_mode          VARCHAR(24) NOT NULL DEFAULT 'initial_optional' CHECK (display_mode IN (
        'initial_required', 'initial_optional', 'dashboard_only', 'hidden'
    )),
    show_in_initial       BOOLEAN NOT NULL DEFAULT true,
    required_in_initial   BOOLEAN NOT NULL DEFAULT false,
    show_in_dashboard     BOOLEAN NOT NULL DEFAULT true,
    required_in_dashboard BOOLEAN NOT NULL DEFAULT false,
    is_system_locked      BOOLEAN NOT NULL DEFAULT false,
    label_ar              TEXT NOT NULL,
    placeholder_ar        TEXT NOT NULL DEFAULT '',
    help_text_ar          TEXT NOT NULL DEFAULT '',
    sort_order            INT NOT NULL DEFAULT 100,
    extra_config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by_admin_id   UUID REFERENCES sawyan.admins(id) ON DELETE SET NULL,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (form_type, field_key)
);

CREATE INDEX IF NOT EXISTS idx_reg_field_configs_form_sort
    ON sawyan.registration_field_configs (form_type, sort_order, field_key);

ALTER TABLE sawyan.registration_form_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sawyan.registration_field_configs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE sawyan.registration_form_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE sawyan.registration_field_configs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE sawyan.registration_form_settings TO service_role;
GRANT ALL ON TABLE sawyan.registration_field_configs TO service_role;

-- 2. إزالة تقييد الـ 40% عن نسبة عمولة التاجر ودعم التاجيل (0.00 معلق أو 0.50% - 95.00%)
DO $$
DECLARE
    v_con RECORD;
BEGIN
    FOR v_con IN
        SELECT conname
          FROM pg_constraint
         WHERE conrelid = 'sawyan.merchants'::regclass
           AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%deduction_percent%'
    LOOP
        EXECUTE format('ALTER TABLE sawyan.merchants DROP CONSTRAINT IF EXISTS %I', v_con.conname);
    END LOOP;

    ALTER TABLE sawyan.merchants
        ADD CONSTRAINT chk_merchants_deduction_percent_v3
        CHECK (deduction_percent = 0.00 OR (deduction_percent >= 0.50 AND deduction_percent <= 95.00));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. دالة البذور الافتراضية واستعادة الإعدادات القياسية (داخلية لـ service_role)
CREATE OR REPLACE FUNCTION sawyan.seed_default_registration_configs(
    p_form_type   VARCHAR DEFAULT NULL,
    p_force_reset BOOLEAN DEFAULT false
) RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_target VARCHAR(24) := NULLIF(lower(trim(COALESCE(p_form_type, ''))), '');
BEGIN
    -- أ) ترويسات ونصوص الفواصل للنماذج الأربعة
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
        'تسجيل تاجر جديد',
        'انضم إلى شبكة SAWYAN واستقطب آلاف المشترين لمتجرك',
        'البيانات التالية مهمة لتفعيل متجرك وظهوره بشكل متماسك أمام الأعضاء، لكن يمكنك تخطيها الآن واستكمالها بسهولة من لوحة التحكم بعد إتمام التسجيل المبدئي.',
        'استكمل بيانات متجرك التالية ليظهر مشروعك بشكل متماسك وجذاب أمام الأعضاء ويصبح جاهزاً للتفعيل واستقبال الفواتير.'
    ),
    (
        'member',
        'تسجيل عضو جديد',
        'انضم إلى منصة SAWYAN مجاناً وحوّل مشترياتك اليومية إلى عائدات حقيقية',
        'بيانات تكميلية اختيارية — يمكنك تخطيها الآن والبدء فوراً، واستكمالها لاحقاً من لوحتك أو عند أول سحب أرباح.',
        'استكمل بياناتك التكميلية من الإعدادات لتسهيل اكتشاف المتاجر القريبة وتجهيز حسابك لسحب الأرباح.'
    ),
    (
        'employee_cashier',
        'إضافة موظف كاشير للمتجر',
        'أنشئ حساب كاشير برمز سري مستقل (4 أرقام) لاعتماد فواتير العملاء وحماية مبيعاتك',
        'خيارات رقابية إضافية اختيارية لحماية المتجر ومتابعة أداء الموظف.',
        'قم بتحديث بيانات موظفي الكاشير وصلاحياتهم من تبويب الإعدادات والكاشير.'
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

    -- ب) الحقول القياسية لكل نموذج
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
    -- === نموذج التاجر (29 خانة متكاملة) ===
    ('merchant', 'business_name',        'basic',    'initial_required', true,  true,  true,  true,  true,  'اسم النشاط التجاري / العلامة',                 'مثال: سوبر ماركت الأمل',                                  'الاسم التجاري الظاهر للعملاء في دليل المتاجر والفواتير', 10, '{}'::jsonb),
    ('merchant', 'owner_name',           'basic',    'initial_required', true,  true,  true,  true,  true,  'اسم المالك الكامل',                            'الاسم الثلاثي أو الرباعي للمالك',                        'الاسم القانوني لصاحب المشروع أو المفوّض بالتوقيع', 20, '{}'::jsonb),
    ('merchant', 'email',                'basic',    'initial_required', true,  true,  true,  true,  false, 'البريد الإلكتروني',                            'merchant@example.com',                                    'يجب أن يكون بريداً صحيحاً (يحتوي على @ ونقطة مثل name@domain.com) لاستلام الفواتير واستعادة الحساب', 30, '{}'::jsonb),
    ('merchant', 'merchant_type',        'activity', 'initial_required', true,  true,  true,  true,  true,  'نوع النشاط التجاري',                           '',                                                        'اختر طبيعة نشاطك ليجهّز النظام الحقول المناسبة لمشروعك', 40, '{"widget":"cards"}'::jsonb),
    ('merchant', 'business_category',    'activity', 'initial_required', true,  true,  true,  true,  true,  'فئة النشاط التجاري',                           'اختر فئة النشاط...',                                       'التصنيف الذي يظهر فيه متجرك عند بحث الأعضاء', 50, '{}'::jsonb),
    ('merchant', 'country_code',         'location', 'initial_required', true,  true,  true,  true,  true,  'دولة النشاط التجاري',                          'اختر الدولة...',                                          'يحدد العملة المحلية ومفتاح الهاتف والمدن تلقائياً', 60, '{}'::jsonb),
    ('merchant', 'city',                 'location', 'initial_required', true,  true,  true,  true,  false, 'المحافظة / المدينة',                           'اختر المدينة...',                                         'اختر المدينة أو اكتبها يدوياً إذا لم تجدها في القائمة', 70, '{}'::jsonb),
    ('merchant', 'district',             'location', 'initial_required', true,  true,  true,  true,  false, 'الحي / المنطقة',                               'اختر الحي أو ابحث عنه...',                                'مطلوب للمحلات على الأرض ليصل إليك العملاء بسهولة (واختياري للمتجر الإلكتروني فقط)', 80, '{}'::jsonb),
    ('merchant', 'phone',                'basic',    'initial_required', true,  true,  true,  true,  true,  'رقم الهاتف النشط',                             'باقي رقم الموبايل بدون مفتاح الدولة',                     'يُضاف مفتاح الدولة تلقائياً حسب الدولة المختارة مع فحص عدد الأرقام الصحيح', 90, '{}'::jsonb),
    ('merchant', 'onboarded_by_code',    'basic',    'initial_required', true,  true,  false, false, false, 'كود العضو المرشّح للمتجر',                     'أدخل كود العضو أو 0 للتسجيل عن طريق الشركة',              'اكتب كود العضو الذي دعاك، أو اكتب 0 (أو اضغط الزر السريع) إذا سجّلت عبر شركة SAWYAN مباشرة', 100, '{"allow_zero_company":true}'::jsonb),
    ('merchant', 'password',             'security', 'initial_required', true,  true,  false, false, true,  'كلمة مرور حساب التاجر',                        'أدخل كلمة مرور قوية (8 أحرف على الأقل)',                  'لحماية لوحة التحكم ونقطة البيع — تجنّب كلمات المرور البسيطة', 110, '{}'::jsonb),
    ('merchant', 'terms_consent',        'security', 'initial_required', true,  true,  false, false, true,  'الموافقة على الشروط والأحكام وسياسة الخصوصية', '',                                                        'إقرار بصحة البيانات وقبول قواعد العمل في شبكة SAWYAN', 120, '{}'::jsonb),
    ('merchant', 'commission_percent',   'commercial','initial_optional', true, false,  true,  true,  false, 'كم أقصى نسبة تستطيع ردّها لسويًا كلما اشترى أعضاؤها منك؟ (%)', 'مثال: 10',                                     'أقصى نسبة من المبيعات تستطيع استقطاعها لسويًا نظير حشد آلاف المشترين نحو مشروعك', 130, '{"min":0.5,"max":95}'::jsonb),
    ('merchant', 'business_description', 'activity', 'initial_optional', true,  false, true,  false, false, 'وصف مختصر عن النشاط',                          'اذكر أبرز منتجاتك أو خدماتك التي تميّز متجرك...',          'يساعد الأعضاء على فهم تخصص متجرك ويزيد ثقتهم عند الشراء', 140, '{}'::jsonb),
    ('merchant', 'address',              'location', 'initial_optional', true,  false, true,  true,  false, 'العنوان التفصيلي',                             'اسم الشارع، رقم العقار، أقرب معلم معروف...',               'العنوان الدقيق للفرع الرئيسي الظاهر لعملاء المتجر', 150, '{}'::jsonb),
    ('merchant', 'geo_location',         'location', 'initial_optional', true,  false, true,  true,  false, 'الموقع على خرائط جوجل (اللاقط التلقائي)',       'الصق رابط خرائط جوجل أو اضغط التقاط موقعي الحالي',         'التقط موقع متجرك تلقائياً أو حرّك الدبوس على الخريطة ليظهر متجرك على رادار القرب وخرائط جوجل', 160, '{"has_geo_picker":true}'::jsonb),
    ('merchant', 'website_url',          'online',   'initial_optional', true,  false, true,  false, false, 'رابط الموقع أو المتجر الإلكتروني',             'https://yourstore.com',                                   'يظهر للمتاجر الإلكترونية أو التي تمتلك موقعاً للطلب أونلاين', 170, '{}'::jsonb),
    ('merchant', 'whatsapp',             'social',   'initial_optional', true,  false, true,  false, false, 'رقم واتساب للتواصل مع العملاء',                 'رقم الواتساب أو اضغط نفس رقم الهاتف',                     'رقم مخصص لاستفسارات العملاء وطلبات التوصيل', 180, '{}'::jsonb),
    ('merchant', 'logo_url',             'media',    'initial_optional', true,  false, true,  false, false, 'شعار النشاط (Logo)',                           'ارفع صورة الشعار الواضحة',                                'يفضّل شعار واضح بخلفية مناسبة ليظهر على بطاقة متجرك', 190, '{}'::jsonb),
    ('merchant', 'cover_image_url',      'media',    'initial_optional', true,  false, true,  false, false, 'صورة الواجهة / الغلاف',                        'ارفع صورة واجهة المحل أو غلاف المتجر',                    'تعطي انطباعاً قوياً واحترافياً لمتجرك أمام الأعضاء', 200, '{}'::jsonb),
    ('merchant', 'gallery_images',       'media',    'dashboard_only',   false, false, true,  false, false, 'صور إضافية للمتجر والمنتجات (حتى 6 صور)',     'اختر صوراً تعرض منتجاتك أو أجواء المكان',                'تُرفع من لوحة التاجر لإبراز جودة المنتجات والخدمة', 210, '{}'::jsonb),
    ('merchant', 'working_hours',        'location', 'dashboard_only',   false, false, true,  false, false, 'مواعيد العمل الأسبوعية',                       'حدد ساعات الفتح والإغلاق لكل يوم',                        'تُستكمل من لوحة التاجر مع خيار تعميم نفس الموعد لجميع الأيام', 220, '{}'::jsonb),
    ('merchant', 'social_links',         'social',   'dashboard_only',   false, false, true,  false, false, 'روابط التواصل الاجتماعي',                      'فيسبوك، إنستغرام، X، تيك توك',                            'تُربط في ملف المتجر لمتابعة العملاء لعروضك', 230, '{}'::jsonb),
    ('merchant', 'commercial_reg_no',    'kyc',      'dashboard_only',   false, false, true,  true,  false, 'رقم السجل التجاري / الرخصة',                   'مثال: 1010456789',                                        'مطلوب داخل اللوحة للتحقق الرسمي قبل اعتماد المتجر بالكامل', 240, '{}'::jsonb),
    ('merchant', 'tax_id',               'kyc',      'dashboard_only',   false, false, true,  false, false, 'الرقم الضريبي للمنشأة',                        'مثال: 300-456-789',                                       'يُستخدم عند إصدار فواتير العمولات الضريبية الرسمية', 250, '{}'::jsonb),
    ('merchant', 'commercial_doc_url',   'kyc',      'dashboard_only',   false, false, true,  true,  false, 'صورة السجل التجاري أو رخصة النشاط',            'ارفع صورة واضحة من السجل أو الرخصة',                      'مستند التحقق الرسمي لضمان موثوقية المتجر في الشبكة', 260, '{}'::jsonb),
    ('merchant', 'tax_doc_url',          'kyc',      'dashboard_only',   false, false, true,  false, false, 'صورة البطاقة الضريبية أو إثبات المقر',         'ارفع صورة البطاقة الضريبية أو عقد المقر',                 'مستند داعم يسرّع مراجعة واعتماد حساب التاجر', 270, '{}'::jsonb),
    ('merchant', 'webhook_url',          'online',   'dashboard_only',   false, false, true,  false, false, 'رابط الربط التقني المباشر (Webhook)',          'https://yourstore.com/webhook',                           'للمتاجر الإلكترونية التي تملك فريقاً تقنياً للربط الآلي', 280, '{}'::jsonb),
    ('merchant', 'initial_cashier_pin',  'pos',      'dashboard_only',   false, false, true,  false, false, 'رمز PIN الكاشير الرئيسي (4 أرقام)',            'مثال: 2580',                                              'رقم سري ثابت من 4 أرقام خاص بموظف الكاشير لاعتماد فواتير العملاء أمامه فوراً باسمه وحماية صاحب المحل', 290, '{}'::jsonb),

    -- === نموذج العضو الجديد (13 خانة) ===
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

    -- === نموذج موظف الكاشير لدى التاجر (8 خانات) ===
    ('employee_cashier', 'employee_code',         'pos', 'initial_optional', true, false, true, false, false, 'كود موظف الكاشير',                     'تلقائي مثل EMP-02 (أو اكتب كوداً مخصصاً)',                'يُستخدم لتمييز الموظف عند اعتماد الفواتير، ويُولّد تلقائياً إذا تركته فارغاً', 10, '{}'::jsonb),
    ('employee_cashier', 'full_name',             'pos', 'initial_required', true, true,  true, true,  true,  'اسم موظف الكاشير الكامل',               'الاسم الكامل للموظف',                                     'يظهر في سجل المبيعات والورديات لمعرفة من اعتمد كل فاتورة', 20, '{}'::jsonb),
    ('employee_cashier', 'cashier_pin',           'pos', 'initial_required', true, true,  true, true,  true,  'رمز PIN السري الخاص بالموظف (4 أرقام)', 'أدخل 4 أرقام مثل: 2580',                                  'رمز مستقل لكل موظف كاشير لتوثيق الفواتير أمام العملاء بضغطة واحدة', 30, '{}'::jsonb),
    ('employee_cashier', 'branch_id',             'pos', 'initial_required', true, true,  true, true,  true,  'الفرع التابع له الموظف',                'اختر الفرع...',                                           'تحديد الفرع الذي يعمل به الموظف لتقفيل وردياته بدقة', 40, '{}'::jsonb),
    ('employee_cashier', 'employee_phone',        'pos', 'initial_optional', true, false, true, false, false, 'رقم هاتف الموظف',                       'رقم هاتف الموظف للتواصل الإداري',                         'اختياري لسهولة تواصل مالك المتجر مع الموظف', 50, '{}'::jsonb),
    ('employee_cashier', 'linked_member_code',    'pos', 'initial_optional', true, false, true, false, false, 'كود عضوية الموظف في SAWYAN (إن وجد)',   'مثال: 105',                                               'لحماية متجرك: يمنع الموظف من توثيق فواتير لنفسه وينبهك عند أي تواطؤ مع فريقه', 60, '{}'::jsonb),
    ('employee_cashier', 'max_tx_amount_limit',   'pos', 'initial_optional', true, false, true, false, false, 'سقف الفاتورة المسموح باعتمادها فوراً',   'فارغ = بلا حد أقصى (مثال: 2000)',                         'أي فاتورة تتجاوز هذا المبلغ تتحول تلقائياً لموافقة صاحب المحل', 70, '{}'::jsonb),
    ('employee_cashier', 'notify_owner_realtime', 'pos', 'initial_optional', true, false, true, false, false, 'إشعار فوري لصاحب المحل مع كل فاتورة',   '',                                                        'تفعيل تنبيه لحظي للمالك فور اعتماد الموظف لأي فاتورة', 80, '{"widget":"checkbox"}'::jsonb),

    -- === نموذج الموظف الإداري بالشركة (6 خانات) ===
    ('employee_admin', 'full_name',        'admin_staff', 'initial_required', true, true,  true, true,  true,  'الاسم الكامل للموظف الإداري',  'الاسم الكامل كما في العقد الوظيفي',                    'يظهر في سجل التدقيق والعمليات التي ينفذها الموظف', 10, '{}'::jsonb),
    ('employee_admin', 'email',            'admin_staff', 'initial_required', true, true,  true, true,  true,  'البريد الإلكتروني الوظيفي',     'name@sawyan.global',                                    'بريد صحيح بصيغة name@domain.com يُستخدم لتسجيل الدخول إلى بوابة الإدارة', 20, '{}'::jsonb),
    ('employee_admin', 'role',             'admin_staff', 'initial_required', true, true,  true, true,  true,  'الدور الوظيفي (الصلاحية)',     'اختر الدور الوظيفي...',                                 'يحدد الصلاحيات المسموحة للموظف وفق فصل المهام الإدارية', 30, '{}'::jsonb),
    ('employee_admin', 'country_scope',    'admin_staff', 'initial_required', true, true,  true, true,  true,  'نطاق الدولة المصرح به',        'اختر النطاق (عالمي أو دولة محددة)...',                  'يحصر صلاحية اطلاع الموظف على دولة محددة أو يفتح جميع الدول', 40, '{}'::jsonb),
    ('employee_admin', 'initial_password', 'admin_staff', 'initial_required', true, true,  false, false, true, 'كلمة المرور المبدئية (8+ أحرف)','أدخل أو ولّد كلمة مرور قوية',                           'يُجبر الموظف على تغييرها تلقائياً عند أول تسجيل دخول', 50, '{}'::jsonb),
    ('employee_admin', 'staff_phone',      'admin_staff', 'initial_optional', true, false, true, false, false, 'رقم الهاتف الوظيفي',           '+201012345678',                                         'للتواصل السريع مع الموظف في الحالات التشغيلية العاجلة', 60, '{}'::jsonb);

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

SELECT sawyan.seed_default_registration_configs(NULL, false);

-- 4. دوال التحقق الصارمة على مستوى الخادم (Email & ITU-T E.164 Phone & Dynamic Field State)
CREATE OR REPLACE FUNCTION sawyan.validate_strict_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_clean  TEXT;
    v_local  TEXT;
    v_domain TEXT;
    v_labels TEXT[];
    v_lbl    TEXT;
    v_tld    TEXT;
    v_i      INT;
BEGIN
    v_clean := NULLIF(lower(trim(COALESCE(p_email, ''))), '');
    IF v_clean IS NULL THEN
        RETURN NULL;
    END IF;

    IF length(v_clean) > 254 OR v_clean ~ '\s' THEN
        RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Email must not contain spaces and must be <= 254 chars.';
    END IF;

    -- يجب أن يحتوي على علامة @ واحدة بالضبط (لا أقل ولا أكثر)
    IF (length(v_clean) - length(replace(v_clean, '@', ''))) <> 1 THEN
        RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Email must contain exactly one @ symbol.';
    END IF;

    v_local  := split_part(v_clean, '@', 1);
    v_domain := split_part(v_clean, '@', 2);

    IF length(v_local) < 1 OR length(v_local) > 64
       OR v_local !~ '^[a-z0-9._%+-]+$'
       OR left(v_local, 1) = '.' OR right(v_local, 1) = '.'
       OR position('..' IN v_local) > 0
    THEN
        RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Invalid email username part before @.';
    END IF;

    IF length(v_domain) < 4 OR length(v_domain) > 253
       OR position('.' IN v_domain) = 0
       OR left(v_domain, 1) = '.' OR right(v_domain, 1) = '.'
       OR position('..' IN v_domain) > 0
    THEN
        RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Email domain must contain a dot in valid position.';
    END IF;

    v_labels := string_to_array(v_domain, '.');
    IF array_length(v_labels, 1) < 2 THEN
        RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Invalid domain structure.';
    END IF;

    FOR v_i IN 1 .. array_length(v_labels, 1) LOOP
        v_lbl := v_labels[v_i];
        IF length(v_lbl) < 1 OR length(v_lbl) > 63 OR v_lbl !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN
            RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Invalid domain label.';
        END IF;
    END LOOP;

    v_tld := v_labels[array_length(v_labels, 1)];
    IF v_tld !~ '^[a-z]{2,24}$' THEN
        RAISE EXCEPTION 'INVALID_EMAIL_FORMAT: Invalid top-level domain extension.';
    END IF;

    RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.validate_and_normalize_e164_phone(
    p_country_code CHAR(2),
    p_phone        TEXT
) RETURNS VARCHAR(24)
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_cc         CHAR(2) := upper(trim(COALESCE(p_country_code, 'EG')));
    v_raw        TEXT := trim(COALESCE(p_phone, ''));
    v_compact    TEXT;
    v_has_plus   BOOLEAN;
    v_digits     TEXT;
    v_dial       TEXT;
    v_min_len    INT := 7;
    v_max_len    INT := 15;
    v_strip_zero BOOLEAN := true;
    v_nsn        TEXT;
BEGIN
    IF v_raw = '' THEN
        RAISE EXCEPTION 'VALID_PHONE_REQUIRED';
    END IF;

    v_compact := regexp_replace(v_raw, '[\s\-\(\)\.]+', '', 'g');
    IF v_compact !~ '^\+?[0-9]+$' THEN
        RAISE EXCEPTION 'INVALID_PHONE_FORMAT';
    END IF;

    v_has_plus := (left(v_compact, 1) = '+');
    v_digits   := regexp_replace(v_compact, '[^0-9]', '', 'g');

    -- تعيين مفتاح الدولة وطول الأرقام القياسي بعد المفتاح (ITU-T E.164)
    SELECT r.dial, r.min_l, r.max_l, r.sz
      INTO v_dial, v_min_len, v_max_len, v_strip_zero
      FROM (
          SELECT CASE v_cc
              WHEN 'EG' THEN '20'  WHEN 'SA' THEN '966' WHEN 'TR' THEN '90'  WHEN 'AE' THEN '971'
              WHEN 'KW' THEN '965' WHEN 'QA' THEN '974' WHEN 'BH' THEN '973' WHEN 'OM' THEN '968'
              WHEN 'JO' THEN '962' WHEN 'LB' THEN '961' WHEN 'PS' THEN '970' WHEN 'IQ' THEN '964'
              WHEN 'SY' THEN '963' WHEN 'YE' THEN '967' WHEN 'SD' THEN '249' WHEN 'LY' THEN '218'
              WHEN 'TN' THEN '216' WHEN 'DZ' THEN '213' WHEN 'MA' THEN '212' WHEN 'MR' THEN '222'
              WHEN 'SO' THEN '252' WHEN 'DJ' THEN '253' WHEN 'KM' THEN '269'
              WHEN 'US' THEN '1'   WHEN 'CA' THEN '1'   WHEN 'DO' THEN '1'   WHEN 'JM' THEN '1'
              WHEN 'GB' THEN '44'  WHEN 'DE' THEN '49'  WHEN 'FR' THEN '33'  WHEN 'IT' THEN '39'
              WHEN 'ES' THEN '34'  WHEN 'NL' THEN '31'  WHEN 'BE' THEN '32'  WHEN 'CH' THEN '41'
              WHEN 'AT' THEN '43'  WHEN 'SE' THEN '46'  WHEN 'NO' THEN '47'  WHEN 'DK' THEN '45'
              WHEN 'PL' THEN '48'  WHEN 'PT' THEN '351' WHEN 'GR' THEN '30'  WHEN 'RU' THEN '7'
              WHEN 'KZ' THEN '7'   WHEN 'UA' THEN '380' WHEN 'RO' THEN '40'  WHEN 'IN' THEN '91'
              WHEN 'PK' THEN '92'  WHEN 'BD' THEN '880' WHEN 'ID' THEN '62'  WHEN 'MY' THEN '60'
              WHEN 'SG' THEN '65'  WHEN 'CN' THEN '86'  WHEN 'JP' THEN '81'  WHEN 'KR' THEN '82'
              WHEN 'AU' THEN '61'  WHEN 'NZ' THEN '64'  WHEN 'BR' THEN '55'  WHEN 'MX' THEN '52'
              WHEN 'AR' THEN '54'  WHEN 'ZA' THEN '27'  WHEN 'NG' THEN '234' WHEN 'KE' THEN '254'
              WHEN 'ET' THEN '251' WHEN 'GH' THEN '233' WHEN 'AZ' THEN '994' WHEN 'GE' THEN '995'
              ELSE NULL
          END AS dial,
          CASE
              WHEN v_cc IN ('EG', 'TR', 'US', 'CA', 'DO', 'JM', 'GB', 'IQ', 'IN', 'PK', 'RU', 'KZ', 'KR', 'MY', 'ID', 'BR', 'MX', 'NG', 'CO', 'PH') THEN 10
              WHEN v_cc IN ('SA', 'AE', 'JO', 'MA', 'DZ', 'FR', 'SY', 'YE', 'LY', 'SD', 'PS', 'ES', 'PL', 'NL', 'BE', 'CH', 'PT', 'UA', 'RO', 'AU', 'ZA', 'KE', 'ET', 'GH', 'AZ', 'GE', 'UA') THEN 9
              WHEN v_cc IN ('KW', 'QA', 'BH', 'OM', 'TN', 'MR', 'SG', 'DK', 'NO', 'HK') THEN 8
              WHEN v_cc IN ('DE', 'CN') THEN 10
              WHEN v_cc IN ('IT') THEN 9
              WHEN v_cc IN ('LB', 'SE', 'AT') THEN 7
              ELSE 7
          END AS min_l,
          CASE
              WHEN v_cc IN ('EG', 'TR', 'US', 'CA', 'DO', 'JM', 'GB', 'IQ', 'IN', 'PK', 'RU', 'KZ', 'KR', 'MY', 'BR', 'MX', 'NG', 'CO', 'PH') THEN 10
              WHEN v_cc IN ('SA', 'AE', 'JO', 'MA', 'DZ', 'FR', 'SY', 'YE', 'LY', 'SD', 'PS', 'ES', 'PL', 'NL', 'BE', 'CH', 'PT', 'UA', 'RO', 'AU', 'ZA', 'KE', 'ET', 'GH', 'AZ', 'GE') THEN 9
              WHEN v_cc IN ('KW', 'QA', 'BH', 'OM', 'TN', 'MR', 'SG', 'DK', 'NO', 'HK') THEN 8
              WHEN v_cc IN ('DE', 'CN', 'ID', 'JP') THEN 11
              WHEN v_cc IN ('IT') THEN 10
              WHEN v_cc IN ('LB') THEN 8
              WHEN v_cc IN ('SE', 'AT') THEN 10
              ELSE 15
          END AS max_l,
          CASE WHEN v_cc IN ('US', 'CA', 'DO', 'JM', 'IT', 'ES', 'SG', 'DK', 'NO') THEN false ELSE true END AS sz
      ) r;

    IF v_dial IS NOT NULL THEN
        IF v_has_plus THEN
            IF left(v_digits, length(v_dial)) = v_dial THEN
                v_nsn := substr(v_digits, length(v_dial) + 1);
            ELSE
                RAISE EXCEPTION 'INVALID_PHONE_COUNTRY_PREFIX: Phone must start with +% for country %.', v_dial, v_cc;
            END IF;
        ELSE
            IF left(v_digits, length(v_dial)) = v_dial AND length(v_digits) >= (length(v_dial) + v_min_len) THEN
                v_nsn := substr(v_digits, length(v_dial) + 1);
            ELSE
                v_nsn := v_digits;
            END IF;
        END IF;

        IF v_strip_zero THEN
            v_nsn := regexp_replace(v_nsn, '^0+', '');
        END IF;

        IF length(v_nsn) < v_min_len OR length(v_nsn) > v_max_len THEN
            RAISE EXCEPTION 'INVALID_PHONE_DIGITS_FOR_COUNTRY: Country % requires %-% digits after +% (got %).',
                v_cc, v_min_len, v_max_len, v_dial, length(v_nsn);
        END IF;

        IF v_cc = 'EG' AND left(v_nsn, 1) <> '1' THEN
            RAISE EXCEPTION 'INVALID_EG_MOBILE_PREFIX: Egyptian mobile number after +20 must start with 1 (e.g. 1012345678).';
        END IF;
        IF v_cc IN ('SA', 'AE', 'TR') AND left(v_nsn, 1) <> '5' THEN
            RAISE EXCEPTION 'INVALID_MOBILE_PREFIX: Mobile number for % after +% must start with 5.', v_cc, v_dial;
        END IF;

        RETURN ('+' || v_dial || v_nsn)::varchar(24);
    ELSE
        IF length(v_digits) < 7 OR length(v_digits) > 15 THEN
            RAISE EXCEPTION 'INVALID_PHONE_DIGITS_FOR_COUNTRY: International phone must contain 7-15 digits.';
        END IF;
        RETURN ('+' || regexp_replace(v_digits, '^0+', ''))::varchar(24);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.is_reg_field_required(
    p_form_type VARCHAR,
    p_field_key VARCHAR,
    p_stage     VARCHAR DEFAULT 'initial'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
    SELECT COALESCE((
        SELECT CASE
            WHEN lower(COALESCE(p_stage, 'initial')) = 'dashboard' THEN (show_in_dashboard AND required_in_dashboard)
            ELSE (show_in_initial AND required_in_initial AND display_mode <> 'hidden' AND display_mode <> 'dashboard_only')
        END
          FROM sawyan.registration_field_configs
         WHERE form_type = p_form_type
           AND field_key = p_field_key
         LIMIT 1
    ), false);
$$;

-- 5. واجهات API العامة والإدارية لهندسة نماذج التسجيل وفحص المرشّح وخريطة الأعلام المجهولة
CREATE OR REPLACE FUNCTION sawyan.get_registration_form_config(
    p_form_type VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_ft       VARCHAR(24) := NULLIF(lower(trim(COALESCE(p_form_type, ''))), '');
    v_settings JSONB;
    v_fields   JSONB;
BEGIN
    SELECT COALESCE(jsonb_agg(row_to_json(s)::jsonb ORDER BY s.form_type), '[]'::jsonb)
      INTO v_settings
      FROM sawyan.registration_form_settings s
     WHERE v_ft IS NULL OR s.form_type = v_ft;

    SELECT COALESCE(jsonb_agg(row_to_json(f)::jsonb ORDER BY f.form_type ASC, f.sort_order ASC, f.field_key ASC), '[]'::jsonb)
      INTO v_fields
      FROM sawyan.registration_field_configs f
     WHERE v_ft IS NULL OR f.form_type = v_ft;

    RETURN jsonb_build_object(
        'form_type', COALESCE(v_ft, 'all'),
        'settings', v_settings,
        'fields', v_fields
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.lookup_onboarder_by_code(
    p_member_code BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    IF p_member_code IS NULL OR p_member_code < 0 THEN
        RETURN jsonb_build_object('found', false, 'error', 'INVALID_ONBOARDER_CODE');
    END IF;

    IF p_member_code = 0 THEN
        RETURN jsonb_build_object(
            'found', true,
            'member_code', 0,
            'full_name', 'شركة SAWYAN — تسجيل مباشر عن طريق الإدارة',
            'is_company', true
        );
    END IF;

    SELECT m.id, m.member_code, m.full_name, c.country_code
      INTO v_rec
      FROM sawyan.members m
      JOIN sawyan.countries c ON c.id = m.residency_country_id
     WHERE m.member_code = p_member_code
       AND m.status = 'active'
       AND m.is_tombstone_banned = false
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('found', false, 'member_code', p_member_code);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'member_id', v_rec.id,
        'member_code', v_rec.member_code,
        'full_name', v_rec.full_name,
        'country_code', v_rec.country_code,
        'is_company', false
    );
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.admin_manage_registration_fields(
    p_admin_id      UUID,
    p_session_token TEXT,
    p_action        VARCHAR DEFAULT 'list', -- 'list' | 'save_bulk' | 'reset_defaults'
    p_form_type     VARCHAR DEFAULT NULL,
    p_fields        JSONB   DEFAULT NULL,
    p_settings      JSONB   DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm     JSONB;
    v_act     VARCHAR(24) := lower(trim(COALESCE(p_action, 'list')));
    v_ft      VARCHAR(24) := NULLIF(lower(trim(COALESCE(p_form_type, ''))), '');
    v_item    JSONB;
    v_cur     sawyan.registration_field_configs%ROWTYPE;
    v_mode    VARCHAR(24);
    v_sh_i    BOOLEAN;
    v_rq_i    BOOLEAN;
    v_sh_d    BOOLEAN;
    v_rq_d    BOOLEAN;
    v_lbl     TEXT;
    v_ph      TEXT;
    v_hlp     TEXT;
    v_ord     INT;
    v_upd_cnt INT := 0;
BEGIN
    IF v_act = 'list' THEN
        v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    ELSE
        v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'reviewer'], true);
    END IF;

    IF v_act = 'reset_defaults' THEN
        PERFORM sawyan.seed_default_registration_configs(v_ft, true);
        PERFORM sawyan.append_audit_log(
            'admin', p_admin_id, 'registration_fields_reset_defaults',
            'registration_field_configs', COALESCE(v_ft, 'all'), NULL,
            jsonb_build_object('form_type', COALESCE(v_ft, 'all'))
        );
        RETURN sawyan.get_registration_form_config(v_ft) || jsonb_build_object('success', true, 'reset', true);
    END IF;

    IF v_act = 'save_bulk' THEN
        IF v_ft IS NULL THEN
            RAISE EXCEPTION 'FORM_TYPE_REQUIRED';
        END IF;

        IF p_settings IS NOT NULL AND pg_catalog.jsonb_typeof(p_settings) = 'object' THEN
            UPDATE sawyan.registration_form_settings
               SET page_title_ar            = COALESCE(NULLIF(trim(COALESCE(p_settings->>'page_title_ar', '')), ''), page_title_ar),
                   page_subtitle_ar         = COALESCE(NULLIF(trim(COALESCE(p_settings->>'page_subtitle_ar', '')), ''), page_subtitle_ar),
                   optional_divider_text_ar = COALESCE(NULLIF(trim(COALESCE(p_settings->>'optional_divider_text_ar', '')), ''), optional_divider_text_ar),
                   dashboard_banner_text_ar = COALESCE(NULLIF(trim(COALESCE(p_settings->>'dashboard_banner_text_ar', '')), ''), dashboard_banner_text_ar),
                   updated_by_admin_id      = p_admin_id,
                   updated_at               = now()
             WHERE form_type = v_ft;
        END IF;

        IF p_fields IS NOT NULL AND pg_catalog.jsonb_typeof(p_fields) = 'array' THEN
            FOR v_item IN SELECT * FROM jsonb_array_elements(p_fields) LOOP
                SELECT * INTO v_cur
                  FROM sawyan.registration_field_configs
                 WHERE form_type = v_ft
                   AND field_key = trim(COALESCE(v_item->>'field_key', ''))
                 FOR UPDATE;
                IF NOT FOUND THEN
                    CONTINUE;
                END IF;

                v_mode := lower(trim(COALESCE(v_item->>'display_mode', v_cur.display_mode)));
                IF v_mode NOT IN ('initial_required', 'initial_optional', 'dashboard_only', 'hidden') THEN
                    v_mode := v_cur.display_mode;
                END IF;

                v_sh_i := COALESCE((v_item->>'show_in_initial')::boolean, v_cur.show_in_initial);
                v_rq_i := COALESCE((v_item->>'required_in_initial')::boolean, v_cur.required_in_initial);
                v_sh_d := COALESCE((v_item->>'show_in_dashboard')::boolean, v_cur.show_in_dashboard);
                v_rq_d := COALESCE((v_item->>'required_in_dashboard')::boolean, v_cur.required_in_dashboard);

                -- توحيد المزامنة المنطقية بين الكومبو ومربعات الصح والغلط
                IF v_item ? 'display_mode' AND (v_item->>'display_mode') <> v_cur.display_mode THEN
                    IF v_mode = 'initial_required' THEN
                        v_sh_i := true; v_rq_i := true;
                    ELSIF v_mode = 'initial_optional' THEN
                        v_sh_i := true; v_rq_i := false;
                    ELSIF v_mode = 'dashboard_only' THEN
                        v_sh_i := false; v_rq_i := false; v_sh_d := true;
                    ELSIF v_mode = 'hidden' THEN
                        v_sh_i := false; v_rq_i := false; v_sh_d := false; v_rq_d := false;
                    END IF;
                ELSE
                    IF v_rq_i THEN v_sh_i := true; END IF;
                    IF v_rq_d THEN v_sh_d := true; END IF;
                    IF v_sh_i AND v_rq_i THEN v_mode := 'initial_required';
                    ELSIF v_sh_i THEN v_mode := 'initial_optional';
                    ELSIF v_sh_d THEN v_mode := 'dashboard_only';
                    ELSE v_mode := 'hidden';
                    END IF;
                END IF;

                -- قفل الأمان الدستوري: الخانات الأساسية لا يمكن إخفاؤها أو إلغاء إلزاميتها
                IF v_cur.is_system_locked THEN
                    v_mode := 'initial_required';
                    v_sh_i := true;
                    v_rq_i := true;
                END IF;

                v_lbl := COALESCE(NULLIF(trim(COALESCE(v_item->>'label_ar', '')), ''), v_cur.label_ar);
                v_ph  := COALESCE(trim(COALESCE(v_item->>'placeholder_ar', v_cur.placeholder_ar)), '');
                v_hlp := COALESCE(trim(COALESCE(v_item->>'help_text_ar', v_cur.help_text_ar)), '');
                v_ord := COALESCE((v_item->>'sort_order')::int, v_cur.sort_order);

                UPDATE sawyan.registration_field_configs
                   SET display_mode          = v_mode,
                       show_in_initial       = v_sh_i,
                       required_in_initial   = v_rq_i,
                       show_in_dashboard     = v_sh_d,
                       required_in_dashboard = v_rq_d,
                       label_ar              = v_lbl,
                       placeholder_ar        = v_ph,
                       help_text_ar          = v_hlp,
                       sort_order            = GREATEST(1, v_ord),
                       updated_by_admin_id   = p_admin_id,
                       updated_at            = now()
                 WHERE id = v_cur.id;

                v_upd_cnt := v_upd_cnt + 1;
            END LOOP;
        END IF;

        PERFORM sawyan.append_audit_log(
            'admin', p_admin_id, 'registration_fields_updated',
            'registration_field_configs', v_ft, NULL,
            jsonb_build_object('form_type', v_ft, 'updated_fields_count', v_upd_cnt)
        );
    END IF;

    RETURN sawyan.get_registration_form_config(v_ft) || jsonb_build_object('success', true, 'updated_count', v_upd_cnt);
END;
$$;

CREATE OR REPLACE FUNCTION sawyan.get_anonymized_members_map_pins(
    p_center_lat    NUMERIC,
    p_center_lng    NUMERIC,
    p_radius_km     NUMERIC DEFAULT 5.0,
    p_country_code  CHAR(2) DEFAULT NULL,
    p_merchant_id   UUID    DEFAULT NULL,
    p_admin_id      UUID    DEFAULT NULL,
    p_session_token TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_lat    NUMERIC(9,6) := COALESCE(p_center_lat, 30.044400);
    v_lng    NUMERIC(9,6) := COALESCE(p_center_lng, 31.235700);
    v_rad    NUMERIC(6,2) := LEAST(GREATEST(COALESCE(p_radius_km, 5.0), 1.0), 50.0);
    v_cc     CHAR(2) := NULLIF(upper(trim(COALESCE(p_country_code, ''))), '');
    v_pins   JSONB := '[]'::jsonb;
    v_cnt    INT := 0;
BEGIN
    IF p_admin_id IS NOT NULL THEN
        PERFORM sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    ELSIF p_merchant_id IS NOT NULL THEN
        PERFORM sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    ELSE
        RAISE EXCEPTION 'UNAUTHORIZED_MAP_ACCESS';
    END IF;

    WITH raw_members AS (
        SELECT m.id,
               CASE
                   WHEN (m.metadata->'home_gps'->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$'
                        AND (m.metadata->'home_gps'->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$'
                   THEN (m.metadata->'home_gps'->>'lat')::numeric
                   ELSE g.latitude
               END AS base_lat,
               CASE
                   WHEN (m.metadata->'home_gps'->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$'
                        AND (m.metadata->'home_gps'->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$'
                   THEN (m.metadata->'home_gps'->>'lng')::numeric
                   ELSE g.longitude
               END AS base_lng,
               (abs(hashtext(m.id::text || ':a')) % 360) AS angle_deg,
               (150 + (abs(hashtext(m.id::text || ':d')) % 201)) AS dist_m
          FROM sawyan.members m
          JOIN sawyan.countries c ON c.id = m.residency_country_id
          LEFT JOIN sawyan.geonames_locations g ON g.geoname_id = m.city_geoname_id
         WHERE m.member_code > 0
           AND m.is_active_in_tree = true
           AND m.is_tombstone_banned = false
           AND (v_cc IS NULL OR c.country_code = v_cc)
    ),
    bounded AS (
        SELECT rm.*,
               (6371.0 * acos(LEAST(1.0, GREATEST(-1.0,
                   cos(radians(v_lat)) * cos(radians(rm.base_lat)) * cos(radians(rm.base_lng) - radians(v_lng))
                   + sin(radians(v_lat)) * sin(radians(rm.base_lat))
               )))) AS km_away
          FROM raw_members rm
         WHERE rm.base_lat IS NOT NULL
           AND rm.base_lng IS NOT NULL
           AND rm.base_lat BETWEEN -90 AND 90
           AND rm.base_lng BETWEEN -180 AND 180
    ),
    fuzzed AS (
        SELECT ROUND((b.base_lat + ((b.dist_m * cos(radians(b.angle_deg))) / 111320.0))::numeric, 5) AS lat,
               ROUND((b.base_lng + ((b.dist_m * sin(radians(b.angle_deg))) / GREATEST(15000.0, 111320.0 * cos(radians(b.base_lat)))))::numeric, 5) AS lng
          FROM bounded b
         WHERE b.km_away <= v_rad
         ORDER BY b.km_away ASC, b.id ASC
         LIMIT 300
    )
    SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object('lat', f.lat, 'lng', f.lng, 'label', 'عضو SAWYAN')), '[]'::jsonb)
      INTO v_cnt, v_pins
      FROM fuzzed f;

    RETURN jsonb_build_object(
        'total_pins', v_cnt,
        'radius_km', v_rad,
        'jitter_meters', '150-350',
        'pii_exposed', false,
        'pins', v_pins
    );
END;
$$;

-- 6. ترقية دالة تسجيل التاجر بالربط الكامل مع جدول الحقول والتحقق الصارم (بدون سقف 40% + دعم كود 0 + تأجيل العمولة)
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
BEGIN
    v_clean_name := trim(COALESCE(p_business_name, ''));
    IF char_length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'MERCHANT_BUSINESS_NAME_REQUIRED';
    END IF;

    IF p_password IS NULL OR char_length(p_password) < 8 OR lower(trim(p_password)) IN ('123456', '12345678', 'password', 'qwerty123') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN';
    END IF;

    -- بوابة تفعيل الدول (D13) تُفحص أولاً قبل أي فحص إضافي
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

    -- نسبة الاستقطاع: مسموح تأجيلها للوحة التحكم إن لم تكن إجبارية بالتسجيل المبدئي، ودون تقييد بـ 40%
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

    -- كود العضو المرشّح: 0 يُشير للتسجيل المباشر عن طريق الشركة
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
    IF sawyan.is_reg_field_required('merchant', 'commercial_reg_no', 'initial') AND NULLIF(trim(COALESCE(p_metadata->>'commercial_reg_no', '')), '') IS NULL THEN
        RAISE EXCEPTION 'MERCHANT_COMMERCIAL_REG_REQUIRED';
    END IF;
    IF sawyan.is_reg_field_required('merchant', 'tax_id', 'initial') AND NULLIF(trim(COALESCE(p_metadata->>'tax_id', '')), '') IS NULL THEN
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

    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(32), 'hex');

    v_lat := COALESCE(p_latitude, CASE WHEN v_country.country_code = 'TR' THEN 41.008200 WHEN v_country.country_code = 'SA' THEN 24.713552 ELSE 30.044400 END);
    v_lng := COALESCE(p_longitude, CASE WHEN v_country.country_code = 'TR' THEN 28.978400 WHEN v_country.country_code = 'SA' THEN 46.675296 ELSE 31.235700 END);

    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        IF v_district IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('district', left(v_district, 120));
        END IF;
        IF v_city_name IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('city_name', left(v_city_name, 120));
        END IF;
        IF p_city_geoname_id IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('city_geoname_id', p_city_geoname_id);
        END IF;
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
        IF p_metadata ? 'commercial_reg_no' AND NULLIF(trim(COALESCE(p_metadata->>'commercial_reg_no', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('commercial_reg_no', left(trim(p_metadata->>'commercial_reg_no'), 80));
        END IF;
        IF p_metadata ? 'tax_id' AND NULLIF(trim(COALESCE(p_metadata->>'tax_id', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('tax_id', left(trim(p_metadata->>'tax_id'), 80));
        END IF;
        IF p_metadata ? 'wifi_ssid' AND NULLIF(trim(COALESCE(p_metadata->>'wifi_ssid', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('wifi_ssid', left(trim(p_metadata->>'wifi_ssid'), 80));
        END IF;

        v_logo := sawyan.validate_attachment_data(p_metadata->>'logo_url', 200000, true);
        IF v_logo IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('logo_url', v_logo);
        END IF;
        IF v_logo IS NULL AND sawyan.is_reg_field_required('merchant', 'logo_url', 'initial') THEN
            RAISE EXCEPTION 'MERCHANT_LOGO_REQUIRED';
        END IF;

        v_cover := sawyan.validate_attachment_data(p_metadata->>'cover_image_url', 480000, true);
        IF v_cover IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('cover_image_url', v_cover);
        END IF;
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
            IF v_img_cnt > 0 THEN
                v_safe_meta := v_safe_meta || jsonb_build_object('images', v_img_arr);
            END IF;
        END IF;

        IF p_metadata ? 'kyc_docs' AND jsonb_typeof(p_metadata->'kyc_docs') = 'object' THEN
            FOR v_k_key, v_k_val IN SELECT key, value FROM jsonb_each_text(p_metadata->'kyc_docs') LOOP
                IF v_k_key IN ('commercial_reg', 'tax_card', 'owner_id', 'store_license', 'storefront_photo') THEN
                    v_k_val := sawyan.validate_attachment_data(v_k_val, 480000, true);
                    IF v_k_val IS NOT NULL THEN
                        v_kyc_obj := v_kyc_obj || jsonb_build_object(v_k_key, v_k_val);
                    END IF;
                END IF;
            END LOOP;
            IF v_kyc_obj <> '{}'::jsonb THEN
                v_safe_meta := v_safe_meta || jsonb_build_object('kyc_docs', v_kyc_obj);
            END IF;
        END IF;
    END IF;

    IF v_onboarder_src IS NOT NULL THEN
        v_safe_meta := v_safe_meta || jsonb_build_object('onboarded_source', v_onboarder_src);
    END IF;
    v_safe_meta := v_safe_meta || jsonb_build_object(
        'commission_pending', v_comm_pending,
        'commission_locked', false
    );

    INSERT INTO sawyan.merchants (
        merchant_code, country_id, onboarded_by_member_id, business_name, owner_name,
        email, phone, category, merchant_type, deduction_percent,
        package_base_amount, actual_cash_balance, soft_hold_balance, credit_limit,
        is_isolated, address, latitude, longitude, is_active, password_hash, metadata
    ) VALUES (
        v_mcode, v_country.id, v_onboarder_id, v_clean_name, v_clean_owner,
        v_clean_email, v_clean_phone, v_cat_slug, v_mtype, v_eff_pct,
        0.00, 0.00, 0.00, 0.00,
        v_comm_pending, COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), COALESCE(v_city_name || COALESCE(' - ' || v_district, ''), v_clean_name || ' - الفرع الرئيسي')),
        v_lat, v_lng, true, v_pw_hash,
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
            v_merch_id, v_branch_id, 'EMP-01', 'كاشير رئيسي — ' || v_clean_owner,
            extensions.crypt(trim(p_initial_cashier_pin), extensions.gen_salt('bf', 10)), true
        );
    END IF;

    PERFORM sawyan.append_audit_log(
        'merchant', v_merch_id, 'merchant_registered_v3', 'merchants', v_merch_id::text,
        NULL, jsonb_build_object('merchant_code', v_mcode, 'country', v_country.country_code, 'deduction_percent', v_eff_pct, 'commission_pending', v_comm_pending)
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
            'commission_pending', v_comm_pending
        )
    );
END;
$$;

-- 7. ترقية دالة تسجيل العضو بالتحقق الصارم (Email + E.164 Phone + Dynamic Fields + Home GPS)
CREATE OR REPLACE FUNCTION sawyan.register_new_member(
    p_full_name                VARCHAR(150),
    p_phone                    VARCHAR(24),
    p_sponsor_code             BIGINT,
    p_password                 TEXT,
    p_residency_country_code   CHAR(2) DEFAULT 'EG',
    p_nationality_country_code CHAR(2) DEFAULT NULL,
    p_city_geoname_id          BIGINT DEFAULT NULL,
    p_manual_district          VARCHAR(60) DEFAULT NULL,
    p_email                    VARCHAR(255) DEFAULT NULL,
    p_metadata                 JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_clean_name     VARCHAR(150);
    v_clean_phone    VARCHAR(24);
    v_clean_email    VARCHAR(255);
    v_res_cid        INT;
    v_nat_cid        INT;
    v_sponsor        sawyan.members%ROWTYPE;
    v_parent_rec     sawyan.members%ROWTYPE;
    v_next_code      BIGINT;
    v_pwd_hash       TEXT;
    v_session_token  TEXT;
    v_new_member     sawyan.members%ROWTYPE;
    v_country_code   CHAR(2);
    v_city_id        BIGINT := p_city_geoname_id;
    v_root_token     TEXT;
    v_tokens         JSONB;
    v_new_tokens     JSONB := '[]'::jsonb;
    v_tok_item       JSONB;
    v_tok_matched    BOOLEAN := false;
    v_seed_root_ok   BOOLEAN := false;
    v_safe_meta      JSONB := '{}'::jsonb;
    v_avatar         TEXT;
    v_hlat           NUMERIC;
    v_hlng           NUMERIC;
BEGIN
    v_clean_name := trim(COALESCE(p_full_name, ''));
    IF length(v_clean_name) < 3 THEN
        RAISE EXCEPTION 'INVALID_FULL_NAME';
    END IF;

    IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) IN ('123456', '12345678', 'password', '00000000') THEN
        RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED: Password must be >= 8 characters and not default.';
    END IF;

    v_root_token := NULLIF(trim(COALESCE(p_metadata->>'root_invite_token', '')), '');

    IF (p_sponsor_code IS NULL OR p_sponsor_code = 0) THEN
        IF v_root_token IS NULL THEN
            RAISE EXCEPTION 'ROOT_SPONSOR_RESTRICTED_TO_ADMIN: Public self-registration requires an active member sponsor (>0) or a valid Founder Root Invite Token.';
        END IF;

        SELECT * INTO v_sponsor FROM sawyan.members WHERE member_code = 0 FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'ROOT_MEMBER_MISSING'; END IF;

        v_tokens := COALESCE(v_sponsor.metadata->'root_invite_tokens', '[]'::jsonb);
        FOR v_tok_item IN SELECT * FROM jsonb_array_elements(v_tokens) LOOP
            IF (v_tok_item->>'token') = v_root_token
               AND COALESCE((v_tok_item->>'used')::boolean, false) IS FALSE
               AND ((v_tok_item->>'expires_at')::timestamptz) > now() THEN
                v_tok_matched := true;
                v_new_tokens := v_new_tokens || jsonb_build_array(
                    v_tok_item || jsonb_build_object('used', true, 'used_at', now(), 'used_by_phone', trim(COALESCE(p_phone, '')))
                );
            ELSE
                v_new_tokens := v_new_tokens || jsonb_build_array(v_tok_item);
            END IF;
        END LOOP;

        IF NOT v_tok_matched THEN
            RAISE EXCEPTION 'INVALID_OR_EXPIRED_ROOT_INVITE_TOKEN: This one-time Founder link has already been used or expired.';
        END IF;

        UPDATE sawyan.members
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('root_invite_tokens', v_new_tokens)
         WHERE id = v_sponsor.id;

        v_seed_root_ok := true;
    ELSE
        SELECT * INTO v_sponsor
          FROM sawyan.members
         WHERE member_code = p_sponsor_code
           AND status = 'active'
           AND is_tombstone_banned = false;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'SPONSOR_NOT_FOUND: %', p_sponsor_code;
        END IF;
    END IF;

    SELECT id, country_code INTO v_res_cid, v_country_code
      FROM sawyan.countries
     WHERE country_code = upper(trim(COALESCE(p_residency_country_code, 'EG')));

    IF NOT FOUND THEN
        RAISE EXCEPTION 'COUNTRY_NOT_REGISTERED: %', p_residency_country_code;
    END IF;

    -- التحقق من الهاتف وفق قواعد عدد الخانات لكل دولة بعد كود الدولة
    v_clean_phone := sawyan.validate_and_normalize_e164_phone(v_country_code, p_phone);

    -- التحقق الصارم من البريد الإلكتروني إذا تم إدخاله، أو عند تفعيله كإجباري من الإدارة
    v_clean_email := sawyan.validate_strict_email(p_email);
    IF NOT v_seed_root_ok AND v_clean_email IS NULL AND sawyan.is_reg_field_required('member', 'email', 'initial') THEN
        RAISE EXCEPTION 'MEMBER_EMAIL_REQUIRED';
    END IF;

    IF p_nationality_country_code IS NOT NULL THEN
        SELECT id INTO v_nat_cid FROM sawyan.countries WHERE country_code = upper(trim(p_nationality_country_code));
    END IF;
    v_nat_cid := COALESCE(v_nat_cid, v_res_cid);

    IF v_city_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM sawyan.geonames_locations WHERE geoname_id = v_city_id) THEN
            v_city_id := NULL;
        END IF;
    END IF;

    IF NOT v_seed_root_ok AND sawyan.is_reg_field_required('member', 'city', 'initial')
       AND v_city_id IS NULL AND NULLIF(trim(COALESCE(p_manual_district, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MEMBER_CITY_REQUIRED';
    END IF;

    IF NOT v_seed_root_ok AND sawyan.is_reg_field_required('member', 'district', 'initial')
       AND NULLIF(trim(COALESCE(p_manual_district, '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MEMBER_DISTRICT_REQUIRED';
    END IF;

    IF NOT v_seed_root_ok AND sawyan.is_reg_field_required('member', 'gender', 'initial')
       AND NULLIF(trim(COALESCE(p_metadata->>'gender', '')), '') IS NULL
    THEN
        RAISE EXCEPTION 'MEMBER_GENDER_REQUIRED';
    END IF;

    IF EXISTS (SELECT 1 FROM sawyan.members WHERE phone = v_clean_phone) THEN
        RAISE EXCEPTION 'PHONE_ALREADY_REGISTERED';
    END IF;

    IF v_clean_email IS NOT NULL AND EXISTS (SELECT 1 FROM sawyan.members WHERE lower(email) = v_clean_email) THEN
        RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('sawyan_member_code_alloc'));
    SELECT COALESCE(MAX(member_code), 0) + 1 INTO v_next_code FROM sawyan.members;

    IF v_clean_email IS NULL THEN
        v_clean_email := 'member' || v_next_code || '@users.SAWYAN.local';
    END IF;

    v_pwd_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    v_session_token := encode(extensions.gen_random_bytes(24), 'hex');

    IF p_metadata IS NOT NULL AND jsonb_typeof(p_metadata) = 'object' THEN
        IF p_metadata ? 'gender' AND NULLIF(trim(COALESCE(p_metadata->>'gender', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('gender', left(trim(p_metadata->>'gender'), 20));
        END IF;
        IF p_metadata ? 'national_id_masked' AND NULLIF(trim(COALESCE(p_metadata->>'national_id_masked', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('national_id_masked', left(trim(p_metadata->>'national_id_masked'), 16));
        END IF;
        IF p_metadata ? 'preferred_lang' AND NULLIF(trim(COALESCE(p_metadata->>'preferred_lang', '')), '') IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('preferred_lang', left(trim(p_metadata->>'preferred_lang'), 10));
        END IF;
        IF p_metadata ? 'home_gps' AND jsonb_typeof(p_metadata->'home_gps') = 'object' THEN
            IF (p_metadata->'home_gps'->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$'
               AND (p_metadata->'home_gps'->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$'
            THEN
                v_hlat := (p_metadata->'home_gps'->>'lat')::numeric;
                v_hlng := (p_metadata->'home_gps'->>'lng')::numeric;
                IF v_hlat BETWEEN -90 AND 90 AND v_hlng BETWEEN -180 AND 180 THEN
                    v_safe_meta := v_safe_meta || jsonb_build_object(
                        'home_gps',
                        jsonb_build_object('lat', ROUND(v_hlat, 6), 'lng', ROUND(v_hlng, 6), 'updated_at', now())
                    );
                END IF;
            END IF;
        END IF;
        IF NOT v_seed_root_ok AND sawyan.is_reg_field_required('member', 'home_gps', 'initial') AND NOT (v_safe_meta ? 'home_gps') THEN
            RAISE EXCEPTION 'MEMBER_HOME_GPS_REQUIRED';
        END IF;
        v_avatar := sawyan.validate_attachment_data(p_metadata->>'avatar_url', 200000, true);
        IF v_avatar IS NOT NULL THEN
            v_safe_meta := v_safe_meta || jsonb_build_object('avatar_url', v_avatar);
        END IF;
    ELSIF NOT v_seed_root_ok AND sawyan.is_reg_field_required('member', 'home_gps', 'initial') THEN
        RAISE EXCEPTION 'MEMBER_HOME_GPS_REQUIRED';
    END IF;

    INSERT INTO sawyan.members (
        member_code, full_name, email, phone,
        nationality_country_id, residency_country_id, city_geoname_id, manual_district_fallback,
        auth_user_id, sponsor_id, placement_side, generation_in_tree,
        is_active_in_tree, kyc_status, status, metadata
    ) VALUES (
        v_next_code, v_clean_name, v_clean_email, v_clean_phone,
        v_nat_cid, v_res_cid, v_city_id, NULLIF(trim(COALESCE(p_manual_district, '')), ''),
        gen_random_uuid(), v_sponsor.id,
        CASE WHEN v_seed_root_ok THEN 'root_direct' ELSE 'left' END,
        1,
        true, 'unverified', 'active',
        v_safe_meta || jsonb_build_object(
            'pwd_bcrypt', v_pwd_hash,
            'active_session_token', v_session_token,
            'seed_root_approved', v_seed_root_ok
        )
    ) RETURNING * INTO v_new_member;

    INSERT INTO sawyan.wallets (member_id, balance_usd, pending_balance_usd, s03_suspense_balance_usd, total_earned_usd)
    VALUES (v_new_member.id, 0.00, 0.00, 0.00, 0.00)
    ON CONFLICT (member_id) DO NOTHING;

    SELECT * INTO v_parent_rec FROM sawyan.members WHERE id = v_new_member.parent_member_id;

    PERFORM sawyan.append_audit_log(
        'member',
        v_new_member.id,
        CASE WHEN v_seed_root_ok THEN 'founding_leader_registered_under_root_0' ELSE 'member_registered' END,
        'members',
        v_new_member.id::text,
        NULL,
        jsonb_build_object('member_code', v_new_member.member_code, 'sponsor_code', v_sponsor.member_code, 'parent_member_code', v_parent_rec.member_code, 'country', v_country_code)
    );

    RETURN jsonb_build_object(
        'success', true,
        'session_token', v_session_token,
        'member', jsonb_build_object(
            'id', v_new_member.id,
            'member_code', v_new_member.member_code,
            'full_name', v_new_member.full_name,
            'email', v_new_member.email,
            'phone', v_new_member.phone,
            'country_code', v_country_code,
            'residency_country_id', v_new_member.residency_country_id,
            'placement_side', v_new_member.placement_side,
            'generation_in_tree', v_new_member.generation_in_tree,
            'parent_member_id', v_new_member.parent_member_id,
            'parent_member_code', v_parent_rec.member_code,
            'parent_member_name', v_parent_rec.full_name,
            'sponsor_id', v_new_member.sponsor_id,
            'sponsor_name', v_sponsor.full_name,
            'kyc_status', v_new_member.kyc_status,
            'created_at', v_new_member.created_at
        )
    );
END;
$$;

-- 8. ترقية تحديث ملف العضو (تفعيل فحص الإيميل الصارم)
CREATE OR REPLACE FUNCTION sawyan.update_member_profile_settings(
    p_member_id            UUID,
    p_session_token        TEXT DEFAULT NULL,
    p_full_name            VARCHAR(150) DEFAULT NULL,
    p_email                VARCHAR(255) DEFAULT NULL,
    p_manual_district      VARCHAR(60) DEFAULT NULL,
    p_favorite_merchant_id UUID DEFAULT NULL,
    p_favorite_action      VARCHAR(12) DEFAULT NULL,
    p_current_password     TEXT DEFAULT NULL,
    p_new_password         TEXT DEFAULT NULL,
    p_home_lat             NUMERIC DEFAULT NULL,
    p_home_lng             NUMERIC DEFAULT NULL,
    p_avatar_url           TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_member       sawyan.members%ROWTYPE;
    v_meta         JSONB;
    v_favs         JSONB;
    v_new_favs     JSONB := '[]'::jsonb;
    v_old_hash     TEXT;
    v_clean_avatar TEXT;
    v_clean_email  VARCHAR(255);
BEGIN
    v_member := sawyan.verify_member_session(p_member_id, p_session_token);
    v_meta := COALESCE(v_member.metadata, '{}'::jsonb);

    IF p_email IS NOT NULL AND trim(p_email) <> '' THEN
        v_clean_email := sawyan.validate_strict_email(p_email);
        IF EXISTS (SELECT 1 FROM sawyan.members WHERE lower(email) = v_clean_email AND id <> v_member.id) THEN
            RAISE EXCEPTION 'EMAIL_ALREADY_REGISTERED';
        END IF;
    END IF;

    IF p_new_password IS NOT NULL AND trim(p_new_password) <> '' THEN
        IF length(trim(p_new_password)) < 8 OR trim(p_new_password) IN ('123456', '12345678', 'password') THEN
            RAISE EXCEPTION 'WEAK_OR_DEFAULT_PASSWORD_REJECTED';
        END IF;
        v_old_hash := v_meta->>'pwd_bcrypt';
        IF v_old_hash IS NOT NULL THEN
            IF p_current_password IS NULL OR extensions.crypt(p_current_password, v_old_hash) <> v_old_hash THEN
                RAISE EXCEPTION 'CURRENT_PASSWORD_INCORRECT';
            END IF;
        END IF;
        v_meta := jsonb_set(v_meta, '{pwd_bcrypt}', to_jsonb(extensions.crypt(p_new_password, extensions.gen_salt('bf', 10))));
    END IF;

    IF p_favorite_merchant_id IS NOT NULL THEN
        v_favs := COALESCE(v_meta->'favorite_merchant_ids', '[]'::jsonb);
        IF lower(COALESCE(p_favorite_action, 'toggle')) = 'remove'
           OR (lower(COALESCE(p_favorite_action, 'toggle')) = 'toggle' AND v_favs @> to_jsonb(p_favorite_merchant_id::text)) THEN
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_new_favs
              FROM jsonb_array_elements(v_favs) elem
             WHERE elem #>> '{}' <> p_favorite_merchant_id::text;
            v_meta := jsonb_set(v_meta, '{favorite_merchant_ids}', v_new_favs);
        ELSE
            IF NOT (v_favs @> to_jsonb(p_favorite_merchant_id::text)) THEN
                v_meta := jsonb_set(v_meta, '{favorite_merchant_ids}', v_favs || to_jsonb(p_favorite_merchant_id::text));
            END IF;
        END IF;
    END IF;

    IF p_home_lat IS NOT NULL AND p_home_lng IS NOT NULL THEN
        IF p_home_lat < -90 OR p_home_lat > 90 OR p_home_lng < -180 OR p_home_lng > 180 THEN
            RAISE EXCEPTION 'INVALID_HOME_GPS_COORDINATES';
        END IF;
        v_meta := jsonb_set(
            v_meta,
            '{home_gps}',
            jsonb_build_object('lat', ROUND(p_home_lat::numeric, 6), 'lng', ROUND(p_home_lng::numeric, 6), 'updated_at', now())
        );
    END IF;

    IF p_avatar_url IS NOT NULL THEN
        IF trim(p_avatar_url) = '' THEN
            v_meta := v_meta - 'avatar_url';
        ELSE
            v_clean_avatar := sawyan.validate_attachment_data(p_avatar_url, 200000, true);
            v_meta := jsonb_set(v_meta, '{avatar_url}', to_jsonb(v_clean_avatar));
        END IF;
    END IF;

    UPDATE sawyan.members
       SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
           email = COALESCE(v_clean_email, email),
           manual_district_fallback = COALESCE(NULLIF(trim(p_manual_district), ''), manual_district_fallback),
           metadata = v_meta
     WHERE id = v_member.id
    RETURNING * INTO v_member;

    RETURN jsonb_build_object(
        'success', true,
        'member_id', v_member.id,
        'full_name', v_member.full_name,
        'email', v_member.email,
        'manual_district_fallback', v_member.manual_district_fallback,
        'avatar_url', NULLIF(v_member.metadata->>'avatar_url', ''),
        'home_gps', v_member.metadata->'home_gps',
        'favorite_merchant_ids', COALESCE(v_member.metadata->'favorite_merchant_ids', '[]'::jsonb)
    );
END;
$$;

-- 9. ترقية استكمال ملف التاجر وإدارة موظفي الكاشير (حفظ كل الحقول المرحّلة + توليد كود الكاشير + النسبة قبل القفل)
CREATE OR REPLACE FUNCTION sawyan.manage_merchant_cashier_and_settings(
    p_merchant_id          UUID,
    p_action               VARCHAR(30),
    p_session_token        TEXT DEFAULT NULL,
    p_business_name        VARCHAR(180) DEFAULT NULL,
    p_owner_name           VARCHAR(150) DEFAULT NULL,
    p_phone                VARCHAR(24) DEFAULT NULL,
    p_address              TEXT DEFAULT NULL,
    p_latitude             NUMERIC(9,6) DEFAULT NULL,
    p_longitude            NUMERIC(9,6) DEFAULT NULL,
    p_wifi_ssid            TEXT DEFAULT NULL,
    p_wifi_password        TEXT DEFAULT NULL,
    p_working_hours        TEXT DEFAULT NULL,
    p_current_password     TEXT DEFAULT NULL,
    p_new_password         TEXT DEFAULT NULL,
    p_employee_code        VARCHAR(30) DEFAULT NULL,
    p_employee_name        VARCHAR(150) DEFAULT NULL,
    p_employee_pin         TEXT DEFAULT NULL,
    p_linked_member_code   BIGINT DEFAULT NULL,
    p_max_tx_limit         NUMERIC(18,2) DEFAULT NULL,
    p_employee_id          UUID DEFAULT NULL,
    p_branch_id            UUID DEFAULT NULL,
    p_media_patch          JSONB DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_merch       sawyan.merchants%ROWTYPE;
    v_country     sawyan.countries%ROWTYPE;
    v_act         VARCHAR(30);
    v_main_br_id  UUID;
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
BEGIN
    v_merch := sawyan.verify_merchant_session(p_merchant_id, p_session_token);
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    v_act := lower(trim(COALESCE(p_action, 'update_profile')));

    SELECT id INTO v_main_br_id
      FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

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

            -- حقول الاستكمال التعاقدية والتجارية
            IF p_media_patch ? 'commercial_reg_no' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('commercial_reg_no', NULLIF(left(trim(COALESCE(p_media_patch->>'commercial_reg_no', '')), 80), ''));
            END IF;
            IF p_media_patch ? 'tax_id' THEN
                v_meta_patch := v_meta_patch || jsonb_build_object('tax_id', NULLIF(left(trim(COALESCE(p_media_patch->>'tax_id', '')), 80), ''));
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
               SET business_name     = COALESCE(NULLIF(trim(COALESCE(p_business_name, '')), ''), business_name),
                   owner_name        = COALESCE(NULLIF(trim(COALESCE(p_owner_name, '')), ''), owner_name),
                   phone             = COALESCE(v_new_phone, phone),
                   email             = COALESCE(v_new_email, email),
                   merchant_type     = COALESCE(v_new_type, merchant_type),
                   category          = COALESCE(v_new_cat, category),
                   deduction_percent = COALESCE(v_new_ded, deduction_percent),
                   is_isolated       = CASE WHEN v_new_ded IS NOT NULL AND COALESCE((metadata->>'commission_pending')::boolean, false) THEN false ELSE is_isolated END,
                   address           = COALESCE(NULLIF(trim(COALESCE(p_address, '')), ''), address),
                   latitude          = COALESCE(p_latitude, latitude),
                   longitude         = COALESCE(p_longitude, longitude),
                   metadata          = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
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
               SET deduction_percent = COALESCE(v_new_ded, deduction_percent),
                   is_isolated       = CASE WHEN v_new_ded IS NOT NULL AND COALESCE((metadata->>'commission_pending')::boolean, false) THEN false ELSE is_isolated END,
                   metadata          = COALESCE(metadata, '{}'::jsonb) || v_meta_patch
             WHERE id = v_merch.id
            RETURNING * INTO v_merch;
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'action', CASE WHEN v_act = 'update_media' THEN 'media_updated' ELSE 'profile_updated' END,
            'deduction_percent', v_merch.deduction_percent,
            'commission_pending', COALESCE((v_merch.metadata->>'commission_pending')::boolean, false),
            'logo_url', NULLIF(v_merch.metadata->>'logo_url', ''),
            'cover_image_url', NULLIF(v_merch.metadata->>'cover_image_url', ''),
            'images', CASE WHEN jsonb_typeof(v_merch.metadata->'images') = 'array' THEN v_merch.metadata->'images' ELSE '[]'::jsonb END,
            'kyc_docs', COALESCE(v_merch.metadata->'kyc_docs', '{}'::jsonb)
        );

    ELSIF v_act = 'add_cashier' THEN
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

    ELSIF v_act = 'reset_cashier_pin' THEN
        IF COALESCE(p_employee_pin, '') !~ '^\d{4}$' THEN
            RAISE EXCEPTION 'CASHIER_PIN_MUST_BE_4_DIGITS';
        END IF;
        UPDATE sawyan.cashier_employees
           SET pin_hash            = extensions.crypt(trim(p_employee_pin), extensions.gen_salt('bf', 10)),
               failed_pin_attempts = 0,
               pin_locked_until    = NULL
         WHERE id = p_employee_id AND merchant_id = v_merch.id;
        RETURN jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_reset', true);
    ELSE
        RAISE EXCEPTION 'UNKNOWN_MERCHANT_MANAGE_ACTION: %', p_action;
    END IF;
END;
$$;

-- 10. ترقية حزمة بيانات لوحة التاجر لإرجاع كافة الحقول المرحّلة
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
    v_settings     sawyan.settings%ROWTYPE;
    v_main_br      sawyan.merchant_branches%ROWTYPE;
    v_free_bal     NUMERIC(18,2);
    v_denom        NUMERIC(18,2);
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
    SELECT * INTO v_country FROM sawyan.countries WHERE id = v_merch.country_id;
    SELECT * INTO v_settings FROM sawyan.settings
     WHERE (country_id = v_merch.country_id OR country_id IS NULL) AND effective_from <= now()
     ORDER BY country_id NULLS LAST, effective_from DESC LIMIT 1;

    SELECT * INTO v_main_br FROM sawyan.merchant_branches
     WHERE merchant_id = v_merch.id
     ORDER BY is_main_branch DESC, created_at ASC LIMIT 1;

    v_free_bal := v_merch.actual_cash_balance - v_merch.soft_hold_balance + v_merch.credit_limit;
    v_denom    := GREATEST(v_merch.package_base_amount, v_merch.credit_limit, 1.00);
    v_free_pct := CASE WHEN GREATEST(v_merch.package_base_amount, v_merch.credit_limit) > 0
                       THEN ROUND(((v_free_bal / v_denom) * 100.0)::numeric, 2)
                       ELSE 0.00 END;
    v_safe_sales := CASE WHEN v_merch.deduction_percent > 0
                         THEN ROUND((GREATEST(0, v_free_bal) / (v_merch.deduction_percent / 100.0))::numeric, 2)
                         ELSE 0.00 END;

    IF v_merch.is_isolated OR v_free_bal <= 0 OR v_free_pct <= COALESCE(v_settings.merchant_isolate_pct, 10.00) THEN
        v_zone := 'ISOLATED';
    ELSIF v_free_pct <= COALESCE(v_settings.merchant_warn2_pct, 20.00) THEN
        v_zone := 'RED';
    ELSIF v_free_pct <= COALESCE(v_settings.merchant_warn1_pct, 30.00) THEN
        v_zone := 'YELLOW';
    ELSE
        v_zone := 'GREEN';
    END IF;

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00), COUNT(*)
      INTO v_today_sales, v_today_comm, v_today_cnt
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('day', now() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    SELECT COALESCE(SUM(total_amount), 0.00), COALESCE(SUM(commission_amount), 0.00)
      INTO v_month_sales, v_month_comm
      FROM sawyan.transactions
     WHERE merchant_id = v_merch.id
       AND status = 'completed'
       AND COALESCE(completed_at, created_at) >= (date_trunc('month', now() AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC')) AT TIME ZONE COALESCE(v_country.iana_timezone, 'UTC'));

    v_shift := sawyan.get_merchant_shift_closing(v_merch.id, p_branch_id, COALESCE(p_shift_filter, 'today'), NULL, NULL, NULL, NULL);
    IF v_main_br.id IS NOT NULL THEN
        v_radar_1km := sawyan.get_merchant_members_density(v_main_br.id, 1.0);
        v_radar_2km := sawyan.get_merchant_members_density(v_main_br.id, 2.0);
        v_radar_3km := sawyan.get_merchant_members_density(v_main_br.id, 3.0);
    END IF;

    RETURN jsonb_build_object(
        'profile', jsonb_build_object(
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
            'is_isolated', v_merch.is_isolated,
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
            'tax_id', NULLIF(v_merch.metadata->>'tax_id', ''),
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
                       mb.branch_name, COALESCE(ce.full_name, 'المالك / الكاشير العام') AS cashier_name
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

-- 11. ترقية إدارة الموظفين الإداريين (صيغة إيميل صارمة + هاتف اختياري أو إجباري من لوحة النماذج)
DROP FUNCTION IF EXISTS sawyan.admin_manage_staff_accounts(UUID, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS sawyan.admin_manage_staff_accounts(UUID, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR);
CREATE OR REPLACE FUNCTION sawyan.admin_manage_staff_accounts(
    p_admin_id       UUID,
    p_session_token  TEXT,
    p_action         VARCHAR, -- 'list' | 'create' | 'update' | 'reset_password' | 'kill_deactivate' | 'activate'
    p_target_id      UUID    DEFAULT NULL,
    p_full_name      VARCHAR DEFAULT NULL,
    p_email          VARCHAR DEFAULT NULL,
    p_role           VARCHAR DEFAULT NULL,
    p_password       TEXT    DEFAULT NULL,
    p_country_scope  VARCHAR DEFAULT 'GLOBAL',
    p_phone          VARCHAR DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm         JSONB;
    v_act         VARCHAR(30);
    v_staff       JSONB;
    v_tid         UUID;
    v_clean_email VARCHAR(255);
    v_clean_phone VARCHAR(24);
    v_scope       VARCHAR(10);
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, NULL, false);
    v_act := lower(trim(COALESCE(p_action, 'list')));

    IF v_act <> 'list' AND COALESCE((v_adm->>'is_sovereign_founder')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'FOUNDER_EXCLUSIVE_AUTHORITY: Managing admin staff accounts and roles is strictly exclusive to the Sovereign Founder.';
    END IF;

    IF v_act = 'create' THEN
        IF length(trim(COALESCE(p_full_name, ''))) < 3 OR length(trim(COALESCE(p_email, ''))) < 5 THEN
            RAISE EXCEPTION 'STAFF_NAME_AND_EMAIL_REQUIRED';
        END IF;
        v_clean_email := sawyan.validate_strict_email(p_email);
        IF v_clean_email IS NULL THEN
            RAISE EXCEPTION 'STAFF_NAME_AND_EMAIL_REQUIRED';
        END IF;
        IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) = '123456' THEN
            RAISE EXCEPTION 'STRONG_STAFF_PASSWORD_REQUIRED';
        END IF;
        IF p_role NOT IN ('data_entry', 'reviewer', 'approver', 'auditor', 'finance', 'support', 'kyc_officer') THEN
            RAISE EXCEPTION 'INVALID_STAFF_ROLE: %', p_role;
        END IF;

        v_scope := upper(COALESCE(NULLIF(trim(p_country_scope), ''), 'GLOBAL'));
        v_clean_phone := NULLIF(trim(COALESCE(p_phone, '')), '');
        IF v_clean_phone IS NOT NULL THEN
            v_clean_phone := sawyan.validate_and_normalize_e164_phone(
                CASE WHEN length(v_scope) = 2 THEN v_scope ELSE 'EG' END,
                v_clean_phone
            );
        ELSIF sawyan.is_reg_field_required('employee_admin', 'staff_phone', 'initial') THEN
            RAISE EXCEPTION 'STAFF_PHONE_REQUIRED';
        END IF;

        INSERT INTO sawyan.admins (
            full_name, email, auth_user_id, role, must_change_password, two_factor_enabled, is_active, password_hash, metadata
        ) VALUES (
            trim(p_full_name),
            v_clean_email,
            gen_random_uuid(),
            p_role,
            true,
            true,
            true,
            extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
            jsonb_build_object('country_scope', v_scope, 'created_by_founder', p_admin_id)
                || CASE WHEN v_clean_phone IS NOT NULL THEN jsonb_build_object('phone', v_clean_phone) ELSE '{}'::jsonb END
        ) RETURNING id INTO v_tid;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_account_created', 'admins', v_tid::text, NULL, jsonb_build_object('email', v_clean_email, 'role', p_role, 'country_scope', v_scope));

    ELSIF v_act = 'update' AND p_target_id IS NOT NULL THEN
        IF p_role IS NOT NULL AND p_role NOT IN ('data_entry', 'reviewer', 'approver', 'auditor', 'finance', 'support', 'kyc_officer') THEN
            RAISE EXCEPTION 'INVALID_STAFF_ROLE: %', p_role;
        END IF;
        UPDATE sawyan.admins
           SET full_name = COALESCE(NULLIF(trim(p_full_name), ''), full_name),
               role      = COALESCE(NULLIF(trim(p_role), ''), role),
               metadata  = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('country_scope', upper(COALESCE(NULLIF(trim(p_country_scope), ''), COALESCE(metadata->>'country_scope', 'GLOBAL'))))
         WHERE id = p_target_id
           AND COALESCE((metadata->>'is_sovereign_founder')::boolean, false) IS NOT TRUE;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_account_updated', 'admins', p_target_id::text, NULL, jsonb_build_object('role', p_role, 'country_scope', p_country_scope));

    ELSIF v_act = 'reset_password' AND p_target_id IS NOT NULL THEN
        IF p_password IS NULL OR length(trim(p_password)) < 8 OR trim(p_password) = '123456' THEN
            RAISE EXCEPTION 'STRONG_STAFF_PASSWORD_REQUIRED';
        END IF;
        UPDATE sawyan.admins
           SET password_hash        = extensions.crypt(trim(p_password), extensions.gen_salt('bf', 10)),
               must_change_password = true,
               metadata             = (COALESCE(metadata, '{}'::jsonb) - 'session_token_sha256') || jsonb_build_object('session_expires_at', now() - interval '1 minute')
         WHERE id = p_target_id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_password_reset_and_session_cleared', 'admins', p_target_id::text, NULL, '{}'::jsonb);

    ELSIF v_act = 'kill_deactivate' AND p_target_id IS NOT NULL THEN
        IF p_target_id = p_admin_id THEN
            RAISE EXCEPTION 'CANNOT_DEACTIVATE_OWN_FOUNDER_ACCOUNT';
        END IF;
        UPDATE sawyan.admins
           SET is_active = false,
               metadata  = (COALESCE(metadata, '{}'::jsonb) - 'session_token_sha256') || jsonb_build_object('session_expires_at', now() - interval '1 minute', 'killed_at', now())
         WHERE id = p_target_id
           AND COALESCE((metadata->>'is_sovereign_founder')::boolean, false) IS NOT TRUE;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_session_killed_and_deactivated', 'admins', p_target_id::text, NULL, '{}'::jsonb);

    ELSIF v_act = 'activate' AND p_target_id IS NOT NULL THEN
        UPDATE sawyan.admins
           SET is_active = true
         WHERE id = p_target_id;

        PERFORM sawyan.append_audit_log('admin', p_admin_id, 'staff_account_reactivated', 'admins', p_target_id::text, NULL, '{}'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(row_to_json(ad)::jsonb ORDER BY ad.is_founder DESC, ad.created_at ASC), '[]'::jsonb)
      INTO v_staff
      FROM (
          SELECT a.id, a.full_name, a.email, a.role, a.is_active, a.must_change_password,
                 a.last_login_at, a.created_at,
                 COALESCE((a.metadata->>'is_sovereign_founder')::boolean, false) AS is_founder,
                 COALESCE(a.metadata->>'country_scope', 'GLOBAL') AS country_scope,
                 NULLIF(a.metadata->>'phone', '') AS phone
            FROM sawyan.admins a
      ) ad;

    RETURN jsonb_build_object('staff', v_staff);
END;
$$;

-- 12. ترقية اعتماد عقد التاجر في الإدارة لقفل نسبة العمولة وتفعيل المتجر
CREATE OR REPLACE FUNCTION sawyan.admin_manage_merchant_contract(
    p_admin_id               UUID,
    p_session_token          TEXT,
    p_merchant_id            UUID,
    p_action                 VARCHAR,
    p_deduction_percent      NUMERIC DEFAULT NULL,
    p_category               VARCHAR DEFAULT NULL,
    p_credit_limit           NUMERIC DEFAULT NULL,
    p_is_active              BOOLEAN DEFAULT NULL,
    p_is_isolated            BOOLEAN DEFAULT NULL,
    p_topup_amount_local     NUMERIC DEFAULT NULL,
    p_topup_bank_ref         TEXT    DEFAULT NULL,
    p_topup_proof_notif_id   UUID    DEFAULT NULL,
    p_reason                 TEXT    DEFAULT 'تحديث تعاقدي معتمد من إدارة علاقات التجار'
) RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
    v_adm      JSONB;
    v_mer      sawyan.merchants%ROWTYPE;
    v_act      VARCHAR(30);
    v_mc_res   JSONB;
    v_qtx      RECORD;
    v_released INT := 0;
    v_rem_q    INT := 0;
    v_free_bal NUMERIC(18,2) := 0.00;
    v_free_pct NUMERIC(6,2) := 0.00;
    v_iso_pct  NUMERIC(5,2) := 10.00;
BEGIN
    v_adm := sawyan.verify_admin_session(p_admin_id, p_session_token, ARRAY['approver', 'finance', 'reviewer'], true);
    v_act := lower(trim(COALESCE(p_action, 'update_contract')));

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
    ELSE
        IF p_deduction_percent IS NOT NULL AND (p_deduction_percent < 0.50 OR p_deduction_percent > 95.00) THEN
            RAISE EXCEPTION 'INVALID_DEDUCTION_PERCENT_RANGE';
        END IF;
        IF p_credit_limit IS NOT NULL AND p_credit_limit < 0 THEN
            RAISE EXCEPTION 'INVALID_CREDIT_LIMIT_NEGATIVE';
        END IF;

        UPDATE sawyan.merchants
           SET deduction_percent   = COALESCE(p_deduction_percent, deduction_percent),
               category            = COALESCE(NULLIF(trim(p_category), ''), category),
               credit_limit        = COALESCE(p_credit_limit, credit_limit),
               package_base_amount = GREATEST(package_base_amount, COALESCE(p_credit_limit, credit_limit)),
               is_active           = COALESCE(p_is_active, is_active),
               metadata            = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                   'contract_reviewed_at', now(),
                   'contract_reviewed_by', p_admin_id,
                   'commission_locked', true,
                   'commission_pending', false
               )
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

        SELECT * INTO v_mer FROM sawyan.merchants WHERE id = v_mer.id;
        SELECT COUNT(*) INTO v_rem_q
          FROM sawyan.transactions
         WHERE merchant_id = v_mer.id AND status = 'awaiting_merchant_topup';

        SELECT COALESCE(s.merchant_isolate_pct, 10.00) INTO v_iso_pct
          FROM sawyan.settings s
         WHERE (s.country_id = v_mer.country_id OR s.country_id IS NULL)
           AND s.effective_from <= now()
         ORDER BY s.country_id NULLS LAST, s.effective_from DESC
         LIMIT 1;

        v_free_bal := v_mer.actual_cash_balance - v_mer.soft_hold_balance + v_mer.credit_limit;
        IF GREATEST(v_mer.package_base_amount, v_mer.credit_limit) > 0 THEN
            v_free_pct := ROUND(((v_free_bal
                                  / GREATEST(v_mer.package_base_amount, v_mer.credit_limit)) * 100.0)::numeric, 2);
        END IF;

        UPDATE sawyan.merchants
           SET is_isolated = CASE
               WHEN p_is_isolated IS TRUE THEN true
               WHEN v_rem_q > 0 THEN true
               WHEN v_free_bal < 0 THEN true
               WHEN (v_mer.package_base_amount > 0 OR v_mer.credit_limit > 0) AND v_free_pct <= COALESCE(v_iso_pct, 10.00) THEN true
               WHEN v_free_bal > 0 AND v_free_pct > COALESCE(v_iso_pct, 10.00) THEN false
               ELSE COALESCE(p_is_isolated, v_mer.is_isolated)
           END
         WHERE id = v_mer.id
        RETURNING * INTO v_mer;

        PERFORM sawyan.append_audit_log(
            'admin', p_admin_id, 'merchant_contract_updated', 'merchants', v_mer.id::text, NULL,
            jsonb_build_object(
                'deduction_percent', v_mer.deduction_percent,
                'credit_limit', v_mer.credit_limit,
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
            'actual_cash_balance', v_mer.actual_cash_balance,
            'soft_hold_balance', v_mer.soft_hold_balance,
            'free_balance', v_free_bal,
            'is_active', v_mer.is_active,
            'is_isolated', v_mer.is_isolated,
            'released_fifo_count', v_released,
            'remaining_queue', v_rem_q
        );
    END IF;
END;
$$;

-- 13. حماية submit_member_pending_purchase من تاجر لم يحدد عمولته بعد (deduction_percent <= 0)
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
    IF NOT FOUND OR v_merchant.is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE';
    END IF;
    IF COALESCE(v_merchant.deduction_percent, 0) <= 0 THEN
        RAISE EXCEPTION 'MERCHANT_COMMISSION_NOT_SET_YET';
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

    v_idem := COALESCE(p_idempotency_key, gen_random_uuid());
    v_short_code := 'SW-' || upper(substr(replace(v_idem::text, '-', ''), 1, 6));
    v_ref := COALESCE(NULLIF(trim(COALESCE(p_unique_payment_ref, '')), ''), 'MBR-' || v_member.member_code || '-' || replace(v_idem::text, '-', ''));

    v_emp_code := NULLIF(upper(trim(COALESCE(p_employee_code, ''))), '');
    v_pin      := NULLIF(trim(COALESCE(p_cashier_pin, '')), '');
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
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'CASHIER_PIN_LOCKED_15M',
                'locked_until', v_rl_win + interval '15 minutes'
            );
        END IF;

        SELECT * INTO v_cashier
          FROM sawyan.cashier_employees
         WHERE merchant_id = p_merchant_id
           AND upper(employee_code) = v_emp_code
         FOR UPDATE;

        IF NOT FOUND OR v_cashier.is_active IS NOT TRUE THEN
            v_dummy_chk := extensions.crypt(v_pin, '$2a$06$abcdefghijklmnopqrstuu');
            v_rl_cnt := CASE WHEN v_rl_win IS NULL OR v_rl_win <= (now() - interval '15 minutes') THEN 1 ELSE v_rl_cnt + 1 END;
            v_rl_win := CASE WHEN v_rl_win IS NULL OR v_rl_win <= (now() - interval '15 minutes') THEN now() ELSE v_rl_win END;
            UPDATE sawyan.members
               SET metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   ARRAY['pin_rl', p_merchant_id::text],
                   jsonb_build_object('cnt', v_rl_cnt, 'win', v_rl_win),
                   true
               )
             WHERE id = v_member.id;
            RETURN jsonb_build_object(
                'success', false,
                'error_code', CASE WHEN v_rl_cnt >= 5 THEN 'CASHIER_PIN_LOCKED_15M' ELSE 'INVALID_CASHIER_CREDENTIALS' END,
                'remaining_attempts', GREATEST(0, 5 - v_rl_cnt)
            );
        END IF;

        IF v_cashier.pin_locked_until IS NOT NULL AND v_cashier.pin_locked_until > now() THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'CASHIER_PIN_LOCKED_15M',
                'locked_until', v_cashier.pin_locked_until
            );
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
               SET metadata = jsonb_set(
                   COALESCE(metadata, '{}'::jsonb),
                   ARRAY['pin_rl', p_merchant_id::text],
                   jsonb_build_object('cnt', v_rl_cnt, 'win', v_rl_win),
                   true
               )
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
            UPDATE sawyan.cashier_employees
               SET failed_pin_attempts = 0,
                   pin_locked_until    = NULL
             WHERE id = v_cashier.id;
        END IF;
        IF v_rl_cnt > 0 THEN
            UPDATE sawyan.members
               SET metadata = COALESCE(metadata, '{}'::jsonb) #- ARRAY['pin_rl', p_merchant_id::text]
             WHERE id = v_member.id;
        END IF;

        IF v_cashier.max_tx_amount_limit IS NOT NULL AND p_amount > v_cashier.max_tx_amount_limit THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'CASHIER_TX_LIMIT_EXCEEDED',
                'max_limit', v_cashier.max_tx_amount_limit
            );
        END IF;

        v_res := sawyan.submit_pos_transaction(
            v_member.id,
            p_merchant_id,
            COALESCE(v_branch_id, v_cashier.branch_id),
            p_amount,
            v_pay_type,
            v_ref,
            v_short_code,
            v_idem,
            v_cashier.id,
            true,
            v_clean_rec
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
        v_member.id,
        p_merchant_id,
        v_branch_id,
        p_amount,
        v_pay_type,
        v_ref,
        v_short_code,
        v_idem,
        NULL,
        false,
        v_clean_rec
    );

    INSERT INTO sawyan.notifications (recipient_type, recipient_id, event_name, channel, payload)
    VALUES ('merchant', p_merchant_id, 'PendingPurchaseRequested', 'in_app',
            jsonb_build_object('sw_short_code', v_short_code, 'amount', p_amount, 'payment_type', v_pay_type, 'member_code', v_member.member_code));

    RETURN v_res || jsonb_build_object('success', true, 'sw_short_code', v_short_code, 'mode', 'pending_remote');
END;
$$;

-- 14. أقفال الصلاحيات الأقل (Least-Privilege Lockdown) لكافة دوال المرحلة 9
REVOKE ALL ON FUNCTION sawyan.seed_default_registration_configs(VARCHAR, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.validate_strict_email(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.validate_and_normalize_e164_phone(CHAR, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.is_reg_field_required(VARCHAR, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_registration_form_config(VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.lookup_onboarder_by_code(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_registration_fields(UUID, TEXT, VARCHAR, VARCHAR, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_anonymized_members_map_pins(NUMERIC, NUMERIC, NUMERIC, CHAR, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.register_new_merchant(VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BIGINT, NUMERIC, NUMERIC, BIGINT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.register_new_member(VARCHAR, VARCHAR, BIGINT, TEXT, CHAR, CHAR, BIGINT, VARCHAR, VARCHAR, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.update_member_profile_settings(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_staff_accounts(UUID, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) FROM PUBLIC, anon, authenticated;

-- دوال داخلية محصورة بـ service_role فقط
GRANT EXECUTE ON FUNCTION sawyan.seed_default_registration_configs(VARCHAR, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.validate_strict_email(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.validate_and_normalize_e164_phone(CHAR, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION sawyan.is_reg_field_required(VARCHAR, VARCHAR, VARCHAR) TO service_role;

-- دوال الـ RPC العامة والمحمية بالجلسات
GRANT EXECUTE ON FUNCTION sawyan.get_registration_form_config(VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.lookup_onboarder_by_code(BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_registration_fields(UUID, TEXT, VARCHAR, VARCHAR, JSONB, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_anonymized_members_map_pins(NUMERIC, NUMERIC, NUMERIC, CHAR, UUID, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.register_new_merchant(VARCHAR, VARCHAR, VARCHAR, TEXT, CHAR, VARCHAR, VARCHAR, NUMERIC, VARCHAR, TEXT, BIGINT, NUMERIC, NUMERIC, BIGINT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.register_new_member(VARCHAR, VARCHAR, BIGINT, TEXT, CHAR, CHAR, BIGINT, VARCHAR, VARCHAR, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.update_member_profile_settings(UUID, TEXT, VARCHAR, VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, TEXT, NUMERIC, NUMERIC, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.manage_merchant_cashier_and_settings(UUID, VARCHAR, TEXT, VARCHAR, VARCHAR, VARCHAR, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, VARCHAR, VARCHAR, TEXT, BIGINT, NUMERIC, UUID, UUID, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.get_merchant_dashboard_bundle(UUID, TEXT, VARCHAR, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_staff_accounts(UUID, TEXT, VARCHAR, UUID, VARCHAR, VARCHAR, VARCHAR, TEXT, VARCHAR, VARCHAR) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.admin_manage_merchant_contract(UUID, TEXT, UUID, VARCHAR, NUMERIC, VARCHAR, NUMERIC, BOOLEAN, BOOLEAN, NUMERIC, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION sawyan.submit_member_pending_purchase(UUID, UUID, UUID, NUMERIC, VARCHAR, UUID, TEXT, TEXT, VARCHAR, VARCHAR, TEXT) TO anon, authenticated, service_role;
