/**
 * ============================================================================
 * SAWYAN ECOSYSTEM — V3.0 MERCHANT REGISTRATION (3-Minute Onboarding + D4/D13/D25)
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        const logoBox = document.getElementById('logoContainer');
        if (logoBox) logoBox.innerHTML = window.SAWYAN.Logo.full();
    }

    const codeContainer = document.getElementById('merchantCode')?.parentElement;
    if (codeContainer) codeContainer.style.display = 'none';

    const params = new URLSearchParams(window.location.search);
    const urlCountry = (params.get('country') || '').trim().toUpperCase();
    const countrySel = document.getElementById('countryCodeSelect');
    if (urlCountry && countrySel && Array.from(countrySel.options).some(o => o.value === urlCountry)) {
        countrySel.value = urlCountry;
    }

    const physSec = document.getElementById('physicalLocationSection');
    if (physSec) physSec.style.display = 'block';

    const form = document.getElementById('registerForm');
    if (form) form.addEventListener('submit', handleMerchantRegister);
});

async function handleMerchantRegister(e) {
    e.preventDefault();

    const btn = document.getElementById('merchantRegBtn');
    const businessName = (document.getElementById('businessName')?.value || '').trim();
    const ownerName = (document.getElementById('ownerName')?.value || '').trim() || businessName;
    const email = (document.getElementById('email')?.value || '').trim() || null;
    const phoneRaw = (document.getElementById('phone')?.value || '').trim();
    const countryCode = (document.getElementById('countryCodeSelect')?.value || 'EG').toUpperCase();
    const onboardedByCode = (document.getElementById('onboardedByCode')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    const commissionPercentage = parseFloat(document.getElementById('commissionPercentage')?.value || '10') || 10;
    const initialCashierPin = (document.getElementById('initialCashierPin')?.value || '').trim();
    const merchantType = document.getElementById('merchantType')?.value || 'physical';
    const businessCategory = document.getElementById('businessCategory')?.value || 'supermarket';
    const businessDescription = (document.getElementById('businessDescription')?.value || '').trim();
    const city = (document.getElementById('city')?.value || '').trim();
    const address = (document.getElementById('address')?.value || '').trim();
    const latitude = document.getElementById('latitude')?.value || null;
    const longitude = document.getElementById('longitude')?.value || null;
    const websiteUrl = (document.getElementById('websiteUrl')?.value || '').trim();
    const whatsapp = (document.getElementById('whatsapp')?.value || '').trim();

    if (businessName.length < 2) {
        alert('الرجاء إدخال اسم النشاط التجاري.');
        return;
    }
    if (!password || password.length < 8 || password === '123456' || password === '12345678') {
        alert('يجب إدخال كلمة مرور قوية من 8 أحرف على الأقل (ولا يُسمح بـ 123456).');
        return;
    }
    if (password !== confirmPassword) {
        alert('كلمة المرور وتأكيدها غير متطابقتين.');
        return;
    }
    if (initialCashierPin && !/^\d{4}$/.test(initialCashierPin)) {
        alert('رمز PIN الكاشير يجب أن يتكون من 4 أرقام بالضبط.');
        return;
    }

    const dialDefaults = { EG: '+20', TR: '+90', SA: '+966', DE: '+49', US: '+1' };
    const cleanDigits = phoneRaw.replace(/\D/g, '').replace(/^0+/, '');
    const fullPhone = phoneRaw.startsWith('+')
        ? ('+' + phoneRaw.replace(/\D/g, ''))
        : `${dialDefaults[countryCode] || '+20'}${cleanDigits}`;

    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ جاري تأسيس المتجر والفرع الرئيسي في الخادم...';
    }

    try {
        for (let i = 0; i < 15 && (!window.SAWYAN || !window.SAWYAN.supabase); i++) {
            await new Promise(r => setTimeout(r, 100));
        }
        const res = await window.SAWYAN.API.registerNewMerchant({
            businessName,
            ownerName,
            phone: fullPhone,
            password,
            countryCode,
            category: businessCategory,
            merchantType,
            deductionPercent: commissionPercentage,
            email,
            address: [city, address].filter(Boolean).join(' - ') || null,
            latitude,
            longitude,
            onboardedByMemberCode: onboardedByCode || null,
            initialCashierPin: initialCashierPin || null,
            metadata: {
                description: businessDescription || null,
                website_url: websiteUrl || null,
                whatsapp: whatsapp || null,
                working_hours: collectWorkingHours()
            }
        });

        if (!res || !res.success || !res.merchant) {
            throw new Error('لم يكتمل تسجيل المتجر');
        }

        window.SAWYAN.API.saveMerchantSession(res.merchant, res.session_token);
        alert(`🎉 تم تسجيل متجرك بنجاح!\nكود التاجر الرسمي: ${res.merchant.merchant_code}\nسيتم نقلك الآن للوحة التاجر ونقطة البيع.`);
        window.location.href = 'dashboard.html';
    } catch (err) {
        const msg = String(err.message || '');
        if (msg.includes('COUNTRY_GATE_INACTIVE_D13')) {
            alert('⛔ هذه الدولة قيد الإعداد القانوني والضريبي في بوابة تفعيل الدول (D13) ولم تُفتح للتسجيل التجاري بعد.');
        } else {
            alert('❌ تعذر تسجيل المتجر: ' + msg);
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = '✅ تسجيل المتجر وتفعيل نقطة البيع';
        }
    }
}

function collectWorkingHours() {
    const days = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
    const out = {};
    days.forEach(day => {
        const fromVal = document.getElementById(`${day}_from`)?.value;
        const toVal = document.getElementById(`${day}_to`)?.value;
        const closed = document.getElementById(`${day}_closed`)?.checked;
        if (closed) out[day] = { closed: true };
        else if (fromVal && toVal) out[day] = { from: fromVal, to: toVal, closed: false };
    });
    return Object.keys(out).length ? out : null;
}
