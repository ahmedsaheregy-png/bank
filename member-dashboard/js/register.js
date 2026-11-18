/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — V3.0 MEMBER REGISTRATION (Workflow 1 + G01-G05)
 * Real-time Sponsor Confirmation, Root #0 Block, Strict Password Policy (>=8, no 123456)
 * ============================================================================
 */

let sponsorLookupTimeout = null;
let verifiedSponsorRecord = null;

document.addEventListener('DOMContentLoaded', function () {
    const logoEl = document.getElementById('logoContainer');
    if (logoEl && window.SAWYAN && window.SAWYAN.Logo) {
        logoEl.innerHTML = window.SAWYAN.Logo.full();
    }

    initSponsorLookup();

    const params = new URLSearchParams(window.location.search);
    const urlCountry = (params.get('country') || '').trim().toUpperCase();
    const urlCity = (params.get('city') || '').trim().toLowerCase();
    const countrySelectEl = document.getElementById('countryOfResidence');
    if (urlCountry && countrySelectEl && Array.from(countrySelectEl.options).some(o => o.value === urlCountry)) {
        countrySelectEl.value = urlCountry;
        const natEl = document.getElementById('nationality');
        if (natEl && Array.from(natEl.options).some(o => o.value === urlCountry)) {
            natEl.value = urlCountry;
        }
        if (typeof window.handleCountryChange === 'function') {
            window.handleCountryChange(urlCountry, urlCity && urlCity !== 'all' ? urlCity : undefined);
        }
    }

    const urlRef = (params.get('ref') || params.get('sponsor') || '').trim();
    const sponsorInput = document.getElementById('sponsorCode');

    if (urlRef && sponsorInput) {
        sponsorInput.value = urlRef;
        setTimeout(() => lookupSponsor(urlRef), 250);
    } else if (window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.isDemoMode() && sponsorInput && !sponsorInput.value) {
        // في البيئة الموازية فقط، اقتراح الكود التجريبي #1 دون كتم التعديل
        sponsorInput.placeholder = 'للتجربة في الموقع الموازي استخدم كود القائد: 1';
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }
});

function initSponsorLookup() {
    const sponsorCodeInput = document.getElementById('sponsorCode');
    if (!sponsorCodeInput) return;

    sponsorCodeInput.addEventListener('input', function (e) {
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
        const code = e.target.value.trim();
        if (code) lookupSponsor(code);
    });
}

function resetSponsorDisplay() {
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
        // انتظار جاهزية عميل Supabase
        for (let i = 0; i < 15 && (!window.SAWYAN || !window.SAWYAN.supabase); i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        if (!(window.SAWYAN && window.SAWYAN.API && window.SAWYAN.supabase)) {
            throw new Error('لم يتم الاتصال بخادم التحقق بعد، أعد المحاولة.');
        }

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
                ? '⛔ الجذر #0 مقيد للإدارة فقط — يرجى استخدام كود راعٍ نشط'
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
    const sponsorCode = (document.getElementById('sponsorCode')?.value || '').trim();
    const phoneRaw = (document.getElementById('phone')?.value || '').trim();
    const dialCode = (document.getElementById('countryDialCode')?.textContent || '+20').trim();
    const countryRes = (document.getElementById('countryOfResidence')?.value || 'EG').toUpperCase();
    const nationality = (document.getElementById('nationality')?.value || countryRes).toUpperCase();
    const citySel = document.getElementById('citySelect');
    const cityName = citySel && citySel.selectedOptions[0] ? citySel.selectedOptions[0].textContent : '';
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

    if (!sponsorCode || sponsorCode === '0') {
        alert('⛔ يجب إدخال كود راعٍ صالح (الجذر #0 مقيد للإدارة فقط).');
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
    if (confirmBox && !confirmBox.checked) {
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
    const geoMap = {
        cairo: 360630,
        alex: 361058,
        giza: 360995,
        istanbul: 745044,
        ankara: 323786,
        riyadh: 108410,
        jeddah: 105343,
        berlin: 2950159,
        new_york: 5128581
    };
    const cityKey = citySel ? citySel.value : '';

    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'جاري إنشاء الحساب والتسكين الذري...';
    submitBtn.disabled = true;

    try {
        const res = await window.SAWYAN.API.registerNewMember({
            fullName,
            phone: fullPhone,
            sponsorCode: Number(sponsorCode),
            password,
            residencyCountryCode: countryRes,
            nationalityCountryCode: nationality,
            cityGeonameId: geoMap[cityKey] || null,
            manualDistrict: [cityName, districtVal].filter(Boolean).join(' - '),
            email,
            metadata: {
                gender: gender || null,
                national_id_masked: nationalId ? nationalId.slice(-4) : null
            }
        });

        if (!res || !res.success || !res.member) {
            throw new Error('لم يكتمل التسجيل في الخادم');
        }

        window.SAWYAN.API.saveMemberSession(res.member, res.session_token);

        document.getElementById('generatedCode').textContent = res.member.member_code;
        document.getElementById('memberCodeDisplay').classList.add('show');
        document.getElementById('registerForm').style.display = 'none';

        const card = document.querySelector('.auth-card');
        const box = document.createElement('div');
        box.style.cssText = 'text-align:center;padding:24px;background:#ecfdf5;border:2px solid #10b981;border-radius:14px;margin-top:16px;color:#065f46;';
        box.innerHTML = `
            <h2 style="margin:0 0 12px;">🎉 تم التسجيل والتسكين بنجاح!</h2>
            <p style="margin:6px 0;">كود عضويتك الدائم: <strong>#${res.member.member_code}</strong></p>
            <p style="margin:6px 0;">الراعي: <strong>${res.member.sponsor_name}</strong> | الذراع: <strong>${res.member.placement_side}</strong> (الجيل ${res.member.generation_in_tree})</p>
            <a href="dashboard.html" class="btn btn-primary btn-block" style="margin-top:16px;display:inline-block;">الدخول إلى لوحة العضو (11 شاشة) ←</a>
        `;
        if (card) card.appendChild(box);
    } catch (error) {
        alert('❌ تعذر التسجيل: ' + error.message);
        submitBtn.classList.remove('btn-loading');
        submitBtn.textContent = '✅ إنشاء حساب العضوية والتسكين بالشجرة فوراً';
        submitBtn.disabled = false;
    }
}
