/* =====================================================================
   SAWYAN Public Portal Interactive Logic (Tri-Mode Geo-Portal)
   ===================================================================== */

(function () {
    'use strict';

    let currentGeo = { country: 'EG', city: 'cairo', source: 'default' };
    let modalDraftGeo = { country: 'EG', city: 'cairo' };
    let explorerState = {
        storeType: 'all',
        category: 'all',
        searchQuery: ''
    };
    let livePortalMerchants = null;
    let liveActiveFlashOffers = [];
    let liveFlashOffersByMerchant = new Map();

    function formatOfferRemainingAr(sec) {
        const s = Math.max(0, Number(sec || 0));
        if (s < 3600) return `${Math.max(1, Math.round(s / 60))} دقيقة`;
        const hrs = Math.floor(s / 3600);
        if (hrs < 24) return `${hrs} ساعة`;
        const days = Math.floor(hrs / 24);
        const remH = hrs % 24;
        return remH > 0 ? `${days} يوم و${remH} س` : `${days} يوم`;
    }

    function isProdEnvironment() {
        return Boolean(window.SAWYAN && window.SAWYAN.API && !window.SAWYAN.API.isDemoMode());
    }

    async function loadLiveMerchantsForPortal() {
        if (!(window.SAWYAN && window.SAWYAN.API && window.SAWYAN.supabase)) return;
        try {
            const [rows, offers] = await Promise.all([
                window.SAWYAN.API.getPublicMerchantsCatalog({}),
                typeof window.SAWYAN.API.getPublicActiveFlashOffers === 'function'
                    ? window.SAWYAN.API.getPublicActiveFlashOffers({}).catch(function () { return []; })
                    : Promise.resolve([])
            ]);

            liveActiveFlashOffers = Array.isArray(offers) ? offers : [];
            liveFlashOffersByMerchant = new Map();
            liveActiveFlashOffers.forEach(function (of) {
                if (of && of.merchant_id && !liveFlashOffersByMerchant.has(String(of.merchant_id))) {
                    liveFlashOffersByMerchant.set(String(of.merchant_id), of);
                }
            });

            if (Array.isArray(rows)) {
                livePortalMerchants = rows.map(function (r) {
                    const cCode = String(r.country_code || 'EG').toUpperCase();
                    const cfg = window.SAWYAN_GEO ? window.SAWYAN_GEO.getCountryConfig(cCode) : { name: cCode };
                    const catRaw = r.category || r.category_code || 'services';
                    const activeOffer = liveFlashOffersByMerchant.get(String(r.merchant_id)) || null;
                    return {
                        id: r.merchant_id,
                        branchId: r.branch_id,
                        code: r.merchant_code,
                        businessName: r.business_name,
                        category: catRaw,
                        categorySlug: catRaw,
                        country: cCode,
                        countryName: cfg.name || cCode,
                        cityKey: 'all',
                        city: r.branch_name || '',
                        district: r.address || '',
                        description: r.address || r.branch_name || '',
                        merchantType: r.merchant_type || 'physical',
                        cashbackRate: Number(r.plan_cashback_pct || 0),
                        logoUrl: r.logo_url || null,
                        coverImageUrl: r.cover_image_url || null,
                        images: Array.isArray(r.images) ? r.images : [],
                        image: r.cover_image_url || r.logo_url || null,
                        rating: Number(r.avg_rating || 0),
                        reviewsCount: Number(r.reviews_count || 0),
                        isVerified: true,
                        isFeatured: Boolean(activeOffer) || true,
                        activeOffer: activeOffer
                    };
                });
                renderLiveFlashOffersSpotlight();
                renderFeaturedMerchants();
                const statEl = byId('stat-merchants');
                const bigMerchEl = byId('bigStatMerchants');
                if (isProdEnvironment()) {
                    if (statEl) statEl.textContent = String(livePortalMerchants.length);
                    if (bigMerchEl) bigMerchEl.textContent = String(livePortalMerchants.length);
                }
            }
        } catch (err) {
            console.warn('Live portal catalog fetch warning:', err.message);
            if (isProdEnvironment() && livePortalMerchants === null) {
                livePortalMerchants = [];
                renderLiveFlashOffersSpotlight();
                renderFeaturedMerchants();
            }
        }
    }

    function renderLiveFlashOffersSpotlight() {
        const box = byId('liveFlashOffersSpotlight');
        if (!box) return;
        const allOffers = Array.isArray(liveActiveFlashOffers) ? liveActiveFlashOffers : [];
        if (!allOffers.length) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        const curCc = String(currentGeo.country || 'ALL').toUpperCase();
        const matching = curCc === 'ALL'
            ? allOffers
            : allOffers.filter(function (o) {
                return String(o.country_code || '').toUpperCase() === curCc || o.merchant_type === 'online' || o.merchant_type === 'both';
            });
        const list = matching.length > 0 ? matching : allOffers;

        box.style.display = 'block';
        box.innerHTML = `
            <div style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 45%,#ecfdf5 100%);border:2px solid #f59e0b;border-radius:18px;padding:18px 20px;box-shadow:0 10px 28px rgba(245,158,11,0.16);">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="background:#dc2626;color:#fff;font-size:0.74rem;font-weight:900;padding:3px 10px;border-radius:999px;">🔴 مباشر الآن</span>
                        <h3 style="margin:0;font-size:1.12rem;font-weight:900;color:#0f172a;">🔥 عروض وحملات حصرية نشطة من تجار SAWYAN (${list.length})</h3>
                    </div>
                    <span style="font-size:0.78rem;font-weight:700;color:#92400e;">عروض معتمدة لفترة محدودة</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:12px;">
                    ${list.slice(0, 6).map(function (o) {
                        const flag = (window.SAWYAN && window.SAWYAN.Flags) ? window.SAWYAN.Flags.svg(o.country_code, 16) : escapeHtml(o.country_code || '');
                        const rem = formatOfferRemainingAr(o.remaining_seconds);
                        const href = `public/merchants.html?country=${encodeURIComponent(o.country_code || 'ALL')}&merchant=${encodeURIComponent(o.branch_id ? ('LIVE-' + o.branch_id) : o.merchant_id)}`;
                        return `
                            <div style="background:#ffffff;border:1.5px solid #fcd34d;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;justify-content:space-between;gap:10px;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
                                <div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                                        <strong style="font-size:0.98rem;color:#0f172a;display:inline-flex;align-items:center;gap:6px;">🏪 ${escapeHtml(o.business_name)} ${flag}</strong>
                                        <span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:800;">⏳ متبقي ${escapeHtml(rem)}</span>
                                    </div>
                                    <div style="font-size:0.94rem;font-weight:800;color:#92400e;background:#fffbeb;border-right:3px solid #f59e0b;padding:7px 10px;border-radius:8px;line-height:1.55;">
                                        🔥 ${escapeHtml(o.title)}
                                    </div>
                                    ${o.body && o.body !== o.title ? `<p style="margin:6px 0 0;font-size:0.82rem;color:#475569;line-height:1.5;">${escapeHtml(o.body)}</p>` : ''}
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px dashed #e2e8f0;">
                                    <span style="background:#ecfdf5;color:#047857;font-size:0.76rem;font-weight:800;padding:3px 9px;border-radius:999px;">✨ عائدات فريقك ${Number(o.plan_cashback_pct || 0).toFixed(2)}%</span>
                                    <a href="${href}" class="btn btn-primary btn-sm" style="padding:5px 12px;font-size:0.78rem;text-decoration:none;">عرض المتجر والحملة ↗</a>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    const CATEGORY_ICONS = {
        restaurants: '🍽️',
        supermarket: '🛒',
        pharmacy: '💊',
        fashion: '👗',
        electronics: '📱',
        'health-beauty': '💄',
        services: '🔧',
        education: '📚',
        entertainment: '🎮'
    };

    const SOURCE_LABELS = {
        url: 'من الرابط',
        saved: 'اختيارك المحفوظ',
        geo_ip: 'تعرّف تلقائي IP',
        timezone: 'تعرّف تلقائي بالمنطقة الزمنية',
        default: 'الوضع الافتراضي الذكي',
        user: 'اختيارك الحالي'
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function appendGeoParams(urlString, extraParams) {
        if (!urlString) return '#';
        try {
            const parts = urlString.split('#');
            const baseAndQuery = parts[0];
            const hash = parts[1] ? '#' + parts[1] : '';
            const qIndex = baseAndQuery.indexOf('?');
            const path = qIndex >= 0 ? baseAndQuery.slice(0, qIndex) : baseAndQuery;
            const params = new URLSearchParams(qIndex >= 0 ? baseAndQuery.slice(qIndex + 1) : '');

            params.set('country', currentGeo.country);
            if (currentGeo.city && currentGeo.city !== 'all') {
                params.set('city', currentGeo.city);
            } else {
                params.delete('city');
            }
            if (extraParams) {
                Object.keys(extraParams).forEach(function (k) {
                    if (extraParams[k] !== undefined && extraParams[k] !== null) {
                        params.set(k, extraParams[k]);
                    }
                });
            }
            return path + '?' + params.toString() + hash;
        } catch (e) {
            return urlString;
        }
    }

    function hydrateBrandLogos() {
        if (window.SAWYAN && window.SAWYAN.Logo && typeof window.SAWYAN.Logo.svg === 'function') {
            const navLogo = byId('navBrandLogo');
            const footerLogo = byId('footerBrandLogo');
            if (navLogo) {
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                navLogo.innerHTML = window.SAWYAN.Logo.svg(isDark ? 'light-on-dark' : 'default');
            }
            if (footerLogo) {
                footerLogo.innerHTML = typeof window.SAWYAN.Logo.link === 'function'
                    ? window.SAWYAN.Logo.link('light-on-dark', { href: 'index.html' })
                    : `<a href="index.html" class="logo-link sawyan-home-logo" aria-label="SAWYAN — الصفحة الرئيسية">${window.SAWYAN.Logo.svg('light-on-dark')}</a>`;
            }
        }
    }

    function initThemeToggle() {
        const btn = byId('themeToggleBtn');
        if (!btn) return;
        function syncIcon() {
            const theme = document.documentElement.getAttribute('data-theme') || 'light';
            btn.textContent = theme === 'dark' ? '☀️' : '🌙';
            hydrateBrandLogos();
        }
        syncIcon();
        btn.addEventListener('click', function () {
            const curr = document.documentElement.getAttribute('data-theme') || 'light';
            const next = curr === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            try { localStorage.setItem('sawyan-theme', next); } catch (e) {}
            syncIcon();
        });
    }

    function initMobileMenu() {
        const openBtn = byId('mobileMenuBtn');
        const overlay = byId('mobileMenuOverlay');
        const closeBtn = byId('mobileMenuCloseBtn');
        if (!openBtn || !overlay) return;

        function setOpen(isOpen) {
            overlay.classList.toggle('active', isOpen);
            overlay.style.display = isOpen ? 'block' : '';
            openBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
        }

        openBtn.addEventListener('click', function () { setOpen(true); });
        if (closeBtn) closeBtn.addEventListener('click', function () { setOpen(false); });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) setOpen(false);
        });
        overlay.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () { setOpen(false); });
        });
    }

    let lastCountryFallbackUsed = false;

    function filterMerchantsPool(list, includeCityFilter) {
        return list.filter(function (m) {
            const isGlobalOnline = m.merchantType === 'online' || m.merchantType === 'both';
            if (currentGeo.country !== 'ALL' && m.country !== currentGeo.country && !isGlobalOnline) {
                return false;
            }
            if (includeCityFilter && currentGeo.country !== 'ALL' && !isGlobalOnline && currentGeo.city && currentGeo.city !== 'all') {
                if (m.cityKey && m.cityKey !== 'all' && m.cityKey !== currentGeo.city) return false;
                if (!m.cityKey) return false;
            }
            if (explorerState.storeType !== 'all') {
                if (m.merchantType !== explorerState.storeType && m.merchantType !== 'both') {
                    return false;
                }
            }
            if (explorerState.category !== 'all' && m.categorySlug !== explorerState.category) {
                return false;
            }
            if (explorerState.searchQuery) {
                const cMeta = window.SAWYAN && typeof window.SAWYAN.getCountryByCode === 'function'
                    ? window.SAWYAN.getCountryByCode(m.country) : null;
                const haystack = [
                    m.businessName,
                    m.category,
                    m.countryName,
                    cMeta ? cMeta.nameAr : '',
                    cMeta ? cMeta.nameEn : '',
                    m.country,
                    m.city,
                    m.district,
                    m.description,
                    m.code
                ].join(' ');
                if (window.SAWYAN && window.SAWYAN.SmartSearch && typeof window.SAWYAN.SmartSearch.matchesBilingualQuery === 'function') {
                    if (!window.SAWYAN.SmartSearch.matchesBilingualQuery(haystack, explorerState.searchQuery)) return false;
                } else if (!haystack.toLowerCase().includes(explorerState.searchQuery.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });
    }

    function getMatchingMerchants() {
        let list = [];
        lastCountryFallbackUsed = false;
        if (isProdEnvironment()) {
            list = Array.isArray(livePortalMerchants) ? livePortalMerchants : [];
        } else {
            const demoList = Array.isArray(window.globalDemoMerchants) ? window.globalDemoMerchants : [];
            const liveDemo = Array.isArray(livePortalMerchants) ? livePortalMerchants : [];
            const existingCodes = new Set(liveDemo.map(function (x) { return x.code; }));
            list = liveDemo.concat(demoList.filter(function (d) { return !existingCodes.has(d.code); }));
        }
        if (currentGeo.country === 'PIONEER') return [];

        const strictMatches = filterMerchantsPool(list, true);
        if (strictMatches.length === 0 && currentGeo.country !== 'ALL' && currentGeo.city && currentGeo.city !== 'all') {
            const countryWideMatches = filterMerchantsPool(list, false);
            if (countryWideMatches.length > 0) {
                lastCountryFallbackUsed = true;
                return countryWideMatches;
            }
        }
        return strictMatches;
    }

    function renderCategoryChips() {
        const container = byId('explorerCatChips');
        if (!container) return;
        const cats = Array.isArray(window.categories) ? window.categories : [];
        let html = `<button type="button" class="geo-city-chip ${explorerState.category === 'all' ? 'active' : ''}" data-cat="all">جميع الفئات</button>`;
        cats.forEach(function (cat) {
            const active = explorerState.category === cat.slug ? 'active' : '';
            html += `<button type="button" class="geo-city-chip ${active}" data-cat="${escapeHtml(cat.slug)}">${escapeHtml(cat.icon)} ${escapeHtml(cat.name)}</button>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('[data-cat]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                explorerState.category = btn.getAttribute('data-cat') || 'all';
                renderCategoryChips();
                renderFeaturedMerchants();
            });
        });
    }

    function renderCityChips() {
        const container = byId('explorerCityChips');
        if (!container) return;
        const cfg = window.SAWYAN_GEO.getCountryConfig(currentGeo.country);
        const cities = cfg.cities || { all: 'جميع المدن' };
        let html = '<span style="font-size:0.84rem; font-weight:800; color:#475569; margin-left:4px;">المدينة:</span>';

        Object.keys(cities).forEach(function (cityKey) {
            const active = (currentGeo.city || 'all') === cityKey ? 'active' : '';
            html += `<button type="button" class="geo-city-chip ${active}" data-city-chip="${escapeHtml(cityKey)}">${escapeHtml(cities[cityKey])}</button>`;
        });
        container.innerHTML = html;

        container.querySelectorAll('[data-city-chip]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const chosenCity = btn.getAttribute('data-city-chip') || 'all';
                applyGeoContext(currentGeo.country, chosenCity, 'user');
            });
        });
    }

    function buildMerchantCardHtml(m) {
        const icon = CATEGORY_ICONS[m.categorySlug] || '🏪';
        const netRate = typeof m.cashbackRate === 'number'
            ? m.cashbackRate
            : window.calcNetMemberCashback(m.generalCommissionRate || 10);
        const typeLabel = m.merchantType === 'online'
            ? '🌐 أونلاين'
            : (m.merchantType === 'both' ? '🏪🌐 محلي وأونلاين' : '🏪 فرع محلي');
        const locationText = `${m.countryName || ''} — ${m.city || ''}`;
        const detailHref = `public/merchants.html?country=${encodeURIComponent(m.country)}&city=${encodeURIComponent(m.cityKey || 'all')}&merchant=${encodeURIComponent(m.id)}`;

        const isSafeHero = m.image && /^(https:\/\/|data:image\/(jpeg|jpg|png|webp);base64,|assets\/|\.\.\/assets\/|shared\/assets\/)/i.test(String(m.image));
        const fallbackImg = 'shared/assets/card-merchant.jpg';
        const heroVisual = `<img src="${escapeHtml(isSafeHero ? m.image : fallbackImg)}" alt="${escapeHtml(m.businessName)}" class="merchant-hero-img" loading="lazy" onerror="this.onerror=null;if(this.src.indexOf('card-merchant.jpg')===-1){this.src='${fallbackImg}';}else{this.style.display='none';}">`;
        const isSafeLogo = m.logoUrl && /^(https:\/\/|data:image\/(jpeg|jpg|png|webp);base64,|assets\/|\.\.\/assets\/)/i.test(String(m.logoUrl));
        const badgeVisual = isSafeLogo
            ? `<img src="${escapeHtml(m.logoUrl)}" alt="" style="width:28px;height:28px;border-radius:8px;object-fit:cover;border:1px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2);" loading="lazy">`
            : `<span class="merchant-icon-floating">${icon}</span>`;

        const activeOffer = m.activeOffer || liveFlashOffersByMerchant.get(String(m.id)) || null;
        const promoRibbonHtml = activeOffer
            ? `<div style="background:linear-gradient(90deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:10px;padding:7px 10px;margin:8px 0;font-size:0.8rem;color:#78350f;font-weight:800;line-height:1.45;">🔥 عرض حصري الآن: ${escapeHtml(activeOffer.title)} <span style="display:inline-block;background:#dc2626;color:#fff;padding:1px 6px;border-radius:999px;font-size:0.68rem;margin-right:4px;">⏳ ${escapeHtml(formatOfferRemainingAr(activeOffer.remaining_seconds))}</span></div>`
            : '';

        return `
            <article class="merchant-card" data-merchant-id="${escapeHtml(m.id)}" tabindex="0" role="link" aria-label="${escapeHtml(m.businessName)}"${activeOffer ? ' style="border:2px solid #f59e0b;box-shadow:0 8px 24px rgba(245,158,11,0.18);"' : ''}>
                <div class="merchant-image-container">
                    ${heroVisual}
                    ${activeOffer ? '<span style="position:absolute;top:10px;left:10px;z-index:3;background:#dc2626;color:#fff;font-size:0.72rem;font-weight:900;padding:4px 10px;border-radius:999px;box-shadow:0 3px 10px rgba(220,38,38,0.35);">🔥 عرض خاص الآن</span>' : ''}
                    <div class="merchant-overlay">
                        <div class="merchant-overlay-content">
                            ${badgeVisual}
                            <span class="merchant-cashback-badge net-cashback-badge">عائدات فريقك من هذا التاجر (${netRate}%)</span>
                        </div>
                    </div>
                </div>
                <div class="merchant-info">
                    <div class="merchant-header-row">
                        <h3 class="merchant-name">${escapeHtml(m.businessName)}</h3>
                        ${m.isVerified ? '<span class="verified-icon" title="تاجر موثق ومعتمد">✓</span>' : ''}
                    </div>
                    ${promoRibbonHtml}
                    <div class="merchant-rating-compact" style="margin:4px 0 8px;">
                        ${Number(m.reviewsCount || 0) > 0 && Number(m.rating || 0) > 0
                            ? `<span class="stars" style="color:#f59e0b;">★</span><span class="rating-value">${escapeHtml(m.rating)}</span><span class="rating-count">(${window.formatNumber(m.reviewsCount || 0)} تقييم)</span>`
                            : `<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:800;">🆕 متجر معتمد</span>`}
                        <span style="margin-right:auto; font-size:0.78rem; color:#047857; font-weight:700;">${typeLabel}</span>
                    </div>
                    <p class="merchant-desc-short">${escapeHtml(m.description)}</p>
                    <div class="merchant-footer-row" style="gap:6px; flex-wrap:wrap;">
                        <span class="merchant-category-tag">${escapeHtml(m.category)}</span>
                        <span class="city-tag">📍 ${escapeHtml(locationText)}</span>
                    </div>
                    <div style="margin-top:12px;">
                        <a href="${detailHref}" class="btn btn-outline btn-sm" style="width:100%; justify-content:center;">عرض التفاصيل وعائدات الفريق ↗</a>
                    </div>
                </div>
            </article>
        `;
    }

    function renderExpansionCardHtml(cfg) {
        const regMemberHref = `member-dashboard/register.html?country=${encodeURIComponent(cfg.code)}&city=${encodeURIComponent(currentGeo.city || 'all')}`;
        const regMerchHref = `merchant-dashboard/register.html?country=${encodeURIComponent(cfg.code)}&city=${encodeURIComponent(currentGeo.city || 'all')}`;
        return `
            <div class="expansion-card">
                <div style="font-size:2.2rem; margin-bottom:8px;">🌍</div>
                <h3>التوسّع جارٍ في ${escapeHtml(cfg.name)}</h3>
                <p>
                    لا توجد متاجر محلية مضافة بعد لهذا النطاق — لكن تسجيلك وبناء فريقك يعملان <strong>عالمياً بلا قيود جغرافية</strong>، ويمكنك التسوق من المتاجر الإلكترونية أو ترشيح أول تاجر في مدينتك!
                </p>
                <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                    <a href="${regMemberHref}" class="btn btn-primary btn-sm">سجّل مجاناً الآن</a>
                    <a href="${regMerchHref}" class="btn btn-secondary btn-sm">رشّح أو سجّل أول تاجر في مدينتك</a>
                    <button type="button" id="resetToGlobalMerchantsBtn" class="btn btn-outline btn-sm">عرض جميع التجار العالميين 🌍</button>
                </div>
            </div>
        `;
    }

    function renderFeaturedMerchants() {
        renderLiveFlashOffersSpotlight();
        const grid = byId('featured-merchants');
        if (!grid) return;

        const cfg = window.SAWYAN_GEO.getCountryConfig(currentGeo.country);
        const matched = getMatchingMerchants();

        if (matched.length === 0) {
            grid.innerHTML = renderExpansionCardHtml(cfg);
            const resetBtn = byId('resetToGlobalMerchantsBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', function () {
                    explorerState.storeType = 'all';
                    explorerState.category = 'all';
                    explorerState.searchQuery = '';
                    const searchInput = byId('heroSearchInput');
                    if (searchInput) searchInput.value = '';
                    document.querySelectorAll('[data-store-type]').forEach(function (b) {
                        b.classList.toggle('active', b.getAttribute('data-store-type') === 'all');
                    });
                    renderCategoryChips();
                    applyGeoContext('ALL', 'all', 'user');
                });
            }
            return;
        }

        const sorted = matched.slice().sort(function (a, b) {
            const oa = (a.activeOffer || liveFlashOffersByMerchant.has(String(a.id))) ? 1 : 0;
            const ob = (b.activeOffer || liveFlashOffersByMerchant.has(String(b.id))) ? 1 : 0;
            if (oa !== ob) return ob - oa;
            const fa = a.isFeatured ? 1 : 0;
            const fb = b.isFeatured ? 1 : 0;
            if (fa !== fb) return fb - fa;
            if (b.rating !== a.rating) return b.rating - a.rating;
            return (b.transactionsCount || 0) - (a.transactionsCount || 0);
        });

        let noticeHtml = '';
        if (currentGeo.country !== 'ALL' && (lastCountryFallbackUsed || (currentGeo.city && currentGeo.city !== 'all'))) {
            const cities = cfg.cities || {};
            const cName = cities[currentGeo.city] || '';
            const scopeNote = cName && cName !== 'جميع المدن' ? `${cfg.name} (${cName})` : cfg.name;
            noticeHtml = `
                <div class="geo-fallback-notice">
                    <span>📍 المتاجر المعتمدة المتاحة في نطاق <strong>${escapeHtml(scopeNote)}</strong> وتشمل عموم الدولة:</span>
                    <span>عدد المتاجر: ${matched.length}</span>
                </div>
            `;
        }

        grid.innerHTML = noticeHtml + sorted.slice(0, 8).map(buildMerchantCardHtml).join('');

        grid.querySelectorAll('.merchant-card[data-merchant-id]').forEach(function (card) {
            card.addEventListener('click', function (e) {
                if (e.target.closest('a')) return;
                const link = card.querySelector('a');
                if (link) window.location.href = link.getAttribute('href');
            });
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    const link = card.querySelector('a');
                    if (link) window.location.href = link.getAttribute('href');
                }
            });
        });
    }

    function applyGeoContext(countryCode, cityKey, sourceLabel) {
        const cfg = window.SAWYAN_GEO.getCountryConfig(countryCode);
        const cities = cfg.cities || { all: 'جميع المدن' };
        const validCity = (cityKey && cities[cityKey]) ? cityKey : 'all';

        currentGeo = {
            country: cfg.code,
            city: validCity,
            source: sourceLabel || 'user'
        };
        window.SAWYAN_GEO.save(currentGeo);

        if (sourceLabel === 'user') {
            try {
                const url = new URL(window.location.href);
                url.searchParams.set('country', currentGeo.country);
                if (currentGeo.city !== 'all') url.searchParams.set('city', currentGeo.city);
                else url.searchParams.delete('city');
                window.history.replaceState({}, '', url.toString());
            } catch (e) {}
        }

        const cityLabel = validCity !== 'all' ? ` — ${cities[validCity]}` : '';
        const scopeText = `${cfg.name}${cityLabel}`;

        if (byId('topGeoBadge')) {
            const hint = SOURCE_LABELS[currentGeo.source] || '';
            byId('topGeoBadge').innerHTML = `${cfg.flag} تتصفح حالياً: <strong>${escapeHtml(scopeText)}</strong> <span style="opacity:0.88; font-size:0.78rem;">(${escapeHtml(hint)} • ${escapeHtml(cfg.currencyCode)})</span>`;
        }
        if (byId('navGeoFlag')) byId('navGeoFlag').textContent = cfg.flag;
        if (byId('navGeoLabel')) {
            byId('navGeoLabel').textContent = validCity !== 'all' ? `${cfg.name}: ${cities[validCity]}` : cfg.name;
        }
        if (byId('heroGeoBadge')) {
            byId('heroGeoBadge').innerHTML = `<span>${cfg.flag}</span><span>نطاق التصفح: ${escapeHtml(scopeText)} — العملة: ${escapeHtml(cfg.currencyCode)}</span>`;
        }
        if (byId('heroSearchCountryLabel')) byId('heroSearchCountryLabel').textContent = cfg.isGlobal ? 'العالم' : cfg.name;

        const sourcePool = isProdEnvironment()
            ? (Array.isArray(livePortalMerchants) ? livePortalMerchants : [])
            : (window.globalDemoMerchants || []);
        const allInGeo = sourcePool.filter(function (m) {
            return cfg.code === 'ALL' ? true : m.country === cfg.code;
        });
        const isProd = isProdEnvironment();
        const liveMerchantCount = allInGeo.length;
        const showLiveMatureStats = (!isProd && allInGeo.length >= 15) || (isProd && liveMerchantCount >= 15);
        const valueStrip = byId('heroValueStrip');
        const liveMetricsStrip = byId('heroCompactLiveMetrics');
        if (valueStrip) valueStrip.style.display = showLiveMatureStats ? 'none' : 'grid';
        if (liveMetricsStrip) liveMetricsStrip.style.display = showLiveMatureStats ? 'grid' : 'none';
        if (byId('valueStripCurrency')) byId('valueStripCurrency').textContent = cfg.currencyCode || 'USD';

        const merchCountText = `${liveMerchantCount}`;
        if (byId('stat-merchants')) byId('stat-merchants').textContent = merchCountText;
        if (byId('bigStatMerchants')) byId('bigStatMerchants').textContent = merchCountText;
        if (byId('stat-members')) byId('stat-members').textContent = isProd ? '0' : '60';
        if (byId('bigStatMembers')) byId('bigStatMembers').textContent = isProd ? '0' : '60';
        if (byId('stat-transactions')) byId('stat-transactions').textContent = isProd ? '0' : '5';
        if (byId('bigStatTransactions')) byId('bigStatTransactions').textContent = isProd ? '0' : '5';
        if (byId('heroStatReturns')) byId('heroStatReturns').textContent = isProd ? '0.00' : 'مربوط بالدفتر';
        if (byId('bigStatReturns')) byId('bigStatReturns').textContent = isProd ? '0.00' : 'مربوط بالدفتر';
        if (byId('heroMetricMerchantsLabel')) {
            byId('heroMetricMerchantsLabel').textContent = cfg.code === 'ALL' ? 'تاجر معتمد' : `متاجر مميزة (${cfg.name})`;
        }

        const returnsLabel = `عائدات موزعة (${cfg.currency})`;
        if (byId('heroStatReturnsLabel')) byId('heroStatReturnsLabel').textContent = returnsLabel;
        if (byId('bigStatReturnsLabel')) byId('bigStatReturnsLabel').textContent = returnsLabel;

        if (byId('floatingGainLabel')) {
            const gVal = window.formatCurrency(Number((25 * cfg.fxRate).toFixed(0)), cfg.code);
            byId('floatingGainLabel').textContent = `+${gVal} عائد مشتريات`;
        }
        if (byId('walletMonthGain')) {
            const mVal = window.formatCurrency(Number((42.50 * cfg.fxRate).toFixed(2)), cfg.code);
            byId('walletMonthGain').textContent = `+${mVal}`;
        }
        if (byId('walletPreviewGeoTag')) {
            byId('walletPreviewGeoTag').textContent = `نموذج توضيحي • ${cfg.flag} ${cfg.currencyCode}`;
        }
        if (byId('walletPreviewAmount')) {
            const sampleWallet = Number((124.50 * cfg.fxRate).toFixed(2));
            byId('walletPreviewAmount').textContent = window.formatCurrency(sampleWallet, cfg.code);
        }
        if (byId('walletTargetAmount')) {
            const tVal = window.formatCurrency(cfg.monthlyTargetLocal, cfg.code);
            byId('walletTargetAmount').textContent = `${tVal} / ${tVal}`;
        }

        ['navJoinBtn', 'mobileQuickJoinBtn', 'mobileDrawerJoinBtn', 'viewAllMerchantsLink', 'mobileAllMerchantsLink', 'footerMerchantsLink', 'heroJoinBtn'].forEach(function (id) {
            const el = byId(id);
            if (el && el.getAttribute('href')) {
                el.setAttribute('href', appendGeoParams(el.getAttribute('href')));
            }
        });
        document.querySelectorAll('.join-cta-link').forEach(function (el) {
            if (el.getAttribute('href')) {
                el.setAttribute('href', appendGeoParams(el.getAttribute('href')));
            }
        });

        document.querySelectorAll('#explorerCountryTabs [data-country]').forEach(function (tab) {
            tab.classList.toggle('active', tab.getAttribute('data-country') === cfg.code);
        });

        renderCityChips();
        renderFeaturedMerchants();
    }

    function openGeoModal() {
        const modal = byId('geoModal');
        if (!modal) return;
        modalDraftGeo = { country: currentGeo.country, city: currentGeo.city };
        renderGeoModalContent();
        modal.classList.add('open');
    }

    function closeGeoModal() {
        const modal = byId('geoModal');
        if (modal) modal.classList.remove('open');
    }

    function renderGeoModalContent() {
        const countriesEl = byId('geoModalCountries');
        const citiesEl = byId('geoModalCities');
        const searchInp = byId('geoModalSearchInput');
        if (!countriesEl || !citiesEl) return;

        const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
        const ss = window.SAWYAN && window.SAWYAN.SmartSearch;
        const q = searchInp ? String(searchInp.value || '').trim() : '';
        const qLang = ls ? ls.detectQueryLang(q, ls.getDocLang()) : 'ar';

        const rawCodes = Object.keys(window.SAWYAN_GEO_CONFIG);
        const specialTop = rawCodes.filter(c => c === 'ALL');
        const specialBottom = rawCodes.filter(c => c === 'PIONEER');
        let countryCodes = rawCodes.filter(c => c !== 'ALL' && c !== 'PIONEER');

        const enrichCountry = (code) => {
            const item = window.SAWYAN_GEO_CONFIG[code];
            const meta = (window.SAWYAN && typeof window.SAWYAN.getCountryByCode === 'function')
                ? window.SAWYAN.getCountryByCode(code) : null;
            return {
                code,
                item,
                nameAr: item.name || (meta ? meta.nameAr : code),
                nameEn: (meta && meta.nameEn) || item.name || code,
                aliases: (meta && meta.aliases) || [],
                dialCode: (meta && meta.dialCode) || ''
            };
        };

        let enriched = countryCodes.map(enrichCountry);
        if (q) {
            enriched = enriched.filter(e => {
                const blob = [e.nameAr, e.nameEn, e.code, e.dialCode, ...e.aliases, ...Object.values(e.item.cities || {})].join(' ');
                return ss ? ss.matchesBilingualQuery(blob, q) : blob.toLowerCase().includes(q.toLowerCase());
            });
        }
        enriched.sort((a, b) => {
            const na = qLang === 'en' ? a.nameEn : a.nameAr;
            const nb = qLang === 'en' ? b.nameEn : b.nameAr;
            return ls ? ls.compareStrings(na, nb, qLang) : na.localeCompare(nb, qLang);
        });

        const ordered = (q ? [] : specialTop.map(enrichCountry))
            .concat(enriched)
            .concat(q ? [] : specialBottom.map(enrichCountry));

        let cHtml = '';
        ordered.forEach(function (entry) {
            const code = entry.code;
            const item = entry.item;
            const active = modalDraftGeo.country === code ? 'active' : '';
            const primaryName = (code === 'ALL' || code === 'PIONEER')
                ? item.name
                : (qLang === 'en' ? `${entry.nameEn} (${entry.nameAr})` : entry.nameAr);
            cHtml += `
                <button type="button" class="geo-country-opt ${active}" data-modal-country="${escapeHtml(code)}">
                    <div style="font-size:1.15rem; margin-bottom:2px;">${item.flag} <strong>${escapeHtml(primaryName)}</strong></div>
                    <div style="font-size:0.78rem; color:#475569;">${escapeHtml(item.currencyCode)} • هدف: ${window.formatCurrency(item.monthlyTargetLocal, item.code)}</div>
                </button>
            `;
        });
        countriesEl.innerHTML = cHtml || '<div style="grid-column:1/-1;text-align:center;color:#64748b;padding:12px;font-weight:700;">لا توجد دولة مطابقة للبحث.</div>';

        countriesEl.querySelectorAll('[data-modal-country]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                modalDraftGeo.country = btn.getAttribute('data-modal-country');
                modalDraftGeo.city = 'all';
                renderGeoModalContent();
            });
        });

        const draftCfg = window.SAWYAN_GEO.getCountryConfig(modalDraftGeo.country);
        const citiesMap = draftCfg.cities || { all: 'جميع المدن' };
        const cityKeys = Object.keys(citiesMap);
        const topCity = cityKeys.filter(k => k === 'all');
        let otherCities = cityKeys.filter(k => k !== 'all');
        if (q) {
            const matchedCities = otherCities.filter(k => {
                const blob = `${citiesMap[k]} ${k}`;
                return ss ? ss.matchesBilingualQuery(blob, q) : blob.toLowerCase().includes(q.toLowerCase());
            });
            if (matchedCities.length > 0) otherCities = matchedCities;
        }
        otherCities.sort((a, b) => {
            const na = qLang === 'en' ? a : citiesMap[a];
            const nb = qLang === 'en' ? b : citiesMap[b];
            return ls ? ls.compareStrings(na, nb, qLang) : na.localeCompare(nb, qLang);
        });

        let cityHtml = '';
        topCity.concat(otherCities).forEach(function (cKey) {
            const active = modalDraftGeo.city === cKey ? 'active' : '';
            cityHtml += `<button type="button" class="geo-city-chip ${active}" data-modal-city="${escapeHtml(cKey)}">${escapeHtml(citiesMap[cKey])}</button>`;
        });
        citiesEl.innerHTML = cityHtml;

        citiesEl.querySelectorAll('[data-modal-city]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                modalDraftGeo.city = btn.getAttribute('data-modal-city') || 'all';
                renderGeoModalContent();
            });
        });
    }

    function initGeoModal() {
        const openTriggers = [byId('navGeoPill')];
        openTriggers.forEach(function (el) {
            if (el) el.addEventListener('click', function () {
                const inp = byId('geoModalSearchInput');
                if (inp) inp.value = '';
                openGeoModal();
                if (inp) setTimeout(() => inp.focus(), 80);
            });
        });
        const modalSearch = byId('geoModalSearchInput');
        if (modalSearch) {
            modalSearch.addEventListener('input', renderGeoModalContent);
            modalSearch.addEventListener('keydown', function (ev) {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    const first = document.querySelector('#geoModalCountries [data-modal-country]');
                    if (first) first.click();
                }
            });
        }
        if (byId('closeGeoModalBtn')) byId('closeGeoModalBtn').addEventListener('click', closeGeoModal);
        if (byId('geoModal')) {
            byId('geoModal').addEventListener('click', function (e) {
                if (e.target.id === 'geoModal') closeGeoModal();
            });
        }
        if (byId('confirmGeoModalBtn')) {
            byId('confirmGeoModalBtn').addEventListener('click', function () {
                applyGeoContext(modalDraftGeo.country, modalDraftGeo.city, 'user');
                closeGeoModal();
            });
        }
    }

    function initExplorerControls() {
        document.querySelectorAll('#explorerCountryTabs [data-country]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                applyGeoContext(btn.getAttribute('data-country'), 'all', 'user');
            });
        });

        document.querySelectorAll('[data-store-type]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                explorerState.storeType = btn.getAttribute('data-store-type') || 'all';
                document.querySelectorAll('[data-store-type]').forEach(function (other) {
                    other.classList.toggle('active', other === btn);
                });
                renderFeaturedMerchants();
            });
        });

        const searchForm = byId('heroQuickSearchForm');
        const searchInput = byId('heroSearchInput');
        if (searchForm && searchInput) {
            searchForm.addEventListener('submit', function (e) {
                e.preventDefault();
                explorerState.searchQuery = searchInput.value.trim();
                renderFeaturedMerchants();
                const targetSection = byId('marketplace-explorer');
                if (targetSection) targetSection.scrollIntoView({ behavior: 'smooth' });
            });
        }

        renderCategoryChips();
    }

    function initHowItWorksTabs() {
        document.querySelectorAll('[data-how-tab]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const role = btn.getAttribute('data-how-tab');
                document.querySelectorAll('[data-how-tab]').forEach(function (b) {
                    b.classList.toggle('active', b === btn);
                });
                if (byId('howMemberSteps')) byId('howMemberSteps').style.display = role === 'member' ? '' : 'none';
                if (byId('howMerchantSteps')) byId('howMerchantSteps').style.display = role === 'merchant' ? '' : 'none';
            });
        });
    }

    function initPromoPlayer() {
        const card = byId('promoTheatreCard');
        if (!card) return;

        const vid = byId('promoOfficialVideo');
        const centerBtn = byId('promoCenterPlayBtn');
        const toggleBtn = byId('promoToggleBtn');

        const scenes = [
            {
                start: 0.0,
                end: 4.99,
                img: 'shared/assets/card-shopper.jpg',
                badge: 'المشهد 1 من 10 • الصدمة الإيجابية',
                title: '1. «أَكْثَرُ مَا نَفْعَلُهُ كُلَّ يَوْمٍ.. هُوَ أَكْثَرُ مَا نَكْرَهُهُ.. الدَّفْعُ!»',
                body: 'فواتير السوبر ماركت والصيدلية والمطعم تتكرر يومياً دون أن يعود إليك منها شيء في التسوق التقليدي.',
                pct: 10
            },
            {
                start: 4.99,
                end: 8.96,
                img: 'shared/assets/promo-poster.jpg',
                badge: 'المشهد 2 من 10 • نقطة التحول',
                title: '2. «مِنَ اليَوْمِ.. تَغَيَّرَ الوَضْعُ! أَهْلاً بِكَ فِي سَوِيّاً»',
                body: 'منصة الاستهلاك الاستثماري العالمية (Buy and Make Money) — عضوية مجانية 100% وتوثيق فوري بكود هويتك.',
                pct: 18
            },
            {
                start: 8.96,
                end: 14.19,
                img: 'shared/assets/card-shopper.jpg',
                badge: 'المشهد 3 من 10 • تسوقك المعتاد',
                title: '3. «تَسَوَّقْ بِنَفْسِ أَسْعَارِكَ الطَّبِيعِيَّةِ مِنَ السُّوبَر مَارْكِت وَالصَّيْدَلِيَّةِ وَالمَطْعَمِ»',
                body: 'نفس مشترياتك اليومية الضرورية وبنفس أسعارك المعتادة دون أي زيادة أو التزام إضافي.',
                pct: 28
            },
            {
                start: 14.19,
                end: 20.82,
                img: 'shared/assets/card-shopper.jpg',
                badge: 'المشهد 4 من 10 • العائد الشهري',
                title: '4. «لَكِنْ هَذِهِ المَرَّةَ مَدْفُوعَاتُكَ لَنْ تَضِيعَ.. بَلْ تَتَحَوَّلُ إِلَى عَائِدَاتٍ تَنْمُو كُلَّ شَهْرٍ»',
                body: 'فواتيرك الموثقة تتحول مباشرة إلى أرباح استثمارية حقيقية تنمو في صندوق الهدف الشهري.',
                pct: 38
            },
            {
                start: 20.82,
                end: 27.19,
                img: 'shared/assets/card-why-sawyan.jpg',
                badge: 'المشهد 5 من 10 • المتاجر الشريكة',
                title: '5. «فَقَطْ غَيِّرْ مَتْجَرَكَ.. وَتَسَوَّقْ مِنَ المَتَاجِرِ الَّتِي تَعَاقَدْنَا مَعَهَا لِنَتَشَارَكَ الأَرْبَاحَ»',
                body: 'تشارك الأرباح مع المتاجر الشريكة المعتمدة عبر تغيير وجهة تسوقك المعتادة فقط.',
                pct: 48
            },
            {
                start: 27.19,
                end: 37.13,
                img: 'shared/assets/card-why-sawyan.jpg',
                badge: 'المشهد 6 من 10 • مضاعفة الدخل',
                title: '6. «أَخْبِرِ المَتْجَرَ الشَّرِيكَ أَنَّكَ عُضْوٌ بِسَوِيّاً.. وَشَارِكِ الفِكْرَةَ لِيَتَضَاعَفَ دَخْلُكَ وَدَخْلُهُمْ!»',
                body: 'قدّم كود هويتك عند الدفع في المتجر الشريك، وشارك الفكرة مع معارفك لتنمو عوائد الجميع.',
                pct: 60
            },
            {
                start: 37.13,
                end: 43.22,
                img: 'shared/assets/card-merchant.jpg',
                badge: 'المشهد 7 من 10 • فرصة التجار',
                title: '7. «أَمَّا التُّجَّارُ وَأَصْحَابُ المَشْرُوعَاتِ فَهُمْ أَمَامَ فُرْصَةٍ لَا تَتَكَرَّرُ»',
                body: 'تحوّل تسويقي حقيقي للتجار يربط مبيعاتهم مباشرة بشبكة الأعضاء النشطين.',
                pct: 70
            },
            {
                start: 43.22,
                end: 52.41,
                img: 'shared/assets/card-merchant.jpg',
                badge: 'المشهد 8 من 10 • ادفع للنتائج',
                title: '8. «انْتَشِرْ دُونَ مُجَازَفَةٍ بِإِعْلَانَاتٍ مَجْهُولَةِ العَائِدِ.. ادْفَعْ فَقَطْ مُقَابِلَ النَّتَائِجِ لَا الوُعُودِ»',
                body: 'وداعاً لهدر الميزانيات الإعلانية — ادفع عمولتك المتفق عليها فقط عند تحقق البيع الفعلي.',
                pct: 80
            },
            {
                start: 52.41,
                end: 58.96,
                img: 'shared/assets/card-merchant.jpg',
                badge: 'المشهد 9 من 10 • صفر مخاطرة',
                title: '9. «آلَافُ العُمَلَاءِ فِي انْتِظَارِكَ.. صِفْرُ مُخَاطَرَةٍ • صِفْرُ رَأْسِ مَالٍ • صِفْرُ مُؤَهِّلَاتٍ»',
                body: 'نظام عادل حلال 100% ومجاني تماماً للأعضاء — بدون بضائع مخزنة أو مخاطرة مالية.',
                pct: 90
            },
            {
                start: 58.96,
                end: 67.60,
                img: 'shared/assets/promo-poster.jpg',
                badge: 'المشهد 10 من 10 • الحرية المالية',
                title: '10. «الحُرِّيَّةُ المَالِيَّةُ لَيْسَتْ وَهْماً.. بَلْ حَقِيقَةٌ يَفْصِلُكَ عَنْهَا خَطْوَةٌ وَاحِدَةٌ.. سَوِيّاً»',
                body: 'انضم الآن مجاناً وابدأ رحلتك في عالم الاستهلاك الاستثماري على www.sawyan.net.',
                pct: 100
            }
        ];

        let idx = 0;

        function updateUiForScene(sceneIdx, customPct) {
            idx = ((sceneIdx % scenes.length) + scenes.length) % scenes.length;
            const sc = scenes[idx];
            if (byId('promoSlideImg')) byId('promoSlideImg').src = sc.img;
            if (byId('promoSceneCounter')) byId('promoSceneCounter').textContent = sc.badge;
            if (byId('promoCaptionTitle')) byId('promoCaptionTitle').textContent = sc.title;
            if (byId('promoCaptionBody')) byId('promoCaptionBody').textContent = sc.body;
            if (byId('promoProgressFill')) {
                byId('promoProgressFill').style.width = `${customPct !== undefined ? customPct : sc.pct}%`;
            }
            document.querySelectorAll('.promo-chapter-btn').forEach(function (btn) {
                btn.classList.toggle('active', Number(btn.getAttribute('data-scene')) === idx);
            });
        }

        function playVideo() {
            if (!vid) return;
            card.classList.add('is-playing');
            vid.controls = true;
            if (centerBtn) centerBtn.style.display = 'none';
            if (toggleBtn) toggleBtn.textContent = '⏸ إيقاف مؤقت';
            const p = vid.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () {});
            }
        }

        function pauseVideo() {
            if (!vid) return;
            vid.pause();
            card.classList.remove('is-playing');
            if (centerBtn) centerBtn.style.display = '';
            if (toggleBtn) toggleBtn.textContent = '▶ تشغيل الفيديو';
        }

        if (vid) {
            vid.addEventListener('timeupdate', function () {
                const ct = vid.currentTime || 0;
                const dur = vid.duration || 67.60;
                const pct = Math.min(100, Math.round((ct / dur) * 100));
                let foundIdx = 0;
                for (let i = 0; i < scenes.length; i++) {
                    if (ct >= scenes[i].start) foundIdx = i;
                }
                updateUiForScene(foundIdx, pct);
            });
            vid.addEventListener('play', function () {
                card.classList.add('is-playing');
                vid.controls = true;
                if (centerBtn) centerBtn.style.display = 'none';
                if (toggleBtn) toggleBtn.textContent = '⏸ إيقاف مؤقت';
            });
            vid.addEventListener('pause', function () {
                card.classList.remove('is-playing');
                if (toggleBtn) toggleBtn.textContent = '▶ تشغيل الفيديو';
            });
            vid.addEventListener('ended', function () {
                card.classList.remove('is-playing');
                if (centerBtn) centerBtn.style.display = '';
                if (toggleBtn) toggleBtn.textContent = '▶ إعادة تشغيل الفيديو';
            });
        }

        if (centerBtn) centerBtn.addEventListener('click', playVideo);
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function () {
                if (vid && !vid.paused) pauseVideo(); else playVideo();
            });
        }
        if (byId('heroWatchPromoBtn')) {
            byId('heroWatchPromoBtn').addEventListener('click', function () {
                const sec = byId('promo-explainer');
                if (sec) sec.scrollIntoView({ behavior: 'smooth' });
                if (vid) vid.currentTime = 0;
                updateUiForScene(0, 0);
                playVideo();
            });
        }
        document.querySelectorAll('.promo-chapter-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const targetIdx = Number(btn.getAttribute('data-scene') || 0);
                updateUiForScene(targetIdx);
                if (vid && scenes[targetIdx]) {
                    vid.currentTime = scenes[targetIdx].start;
                    playVideo();
                }
            });
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        hydrateBrandLogos();
        initThemeToggle();
        initMobileMenu();
        initGeoModal();
        initExplorerControls();
        initHowItWorksTabs();
        initPromoPlayer();

        const detected = window.SAWYAN_GEO
            ? window.SAWYAN_GEO.detectInitial()
            : { country: 'EG', city: 'cairo', source: 'default' };
        applyGeoContext(detected.country, detected.city, detected.source);
        loadLiveMerchantsForPortal();
    });
})();
