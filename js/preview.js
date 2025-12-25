/* ============================================
   SAWYAN BANK - Preview Main JS
   ============================================ */

document.addEventListener('DOMContentLoaded', function () {
    // Initialize
    initNavbar();
    loadFeaturedMerchants();
    animateStats();
});

// Navbar scroll effect
function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;

    window.addEventListener('scroll', function () {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

// Load featured merchants (من التجار السعوديين المميزين أولاً ثم من قاعدة البيانات)
// Load featured merchants
async function loadFeaturedMerchants() {
    console.log('Starting loadFeaturedMerchants...');
    const container = document.getElementById('featured-merchants');
    if (!container) {
        console.error('Container #featured-merchants not found!');
        return;
    }

    let merchants = [];

    // 1. Try Global Variable (Saudi Merchants)
    if (typeof featuredSaudiMerchants !== 'undefined' && Array.isArray(featuredSaudiMerchants)) {
        console.log('Found featuredSaudiMerchants:', featuredSaudiMerchants.length);
        merchants = featuredSaudiMerchants.slice(0, 4);
    } else {
        console.warn('featuredSaudiMerchants is undefined or not an array');
    }

    // 2. Try Supabase (if global var empty)
    if (merchants.length === 0) {
        try {
            if (window.SAWYAN && window.SAWYAN.supabase) {
                console.log('Fetching from Supabase...');
                const { data, error } = await window.SAWYAN.supabase
                    .from('merchants')
                    .select('*')
                    .eq('is_active', true)
                    .eq('is_verified', true)
                    .order('commission_percentage', { ascending: false })
                    .limit(4);

                if (data && data.length > 0) {
                    merchants = data.map(transformMerchantData);
                }
            }
        } catch (err) {
            console.error('Supabase fetch failed:', err);
        }
    }

    // 3. Fallback to Demo Data
    if (merchants.length === 0 && typeof demoMerchants !== 'undefined') {
        console.log('Using demoMerchants fallback');
        merchants = demoMerchants.slice(0, 4);
    }

    console.log('Final merchants to render:', merchants.length);

    if (merchants.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
                <p>جاري تحميل قائمة التجار...</p>
            </div>`;
        return;
    }

    container.innerHTML = merchants.map(merchant => `
        <div class="merchant-card featured-merchant" onclick="window.location.href='public/merchants.html#${merchant.code}'">
            <div class="merchant-image-container">
               ${merchant.image ?
            `<img src="${merchant.image}" alt="${merchant.businessName}" class="merchant-hero-img" 
                        onerror="this.onerror=null; this.parentElement.classList.add('fallback-bg'); this.style.display='none';">`
            : ''}
               <div class="merchant-overlay ${!merchant.image ? 'fallback-bg' : ''}" style="${!merchant.image ? 'background: ' + getGradientForCategory(merchant.categorySlug) : ''}">
                    <div class="merchant-overlay-content">
                        <span class="merchant-icon-floating">${getCategoryIcon(merchant.categorySlug)}</span>
                        <span class="merchant-cashback-small">${formatArabicNumber(merchant.cashbackRate)}% نقاط</span>
                    </div>
               </div>
            </div>
            
            <div class="merchant-info">
                <div class="merchant-header-row">
                    <h3 class="merchant-name">
                        ${merchant.businessName}
                        ${merchant.isVerified ? '<span class="verified-icon" title="موثق">✓</span>' : ''}
                    </h3>
                    <div class="merchant-rating-compact">
                        <span>★</span> ${formatArabicNumber(merchant.rating)}
                    </div>
                </div>
                
                <p class="merchant-desc-short">${merchant.description ? merchant.description.substring(0, 60) + '...' : ''}</p>
                
                <div class="merchant-footer-row">
                    <span class="merchant-category-tag">${merchant.category}</span>
                    <span class="city-tag">📍 ${merchant.city}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function transformMerchantData(m) {
    return {
        id: m.id,
        code: m.merchant_code,
        businessName: m.business_name,
        category: m.business_category || 'خدمات',
        categorySlug: getCategorySlugFromName(m.business_category),
        cashbackRate: m.commission_percentage || 5,
        rating: 4.5,
        reviewsCount: 0,
        transactionsCount: 0,
        isVerified: m.is_verified || false,
        isPremium: true,
        isFeatured: true,
        description: m.business_description || '',
        city: m.city || '',
        image: m.logo_url || null
    };
}

// تحويل اسم التصنيف إلى slug
function getCategorySlugFromName(category) {
    if (!category) return 'services';
    const slugMap = {
        'مطاعم': 'restaurants',
        'مطاعم وكافيهات': 'restaurants',
        'سوبرماركت': 'supermarket',
        'ملابس': 'fashion',
        'ملابس وأزياء': 'fashion',
        'إلكترونيات': 'electronics',
        'صحة': 'health-beauty',
        'صحة وجمال': 'health-beauty',
        'عطور': 'health-beauty',
        'خدمات': 'services',
        'تعليم': 'education',
        'ترفيه': 'entertainment'
    };
    return slugMap[category] || 'services';
}

// Get gradient for category
function getGradientForCategory(slug) {
    const gradients = {
        'restaurants': 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
        'supermarket': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        'fashion': 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
        'electronics': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        'health-beauty': 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
        'services': 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
        'education': 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
        'entertainment': 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)'
    };
    return gradients[slug] || gradients['services'];
}

// Get icon for category
function getCategoryIcon(slug) {
    const icons = {
        'restaurants': '🍽️',
        'supermarket': '🛒',
        'fashion': '👗',
        'electronics': '📱',
        'health-beauty': '💄',
        'services': '🔧',
        'education': '📚',
        'entertainment': '🎮'
    };
    return icons[slug] || '🏪';
}

// Format number to English numerals
function formatArabicNumber(num) {
    return num.toLocaleString('en-US');
}

// Animate stats counter
function animateStats() {
    const stats = document.querySelectorAll('.stat-number, .stat-value');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const text = el.textContent;
                const num = parseFloat(text.replace(/[^0-9.]/g, ''));
                const suffix = text.replace(/[0-9.,]/g, '');

                if (!isNaN(num)) {
                    animateNumber(el, 0, num, 2000, suffix);
                }
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    stats.forEach(stat => observer.observe(stat));
}

// تنسيق الأرقام بالأرقام الغربية مع فواصل
function formatNumber(num) {
    return new Intl.NumberFormat('en-US').format(num);
}

// تنسيق الأرقام الكبيرة بصيغة عربية مختصرة
function formatLargeNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + ' مليون';
    } else if (num >= 100000) {
        return Math.floor(num / 1000) + ' ألف';
    }
    return formatNumber(Math.floor(num));
}

function animateNumber(el, start, end, duration, suffix) {
    const startTime = performance.now();
    const isMillion = suffix.includes('مليون');
    const isAlf = suffix.includes('ألف');

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = start + (end - start) * easeOut;

        if (isMillion) {
            // للأرقام بالملايين
            el.textContent = current.toFixed(1) + ' مليون';
        } else if (isAlf) {
            // للأرقام بالآلاف
            el.textContent = Math.floor(current) + ' ألف';
        } else if (end >= 1000) {
            el.textContent = formatNumber(Math.floor(current)) + suffix;
        } else {
            el.textContent = current.toFixed(1) + suffix;
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});
