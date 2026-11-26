/* ============================================
   SAWYAN Global Geo-Marketplace Config & Demo Data
   ============================================ */

const platformStats = {
    totalMembers: 12547,
    totalMerchants: 856,
    totalTransactions: 98432,
    totalCashback: 2547890
};

// تحويل النسبة العامة للتاجر إلى نسبة خطة الدخل المعتمدة للأعضاء
function calcNetMemberCashback(generalCommissionPct) {
    const val = parseFloat(generalCommissionPct) || 0;
    return Number((val * 0.75).toFixed(2));
}

// إعدادات الدول والعملات والمدن المعتمدة عالمياً (كافة القيم افتراضية قابلة للتغيير الإداري)
const SAWYAN_GEO_CONFIG = {
    ALL: {
        code: 'ALL',
        name: 'كل الدول (العالم)',
        flag: '🌍',
        currencyCode: 'USD',
        currency: '$',
        fxRate: 1,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 24.75,
        defaultBill: 300,
        stepBill: 25,
        maxBill: 3000,
        isGlobal: true,
        cities: { all: 'جميع المدن حول العالم' }
    },
    EG: {
        code: 'EG',
        name: 'مصر',
        flag: '🇪🇬',
        currencyCode: 'EGP',
        currency: 'ج.م',
        fxRate: 50,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 1237.50,
        defaultBill: 5000,
        stepBill: 500,
        maxBill: 40000,
        timezones: ['Africa/Cairo'],
        cities: {
            all: 'كل مدن مصر',
            cairo: 'القاهرة',
            giza: 'الجيزة',
            alex: 'الإسكندرية',
            mansoura: 'المنصورة'
        }
    },
    SA: {
        code: 'SA',
        name: 'السعودية',
        flag: '🇸🇦',
        currencyCode: 'SAR',
        currency: 'ر.س',
        fxRate: 3.75,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 92.81,
        defaultBill: 1500,
        stepBill: 150,
        maxBill: 15000,
        timezones: ['Asia/Riyadh'],
        cities: {
            all: 'كل مدن السعودية',
            riyadh: 'الرياض',
            jeddah: 'جدة',
            dammam: 'الدمام',
            makkah: 'مكة المكرمة'
        }
    },
    TR: {
        code: 'TR',
        name: 'تركيا',
        flag: '🇹🇷',
        currencyCode: 'TRY',
        currency: '₺',
        fxRate: 50,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 1237.50,
        defaultBill: 6000,
        stepBill: 500,
        maxBill: 50000,
        timezones: ['Europe/Istanbul', 'Asia/Istanbul'],
        cities: {
            all: 'كل مدن تركيا',
            istanbul: 'إسطنبول',
            ankara: 'أنقرة',
            bursa: 'بورصة'
        }
    },
    DE: {
        code: 'DE',
        name: 'ألمانيا',
        flag: '🇩🇪',
        currencyCode: 'EUR',
        currency: '€',
        fxRate: 0.92,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 22.77,
        defaultBill: 400,
        stepBill: 50,
        maxBill: 4000,
        timezones: ['Europe/Berlin'],
        cities: {
            all: 'كل مدن ألمانيا',
            berlin: 'برلين',
            munich: 'ميونخ',
            frankfurt: 'فرانكفورت'
        }
    },
    AE: {
        code: 'AE',
        name: 'الإمارات',
        flag: '🇦🇪',
        currencyCode: 'AED',
        currency: 'د.إ',
        fxRate: 3.67,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 90.83,
        defaultBill: 1500,
        stepBill: 150,
        maxBill: 15000,
        timezones: ['Asia/Dubai'],
        cities: {
            all: 'كل مدن الإمارات',
            dubai: 'دبي',
            abudhabi: 'أبوظبي',
            sharjah: 'الشارقة'
        }
    },
    GB: {
        code: 'GB',
        name: 'بريطانيا',
        flag: '🇬🇧',
        currencyCode: 'GBP',
        currency: '£',
        fxRate: 0.79,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 19.55,
        defaultBill: 350,
        stepBill: 50,
        maxBill: 3500,
        timezones: ['Europe/London'],
        cities: {
            all: 'كل مدن بريطانيا',
            london: 'لندن',
            manchester: 'مانشستر'
        }
    },
    PIONEER: {
        code: 'PIONEER',
        name: 'دولة / مدينة قريباً (توسع جديد)',
        flag: '🚀',
        currencyCode: 'USD',
        currency: '$',
        fxRate: 1,
        monthlyTargetUsd: 24.75,
        monthlyTargetLocal: 24.75,
        defaultBill: 300,
        stepBill: 25,
        maxBill: 3000,
        isPioneer: true,
        cities: {
            all: 'مدينتك القادمة (تحت التأسيس)'
        }
    }
};

// التعرّف التلقائي الذكي بأولوياته الـ 4 (URL -> localStorage -> Geo-IP/Timezone -> Default)
const SAWYAN_GEO = {
    STORAGE_KEY: 'sawyan_geo_context',

    detectInitial: function () {
        const params = new URLSearchParams(window.location.search);
        const urlCountry = (params.get('country') || '').toUpperCase();
        const urlCity = (params.get('city') || '').toLowerCase();

        // الأولوية (1): معلمات الرابط المباشر
        if (urlCountry && SAWYAN_GEO_CONFIG[urlCountry]) {
            const cfg = SAWYAN_GEO_CONFIG[urlCountry];
            const validCity = (urlCity && cfg.cities[urlCity]) ? urlCity : 'all';
            const ctx = { country: urlCountry, city: validCity, source: 'url' };
            this.save(ctx);
            return ctx;
        }

        // الأولوية (2): الاختيار المحفوظ سابقاً في المتصفح
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed && parsed.country && SAWYAN_GEO_CONFIG[parsed.country]) {
                    const cfg = SAWYAN_GEO_CONFIG[parsed.country];
                    const validCity = (parsed.city && cfg.cities[parsed.city]) ? parsed.city : 'all';
                    return { country: parsed.country, city: validCity, source: 'saved' };
                }
            }
        } catch (e) { /* ignore storage parse error */ }

        // الأولوية (3): عنوان الشبكة (إن توفر من CDN/Server) + المنطقة الزمنية لجهاز الموبايل
        try {
            const serverGeoCountry = (window.SAWYAN_SERVER_GEO && window.SAWYAN_SERVER_GEO.country || '').toUpperCase();
            if (serverGeoCountry && SAWYAN_GEO_CONFIG[serverGeoCountry]) {
                return { country: serverGeoCountry, city: 'all', source: 'geo_ip' };
            }
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
            for (const key of Object.keys(SAWYAN_GEO_CONFIG)) {
                const cfg = SAWYAN_GEO_CONFIG[key];
                if (Array.isArray(cfg.timezones) && cfg.timezones.includes(tz)) {
                    const firstCity = Object.keys(cfg.cities).find(k => k !== 'all') || 'all';
                    return { country: key, city: firstCity, source: 'timezone' };
                }
            }
        } catch (e) { /* ignore Intl fallback */ }

        // الأولوية (4): الوضع الافتراضي الآمن (مصر - القاهرة مع زر تغيير حر فوراً)
        return { country: 'EG', city: 'cairo', source: 'default' };
    },

    save: function (ctx) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                country: ctx.country,
                city: ctx.city || 'all',
                updatedAt: Date.now()
            }));
        } catch (e) { /* ignore storage quota error */ }
    },

    getCountryConfig: function (code) {
        return SAWYAN_GEO_CONFIG[code] || SAWYAN_GEO_CONFIG.EG;
    }
};

window.SAWYAN_GEO_CONFIG = SAWYAN_GEO_CONFIG;
window.SAWYAN_GEO = SAWYAN_GEO;
window.calcNetMemberCashback = calcNetMemberCashback;

const categories = [
    { id: 1, name: 'مطاعم وكافيهات', slug: 'restaurants', icon: '🍽️', count: 234 },
    { id: 2, name: 'سوبرماركت', slug: 'supermarket', icon: '🛒', count: 156 },
    { id: 9, name: 'صيدليات', slug: 'pharmacy', icon: '💊', count: 64 },
    { id: 3, name: 'ملابس وأزياء', slug: 'fashion', icon: '👗', count: 189 },
    { id: 4, name: 'إلكترونيات', slug: 'electronics', icon: '📱', count: 78 },
    { id: 5, name: 'صحة وجمال', slug: 'health-beauty', icon: '💄', count: 145 },
    { id: 6, name: 'خدمات', slug: 'services', icon: '🔧', count: 98 },
    { id: 7, name: 'تعليم', slug: 'education', icon: '📚', count: 67 },
    { id: 8, name: 'ترفيه', slug: 'entertainment', icon: '🎮', count: 89 }
];

// ============================================
// قاعدة تجار سويًا العالميين والمميزين (مع نسبة عائدات خطة الدخل للأعضاء)
// ============================================
const globalDemoMerchants = [
    // --- مصر ---
    {
        id: 'EG01',
        code: 'EG-MKT-101',
        businessName: 'سوبر ماركت النخبة المركزي',
        category: 'سوبرماركت',
        categorySlug: 'supermarket',
        generalCommissionRate: 10,
        cashbackRate: calcNetMemberCashback(10), // 7.5% صافي خطة دخل للعضو
        rating: 4.9,
        reviewsCount: 640,
        transactionsCount: 4120,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'EG',
        countryName: 'مصر',
        cityKey: 'cairo',
        city: 'القاهرة',
        district: 'مدينة نصر',
        merchantType: 'physical',
        description: 'مقاضي الأسرة اليومية والمنتجات الغذائية بالسعر الطبيعي للسوق في مدينة نصر.',
        image: 'assets/merchants/supermarket_alnukhba.png',
        phone: '+201012345101'
    },
    {
        id: 'EG02',
        code: 'EG-RST-102',
        businessName: 'مطاعم النيل الأصيل',
        category: 'مطاعم وكافيهات',
        categorySlug: 'restaurants',
        generalCommissionRate: 16,
        cashbackRate: calcNetMemberCashback(16), // 12% صافي للعضو
        rating: 4.8,
        reviewsCount: 418,
        transactionsCount: 2390,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'EG',
        countryName: 'مصر',
        cityKey: 'giza',
        city: 'الجيزة',
        district: 'المهندسين',
        merchantType: 'physical',
        description: 'مأكولات شرقية ومشويات عائلية بأعلى جودة وبنفس أسعار القائمة المعلنة.',
        image: 'assets/merchants/restaurant_aldiwan.png',
        phone: '+201012345102'
    },
    {
        id: 'EG03',
        code: 'EG-PHR-103',
        businessName: 'صيدليات الشفاء الحديثة',
        category: 'صحة وجمال',
        categorySlug: 'health-beauty',
        generalCommissionRate: 12,
        cashbackRate: calcNetMemberCashback(12), // 9% صافي للعضو
        rating: 4.9,
        reviewsCount: 512,
        transactionsCount: 3180,
        isVerified: true,
        isPremium: false,
        isFeatured: true,
        country: 'EG',
        countryName: 'مصر',
        cityKey: 'alex',
        city: 'الإسكندرية',
        district: 'سموحة',
        merchantType: 'physical',
        description: 'مستحضرات طبية وعناية شخصية وتوصيل منزلي سريع في جميع أحياء الإسكندرية.',
        image: null,
        phone: '+201012345103'
    },
    {
        id: 'EG04',
        code: 'EG-ONL-104',
        businessName: 'متجر نون تك السحابي',
        category: 'إلكترونيات',
        categorySlug: 'electronics',
        generalCommissionRate: 8,
        cashbackRate: calcNetMemberCashback(8), // 6% صافي للعضو
        rating: 4.7,
        reviewsCount: 305,
        transactionsCount: 1640,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'EG',
        countryName: 'مصر',
        cityKey: 'cairo',
        city: 'القاهرة (يشحن لكل مصر)',
        district: 'أونلاين',
        merchantType: 'online',
        description: 'هواتف وإكسسوارات وأجهزة منزلية أونلاين مع التوصيل لكافة محافظات مصر.',
        image: null,
        phone: '+201012345104'
    },

    // --- السعودية ---
    {
        id: 'F001',
        code: 'SAWYAN-F001',
        businessName: 'بوتيك الأناقة',
        category: 'ملابس وأزياء',
        categorySlug: 'fashion',
        generalCommissionRate: 20,
        cashbackRate: calcNetMemberCashback(20), // 15% صافي للعضو
        rating: 4.9,
        reviewsCount: 287,
        transactionsCount: 1456,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'SA',
        countryName: 'السعودية',
        cityKey: 'riyadh',
        city: 'الرياض',
        district: 'العليا',
        merchantType: 'both',
        description: 'أرقى الأزياء النسائية والرجالية من أشهر الماركات المعتمدة في الرياض وأونلاين.',
        image: 'assets/merchants/boutique_alanaga.png',
        ownerName: 'نورة السالم',
        phone: '+966512345001'
    },
    {
        id: 'F002',
        code: 'SAWYAN-F002',
        businessName: 'مطعم الديوان',
        category: 'مطاعم وكافيهات',
        categorySlug: 'restaurants',
        generalCommissionRate: 16,
        cashbackRate: calcNetMemberCashback(16), // 12% صافي
        rating: 4.8,
        reviewsCount: 523,
        transactionsCount: 2341,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'SA',
        countryName: 'السعودية',
        cityKey: 'jeddah',
        city: 'جدة',
        district: 'الروضة',
        merchantType: 'physical',
        description: 'تجربة طعام استثنائية تجمع بين الأصالة العربية والإبداع العصري.',
        image: 'assets/merchants/restaurant_aldiwan.png',
        ownerName: 'خالد العمري',
        phone: '+966512345002'
    },
    {
        id: 'F003',
        code: 'SAWYAN-F003',
        businessName: 'سوبر ماركت النخبة',
        category: 'سوبرماركت',
        categorySlug: 'supermarket',
        generalCommissionRate: 10,
        cashbackRate: calcNetMemberCashback(10), // 7.5% صافي
        rating: 4.7,
        reviewsCount: 892,
        transactionsCount: 5672,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'SA',
        countryName: 'السعودية',
        cityKey: 'dammam',
        city: 'الدمام',
        district: 'الشاطئ الغربي',
        merchantType: 'physical',
        description: 'سوبر ماركت متكامل يوفر جميع احتياجاتك اليومية بأسعار تنافسية.',
        image: 'assets/merchants/supermarket_alnukhba.png',
        ownerName: 'عبدالله الشمري',
        phone: '+966512345003'
    },
    {
        id: 'F004',
        code: 'SAWYAN-F004',
        businessName: 'كافيه البيادر',
        category: 'مطاعم وكافيهات',
        categorySlug: 'restaurants',
        generalCommissionRate: 12,
        cashbackRate: calcNetMemberCashback(12), // 9% صافي
        rating: 4.8,
        reviewsCount: 412,
        transactionsCount: 1890,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'SA',
        countryName: 'السعودية',
        cityKey: 'riyadh',
        city: 'الرياض',
        district: 'النرجس',
        merchantType: 'physical',
        description: 'قهوة مختصة من أجود أنواع البن مع أجواء عائلية وهادئة.',
        image: 'assets/merchants/cafe_albayader.png',
        ownerName: 'سارة الخالدي',
        phone: '+966512345004'
    },

    // --- تركيا ---
    {
        id: 'TR01',
        code: 'TR-MKT-201',
        businessName: 'مركت البسفور العائلي (Bosphorus Market)',
        category: 'سوبرماركت',
        categorySlug: 'supermarket',
        generalCommissionRate: 10,
        cashbackRate: calcNetMemberCashback(10), // 7.5% صافي
        rating: 4.9,
        reviewsCount: 374,
        transactionsCount: 2890,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'TR',
        countryName: 'تركيا',
        cityKey: 'istanbul',
        city: 'إسطنبول',
        district: 'باشاك شهير',
        merchantType: 'physical',
        description: 'مواد غذائية ومنتجات تركية وعربية طازجة بأسعار السوق الطبيعية في إسطنبول.',
        image: 'assets/merchants/supermarket_alnukhba.png',
        phone: '+905321234201'
    },
    {
        id: 'TR02',
        code: 'TR-RST-202',
        businessName: 'مطعم ومقهى سراي الأناضول',
        category: 'مطاعم وكافيهات',
        categorySlug: 'restaurants',
        generalCommissionRate: 16,
        cashbackRate: calcNetMemberCashback(16), // 12% صافي
        rating: 4.8,
        reviewsCount: 295,
        transactionsCount: 1740,
        isVerified: true,
        isPremium: false,
        isFeatured: true,
        country: 'TR',
        countryName: 'تركيا',
        cityKey: 'istanbul',
        city: 'إسطنبول',
        district: 'الفاتح',
        merchantType: 'physical',
        description: 'مأكولات تركية أصيلة وحلويات طازجة في قلب الفاتح.',
        image: 'assets/merchants/restaurant_aldiwan.png',
        phone: '+905321234202'
    },
    {
        id: 'TR03',
        code: 'TR-FSH-203',
        businessName: 'متجر إيفا للمنسوجات (Efa Tekstil Online)',
        category: 'ملابس وأزياء',
        categorySlug: 'fashion',
        generalCommissionRate: 20,
        cashbackRate: calcNetMemberCashback(20), // 15% صافي
        rating: 4.7,
        reviewsCount: 198,
        transactionsCount: 1120,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'TR',
        countryName: 'تركيا',
        cityKey: 'bursa',
        city: 'بورصة (يشحن لكل تركيا)',
        district: 'أونلاين',
        merchantType: 'online',
        description: 'ملابس قطنية ومنسوجات تركية فاخرة شحن مباشر لجميع ولايات تركيا.',
        image: null,
        phone: '+905321234203'
    },

    // --- ألمانيا وأوروبا ---
    {
        id: 'DE01',
        code: 'DE-MKT-301',
        businessName: 'Berliner Bio & Halal Markt',
        category: 'سوبرماركت',
        categorySlug: 'supermarket',
        generalCommissionRate: 10,
        cashbackRate: calcNetMemberCashback(10), // 7.5% صافي
        rating: 4.9,
        reviewsCount: 215,
        transactionsCount: 1480,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'DE',
        countryName: 'ألمانيا',
        cityKey: 'berlin',
        city: 'برلين',
        district: 'Neukölln',
        merchantType: 'physical',
        description: 'منتجات عضوية وحلال طازجة بأسعار السوبرماركت المعتادة في برلين باليورو.',
        image: null,
        phone: '+493012345301'
    },
    {
        id: 'DE02',
        code: 'DE-ELC-302',
        businessName: 'متجر راين تك للإلكترونيات',
        category: 'إلكترونيات',
        categorySlug: 'electronics',
        generalCommissionRate: 8,
        cashbackRate: calcNetMemberCashback(8), // 6% صافي
        rating: 4.8,
        reviewsCount: 164,
        transactionsCount: 920,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'DE',
        countryName: 'ألمانيا',
        cityKey: 'munich',
        city: 'ميونخ (شحن لكل ألمانيا)',
        district: 'أونلاين',
        merchantType: 'online',
        description: 'مستلزمات الحاسب والأجهزة المنزلية الذكية بشحن سريع لكافة المدن الألمانية.',
        image: null,
        phone: '+498912345302'
    },

    // --- الإمارات ---
    {
        id: 'AE01',
        code: 'AE-MKT-401',
        businessName: 'الواحة هايبر ماركت',
        category: 'سوبرماركت',
        categorySlug: 'supermarket',
        generalCommissionRate: 10,
        cashbackRate: calcNetMemberCashback(10), // 7.5% صافي
        rating: 4.8,
        reviewsCount: 342,
        transactionsCount: 2190,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'AE',
        countryName: 'الإمارات',
        cityKey: 'dubai',
        city: 'دبي',
        district: 'البرشاء',
        merchantType: 'physical',
        description: 'تسوق يومي متكامل في دبي مع توثيق فوري لعائدات الاستهلاك الاستثماري وصندوق الهدف الشهري.',
        image: 'assets/merchants/supermarket_alnukhba.png',
        phone: '+971501234401'
    },

    // --- بريطانيا ---
    {
        id: 'GB01',
        code: 'GB-RST-501',
        businessName: 'Thames Mediterranean Grill',
        category: 'مطاعم وكافيهات',
        categorySlug: 'restaurants',
        generalCommissionRate: 14,
        cashbackRate: calcNetMemberCashback(14), // 10.5% صافي
        rating: 4.8,
        reviewsCount: 179,
        transactionsCount: 860,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        country: 'GB',
        countryName: 'بريطانيا',
        cityKey: 'london',
        city: 'لندن',
        district: 'Edgware Road',
        merchantType: 'physical',
        description: 'مأكولات متوسطية طازجة في قلب لندن مع عائدات فورية لفريقك بالجنيه الإسترليني.',
        image: null,
        phone: '+442012345501'
    },

    // --- متاجر إضافية مكملة (بنفس هيكل M005..M008 مع اكتمال حقول المدينة والدولة والنسبة الصافية) ---
    {
        id: 'M005', code: 'SAWYAN-M005', businessName: 'صالون ليالي للتجميل',
        category: 'صحة وجمال', categorySlug: 'health-beauty',
        generalCommissionRate: 12,
        cashbackRate: calcNetMemberCashback(12), // 9% صافي
        rating: 4.7, reviewsCount: 412,
        transactionsCount: 2156, isVerified: true, isPremium: false,
        country: 'SA', countryName: 'السعودية', cityKey: 'riyadh', city: 'الرياض',
        district: 'الياسمين', merchantType: 'physical',
        description: 'خدمات تجميل وعناية فاخرة'
    },
    {
        id: 'M006', code: 'SAWYAN-M006', businessName: 'تك لاند للإلكترونيات',
        category: 'إلكترونيات', categorySlug: 'electronics',
        generalCommissionRate: 8,
        cashbackRate: calcNetMemberCashback(8), // 6% صافي
        rating: 4.6, reviewsCount: 278,
        transactionsCount: 1234, isVerified: true, isPremium: false,
        country: 'EG', countryName: 'مصر', cityKey: 'mansoura', city: 'المنصورة',
        district: 'حي الجامعة', merchantType: 'physical',
        description: 'أحدث الأجهزة الإلكترونية بضمان الوكيل'
    },
    {
        id: 'M007', code: 'SAWYAN-M007', businessName: 'بيكيز للمخبوزات الطازجة',
        category: 'مطاعم وكافيهات', categorySlug: 'restaurants',
        generalCommissionRate: 8,
        cashbackRate: calcNetMemberCashback(8), // 6% صافي
        rating: 4.8, reviewsCount: 234,
        transactionsCount: 1678, isVerified: true, isPremium: false,
        country: 'AE', countryName: 'الإمارات', cityKey: 'abudhabi', city: 'أبوظبي',
        district: 'الخالدية', merchantType: 'physical',
        description: 'أشهى المخبوزات الطازجة يومياً'
    },
    {
        id: 'M008', code: 'SAWYAN-M008', businessName: 'مركز التعلم الذكي أونلاين',
        category: 'تعليم', categorySlug: 'education',
        generalCommissionRate: 20,
        cashbackRate: calcNetMemberCashback(20), // 15% صافي
        rating: 4.9, reviewsCount: 156,
        transactionsCount: 534, isVerified: true, isPremium: true,
        country: 'EG', countryName: 'مصر', cityKey: 'alex', city: 'الإسكندرية (دورات أونلاين)',
        district: 'أونلاين', merchantType: 'online',
        image: null,
        description: 'دورات تدريبية واحترافية معتمدة عن بُعد'
    }
];

// إبقاء المتغير القديم للتوافق الخلفي مع بقية صفحات الديمو
const featuredSaudiMerchants = globalDemoMerchants.filter(m => m.country === 'SA' && m.isFeatured);
const demoMerchants = globalDemoMerchants;

// نظام التقييمات والملاحظات الكتابية للأعضاء على التجار
const merchantReviews = {
    'EG01': [
        {
            id: 'REG01-1',
            memberId: 'MEM1042',
            memberName: 'أحمد م.',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'نفس أسعار الرف بالضبط دون أي زيادة! عائدات الفريق الصافية 7.5% نُزّلت لصندوق هدفي في نفس الثانية.',
            date: '2026-11-10',
            helpful: 42,
            verified: true
        }
    ],
    'F001': [
        {
            id: 'RF001-1',
            memberId: 'MEM001',
            memberName: 'نورة العتيبي',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'تشكيلة رائعة من الملابس والماركات العالمية! 15% عائدات فريقك من هذا التاجر قيمة استثنائية.',
            date: '2026-11-12',
            helpful: 45,
            verified: true
        }
    ],
    'F002': [
        {
            id: 'RF002-1',
            memberId: 'MEM003',
            memberName: 'خالد الحربي',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'أفضل مطعم زرته في جدة! الطعام لذيذ جداً والخدمة سريعة. 12% عائدات فريقك من هذا التاجر تجعلها صفقة ممتازة.',
            date: '2026-11-11',
            helpful: 58,
            verified: true
        }
    ],
    'F003': [
        {
            id: 'RF003-1',
            memberId: 'MEM005',
            memberName: 'عبدالرحمن المالكي',
            memberLevel: 'برونزي',
            rating: 5,
            comment: 'منتجات طازجة وأسعار ممتازة! أتسوق هنا أسبوعياً وعائدات الاستهلاك الاستثماري تتراكم بشكل رائع.',
            date: '2026-11-09',
            helpful: 41,
            verified: true
        }
    ],
    'F004': [
        {
            id: 'RF004-1',
            memberId: 'MEM007',
            memberName: 'محمد الشمري',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'أفضل قهوة مختصة في الرياض! الأجواء مريحة جداً للعمل والاجتماعات.',
            date: '2026-11-08',
            helpful: 52,
            verified: true
        }
    ],
    'TR01': [
        {
            id: 'RTR01-1',
            memberId: 'MEM2031',
            memberName: 'محمود س.',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'مقاضي البيت الشهرية في إسطنبول مع استرداد صافي 7.5% أضافت لي قيمة ممتازة بدون تغيير المحل.',
            date: '2026-11-14',
            helpful: 31,
            verified: true
        }
    ]
};

function getMerchantReviews(merchantId) {
    return merchantReviews[merchantId] || [];
}

function calculateAverageRating(merchantId) {
    const reviews = getMerchantReviews(merchantId);
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('ar-SA', options);
}

function getMemberLevelBadge(level) {
    const badges = {
        'ذهبي': { icon: '🏆', color: '#fbbf24' },
        'فضي': { icon: '🥈', color: '#94a3b8' },
        'برونزي': { icon: '🥉', color: '#cd7f32' }
    };
    return badges[level] || badges['برونزي'];
}

function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

function formatCurrency(amount, countryCode) {
    const cfg = SAWYAN_GEO.getCountryConfig(countryCode || (SAWYAN_GEO.detectInitial().country));
    return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ' + cfg.currency;
}

function formatLargeNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + ' مليون';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(0) + ' ألف';
    }
    return formatNumber(num);
}

function generateStars(rating) {
    const full = Math.floor(rating);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
}

function generateStarsInteractive(rating = 0) {
    let html = '<div class="stars-interactive">';
    for (let i = 1; i <= 5; i++) {
        html += `<span class="star ${i <= rating ? 'active' : ''}" data-rating="${i}">★</span>`;
    }
    html += '</div>';
    return html;
}

window.platformStats = platformStats;
window.categories = categories;
window.globalDemoMerchants = globalDemoMerchants;
window.demoMerchants = demoMerchants;
window.featuredSaudiMerchants = featuredSaudiMerchants;
window.merchantReviews = merchantReviews;
