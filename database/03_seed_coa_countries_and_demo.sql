-- ============================================================================
-- SAWYAN ECOSYSTEM — V3.0 FOUNDATION SEED (COA, COUNTRIES, GEONAMES, ROOT #0)
-- Applied cleanly to BOTH `sawyan` (Production) and `sawyan_demo` (Parallel)
-- ============================================================================

-- 1. دليل الحسابات المرقم (22 حساباً قياسياً — COA)
INSERT INTO sawyan.chart_of_accounts (account_code, account_name_ar, account_name_en, normal_balance) VALUES
('1101', 'نقدية بالحسابات البنكية الفعلية للشركة', 'Corporate Bank Accounts — Confirmed Cash', 'D'),
('1102', 'نقدية قيد التحصيل والتسوية لدى بوابات الدفع', 'PSP Settlement Clearing Account', 'D'),
('1201', 'ذمم مدينين — استثناء التاجر الآجل', 'Merchant Deferred AR', 'D'),
('1301', 'ذمم مقاصة الأهداف السالبة', 'Member Negative Clawback AR', 'D'),
('2101', 'التزامات أرصدة شحن التجار المسبقة', 'Merchant Prepaid Float', 'C'),
('2102', 'التزامات حجوزات مؤقتة', 'Merchant Soft Hold Liability', 'C'),
('2201', 'التزامات صناديق الأهداف والـ Carry On', 'Target Box & Carry On Pool', 'C'),
('2301', 'التزامات عمولات مستحقة قيد التسوية', 'Pending Commissions Liability', 'C'),
('2302', 'التزامات محافظ الأعضاء القابلة للسحب', 'Member Wallets Payable', 'C'),
('2303', 'حساب فائض الستوبر المالي المعلق (S03)', 'S03 Pro-Rata Suspense Account', 'C'),
('2304', 'حساب الأرصدة الخاملة المجمّدة (W11)', 'Dormant Balances Liability', 'C'),
('2401', 'التزامات ضريبة المنبع والمستحقات الضريبية', 'WHT & Tax Payable', 'C'),
('2402', 'التزامات ضريبة القيمة المضافة B2B', 'B2B Output VAT Payable', 'C'),
('3101', 'احتياطي تغطية المرتجعات الدوار (S02)', 'Rolling Reserve (0%-5%)', 'C'),
('4101', 'إيرادات خزينة الشركة الأساسية (25%)', 'Core 25% Treasury Revenue', 'C'),
('4102', 'إيرادات الخزانة المقابلة من الأهداف التعويضية', 'Compensatory Treasury Share', 'C'),
('4103', 'إيرادات إدارية من الأهداف التعويضية (T03)', 'Compensatory Admin Fee', 'C'),
('4201', 'إيرادات رسوم السحب ومعاملات الشركاء', 'Withdrawal Fees & Partner Pool', 'C'),
('4301', 'حساب فروق التقريب (F07 / D11)', 'Rounding Differences Account', 'C'),
('5101', 'مصروفات توزيعات خطة الدخل والـ Roll-up', 'Commission Distribution Expense', 'D'),
('5201', 'مصروفات امتصاص مرتجعات ما بعد الصرف', 'Post-Payout Clawback Expense', 'D'),
('5301', 'مصروفات رسوم وعمولات بوابات الدفع والتحصيل البنكي', 'PSP Gateway & Banking Processing Fees Expense', 'D')
ON CONFLICT (account_code) DO NOTHING;

-- 2. الدول الخمس التأسيسية (EG, TR نشطة — DE, SA, US جاهزة في بوابة تفعيل الدول D13)
INSERT INTO sawyan.countries (
    country_code, country_name_i18n, currency_code, iana_timezone, brand_display_title,
    financial_stopper_usd, monthly_target_usd, compensatory_admin_fee_usd, vat_rate, wht_rate,
    tax_exclusive, payout_day, return_cutoff_day, legal_opinion_verified, local_terms_version, is_active
) VALUES
('EG', '{"ar":"مصر","en":"Egypt","tr":"Mısır"}'::jsonb, 'EGP', 'Africa/Cairo', 'SAWYAN', 4605.75, 24.75, 0.00, 0.0000, 0.0000, true, 15, 14, true, 'v2.0-EG', true),
('TR', '{"ar":"تركيا","en":"Turkey","tr":"Türkiye"}'::jsonb, 'TRY', 'Europe/Istanbul', 'SAWYAN', 4605.75, 24.75, 0.00, 0.0000, 0.0000, true, 15, 14, true, 'v2.0-TR', true),
('SA', '{"ar":"السعودية","en":"Saudi Arabia","tr":"Suudi Arabistan"}'::jsonb, 'SAR', 'Asia/Riyadh', 'SAWYAN', 4605.75, 24.75, 0.00, 0.0000, 0.0000, true, 15, 14, false, 'v2.0-SA', false),
('DE', '{"ar":"ألمانيا","en":"Germany","tr":"Almanya"}'::jsonb, 'EUR', 'Europe/Berlin', 'SAWYAN', 4605.75, 24.75, 0.00, 0.0000, 0.0000, true, 15, 14, false, 'v2.0-DE', false),
('US', '{"ar":"الولايات المتحدة","en":"United States","tr":"ABD"}'::jsonb, 'USD', 'America/New_York', 'SAWYAN', 4605.75, 24.75, 0.00, 0.0000, 0.0000, true, 15, 14, false, 'v2.0-US', false)
ON CONFLICT (country_code) DO NOTHING;

-- 3. مدن مرجعية من GeoNames (للبحث بـ GIN Trigram والرادار)
INSERT INTO sawyan.geonames_locations (geoname_id, country_code, admin1_name, city_name, asciiname, alternate_names, latitude, longitude, search_vector) VALUES
(360630, 'EG', 'Cairo', 'القاهرة', 'Cairo', 'Cairo القاهرة مدينة نصر المعادي الزمالك', 30.044420, 31.235712, 'EG Cairo القاهرة مدينة نصر المعادي'),
(361058, 'EG', 'Alexandria', 'الإسكندرية', 'Alexandria', 'Alexandria الإسكندرية سموحة', 31.200092, 29.918739, 'EG Alexandria الإسكندرية سموحة'),
(360995, 'EG', 'Giza', 'الجيزة', 'Giza', 'Giza الجيزة الدقي المهندسين أكتوبر', 30.013056, 31.208853, 'EG Giza الجيزة الدقي المهندسين'),
(745044, 'TR', 'Istanbul', 'إسطنبول', 'Istanbul', 'Istanbul إسطنبول الفاتح شيشلي باشاك شهير', 41.008238, 28.978359, 'TR Istanbul إسطنبول الفاتح شيشلي'),
(323786, 'TR', 'Ankara', 'أنقرة', 'Ankara', 'Ankara أنقرة تشانكايا', 39.933365, 32.859741, 'TR Ankara أنقرة تشانكايا'),
(108410, 'SA', 'Riyadh', 'الرياض', 'Riyadh', 'Riyadh الرياض العليا الملقا', 24.713552, 46.675297, 'SA Riyadh الرياض العليا'),
(105343, 'SA', 'Makkah', 'جدة', 'Jeddah', 'Jeddah جدة الروضة الحمراء', 21.485811, 39.192505, 'SA Jeddah جدة الروضة'),
(2950159, 'DE', 'Berlin', 'برلين', 'Berlin', 'Berlin برلين ميتي', 52.520008, 13.404954, 'DE Berlin برلين'),
(5128581, 'US', 'New York', 'نيويورك', 'New York', 'New York نيويورك مانهاتن', 40.712776, -74.005974, 'US New York نيويورك')
ON CONFLICT (geoname_id) DO NOTHING;

-- 4. التصنيفات التجارية المعتمدة (15 تصنيفاً — M21)
INSERT INTO sawyan.categories (slug, name_i18n, risk_level) VALUES
('supermarket', '{"ar":"سوبر ماركت وبقالة","en":"Supermarket & Grocery"}'::jsonb, 'low'),
('pharmacy', '{"ar":"صيدليات ورعاية صحية","en":"Pharmacy & Healthcare"}'::jsonb, 'low'),
('restaurant', '{"ar":"مطاعم ومأكولات","en":"Restaurants & Dining"}'::jsonb, 'standard'),
('cafe', '{"ar":"كافيهات ومخبوزات","en":"Cafes & Bakeries"}'::jsonb, 'standard'),
('clothing', '{"ar":"ملابس وأزياء","en":"Clothing & Fashion"}'::jsonb, 'standard'),
('shoes', '{"ar":"أحذية وحقائب","en":"Shoes & Bags"}'::jsonb, 'standard'),
('butcher', '{"ar":"جزارة ولحوم","en":"Butcher & Meat"}'::jsonb, 'low'),
('electronics', '{"ar":"إلكترونيات وهواتف","en":"Electronics & Mobile"}'::jsonb, 'elevated'),
('home-goods', '{"ar":"أدوات منزلية وأثاث","en":"Home Goods & Furniture"}'::jsonb, 'standard'),
('delivery', '{"ar":"خدمات التوصيل والشحن","en":"Delivery & Shipping"}'::jsonb, 'standard'),
('cosmetics', '{"ar":"عطور وتجميل","en":"Cosmetics & Perfumes"}'::jsonb, 'standard'),
('real-estate', '{"ar":"خدمات عقارية","en":"Real Estate Services"}'::jsonb, 'elevated'),
('entertainment', '{"ar":"ترفيه وسياحة","en":"Entertainment & Tourism"}'::jsonb, 'standard'),
('tech-services', '{"ar":"خدمات تقنية وتعليم","en":"Tech & Education Services"}'::jsonb, 'standard'),
('other', '{"ar":"خدمات ومنتجات أخرى","en":"Other Services"}'::jsonb, 'standard')
ON CONFLICT (slug) DO NOTHING;

-- 5. الإعدادات المركزية الدستورية (Bitemporal — تلقائياً تحسب cap_amount = 4605.75 بدون FLOOR)
INSERT INTO sawyan.settings (
    country_id, brand_display_title, company_percent, generations_count,
    numerical_stopper_s01, upline_ceiling_s02, cap_auto_calc, monthly_target_usd,
    payout_day, merchant_warn1_pct, merchant_warn2_pct, merchant_isolate_pct,
    unsecured_queue_cap, unconfirmed_soft_hold_cap_pct, rolling_reserve_pct,
    wht_threshold_usd, withdrawal_cooldown_hours, dormancy_months,
    effective_from, change_reason
)
SELECT NULL, 'SAWYAN', 25.00, 11, 11, 11, true, 24.75, 15, 30.00, 20.00, 10.00, 3, 20.00, 2.00, 200.00, 72, 0,
       '2026-01-01 00:00:00+00'::timestamptz, 'Constitutional Global Defaults V3.0'
WHERE NOT EXISTS (SELECT 1 FROM sawyan.settings WHERE country_id IS NULL);

-- 6. جذر الشركة التأسيسي (#0 — Root = 0، المكان الوحيد لعدد لا نهائي من المباشرين بـ Maker-Checker D22)
INSERT INTO sawyan.members (
    member_code, full_name, email, phone, residency_country_id,
    auth_user_id, generation_in_tree, placement_side, is_active_in_tree, kyc_status
)
SELECT 0, 'شركة سويا العالمية — الجذر #0', 'root@sawyan.global', '+201000000000',
       (SELECT id FROM sawyan.countries WHERE country_code = 'EG'),
       '00000000-0000-4000-8000-000000000000'::uuid, 0, 'root_direct', true, 'verified'
WHERE NOT EXISTS (SELECT 1 FROM sawyan.members WHERE member_code = 0);
