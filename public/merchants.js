/* =====================================================================
   SAWYAN Global Merchants Directory Script (Country/City/Type + Modal)
   ===================================================================== */

(function () {
    'use strict';

    const state = {
        country: 'ALL',
        city: 'all',
        type: 'all',
        category: 'all',
        search: '',
        sort: 'cashback',
        pendingRating: 5,
        activeMerchantId: null,
        pendingUrlMerchant: '',
        extraMerchants: [],
        activeFlashOffers: [],
        flashOffersByMerchant: new Map()
    };

    function formatOfferRemainingAr(sec) {
        const s = Math.max(0, Number(sec || 0));
        if (s < 3600) return `${Math.max(1, Math.round(s / 60))} دقيقة`;
        const hrs = Math.floor(s / 3600);
        if (hrs < 24) return `${hrs} ساعة`;
        const days = Math.floor(hrs / 24);
        const remH = hrs % 24;
        return remH > 0 ? `${days} يوم و${remH} س` : `${days} يوم`;
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

    function resolvePublicImg(src) {
        const s = String(src || '').trim();
        return s && !/^(https?:|data:image\/|\/|\.\.\/)/i.test(s) ? ('../' + s) : s;
    }

    function hydrateLogosAndTheme() {
        if (window.SAWYAN && window.SAWYAN.Logo && typeof window.SAWYAN.Logo.svg === 'function') {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            if (byId('navBrandLogo')) byId('navBrandLogo').innerHTML = window.SAWYAN.Logo.svg(isDark ? 'light-on-dark' : 'default');
            if (byId('footerBrandLogo')) {
                byId('footerBrandLogo').innerHTML = typeof window.SAWYAN.Logo.link === 'function'
                    ? window.SAWYAN.Logo.link('light-on-dark', { href: '../index.html' })
                    : `<a href="../index.html" class="logo-link sawyan-home-logo" aria-label="SAWYAN — الصفحة الرئيسية">${window.SAWYAN.Logo.svg('light-on-dark')}</a>`;
            }
        }
        const themeBtn = byId('themeToggleBtn');
        if (themeBtn) {
            const syncIcon = function () {
                const theme = document.documentElement.getAttribute('data-theme') || 'light';
                themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
                if (window.SAWYAN && window.SAWYAN.Logo && byId('navBrandLogo')) {
                    byId('navBrandLogo').innerHTML = window.SAWYAN.Logo.svg(theme === 'dark' ? 'light-on-dark' : 'default');
                }
            };
            syncIcon();
            themeBtn.addEventListener('click', function () {
                const curr = document.documentElement.getAttribute('data-theme') || 'light';
                const next = curr === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                try { localStorage.setItem('sawyan-theme', next); } catch (e) {}
                syncIcon();
            });
        }
    }

    function getAllMerchants() {
        const isDemo = !(window.SAWYAN && window.SAWYAN.API) || window.SAWYAN.API.isDemoMode();
        const base = (isDemo && Array.isArray(window.globalDemoMerchants)) ? window.globalDemoMerchants : [];
        return state.extraMerchants.concat(base);
    }

    function populateFilters() {
        const countrySel = byId('country-filter');
        const catSel = byId('category-filter');
        const pillsBox = byId('categories-pills');

        if (countrySel && window.SAWYAN_GEO_CONFIG) {
            const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
            const docLang = ls ? ls.getDocLang() : 'ar';
            const allCodes = Object.keys(window.SAWYAN_GEO_CONFIG);
            const topCodes = allCodes.filter(c => c === 'ALL');
            const botCodes = allCodes.filter(c => c === 'PIONEER');
            const midCodes = allCodes.filter(c => c !== 'ALL' && c !== 'PIONEER').sort(function (a, b) {
                const ca = window.SAWYAN_GEO_CONFIG[a];
                const cb = window.SAWYAN_GEO_CONFIG[b];
                const ma = window.SAWYAN && window.SAWYAN.getCountryByCode ? window.SAWYAN.getCountryByCode(a) : null;
                const mb = window.SAWYAN && window.SAWYAN.getCountryByCode ? window.SAWYAN.getCountryByCode(b) : null;
                const na = docLang === 'en' ? ((ma && ma.nameEn) || ca.name) : ca.name;
                const nb = docLang === 'en' ? ((mb && mb.nameEn) || cb.name) : cb.name;
                return ls ? ls.compareStrings(na, nb, docLang) : na.localeCompare(nb, docLang);
            });
            countrySel.innerHTML = topCodes.concat(midCodes, botCodes).map(function (code) {
                const cfg = window.SAWYAN_GEO_CONFIG[code];
                const m = window.SAWYAN && window.SAWYAN.getCountryByCode ? window.SAWYAN.getCountryByCode(code) : null;
                return `<option value="${escapeHtml(code)}" data-name-ar="${escapeHtml(cfg.name)}" data-name-en="${escapeHtml((m && m.nameEn) || cfg.name)}" data-flag="${escapeHtml(cfg.flag || '')}">${cfg.flag} ${escapeHtml(cfg.name)}</option>`;
            }).join('');
            countrySel.value = state.country;
            if (window.SAWYAN && window.SAWYAN.SmartSearch) {
                window.SAWYAN.SmartSearch.attachToSelect(countrySel, {
                    kind: 'country',
                    compact: true,
                    placeholder: 'ابحث عن الدولة (عربي / English)...',
                    showLetterHeaders: false,
                    skipEmptyPlaceholder: false
                });
            }
        }

        populateCityFilter();

        if (catSel && Array.isArray(window.categories)) {
            catSel.innerHTML = '<option value="all">جميع الفئات</option>' + window.categories.map(function (c) {
                return `<option value="${escapeHtml(c.slug)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`;
            }).join('');
            catSel.value = state.category;
        }

        if (pillsBox && Array.isArray(window.categories)) {
            let html = `<button type="button" class="category-pill ${state.category === 'all' ? 'active' : ''}" data-cat="all">جميع الفئات</button>`;
            window.categories.forEach(function (c) {
                const active = state.category === c.slug ? 'active' : '';
                html += `<button type="button" class="category-pill ${active}" data-cat="${escapeHtml(c.slug)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</button>`;
            });
            pillsBox.innerHTML = html;

            pillsBox.querySelectorAll('[data-cat]').forEach(function (pill) {
                pill.addEventListener('click', function () {
                    state.category = pill.getAttribute('data-cat') || 'all';
                    if (catSel) catSel.value = state.category;
                    populateFilters();
                    renderGrid();
                });
            });
        }
    }

    function populateCityFilter() {
        const citySel = byId('city-filter');
        if (!citySel || !window.SAWYAN_GEO) return;
        const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
        const docLang = ls ? ls.getDocLang() : 'ar';
        const cfg = window.SAWYAN_GEO.getCountryConfig(state.country);
        const cities = cfg.cities || { all: 'جميع المدن' };
        const keys = Object.keys(cities);
        const top = keys.filter(k => k === 'all');
        const rest = keys.filter(k => k !== 'all').sort(function (a, b) {
            const na = docLang === 'en' ? a : cities[a];
            const nb = docLang === 'en' ? b : cities[b];
            return ls ? ls.compareStrings(na, nb, docLang) : na.localeCompare(nb, docLang);
        });
        citySel.innerHTML = top.concat(rest).map(function (cKey) {
            return `<option value="${escapeHtml(cKey)}" data-name-ar="${escapeHtml(cities[cKey])}" data-name-en="${escapeHtml(cKey)}">📍 ${escapeHtml(cities[cKey])}</option>`;
        }).join('');
        if (!cities[state.city]) state.city = 'all';
        citySel.value = state.city;
        if (window.SAWYAN && window.SAWYAN.SmartSearch) {
            window.SAWYAN.SmartSearch.attachToSelect(citySel, {
                kind: 'city',
                compact: true,
                placeholder: 'ابحث عن المدينة...',
                showLetterHeaders: false,
                skipEmptyPlaceholder: false
            });
        }
    }

    function syncGeoLinksAndBanner() {
        if (!window.SAWYAN_GEO) return;
        const cfg = window.SAWYAN_GEO.getCountryConfig(state.country);
        const cityLabel = (state.city !== 'all' && cfg.cities && cfg.cities[state.city])
            ? ` — ${cfg.cities[state.city]}`
            : '';

        if (byId('merchantsGeoBanner')) {
            const svgFlag = (cfg.code && cfg.code !== 'ALL' && cfg.code !== 'PIONEER' && window.SAWYAN && window.SAWYAN.Flags && typeof window.SAWYAN.Flags.svg === 'function')
                ? window.SAWYAN.Flags.svg(cfg.code, 16)
                : escapeHtml(cfg.flag || '🌍');
            byId('merchantsGeoBanner').innerHTML = `${svgFlag} النطاق النشط: <strong>${escapeHtml(cfg.name + cityLabel)}</strong> (${escapeHtml(cfg.currencyCode)})`;
        }
        const extraBtn = byId('mobileExtraFiltersToggle');
        const extraGrp = byId('extraFiltersGroup');
        if (extraBtn && extraGrp && !extraBtn.dataset.bound) {
            extraBtn.dataset.bound = '1';
            extraBtn.addEventListener('click', function () {
                const isOpen = extraGrp.classList.toggle('open');
                extraBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                extraBtn.textContent = isOpen ? '⚙️ إخفاء خيارات النوع والترتيب ▴' : '⚙️ نوع المتجر والترتيب ▾';
            });
        }

        const geoQuery = `?country=${encodeURIComponent(cfg.code)}` + (state.city !== 'all' ? `&city=${encodeURIComponent(state.city)}` : '');
        ['navJoinLink', 'mobileJoinLink', 'bottomMemberCta', 'modal-join-btn'].forEach(function (id) {
            const el = byId(id);
            if (el) el.setAttribute('href', '../member-dashboard/register.html' + geoQuery);
        });
        if (byId('emptyMerchantCta')) {
            byId('emptyMerchantCta').setAttribute('href', '../merchant-dashboard/register.html' + geoQuery);
        }
    }

    function getFilteredMerchants() {
        if (state.country === 'PIONEER') return [];
        const list = getAllMerchants().filter(function (m) {
            const isGlobalOnline = m.merchantType === 'online' || m.merchantType === 'both';
            if (state.country !== 'ALL' && m.country !== state.country && !isGlobalOnline) return false;
            if (state.country !== 'ALL' && !isGlobalOnline && state.city !== 'all' && m.cityKey && m.cityKey !== 'all' && m.cityKey !== state.city) return false;
            if (state.type !== 'all' && m.merchantType !== state.type && m.merchantType !== 'both') return false;
            if (state.category !== 'all' && m.categorySlug !== state.category) return false;
            if (state.search) {
                const cMeta = window.SAWYAN && typeof window.SAWYAN.getCountryByCode === 'function'
                    ? window.SAWYAN.getCountryByCode(m.country) : null;
                const blob = [m.businessName, m.category, m.countryName, cMeta ? cMeta.nameAr : '', cMeta ? cMeta.nameEn : '', m.country, m.city, m.district, m.code, m.description].join(' ');
                if (window.SAWYAN && window.SAWYAN.SmartSearch && typeof window.SAWYAN.SmartSearch.matchesBilingualQuery === 'function') {
                    if (!window.SAWYAN.SmartSearch.matchesBilingualQuery(blob, state.search)) return false;
                } else if (!blob.toLowerCase().includes(state.search.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });

        list.sort(function (a, b) {
            const oa = (a.activeOffer || (a.merchantId && state.flashOffersByMerchant.has(String(a.merchantId)))) ? 1 : 0;
            const ob = (b.activeOffer || (b.merchantId && state.flashOffersByMerchant.has(String(b.merchantId)))) ? 1 : 0;
            if (oa !== ob) return ob - oa;
            if (state.sort === 'rating') return (b.rating || 0) - (a.rating || 0);
            if (state.sort === 'transactions') return (b.transactionsCount || 0) - (a.transactionsCount || 0);
            return (b.cashbackRate || 0) - (a.cashbackRate || 0);
        });

        return list;
    }

    function renderPublicFlashOffersStrip() {
        const box = byId('publicFlashOffersStrip');
        if (!box) return;
        const all = Array.isArray(state.activeFlashOffers) ? state.activeFlashOffers : [];
        if (!all.length) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        const cc = String(state.country || 'ALL').toUpperCase();
        const filtered = cc === 'ALL'
            ? all
            : all.filter(function (o) {
                return String(o.country_code || '').toUpperCase() === cc || o.merchant_type === 'online' || o.merchant_type === 'both';
            });
        const list = filtered.length > 0 ? filtered : all;
        box.style.display = 'block';
        box.innerHTML = `
            <div style="background:linear-gradient(135deg,#fffbeb 0%,#fef3c7 50%,#ecfdf5 100%);border:2px solid #f59e0b;border-radius:18px;padding:16px 18px;box-shadow:0 8px 24px rgba(245,158,11,0.14);">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                    <strong style="font-size:1.05rem;color:#0f172a;">🔥 عروض وحملات حصرية نشطة الآن (${list.length})</strong>
                    <span style="font-size:0.78rem;color:#92400e;font-weight:700;">اضغط على أي حملة لعرض تفاصيل المتجر</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:10px;">
                    ${list.slice(0, 6).map(function (o) {
                        const flag = (window.SAWYAN && window.SAWYAN.Flags) ? window.SAWYAN.Flags.svg(o.country_code, 16) : escapeHtml(o.country_code || '');
                        const rem = formatOfferRemainingAr(o.remaining_seconds);
                        const cardTarget = o.branch_id ? ('LIVE-' + o.branch_id) : o.merchant_id;
                        return `
                            <div class="pub-flash-card" data-open-merchant="${escapeHtml(cardTarget)}" tabindex="0" style="cursor:pointer;background:#fff;border:1.5px solid #fcd34d;border-radius:13px;padding:12px 14px;display:flex;flex-direction:column;justify-content:space-between;gap:8px;">
                                <div>
                                    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap;">
                                        <strong style="font-size:0.94rem;color:#0f172a;display:inline-flex;align-items:center;gap:5px;">🏪 ${escapeHtml(o.business_name)} ${flag}</strong>
                                        <span style="background:#fef2f2;color:#b91c1c;padding:2px 8px;border-radius:999px;font-size:0.71rem;font-weight:800;">⏳ متبقي ${escapeHtml(rem)}</span>
                                    </div>
                                    <div style="margin-top:6px;font-size:0.88rem;font-weight:800;color:#92400e;background:#fffbeb;border-right:3px solid #f59e0b;padding:6px 9px;border-radius:7px;line-height:1.5;">
                                        🔥 ${escapeHtml(o.title)}
                                    </div>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:0.76rem;">
                                    <span style="color:#047857;font-weight:800;">✨ عائدات فريقك ${Number(o.plan_cashback_pct || 0).toFixed(2)}%</span>
                                    <span style="color:#0f2744;font-weight:800;">تفاصيل المتجر ↗</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        box.querySelectorAll('.pub-flash-card[data-open-merchant]').forEach(function (el) {
            el.addEventListener('click', function () {
                openMerchantModalById(el.getAttribute('data-open-merchant'));
            });
        });
    }

    function renderGrid() {
        renderPublicFlashOffersStrip();
        const grid = byId('merchants-grid');
        const empty = byId('empty-state');
        const countEl = byId('merchants-count');
        if (!grid) return;

        syncGeoLinksAndBanner();
        const items = getFilteredMerchants();
        const cfg = window.SAWYAN_GEO.getCountryConfig(state.country);

        if (countEl) {
            countEl.textContent = state.country === 'PIONEER'
                ? 'التوسّع جارٍ في هذه المنطقة — تسجيلك وبناء فريقك متاحان فوراً'
                : `عرض ${items.length} تاجر معتمد في نطاق ${cfg.name}`;
        }

        if (items.length === 0) {
            grid.innerHTML = '';
            if (empty) {
                empty.style.display = 'block';
                const titleEl = byId('empty-state-title');
                if (titleEl) {
                    titleEl.textContent = state.country === 'PIONEER'
                        ? '🌍 التوسّع جارٍ في هذه المدينة — رشّح أول متجر!'
                        : 'لا توجد متاجر مطابقة لهذا البحث حالياً';
                }
            }
            return;
        }

        if (empty) empty.style.display = 'none';

        grid.innerHTML = items.map(function (m) {
            const icon = CATEGORY_ICONS[m.categorySlug] || '🏪';
            const netRate = typeof m.cashbackRate === 'number'
                ? m.cashbackRate
                : window.calcNetMemberCashback(m.generalCommissionRate || 10);
            const typeText = m.merchantType === 'online'
                ? '🌐 أونلاين'
                : (m.merchantType === 'both' ? '🏪🌐 محلي وأونلاين' : '🏪 فرع محلي');
            const rawImg = m.image || m.coverImageUrl || m.logoUrl || '';
            const resolvedImg = resolvePublicImg(rawImg);
            const safeImg = resolvedImg && (
                (window.SAWYAN && window.SAWYAN.ImageUpload && window.SAWYAN.ImageUpload.isSafeMediaUrl(resolvedImg))
                || /^(\.\.\/)?assets\/[A-Za-z0-9_.\-/]+\.(png|jpe?g|webp)$/i.test(resolvedImg)
                || /^https:\/\/[^/\s]+/i.test(resolvedImg)
                || /^data:image\/(jpeg|jpg|png|webp);base64,/i.test(resolvedImg)
            );
            const imgMarkup = safeImg
                ? `<img src="${escapeHtml(resolvedImg)}" alt="${escapeHtml(m.businessName)}" style="width:100%; height:100%; object-fit:cover;" loading="lazy" onerror="this.style.display='none';">`
                : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; background:linear-gradient(135deg,#0f2744 0%,#065f46 100%); color:#fff;">${icon}</div>`;

            const activeOffer = m.activeOffer || (m.merchantId ? state.flashOffersByMerchant.get(String(m.merchantId)) : null);
            const promoRibbon = activeOffer
                ? `<div style="background:linear-gradient(90deg,#fef3c7,#fde68a);border:1px solid #f59e0b;border-radius:9px;padding:6px 9px;margin:8px 0 4px;font-size:0.8rem;color:#78350f;font-weight:800;line-height:1.45;">🔥 عرض حصري الآن: ${escapeHtml(activeOffer.title)} <span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:999px;font-size:0.68rem;margin-right:4px;">⏳ ${escapeHtml(formatOfferRemainingAr(activeOffer.remaining_seconds))}</span></div>`
                : '';

            return `
                <article class="merchant-card" data-merchant-id="${escapeHtml(m.id)}" tabindex="0" style="cursor:pointer;${activeOffer ? 'border:2px solid #f59e0b;box-shadow:0 8px 24px rgba(245,158,11,0.18);' : ''}">
                    <div class="merchant-image">
                        ${imgMarkup}
                        ${activeOffer ? '<span style="position:absolute;top:10px;left:10px;z-index:3;background:#dc2626;color:#fff;font-size:0.72rem;font-weight:900;padding:4px 10px;border-radius:999px;">🔥 عرض خاص الآن</span>' : ''}
                        <span class="merchant-cashback net-cashback-badge">عائدات فريقك من هذا التاجر (${netRate}%)</span>
                    </div>
                    <div class="merchant-info">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                            <h3 class="merchant-name" style="margin:0;">${escapeHtml(m.businessName)}</h3>
                            ${m.isVerified ? '<span class="merchant-verified" title="تاجر معتمد">✓</span>' : ''}
                        </div>
                        ${promoRibbon}
                        <div class="merchant-category" style="margin-top:6px;">
                            ${escapeHtml(m.category)} • <span>${typeText}</span>
                        </div>
                        <div style="font-size:0.84rem; color:#475569; margin:6px 0;">
                            📍 ${escapeHtml(m.countryName || '')} — ${escapeHtml(m.city || '')}
                        </div>
                        <p style="font-size:0.85rem; color:#475569; margin:6px 0 12px; line-height:1.5;">${escapeHtml(m.description || '')}</p>
                        <div class="merchant-footer">
                            <div class="merchant-rating">
                                ${(Number(m.reviewsCount || 0) > 0 && Number(m.rating || 0) > 0)
                                    ? `<span class="stars">★</span><span>${escapeHtml(Number(m.rating).toFixed(1))}</span><span class="rating-count">(${window.formatNumber(m.reviewsCount)})</span>`
                                    : `<span style="background:#ecfdf5;color:#047857;padding:2px 8px;border-radius:999px;font-size:0.74rem;font-weight:800;">🆕 متجر جديد</span>`}
                            </div>
                            <span class="merchant-transactions">${Number(m.transactionsCount || 0) > 0 ? `${window.formatNumber(m.transactionsCount)} معاملة` : 'معتمد ✓'}</span>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        grid.querySelectorAll('.merchant-card[data-merchant-id]').forEach(function (card) {
            const id = card.getAttribute('data-merchant-id');
            card.addEventListener('click', function () {
                openMerchantModalById(id);
            });
            card.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') openMerchantModalById(id);
            });
        });
    }

    function getStoredReviews(merchantId) {
        try {
            const raw = localStorage.getItem('sawyan_reviews_' + merchantId);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveStoredReview(merchantId, review) {
        try {
            const existing = getStoredReviews(merchantId);
            existing.unshift(review);
            if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.isDemoMode()) { localStorage.setItem('sawyan_reviews_' + merchantId, JSON.stringify(existing)); }
        } catch (e) {}
    }

    function renderModalReviews(merchantId) {
        const base = typeof window.getMerchantReviews === 'function' ? window.getMerchantReviews(merchantId) : [];
        const extra = getStoredReviews(merchantId);
        const all = extra.concat(base);

        const listEl = byId('modal-reviews-list');
        const avgEl = byId('modal-reviews-avg');
        const starsEl = byId('modal-reviews-stars');
        const countEl = byId('modal-reviews-count');

        if (all.length === 0) {
            if (avgEl) avgEl.textContent = '5.0';
            if (starsEl) starsEl.textContent = '★★★★★';
            if (countEl) countEl.textContent = 'لا توجد مراجعات مكتوبة بعد';
            if (listEl) {
                listEl.innerHTML = `<div class="no-reviews"><div class="no-reviews-icon">💬</div><p>كن أول من يشارك تجربته مع هذا المتجر</p></div>`;
            }
            return;
        }

        const avg = (all.reduce(function (s, r) { return s + (Number(r.rating) || 5); }, 0) / all.length).toFixed(1);
        if (avgEl) avgEl.textContent = avg;
        if (starsEl) starsEl.textContent = window.generateStars(Math.round(Number(avg)));
        if (countEl) countEl.textContent = `${all.length} تقييم`;

        if (listEl) {
            listEl.innerHTML = all.map(function (r) {
                return `
                    <div class="review-card">
                        <div class="review-header">
                            <div class="review-author">
                                <div class="author-avatar">${escapeHtml((r.memberName || 'ع').slice(0, 1))}</div>
                                <div class="author-info">
                                    <div class="author-name">${escapeHtml(r.memberName)} <span class="verified-badge">✓ فاتورة موثقة</span></div>
                                    <div class="author-level gold">${escapeHtml(r.memberLevel || 'عضو SAWYAN')}</div>
                                </div>
                            </div>
                            <div class="review-rating">
                                <span class="review-stars">${window.generateStars(r.rating || 5)}</span>
                                <span class="review-date">${escapeHtml(r.date || '')}</span>
                            </div>
                        </div>
                        <p class="review-content">${escapeHtml(r.comment)}</p>
                    </div>
                `;
            }).join('');
        }
    }

    function openMerchantModalById(merchantId) {
        const m = getAllMerchants().find(function (item) {
            return String(item.id) === String(merchantId) || String(item.code) === String(merchantId);
        });
        if (!m) return;
        state.activeMerchantId = m.id;

        const modal = byId('merchant-modal');
        if (!modal) return;

        const icon = CATEGORY_ICONS[m.categorySlug] || '🏪';
        const netRate = typeof m.cashbackRate === 'number'
            ? m.cashbackRate
            : window.calcNetMemberCashback(m.generalCommissionRate || 10);
        const typeText = m.merchantType === 'online'
            ? '🌐 متجر إلكتروني'
            : (m.merchantType === 'both' ? '🏪🌐 فرع محلي ومتجر أونلاين' : '🏪 فرع محلي معتمد');

        if (byId('modal-merchant-icon')) {
            const iconBox = byId('modal-merchant-icon');
            const logoUrl = resolvePublicImg(m.logoUrl);
            const logoSafe = logoUrl && window.SAWYAN?.ImageUpload?.isSafeMediaUrl(logoUrl);
            if (logoSafe) {
                iconBox.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(m.businessName)}" style="width:56px;height:56px;border-radius:14px;object-fit:cover;border:2px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.22);">`;
            } else {
                iconBox.textContent = icon;
            }
        }
        const headerBg = byId('modal-header-bg');
        if (headerBg) {
            const coverSrc = resolvePublicImg(m.coverImageUrl || m.image || '');
            const coverSafe = coverSrc && (
                window.SAWYAN?.ImageUpload?.isSafeMediaUrl(coverSrc)
                || /^(\.\.\/)?assets\/[A-Za-z0-9_.\-/]+\.(png|jpe?g|webp)$/i.test(coverSrc)
            );
            if (coverSafe) {
                headerBg.style.backgroundImage = `linear-gradient(180deg, rgba(15,23,42,.35), rgba(15,23,42,.65)), url("${coverSrc.replace(/"/g, '')}")`;
                headerBg.style.backgroundSize = 'cover';
                headerBg.style.backgroundPosition = 'center';
            } else {
                headerBg.style.backgroundImage = '';
            }
        }
        const galleryEl = byId('modal-merchant-gallery');
        if (galleryEl) {
            const pics = []
                .concat(m.coverImageUrl ? [resolvePublicImg(m.coverImageUrl)] : [])
                .concat(m.logoUrl && m.logoUrl !== m.coverImageUrl ? [resolvePublicImg(m.logoUrl)] : [])
                .concat(Array.isArray(m.images) ? m.images.map(resolvePublicImg) : [])
                .filter((u, idx, arr) => u && arr.indexOf(u) === idx && (
                    window.SAWYAN?.ImageUpload?.isSafeMediaUrl(u)
                    || /^(\.\.\/)?assets\/[A-Za-z0-9_.\-/]+\.(png|jpe?g|webp)$/i.test(u)
                ));
            if (pics.length) {
                galleryEl.style.display = 'grid';
                galleryEl.innerHTML = pics.map((u, idx) => window.SAWYAN.ImageUpload.renderThumbHtml(u, `${m.businessName} (${idx + 1})`, { label: `صورة #${idx + 1}` })).join('');
            } else {
                galleryEl.style.display = 'none';
                galleryEl.innerHTML = '';
            }
        }
        if (byId('modal-merchant-type-badge')) byId('modal-merchant-type-badge').textContent = typeText;
        if (byId('modal-merchant-name')) byId('modal-merchant-name').textContent = m.businessName;
        if (byId('modal-merchant-code')) byId('modal-merchant-code').textContent = m.code || m.id;
        if (byId('modal-merchant-meta')) {
            byId('modal-merchant-meta').textContent = `${m.category} • 📍 ${m.countryName || ''} — ${m.city || ''} ${m.district ? '(' + m.district + ')' : ''}`;
        }
        if (byId('modal-merchant-desc')) {
            const modalOffer = m.activeOffer || (m.merchantId ? state.flashOffersByMerchant.get(String(m.merchantId)) : null);
            byId('modal-merchant-desc').innerHTML = (modalOffer
                ? `<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:2px solid #f59e0b;border-radius:12px;padding:10px 13px;margin-bottom:10px;color:#78350f;">` +
                    `<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:4px;"><strong>🔥 حملة ترويجية نشطة الآن</strong><span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:999px;font-size:0.72rem;font-weight:800;">⏳ متبقي ${escapeHtml(formatOfferRemainingAr(modalOffer.remaining_seconds))}</span></div>` +
                    `<div style="font-weight:900;font-size:0.95rem;">${escapeHtml(modalOffer.title)}</div>` +
                    (modalOffer.body && modalOffer.body !== modalOffer.title ? `<div style="font-size:0.84rem;margin-top:3px;">${escapeHtml(modalOffer.body)}</div>` : '') +
                  `</div>`
                : '') + escapeHtml(m.description || '');
        }
        if (byId('modal-net-cashback')) byId('modal-net-cashback').textContent = `${netRate}%`;
        if (byId('modal-merchant-rating')) {
            byId('modal-merchant-rating').textContent = (Number(m.reviewsCount || 0) > 0 && Number(m.rating || 0) > 0)
                ? `⭐ ${Number(m.rating).toFixed(1)}`
                : '🆕 جديد';
        }
        if (byId('modal-merchant-tx')) byId('modal-merchant-tx').textContent = window.formatNumber(m.transactionsCount || 0);

        const copyBtn = byId('modal-copy-code-btn');
        if (copyBtn) {
            copyBtn.textContent = 'نسخ كود المتجر 📋';
            copyBtn.onclick = function () {
                try { navigator.clipboard.writeText(m.code || m.id); } catch (e) {}
                copyBtn.textContent = 'تم النسخ ✓';
            };
        }

        const shareBtn = byId('modal-share-link-btn');
        if (shareBtn) {
            shareBtn.textContent = 'مشاركة رابط المتجر 🔗';
            const shareUrlObj = new URL(window.location.pathname, window.location.origin);
            shareUrlObj.searchParams.set('country', m.country || state.country || 'ALL');
            shareUrlObj.searchParams.set('merchant', m.code || m.id);
            const shareUrl = shareUrlObj.toString();

            const fallbackCopy = function (text) {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (_e) {}
                document.body.removeChild(ta);
            };

            const notifyCopied = function () {
                shareBtn.textContent = 'تم نسخ الرابط ✓';
                setTimeout(function () { shareBtn.textContent = 'مشاركة رابط المتجر 🔗'; }, 2200);
                if (window.SAWYAN && window.SAWYAN.UI && typeof window.SAWYAN.UI.toast === 'function') {
                    window.SAWYAN.UI.toast('تم نسخ رابط المتجر للمشاركة', 'success');
                }
            };

            shareBtn.onclick = function () {
                if (navigator.share) {
                    navigator.share({
                        title: m.businessName + ' — SAWYAN',
                        text: 'تسوّق من ' + m.businessName + ' عبر SAWYAN — عائدات فريقك ' + netRate + '%',
                        url: shareUrl
                    }).catch(function () {});
                } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    navigator.clipboard.writeText(shareUrl).then(notifyCopied).catch(function () {
                        fallbackCopy(shareUrl);
                        notifyCopied();
                    });
                } else {
                    fallbackCopy(shareUrl);
                    notifyCopied();
                }
            };
        }

        renderModalReviews(m.id);
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        const modal = byId('merchant-modal');
        if (modal) modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    function initModalEvents() {
        if (byId('modal-close-btn')) byId('modal-close-btn').addEventListener('click', closeModal);
        if (byId('merchant-modal')) {
            byId('merchant-modal').addEventListener('click', function (e) {
                if (e.target.id === 'merchant-modal') closeModal();
            });
        }
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeModal();
        });

        const formBox = byId('review-form-box');
        if (byId('toggle-review-form-btn') && formBox) {
            byId('toggle-review-form-btn').addEventListener('click', function () {
                const isDemo = !(window.SAWYAN && window.SAWYAN.API) || window.SAWYAN.API.isDemoMode();
                const savedMember = window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getSavedMember ? window.SAWYAN.API.getSavedMember() : null;
                if (!isDemo && (!savedMember || !savedMember.id)) {
                    if (window.SAWYAN?.UI?.toast) {
                        window.SAWYAN.UI.toast('التقييم متاح لأعضاء SAWYAN المسجّلين بعد توثيق فاتورة شراء فعلية.', 'info');
                    }
                    return;
                }
                formBox.style.display = formBox.style.display === 'none' ? 'block' : 'none';
            });
        }

        // Mobile Drawer toggle on Merchants Directory
        const mBtn = byId('merchantsMobileMenuBtn');
        const mOv = byId('merchantsMobileOverlay');
        const mClose = byId('merchantsMobileCloseBtn');
        const mDrawer = mOv ? mOv.querySelector('.mobile-menu') : null;
        if (mBtn && mOv) {
            const setOpen = (open) => {
                mOv.classList.toggle('active', open);
                if (mDrawer) mDrawer.classList.toggle('active', open);
                mBtn.classList.toggle('active', open);
                mOv.style.display = open ? 'block' : '';
                mOv.setAttribute('aria-hidden', String(!open));
                mBtn.setAttribute('aria-expanded', String(open));
                document.body.style.overflow = open ? 'hidden' : '';
            };
            mBtn.addEventListener('click', () => setOpen(!mOv.classList.contains('active')));
            if (mClose) mClose.addEventListener('click', () => setOpen(false));
            mOv.addEventListener('click', (e) => { if (e.target === mOv) setOpen(false); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mOv.classList.contains('active')) setOpen(false); });
        }
        if (byId('cancel-review-btn') && formBox) {
            byId('cancel-review-btn').addEventListener('click', function () {
                formBox.style.display = 'none';
            });
        }

        const starsBox = byId('review-stars-input');
        if (starsBox && typeof window.generateStarsInteractive === 'function') {
            starsBox.innerHTML = window.generateStarsInteractive(5);
            starsBox.querySelectorAll('.star').forEach(function (starEl) {
                starEl.addEventListener('click', function () {
                    state.pendingRating = Number(starEl.getAttribute('data-rating')) || 5;
                    starsBox.querySelectorAll('.star').forEach(function (s) {
                        s.classList.toggle('active', Number(s.getAttribute('data-rating')) <= state.pendingRating);
                    });
                });
            });
        }

        if (byId('submit-review-btn')) {
            byId('submit-review-btn').addEventListener('click', function () {
                const nameEl = byId('review-author-name');
                const commentEl = byId('review-comment-text');
                const author = (nameEl && nameEl.value.trim()) || 'متسوق SAWYAN';
                const comment = (commentEl && commentEl.value.trim()) || '';
                if (!comment || !state.activeMerchantId) return;

                saveStoredReview(state.activeMerchantId, {
                    id: 'REV-' + Date.now(),
                    memberName: author,
                    memberLevel: 'عضو نشط',
                    rating: state.pendingRating || 5,
                    comment: comment,
                    date: new Date().toISOString().slice(0, 10)
                });
                if (nameEl) nameEl.value = '';
                if (commentEl) commentEl.value = '';
                if (formBox) formBox.style.display = 'none';
                renderModalReviews(state.activeMerchantId);
            });
        }
    }

    async function loadSupabaseMerchantsSafely() {
        try {
            if (!(window.SAWYAN && window.SAWYAN.API)) return;
            // الانتظار قليلاً إذا كان عميل Supabase قيد التهيئة
            for (let i = 0; i < 15 && !window.SAWYAN.supabase; i++) {
                await new Promise(r => setTimeout(r, 100));
            }
            if (!window.SAWYAN.supabase) return;

            const [rows, offers] = await Promise.all([
                window.SAWYAN.API.getPublicMerchantsCatalog({}),
                typeof window.SAWYAN.API.getPublicActiveFlashOffers === 'function'
                    ? window.SAWYAN.API.getPublicActiveFlashOffers({}).catch(function () { return []; })
                    : Promise.resolve([])
            ]);

            state.activeFlashOffers = Array.isArray(offers) ? offers : [];
            state.flashOffersByMerchant = new Map();
            state.activeFlashOffers.forEach(function (of) {
                if (of && of.merchant_id && !state.flashOffersByMerchant.has(String(of.merchant_id))) {
                    state.flashOffersByMerchant.set(String(of.merchant_id), of);
                }
            });

            if (Array.isArray(rows) && rows.length > 0) {
                state.extraMerchants = rows.map(function (m) {
                    const cCode = String(m.country_code || 'EG').toUpperCase();
                    const cfg = window.SAWYAN_GEO ? window.SAWYAN_GEO.getCountryConfig(cCode) : { name: cCode, cities: { all: 'جميع المدن' } };
                    const netPct = Number(m.plan_cashback_pct || 0);
                    return {
                        id: 'LIVE-' + m.branch_id,
                        merchantId: m.merchant_id,
                        branchId: m.branch_id,
                        code: m.merchant_code || 'SAWYAN',
                        businessName: m.business_name + (m.branch_name ? ' — ' + m.branch_name : ''),
                        category: m.category || 'services',
                        categorySlug: m.category || 'services',
                        cashbackRate: netPct,
                        rating: Number(m.avg_rating || 0),
                        reviewsCount: Number(m.reviews_count || 0),
                        transactionsCount: Number(m.completed_tx_count || 0),
                        isVerified: true,
                        isLiveDb: true,
                        country: cCode,
                        countryName: cfg.name,
                        cityKey: 'all',
                        city: m.branch_name || (cfg.cities && cfg.cities.all) || '',
                        district: m.address || '',
                        merchantType: m.merchant_type || 'physical',
                        logoUrl: m.logo_url || null,
                        coverImageUrl: m.cover_image_url || null,
                        images: Array.isArray(m.images) ? m.images : [],
                        image: m.cover_image_url || m.logo_url || null,
                        activeOffer: state.flashOffersByMerchant.get(String(m.merchant_id)) || null,
                        description: m.address || 'متجر معتمد متصل بقاعدة بيانات SAWYAN الحية'
                    };
                });
                renderGrid();
                if (state.pendingUrlMerchant && !state.activeMerchantId) {
                    openMerchantModalById(state.pendingUrlMerchant);
                }
            } else {
                renderPublicFlashOffersStrip();
            }
        } catch (e) {
            console.warn('Public merchants catalog fetch warning:', e.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        hydrateLogosAndTheme();

        const params = new URLSearchParams(window.location.search);
        const urlCountry = (params.get('country') || '').toUpperCase();
        const urlCity = (params.get('city') || '').toLowerCase();
        const urlCat = params.get('cat');
        const urlType = params.get('type');
        const urlMerchant = params.get('merchant') || (window.location.hash ? window.location.hash.slice(1) : '');
        state.pendingUrlMerchant = urlMerchant;

        if (urlCountry && window.SAWYAN_GEO_CONFIG && window.SAWYAN_GEO_CONFIG[urlCountry]) {
            state.country = urlCountry;
            const cfg = window.SAWYAN_GEO.getCountryConfig(urlCountry);
            state.city = (urlCity && cfg.cities[urlCity]) ? urlCity : 'all';
        } else if (window.SAWYAN_GEO) {
            const detected = window.SAWYAN_GEO.detectInitial();
            state.country = detected.country;
            state.city = detected.city || 'all';
        }

        if (urlCat) state.category = urlCat;
        if (urlType) state.type = urlType;

        populateFilters();

        if (byId('type-filter')) {
            byId('type-filter').value = state.type;
            byId('type-filter').addEventListener('change', function (e) {
                state.type = e.target.value;
                renderGrid();
            });
        }
        if (byId('country-filter')) {
            byId('country-filter').addEventListener('change', function (e) {
                state.country = e.target.value;
                state.city = 'all';
                window.SAWYAN_GEO.save({ country: state.country, city: 'all' });
                populateCityFilter();
                renderGrid();
            });
        }
        if (byId('city-filter')) {
            byId('city-filter').addEventListener('change', function (e) {
                state.city = e.target.value;
                window.SAWYAN_GEO.save({ country: state.country, city: state.city });
                renderGrid();
            });
        }
        if (byId('category-filter')) {
            byId('category-filter').addEventListener('change', function (e) {
                state.category = e.target.value;
                populateFilters();
                renderGrid();
            });
        }
        if (byId('sort-filter')) {
            byId('sort-filter').addEventListener('change', function (e) {
                state.sort = e.target.value;
                renderGrid();
            });
        }
        if (byId('search-input')) {
            byId('search-input').addEventListener('input', function (e) {
                state.search = e.target.value.trim();
                renderGrid();
            });
        }
        if (byId('reset-filters-btn')) {
            byId('reset-filters-btn').addEventListener('click', function () {
                state.country = 'ALL';
                state.city = 'all';
                state.type = 'all';
                state.category = 'all';
                state.search = '';
                if (byId('search-input')) byId('search-input').value = '';
                if (byId('type-filter')) byId('type-filter').value = 'all';
                window.SAWYAN_GEO.save({ country: 'ALL', city: 'all' });
                populateFilters();
                renderGrid();
            });
        }

        initModalEvents();
        renderGrid();
        loadSupabaseMerchantsSafely();

        if (urlMerchant) {
            setTimeout(function () {
                openMerchantModalById(urlMerchant);
            }, 60);
        }
    });
})();
