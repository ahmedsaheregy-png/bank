/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — V3.0 MEMBER REGISTRATION (Workflow 1 + G01-G05 + Stage 7)
 * - Live Active Countries & Cities from PostgreSQL (`get_public_active_countries_and_cities`)
 * - Manual City / District Fallback ("مدينة أخرى") so zero customers are blocked
 * - Sovereign Founder One-Time Root #0 Invite Token (`?root_token=...`)
 * ============================================================================
 */

let sponsorLookupTimeout = null;
let verifiedSponsorRecord = null;
let activeRootInviteToken = null;
let liveCountriesCache = [];

const DIAL_MAP = {
    EG: '+20', SA: '+966', TR: '+90', AE: '+971', KW: '+965', QA: '+974',
    BH: '+973', OM: '+968', JO: '+962', MA: '+212', DE: '+49', US: '+1', GB: '+44'
};

document.addEventListener('DOMContentLoaded', async function () {
    const logoEl = document.getElementById('logoContainer');
    if (logoEl && window.SAWYAN && window.SAWYAN.Logo) {
        logoEl.innerHTML = window.SAWYAN.Logo.full();
    }

    initSponsorLookup();

    const params = new URLSearchParams(window.location.search);
    const urlCountry = (params.get('country') || '').trim().toUpperCase();
    const urlCity = (params.get('city') || '').trim().toLowerCase();
    const rootToken = (params.get('root_token') || '').trim();
    const urlRef = (params.get('ref') || params.get('sponsor') || '').trim();

    await loadLiveCountriesAndCities(urlCountry, urlCity);

    const sponsorInput = document.getElementById('sponsorCode');
    if (rootToken) {
        await verifyFounderRootToken(rootToken);
    } else if (urlRef && sponsorInput) {
        sponsorInput.value = urlRef;
        setTimeout(() => lookupSponsor(urlRef), 200);
    } else if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.isDemoMode() && sponsorInput && !sponsorInput.value) {
        sponsorInput.placeholder = 'للتجربة في الموقع الموازي استخدم كود القائد: 1';
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
});

async function waitForSawyanApi() {
    for (let i = 0; i < 20 && (!window.SAWYAN || !window.SAWYAN.API || !window.SAWYAN.supabase); i++) {
        await new Promise(r => setTimeout(r, 100));
    }
}

async function loadLiveCountriesAndCities(preferredCountry, preferredCity) {
    try {
        await waitForSawyanApi();
        let activeCountries = [];
        let dbAllCountries = [];
        if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getPublicActiveCountriesAndCities) {
            const pub = await window.SAWYAN.API.getPublicActiveCountriesAndCities();
            activeCountries = (pub && pub.countries) || [];
            dbAllCountries = (pub && pub.all_countries) || activeCountries;
        }

        const worldList = (window.SAWYAN && Array.isArray(window.SAWYAN.Countries)) ? window.SAWYAN.Countries : [];
        const worldByCode = new Map(worldList.map(w => [w.code, w]));
        const dbByCode = new Map(dbAllCountries.map(c => [String(c.country_code || '').trim().toUpperCase(), c]));

        // Merge DB countries + full world ISO list so every member worldwide can register
        const mergedMap = new Map();
        dbAllCountries.forEach(c => {
            const code = String(c.country_code || '').trim().toUpperCase();
            if (!code) return;
            const w = worldByCode.get(code) || {};
            mergedMap.set(code, {
                country_code: code,
                nameAr: (c.country_name_i18n && c.country_name_i18n.ar) || w.nameAr || code,
                nameEn: (c.country_name_i18n && c.country_name_i18n.en) || w.nameEn || code,
                currency_code: c.currency_code || 'USD',
                flag: w.flag || '🌍',
                dialCode: w.dialCode || DIAL_MAP[code] || '+',
                is_active: Boolean(c.is_active),
                cities: Array.isArray(c.cities) ? c.cities : []
            });
        });
        worldList.forEach(w => {
            const code = String(w.code || '').trim().toUpperCase();
            if (!code || mergedMap.has(code)) return;
            mergedMap.set(code, {
                country_code: code,
                nameAr: w.nameAr || w.nameEn || code,
                nameEn: w.nameEn || code,
                currency_code: 'USD',
                flag: w.flag || '🌍',
                dialCode: w.dialCode || '+',
                is_active: false,
                cities: []
            });
        });

        const mergedAll = Array.from(mergedMap.values());
        if (!mergedAll.length) return;
        liveCountriesCache = mergedAll;

        const activeList = mergedAll.filter(c => c.is_active).sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
        const globalList = mergedAll.filter(c => !c.is_active).sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));

        const resSel = document.getElementById('countryOfResidence');
        const natSel = document.getElementById('nationality');
        const citySel = document.getElementById('citySelect');

        function updateCountryBanner(code) {
            if (!resSel) return;
            let banner = document.getElementById('globalCountryInfoBanner');
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'globalCountryInfoBanner';
                banner.style.cssText = 'display:none;margin-top:8px;padding:10px 12px;border-radius:10px;background:#eff6ff;border:1px solid #93c5fd;color:#1e3a8a;font-size:0.78rem;font-weight:700;line-height:1.55;';
                resSel.parentNode.appendChild(banner);
            }
            const entry = mergedMap.get(code);
            if (entry && !entry.is_active) {
                banner.style.display = 'block';
                banner.innerHTML = `🌍 <strong>التسجيل العالمي المفتوح:</strong> يمكنك التسجيل الآن وبناء فريقك في كل الدول النشطة عبر <strong>التأهل التعويضي (D1)</strong>، وستتفعّل المتاجر المحلية في <strong>${entry.nameAr}</strong> فور فتح بوابة الدولة.`;
            } else {
                banner.style.display = 'none';
            }
        }

        function syncPhoneAndCityForCountry(code, prefCity) {
            const entry = mergedMap.get(code);
            if (typeof window.handleCountryChange === 'function') {
                window.handleCountryChange(code, prefCity);
            }
            const flagEl = document.getElementById('countryFlag');
            const dialEl = document.getElementById('countryDialCode');
            if (entry && flagEl) flagEl.textContent = entry.flag || '🌍';
            if (entry && dialEl && entry.dialCode) dialEl.textContent = entry.dialCode;
            populateLiveCities(code, prefCity);
            updateCountryBanner(code);
        }

        if (resSel) {
            const defaultCode = (preferredCountry && mergedMap.has(preferredCountry))
                ? preferredCountry
                : (mergedMap.has('EG') ? 'EG' : mergedAll[0].country_code);

            let optHtml = '';
            if (activeList.length) {
                optHtml += `<optgroup label="🟢 الدول النشطة حالياً (متاجر محلية مفعّلة)">` +
                    activeList.map(c => `<option value="${c.country_code}">${c.flag} ${c.nameAr} (${c.currency_code}) — نشطة</option>`).join('') +
                    `</optgroup>`;
            }
            if (globalList.length) {
                optHtml += `<optgroup label="🌍 باقي دول العالم (التسجيل العالمي المفتوح)">` +
                    globalList.map(c => `<option value="${c.country_code}">${c.flag} ${c.nameAr} (${c.currency_code})</option>`).join('') +
                    `</optgroup>`;
            }
            resSel.innerHTML = optHtml;
            resSel.value = defaultCode;

            resSel.onchange = function () {
                syncPhoneAndCityForCountry(this.value, null);
            };
        }

        if (natSel) {
            const allSorted = mergedAll.slice().sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
            const natVal = (preferredCountry && mergedMap.has(preferredCountry))
                ? preferredCountry
                : (resSel ? resSel.value : 'EG');
            natSel.innerHTML = allSorted.map(c => `<option value="${c.country_code}">${c.flag} ${c.nameAr}</option>`).join('');
            if (mergedMap.has(natVal)) natSel.value = natVal;
        }

        // Ensure manual city input fallback exists
        if (citySel && !document.getElementById('manualCityInputWrap')) {
            const wrap = document.createElement('div');
            wrap.id = 'manualCityInputWrap';
            wrap.style.cssText = 'display:none;margin-top:8px;';
            wrap.innerHTML = '<input type="text" id="manualCityCustomInput" class="form-control" placeholder="اكتب اسم مدينتك أو منطقتك هنا...">';
            citySel.parentNode.appendChild(wrap);
            citySel.addEventListener('change', function () {
                wrap.style.display = this.value === 'OTHER_MANUAL' ? 'block' : 'none';
            });
        }

        if (resSel) {
            syncPhoneAndCityForCountry(resSel.value, preferredCity);
        }
    } catch (e) {
        console.warn('Live countries fallback:', e.message);
    }
}

let geoCityReqSeq = 0;
let geoDistrictReqSeq = 0;
let districtSearchTimer = null;

function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function renderCityOptionsHtml(cities) {
    let html = (cities || []).map(g =>
        `<option value="GEO_${g.geoname_id}" data-admin1="${escAttr(g.admin1_name || '')}" data-asciiname="${escAttr(g.asciiname || '')}">${escAttr(g.city_name)}</option>`
    ).join('');
    html += '<option value="OTHER_MANUAL">📍 مدينة / منطقة أخرى (كتابة يدوية)</option>';
    return html;
}

async function populateLiveCities(countryCode, preferredCity) {
    const citySel = document.getElementById('citySelect');
    if (!citySel || !liveCountriesCache.length) return;
    const reqId = ++geoCityReqSeq;
    const cty = liveCountriesCache.find(c => c.country_code === countryCode);
    let cities = (cty && Array.isArray(cty.cities)) ? cty.cities.slice() : [];

    // For countries with fewer than 5 preloaded primary cities, fetch real world cities from GeoNames DB
    if (cities.length < 5 && window.SAWYAN && window.SAWYAN.API && typeof window.SAWYAN.API.searchGeonamesLocations === 'function') {
        try {
            const gRes = await window.SAWYAN.API.searchGeonamesLocations({ countryCode, kind: 'cities', limit: 120 });
            if (reqId !== geoCityReqSeq) return;
            const fetched = Array.isArray(gRes?.results) ? gRes.results : [];
            if (fetched.length > 0) {
                const seenIds = new Set(cities.map(x => Number(x.geoname_id)));
                fetched.forEach(item => {
                    if (!seenIds.has(Number(item.geoname_id))) {
                        seenIds.add(Number(item.geoname_id));
                        cities.push(item);
                    }
                });
                if (cty) cty.cities = cities;
            }
        } catch (e) {
            console.warn('GeoNames cities fetch fallback:', e.message);
        }
    }

    if (reqId !== geoCityReqSeq) return;

    citySel.innerHTML = renderCityOptionsHtml(cities);

    const wrap = document.getElementById('manualCityInputWrap');
    const DEFAULT_CAPITAL_BY_COUNTRY = { EG: 'cairo', TR: 'istanbul', SA: 'riyadh', AE: 'dubai', DE: 'berlin', US: 'new york', GB: 'london' };
    const effectiveCityPref = String(preferredCity || DEFAULT_CAPITAL_BY_COUNTRY[countryCode] || '').trim().toLowerCase();
    if (cities.length === 0) {
        citySel.value = 'OTHER_MANUAL';
        if (wrap) wrap.style.display = 'block';
    } else {
        if (wrap) wrap.style.display = 'none';
        if (effectiveCityPref) {
            const found = Array.from(citySel.options).find(o => {
                const txt = (o.textContent || '').toLowerCase();
                const asc = (o.dataset && o.dataset.asciiname ? o.dataset.asciiname : '').toLowerCase();
                return txt.includes(effectiveCityPref) || asc.includes(effectiveCityPref);
            });
            if (found) citySel.value = found.value;
        }
    }

    const searchInp = document.getElementById('districtSearchInput');
    if (searchInp) searchInp.value = '';

    if (typeof window.handleCityChange === 'function') {
        window.handleCityChange(citySel.value);
    }
}

window.loadGeoDistrictsForCity = async function (countryCode, cityOpt, queryText = '') {
    const reqId = ++geoDistrictReqSeq;
    const districtSelect = document.getElementById('districtSelect');
    const manualDistrictInput = document.getElementById('manualDistrictInput');
    const hintEl = document.getElementById('districtGeoHint');
    if (!districtSelect || !window.SAWYAN || !window.SAWYAN.API || typeof window.SAWYAN.API.searchGeonamesLocations !== 'function') {
        return;
    }

    const cc = String(countryCode || 'EG').toUpperCase();
    const q = String(queryText || '').trim();
    if (cityOpt && cityOpt.value === 'OTHER_MANUAL' && !q) {
        districtSelect.style.display = 'none';
        districtSelect.innerHTML = '<option value="__MANUAL__" selected>كتابة يدوية</option>';
        if (manualDistrictInput) manualDistrictInput.style.display = 'block';
        if (hintEl) {
            hintEl.textContent = 'اكتب اسم الحي أو المنطقة يدوياً أدناه (إلزامي)';
            hintEl.style.color = '#d97706';
        }
        return;
    }

    const adm1 = (cityOpt && cityOpt.dataset ? cityOpt.dataset.admin1 : '') || '';
    const asc = (cityOpt && cityOpt.dataset ? cityOpt.dataset.asciiname : '') || '';
    const subCityPreferAscii = new Set(['Jeddah', 'Taif', 'Dammam', 'Khobar', 'Abha', 'Tabuk', 'Buraidah']);
    const admin1Filter = subCityPreferAscii.has(asc) ? asc : (adm1 || asc || null);

    try {
        let gRes = await window.SAWYAN.API.searchGeonamesLocations({
            countryCode: cc,
            query: q,
            admin1Filter: admin1Filter,
            kind: 'districts',
            limit: 120
        });
        if (reqId !== geoDistrictReqSeq) return;
        let list = Array.isArray(gRes?.results) ? gRes.results : [];

        // If a global country city has no sub-district rows tagged __GEO_DISTRICT__, fall back to region/all places
        if (list.length === 0 && !q && admin1Filter) {
            const gAll = await window.SAWYAN.API.searchGeonamesLocations({
                countryCode: cc,
                query: '',
                admin1Filter: admin1Filter,
                kind: 'all',
                limit: 120
            });
            if (reqId !== geoDistrictReqSeq) return;
            list = Array.isArray(gAll?.results) ? gAll.results : [];
        }

        const normalizeArKey = (str) => String(str || '')
            .replace(/[\u064B-\u065F\u0670]/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
        const isArabOrTr = new Set(['EG', 'TR', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'MA', 'TN', 'DZ', 'IQ', 'LB', 'PS', 'SD', 'LY', 'YE']).has(cc);
        const hasAnyArabic = list.some(r => /[\u0600-\u06FF]/.test(String(r.city_name || '')));

        // Deduplicate district names preserving curated Arabic priority order and filtering noise
        const uniqueNames = [];
        const seen = new Set();
        for (const r of list) {
            const nm = String(r.city_name || '').trim();
            if (!nm) continue;
            if (isArabOrTr && hasAnyArabic && !/[\u0600-\u06FF]/.test(nm)) continue;
            const key = normalizeArKey(nm);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            uniqueNames.push(nm);
        }

        if (uniqueNames.length > 0) {
            districtSelect.style.display = 'block';
            districtSelect.innerHTML =
                uniqueNames.map((nm, idx) => `<option value="${escAttr(nm)}" ${idx === 0 ? 'selected' : ''}>${escAttr(nm)}</option>`).join('') +
                '<option value="__MANUAL__">✏️ حي / قرية أخرى غير مدرجة (كتابة يدوية)</option>';
            if (manualDistrictInput) {
                manualDistrictInput.style.display = 'none';
                manualDistrictInput.value = '';
            }
            if (hintEl) {
                hintEl.textContent = `📍 ${uniqueNames.length} حي/منطقة متاحة (GeoNames)`;
                hintEl.style.color = '#059669';
            }
        } else {
            districtSelect.style.display = 'none';
            districtSelect.innerHTML = '<option value="__MANUAL__" selected>كتابة يدوية</option>';
            if (manualDistrictInput) {
                manualDistrictInput.style.display = 'block';
            }
            if (hintEl) {
                hintEl.textContent = q ? 'لم يتم العثور على نتيجة مطابقة — اكتب اسم الحي يدوياً أدناه (إلزامي)' : 'اكتب اسم الحي أو المنطقة يدوياً أدناه (إلزامي)';
                hintEl.style.color = '#d97706';
            }
        }
    } catch (e) {
        console.warn('GeoNames districts search error:', e.message);
    }
};

document.addEventListener('DOMContentLoaded', function () {
    const searchInp = document.getElementById('districtSearchInput');
    if (searchInp) {
        searchInp.addEventListener('input', function () {
            clearTimeout(districtSearchTimer);
            const val = this.value || '';
            districtSearchTimer = setTimeout(() => {
                const cc = (document.getElementById('countryOfResidence')?.value || 'EG').toUpperCase();
                const citySel = document.getElementById('citySelect');
                const opt = (citySel && citySel.selectedOptions && citySel.selectedOptions[0]) || null;
                if (typeof window.loadGeoDistrictsForCity === 'function') {
                    window.loadGeoDistrictsForCity(cc, opt, val);
                }
            }, 220);
        });
    }
});

async function verifyFounderRootToken(token) {
    const display = document.getElementById('sponsorNameDisplay');
    const text = document.getElementById('sponsorNameText');
    const icon = document.getElementById('sponsorStatusIcon');
    const sponsorInput = document.getElementById('sponsorCode');
    const confirmRow = document.getElementById('sponsorConfirmRow');
    const confirmBox = document.getElementById('sponsorConfirmCheckbox');

    try {
        await waitForSawyanApi();
        const res = await window.SAWYAN.API.verifyRootInviteToken(token);
        if (res && res.valid) {
            activeRootInviteToken = token;
            verifiedSponsorRecord = { found: true, member_code: 0, full_name: res.display_name, is_root_token: true };
            if (sponsorInput) {
                sponsorInput.value = '0';
                sponsorInput.readOnly = true;
                sponsorInput.style.background = '#ecfdf5';
                sponsorInput.style.fontWeight = '900';
            }
            if (display) display.className = 'sponsor-name-display valid';
            if (text) text.textContent = res.display_name + (res.leader_note ? ` — (${res.leader_note})` : '');
            if (icon) icon.textContent = '👑';
            if (confirmRow) confirmRow.style.display = 'none';
            if (confirmBox) confirmBox.checked = true;
            if (res.country_code) {
                const resSel = document.getElementById('countryOfResidence');
                if (resSel && Array.from(resSel.options).some(o => o.value === res.country_code)) {
                    resSel.value = res.country_code;
                    populateLiveCities(res.country_code, null);
                }
            }
        } else {
            if (display) display.className = 'sponsor-name-display invalid';
            if (text) text.textContent = '⛔ رابط الدعوة التأسيسي غير صالح أو تم استخدامه مسبقاً.';
            if (icon) icon.textContent = '⛔';
        }
    } catch (err) {
        if (text) text.textContent = '⚠️ ' + err.message;
    }
}

function initSponsorLookup() {
    const sponsorCodeInput = document.getElementById('sponsorCode');
    if (!sponsorCodeInput) return;

    sponsorCodeInput.addEventListener('input', function (e) {
        if (activeRootInviteToken) return;
        const code = e.target.value.trim();
        verifiedSponsorRecord = null;
        if (sponsorLookupTimeout) clearTimeout(sponsorLookupTimeout);
        if (!code) {
            resetSponsorDisplay();
            return;
        }
        sponsorLookupTimeout = setTimeout(() => lookupSponsor(code), 350);
    });

    sponsorCodeInput.addEventListener('blur', function (e) {
        if (activeRootInviteToken) return;
        const code = e.target.value.trim();
        if (code) lookupSponsor(code);
    });
}

function resetSponsorDisplay() {
    if (activeRootInviteToken) return;
    const display = document.getElementById('sponsorNameDisplay');
    const text = document.getElementById('sponsorNameText');
    const icon = document.getElementById('sponsorStatusIcon');
    const sponsorIdInput = document.getElementById('sponsorId');
    const confirmRow = document.getElementById('sponsorConfirmRow');
    const confirmBox = document.getElementById('sponsorConfirmCheckbox');

    verifiedSponsorRecord = null;
    if (display) display.className = 'sponsor-name-display';
    if (text) text.textContent = 'أدخل كود الراعي ليظهر اسمه الكامل للتأكيد...';
    if (icon) icon.textContent = '⚪';
    if (sponsorIdInput) sponsorIdInput.value = '';
    if (confirmRow) confirmRow.style.display = 'none';
    if (confirmBox) confirmBox.checked = false;
}

async function lookupSponsor(codeRaw) {
    if (activeRootInviteToken) return;
    const display = document.getElementById('sponsorNameDisplay');
    const text = document.getElementById('sponsorNameText');
    const icon = document.getElementById('sponsorStatusIcon');
    const sponsorIdInput = document.getElementById('sponsorId');
    const confirmRow = document.getElementById('sponsorConfirmRow');
    const confirmLabel = document.getElementById('sponsorConfirmLabel');
    const confirmBox = document.getElementById('sponsorConfirmCheckbox');

    const numericCode = parseInt(String(codeRaw || '').trim(), 10);
    if (isNaN(numericCode) || numericCode < 0) {
        resetSponsorDisplay();
        return;
    }

    if (display) display.className = 'sponsor-name-display loading';
    if (text) text.textContent = 'جاري التحقق من الراعي في قاعدة البيانات...';
    if (icon) icon.textContent = '⏳';

    try {
        await waitForSawyanApi();
        const res = await window.SAWYAN.API.lookupSponsorByCode(numericCode);
        if (!res || !res.found) {
            verifiedSponsorRecord = null;
            if (display) display.className = 'sponsor-name-display invalid';
            if (text) text.textContent = `❌ كود الراعي #${numericCode} غير مسجل أو غير نشط`;
            if (icon) icon.textContent = '❌';
            if (sponsorIdInput) sponsorIdInput.value = '';
            if (confirmRow) confirmRow.style.display = 'none';
            return;
        }

        verifiedSponsorRecord = res;
        if (display) display.className = 'sponsor-name-display valid';
        if (text) text.textContent = `أنت تسجل الآن في فريق: ${res.full_name} (#${res.member_code})`;
        if (icon) icon.textContent = '✅';
        if (sponsorIdInput) sponsorIdInput.value = res.member_id;
        if (confirmRow && confirmLabel && confirmBox) {
            confirmLabel.textContent = `هل تؤكد الانضمام في فريق: ${res.full_name} (#${res.member_code})؟`;
            confirmRow.style.display = 'flex';
        }
    } catch (err) {
        verifiedSponsorRecord = null;
        const isRootBlock = String(err.message || '').includes('ROOT_SPONSOR_RESTRICTED_TO_ADMIN');
        if (display) display.className = 'sponsor-name-display invalid';
        if (text) {
            text.textContent = isRootBlock
                ? '⛔ الجذر #0 مقيد لدعوات المؤسس فقط — يرجى استخدام كود راعٍ نشط'
                : ('⚠️ ' + err.message);
        }
        if (icon) icon.textContent = '⛔';
        if (sponsorIdInput) sponsorIdInput.value = '';
        if (confirmRow) confirmRow.style.display = 'none';
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const fullName = (document.getElementById('fullName')?.value || '').trim();
    const sponsorCode = activeRootInviteToken ? '0' : (document.getElementById('sponsorCode')?.value || '').trim();
    const phoneRaw = (document.getElementById('phone')?.value || '').trim();
    const dialCode = (document.getElementById('countryDialCode')?.textContent || '+20').trim();
    const countryRes = (document.getElementById('countryOfResidence')?.value || 'EG').toUpperCase();
    const nationality = (document.getElementById('nationality')?.value || countryRes).toUpperCase();
    const citySel = document.getElementById('citySelect');
    const cityVal = citySel ? citySel.value : '';
    const customCity = (document.getElementById('manualCityCustomInput')?.value || '').trim();
    const cityName = cityVal === 'OTHER_MANUAL' ? customCity : (citySel && citySel.selectedOptions[0] ? citySel.selectedOptions[0].textContent : '');
    const distSel = document.getElementById('districtSelect');
    const manualDistEl = document.getElementById('manualDistrictInput');
    const districtVal = (manualDistEl && manualDistEl.style.display !== 'none')
        ? (manualDistEl.value || '').trim()
        : ((distSel && distSel.value && distSel.value !== '__MANUAL__') ? distSel.value.trim() : '');
    const email = (document.getElementById('email')?.value || '').trim() || null;
    const gender = document.getElementById('gender')?.value || '';
    const nationalId = (document.getElementById('nationalId')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';

    if (fullName.length < 3) {
        alert('الرجاء إدخال الاسم الثلاثي الكامل.');
        return;
    }

    if (cityVal === 'OTHER_MANUAL' && customCity.length < 2) {
        alert('⚠️ يرجى كتابة اسم مدينتك أو محافظتك (حقل إلزامي).');
        return;
    }

    if (!districtVal || districtVal.length < 2) {
        alert('⚠️ يرجى اختيار أو كتابة الحي / المنطقة (حقل إلزامي).');
        const manualDistEl = document.getElementById('manualDistrictInput');
        if (manualDistEl && manualDistEl.style.display !== 'none') manualDistEl.focus();
        return;
    }

    if ((!sponsorCode || sponsorCode === '0') && !activeRootInviteToken) {
        alert('⛔ يجب إدخال كود راعٍ صالح (الجذر #0 مخصص للروابط التأسيسية الصادرة من المؤسس فقط).');
        return;
    }

    if (!verifiedSponsorRecord) {
        await lookupSponsor(sponsorCode);
        if (!verifiedSponsorRecord) {
            alert('كود الراعي غير صالح أو غير نشط.');
            return;
        }
    }

    const confirmBox = document.getElementById('sponsorConfirmCheckbox');
    if (!activeRootInviteToken && confirmBox && !confirmBox.checked) {
        const proceed = confirm(`أنت تسجل الآن في فريق: ${verifiedSponsorRecord.full_name} (#${verifiedSponsorRecord.member_code}) — هل تؤكد؟`);
        if (!proceed) return;
        confirmBox.checked = true;
    }

    if (!password || password.length < 8 || password === '123456' || password === '12345678') {
        alert('يجب إدخال كلمة مرور قوية لا تقل عن 8 أحرف (ولا يُسمح بكلمة 123456).');
        return;
    }

    if (password !== confirmPassword) {
        alert('كلمة المرور وتأكيدها غير متطابقتين.');
        return;
    }

    const nationalDigits = phoneRaw.replace(/\D/g, '').replace(/^0+/, '');
    if (nationalDigits.length < 7) {
        alert('⚠️ يرجى إدخال رقم هاتف صحيح (7 أرقام على الأقل).');
        return;
    }
    const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
    const fullPhone = phoneRaw.startsWith('+')
        ? ('+' + phoneRaw.replace(/\D/g, ''))
        : `${cleanDial === '+' ? '+' : cleanDial}${nationalDigits}`;

    let parsedGeonameId = null;
    if (cityVal && cityVal.startsWith('GEO_')) {
        parsedGeonameId = parseInt(cityVal.replace('GEO_', ''), 10) || null;
    }

    const composedDistrict = [cityName, districtVal].filter(Boolean).join(' - ').slice(0, 60) || null;

    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'جاري إنشاء الحساب والتسكين الذري...';
    submitBtn.disabled = true;

    try {
        const metaPayload = {
            gender: gender || null,
            national_id_masked: nationalId ? nationalId.slice(-4) : null
        };
        if (activeRootInviteToken) {
            metaPayload.root_invite_token = activeRootInviteToken;
        }

        const res = await window.SAWYAN.API.registerNewMember({
            fullName,
            phone: fullPhone,
            sponsorCode: Number(sponsorCode),
            password,
            residencyCountryCode: countryRes,
            nationalityCountryCode: nationality,
            cityGeonameId: parsedGeonameId,
            manualDistrict: composedDistrict,
            email,
            metadata: metaPayload
        });

        if (!res || !res.member) {
            throw new Error('لم يكتمل التسجيل في الخادم');
        }

        window.SAWYAN.API.saveMemberSession(res.member, res.session_token);

        if (document.getElementById('generatedCode')) {
            document.getElementById('generatedCode').textContent = res.member.member_code;
        }
        if (document.getElementById('memberCodeDisplay')) {
            document.getElementById('memberCodeDisplay').classList.add('show');
        }
        document.getElementById('registerForm').style.display = 'none';

        const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        const card = document.querySelector('.auth-card');
        const box = document.createElement('div');
        box.style.cssText = 'text-align:center;padding:24px;background:#ecfdf5;border:2px solid #10b981;border-radius:14px;margin-top:16px;color:#065f46;';
        box.innerHTML = `
            <h2 style="margin:0 0 12px;">🎉 تم التسجيل والتسكين بنجاح!</h2>
            <p style="margin:6px 0;">كود عضويتك الدائم: <strong>#${escHtml(res.member.member_code)}</strong></p>
            <p style="margin:6px 0;">الراعي: <strong>${escHtml(res.member.sponsor_name || 'الشركة (#0)')}</strong> | الذراع: <strong>${escHtml(res.member.placement_side)}</strong> (الجيل ${escHtml(res.member.generation_in_tree)})</p>
            <a href="dashboard.html" class="btn btn-primary btn-block" style="margin-top:16px;display:inline-block;">الدخول إلى لوحة العضو ←</a>
        `;
        if (card) card.appendChild(box);
    } catch (error) {
        const raw = String(error?.message || '');
        let friendly = raw;
        if (raw.includes('PHONE_ALREADY_REGISTERED')) friendly = 'رقم الهاتف مسجل مسبقاً في النظام — جرّب تسجيل الدخول أو استعادة كلمة المرور.';
        else if (raw.includes('EMAIL_ALREADY_REGISTERED')) friendly = 'البريد الإلكتروني مسجل مسبقاً لحساب آخر.';
        else if (raw.includes('SPONSOR_NOT_FOUND')) friendly = 'كود الراعي غير موجود أو غير نشط.';
        else if (raw.includes('ROOT_SPONSOR_RESTRICTED_TO_ADMIN')) friendly = 'الجذر #0 مخصص لروابط الدعوة التأسيسية الصادرة من المؤسس فقط.';
        else if (raw.includes('INVALID_OR_EXPIRED_ROOT_INVITE_TOKEN')) friendly = 'رابط الدعوة التأسيسي غير صالح أو منتهي الصلاحية أو مستخدم مسبقاً.';
        else if (raw.includes('WEAK_OR_DEFAULT_PASSWORD_REJECTED')) friendly = 'كلمة المرور ضعيفة جداً — يلزم 8 أحرف على الأقل وغير افتراضية.';
        else if (raw.includes('INVALID_FULL_NAME')) friendly = 'يرجى إدخال الاسم الكامل (3 أحرف على الأقل).';
        else if (raw.includes('INVALID_PHONE_NUMBER')) friendly = 'صيغة رقم الهاتف غير صحيحة.';
        alert('❌ تعذر التسجيل: ' + friendly);
        submitBtn.classList.remove('btn-loading');
        submitBtn.textContent = '✅ إنشاء حساب العضوية والتسكين بالشجرة فوراً';
        submitBtn.disabled = false;
    }
}
