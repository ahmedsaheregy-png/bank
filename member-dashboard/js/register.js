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
        if (!(window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getPublicActiveCountriesAndCities)) return;
        const pub = await window.SAWYAN.API.getPublicActiveCountriesAndCities();
        const countries = (pub && pub.countries) || [];
        if (!countries.length) return;
        liveCountriesCache = countries;

        const resSel = document.getElementById('countryOfResidence');
        const natSel = document.getElementById('nationality');
        const citySel = document.getElementById('citySelect');

        if (resSel) {
            const curVal = preferredCountry || resSel.value || countries[0].country_code;
            resSel.innerHTML = countries.map(c => {
                const nameAr = (c.country_name_i18n && c.country_name_i18n.ar) || c.country_code;
                return `<option value="${c.country_code}">${nameAr} (${c.currency_code})</option>`;
            }).join('');
            resSel.value = countries.some(c => c.country_code === curVal) ? curVal : countries[0].country_code;

            resSel.onchange = function () {
                populateLiveCities(this.value, null);
                const dialEl = document.getElementById('countryDialCode');
                if (dialEl && DIAL_MAP[this.value]) dialEl.textContent = DIAL_MAP[this.value];
            };
        }

        if (natSel) {
            const natVal = preferredCountry || natSel.value || (resSel ? resSel.value : countries[0].country_code);
            natSel.innerHTML = countries.map(c => {
                const nameAr = (c.country_name_i18n && c.country_name_i18n.ar) || c.country_code;
                return `<option value="${c.country_code}">${nameAr}</option>`;
            }).join('');
            if (countries.some(c => c.country_code === natVal)) natSel.value = natVal;
        }

        if (resSel) {
            const dialEl = document.getElementById('countryDialCode');
            if (dialEl && DIAL_MAP[resSel.value]) dialEl.textContent = DIAL_MAP[resSel.value];
            populateLiveCities(resSel.value, preferredCity);
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
    } catch (e) {
        console.warn('Live countries fallback:', e.message);
    }
}

function populateLiveCities(countryCode, preferredCity) {
    const citySel = document.getElementById('citySelect');
    if (!citySel || !liveCountriesCache.length) return;
    const cty = liveCountriesCache.find(c => c.country_code === countryCode);
    const cities = (cty && cty.cities) || [];
    let html = cities.map(g => `<option value="GEO_${g.geoname_id}">${g.city_name}</option>`).join('');
    html += '<option value="OTHER_MANUAL">📍 مدينة / منطقة أخرى (كتابة يدوية)</option>';
    citySel.innerHTML = html;

    const wrap = document.getElementById('manualCityInputWrap');
    if (cities.length === 0) {
        citySel.value = 'OTHER_MANUAL';
        if (wrap) wrap.style.display = 'block';
    } else {
        if (wrap) wrap.style.display = 'none';
        if (preferredCity) {
            const found = Array.from(citySel.options).find(o => o.textContent.toLowerCase().includes(preferredCity));
            if (found) citySel.value = found.value;
        }
    }
}

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
    const districtVal = (document.getElementById('districtSelect')?.value || '').trim();
    const email = (document.getElementById('email')?.value || '').trim() || null;
    const gender = document.getElementById('gender')?.value || '';
    const nationalId = (document.getElementById('nationalId')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';

    if (fullName.length < 3) {
        alert('الرجاء إدخال الاسم الثلاثي الكامل.');
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
    const cleanDial = dialCode.startsWith('+') ? dialCode : `+${dialCode}`;
    const fullPhone = phoneRaw.startsWith('+')
        ? ('+' + phoneRaw.replace(/\D/g, ''))
        : `${cleanDial === '+' ? '+' : cleanDial}${nationalDigits}`;

    let parsedGeonameId = null;
    if (cityVal && cityVal.startsWith('GEO_')) {
        parsedGeonameId = parseInt(cityVal.replace('GEO_', ''), 10) || null;
    }

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
            manualDistrict: [cityName, districtVal].filter(Boolean).join(' - ') || null,
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

        const card = document.querySelector('.auth-card');
        const box = document.createElement('div');
        box.style.cssText = 'text-align:center;padding:24px;background:#ecfdf5;border:2px solid #10b981;border-radius:14px;margin-top:16px;color:#065f46;';
        box.innerHTML = `
            <h2 style="margin:0 0 12px;">🎉 تم التسجيل والتسكين بنجاح!</h2>
            <p style="margin:6px 0;">كود عضويتك الدائم: <strong>#${res.member.member_code}</strong></p>
            <p style="margin:6px 0;">الراعي: <strong>${res.member.sponsor_name || 'الشركة (#0)'}</strong> | الذراع: <strong>${res.member.placement_side}</strong> (الجيل ${res.member.generation_in_tree})</p>
            <a href="dashboard.html" class="btn btn-primary btn-block" style="margin-top:16px;display:inline-block;">الدخول إلى لوحة العضو ←</a>
        `;
        if (card) card.appendChild(box);
    } catch (error) {
        alert('❌ تعذر التسجيل: ' + error.message);
        submitBtn.classList.remove('btn-loading');
        submitBtn.textContent = '✅ إنشاء حساب العضوية والتسكين بالشجرة فوراً';
        submitBtn.disabled = false;
    }
}
