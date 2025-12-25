/* ============================================
   SAWYAN BANK - Demo Data
   ============================================ */

const platformStats = {
    totalMembers: 12547,
    totalMerchants: 856,
    totalTransactions: 98432,
    totalCashback: 2547890
};

const categories = [
    { id: 1, name: 'مطاعم وكافيهات', slug: 'restaurants', icon: '🍽️', count: 234 },
    { id: 2, name: 'سوبرماركت', slug: 'supermarket', icon: '🛒', count: 156 },
    { id: 3, name: 'ملابس وأزياء', slug: 'fashion', icon: '👗', count: 189 },
    { id: 4, name: 'إلكترونيات', slug: 'electronics', icon: '📱', count: 78 },
    { id: 5, name: 'صحة وجمال', slug: 'health-beauty', icon: '💄', count: 145 },
    { id: 6, name: 'خدمات', slug: 'services', icon: '🔧', count: 98 },
    { id: 7, name: 'تعليم', slug: 'education', icon: '📚', count: 67 },
    { id: 8, name: 'ترفيه', slug: 'entertainment', icon: '🎮', count: 89 }
];

// ============================================
// التجار السعوديون المميزون - Featured Saudi Merchants
// ============================================
// هؤلاء التجار الأربعة هم التجار المعتمدين الرئيسيين
// يظهرون في الصفحة الرئيسية ويمكن إجراء معاملات عليهم
// ============================================

const featuredSaudiMerchants = [
    {
        id: 'F001',
        code: 'SAWYAN-F001',
        businessName: 'بوتيك الأناقة',
        category: 'ملابس وأزياء',
        categorySlug: 'fashion',
        cashbackRate: 30,
        rating: 4.9,
        reviewsCount: 287,
        transactionsCount: 1456,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        description: 'أرقى الأزياء النسائية والرجالية من أشهر الماركات العالمية',
        city: 'الرياض',
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
        cashbackRate: 20,
        rating: 4.8,
        reviewsCount: 523,
        transactionsCount: 2341,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        description: 'تجربة طعام استثنائية تجمع بين الأصالة العربية والإبداع العصري',
        city: 'جدة',
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
        cashbackRate: 12,
        rating: 4.7,
        reviewsCount: 892,
        transactionsCount: 5672,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        description: 'سوبر ماركت متكامل يوفر جميع احتياجاتك اليومية بأسعار تنافسية',
        city: 'الدمام',
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
        cashbackRate: 15,
        rating: 4.8,
        reviewsCount: 412,
        transactionsCount: 1890,
        isVerified: true,
        isPremium: true,
        isFeatured: true,
        description: 'قهوة مختصة من أجود أنواع البن مع أجواء سعودية أصيلة',
        city: 'الرياض',
        image: 'assets/merchants/cafe_albayader.png',
        ownerName: 'سارة الخالدي',
        phone: '+966512345004'
    }
];

// التجار الإضافيين للعرض في صفحة كل التجار
const demoMerchants = [
    // التجار المميزون أولاً
    ...featuredSaudiMerchants,
    // باقي التجار
    {
        id: 'M005', code: 'SAWYAN-M005', businessName: 'صالون ليالي',
        category: 'صحة وجمال', categorySlug: 'health-beauty',
        cashbackRate: 12, rating: 4.7, reviewsCount: 412,
        transactionsCount: 2156, isVerified: true, isPremium: false,
        description: 'خدمات تجميل وعناية فاخرة'
    },
    {
        id: 'M006', code: 'SAWYAN-M006', businessName: 'تك لاند',
        category: 'إلكترونيات', categorySlug: 'electronics',
        cashbackRate: 8, rating: 4.6, reviewsCount: 278,
        transactionsCount: 1234, isVerified: true, isPremium: false,
        description: 'أحدث الأجهزة الإلكترونية'
    },
    {
        id: 'M007', code: 'SAWYAN-M007', businessName: 'بيكيز للمخبوزات',
        category: 'مطاعم وكافيهات', categorySlug: 'restaurants',
        cashbackRate: 6, rating: 4.8, reviewsCount: 234,
        transactionsCount: 1678, isVerified: true, isPremium: false,
        description: 'أشهى المخبوزات الطازجة يومياً'
    },
    {
        id: 'M008', code: 'SAWYAN-M008', businessName: 'مركز التعلم الذكي',
        category: 'تعليم', categorySlug: 'education',
        cashbackRate: 20, rating: 4.9, reviewsCount: 156,
        transactionsCount: 534, isVerified: true, isPremium: true,
        image: null,
        description: 'دورات تدريبية احترافية'
    }
];

// نظام التقييمات والملاحظات الكتابية للأعضاء على التجار
const merchantReviews = {
    // تقييمات بوتيك الأناقة
    'F001': [
        {
            id: 'RF001-1',
            memberId: 'MEM001',
            memberName: 'نورة العتيبي',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'تشكيلة رائعة من الملابس والماركات العالمية! 30% كاشباك قيمة استثنائية. أنصح الجميع بالتسوق هنا.',
            date: '2024-12-22',
            helpful: 45,
            verified: true
        },
        {
            id: 'RF001-2',
            memberId: 'MEM002',
            memberName: 'مريم القحطاني',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'جودة عالية وخدمة ممتازة. الموظفات محترفات جداً والأسعار مناسبة مع نسبة الكاشباك.',
            date: '2024-12-20',
            helpful: 32,
            verified: true
        }
    ],
    // تقييمات مطعم الديوان
    'F002': [
        {
            id: 'RF002-1',
            memberId: 'MEM003',
            memberName: 'خالد الحربي',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'أفضل مطعم زرته في جدة! الطعام لذيذ جداً والخدمة سريعة. 20% كاشباك يجعلها صفقة ممتازة.',
            date: '2024-12-21',
            helpful: 58,
            verified: true
        },
        {
            id: 'RF002-2',
            memberId: 'MEM004',
            memberName: 'سارة الزهراني',
            memberLevel: 'فضي',
            rating: 4,
            comment: 'أكل شهي وأجواء راقية. الانتظار كان طويل شوي لكن يستحق.',
            date: '2024-12-19',
            helpful: 28,
            verified: true
        }
    ],
    // تقييمات سوبر ماركت النخبة
    'F003': [
        {
            id: 'RF003-1',
            memberId: 'MEM005',
            memberName: 'عبدالرحمن المالكي',
            memberLevel: 'برونزي',
            rating: 5,
            comment: 'منتجات طازجة وأسعار ممتازة! أتسوق هنا أسبوعياً والكاشباك يتراكم بشكل رائع.',
            date: '2024-12-22',
            helpful: 41,
            verified: true
        },
        {
            id: 'RF003-2',
            memberId: 'MEM006',
            memberName: 'فاطمة الدوسري',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'سوبرماركت شامل ومنظم. العروض اليومية مع الكاشباك توفير كبير للعائلة.',
            date: '2024-12-18',
            helpful: 35,
            verified: true
        }
    ],
    // تقييمات كافيه البيادر
    'F004': [
        {
            id: 'RF004-1',
            memberId: 'MEM007',
            memberName: 'محمد الشمري',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'أفضل قهوة مختصة في الرياض! الأجواء مريحة جداً للعمل والاجتماعات. أحب المكان.',
            date: '2024-12-21',
            helpful: 52,
            verified: true
        },
        {
            id: 'RF004-2',
            memberId: 'MEM008',
            memberName: 'هند الراشد',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'كافيه راقي وهادي. القهوة ممتازة والحلويات لذيذة. 15% كاشباك إضافة رائعة!',
            date: '2024-12-20',
            helpful: 38,
            verified: true
        }
    ],
    'M001': [
        {
            id: 'R001',
            memberId: 'MEM001',
            memberName: 'أحمد محمد',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'خدمة ممتازة وطعام لذيذ! الكاشباك يصل فوراً للمحفظة. أنصح الجميع بهذا المطعم.',
            date: '2024-12-20',
            helpful: 24,
            verified: true
        },
        {
            id: 'R002',
            memberId: 'MEM002',
            memberName: 'سارة أحمد',
            memberLevel: 'فضي',
            rating: 4,
            comment: 'الأكل ممتاز لكن الانتظار كان طويل شوي. عموماً تجربة جيدة.',
            date: '2024-12-18',
            helpful: 15,
            verified: true
        },
        {
            id: 'R003',
            memberId: 'MEM003',
            memberName: 'خالد العمري',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'من أفضل المطاعم اللي تعاملت معها. نسبة الكاشباك عالية جداً 10%!',
            date: '2024-12-15',
            helpful: 32,
            verified: true
        }
    ],
    'M002': [
        {
            id: 'R004',
            memberId: 'MEM004',
            memberName: 'فاطمة الزهراني',
            memberLevel: 'برونزي',
            rating: 5,
            comment: 'أسعار ممتازة ومنتجات طازجة. الكاشباك إضافة رائعة!',
            date: '2024-12-19',
            helpful: 18,
            verified: true
        },
        {
            id: 'R005',
            memberId: 'MEM005',
            memberName: 'عبدالله الشمري',
            memberLevel: 'فضي',
            rating: 4,
            comment: 'سوبرماركت جيد وأسعاره مناسبة. توفير جيد مع نظام الكاشباك.',
            date: '2024-12-17',
            helpful: 12,
            verified: true
        }
    ],
    'M003': [
        {
            id: 'R006',
            memberId: 'MEM006',
            memberName: 'نورة السالم',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'أزياء راقية وجودة عالية! 15% كاشباك يستحق. سأعود مرة أخرى بالتأكيد.',
            date: '2024-12-21',
            helpful: 28,
            verified: true
        },
        {
            id: 'R007',
            memberId: 'MEM007',
            memberName: 'مريم القحطاني',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'تشكيلة رائعة من الملابس والموظفين ودودين جداً.',
            date: '2024-12-14',
            helpful: 21,
            verified: true
        }
    ],
    'M004': [
        {
            id: 'R008',
            memberId: 'MEM008',
            memberName: 'محمد العتيبي',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'أحدث الأجهزة وأسعار منافسة. استفدت من الكاشباك في شراء جوالي الجديد!',
            date: '2024-12-20',
            helpful: 35,
            verified: true
        },
        {
            id: 'R009',
            memberId: 'MEM009',
            memberName: 'عبدالرحمن المالكي',
            memberLevel: 'برونزي',
            rating: 4,
            comment: 'خدمة جيدة ومنتجات أصلية. ضمان ممتد على المنتجات.',
            date: '2024-12-16',
            helpful: 19,
            verified: true
        }
    ],
    'M005': [
        {
            id: 'R010',
            memberId: 'MEM010',
            memberName: 'هند الدوسري',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'صالون رائع! الخدمة احترافية والنتيجة مذهلة. شكراً على الكاشباك!',
            date: '2024-12-19',
            helpful: 27,
            verified: true
        }
    ],
    'M006': [
        {
            id: 'R011',
            memberId: 'MEM011',
            memberName: 'سلطان الحربي',
            memberLevel: 'ذهبي',
            rating: 4,
            comment: 'قهوة ممتازة وأجواء هادئة. مكان مثالي للعمل أو الاسترخاء.',
            date: '2024-12-18',
            helpful: 22,
            verified: true
        }
    ],
    'M007': [
        {
            id: 'R012',
            memberId: 'MEM012',
            memberName: 'لمياء الغامدي',
            memberLevel: 'برونزي',
            rating: 5,
            comment: 'مخبوزات طازجة ولذيذة كل يوم! أفضل كرواسون في المنطقة.',
            date: '2024-12-17',
            helpful: 16,
            verified: true
        }
    ],
    'M008': [
        {
            id: 'R013',
            memberId: 'MEM013',
            memberName: 'يوسف الراشد',
            memberLevel: 'ذهبي',
            rating: 5,
            comment: 'دورات تدريبية ممتازة ومحتوى قيم. 20% كاشباك يجعلها أفضل قيمة!',
            date: '2024-12-21',
            helpful: 41,
            verified: true
        },
        {
            id: 'R014',
            memberId: 'MEM014',
            memberName: 'ريم الخالدي',
            memberLevel: 'فضي',
            rating: 5,
            comment: 'تجربة تعليمية رائعة. المدربين محترفين والمحتوى مفيد جداً.',
            date: '2024-12-15',
            helpful: 33,
            verified: true
        }
    ]
};

// دالة للحصول على تقييمات تاجر معين
function getMerchantReviews(merchantId) {
    return merchantReviews[merchantId] || [];
}

// دالة لحساب متوسط التقييم
function calculateAverageRating(merchantId) {
    const reviews = getMerchantReviews(merchantId);
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, review) => acc + review.rating, 0);
    return (sum / reviews.length).toFixed(1);
}

// دالة لتنسيق التاريخ
function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('ar-SA', options);
}

// دالة لـ badge مستوى العضو
function getMemberLevelBadge(level) {
    const badges = {
        'ذهبي': { icon: '🏆', color: '#fbbf24' },
        'فضي': { icon: '🥈', color: '#94a3b8' },
        'برونزي': { icon: '🥉', color: '#cd7f32' }
    };
    return badges[level] || badges['برونزي'];
}

// توحيد تنسيق الأرقام - استخدام الأرقام الغربية للاتساق
function formatNumber(num) {
    // استخدام الأرقام الغربية (1,234) بدلاً من الهندية (١٬٢٣٤)
    return new Intl.NumberFormat('en-US').format(num);
}

function formatCurrency(amount) {
    // تنسيق العملة بالأرقام الغربية
    return amount.toLocaleString('en-US') + ' ر.س';
}

// تحويل الأرقام الكبيرة لصيغة مختصرة عربية
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
    let stars = '★'.repeat(full) + '☆'.repeat(5 - full);
    return stars;
}

function generateStarsInteractive(rating = 0) {
    let html = '<div class="stars-interactive">';
    for (let i = 1; i <= 5; i++) {
        html += `<span class="star ${i <= rating ? 'active' : ''}" data-rating="${i}">★</span>`;
    }
    html += '</div>';
    return html;
}
