/**
 * ============================================================================
 * SAWYAN V3.0 — Merchant Registration Controller (Stage 9 Dynamic Form Engine)
 * متوافق 100% مع مهندس النماذج الديناميكي في لوحة الإدارة + التدقيق الصارم
 * ============================================================================
 */
(function () {
    'use strict';

    let _geoCascade = null;
    let _geoPicker = null;
    let _layoutState = {};
    let _onboarderTimer = null;
    let _progressTracker = null;
    let _draftHelper = null;

    function getEngine() {
        return window.SAWYAN && window.SAWYAN.RegEngine;
    }

    function showError(msg, focusEl) {
        const el = document.getElementById('errorMessage');
        const okEl = document.getElementById('successMessage');
        if (okEl) okEl.style.display = 'none';
        if (el) {
            el.innerHTML = '⛔ ' + (getEngine() ? getEngine().escapeHtml(msg) : msg);
            el.style.display = 'block';
            if (focusEl && getEngine() && typeof getEngine().focusFirstInvalidField === 'function') {
                getEngine().focusFirstInvalidField(focusEl);
            } else {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    function clearMessages() {
        const el = document.getElementById('errorMessage');
        const okEl = document.getElementById('successMessage');
        if (el) el.style.display = 'none';
        if (okEl) okEl.style.display = 'none';
    }

    function setLoading(isLoading) {
        const sub = document.getElementById('submitBtn');
        const ld = document.getElementById('loadingBtn');
        if (sub) sub.style.display = isLoading ? 'none' : 'block';
        if (ld) ld.style.display = isLoading ? 'block' : 'none';
    }

    function buildFieldMap() {
        const map = {};
        document.querySelectorAll('#merchantFieldPool [data-field-key]').forEach(function (wrap) {
            const key = wrap.dataset.fieldKey;
            const input = wrap.querySelector('input:not([type="hidden"]), select, textarea');
            const preserveLabel = key === 'terms_consent';
            const skipNativeRequired = key === 'terms_consent' || key === 'merchant_type';
            map[key] = {
                wrapperEl: wrap,
                inputEl: input || null,
                preserveLabel: preserveLabel,
                skipNativeRequired: skipNativeRequired
            };
        });
        return map;
    }

    function updateDialBadge(cc) {
        const rule = window.SAWYAN && typeof window.SAWYAN.getPhoneRule === 'function'
            ? window.SAWYAN.getPhoneRule(cc)
            : { flag: '🇪🇬', dialCode: '+20', minNsn: 10, maxNsn: 10, example: '1012345678' };
        const badge = document.getElementById('phoneDialBadge');
        const phoneInp = document.getElementById('phone');
        if (badge) badge.textContent = `${rule.flag} ${rule.dialCode}`;
        if (phoneInp && (!_layoutState.phone || !_layoutState.phone.placeholder_ar || _layoutState.phone.placeholder_ar.includes('موبايل'))) {
            const lenText = rule.minNsn === rule.maxNsn ? `${rule.minNsn} أرقام` : `${rule.minNsn}-${rule.maxNsn} أرقام`;
            phoneInp.placeholder = `مثال: ${rule.example} (${lenText})`;
        }
    }

    function wireMerchantTypeSync() {
        const sel = document.getElementById('merchantType');
        const cards = document.querySelectorAll('#merchantTypeCards .segmented-type-card');
        if (!sel) return;

        function applyType(val) {
            sel.value = val;
            cards.forEach(c => c.classList.toggle('active', c.dataset.type === val));
            const onlineShow = val === 'online' || val === 'both';
            const physicalShow = val === 'physical' || val === 'both';

            const webWrap = document.querySelector('[data-field-key="website_url"]');
            if (webWrap && webWrap.dataset.regHidden !== '1' && _layoutState.website_url && _layoutState.website_url.isVisible) {
                webWrap.style.display = onlineShow ? '' : 'none';
            }
            const distWrap = document.querySelector('[data-field-key="district"]');
            if (distWrap && distWrap.dataset.regHidden !== '1' && _layoutState.district && _layoutState.district.isVisible) {
                distWrap.style.display = physicalShow || val === 'both' ? '' : '';
            }
            if (_geoPicker) {
                setTimeout(() => _geoPicker.invalidateSize(), 200);
            }
        }

        cards.forEach(btn => {
            btn.addEventListener('click', function () {
                applyType(btn.dataset.type);
            });
        });
        sel.addEventListener('change', function () {
            applyType(sel.value);
        });
        applyType(sel.value || 'physical');
    }

    function wireLiveEmailAndPhoneValidation() {
        const eng = getEngine();
        const emailInp = document.getElementById('email');
        const emailMsg = document.getElementById('emailValidationMsg');
        const phoneInp = document.getElementById('phone');
        const phoneMsg = document.getElementById('phoneValidationMsg');
        const ccSel = document.getElementById('countryCode');

        if (emailInp && emailMsg && eng) {
            emailInp.addEventListener('input', function () {
                const isReq = Boolean(_layoutState.email && _layoutState.email.isRequired);
                const val = emailInp.value.trim();
                if (!val && !isReq) {
                    emailMsg.textContent = '';
                    return;
                }
                const res = eng.validateEmailStrict(val, isReq);
                emailMsg.textContent = res.valid ? '✓ صيغة البريد الإلكتروني صحيحة' : res.error;
                emailMsg.className = 'field-validation-msg ' + (res.valid ? 'valid' : 'invalid');
            });
        }

        function checkPhone() {
            if (!phoneInp || !phoneMsg || !eng) return;
            const cc = ccSel ? ccSel.value : 'EG';
            const isReq = Boolean(_layoutState.phone && _layoutState.phone.isRequired);
            const val = phoneInp.value.trim();
            if (!val && !isReq) {
                phoneMsg.textContent = '';
                return;
            }
            const res = eng.validatePhoneByCountry(val, cc, isReq);
            if (res.valid) {
                const stripHint = res.strippedZero ? ' (تم ضبط الرقم بإزالة صفر البداية تلقائياً)' : '';
                phoneMsg.textContent = `✓ الرقم المعتمد: ${res.e164}${stripHint}`;
                phoneMsg.className = 'field-validation-msg valid';
            } else {
                phoneMsg.textContent = res.error;
                phoneMsg.className = 'field-validation-msg invalid';
            }
        }

        if (phoneInp) phoneInp.addEventListener('input', checkPhone);
        if (ccSel) ccSel.addEventListener('change', function () {
            updateDialBadge(ccSel.value);
            if (phoneInp && phoneInp.value.trim()) checkPhone();
        });

        if (eng && typeof eng.attachEmailUXHelpers === 'function') {
            eng.attachEmailUXHelpers(emailInp, emailMsg);
        }
        if (eng && typeof eng.attachPhoneUXHelpers === 'function') {
            eng.attachPhoneUXHelpers(phoneInp, ccSel, phoneMsg, updateDialBadge);
        }
        if (window.SAWYAN && window.SAWYAN.SmartSearch) {
            ['onboardedByCode', 'deductionPercent', 'initialCashierPin', 'whatsapp'].forEach(id => {
                window.SAWYAN.SmartSearch.attachAutoDigitNormalization(document.getElementById(id));
            });
        }
    }

    function wireOnboarderLookup() {
        const inp = document.getElementById('onboardedByCode');
        const btnZero = document.getElementById('btnCompanyDirectOnboard');
        const msg = document.getElementById('onboarderLookupMsg');
        if (!inp || !msg) return;

        async function runLookup() {
            const raw = String(inp.value || '').trim();
            if (raw === '') {
                msg.textContent = '';
                return;
            }
            const num = Number(raw);
            if (!Number.isInteger(num) || num < 0) {
                msg.textContent = 'أدخل كوداً صحيحاً (0 للتسجيل المباشر عبر الشركة أو رقم كود العضو الداعي).';
                msg.className = 'field-validation-msg invalid';
                return;
            }
            if (num === 0) {
                msg.textContent = '✓ تسجيل مباشر عبر شركة SAWYAN (#0)';
                msg.className = 'field-validation-msg valid';
                return;
            }
            msg.textContent = '⏳ جاري التحقق من اسم العضو المرشّح...';
            msg.className = 'field-validation-msg';
            try {
                const res = await window.SAWYAN.API.lookupOnboarderByCode(num);
                if (res && res.found) {
                    msg.textContent = `✓ العضو المرشّح: ${res.full_name} (#${res.member_code})`;
                    msg.className = 'field-validation-msg valid';
                } else {
                    msg.textContent = '✗ لم يتم العثور على عضو نشط بهذا الكود — تأكد من الرقم أو اكتب 0 للشركة.';
                    msg.className = 'field-validation-msg invalid';
                }
            } catch (_e) {
                msg.textContent = '';
            }
        }

        inp.addEventListener('input', function () {
            clearTimeout(_onboarderTimer);
            _onboarderTimer = setTimeout(runLookup, 320);
        });
        if (btnZero) {
            btnZero.addEventListener('click', function () {
                inp.value = '0';
                runLookup();
            });
        }
    }

    function wireOptionalMediaWidgets() {
        const iu = window.SAWYAN && window.SAWYAN.ImageUpload;
        if (!iu || typeof iu.mountUploader !== 'function') return;
        const slots = [
            { host: 'logoUploadBox', hidden: 'logoUrl', maxDim: 800, maxChars: 200000, label: 'رفع شعار النشاط' },
            { host: 'coverUploadBox', hidden: 'coverImageUrl', maxDim: 1280, maxChars: 340000, label: 'رفع صورة الغلاف' },
            { host: 'commercialDocUploadBox', hidden: 'commercialDocUrl', maxDim: 1400, maxChars: 380000, label: 'رفع صورة السجل التجاري' },
            { host: 'taxDocUploadBox', hidden: 'taxDocUrl', maxDim: 1400, maxChars: 380000, label: 'رفع صورة البطاقة الضريبية' }
        ];
        slots.forEach(s => {
            const hostEl = document.getElementById(s.host);
            const hidEl = document.getElementById(s.hidden);
            if (!hostEl || !hidEl) return;
            try {
                iu.mountUploader(hostEl, {
                    label: s.label,
                    maxDim: s.maxDim,
                    maxChars: s.maxChars,
                    onChange: function (url) { hidEl.value = url || ''; }
                });
            } catch (_e) {}
        });
    }

    async function initializePage() {
        const eng = getEngine();
        const fieldMap = buildFieldMap();

        // 1. Load live registration form configuration from DB
        let config = { settings: [], fields: [] };
        try {
            config = await eng.loadFormConfig('merchant', true);
        } catch (_e) {
            config = { settings: [], fields: [] };
        }

        const layoutRes = eng.applyDynamicFormLayout({
            config,
            formType: 'merchant',
            stage: 'initial',
            fieldMap,
            requiredContainer: document.getElementById('merchantRequiredFields'),
            optionalDivider: document.getElementById('merchantOptionalDividerBanner'),
            optionalDividerTextEl: document.getElementById('merchantOptionalDividerText'),
            optionalContainer: document.getElementById('merchantOptionalFields'),
            pageTitleEl: document.getElementById('regPageTitle'),
            pageSubtitleEl: document.getElementById('regPageSubtitle')
        });
        _layoutState = layoutRes.stateMap || {};

        // 2. Password enhancements (👁️ toggle + strength & match meters)
        eng.attachPasswordEnhancements(
            document.getElementById('password'),
            document.getElementById('confirmPassword')
        );

        // 3. Smart Google Maps Geo-Picker
        const geoHost = document.getElementById('merchantGeoPickerHost');
        if (geoHost) {
            _geoPicker = eng.mountGeoPicker(geoHost, {
                latInput: document.getElementById('latitude'),
                lngInput: document.getElementById('longitude'),
                mapsUrlInput: document.getElementById('googleMapsUrl'),
                addressInput: document.getElementById('address'),
                countryCode: 'EG',
                compact: true
            });
        }

        // 4. Unified World Geo Cascade (Country -> City -> District) + Categories
        const params = new URLSearchParams(window.location.search);
        const rawUrlCountry = (params.get('country') || '').trim().toUpperCase();
        const urlCountry = rawUrlCountry || 'EG';
        const urlCity = (params.get('city') || '').trim();

        _geoCascade = eng.mountWorldGeoCascade({
            countrySelect: document.getElementById('countryCode'),
            citySelect: document.getElementById('cityGeonameId'),
            citySearchInput: document.getElementById('citySearchInput'),
            districtSelect: document.getElementById('districtSelect'),
            districtManualInput: document.getElementById('districtManualInput'),
            activeOnly: true,
            defaultCountry: urlCountry,
            explicitCountryFromUrl: Boolean(rawUrlCountry),
            initialCityQuery: urlCity,
            autoDetectCountry: !rawUrlCountry,
            onCountryChange: function (cc) {
                updateDialBadge(cc);
                if (_geoPicker) _geoPicker.setCountryCenter(cc);
                if (_progressTracker) _progressTracker.update();
            },
            onCityChange: function (cityInfo) {
                if (cityInfo && cityInfo.lat && cityInfo.lng && _geoPicker) {
                    _geoPicker.setCenterView(cityInfo.lat, cityInfo.lng, 12);
                }
                if (_progressTracker) _progressTracker.update();
            },
            onDistrictChange: function (distInfo) {
                if (distInfo && distInfo.lat && distInfo.lng && _geoPicker) {
                    _geoPicker.setCenterView(distInfo.lat, distInfo.lng, 14);
                }
                if (_progressTracker) _progressTracker.update();
            }
        });
        await _geoCascade.init();

        // Sync category dropdown from DB active categories & sort strictly alphabetically + SmartSearch
        const dbCats = _geoCascade.getCategories();
        const catSel = document.getElementById('category');
        const ls = window.SAWYAN && window.SAWYAN.LocaleSort;
        if (catSel && Array.isArray(dbCats) && dbCats.length > 0) {
            const cur = catSel.value;
            const docLang = ls ? ls.getDocLang() : 'ar';
            const sortedCats = ls
                ? ls.sortItems(dbCats, c => (c.name_i18n && (docLang === 'en' ? (c.name_i18n.en || c.name_i18n.ar) : (c.name_i18n.ar || c.name_i18n.en))) || c.slug, docLang)
                : dbCats;
            catSel.innerHTML = '<option value="">اختر فئة النشاط...</option>';
            sortedCats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.slug;
                const ar = (c.name_i18n && (c.name_i18n.ar || c.name_i18n.en)) || c.slug;
                const en = (c.name_i18n && (c.name_i18n.en || c.name_i18n.ar)) || c.slug;
                opt.textContent = docLang === 'en' ? en : ar;
                opt.dataset.nameAr = ar;
                opt.dataset.nameEn = en;
                catSel.appendChild(opt);
            });
            if (cur) catSel.value = cur;
        }
        if (catSel && window.SAWYAN && window.SAWYAN.SmartSearch) {
            window.SAWYAN.SmartSearch.attachToSelect(catSel, {
                kind: 'generic',
                placeholder: 'ابحث عن فئة النشاط بالعربية أو الإنجليزية...',
                showLetterHeaders: false,
                skipEmptyPlaceholder: true
            });
        }

        wireMerchantTypeSync();
        wireLiveEmailAndPhoneValidation();
        wireOnboarderLookup();
        wireOptionalMediaWidgets();

        const btnCopyWa = document.getElementById('btnCopyPhoneToWhatsapp');
        if (btnCopyWa) {
            btnCopyWa.addEventListener('click', function () {
                const ph = document.getElementById('phone').value.trim();
                const cc = document.getElementById('countryCode').value;
                const res = eng.validatePhoneByCountry(ph, cc, false);
                document.getElementById('whatsapp').value = res.valid && res.e164 ? res.e164 : ph;
            });
        }

        updateDialBadge(document.getElementById('countryCode')?.value || 'EG');

        const formEl = document.getElementById('registerForm');
        if (formEl && eng && typeof eng.mountDraftAutoSave === 'function') {
            _draftHelper = eng.mountDraftAutoSave(formEl, {
                storageKey: 'sawyan_merchant_reg_draft_v1',
                fieldIds: ['businessName', 'ownerName', 'email', 'phone', 'onboardedByCode', 'address', 'description', 'websiteUrl', 'whatsapp']
            });
            _draftHelper.restore();
        }

        if (formEl && eng && typeof eng.mountRegistrationProgress === 'function') {
            const st = key => _layoutState[key] || { isVisible: true, isRequired: false };
            _progressTracker = eng.mountRegistrationProgress(formEl, {
                insertBeforeEl: document.getElementById('merchantRequiredFields'),
                getRequiredCheckers: function () {
                    const list = [
                        () => (document.getElementById('businessName')?.value || '').trim().length >= 2,
                        () => Boolean(document.getElementById('countryCode')?.value),
                        () => eng.validatePhoneByCountry(document.getElementById('phone')?.value || '', document.getElementById('countryCode')?.value || 'EG', true).valid,
                        () => eng.validatePasswordStrong(document.getElementById('password')?.value || '', document.getElementById('confirmPassword')?.value || '').valid
                    ];
                    if (st('owner_name').isRequired) list.push(() => (document.getElementById('ownerName')?.value || '').trim().length >= 2);
                    if (st('email').isRequired) list.push(() => eng.validateEmailStrict(document.getElementById('email')?.value || '', true).valid);
                    if (st('business_category').isRequired) list.push(() => Boolean(document.getElementById('category')?.value));
                    if (st('city').isRequired) list.push(() => Boolean(_geoCascade && _geoCascade.getCityId()));
                    if (st('district').isRequired && (document.getElementById('merchantType')?.value || 'physical') !== 'online') {
                        list.push(() => Boolean(_geoCascade && _geoCascade.getDistrict()));
                    }
                    if (st('onboarded_by_code').isRequired) list.push(() => (document.getElementById('onboardedByCode')?.value || '').trim() !== '');
                    if (st('terms_consent').isRequired) list.push(() => Boolean(document.getElementById('termsConsent')?.checked));
                    return list;
                }
            });
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        clearMessages();
        const eng = getEngine();

        const st = key => _layoutState[key] || { isVisible: true, isRequired: false };
        const businessName = (document.getElementById('businessName')?.value || '').trim();
        const ownerName = (document.getElementById('ownerName')?.value || '').trim();
        const rawEmail = (document.getElementById('email')?.value || '').trim();
        const countryCode = (document.getElementById('countryCode')?.value || 'EG').trim().toUpperCase();
        const merchantType = document.getElementById('merchantType')?.value || 'physical';
        const category = document.getElementById('category')?.value || 'supermarket';
        const cityGeonameId = _geoCascade ? _geoCascade.getCityId() : null;
        const cityName = _geoCascade ? _geoCascade.getCityName() : '';
        const district = _geoCascade ? _geoCascade.getDistrict() : '';
        const rawPhone = (document.getElementById('phone')?.value || '').trim();
        const rawOnboarder = (document.getElementById('onboardedByCode')?.value || '').trim();
        const pwd = document.getElementById('password')?.value || '';
        const confirmPwd = document.getElementById('confirmPassword')?.value || '';
        const termsChecked = Boolean(document.getElementById('termsConsent')?.checked);

        if (!businessName || businessName.length < 2) {
            return showError('يرجى إدخال اسم النشاط التجاري بشكل صحيح.', document.getElementById('businessName'));
        }
        if (st('owner_name').isRequired && (!ownerName || ownerName.length < 2)) {
            return showError('يرجى إدخال اسم المالك الكامل.', document.getElementById('ownerName'));
        }

        const emCheck = eng.validateEmailStrict(rawEmail, st('email').isRequired);
        if (!emCheck.valid) return showError(emCheck.error, document.getElementById('email'));

        if (!category && st('business_category').isRequired) {
            return showError('يرجى اختيار فئة النشاط التجاري.', document.getElementById('category'));
        }
        if (st('city').isRequired && !cityGeonameId) {
            return showError('يرجى اختيار المحافظة / المدينة أولاً قبل رقم الهاتف.', document.getElementById('cityGeonameId'));
        }
        if (st('district').isRequired && merchantType !== 'online' && !district) {
            return showError('يرجى اختيار أو كتابة الحي / المنطقة.', document.getElementById('districtSelect'));
        }

        const phCheck = eng.validatePhoneByCountry(rawPhone, countryCode, true);
        if (!phCheck.valid) return showError(phCheck.error, document.getElementById('phone'));

        let onboardedByCode = null;
        if (rawOnboarder === '') {
            if (st('onboarded_by_code').isRequired) {
                return showError('يرجى إدخال كود العضو المرشّح للمتجر أو كتابة 0 للتسجيل عن طريق الشركة.', document.getElementById('onboardedByCode'));
            }
        } else {
            const parsedCode = Number(rawOnboarder);
            if (!Number.isInteger(parsedCode) || parsedCode < 0) {
                return showError('كود العضو المرشّح يجب أن يكون رقماً صحيحاً (أو 0 للشركة).', document.getElementById('onboardedByCode'));
            }
            onboardedByCode = parsedCode;
        }

        const pwCheck = eng.validatePasswordStrong(pwd, confirmPwd);
        if (!pwCheck.valid) return showError(pwCheck.error, document.getElementById('password'));

        if (st('terms_consent').isRequired && !termsChecked) {
            return showError('يجب الموافقة على الشروط والأحكام وسياسة الخصوصية لإتمام التسجيل.', document.getElementById('termsConsent'));
        }

        const rawComm = (document.getElementById('deductionPercent')?.value || '').trim();
        let deductionPercent = null;
        if (rawComm !== '') {
            const nComm = Number(rawComm);
            if (!Number.isFinite(nComm) || nComm < 0.5 || nComm > 95) {
                return showError('النسبة المعتمدة يجب أن تكون بين 0.5% و 95% (أو اتركها فارغة لاستكمالها من لوحة التحكم).');
            }
            deductionPercent = nComm;
        } else if (st('commission_percent').isRequired) {
            return showError('يرجى تحديد النسبة القصوى المخصصة لسويًا (%).');
        }

        const latVal = (document.getElementById('latitude')?.value || '').trim();
        const lngVal = (document.getElementById('longitude')?.value || '').trim();
        if (st('geo_location').isRequired && (!latVal || !lngVal)) {
            return showError('يرجى تحديد موقع المتجر على خرائط جوجل باستخدام اللاقط التلقائي.');
        }

        const rawPin = (document.getElementById('initialCashierPin')?.value || '').trim();
        if (rawPin !== '' && !/^[0-9]{4}$/.test(rawPin)) {
            return showError('رمز PIN للكاشير الرئيسي يجب أن يتكون من 4 أرقام إنجليزية فقط (مثل 2580).');
        }

        const whText = (document.getElementById('workingHoursSummary')?.value || '').trim();
        const comDocUrl = (document.getElementById('commercialDocUrl')?.value || '').trim() || null;
        const taxDocUrl = (document.getElementById('taxDocUrl')?.value || '').trim() || null;
        const metadata = {
            city_name: cityName || null,
            district: district || null,
            description: (document.getElementById('description')?.value || '').trim() || null,
            google_maps_url: (document.getElementById('googleMapsUrl')?.value || '').trim() || null,
            website_url: (document.getElementById('websiteUrl')?.value || '').trim() || null,
            whatsapp: (document.getElementById('whatsapp')?.value || '').trim() || null,
            logo_url: (document.getElementById('logoUrl')?.value || '').trim() || null,
            cover_image_url: (document.getElementById('coverImageUrl')?.value || '').trim() || null,
            working_hours: whText ? { summary: whText } : null,
            social: (document.getElementById('facebookUrl')?.value || '').trim()
                ? { facebook: (document.getElementById('facebookUrl')?.value || '').trim() }
                : null,
            commercial_reg_no: (document.getElementById('commercialRegNo')?.value || '').trim() || null,
            tax_id: (document.getElementById('taxId')?.value || '').trim() || null,
            kyc_docs: (comDocUrl || taxDocUrl)
                ? { commercial_reg: comDocUrl, tax_card: taxDocUrl }
                : null,
            webhook_url: (document.getElementById('webhookUrl')?.value || '').trim() || null,
            terms_accepted_at: new Date().toISOString()
        };

        setLoading(true);
        try {
            const res = await window.SAWYAN.API.registerNewMerchant({
                businessName,
                ownerName,
                phone: phCheck.e164,
                password: pwd,
                countryCode,
                category,
                merchantType,
                deductionPercent,
                email: emCheck.clean || null,
                address: (document.getElementById('address')?.value || '').trim() || null,
                cityGeonameId,
                latitude: latVal ? Number(latVal) : null,
                longitude: lngVal ? Number(lngVal) : null,
                onboardedByMemberCode: onboardedByCode,
                initialCashierPin: rawPin || null,
                metadata
            });

            const mObj = (res && res.merchant) ? res.merchant : res;
            if (mObj && mObj.id) {
                if (_draftHelper) _draftHelper.clear();
                window.SAWYAN.API.saveMerchantSession(
                    {
                        id: mObj.id,
                        merchant_code: mObj.merchant_code,
                        business_name: mObj.business_name,
                        owner_name: mObj.owner_name || ownerName,
                        country_code: mObj.country_code || countryCode,
                        deduction_percent: mObj.deduction_percent
                    },
                    (res && res.session_token) || null
                );
            }

            const okEl = document.getElementById('successMessage');
            const isPend = Boolean(mObj && mObj.commission_pending);
            const commMsg = isPend
                ? '⚠️ تنبيه: لم تحدد نسبة المساهمة بعد — استكملها من لوحة التحكم لتفعيل ظهور متجرك واستقبال الفواتير.'
                : `✓ النسبة المعتمدة: ${mObj ? mObj.deduction_percent : deductionPercent}%`;
            if (okEl) {
                okEl.innerHTML = `
                    <div style="font-size:1.05rem;font-weight:800;margin-bottom:6px;">🎉 تم تسجيل متجرك بنجاح في شبكة SAWYAN!</div>
                    <div>🏷️ كود التاجر الخاص بك: <strong dir="ltr">#${eng.escapeHtml(mObj ? (mObj.merchant_code || '') : '')}</strong></div>
                    <div style="margin-top:4px;">${commMsg}</div>
                    <div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">
                        <a href="dashboard.html" class="btn btn-primary" style="text-decoration:none;">🚀 الدخول للوحة تحكم التاجر واستكمال البيانات</a>
                        <a href="login.html" class="btn btn-outline" style="text-decoration:none;">صفحة تسجيل الدخول</a>
                    </div>
                `;
                okEl.style.display = 'block';
                okEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setLoading(false);
        } catch (err) {
            setLoading(false);
            showError((err && err.message) ? err.message : 'حدث خطأ أثناء تسجيل التاجر.');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initializePage();
        const form = document.getElementById('registerForm');
        if (form) form.addEventListener('submit', handleSubmit);
    });
})();
