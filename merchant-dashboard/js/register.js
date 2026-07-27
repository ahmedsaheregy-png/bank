// تسجيل تاجر - بدون Supabase Auth
document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.full();
    }

    // إخفاء حقل كود التاجر لأنه سيتم توليده تلقائياً
    const codeContainer = document.getElementById('merchantCode').parentElement;
    if (codeContainer) codeContainer.style.display = 'none';

    document.getElementById('registerForm').addEventListener('submit', handleRegister);
});

async function handleRegister(e) {
    e.preventDefault();

    // حقل الكود لم يعد مطلوباً من المستخدم
    const businessName = document.getElementById('businessName').value;
    const ownerName = document.getElementById('ownerName').value || businessName;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const commissionPercentage = parseFloat(document.getElementById('commissionPercentage').value) || 10;
    const merchantType = document.getElementById('merchantType').value || 'physical';
    const businessCategory = document.getElementById('businessCategory').value || 'أخرى';
    const businessDescription = document.getElementById('businessDescription').value;

    // الموقع الجغرافي
    const country = document.getElementById('country')?.value || 'مصر';
    const city = document.getElementById('city')?.value || '';
    const address = document.getElementById('address')?.value || '';
    const latitude = parseFloat(document.getElementById('latitude')?.value) || null;
    const longitude = parseFloat(document.getElementById('longitude')?.value) || null;
    const googleMapsUrl = document.getElementById('googleMapsUrl')?.value || '';

    // المتجر الإلكتروني
    const websiteUrl = document.getElementById('websiteUrl')?.value || '';
    const webhookUrl = document.getElementById('webhookUrl')?.value || '';

    // روابط التواصل
    const whatsapp = document.getElementById('whatsapp')?.value || '';
    const facebookUrl = document.getElementById('facebookUrl')?.value || '';
    const instagramUrl = document.getElementById('instagramUrl')?.value || '';
    const twitterUrl = document.getElementById('twitterUrl')?.value || '';
    const tiktokUrl = document.getElementById('tiktokUrl')?.value || '';

    // الصور
    const logoUrl = document.getElementById('logoUrl')?.value || '';
    const coverImageUrl = document.getElementById('coverImageUrl')?.value || '';

    // جمع أوقات العمل
    const workingHours = collectWorkingHours();

    // جمع روابط التواصل في JSON
    const socialLinks = {
        facebook: facebookUrl,
        instagram: instagramUrl,
        twitter: twitterUrl,
        tiktok: tiktokUrl,
        website: websiteUrl
    };

    // التحقق من الحقل الإلزامي فقط
    if (!businessName) {
        alert('اسم النشاط التجاري إجباري');
        return;
    }

    try {
        // إنشاء سجل التاجر مباشرة - بدون merchant_code (سيتم توليده تلقائياً)
        const merchantData = {
            business_name: businessName,
            owner_name: ownerName,
            email: email || undefined, // سيتم توليده لاحقاً إذا كان فارغاً
            password_hash: '123456',
            phone: phone || '',
            merchant_type: merchantType,
            business_category: businessCategory,
            business_description: businessDescription || '',
            commission_percentage: commissionPercentage,
            is_active: true,
            // الحقول الجديدة
            country: country,
            city: city,
            address_details: address,
            latitude: latitude,
            longitude: longitude,
            whatsapp: whatsapp,
            social_links: socialLinks,
            working_hours: workingHours,
            logo_url: logoUrl,
            cover_image_url: coverImageUrl
        };

        const { data: newMerchant, error: merchantError } = await window.SAWYAN.supabase
            .from('merchants')
            .insert([merchantData])
            .select() // مهم لاسترجاع الكود المولد
            .single();

        if (merchantError) throw merchantError;

        // تحديث البريد الإلكتروني إذا كان فارغاً (يعتمد على الكود المولد)
        let finalEmail = newMerchant.email;
        if (!email) {
            finalEmail = `merchant${newMerchant.merchant_code}@sawyan.local`;
            await window.SAWYAN.supabase
                .from('merchants')
                .update({ email: finalEmail })
                .eq('id', newMerchant.id);

            newMerchant.email = finalEmail;
        }

        const merchantCode = newMerchant.merchant_code; // الحصول على الكود من قاعدة البيانات

        // إرسال إشعار ترحيب للتاجر الجديد
        try {
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'merchant',
                    user_id: newMerchant.id,
                    title: 'مرحباً بك في SAWYAN 🏪',
                    message: 'تم تسجيل نشاطك التجاري "' + businessName + '" بنجاح! كود التاجر: ' + merchantCode + '. ابدأ باستقبال العملاء.',
                    notification_type: 'welcome'
                }]);
            console.log('Merchant welcome notification sent');
        } catch (notifError) {
            console.log('Notifications table may not exist');
        }

        // حفظ بيانات التاجر للدخول التلقائي
        localStorage.setItem('sawyan_merchant', JSON.stringify(newMerchant));
        localStorage.setItem('sawyan_merchant_id', newMerchant.id);

        alert('تم التسجيل بنجاح! 🎉\n\nكود التاجر: ' + merchantCode + '\nكلمة المرور: 123456');
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

// دالة لجمع أوقات العمل من الفورم
function collectWorkingHours() {
    const days = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
    const dayNames = {
        'sat': 'السبت',
        'sun': 'الأحد',
        'mon': 'الإثنين',
        'tue': 'الثلاثاء',
        'wed': 'الأربعاء',
        'thu': 'الخميس',
        'fri': 'الجمعة'
    };

    const workingHours = {};

    days.forEach(day => {
        const fromInput = document.getElementById(`${day}_from`);
        const toInput = document.getElementById(`${day}_to`);
        const closedCheckbox = document.getElementById(`${day}_closed`);

        if (closedCheckbox && closedCheckbox.checked) {
            workingHours[day] = { closed: true, name: dayNames[day] };
        } else if (fromInput && toInput && fromInput.value && toInput.value) {
            workingHours[day] = {
                from: fromInput.value,
                to: toInput.value,
                closed: false,
                name: dayNames[day]
            };
        }
    });

    return Object.keys(workingHours).length > 0 ? workingHours : null;
}
