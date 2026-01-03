/* ============================================
   Merchants Page JS
   ============================================ */

let currentCategory = 'all';
let currentSearch = '';
let currentSort = 'cashback';
let realMerchants = []; // التجار الحقيقيين من قاعدة البيانات

document.addEventListener('DOMContentLoaded', async function () {
    initNavbar();

    // جلب التجار الحقيقيين من Supabase
    await loadRealMerchants();

    loadCategories();
    loadMerchants();
    initFilters();
    initModal();
});

// جلب التجار الحقيقيين من Supabase
async function loadRealMerchants() {
    try {
        // التحقق من وجود Supabase
        if (!window.SAWYAN || !window.SAWYAN.supabase) {
            console.log('Supabase not available, using demo data');
            return;
        }

        const { data, error } = await window.SAWYAN.supabase
            .from('merchants')
            .select('*')
            .eq('is_active', true);

        if (error) {
            console.error('Error loading merchants:', error);
            return;
        }

        if (data && data.length > 0) {
            // تحويل البيانات للصيغة المطلوبة
            realMerchants = data.map(m => ({
                id: m.id,
                code: m.merchant_code,
                businessName: m.business_name,
                category: m.business_category || 'خدمات',
                categorySlug: getCategorySlug(m.business_category),
                cashbackRate: m.commission_percentage || 5,
                rating: 4.5,
                reviewsCount: 0,
                transactionsCount: 0,
                isVerified: m.is_verified || false,
                isPremium: false,
                description: m.business_description || 'تاجر معتمد في SAWYAN BANK',
                image: m.logo_url || null // إضافة حقل الصورة
            }));

            console.log(`Loaded ${realMerchants.length} real merchants`);
        }
    } catch (err) {
        console.error('Failed to load merchants:', err);
    }
}

// تحويل اسم التصنيف إلى slug
function getCategorySlug(category) {
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

// الحصول على كل التجار (حقيقيين + تجريبيين)
function getAllMerchants() {
    // إذا وجد تجار حقيقيين، ندمجهم مع التجريبيين (مع منع التكرار)
    if (realMerchants.length > 0) {
        const realCodes = new Set(realMerchants.map(m => m.code));
        const uniqueDemo = demoMerchants.filter(m => !realCodes.has(m.code));
        return [...realMerchants, ...uniqueDemo];
    }
    return demoMerchants;
}

function initNavbar() {
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', function () {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });
}

function loadCategories() {
    // Category select
    const categorySelect = document.getElementById('category-filter');
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat.slug;
        option.textContent = `${cat.icon} ${cat.name}`;
        categorySelect.appendChild(option);
    });

    // Category pills
    const pillsContainer = document.getElementById('categories-pills');
    const allMerchants = getAllMerchants();
    let pillsHTML = `<button class="category-pill active" data-category="all">
        الكل <span class="pill-count">${allMerchants.length}</span>
    </button>`;

    categories.forEach(cat => {
        const count = allMerchants.filter(m => m.categorySlug === cat.slug).length;
        if (count > 0) {
            pillsHTML += `<button class="category-pill" data-category="${cat.slug}">
                ${cat.icon} ${cat.name} <span class="pill-count">${count}</span>
            </button>`;
        }
    });

    pillsContainer.innerHTML = pillsHTML;

    // Add click handlers
    pillsContainer.querySelectorAll('.category-pill').forEach(pill => {
        pill.addEventListener('click', function () {
            pillsContainer.querySelectorAll('.category-pill').forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            loadMerchants();
        });
    });
}

// دالة مساعدة لتصحيح مسار الصورة
function resolveImagePath(path) {
    if (!path) return null;
    if (path.startsWith('http') || path.startsWith('data:')) return path;
    // نحن في public/merchants.html، لذا نحتاج للرجوع خطوة للوراء للوصول لـ assets
    return '../' + path;
}

function loadMerchants() {
    let filtered = [...getAllMerchants()];

    // Filter by category
    if (currentCategory !== 'all') {
        filtered = filtered.filter(m => m.categorySlug === currentCategory);
    }

    // Filter by search
    if (currentSearch) {
        const query = currentSearch.toLowerCase();
        filtered = filtered.filter(m =>
            m.businessName.toLowerCase().includes(query) ||
            m.category.toLowerCase().includes(query)
        );
    }

    // Sort
    switch (currentSort) {
        case 'cashback':
            filtered.sort((a, b) => b.cashbackRate - a.cashbackRate);
            break;
        case 'rating':
            filtered.sort((a, b) => b.rating - a.rating);
            break;
        case 'transactions':
            filtered.sort((a, b) => b.transactionsCount - a.transactionsCount);
            break;
    }

    // Update count
    document.getElementById('merchants-count').textContent = filtered.length;

    // Render
    const grid = document.getElementById('merchants-grid');
    const emptyState = document.getElementById('empty-state');

    if (filtered.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = filtered.map(merchant => {
        const imagePath = resolveImagePath(merchant.image);
        return `
        <div class="merchant-card" onclick="openMerchantModal('${merchant.id}')">
            <div class="merchant-image" style="background: ${getGradientForCategory(merchant.categorySlug)}">
               ${imagePath ?
                `<img src="${imagePath}" alt="${merchant.businessName}" style="width: 100%; height: 100%; object-fit: cover;" 
                  onerror="this.style.display='none'; this.parentElement.querySelector('.merchant-icon-fallback').style.display='block';">
                 <span class="merchant-icon-fallback" style="display: none;">${getCategoryIcon(merchant.categorySlug)}</span>`
                : getCategoryIcon(merchant.categorySlug)
            }
                ${merchant.isPremium ? '<span class="merchant-badge">⭐ مميز</span>' : ''}
                <span class="merchant-cashback-small">${merchant.cashbackRate}% نقاط</span>
            </div>
            <div class="merchant-info">
                <h3 class="merchant-name">${merchant.businessName}</h3>
                <div class="merchant-category">${merchant.category}</div>
                <div class="merchant-rating">
                    <span class="stars">${generateStars(merchant.rating)}</span>
                    <span class="rating-value">${merchant.rating}</span>
                    <span class="rating-count">(${merchant.reviewsCount})</span>
                </div>
                ${merchant.isVerified ? '<div class="merchant-verified">✓ تاجر موثق</div>' : ''}
                <div class="merchant-footer">
                    <span class="merchant-transactions">${formatNumber(merchant.transactionsCount)} عملية</span>
                </div>
            </div>
        </div>
    `}).join('');
}

function initFilters() {
    // Search
    const searchInput = document.getElementById('search-input');
    let searchTimeout;
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearch = this.value;
            loadMerchants();
        }, 300);
    });

    // Category select
    document.getElementById('category-filter').addEventListener('change', function () {
        currentCategory = this.value;
        // Update pills
        document.querySelectorAll('.category-pill').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.category === currentCategory);
        });
        loadMerchants();
    });

    // Sort
    document.getElementById('sort-filter').addEventListener('change', function () {
        currentSort = this.value;
        loadMerchants();
    });
}

function initModal() {
    const modal = document.getElementById('merchant-modal');
    const closeBtn = document.getElementById('modal-close');

    closeBtn.addEventListener('click', closeMerchantModal);
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            closeMerchantModal();
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeMerchantModal();
        }
    });
}

function openMerchantModal(merchantId) {
    const merchant = getAllMerchants().find(m => m.id === merchantId);
    if (!merchant) return;

    const modal = document.getElementById('merchant-modal');
    const body = document.getElementById('modal-body');
    const reviews = getMerchantReviews(merchantId);
    const imagePath = resolveImagePath(merchant.image);

    // بناء قسم التقييمات
    let reviewsHTML = '';
    if (reviews.length > 0) {
        const avgRating = calculateAverageRating(merchantId);
        reviewsHTML = `
            <div class="reviews-section">
                <div class="reviews-header">
                    <h3>💬 تقييمات الأعضاء</h3>
                    <div class="reviews-summary">
                        <div class="reviews-avg">
                            <span class="avg-number">${avgRating}</span>
                            <span class="avg-stars">${generateStars(parseFloat(avgRating))}</span>
                        </div>
                        <span class="reviews-count">(${reviews.length} تقييم)</span>
                    </div>
                </div>
                <div class="reviews-list">
                    ${reviews.map(review => {
            const levelBadge = getMemberLevelBadge(review.memberLevel);
            const levelClass = review.memberLevel === 'ذهبي' ? 'gold' :
                review.memberLevel === 'فضي' ? 'silver' : 'bronze';
            const initials = review.memberName.split(' ').map(n => n[0]).join('').substring(0, 2);

            return `
                            <div class="review-card">
                                <div class="review-header">
                                    <div class="review-author">
                                        <div class="author-avatar">${initials}</div>
                                        <div class="author-info">
                                            <span class="author-name">
                                                ${review.memberName}
                                                ${review.verified ? '<span class="verified-badge" title="مشتري موثق">✓</span>' : ''}
                                            </span>
                                            <span class="author-level ${levelClass}">
                                                ${levelBadge.icon} عضو ${review.memberLevel}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="review-rating">
                                        <span class="review-stars">${generateStars(review.rating)}</span>
                                        <span class="review-date">${formatDate(review.date)}</span>
                                    </div>
                                </div>
                                <p class="review-content">${review.comment}</p>
                                <div class="review-footer">
                                    <span class="review-helpful" onclick="markHelpful('${review.id}')">
                                        👍 مفيد <span class="helpful-count">(${review.helpful})</span>
                                    </span>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
                <button class="add-review-btn" onclick="showAddReviewForm('${merchantId}')">
                    ✍️ أضف تقييمك
                </button>
                <div id="review-form-container"></div>
            </div>
        `;
    } else {
        reviewsHTML = `
            <div class="reviews-section">
                <div class="reviews-header">
                    <h3>💬 تقييمات الأعضاء</h3>
                </div>
                <div class="no-reviews">
                    <div class="no-reviews-icon">📝</div>
                    <p>لا توجد تقييمات بعد. كن أول من يقيّم هذا التاجر!</p>
                </div>
                <button class="add-review-btn" onclick="showAddReviewForm('${merchantId}')" style="margin-top: var(--spacing-lg);">
                    ✍️ أضف تقييمك
                </button>
                <div id="review-form-container"></div>
            </div>
        `;
    }

    body.innerHTML = `
        <div class="merchant-modal-header" style="background: ${getGradientForCategory(merchant.categorySlug)}; position: relative; overflow: hidden;">
            ${imagePath ?
            `<img src="${imagePath}" alt="${merchant.businessName}" style="width: 100%; height: 100%; object-fit: cover; opacity: 1;" 
                  onerror="this.style.display='none'; this.parentElement.querySelector('.modal-icon-fallback').style.display='block';">
             <div class="modal-icon-fallback" style="display: none; font-size: 5rem;">${getCategoryIcon(merchant.categorySlug)}</div>`
            : `<div style="font-size: 5rem;">${getCategoryIcon(merchant.categorySlug)}</div>`
        }
            ${merchant.isPremium ? '<span class="merchant-modal-badge">⭐ تاجر مميز</span>' : ''}
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 60px; background: linear-gradient(to top, rgba(255,255,255,1), transparent);"></div>
        </div>
        <div class="merchant-modal-body">
            <h2 class="merchant-modal-name">${merchant.businessName}</h2>
            <div class="merchant-modal-category">${merchant.category}</div>
            <p class="merchant-modal-desc">${merchant.description}</p>
            
            <div class="merchant-modal-stats">
                <div class="modal-stat">
                    <div class="modal-stat-value cashback">${merchant.cashbackRate}%</div>
                    <div class="modal-stat-label">نسبة الكاشباك</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-value">${merchant.rating}</div>
                    <div class="modal-stat-label">التقييم</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-value">${formatNumber(merchant.transactionsCount)}</div>
                    <div class="modal-stat-label">عملية</div>
                </div>
            </div>
            
            ${reviewsHTML}
            
            <div class="merchant-modal-actions" style="margin-top: var(--spacing-xl);">
                <a href="../member-dashboard/register.html" class="btn btn-primary">
                    سجّل للحصول على الكاشباك
                </a>
                <button class="btn btn-secondary" onclick="closeMerchantModal()">
                    إغلاق
                </button>
            </div>
        </div>
    `;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// دالة لإظهار نموذج إضافة تقييم
function showAddReviewForm(merchantId) {
    const container = document.getElementById('review-form-container');
    container.innerHTML = `
        <div class="review-form">
            <h4 class="review-form-title">✍️ أضف تقييمك</h4>
            <div class="form-group">
                <label>تقييمك بالنجوم</label>
                ${generateStarsInteractive(0)}
            </div>
            <div class="form-group">
                <label>تعليقك</label>
                <textarea id="review-comment" placeholder="شاركنا تجربتك مع هذا التاجر..."></textarea>
            </div>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="hideReviewForm()">إلغاء</button>
                <button class="btn btn-primary" onclick="submitReview('${merchantId}')">إرسال التقييم</button>
            </div>
        </div>
    `;

    // إضافة تفاعل النجوم
    const stars = container.querySelectorAll('.stars-interactive .star');
    stars.forEach(star => {
        star.addEventListener('click', function () {
            const rating = parseInt(this.dataset.rating);
            stars.forEach((s, i) => {
                s.classList.toggle('active', i < rating);
            });
        });
    });

    container.scrollIntoView({ behavior: 'smooth' });
}

// دالة لإخفاء نموذج التقييم
function hideReviewForm() {
    document.getElementById('review-form-container').innerHTML = '';
}

// دالة لإرسال التقييم (تجريبي)
function submitReview(merchantId) {
    const comment = document.getElementById('review-comment').value;
    const activeStars = document.querySelectorAll('.stars-interactive .star.active').length;

    if (activeStars === 0) {
        alert('الرجاء اختيار تقييم بالنجوم');
        return;
    }
    if (!comment.trim()) {
        alert('الرجاء كتابة تعليق');
        return;
    }

    // في الوضع التجريبي، نعرض رسالة نجاح فقط
    alert('✅ شكراً! تم استلام تقييمك بنجاح.\n\n(هذا عرض تجريبي - سجّل للمشاركة الفعلية)');
    hideReviewForm();
}

// دالة لتحديد التقييم كمفيد
function markHelpful(reviewId) {
    // في الوضع التجريبي، نعرض رسالة فقط
    alert('👍 شكراً! تم تسجيل أن هذا التقييم مفيد.\n\n(سجّل للمشاركة الفعلية)');
}

function closeMerchantModal() {
    document.getElementById('merchant-modal').classList.remove('active');
    document.body.style.overflow = '';
}

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
