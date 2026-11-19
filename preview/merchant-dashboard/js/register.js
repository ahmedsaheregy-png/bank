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
    (async function syncLiveMerchantCountriesAndCategories() {
        try {
            for (let i = 0; i < 20 && (!window.SAWYAN || !window.SAWYAN.API || !window.SAWYAN.supabase); i++) {
                await new Promise(r => setTimeout(r, 100));
            }
            if (!(window.SAWYAN && window.SAWYAN.API && window.SAWYAN.API.getPublicActiveCountriesAndCities)) return;
            const pub = await window.SAWYAN.API.getPublicActiveCountriesAndCities();
            const countrySel = document.getElementById('countryCodeSelect');
            if (countrySel && pub.countries && pub.countries.length) {
                const cur = urlCountry || countrySel.value || pub.countries[0].country_code;
                countrySel.innerHTML = pub.countries.map(c => {
                    const ar = (c.country_name_i18n && c.country_name_i18n.ar) || c.country_code;
                    return `<option value="${c.country_code}">${ar} (${c.currency_code})</option>`;
                }).join('');
                if (pub.countries.some(c => c.country_code === cur)) countrySel.value = cur;
            }
            const catSel = document.getElementById('businessCategory');
            if (catSel && pub.categories && pub.categories.length) {
                catSel.innerHTML = pub.categories.map(ct => {
                    const ar = (ct.name_i18n && ct.name_i18n.ar) || ct.slug;
                    return `<option value="${ct.slug}">${ar}</option>`;
                }).join('');
            }
        } catch (e) {}
    })();

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

    const cleanDigits = phoneRaw.replace(/\D/g, '').replace(/^0+/, '');
    if (cleanDigits.length < 7) {
        alert('⚠️ يرجى إدخال رقم هاتف نشط صحيح (7 أرقام على الأقل).');
        return;
    }
    let resolvedDial = '+20';
    const worldCountries = (window.SAWYAN && Array.isArray(window.SAWYAN.Countries)) ? window.SAWYAN.Countries : [];
    const worldHit = worldCountries.find(c => String(c.code || '').toUpperCase() === countryCode);
    if (worldHit && worldHit.dialCode) {
        resolvedDial = worldHit.dialCode;
    } else {
        const fallbackDial = { EG: '+20', TR: '+90', SA: '+966', AE: '+971', DE: '+49', US: '+1' };
        resolvedDial = fallbackDial[countryCode] || '+20';
    }
    const fullPhone = phoneRaw.startsWith('+')
        ? ('+' + phoneRaw.replace(/\D/g, ''))
        : `${resolvedDial}${cleanDigits}`;

    const googleMapsUrl = (document.getElementById('googleMapsUrl')?.value || '').trim();
    const webhookUrl = (document.getElementById('webhookUrl')?.value || '').trim();
    const facebookUrl = (document.getElementById('facebookUrl')?.value || '').trim();
    const instagramUrl = (document.getElementById('instagramUrl')?.value || '').trim();
    const twitterUrl = (document.getElementById('twitterUrl')?.value || '').trim();
    const tiktokUrl = (document.getElementById('tiktokUrl')?.value || '').trim();
    const logoUrl = (document.getElementById('logoUrl')?.value || '').trim();
    const coverImageUrl = (document.getElementById('coverImageUrl')?.value || '').trim();
    const imagesRaw = (document.getElementById('images')?.value || '').trim();
    const imagesList = imagesRaw ? imagesRaw.split(',').map(s => s.trim()).filter(Boolean) : null;

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
                webhook_url: webhookUrl || null,
                whatsapp: whatsapp || null,
                google_maps_url: googleMapsUrl || null,
                social: {
                    facebook: facebookUrl || null,
                    instagram: instagramUrl || null,
                    twitter: twitterUrl || null,
                    tiktok: tiktokUrl || null
                },
                logo_url: logoUrl || null,
                cover_image_url: coverImageUrl || null,
                images: imagesList,
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
        } else if (msg.includes('MERCHANT_PHONE_ALREADY_REGISTERED')) {
            alert('⚠️ رقم الهاتف مسجل مسبقاً لمتجر آخر — جرّب تسجيل الدخول أو استعادة كلمة المرور.');
        } else if (msg.includes('MERCHANT_EMAIL_ALREADY_REGISTERED') || msg.includes('merchants_email_key')) {
            alert('⚠️ البريد الإلكتروني مسجل مسبقاً لمتجر آخر.');
        } else if (msg.includes('ONBOARDER_MEMBER_NOT_FOUND')) {
            alert('⚠️ كود العضو المرشِّح للمتجر غير موجود — تأكد من الرقم أو اتركه فارغاً.');
        } else if (msg.includes('INVALID_CASHIER_PIN_FORMAT')) {
            alert('⚠️ رمز PIN الكاشير يجب أن يكون 4 أرقام بالضبط.');
        } else if (msg.includes('WEAK_OR_DEFAULT_PASSWORD_FORBIDDEN')) {
            alert('⚠️ كلمة المرور ضعيفة جداً — يلزم 8 أحرف على الأقل وغير افتراضية.');
        } else if (msg.includes('INVALID_DEDUCTION_PERCENT_RANGE')) {
            alert('⚠️ نسبة العمولة يجب أن تكون بين 1% و 40%.');
        } else if (msg.includes('VALID_PHONE_REQUIRED')) {
            alert('⚠️ يرجى إدخال رقم هاتف صحيح بمفتاح الدولة.');
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
