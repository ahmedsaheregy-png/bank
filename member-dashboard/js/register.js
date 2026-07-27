// تسجيل عضو - الكود يُعطى بعد التسجيل الناجح (لتجنب الفجوات)
document.addEventListener('DOMContentLoaded', async function () {
    // ⚡ نسجّل الـ form submit listener الأول (قبل أي initialization ممكن ي fail)
    const form = document.getElementById('registerForm');
    if (form) {
        form.addEventListener('submit', handleRegister);
        console.log('✅ Register form listener attached');
    } else {
        console.error('❌ registerForm not found!');
    }

    // تهيئة باقي المكونات (مع try/catch عشان ما نوقفش باقي الكود)
    try {
        if (window.SAWYAN && window.SAWYAN.Logo) {
            document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.full();
        }
        initCountryDropdowns();
        initPhoneCodeSelector();
        initSponsorLookup();
    } catch (initError) {
        console.error('⚠️ Init error (non-critical):', initError);
    }
});

// متغير لتخزين مؤقت debounce
let sponsorLookupTimeout = null;

// تهيئة البحث التلقائي عن اسم الراعي
function initSponsorLookup() {
    const sponsorCodeInput = document.getElementById('sponsorCode');

    sponsorCodeInput.addEventListener('input', function (e) {
        const code = e.target.value.trim();

        // إلغاء البحث السابق
        if (sponsorLookupTimeout) {
            clearTimeout(sponsorLookupTimeout);
        }

        // إذا كان الحقل فارغاً
        if (!code) {
            resetSponsorDisplay();
            return;
        }

        // انتظار 500ms قبل البحث (debounce)
        sponsorLookupTimeout = setTimeout(() => {
            lookupSponsor(code);
        }, 500);
    });

    // البحث أيضاً عند فقدان التركيز
    sponsorCodeInput.addEventListener('blur', function (e) {
        const code = e.target.value.trim();
        if (code) {
            lookupSponsor(code);
        }
    });
}

// إعادة تعيين عرض الراعي
function resetSponsorDisplay() {
    const display = document.getElementById('sponsorNameDisplay');
    const text = document.getElementById('sponsorNameText');
    const icon = document.getElementById('sponsorStatusIcon');
    const sponsorIdInput = document.getElementById('sponsorId');

    display.className = 'sponsor-name-display';
    text.textContent = 'سيظهر اسم الراعي هنا...';
    icon.textContent = '';
    sponsorIdInput.value = '';
}

// البحث عن الراعي في قاعدة البيانات
async function lookupSponsor(code) {
    const display = document.getElementById('sponsorNameDisplay');
    const text = document.getElementById('sponsorNameText');
    const icon = document.getElementById('sponsorStatusIcon');
    const sponsorIdInput = document.getElementById('sponsorId');

    // حالة التحميل
    display.className = 'sponsor-name-display loading';
    text.textContent = 'جاري البحث...';
    icon.textContent = '⏳';

    try {
        const { data: sponsor, error } = await window.SAWYAN.supabase
            .from('members')
            .select('id, full_name, member_code, tree_level, parent_id, position')
            .eq('member_code', code)
            .single();

        if (error || !sponsor) {
            // الراعي غير موجود
            display.className = 'sponsor-name-display invalid';
            text.textContent = 'كود الراعي غير صحيح ❌';
            icon.textContent = '❌';
            sponsorIdInput.value = '';

            // أخفِ قسم الـ placement
            hidePlacementSection();
        } else {
            // الراعي موجود
            display.className = 'sponsor-name-display valid';
            text.textContent = sponsor.full_name;
            icon.textContent = '✅';
            sponsorIdInput.value = sponsor.id;

            // اعرض قسم الـ placement وحمّل الـ options
            await showPlacementSection(sponsor.id);
        }
    } catch (err) {
        console.error('Sponsor lookup error:', err);
        display.className = 'sponsor-name-display invalid';
        text.textContent = 'حدث خطأ في البحث';
        icon.textContent = '⚠️';
        sponsorIdInput.value = '';
        hidePlacementSection();
    }
}

// ============================================================================
// 🌳 دوال الـ Placement (الموضع في الشجرة)
// ============================================================================

function hidePlacementSection() {
    const section = document.getElementById('placementSection');
    if (section) section.style.display = 'none';

    const select = document.getElementById('placementParentSelect');
    if (select) {
        select.innerHTML = '<option value="">— اختار الراعي الأول عشان يشوف قائمة الفريق —</option>';
        select.disabled = true;
    }

    const parentIdInput = document.getElementById('placementParentId');
    if (parentIdInput) parentIdInput.value = '';

    document.querySelectorAll('input[name="placementSide"]').forEach(r => r.checked = false);
    updatePlacementSideStatus(null, null);
}

async function showPlacementSection(sponsorId) {
    const section = document.getElementById('placementSection');
    const select = document.getElementById('placementParentSelect');
    const errorDiv = document.getElementById('placementError');

    if (!section || !select) return;

    section.style.display = 'block';
    select.disabled = true;
    select.innerHTML = '<option value="">⏳ بتحميل قائمة فريق الراعي...</option>';
    if (errorDiv) errorDiv.style.display = 'none';

    try {
        const options = await window.SAWYAN_TREE.getPlacementOptions(sponsorId, 20);

        if (options.length === 0) {
            select.innerHTML = '<option value="">— مفيش أماكن فاضية في شجرة الراعي —</option>';
            if (errorDiv) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = '⚠️ شجرة الراعي ممتلئة! مفيش أماكن فاضية على أي جهة. كلم الراعي أو الأدمن.';
            }
            return;
        }

        select.innerHTML = '<option value="">— اختار فين تحط العضو الجديد —</option>';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.member_id;
            const slots = [];
            if (opt.left_available) slots.push('يسار متاح');
            if (opt.right_available) slots.push('يمين متاح');
            const sponsorMark = opt.is_sponsor ? '⭐ ' : '';
            o.textContent = `${sponsorMark}#${opt.member_code} — ${opt.full_name} (جيل ${opt.generation}) — ${slots.join(' + ')}`;
            select.appendChild(o);
        });
        select.disabled = false;

        // لما يختار parent، حدّث الـ hidden input + حالة الجهات
        select.onchange = async () => {
            const parentId = select.value;
            document.getElementById('placementParentId').value = parentId;

            // أعد ضبط الاختيارات
            document.querySelectorAll('input[name="placementSide"]').forEach(r => r.checked = false);

            if (!parentId) {
                updatePlacementSideStatus(null, null);
                return;
            }

            // لقّي الـ option المختار عشان نعرف توفر الجهات
            const selectedOpt = options.find(o => o.member_id === parentId);
            if (selectedOpt) {
                updatePlacementSideStatus(selectedOpt.left_available, selectedOpt.right_available);
            }
        };

    } catch (err) {
        console.error('loadPlacementOptions error:', err);
        select.innerHTML = '<option value="">— حصل خطأ في التحميل —</option>';
        if (errorDiv) {
            errorDiv.style.display = 'block';
            errorDiv.textContent = 'حصل خطأ في تحميل قائمة الفريق. حاول تاني لو سمحت.';
        }
    }
}

function updatePlacementSideStatus(leftAvailable, rightAvailable) {
    const leftBtn = document.querySelector('input[name="placementSide"][value="left"]')?.closest('.placement-side-option').querySelector('.placement-side-btn');
    const rightBtn = document.querySelector('input[name="placementSide"][value="right"]')?.closest('.placement-side-option').querySelector('.placement-side-btn');
    const leftStatus = document.getElementById('leftStatus');
    const rightStatus = document.getElementById('rightStatus');

    if (leftAvailable === null) {
        // ما فيه parent مختار
        if (leftBtn) leftBtn.classList.remove('unavailable');
        if (rightBtn) rightBtn.classList.remove('unavailable');
        if (leftStatus) leftStatus.textContent = '—';
        if (rightStatus) rightStatus.textContent = '—';
        return;
    }

    if (leftBtn) {
        if (leftAvailable) {
            leftBtn.classList.remove('unavailable');
            if (leftStatus) leftStatus.textContent = '✓ متاح';
        } else {
            leftBtn.classList.add('unavailable');
            if (leftStatus) leftStatus.textContent = '✗ مأخوذ';
        }
    }
    if (rightBtn) {
        if (rightAvailable) {
            rightBtn.classList.remove('unavailable');
            if (rightStatus) rightStatus.textContent = '✓ متاح';
        } else {
            rightBtn.classList.add('unavailable');
            if (rightStatus) rightStatus.textContent = '✗ مأخوذ';
        }
    }
}

function getSelectedPlacement() {
    const parentId = document.getElementById('placementParentId').value;
    const sideInput = document.querySelector('input[name="placementSide"]:checked');
    const side = sideInput ? sideInput.value : null;
    return { parentId, side };
}


// تهيئة قوائم الدول (الجنسية ودولة الإقامة)
function initCountryDropdowns() {
    const countries = window.SAWYAN.getCountriesSortedByEnglish();

    const nationalitySelect = document.getElementById('nationality');
    const residenceSelect = document.getElementById('countryOfResidence');

    countries.forEach(country => {
        // قائمة الجنسية
        const nationalityOption = document.createElement('option');
        nationalityOption.value = country.code;
        nationalityOption.textContent = `${country.flag} ${country.nameEn} - ${country.nameAr}`;
        nationalitySelect.appendChild(nationalityOption);

        // قائمة دولة الإقامة
        const residenceOption = document.createElement('option');
        residenceOption.value = country.code;
        residenceOption.textContent = `${country.flag} ${country.nameEn} - ${country.nameAr}`;
        residenceSelect.appendChild(residenceOption);
    });
}

// تهيئة محدد مفتاح الهاتف مع الأعلام
function initPhoneCodeSelector() {
    const countries = window.SAWYAN.getCountriesSortedByEnglish();
    const countryCodeBtn = document.getElementById('countryCodeBtn');
    const countryCodeDropdown = document.getElementById('countryCodeDropdown');
    const countryCodeList = document.getElementById('countryCodeList');
    const countryCodeSearch = document.getElementById('countryCodeSearch');

    // بناء قائمة الدول
    function buildCountryList(filter = '') {
        countryCodeList.innerHTML = '';
        const filteredCountries = countries.filter(c =>
            c.nameEn.toLowerCase().includes(filter.toLowerCase()) ||
            c.nameAr.includes(filter) ||
            c.dialCode.includes(filter)
        );

        filteredCountries.forEach(country => {
            const option = document.createElement('div');
            option.className = 'country-code-option';
            option.innerHTML = `
                <span class="flag">${country.flag}</span>
                <span class="dial-code">${country.dialCode}</span>
                <span class="country-name">${country.nameEn}</span>
            `;
            option.addEventListener('click', () => selectCountry(country));
            countryCodeList.appendChild(option);
        });
    }

    // اختيار دولة
    function selectCountry(country) {
        countryCodeBtn.innerHTML = `
            <span class="flag">${country.flag}</span>
            <span class="dial-code">${country.dialCode}</span>
        `;
        document.getElementById('phoneCountryCode').value = country.code;
        document.getElementById('phoneDialCode').value = country.dialCode;
        countryCodeDropdown.classList.remove('show');
        countryCodeSearch.value = '';
    }

    // إظهار/إخفاء القائمة
    countryCodeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        countryCodeDropdown.classList.toggle('show');
        if (countryCodeDropdown.classList.contains('show')) {
            buildCountryList();
            countryCodeSearch.focus();
        }
    });

    // البحث في القائمة
    countryCodeSearch.addEventListener('input', (e) => {
        buildCountryList(e.target.value);
    });

    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.country-code-selector')) {
            countryCodeDropdown.classList.remove('show');
        }
    });

    // بناء القائمة الأولية
    buildCountryList();
}

// توليد كود العضوية - يتم فقط بعد التسجيل الناجح
async function generateMemberCodeAfterRegistration() {
    try {
        // استخدام ترتيب تنازلي للحصول على آخر كود مسجل
        const { data, error } = await window.SAWYAN.supabase
            .from('members')
            .select('member_code')
            .order('member_code', { ascending: false })
            .limit(1);

        let nextCode = 2; // يبدأ من 2 لأن 1 هو المؤسس
        if (data && data.length > 0) {
            const lastCode = parseInt(data[0].member_code);
            if (!isNaN(lastCode)) {
                nextCode = lastCode + 1;
            }
        }

        return nextCode.toString();
    } catch (error) {
        console.error('Error generating code:', error);
        // في حالة الخطأ، استخدم timestamp لضمان التفرد
        return 'M' + Date.now();
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('submitBtn');
    const fullName = document.getElementById('fullName').value.trim();
    const sponsorCode = document.getElementById('sponsorCode').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const phoneDialCode = document.getElementById('phoneDialCode').value;
    const phoneCountryCode = document.getElementById('phoneCountryCode').value;

    // البيانات الاختيارية
    const dateOfBirth = document.getElementById('dateOfBirth').value;
    const gender = document.getElementById('gender').value;
    const maritalStatus = document.getElementById('maritalStatus').value;
    const nationalId = document.getElementById('nationalId').value.trim();
    const nationality = document.getElementById('nationality').value;
    const countryOfResidence = document.getElementById('countryOfResidence').value;
    const city = document.getElementById('city').value.trim();
    const address = document.getElementById('address').value.trim();

    // التحقق من الحقول الإجبارية
    if (!fullName) {
        alert('الاسم الكامل إجباري');
        return;
    }

    if (!sponsorCode) {
        alert('كود الأب لاين (الراعي) إجباري');
        return;
    }

    // التحقق من أن الراعي تم التحقق منه
    const sponsorId = document.getElementById('sponsorId').value;
    if (!sponsorId) {
        // إذا لم يتم التحقق من الراعي بعد، نحاول البحث عنه
        await lookupSponsor(sponsorCode);
        const newSponsorId = document.getElementById('sponsorId').value;
        if (!newSponsorId) {
            alert('كود الراعي غير صحيح. تأكد من إدخال كود راعي موجود.\n\nملاحظة: للتسجيل تحت العضو المؤسس، استخدم الكود: 1');
            return;
        }
    }

    // 🌳 التحقق من الـ placement (الموضع في الشجرة)
    const placement = getSelectedPlacement();
    if (!placement.parentId) {
        alert('لازم تختار فين تحط العضو الجديد في شجرة الراعي\n\n→ القسم الأخضر تحت اسم الراعي');
        // اعرض القسم لو مخفي
        const section = document.getElementById('placementSection');
        if (section) {
            section.style.display = 'block';
            section.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
    }
    if (!placement.side) {
        alert('لازم تختار الجهة: يمين ولا شمال؟');
        return;
    }

    // تفعيل حالة التحميل
    submitBtn.classList.add('btn-loading');
    submitBtn.textContent = 'جاري التسجيل...';
    submitBtn.disabled = true;

    try {
        // استخدام sponsorId المحفوظ من البحث التلقائي
        const verifiedSponsorId = document.getElementById('sponsorId').value;

        if (!verifiedSponsorId) {
            throw new Error('كود الراعي غير صحيح. تأكد من إدخال كود راعي موجود.\n\nملاحظة: للتسجيل تحت العضو المؤسس، استخدم الكود: 1');
        }

        // تكوين رقم الهاتف الكامل
        const fullPhone = phoneDialCode + phone.replace(/\s/g, '');

        // إنشاء سجل العضو - بدون member_code (سيتم توليده تلقائياً)
        // ⚠️ email و phone NOT NULL في الـ DB، لازم نبعت قيمة
        const tempEmail = email || `pending_${Date.now()}@sawyan.local`;
        const memberData = {
            full_name: fullName,
            email: tempEmail,
            password_hash: '123456',
            phone: fullPhone || '+200000000000',
            is_active: true
        };

        // إضافة البيانات الاختيارية إذا تم تقديمها
        if (dateOfBirth) memberData.date_of_birth = dateOfBirth;
        if (gender) memberData.gender = gender;
        if (maritalStatus) memberData.marital_status = maritalStatus;
        if (nationalId) memberData.national_id = nationalId;
        if (nationality) memberData.nationality = nationality;
        if (countryOfResidence) memberData.country_of_residence = countryOfResidence;
        if (city) memberData.city = city;
        if (address) memberData.address = address;
        if (phoneCountryCode) memberData.phone_country_code = phoneCountryCode;

        // 🌳 استخدم createMemberWithPlacement (بيعمل validation + insert + trigger تحديث الشجرة)
        const newMember = await window.SAWYAN_TREE.createMemberWithPlacement(
            memberData,
            verifiedSponsorId,        // sponsor_id (الأبلاين الحقيقي)
            placement.parentId,       // parent_member_id (الأبلاين المحظوط)
            placement.side            // placement_side ('left' or 'right')
        );

        // تحديث البريد الإلكتروني إذا كان مؤقتاً
        let finalEmail = newMember.email;
        if (!email) {
            finalEmail = `member${newMember.member_code}@sawyan.local`;
            const { error: emailErr } = await window.SAWYAN.supabase
                .from('members')
                .update({ email: finalEmail })
                .eq('id', newMember.id);
            if (emailErr) console.warn('Email update failed:', emailErr);
            else newMember.email = finalEmail;
        }

        const memberCode = newMember.member_code; // الحصول على الكود من قاعدة البيانات

        // إنشاء محفظة
        await window.SAWYAN.supabase
            .from('wallets')
            .insert([{
                member_id: newMember.id,
                balance: 0
            }]);

        // إرسال إشعار ترحيب للعضو الجديد
        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'member',
                    user_id: newMember.id,
                    title: 'مرحباً بك في SAWYAN 👋',
                    message: 'تم تسجيلك بنجاح! كود عضويتك: ' + memberCode + '. ابدأ التسوق واحصل على كاش باك فوري.',
                    notification_type: 'welcome'
                }]);
            console.log('Welcome notification sent');
        } catch (notifError) {
            console.log('Notifications table may not exist');
        }

        // إرسال إشعار للراعي
        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'member',
                    user_id: verifiedSponsorId,
                    title: 'عضو جديد في فريقك 🌟',
                    message: fullName + ' انضم لفريقك! كود العضوية: ' + memberCode,
                    notification_type: 'new_team_member'
                }]);
            console.log('Sponsor notification sent');
        } catch (notifError) {
            console.log('Notifications table may not exist');
        }

        // عرض الكود للمستخدم
        document.getElementById('generatedCode').textContent = memberCode;
        document.getElementById('memberCodeDisplay').classList.add('show');

        // حفظ بيانات العضو للدخول التلقائي
        localStorage.setItem('sawyan_member', JSON.stringify(newMember));
        localStorage.setItem('sawyan_member_id', newMember.id);

        // إخفاء النموذج وإظهار رسالة النجاح
        document.getElementById('registerForm').style.display = 'none';

        // عرض رسالة نجاح
        const successMessage = document.createElement('div');
        successMessage.style.cssText = `
            text-align: center;
            padding: 30px;
            background: linear-gradient(135deg, rgba(0, 217, 255, 0.1), rgba(138, 43, 226, 0.1));
            border-radius: 12px;
            margin-top: 20px;
        `;
        successMessage.innerHTML = `
            <h2 style="color: #4ade80; margin-bottom: 20px;">🎉 تم التسجيل بنجاح!</h2>
            <p style="margin-bottom: 10px;">كود عضويتك: <strong style="color: var(--primary-color);">${memberCode}</strong></p>
            <p style="margin-bottom: 20px;">كلمة المرور: <strong style="color: var(--primary-color);">123456</strong></p>
            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">
                احتفظ بكود عضويتك! ستحتاجه للدخول ومشاركته مع الآخرين.
            </p>
            <a href="dashboard.html" class="btn btn-primary btn-block">دخول لوحة التحكم</a>
        `;
        document.querySelector('.auth-card').appendChild(successMessage);

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);

        // إعادة تفعيل الزر
        submitBtn.classList.remove('btn-loading');
        submitBtn.textContent = 'تسجيل';
        submitBtn.disabled = false;
    }
}
