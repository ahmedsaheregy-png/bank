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

    function isProdEnvironment() {
        return Boolean(window.SAWYAN && window.SAWYAN.API && !window.SAWYAN.API.isDemoMode());
    }

    async function loadLiveMerchantsForPortal() {
        if (!(window.SAWYAN && window.SAWYAN.API && window.SAWYAN.supabase)) return;
        try {
            const rows = await window.SAWYAN.API.getPublicMerchantsCatalog({});
            if (Array.isArray(rows)) {
                livePortalMerchants = rows.map(function (r) {
                    const cCode = String(r.country_code || 'EG').toUpperCase();
                    const cfg = window.SAWYAN_GEO ? window.SAWYAN_GEO.getCountryConfig(cCode) : { name: cCode };
                    return {
                        id: r.merchant_id,
                        code: r.merchant_code,
                        businessName: r.business_name,
                        category: r.category_code || 'متجر معتمد',
                        categorySlug: r.category_code || 'supermarket',
                        country: cCode,
                        countryName: cfg.name || cCode,
                        cityKey: 'all',
                        city: r.branch_name || '',
                        district: r.address || '',
                        description: r.address || r.branch_name || '',
                        merchantType: 'physical',
                        cashbackRate: Number(r.plan_cashback_pct || 0),
                        rating: 5.0,
                        reviewsCount: 1,
                        isVerified: true,
                        isFeatured: true
                    };
                });
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
                renderFeaturedMerchants();
            }
        }
    }

    const CATEGORY_ICONS = {
        restaurants: '🍽️',
        supermarket: '🛒',
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
                footerLogo.innerHTML = window.SAWYAN.Logo.svg('light-on-dark');
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

    function getMatchingMerchants() {
        let list = [];
        if (isProdEnvironment()) {
            list = Array.isArray(livePortalMerchants) ? livePortalMerchants : [];
        } else {
            const demoList = Array.isArray(window.globalDemoMerchants) ? window.globalDemoMerchants : [];
            const liveDemo = Array.isArray(livePortalMerchants) ? livePortalMerchants : [];
            const existingCodes = new Set(liveDemo.map(function (x) { return x.code; }));
            list = liveDemo.concat(demoList.filter(function (d) { return !existingCodes.has(d.code); }));
        }
        if (currentGeo.country === 'PIONEER') return [];

        return list.filter(function (m) {
            if (currentGeo.country !== 'ALL' && m.country !== currentGeo.country) {
                return false;
            }
            if (currentGeo.country !== 'ALL' && currentGeo.city && currentGeo.city !== 'all') {
                if (m.cityKey !== currentGeo.city) return false;
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
                const q = explorerState.searchQuery.toLowerCase();
                const haystack = [
                    m.businessName,
                    m.category,
                    m.countryName,
                    m.city,
                    m.district,
                    m.description,
                    m.code
                ].join(' ').toLowerCase();
                if (!haystack.includes(q)) return false;
            }
            return true;
        });
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

        const heroVisual = m.image
            ? `<img src="${escapeHtml(m.image)}" alt="${escapeHtml(m.businessName)}" class="merchant-hero-img" loading="lazy">`
            : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; background:linear-gradient(135deg,#0f2744 0%,#065f46 100%); color:#ffffff;">${icon}</div>`;

        return `
            <article class="merchant-card" data-merchant-id="${escapeHtml(m.id)}" tabindex="0" role="link" aria-label="${escapeHtml(m.businessName)}">
                <div class="merchant-image-container">
                    ${heroVisual}
                    <div class="merchant-overlay">
                        <div class="merchant-overlay-content">
                            <span class="merchant-icon-floating">${icon}</span>
                            <span class="merchant-cashback-badge net-cashback-badge">عائدات فريقك من هذا التاجر (${netRate}%)</span>
                        </div>
                    </div>
                </div>
                <div class="merchant-info">
                    <div class="merchant-header-row">
                        <h3 class="merchant-name">${escapeHtml(m.businessName)}</h3>
                        ${m.isVerified ? '<span class="verified-icon" title="تاجر موثق ومعتمد">✓</span>' : ''}
                    </div>
                    <div class="merchant-rating-compact" style="margin:4px 0 8px;">
                        <span class="stars" style="color:#f59e0b;">★</span>
                        <span class="rating-value">${escapeHtml(m.rating)}</span>
                        <span class="rating-count">(${window.formatNumber(m.reviewsCount || 0)} تقييم)</span>
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

    function renderPioneerCardHtml(cfg) {
        const regMemberHref = `member-dashboard/register.html?country=${encodeURIComponent(cfg.code)}&city=${encodeURIComponent(currentGeo.city || 'all')}`;
        const regMerchHref = `merchant-dashboard/register.html?country=${encodeURIComponent(cfg.code)}&city=${encodeURIComponent(currentGeo.city || 'all')}`;
        return `
            <div class="pioneer-card">
                <div style="font-size:2.6rem; margin-bottom:10px;">🚀</div>
                <h3 style="margin:0 0 8px; font-size:1.35rem; color:#065f46;">أنت في طليعة التوسع: وضع المؤسس الرائد (Pioneer Mode)</h3>
                <p style="max-width:640px; margin:0 auto 18px; color:#334155; line-height:1.7;">
                    لم تُضف فروع تجريبية مطابقة لهذا التحديد بعد — لكن تسجيلك وبناء فريقك يعملان <strong>عالمياً بلا قيود جغرافية</strong>، ويمكنك التسوق من المتاجر الإلكترونية العالمية أو ترشيح أول تاجر في مدينتك!
                </p>
                <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
                    <a href="${regMemberHref}" class="btn btn-primary btn-sm">سجّل كعضو مؤسس مجاناً</a>
                    <a href="${regMerchHref}" class="btn btn-secondary btn-sm">رشّح أو سجّل أول تاجر في مدينتك</a>
                    <button type="button" id="resetToGlobalMerchantsBtn" class="btn btn-outline btn-sm">عرض جميع التجار العالميين 🌍</button>
                </div>
            </div>
        `;
    }

    function renderFeaturedMerchants() {
        const grid = byId('featured-merchants');
        if (!grid) return;

        const cfg = window.SAWYAN_GEO.getCountryConfig(currentGeo.country);
        const matched = getMatchingMerchants();

        if (matched.length === 0) {
            grid.innerHTML = renderPioneerCardHtml(cfg);
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
            const fa = a.isFeatured ? 1 : 0;
            const fb = b.isFeatured ? 1 : 0;
            if (fa !== fb) return fb - fa;
            if (b.rating !== a.rating) return b.rating - a.rating;
            return (b.transactionsCount || 0) - (a.transactionsCount || 0);
        });

        grid.innerHTML = sorted.slice(0, 8).map(buildMerchantCardHtml).join('');

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
        const merchCountText = cfg.code === 'PIONEER' ? 'قريباً' : `${allInGeo.length}`;
        if (byId('stat-merchants')) byId('stat-merchants').textContent = merchCountText;
        if (byId('bigStatMerchants')) byId('bigStatMerchants').textContent = merchCountText;
        if (byId('stat-members')) byId('stat-members').textContent = isProd ? '0' : '60';
        if (byId('bigStatMembers')) byId('bigStatMembers').textContent = isProd ? '0' : '60';
        if (byId('stat-transactions')) byId('stat-transactions').textContent = isProd ? '0' : '5';
        if (byId('bigStatTransactions')) byId('bigStatTransactions').textContent = isProd ? '0' : '5';
        if (byId('heroStatReturns')) byId('heroStatReturns').textContent = isProd ? '0.00' : 'مربوط بالدفتر';
        if (byId('bigStatReturns')) byId('bigStatReturns').textContent = isProd ? '0.00' : 'مربوط بالدفتر';
        const verifierChips = byId('homeVerifierDemoChips');
        if (verifierChips) verifierChips.style.display = isProd ? 'none' : 'inline-flex';
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
            const mVal = window.formatCurrency(Number((890 * cfg.fxRate).toFixed(0)), cfg.code);
            byId('walletMonthGain').textContent = `+${mVal}`;
        }
        if (byId('walletPreviewGeoTag')) {
            byId('walletPreviewGeoTag').textContent = `${cfg.flag} ${cfg.name} (${cfg.currencyCode})`;
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
        if (!countriesEl || !citiesEl) return;

        let cHtml = '';
        Object.keys(window.SAWYAN_GEO_CONFIG).forEach(function (code) {
            const item = window.SAWYAN_GEO_CONFIG[code];
            const active = modalDraftGeo.country === code ? 'active' : '';
            cHtml += `
                <button type="button" class="geo-country-opt ${active}" data-modal-country="${escapeHtml(code)}">
                    <div style="font-size:1.25rem; margin-bottom:2px;">${item.flag} <strong>${escapeHtml(item.name)}</strong></div>
                    <div style="font-size:0.78rem; color:#475569;">${escapeHtml(item.currencyCode)} • هدف: ${window.formatCurrency(item.monthlyTargetLocal, item.code)}</div>
                </button>
            `;
        });
        countriesEl.innerHTML = cHtml;

        countriesEl.querySelectorAll('[data-modal-country]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                modalDraftGeo.country = btn.getAttribute('data-modal-country');
                modalDraftGeo.city = 'all';
                renderGeoModalContent();
            });
        });

        const draftCfg = window.SAWYAN_GEO.getCountryConfig(modalDraftGeo.country);
        const citiesMap = draftCfg.cities || { all: 'جميع المدن' };
        let cityHtml = '';
        Object.keys(citiesMap).forEach(function (cKey) {
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
        const openTriggers = [byId('openGeoBarBtn'), byId('navGeoPill')];
        openTriggers.forEach(function (el) {
            if (el) el.addEventListener('click', openGeoModal);
        });
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

    function initHomeVerifier() {
        const form = byId('homeVerifierForm');
        const input = byId('homeVerifierInput');
        const resultBox = byId('homeVerifierResult');
        if (!form || !input || !resultBox) return;

        async function runVerify(codeRaw) {
            const code = String(codeRaw || '').trim().toUpperCase();
            if (!code) return;
            const pageUrl = `public/verify.html?code=${encodeURIComponent(code)}`;
            const isDemo = !(window.SAWYAN && window.SAWYAN.API) || window.SAWYAN.API.isDemoMode();

            // محاولة التحقق المباشر عبر PostgreSQL V3.0 (D26 Masked — بلا هواتف)
            let record = null;
            if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.supabase) {
                try {
                    const liveRes = await window.SAWYAN.API.publicVerifyTransaction(code);
                    if (liveRes && liveRes.found) {
                        const statusMap = {
                            completed: '✅ فاتورة موثقة ومحتسبة في صندوق الهدف',
                            pending: '⏳ قيد المراجعة / انتظار تأكيد التاجر',
                            awaiting_merchant_topup: '⏸️ بانتظار شحن رصيد التاجر (FIFO)',
                            reversed: '↩️ فاتورة مسترجعة / ملغاة'
                        };
                        record = {
                            code: liveRes.short_code,
                            statusText: statusMap[liveRes.status] || liveRes.status,
                            merchantName: `${liveRes.merchant_name}${liveRes.branch_name ? ' — ' + liveRes.branch_name : ''}`,
                            country: liveRes.currency_code || '—',
                            memberMasked: liveRes.masked_member_name,
                            amountLocal: `${Number(liveRes.total_amount).toFixed(2)} ${liveRes.currency_code || ''}`,
                            planRatePct: 'موثقة بالدفتر الحي',
                            targetAddedLocal: liveRes.payment_type || 'POS',
                            recordedAt: new Date(liveRes.created_at).toLocaleString('ar-EG')
                        };
                    }
                } catch (err) {
                    console.warn('Live verifier fallback check:', err.message);
                }
            }

            if (!record && isDemo) {
                const db = window.demoVerifyTransactions || {};
                record = db[code] || null;
            }

            if (record) {
                resultBox.style.display = 'block';
                resultBox.innerHTML = `
                    <div style="background:#ffffff; border:1.5px solid #10b981; border-radius:14px; padding:16px; text-align:right; color:#0f172a; box-shadow:0 6px 18px rgba(16,185,129,0.12);">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                            <strong style="color:#047857;">${escapeHtml(record.statusText)}</strong>
                            <code style="background:#f1f5f9; padding:3px 8px; border-radius:6px; font-weight:800;">${escapeHtml(record.code)}</code>
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap:8px; font-size:0.88rem;">
                            <div><strong>المتجر:</strong> ${escapeHtml(record.merchantName)}</div>
                            <div><strong>النطاق / العملة:</strong> ${escapeHtml(record.country)}</div>
                            <div><strong>العضو (مقنّع D26):</strong> ${escapeHtml(record.memberMasked)}</div>
                            <div><strong>قيمة الفاتورة:</strong> ${escapeHtml(record.amountLocal)}</div>
                            <div><strong>الحالة والتوثيق:</strong> ${escapeHtml(record.planRatePct)} (${escapeHtml(record.targetAddedLocal)})</div>
                            <div><strong>التوقيت:</strong> ${escapeHtml(record.recordedAt)}</div>
                        </div>
                        <div style="margin-top:12px; text-align:left;">
                            <a href="${pageUrl}" class="btn btn-primary btn-sm">فتح شهادة التحقق الكاملة ←</a>
                        </div>
                    </div>
                `;
            } else {
                resultBox.style.display = 'block';
                resultBox.innerHTML = `
                    <div style="background:#fff7ed; border:1.5px solid #f59e0b; border-radius:14px; padding:14px; color:#7c2d12; font-size:0.9rem;">
                        لم يتم العثور على الكود <strong>${escapeHtml(code)}</strong> في السجل الحالي. يمكنك فحصه مباشرة عبر <a href="${pageUrl}" style="font-weight:800; color:#b45309; text-decoration:underline;">بوابة التحقق الرسمية ↗</a> أو تجربة <code>SW-1001</code> في البيئة الموازية.
                    </div>
                `;
            }
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            runVerify(input.value);
        });

        document.querySelectorAll('.sample-verify-code').forEach(function (chip) {
            chip.addEventListener('click', function () {
                const c = chip.getAttribute('data-code') || 'SW-1001';
                input.value = c;
                runVerify(c);
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
        initHomeVerifier();

        const detected = window.SAWYAN_GEO
            ? window.SAWYAN_GEO.detectInitial()
            : { country: 'EG', city: 'cairo', source: 'default' };
        applyGeoContext(detected.country, detected.city, detected.source);
        loadLiveMerchantsForPortal();
    });
})();
