/**
 * ============================================================================
 * SAWYAN V3.0 — Member Registration Controller (Stage 9 Dynamic Form Engine)
 * متوافق 100% مع مهندس النماذج في لوحة الإدارة + التسكين الشجري الأوسع والأقرب
 * + فحص صارم للبريد وأرقام الهواتف القياسية الدولية وجميع مدن وأحياء العالم
 * ============================================================================
 */
(function () {
    'use strict';

    let sponsorLookupTimeout = null;
    let verifiedSponsorRecord = null;
    let activeRootInviteToken = null;
    let _geoCascade = null;
    let _geoPicker = null;
    let _layoutState = {};

    function getEngine() {
        return window.SAWYAN && window.SAWYAN.RegEngine;
    }

    function showError(msg) {
        const el = document.getElementById('errorMessage');
        const okEl = document.getElementById('successMessage');
        if (okEl) okEl.style.display = 'none';
        if (el) {
            el.innerHTML = '⛔ ' + (getEngine() ? getEngine().escapeHtml(msg) : msg);
            el.style.display = 'block';
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        document.querySelectorAll('#memberFieldPool [data-field-key]').forEach(function (wrap) {
            const key = wrap.dataset.fieldKey;
            const input = wrap.querySelector('input:not([type="hidden"]), select, textarea');
            const preserveLabel = key === 'terms_consent';
            const skipNativeRequired = key === 'terms_consent';
            map[key] = {
                wrapperEl: wrap,
                inputEl: input || null,
                preserveLabel,
                skipNativeRequired
            };
        });
        return map;
    }

    function updateDialBadge(cc) {
        const rule = (window.SAWYAN && typeof window.SAWYAN.getPhoneRule === 'function')
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

    function populateNationalitySelect() {
        const natSel = document.getElementById('nationality');
        if (!natSel || !window.SAWYAN || !Array.isArray(window.SAWYAN.Countries)) return;
        natSel.innerHTML = '<option value="">— نفس دولة الإقامة —</option>';
        window.SAWYAN.Countries.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = `${c.flag || ''} ${c.nameAr} (${c.code})`;
            natSel.appendChild(opt);
        });
    }

    async function verifyFounderRootToken(token) {
        const display = document.getElementById('sponsorNameDisplay');
        const text = document.getElementById('sponsorNameText');
        const icon = document.getElementById('sponsorStatusIcon');
        const sponsorInput = document.getElementById('sponsorCode');
        try {
            const res = await window.SAWYAN.API.verifyRootInviteToken(token);
            if (res && res.valid) {
                activeRootInviteToken = token;
                verifiedSponsorRecord = { member_id: res.root_member_id || '0', member_code: 0, full_name: res.leader_name || 'قائد تأسيسي مباشر' };
                if (sponsorInput) {
                    sponsorInput.value = '0';
                    sponsorInput.readOnly = true;
                }
                if (display) display.className = 'sponsor-name-display valid';
                if (icon) icon.textContent = '👑';
                if (text) text.textContent = `دعوة تأسيسية موثّقة تحت الشركة مباشرة (#0) — القائد: ${res.leader_name || ''}`;
                if (res.country_code && document.getElementById('countryOfResidence')) {
                    const ccSel = document.getElementById('countryOfResidence');
                    if ([...ccSel.options].some(o => o.value === res.country_code)) {
                        ccSel.value = res.country_code;
                        if (_geoCascade) await _geoCascade.loadCities(res.country_code, '');
                        updateDialBadge(res.country_code);
                    }
                }
            } else {
                if (display) display.className = 'sponsor-name-display invalid';
                if (icon) icon.textContent = '⛔';
                if (text) text.textContent = 'رابط الدعوة التأسيسي غير صالح أو منتهي الصلاحية.';
            }
        } catch (err) {
            if (text) text.textContent = '⚠️ ' + err.message;
        }
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
        if (text) text.textContent = 'أدخل كود الشخص الداعي ليظهر اسمه الكامل للتأكيد...';
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
        if (text) text.textContent = 'جاري التحقق من الراعي...';
        if (icon) icon.textContent = '⏳';

        try {
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
                confirmLabel.textContent = `أؤكد الانضمام ضمن فريق: ${res.full_name} (#${res.member_code})`;
                confirmRow.style.display = 'flex';
            }
        } catch (err) {
            verifiedSponsorRecord = null;
            const isRootBlock = String(err.message || '').includes('ROOT_SPONSOR_RESTRICTED_TO_ADMIN');
            if (display) display.className = 'sponsor-name-display invalid';
            if (text) {
                text.textContent = isRootBlock
                    ? '⛔ الكود #0 مخصص لروابط الدعوة التأسيسية الصادرة من الإدارة فقط — أدخل كود راعٍ نشط.'
                    : ('⚠️ ' + err.message);
            }
            if (icon) icon.textContent = '⛔';
            if (sponsorIdInput) sponsorIdInput.value = '';
            if (confirmRow) confirmRow.style.display = 'none';
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
            if (!code) return resetSponsorDisplay();
            sponsorLookupTimeout = setTimeout(() => lookupSponsor(code), 350);
        });
        sponsorCodeInput.addEventListener('blur', function (e) {
            if (activeRootInviteToken) return;
            const code = e.target.value.trim();
            if (code) lookupSponsor(code);
        });
    }

    function wireLiveEmailAndPhoneValidation() {
        const eng = getEngine();
        const emailInp = document.getElementById('email');
        const emailMsg = document.getElementById('emailValidationMsg');
        const phoneInp = document.getElementById('phone');
        const phoneMsg = document.getElementById('phoneValidationMsg');
        const ccSel = document.getElementById('countryOfResidence');

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
                const stripHint = res.strippedZero ? ' (تمت إزالة صفر البداية تلقائياً)' : '';
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
    }

    async function initializePage() {
        const eng = getEngine();
        const fieldMap = buildFieldMap();

        let config = { settings: [], fields: [] };
        try {
            config = await eng.loadFormConfig('member', true);
        } catch (_e) {
            config = { settings: [], fields: [] };
        }

        const layoutRes = eng.applyDynamicFormLayout({
            config,
            formType: 'member',
            stage: 'initial',
            fieldMap,
            requiredContainer: document.getElementById('memberRequiredFields'),
            optionalDivider: document.getElementById('memberOptionalDividerBanner'),
            optionalDividerTextEl: document.getElementById('memberOptionalDividerText'),
            optionalContainer: document.getElementById('memberOptionalFields'),
            pageTitleEl: document.getElementById('regPageTitle'),
            pageSubtitleEl: document.getElementById('regPageSubtitle')
        });
        _layoutState = layoutRes.stateMap || {};

        populateNationalitySelect();
        eng.attachPasswordEnhancements(
            document.getElementById('password'),
            document.getElementById('confirmPassword')
        );

        const geoHost = document.getElementById('memberGeoPickerHost');
        if (geoHost) {
            _geoPicker = eng.mountGeoPicker(geoHost, {
                latInput: document.getElementById('homeLat'),
                lngInput: document.getElementById('homeLng'),
                mapsUrlInput: document.getElementById('homeMapsUrl'),
                countryCode: 'EG',
                compact: true
            });
        }

        const params = new URLSearchParams(window.location.search);
        const urlCountry = (params.get('country') || '').trim().toUpperCase() || 'EG';
        const rootToken = (params.get('root_token') || '').trim();
        const urlRef = (params.get('ref') || params.get('sponsor') || '').trim();

        _geoCascade = eng.mountWorldGeoCascade({
            countrySelect: document.getElementById('countryOfResidence'),
            citySelect: document.getElementById('citySelect'),
            citySearchInput: document.getElementById('citySearchInput'),
            districtSelect: document.getElementById('districtSelect'),
            districtManualInput: document.getElementById('districtManualInput'),
            activeOnly: false,
            includeAllCountries: true,
            defaultCountry: urlCountry,
            onCountryChange: function (cc) {
                updateDialBadge(cc);
                if (_geoPicker) _geoPicker.setCountryCenter(cc);
            },
            onCityChange: function (cityInfo) {
                if (cityInfo && cityInfo.lat && cityInfo.lng && _geoPicker) {
                    _geoPicker.setCenterView(cityInfo.lat, cityInfo.lng, 12);
                }
            },
            onDistrictChange: function (distInfo) {
                if (distInfo && distInfo.lat && distInfo.lng && _geoPicker) {
                    _geoPicker.setCenterView(distInfo.lat, distInfo.lng, 14);
                }
            }
        });
        await _geoCascade.init();

        initSponsorLookup();
        wireLiveEmailAndPhoneValidation();
        updateDialBadge(document.getElementById('countryOfResidence')?.value || 'EG');

        const sponsorInput = document.getElementById('sponsorCode');
        if (rootToken) {
            await verifyFounderRootToken(rootToken);
        } else if (urlRef && sponsorInput) {
            sponsorInput.value = urlRef;
            setTimeout(() => lookupSponsor(urlRef), 200);
        } else if (window.SAWYAN?.API?.isDemoMode() && sponsorInput && !sponsorInput.value) {
            sponsorInput.placeholder = 'للتجربة في الموقع الموازي يمكنك استخدام كود القائد: 1';
        }
    }

    async function handleRegister(e) {
        e.preventDefault();
        clearMessages();
        const eng = getEngine();
        const st = key => _layoutState[key] || { isVisible: true, isRequired: false };

        const fullName = (document.getElementById('fullName')?.value || '').trim();
        const sponsorCode = activeRootInviteToken ? '0' : (document.getElementById('sponsorCode')?.value || '').trim();
        const countryRes = (document.getElementById('countryOfResidence')?.value || 'EG').toUpperCase();
        const nationality = (document.getElementById('nationality')?.value || countryRes).toUpperCase();
        const rawPhone = (document.getElementById('phone')?.value || '').trim();
        const rawEmail = (document.getElementById('email')?.value || '').trim();
        const gender = document.getElementById('gender')?.value || '';
        const nationalId = (document.getElementById('nationalId')?.value || '').trim();
        const pwd = document.getElementById('password')?.value || '';
        const confirmPwd = document.getElementById('confirmPassword')?.value || '';
        const termsChecked = Boolean(document.getElementById('termsConsent')?.checked);

        const cityId = _geoCascade ? _geoCascade.getCityId() : null;
        const cityName = _geoCascade ? _geoCascade.getCityName() : '';
        const district = _geoCascade ? _geoCascade.getDistrict() : '';

        if (!fullName || fullName.length < 3) {
            return showError('يرجى إدخال الاسم الكامل (3 أحرف على الأقل).');
        }
        if ((!sponsorCode || sponsorCode === '0') && !activeRootInviteToken) {
            return showError('يرجى إدخال كود راعٍ نشط صالح (الكود 0 مخصص لروابط الدعوة التأسيسية فقط).');
        }
        if (!verifiedSponsorRecord) {
            await lookupSponsor(sponsorCode);
            if (!verifiedSponsorRecord) {
                return showError('كود الشخص الداعي غير موجود أو غير نشط.');
            }
        }
        const confirmBox = document.getElementById('sponsorConfirmCheckbox');
        if (!activeRootInviteToken && confirmBox && confirmBox.offsetParent !== null && !confirmBox.checked) {
            const proceed = confirm(`أنت تسجل الآن في فريق: ${verifiedSponsorRecord.full_name} (#${verifiedSponsorRecord.member_code}) — هل تؤكد؟`);
            if (!proceed) return;
            confirmBox.checked = true;
        }

        const phCheck = eng.validatePhoneByCountry(rawPhone, countryRes, true);
        if (!phCheck.valid) return showError(phCheck.error);

        const emCheck = eng.validateEmailStrict(rawEmail, st('email').isRequired);
        if (!emCheck.valid) return showError(emCheck.error);

        if (st('city').isRequired && !cityId) {
            return showError('يرجى اختيار المحافظة / المدينة.');
        }
        if (st('district').isRequired && !district) {
            return showError('يرجى اختيار أو كتابة الحي / المنطقة.');
        }
        if (st('nationality').isRequired && !document.getElementById('nationality')?.value) {
            return showError('يرجى تحديد الجنسية.');
        }
        if (st('gender').isRequired && !gender) {
            return showError('يرجى تحديد النوع (الجنس).');
        }

        const hLat = (document.getElementById('homeLat')?.value || '').trim();
        const hLng = (document.getElementById('homeLng')?.value || '').trim();
        const hUrl = (document.getElementById('homeMapsUrl')?.value || '').trim();
        if (st('home_gps').isRequired && (!hLat || !hLng)) {
            return showError('يرجى تحديد موقع السكن على الخريطة.');
        }
        if (st('national_id_kyc').isRequired && !nationalId) {
            return showError('يرجى إدخال رقم الهوية الوطنية / جواز السفر.');
        }

        const pwCheck = eng.validatePasswordStrong(pwd, confirmPwd);
        if (!pwCheck.valid) return showError(pwCheck.error);

        if (st('terms_consent').isRequired && !termsChecked) {
            return showError('يجب الموافقة على الشروط والأحكام وسياسة الخصوصية.');
        }

        const composedDistrict = [cityName, district].filter(Boolean).join(' - ').slice(0, 60) || null;
        const metaPayload = {
            gender: gender || null,
            national_id_masked: nationalId ? nationalId.slice(-4) : null,
            home_gps: (hLat && hLng)
                ? { lat: Number(hLat), lng: Number(hLng), google_maps_url: hUrl || null }
                : null,
            terms_accepted_at: new Date().toISOString()
        };
        if (activeRootInviteToken) {
            metaPayload.root_invite_token = activeRootInviteToken;
        }

        setLoading(true);
        try {
            const res = await window.SAWYAN.API.registerNewMember({
                fullName,
                phone: phCheck.e164,
                sponsorCode: Number(sponsorCode),
                password: pwd,
                residencyCountryCode: countryRes,
                nationalityCountryCode: nationality,
                cityGeonameId: cityId,
                manualDistrict: composedDistrict,
                email: emCheck.clean || null,
                metadata: metaPayload
            });

            if (!res || !res.member) {
                throw new Error('لم يكتمل التسجيل في الخادم.');
            }
            window.SAWYAN.API.saveMemberSession(res.member, res.session_token);

            const m = res.member;
            const escHtml = eng.escapeHtml;
            const okEl = document.getElementById('successMessage');
            if (okEl) {
                okEl.innerHTML = `
                    <div style="font-size:1.08rem;font-weight:800;margin-bottom:8px;">🎉 مبروك! تم تسجيلك وتسكينك في شجرة SAWYAN بنجاح!</div>
                    <div>🆔 كود عضويتك الدائم: <strong dir="ltr">#${escHtml(m.member_code)}</strong></div>
                    <div style="margin-top:4px;">🌳 الراعي: <strong>${escHtml(m.sponsor_name || 'الشركة (#0)')}</strong> | التسكين تحت كود: <strong dir="ltr">#${escHtml(m.parent_member_code ?? '-')}</strong> (الذراع: <strong>${m.placement_side === 'right' ? 'الأيمن' : 'الأيسر'}</strong> • الجيل: <strong>${escHtml(m.generation_in_tree)}</strong>)</div>
                    <div style="margin-top:12px;">
                        <a href="dashboard.html" class="btn btn-primary" style="text-decoration:none;">🚀 الدخول إلى لوحة تحكم العضو الآن</a>
                    </div>
                `;
                okEl.style.display = 'block';
                okEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setLoading(false);
        } catch (err) {
            setLoading(false);
            const raw = String((err && err.message) || '');
            let friendly = raw;
            if (raw.includes('PHONE_ALREADY_REGISTERED')) friendly = 'رقم الهاتف مسجل مسبقاً في النظام — جرّب تسجيل الدخول أو استعادة كلمة المرور.';
            else if (raw.includes('EMAIL_ALREADY_REGISTERED')) friendly = 'البريد الإلكتروني مسجل مسبقاً لحساب آخر.';
            else if (raw.includes('SPONSOR_NOT_FOUND')) friendly = 'كود الراعي غير موجود أو غير نشط.';
            else if (raw.includes('ROOT_SPONSOR_RESTRICTED_TO_ADMIN')) friendly = 'الكود #0 مخصص لروابط الدعوة التأسيسية الصادرة من الإدارة فقط.';
            else if (raw.includes('INVALID_OR_EXPIRED_ROOT_INVITE_TOKEN')) friendly = 'رابط الدعوة التأسيسي غير صالح أو منتهي الصلاحية.';
            showError(friendly);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        initializePage();
        const form = document.getElementById('registerForm');
        if (form) form.addEventListener('submit', handleRegister);
    });
})();
