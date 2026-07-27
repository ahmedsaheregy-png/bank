// لوحة التاجر - مكتملة بكل الميزات
let currentMerchant = null;
let merchantData = null;

document.addEventListener('DOMContentLoaded', async function () {
    if (window.SAWYAN && window.SAWYAN.Logo) {
        document.getElementById('logoContainer').innerHTML = window.SAWYAN.Logo.icon();
    }

    await checkAuth();
    await loadStats();

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });

    // تفعيل Bottom Navigation
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const page = this.dataset.page;

            document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');

            showPage(page);
        });
    });

    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleTransaction);
    }

    // البحث عند الضغط Enter في حقل الكود أو الموبايل
    const memberCodeInput = document.getElementById('memberCodeInput');
    if (memberCodeInput) {
        memberCodeInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); lookupMemberByCode(); }
        });
    }
    const memberPhoneInput = document.getElementById('memberPhoneInput');
    if (memberPhoneInput) {
        memberPhoneInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); lookupMemberByPhone(); }
        });
    }

    // معاينة العمولة عند إدخال المبلغ
    const amountInput = document.getElementById('amount');
    if (amountInput) {
        amountInput.addEventListener('input', updateCommissionPreview);
    }
});

// ===== متغيرات عامة للتبويبات والاسكانر =====
let selectedMember = null;       // العضو المُكتشف (محفوظ مؤقتاً)
let html5QrCodeInstance = null;  // كائن QR Scanner النشط
let currentScanMethod = 'qr';    // الطريقة النشطة حالياً

// ===== تبديل طريقة الإدخال (QR / كود / موبايل) =====
function switchScanMethod(method) {
    currentScanMethod = method;
    // إيقاف الكاميرا إذا كنا في QR والتبديل لطريقة أخرى
    if (method !== 'qr') { stopQRScanner(); }

    // تحديث التبويبات
    document.querySelectorAll('.scan-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.method === method);
    });
    // إظهار القسم المناسب
    document.querySelectorAll('.scan-method').forEach(sec => {
        sec.classList.remove('active');
    });
    const target = document.getElementById('scanMethod' + method.charAt(0).toUpperCase() + method.slice(1));
    if (target) target.classList.add('active');
}

// ===== بدء QR Scanner =====
async function startQRScanner() {
    const statusEl = document.getElementById('scanStatus');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const readerEl = document.getElementById('qrReader');

    // التحقق من توفر المكتبة
    if (typeof Html5Qrcode === 'undefined') {
        if (statusEl) statusEl.innerHTML = '<div class="alert alert-error">⚠️ مكتبة QR غير متاحة. استخدم الإدخال اليدوي.</div>';
        return;
    }

    try {
        if (startBtn) startBtn.disabled = true;
        if (statusEl) statusEl.innerHTML = '<div class="alert alert-info">📷 جاري تشغيل الكاميرا...</div>';

        html5QrCodeInstance = new Html5Qrcode('qrReader');
        const config = {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0
        };

        await html5QrCodeInstance.start(
            { facingMode: 'environment' },
            config,
            onQRScanSuccess,
            onQRScanFailure
        );

        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'block';
        if (statusEl) statusEl.innerHTML = '<div class="alert alert-info">📷 الكاميرا تعمل — وجّهها نحو QR Code</div>';
    } catch (err) {
        console.error('QR Scanner error:', err);
        if (statusEl) statusEl.innerHTML =
            '<div class="alert alert-error">⚠️ تعذّر تشغيل الكاميرا. تأكد من منح الإذن ثم حاول مرة أخرى.<br>' +
            '<small>يمكنك استخدام الإدخال اليدوي بدلاً من ذلك.</small></div>';
        if (startBtn) startBtn.disabled = false;
    }
}

function onQRScanSuccess(decodedText) {
    // تم مسح QR بنجاح
    stopQRScanner();
    const statusEl = document.getElementById('scanStatus');
    if (statusEl) statusEl.innerHTML = '<div class="alert alert-success">✅ تم مسح الكود: ' + decodedText + '</div>';
    // استخدم النص ككود عضو
    document.getElementById('memberCodeInput').value = decodedText;
    lookupMemberByCode(decodedText);
}

function onQRScanFailure(error) {
    // تجاهل — يُستدعى باستمرار أثناء المسح
}

async function stopQRScanner() {
    if (html5QrCodeInstance) {
        try {
            await html5QrCodeInstance.stop();
            await html5QrCodeInstance.clear();
        } catch (err) {
            console.warn('Error stopping scanner:', err);
        }
        html5QrCodeInstance = null;
    }
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    if (startBtn) { startBtn.style.display = 'block'; startBtn.disabled = false; }
    if (stopBtn) stopBtn.style.display = 'none';
}

// ===== البحث عن عضو بالكود =====
async function lookupMemberByCode(overrideCode) {
    const code = (overrideCode || document.getElementById('memberCodeInput').value || '').trim();
    if (!code) {
        alert('الرجاء إدخال كود العضو');
        return;
    }
    await findAndShowMember({ column: 'member_code', value: code });
}

// ===== البحث عن عضو بالموبايل =====
async function lookupMemberByPhone() {
    let phone = (document.getElementById('memberPhoneInput').value || '').trim();
    if (!phone) {
        alert('الرجاء إدخال رقم الموبايل');
        return;
    }
    // تنظيف الرقم من المسافات والشرطات
    phone = phone.replace(/[\s\-+]/g, '');
    // البحث بأكثر من صيغة (مثلاً: 01012345678 أو 10012345678)
    await findAndShowMember({ column: 'phone', value: phone, isPhone: true });
}

// ===== دالة موحدة لجلب بيانات العضو وعرضها =====
async function findAndShowMember({ column, value, isPhone = false }) {
    const statusEl = document.getElementById('scanStatus');
    try {
        if (statusEl) statusEl.innerHTML = '<div class="alert alert-info">🔍 جاري البحث...</div>';

        let query = window.SAWYAN.supabase
            .from('members')
            .select('id, member_code, full_name, phone, email');

        if (isPhone) {
            // البحث بالرقم كما هو أو مع/bدون مفتاح الدولة
            query = query.or(`phone.eq.${value},phone.eq.+${value}`);
        } else {
            query = query.eq(column, value);
        }

        const { data: members, error } = await query.limit(5);

        if (error) throw error;

        if (!members || members.length === 0) {
            if (statusEl) statusEl.innerHTML = '<div class="alert alert-error">❌ لم يتم العثور على عضو بهذا ' + (isPhone ? 'الموبايل' : 'الكود') + '</div>';
            clearSelectedMember();
            return;
        }

        if (members.length > 1) {
            // نتائج متعددة — اعرضها للاختيار
            showMultipleMembers(members);
            return;
        }

        setSelectedMember(members[0]);
        if (statusEl) statusEl.innerHTML = '';
    } catch (err) {
        console.error('Lookup error:', err);
        if (statusEl) statusEl.innerHTML = '<div class="alert alert-error">⚠️ خطأ: ' + err.message + '</div>';
    }
}

function showMultipleMembers(members) {
    const statusEl = document.getElementById('scanStatus');
    if (!statusEl) return;
    statusEl.innerHTML =
        '<div class="alert alert-info">تم العثور على ' + members.length + ' نتائج. اختر واحداً:</div>' +
        '<div class="multi-members-list">' +
        members.map(m =>
            '<button type="button" class="member-pick-btn" onclick=\'setSelectedMember(' + JSON.stringify(m) + ')\'>' +
            '<strong>' + (m.full_name || 'بدون اسم') + '</strong>' +
            '<small>كود: ' + m.member_code + (m.phone ? ' | 📱 ' + m.phone : '') + '</small>' +
            '</button>'
        ).join('') +
        '</div>';
}

function setSelectedMember(member) {
    selectedMember = member;
    document.getElementById('memberFoundCard').style.display = 'block';
    document.getElementById('foundMemberName').textContent = member.full_name || 'بدون اسم';
    document.getElementById('foundMemberCode').textContent = member.member_code || '-';
    document.getElementById('foundMemberPhone').textContent = member.phone || '-';
    document.getElementById('transactionForm').style.display = 'block';
    // مسح أي حالة خطأ سابقة
    const statusEl = document.getElementById('scanStatus');
    if (statusEl) statusEl.innerHTML = '';
    // تمرير لأسفل للوصول لنموذج المبلغ
    document.getElementById('transactionForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function clearSelectedMember() {
    selectedMember = null;
    document.getElementById('memberFoundCard').style.display = 'none';
    document.getElementById('transactionForm').style.display = 'none';
    document.getElementById('memberCodeInput').value = '';
    document.getElementById('memberPhoneInput').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('commissionPreview').style.display = 'none';
}

// ===== معاينة العمولة قبل التأكيد =====
function updateCommissionPreview() {
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    if (amount <= 0 || !merchantData) {
        document.getElementById('commissionPreview').style.display = 'none';
        return;
    }
    const pct = parseFloat(merchantData.commission_percentage) || 0;
    const total = amount * (pct / 100);
    const memberShare = total * 0.75;
    const companyShare = total * 0.25;
    document.getElementById('previewTotalCommission').textContent = total.toFixed(2) + ' ج.م';
    document.getElementById('previewMemberShare').textContent = memberShare.toFixed(2) + ' ج.م';
    document.getElementById('previewCompanyShare').textContent = companyShare.toFixed(2) + ' ج.م';
    document.getElementById('commissionPreview').style.display = 'block';
}

async function checkAuth() {
    // التحقق من localStorage
    const savedMerchant = localStorage.getItem('sawyan_merchant');
    if (!savedMerchant) {
        window.location.href = 'login.html';
        return;
    }

    try {
        merchantData = JSON.parse(savedMerchant);
        currentMerchant = { id: merchantData.id };

        // تحديث واجهة المستخدم
        document.getElementById('businessName').textContent = merchantData.business_name || 'تاجر';
        document.getElementById('merchantCode').textContent = 'كود التاجر: ' + merchantData.merchant_code;
    } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('sawyan_merchant');
        window.location.href = 'login.html';
    }
}

async function loadStats() {
    try {
        const today = new Date().toISOString().split('T')[0];

        // عمليات اليوم
        const { data: todayTrans, count: todayCount } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*', { count: 'exact' })
            .eq('merchant_id', currentMerchant.id)
            .gte('transaction_date', today);

        document.getElementById('todayTransactions').textContent = todayCount || 0;

        const todayTotal = todayTrans?.reduce((sum, t) => sum + parseFloat(t.total_amount), 0) || 0;
        document.getElementById('todaySales').textContent = todayTotal.toFixed(2) + ' ج.م';

        // إجمالي العمليات
        const { count: totalCount } = await window.SAWYAN.supabase
            .from('transactions')
            .select('*', { count: 'exact', head: true })
            .eq('merchant_id', currentMerchant.id);

        // هنا نستخدم ID الجديد للبطاقة
        if (document.getElementById('totalTransactionsCount')) {
            document.getElementById('totalTransactionsCount').textContent = totalCount || 0;
        }

        // المستحق للشركة (إجمالي العمولات المستقطعة)
        const { data: allTrans } = await window.SAWYAN.supabase
            .from('transactions')
            .select('commission_amount')
            .eq('merchant_id', currentMerchant.id);

        const totalCommissionDue = allTrans?.reduce((sum, t) => sum + parseFloat(t.commission_amount || 0), 0) || 0;

        // عرض الرقم في مكانه الجديد
        if (document.getElementById('totalCommissionsDue')) {
            document.getElementById('totalCommissionsDue').textContent = totalCommissionDue.toFixed(2) + ' ج.م';
        }

        // تحديث القديم من باب الاحتياط (pendingPayment)
        if (document.getElementById('pendingPayment')) {
            document.getElementById('pendingPayment').textContent = (totalCommissionDue * 0.25).toFixed(2) + ' ج.م'; // حصة الشركة فقط
        }

    } catch (error) {
        console.error('Error:', error);
    }
}

async function handleTransaction(e) {
    e.preventDefault();

    const amount = parseFloat(document.getElementById('amount').value);

    // استخدام العضو المُكتشف من أي طريقة (QR/كود/موبايل)
    if (!selectedMember) {
        alert('الرجاء تحديد العضو أولاً (مسح QR أو إدخال كود/موبايل)');
        return;
    }
    if (!amount || amount <= 0) {
        alert('الرجاء إدخال مبلغ صحيح');
        return;
    }

    try {
        // التأكد من العضو موجود (إعادة فحص سريع)
        const member = selectedMember;

        // حساب العمولات (نظام قديم - للعرض في الإيصال)
        const commissionPercentage = merchantData.commission_percentage || merchantData.deduction_percent || 10;
        const commissionAmount = amount * (commissionPercentage / 100);
        const companyShare = commissionAmount * 0.25;
        const planShare = commissionAmount * 0.75;

        const transactionCode = 'T' + Date.now();

        // تسجيل العملية (بدون ما نظيف عمولة للمحفظة هنا — حنوزعها بعدين)
        const { data: newTransaction, error: transError } = await window.SAWYAN.supabase
            .from('transactions')
            .insert([{
                transaction_code: transactionCode,
                member_id: member.id,
                merchant_id: currentMerchant.id,
                total_amount: amount,
                commission_percentage: commissionPercentage,
                commission_amount: commissionAmount,
                company_share: companyShare,
                plan_share: planShare,
                status: 'completed'
            }])
            .select()
            .single();

        if (transError) throw transError;

        // 🌳 توزيع العمولة على البول + الأبلاينز (النظام الجديد)
        let distributionResult = null;
        try {
            distributionResult = await window.SAWYAN_TREE.distributeTransactionCommission(newTransaction.id);
            console.log('🌳 Distribution result:', distributionResult);

            // أضف العمولات لمحافظ المستفيدين
            await creditBeneficiariesWallets(distributionResult.pool_transaction_id, merchantData.business_name);
        } catch (distErr) {
            console.error('Distribution failed (continuing):', distErr);
            // لو التوزيع فشل، العملية اتعملت بس العمولات ما اتوزعتش
            // الأدمن يقدر يوزعها بعدين يدوياً
        }

        // إرسال إشعار للعضو
        try {
            const sharePerMember = distributionResult ? ((distributionResult.member_share || 0)) : 0;
            const beneficiaries = distributionResult ? (distributionResult.upline_count + 1) : 0;
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'member',
                    user_id: member.id,
                    title: '💰 تم إضافة عمولة جديدة!',
                    message: 'تم تسجيل عملية شراء بمبلغ ' + amount.toFixed(2) + ' ج.م لدى ' + merchantData.business_name +
                             '. حصتك: ' + sharePerMember.toFixed(2) + ' ج.م (من إجمالي ' + beneficiaries + ' مستفيد).',
                    notification_type: 'commission'
                }]);
            console.log('Notification sent to member');
        } catch (notifError) {
            console.log('Notifications table may not exist:', notifError);
        }

        // عرض شاشة التأكيد النهائية (Receipt Modal)
        showReceipt({
            transactionCode: transactionCode,
            amount: amount,
            commissionPercentage: commissionPercentage,
            commissionAmount: commissionAmount,
            memberShare: distributionResult ? ((distributionResult.member_share || 0)) : planShare,
            companyShare: companyShare,
            member: selectedMember,
            merchant: merchantData,
            timestamp: new Date(),
            distributionInfo: distributionResult
        });

        clearSelectedMember();
        await loadStats();

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

// ===== شاشة التأكيد النهائية (Receipt Modal) =====
let lastReceiptData = null; // لحفظ بيانات آخر إيصال (للطباعة/النسخ/المشاركة)

function showReceipt(data) {
    lastReceiptData = data;
    const body = document.getElementById('receiptBody');
    if (!body) return;

    const dateStr = data.timestamp.toLocaleString('ar-EG', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    // بناء رابط التحقق (verify.html) — يفتحه العميل لاحقاً لما يلاقي نت
    const verifyUrl = window.location.origin + '/verify.html?code=' + data.transactionCode;

    body.innerHTML = `
        <div class="receipt-section">
            <div class="receipt-section-label">كود العملية</div>
            <div style="text-align: center;">
                <span class="receipt-row-value code">${data.transactionCode}</span>
            </div>
        </div>

        <div class="receipt-section">
            <div class="receipt-section-label">التاريخ والوقت</div>
            <div class="receipt-row">
                <span class="receipt-row-label">📅</span>
                <span class="receipt-row-value">${dateStr}</span>
            </div>
        </div>

        <div class="receipt-section">
            <div class="receipt-section-label">التاجر</div>
            <div class="receipt-row">
                <span class="receipt-row-label">🏪 الاسم:</span>
                <span class="receipt-row-value">${data.merchant?.business_name || '-'}</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-row-label">🔑 الكود:</span>
                <span class="receipt-row-value">${data.merchant?.merchant_code || '-'}</span>
            </div>
        </div>

        <div class="receipt-section">
            <div class="receipt-section-label">العميل</div>
            <div class="receipt-row">
                <span class="receipt-row-label">👤 الاسم:</span>
                <span class="receipt-row-value">${data.member?.full_name || '-'}</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-row-label">🔑 الكود:</span>
                <span class="receipt-row-value">${data.member?.member_code || '-'}</span>
            </div>
            ${data.member?.phone ? `
            <div class="receipt-row">
                <span class="receipt-row-label">📱 الموبايل:</span>
                <span class="receipt-row-value" style="direction: ltr;">${data.member.phone}</span>
            </div>` : ''}
        </div>

        <div class="receipt-section">
            <div class="receipt-section-label">تفاصيل العملية</div>
            <div class="receipt-amount-block">
                <div class="receipt-amount-label">المبلغ الإجمالي</div>
                <div class="receipt-amount-value">
                    <span class="receipt-amount-currency">ج.م</span>${data.amount.toFixed(2)}
                </div>
            </div>
            <div class="receipt-row">
                <span class="receipt-row-label">نسبة العمولة:</span>
                <span class="receipt-row-value">${data.commissionPercentage}%</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-row-label">إجمالي العمولة:</span>
                <span class="receipt-row-value">${data.commissionAmount.toFixed(2)} ج.م</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-row-label">نصيب العميل:</span>
                <span class="receipt-row-value highlight">${data.memberShare.toFixed(2)} ج.م</span>
            </div>
            <div class="receipt-row">
                <span class="receipt-row-label">حصة الإدارة:</span>
                <span class="receipt-row-value">${data.companyShare.toFixed(2)} ج.م</span>
            </div>
        </div>

        <div class="receipt-qr-block">
            <div id="receiptQrCode"></div>
            <p class="receipt-qr-hint">
                🔍 امسح هذا الكود للتحقق من تفاصيل العملية
            </p>
        </div>
    `;

    // توليد QR Code لرابط التحقق
    setTimeout(() => {
        const qrEl = document.getElementById('receiptQrCode');
        if (qrEl && window.QRCode) {
            qrEl.innerHTML = '';
            new QRCode(qrEl, {
                text: verifyUrl,
                width: 160,
                height: 160,
                colorDark: '#10B981',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.M
            });
        }
    }, 50);

    // عرض الـ Modal
    document.getElementById('receiptOverlay').classList.add('show');
}

function closeReceipt() {
    document.getElementById('receiptOverlay').classList.remove('show');
}

function printReceipt() {
    window.print();
}

function copyReceiptDetails() {
    if (!lastReceiptData) return;
    const d = lastReceiptData;
    const dateStr = d.timestamp.toLocaleString('ar-EG');
    const text =
        '=== SAWYAN BANK ===\n' +
        '✅ تمت العملية بنجاح\n' +
        'كود العملية: ' + d.transactionCode + '\n' +
        'التاريخ: ' + dateStr + '\n' +
        'التاجر: ' + (d.merchant?.business_name || '-') + ' (' + (d.merchant?.merchant_code || '-') + ')\n' +
        'العميل: ' + (d.member?.full_name || '-') + ' (' + (d.member?.member_code || '-') + ')\n' +
        'المبلغ: ' + d.amount.toFixed(2) + ' ج.م\n' +
        'العمولة الإجمالية: ' + d.commissionAmount.toFixed(2) + ' ج.م\n' +
        'نصيب العميل: ' + d.memberShare.toFixed(2) + ' ج.م\n' +
        'التحقق: ' + window.location.origin + '/verify.html?code=' + d.transactionCode;

    // محاولة استخدام Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            alert('✅ تم نسخ تفاصيل العملية');
        }).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        alert('✅ تم نسخ تفاصيل العملية');
    } catch (err) {
        alert('تعذّر النسخ — انسخ يدوياً:\n\n' + text);
    }
    document.body.removeChild(textarea);
}

async function shareReceipt() {
    if (!lastReceiptData) return;
    const d = lastReceiptData;
    const dateStr = d.timestamp.toLocaleString('ar-EG');
    const shareData = {
        title: 'إيصال عملية - SAWYAN BANK',
        text:
            '✅ تمت العملية بنجاح\n' +
            'كود العملية: ' + d.transactionCode + '\n' +
            'التاريخ: ' + dateStr + '\n' +
            'التاجر: ' + (d.merchant?.business_name || '-') + '\n' +
            'المبلغ: ' + d.amount.toFixed(2) + ' ج.م\n' +
            'نصيب العميل: ' + d.memberShare.toFixed(2) + ' ج.م',
        url: window.location.origin + '/verify.html?code=' + d.transactionCode
    };

    if (navigator.share) {
        try {
            await navigator.share(shareData);
        } catch (err) {
            console.log('Share cancelled');
        }
    } else {
        // fallback → نسخ الرابط
        copyReceiptDetails();
    }
}

function handleNavigation(e) {
    e.preventDefault();
    const page = this.dataset.page;
    showPage(page);
}

// دالة مساعدة لعرض اسم طريقة الدفع بوضوح
function getPaymentLabel(t) {
    if (t.payment_method === 'outside') {
        return '<span class="badge badge-warning">تحويل خارجي (إرسال فاتورة)</span>';
    }

    if (t.payment_method === 'provider' && t.metadata && t.metadata.provider_info) {
        const info = t.metadata.provider_info;
        const providerNames = {
            'card': 'بطاقة بنكية',
            'wallet': 'محفظة إلكترونية',
            'fawry': 'فوري',
            'aman': 'أمان',
            'vf_cash': 'فودافون كاش',
            'insta': 'انستا باي',
            'bank_misr': 'بنك مصر',
            'cbe': 'البنك المركزي',
            'ziraat': 'زراعات بنك',
            'kuwait_turk': 'كويت ترك',
            'stc': 'STC Pay',
            'urpay': 'UrPay',
            'alrajhi': 'الراجحي'
        };

        let label = providerNames[info.provider_id] || info.provider_id || 'دفع إلكتروني';

        // إضافة تفاصيل إضافية إذا وجدت
        if (info.type === 'card') label += ' 💳';
        if (info.type === 'wallet') label += ' 📱';

        return `<span class="badge badge-success">${label}</span>`;
    }

    return '<span class="badge badge-secondary">غير محدد</span>';
}

function showPage(page) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });

    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });

    const pageElement = document.getElementById(page + 'Page');
    if (pageElement) {
        pageElement.classList.add('active');
    }

    // تحميل محتوى الصفحة
    if (page === 'pending') loadPendingTransactions();
    if (page === 'transactions') loadAllTransactions();
    if (page === 'financial') loadFinancialReport();
    if (page === 'settings') loadSettings();
    if (page === 'qrScanner') loadQRScannerPage();

    // إيقاف الكاميرا عند مغادرة صفحة المسح
    if (page !== 'scan') {
        stopQRScanner();
    }
}

// ===== العمليات المعلقة (طلبات من الأعضاء) =====
async function loadPendingTransactions() {
    const page = document.getElementById('pendingPage');
    page.innerHTML = `
        <h2>طلبات التوثيق المعلقة</h2>
        <p class="page-description">طلبات توثيق عمليات من الأعضاء تحتاج موافقتك</p>
        <div id="pendingList"><p>جاري التحميل...</p></div>
    `;

    try {
        console.log('Loading pending transactions for merchant:', currentMerchant.id);

        const { data: transactions, error } = await window.SAWYAN.supabase
            .from('transactions')
            .select(`*, members(member_code, full_name)`)
            .eq('merchant_id', currentMerchant.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        console.log('Pending transactions result:', transactions, 'Error:', error);

        const list = document.getElementById('pendingList');

        if (error) {
            list.innerHTML = `<p class="empty-state">خطأ في جلب البيانات: ${error.message}</p>`;
            return;
        }

        if (!transactions || transactions.length === 0) {
            list.innerHTML = '<p class="empty-state">لا توجد طلبات معلقة 🎉</p>';
            return;
        }

        list.innerHTML = transactions.map(t => `
        <div class="pending-transaction-card">
            <div class="transaction-header">
                <strong>كود العملية:</strong> ${t.transaction_code}
            </div>
            <div class="transaction-details">
                <p><strong>العضو:</strong> ${t.members?.full_name || '-'} (${t.members?.member_code})</p>
                <p><strong>المبلغ:</strong> ${parseFloat(t.total_amount).toFixed(2)} ج.م</p>
                <p><strong>نسبة العمولة:</strong> ${t.commission_percentage}%</p>
                <p><strong>مبلغ العمولة:</strong> ${parseFloat(t.commission_amount).toFixed(2)} ج.م</p>
                <p><strong>طريقة الدفع:</strong> ${getPaymentLabel(t)}</p>
                <p><strong>التوقيت:</strong> ${new Date(t.created_at).toLocaleString('ar-EG')}</p>
                ${t.notes ? `<p><strong>ملاحظات:</strong> ${t.notes}</p>` : ''}
                ${t.invoice_image_url ? `<p><a href="${t.invoice_image_url}" target="_blank">📄 عرض الفاتورة</a></p>` : ''}
            </div>
            <div class="pending-actions">
                <button class="btn btn-approve" onclick="approveTransaction('${t.id}')">✅ موافقة</button>
                <button class="btn btn-reject" onclick="rejectTransaction('${t.id}')">❌ رفض</button>
            </div>
        </div>
    `).join('');
    } catch (error) {
        console.error('Error loading pending transactions:', error);
        document.getElementById('pendingList').innerHTML = `<p class="empty-state">خطأ: ${error.message}</p>`;
    }
}
async function approveTransaction(transactionId) {
    if (!confirm('هل تريد الموافقة على هذه العملية؟')) return;

    try {
        // تحديث حالة العملية
        const { data: transaction, error } = await window.SAWYAN.supabase
            .from('transactions')
            .update({
                status: 'completed'
            })
            .eq('id', transactionId)
            .select(`*, members(id, full_name)`)
            .single();

        if (error) throw error;

        // 🌳 توزيع العمولة على البول + الأبلاينز (النظام الجديد)
        let distributionResult = null;
        try {
            distributionResult = await window.SAWYAN_TREE.distributeTransactionCommission(transactionId);
            console.log('🌳 Distribution result:', distributionResult);

            // أضف العمولات لمحافظ المستفيدين
            await creditBeneficiariesWallets(distributionResult.pool_transaction_id, merchantData.business_name);
        } catch (distErr) {
            console.error('Distribution failed (continuing):', distErr);
        }

        // إرسال إشعار للعضو
        try {
            const sharePerMember = distributionResult ? (distributionResult.member_share || 0) : 0;
            const beneficiaries = distributionResult ? (distributionResult.upline_count + 1) : 0;
            await window.SAWYAN.supabase
                .from('notifications')
                .insert([{
                    user_type: 'member',
                    user_id: transaction.member_id,
                    title: 'تم توثيق عمليتك ✅',
                    message: 'تمت الموافقة على عمليتك مع ' + merchantData.business_name + ' بقيمة ' + parseFloat(transaction.total_amount).toFixed(2) + ' ج.م. حصتك من البول: ' + sharePerMember.toFixed(2) + ' ج.م (' + beneficiaries + ' مستفيد).',
                    notification_type: 'transaction_approved'
                }]);
            console.log('Notification sent to member');
        } catch (notifError) {
            console.log('Notifications table may not exist:', notifError);
        }

        alert('✅ تمت الموافقة على العملية بنجاح!');
        loadPendingTransactions();

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

async function rejectTransaction(transactionId) {
    const reason = prompt('سبب الرفض (اختياري):');

    try {
        // جلب بيانات العملية أولاً
        const { data: transaction } = await window.SAWYAN.supabase
            .from('transactions')
            .select('member_id, total_amount')
            .eq('id', transactionId)
            .single();

        const { error } = await window.SAWYAN.supabase
            .from('transactions')
            .update({
                status: 'rejected'
            })
            .eq('id', transactionId);

        if (error) throw error;

        // إرسال إشعار للعضو
        if (transaction) {
            try {
                var rejectMessage = 'تم رفض عمليتك مع ' + merchantData.business_name + ' بقيمة ' + parseFloat(transaction.total_amount).toFixed(2) + ' ج.م';
                if (reason) {
                    rejectMessage += '. السبب: ' + reason;
                }

                await window.SAWYAN.supabase
                    .from('notifications')
                    .insert([{
                        user_type: 'member',
                        user_id: transaction.member_id,
                        title: 'تم رفض عمليتك ❌',
                        message: rejectMessage,
                        notification_type: 'transaction_rejected'
                    }]);
                console.log('Rejection notification sent to member');
            } catch (notifError) {
                console.log('Notifications table may not exist:', notifError);
            }
        }

        alert('تم رفض العملية');
        loadPendingTransactions();

    } catch (error) {
        console.error('Error:', error);
        alert('حدث خطأ: ' + error.message);
    }
}

async function loadAllTransactions() {
    const page = document.getElementById('transactionsPage');
    page.innerHTML = '<h2>العمليات المكتملة</h2><p class="page-description">العمليات التي تمت الموافقة عليها</p><div id="allTransactionsList"></div>';

    const { data: transactions } = await window.SAWYAN.supabase
        .from('transactions')
        .select('*, members(member_code, full_name)')
        .eq('merchant_id', currentMerchant.id)
        .eq('status', 'completed')
        .order('transaction_date', { ascending: false });

    const list = document.getElementById('allTransactionsList');
    if (!transactions || transactions.length === 0) {
        list.innerHTML = '<p class="empty-state">لا توجد عمليات مكتملة بعد</p>';
        return;
    }

    var html = '';
    for (var i = 0; i < transactions.length; i++) {
        var t = transactions[i];
        html += '<div class="transaction-card completed">';
        html += '<div class="transaction-status">✅ مكتملة</div>';
        html += '<div><strong>العضو:</strong> ' + (t.members ? t.members.full_name : '-') + ' (' + (t.members ? t.members.member_code : '-') + ')</div>';
        html += '<div><strong>المبلغ:</strong> ' + parseFloat(t.total_amount).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>العمولة:</strong> ' + parseFloat(t.commission_amount).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>طريقة الدفع:</strong> ' + getPaymentLabel(t) + '</div>';
        html += '<div><strong>حصة الشركة:</strong> ' + parseFloat(t.company_share).toFixed(2) + ' ج.م</div>';
        html += '<div><strong>التاريخ:</strong> ' + new Date(t.transaction_date).toLocaleDateString('ar-EG') + '</div>';
        html += '</div>';
    }
    list.innerHTML = html;
}

async function loadFinancialReport() {
    const page = document.getElementById('financialPage');
    page.innerHTML = '<h2>الموقف المالي</h2><div id="financialReport"></div>';

    const { data: transactions } = await window.SAWYAN.supabase
        .from('transactions')
        .select('total_amount, commission_amount, company_share')
        .eq('merchant_id', currentMerchant.id);

    const totalSales = transactions?.reduce((sum, t) => sum + parseFloat(t.total_amount), 0) || 0;
    const totalCommissions = transactions?.reduce((sum, t) => sum + parseFloat(t.commission_amount), 0) || 0;
    const totalDue = transactions?.reduce((sum, t) => sum + parseFloat(t.company_share), 0) || 0;

    document.getElementById('financialReport').innerHTML = `
        <div class="financial-stats">
            <div class="stat-box">
                <h3>إجمالي المبيعات</h3>
                <p class="stat-value">${totalSales.toFixed(2)} ج.م</p>
            </div>
            <div class="stat-box">
                <h3>إجمالي العمولات</h3>
                <p class="stat-value">${totalCommissions.toFixed(2)} ج.م</p>
            </div>
            <div class="stat-box">
                <h3>المستحق للشركة</h3>
                <p class="stat-value">${totalDue.toFixed(2)} ج.م</p>
            </div>
        </div>
    `;
}

async function loadProducts() {
    const page = document.getElementById('productsPage');
    page.innerHTML = `
        <h2>المنتجات</h2>
        <p class="empty-state">إدارة المنتجات قريباً...</p>
    `;
}

async function loadReviews() {
    const page = document.getElementById('reviewsPage');
    page.innerHTML = `
        <h2>التقييمات</h2>
        <p class="empty-state">التقييمات قريباً...</p>
    `;
}

async function loadSettings() {
    const page = document.getElementById('settingsPage');

    // تحميل أحدث بيانات التاجر
    try {
        const { data: freshData } = await window.SAWYAN.supabase
            .from('merchants')
            .select('*')
            .eq('id', currentMerchant.id)
            .single();

        if (freshData) merchantData = freshData;
    } catch (e) {
        console.log('Using cached data');
    }

    const m = merchantData || {};

    page.innerHTML = `
        <div class="profile-page">
            <h2 class="page-title-mobile">الملف الشخصي</h2>
            
            <!-- البروفايل الحالي -->
            <div class="profile-header-card">
                <div class="profile-avatar-container">
                    <div class="profile-avatar" id="profileAvatarPreview">
                        ${m.logo_url ? `<img src="${m.logo_url}" alt="Logo">` : `<span class="avatar-placeholder">🏪</span>`}
                    </div>
                    <button class="btn-change-avatar" onclick="document.getElementById('logoInput').click()">
                        📷 تغيير الصورة
                    </button>
                    <input type="file" id="logoInput" accept="image/*" style="display:none" onchange="previewLogo(this)">
                </div>
                <div class="profile-info-brief">
                    <h3>${m.business_name || 'اسم النشاط'}</h3>
                    <p class="member-code-badge">كود التاجر: ${m.merchant_code || '-'}</p>
                </div>
            </div>

            <!-- أقسام الإعدادات -->
            <div class="settings-sections">
                
                <!-- المعلومات الأساسية -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('basicInfo')">
                        <span>📋 المعلومات الأساسية</span>
                        <span class="toggle-icon" id="basicInfoIcon">▼</span>
                    </div>
                    <div class="section-content" id="basicInfo">
                        <div class="form-group">
                            <label>اسم النشاط التجاري</label>
                            <input type="text" id="settingsBusinessName" class="form-control" value="${m.business_name || ''}" placeholder="مثال: سوبر ماركت الأمل">
                        </div>
                        <div class="form-group">
                            <label>اسم المالك</label>
                            <input type="text" id="settingsOwnerName" class="form-control" value="${m.owner_name || ''}" placeholder="الاسم الكامل">
                        </div>
                        <div class="form-group">
                            <label>وصف النشاط</label>
                            <textarea id="settingsDescription" class="form-control" rows="3" placeholder="وصف مختصر عن نشاطك...">${m.business_description || ''}</textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>نوع التاجر</label>
                                <select id="settingsMerchantType" class="form-control">
                                    <option value="physical" ${m.merchant_type === 'physical' ? 'selected' : ''}>محل فيزيائي</option>
                                    <option value="online" ${m.merchant_type === 'online' ? 'selected' : ''}>متجر إلكتروني</option>
                                    <option value="both" ${m.merchant_type === 'both' ? 'selected' : ''}>كلاهما</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>فئة النشاط</label>
                                <select id="settingsCategory" class="form-control">
                                    <option value="أخرى" ${m.business_category === 'أخرى' ? 'selected' : ''}>📦 أخرى</option>
                                    <option value="سوبر ماركت" ${m.business_category === 'سوبر ماركت' ? 'selected' : ''}>🛒 سوبر ماركت</option>
                                    <option value="ملابس" ${m.business_category === 'ملابس' ? 'selected' : ''}>👕 ملابس</option>
                                    <option value="صيدلية" ${m.business_category === 'صيدلية' ? 'selected' : ''}>💊 صيدلية</option>
                                    <option value="مطعم" ${m.business_category === 'مطعم' ? 'selected' : ''}>🍽️ مطعم</option>
                                    <option value="كافيه" ${m.business_category === 'كافيه' ? 'selected' : ''}>☕ كافيه</option>
                                    <option value="كهربائيات" ${m.business_category === 'كهربائيات' ? 'selected' : ''}>📱 كهربائيات</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>نسبة العمولة (%)</label>
                            <input type="number" id="settingsCommission" class="form-control" step="0.01" min="0" max="100" value="${m.commission_percentage || 10}">
                            <small class="form-text">النسبة التي تمنحها للأعضاء من كل عملية</small>
                        </div>
                    </div>
                </div>

                <!-- معلومات التواصل -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('contactInfo')">
                        <span>📞 معلومات التواصل</span>
                        <span class="toggle-icon" id="contactInfoIcon">▼</span>
                    </div>
                    <div class="section-content" id="contactInfo">
                        <div class="form-group">
                            <label>📧 البريد الإلكتروني</label>
                            <input type="email" id="settingsEmail" class="form-control" value="${m.email || ''}" placeholder="merchant@example.com">
                        </div>
                        <div class="form-group">
                            <label>📱 رقم الهاتف</label>
                            <input type="tel" id="settingsPhone" class="form-control" value="${m.phone || ''}" placeholder="+20 123 456 7890">
                        </div>
                        <div class="form-group">
                            <label>💬 واتساب</label>
                            <input type="tel" id="settingsWhatsapp" class="form-control" value="${m.whatsapp || m.phone || ''}" placeholder="+20 123 456 7890">
                        </div>
                        <div class="form-group">
                            <label>🌐 الموقع الإلكتروني</label>
                            <input type="url" id="settingsWebsite" class="form-control" value="${m.website_url || ''}" placeholder="https://example.com">
                        </div>
                    </div>
                </div>

                <!-- روابط التواصل الاجتماعي -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('socialMedia')">
                        <span>🔗 روابط التواصل الاجتماعي</span>
                        <span class="toggle-icon" id="socialMediaIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="socialMedia">
                        <div class="form-group">
                            <label>📘 فيسبوك</label>
                            <input type="url" id="settingsFacebook" class="form-control" value="${m.facebook_url || ''}" placeholder="https://facebook.com/page">
                        </div>
                        <div class="form-group">
                            <label>📸 انستغرام</label>
                            <input type="url" id="settingsInstagram" class="form-control" value="${m.instagram_url || ''}" placeholder="https://instagram.com/profile">
                        </div>
                        <div class="form-group">
                            <label>🐦 تويتر / X</label>
                            <input type="url" id="settingsTwitter" class="form-control" value="${m.twitter_url || ''}" placeholder="https://x.com/profile">
                        </div>
                        <div class="form-group">
                            <label>🎥 تيك توك</label>
                            <input type="url" id="settingsTiktok" class="form-control" value="${m.tiktok_url || ''}" placeholder="https://tiktok.com/@profile">
                        </div>
                    </div>
                </div>

                <!-- الموقع الجغرافي -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('locationInfo')">
                        <span>📍 الموقع والعنوان</span>
                        <span class="toggle-icon" id="locationInfoIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="locationInfo">
                        <div class="form-row">
                            <div class="form-group">
                                <label>الدولة</label>
                                <input type="text" id="settingsCountry" class="form-control" value="${m.country || ''}" placeholder="مثال: مصر">
                            </div>
                            <div class="form-group">
                                <label>المدينة</label>
                                <input type="text" id="settingsCity" class="form-control" value="${m.city || ''}" placeholder="مثال: القاهرة">
                            </div>
                        </div>
                        <div class="form-group">
                            <label>العنوان التفصيلي</label>
                            <textarea id="settingsAddress" class="form-control" rows="2" placeholder="الشارع، الحي، المنطقة...">${m.address || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label>🗺️ رابط خرائط جوجل</label>
                            <input type="url" id="settingsGoogleMaps" class="form-control" value="${m.google_maps_url || ''}" placeholder="https://maps.google.com/...">
                        </div>
                    </div>
                </div>

                <!-- مشاركة الواي فاي -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('wifiSection')">
                        <span>📶 مشاركة الـ Wi-Fi للعملاء</span>
                        <span class="toggle-icon" id="wifiSectionIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="wifiSection">
                        <p style="color: var(--text-secondary, #666); margin-bottom: 15px; font-size: 0.9rem;">
                            ساعد عملائك على الاتصال بالإنترنت لإتمام عملياتهم عبر التطبيق
                        </p>
                        <div class="form-group">
                            <label>اسم الشبكة (SSID)</label>
                            <input type="text" id="settingsWifiSSID" class="form-control" value="${m.wifi_ssid || ''}" placeholder="اسم شبكة الواي فاي">
                        </div>
                        <div class="form-group">
                            <label>كلمة مرور الواي فاي</label>
                            <input type="text" id="settingsWifiPassword" class="form-control" value="${m.wifi_password || ''}" placeholder="كلمة مرور الواي فاي">
                        </div>
                        <button type="button" onclick="generateMerchantWifiQR()" class="btn btn-secondary btn-block" style="margin-top: 10px;">
                            📱 إنشاء QR للواي فاي
                        </button>
                        <div id="wifiQRContainer" style="margin-top: 15px; text-align: center; display: none;">
                            <p style="font-weight: 600; margin-bottom: 10px;">امسح الكود لتوصيل العميل:</p>
                            <div id="wifiQRCode" style="background: white; padding: 15px; border-radius: 12px; display: inline-block;"></div>
                            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 10px;">يمكن للعميل مسح هذا الكود بكاميرا الهاتف</p>
                        </div>
                    </div>
                </div>

                <!-- تغيير كلمة المرور -->
                <div class="settings-section-card">
                    <div class="section-header" onclick="toggleSection('passwordSection')">
                        <span>🔐 تغيير كلمة المرور</span>
                        <span class="toggle-icon" id="passwordSectionIcon">▼</span>
                    </div>
                    <div class="section-content collapsed" id="passwordSection">
                        <div class="form-group">
                            <label>كلمة المرور الحالية</label>
                            <input type="password" id="settingsCurrentPassword" class="form-control" placeholder="أدخل كلمة المرور الحالية">
                        </div>
                        <div class="form-group">
                            <label>كلمة المرور الجديدة</label>
                            <input type="password" id="settingsNewPassword" class="form-control" placeholder="أدخل كلمة المرور الجديدة">
                        </div>
                        <div class="form-group">
                            <label>تأكيد كلمة المرور</label>
                            <input type="password" id="settingsConfirmPassword" class="form-control" placeholder="أعد إدخال كلمة المرور الجديدة">
                        </div>
                    </div>
                </div>

            </div>

            <!-- أزرار الحفظ -->
            <div class="settings-actions-fixed">
                <button onclick="saveSettings()" class="btn btn-primary btn-block btn-save-profile">
                    💾 حفظ جميع التغييرات
                </button>
            </div>
        </div>
    `;
}

// تبديل إظهار/إخفاء قسم
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    const icon = document.getElementById(sectionId + 'Icon');

    if (section.classList.contains('collapsed')) {
        section.classList.remove('collapsed');
        if (icon) icon.textContent = '▼';
    } else {
        section.classList.add('collapsed');
        if (icon) icon.textContent = '▶';
    }
}

// معاينة اللوجو
let pendingLogoFile = null;

async function previewLogo(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // التحقق من حجم الملف (5 ميجابايت كحد أقصى)
        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة يتجاوز 5 ميجابايت');
            input.value = '';
            return;
        }

        // التحقق من نوع الملف
        if (!file.type.startsWith('image/')) {
            alert('الرجاء اختيار ملف صورة');
            input.value = '';
            return;
        }

        // حفظ الملف للرفع لاحقاً
        pendingLogoFile = file;

        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('profileAvatarPreview').innerHTML =
                `<img src="${e.target.result}" alt="Logo Preview">`;
        };
        reader.readAsDataURL(file);
    }
}

// رفع لوجو التاجر إلى Supabase Storage
async function uploadLogo() {
    if (!pendingLogoFile) return null;

    try {
        // استخدام مكون رفع الصور إذا كان متاحاً
        if (window.SAWYAN && window.SAWYAN.ImageUpload) {
            const result = await window.SAWYAN.ImageUpload.uploadImage(
                pendingLogoFile,
                'logos',
                `merchants/${currentMerchant.id}`
            );

            if (result.success) {
                pendingLogoFile = null;
                return result.url;
            } else {
                console.error('Upload error:', result.error);
                return null;
            }
        }
        return null;
    } catch (err) {
        console.error('Logo upload error:', err);
        return null;
    }
}

async function saveSettings() {
    // جمع البيانات
    const businessName = document.getElementById('settingsBusinessName')?.value;
    const ownerName = document.getElementById('settingsOwnerName')?.value;
    const description = document.getElementById('settingsDescription')?.value;
    const merchantType = document.getElementById('settingsMerchantType')?.value;
    const category = document.getElementById('settingsCategory')?.value;
    const commission = parseFloat(document.getElementById('settingsCommission')?.value) || 10;

    const email = document.getElementById('settingsEmail')?.value;
    const phone = document.getElementById('settingsPhone')?.value;
    const whatsapp = document.getElementById('settingsWhatsapp')?.value;
    const website = document.getElementById('settingsWebsite')?.value;

    const facebook = document.getElementById('settingsFacebook')?.value;
    const instagram = document.getElementById('settingsInstagram')?.value;
    const twitter = document.getElementById('settingsTwitter')?.value;
    const tiktok = document.getElementById('settingsTiktok')?.value;

    const country = document.getElementById('settingsCountry')?.value;
    const city = document.getElementById('settingsCity')?.value;
    const address = document.getElementById('settingsAddress')?.value;
    const googleMaps = document.getElementById('settingsGoogleMaps')?.value;

    const currentPassword = document.getElementById('settingsCurrentPassword')?.value;
    const newPassword = document.getElementById('settingsNewPassword')?.value;
    const confirmPassword = document.getElementById('settingsConfirmPassword')?.value;

    // التحقق من كلمة المرور
    if (newPassword) {
        if (newPassword !== confirmPassword) {
            alert('كلمة المرور الجديدة غير متطابقة!');
            return;
        }
        if (newPassword.length < 6) {
            alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            return;
        }
    }

    // إظهار رسالة تحميل
    const saveBtn = document.querySelector('.btn-save-profile');
    const originalText = saveBtn.innerHTML;
    saveBtn.innerHTML = '⏳ جاري الحفظ...';
    saveBtn.disabled = true;

    try {
        // رفع اللوجو إذا تم اختيار صورة جديدة
        let logoUrl = merchantData.logo_url;
        if (pendingLogoFile) {
            saveBtn.innerHTML = '⏳ جاري رفع اللوجو...';
            const uploadedUrl = await uploadLogo();
            if (uploadedUrl) {
                logoUrl = uploadedUrl;
            }
        }

        // تحديث البيانات
        const updateData = {
            business_name: businessName,
            owner_name: ownerName,
            business_description: description,
            merchant_type: merchantType,
            business_category: category,
            commission_percentage: commission,
            email: email,
            phone: phone,
            whatsapp: whatsapp,
            website_url: website,
            facebook_url: facebook,
            instagram_url: instagram,
            twitter_url: twitter,
            tiktok_url: tiktok,
            country: country,
            city: city,
            address: address,
            google_maps_url: googleMaps,
            logo_url: logoUrl,
            updated_at: new Date().toISOString()
        };

        saveBtn.innerHTML = '⏳ جاري الحفظ...';

        const { error } = await window.SAWYAN.supabase
            .from('merchants')
            .update(updateData)
            .eq('id', currentMerchant.id);

        if (error) throw error;

        // تحديث كلمة المرور إذا تم إدخالها
        if (newPassword && currentPassword) {
            // التحقق من كلمة المرور الحالية
            if (merchantData.password_hash !== currentPassword) {
                throw new Error('كلمة المرور الحالية غير صحيحة');
            }

            await window.SAWYAN.supabase
                .from('merchants')
                .update({ password_hash: newPassword })
                .eq('id', currentMerchant.id);
        }

        // تحديث البيانات المحلية
        merchantData = { ...merchantData, ...updateData };
        localStorage.setItem('sawyan_merchant', JSON.stringify(merchantData));

        // تحديث الواجهة
        const businessNameEl = document.getElementById('businessName');
        if (businessNameEl) businessNameEl.textContent = businessName || 'تاجر';

        alert('✅ تم حفظ التغييرات بنجاح!');

    } catch (error) {
        console.error('Error saving settings:', error);
        alert('❌ حدث خطأ: ' + error.message);
    } finally {
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;
    }
}

function openScanner() {
    // للتوافق مع القديم — نوجّه المستخدم للـ Tab الخاص بالـ QR
    switchScanMethod('qr');
    startQRScanner();
}

async function logout() {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;
    localStorage.removeItem('sawyan_merchant');
    localStorage.removeItem('sawyan_merchant_id');
    localStorage.removeItem('sawyan_user_type');
    localStorage.removeItem('sawyan_login_at');
    window.location.href = '../index.html';
}

// ===== قائمة المزيد (More Menu) =====
function toggleMoreMenu(e) {
    e.preventDefault();
    const menu = document.getElementById('moreMenu');
    menu.classList.toggle('open');

    // إظهار/إخفاء التراكب
    let overlay = document.querySelector('.more-menu-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'more-menu-overlay';
        overlay.onclick = closeMoreMenu;
        document.body.appendChild(overlay);
    }
    overlay.classList.toggle('open');
}

function closeMoreMenu() {
    document.getElementById('moreMenu').classList.remove('open');
    const overlay = document.querySelector('.more-menu-overlay');
    if (overlay) overlay.classList.remove('open');
}

function goToPage(pageName) {
    closeMoreMenu();

    // تحديث الصفحة
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageElement = document.getElementById(pageName + 'Page');
    if (pageElement) pageElement.classList.add('active');

    // تحديث الأيقونات
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageName) item.classList.add('active');
    });
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // تحديث العنوان
    const titles = {
        'transactions': 'العمليات المكتملة',
        'financial': 'الموقف المالي',
        'settings': 'الإعدادات'
    };
    document.getElementById('pageTitle').textContent = titles[pageName] || 'لوحة التحكم';

    // تحميل المحتوى
    if (pageName === 'transactions') loadAllTransactions();
    if (pageName === 'financial') loadFinancialReport();
    if (pageName === 'settings') loadSettings();
}

// ===== توليد QR للواي فاي =====
function generateMerchantWifiQR() {
    const ssid = document.getElementById('settingsWifiSSID')?.value;
    const password = document.getElementById('settingsWifiPassword')?.value;

    if (!ssid) {
        alert('الرجاء إدخال اسم الشبكة (SSID)');
        return;
    }

    // تهرب الأحرف الخاصة للصيغة القياسية
    const escape = (str) => str.replace(/[\\;,:\"]/g, '\\$&');

    // صيغة QR للواي فاي القياسية
    const wifiString = `WIFI:T:WPA;S:${escape(ssid)};P:${escape(password || '')};;`;

    // عرض الحاوية
    const container = document.getElementById('wifiQRContainer');
    const qrCodeDiv = document.getElementById('wifiQRCode');

    container.style.display = 'block';

    // استخدام مكتبة qrcode.js إذا كانت متاحة
    if (typeof QRCode !== 'undefined') {
        qrCodeDiv.innerHTML = '';
        new QRCode(qrCodeDiv, {
            text: wifiString,
            width: 180,
            height: 180,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        // Fallback: عرض النص فقط
        qrCodeDiv.innerHTML = `
            <div style="padding: 20px; background: #f5f5f5; border-radius: 8px;">
                <p style="font-size: 0.85rem; margin-bottom: 10px;">نص QR للواي فاي:</p>
                <code style="word-break: break-all; font-size: 0.75rem;">${wifiString}</code>
                <p style="font-size: 0.8rem; margin-top: 10px; color: #666;">
                    💡 لإنشاء QR مرئي، أضف مكتبة qrcode.js للمشروع
                </p>
            </div>
        `;
    }

    // حفظ البيانات في قاعدة البيانات
    saveWifiSettings(ssid, password);
}

// حفظ إعدادات الواي فاي
async function saveWifiSettings(ssid, password) {
    try {
        await window.SAWYAN.supabase
            .from('merchants')
            .update({
                wifi_ssid: ssid,
                wifi_password: password
            })
            .eq('id', currentMerchant.id);

        // تحديث البيانات المحلية
        merchantData.wifi_ssid = ssid;
        merchantData.wifi_password = password;
        localStorage.setItem('sawyan_merchant', JSON.stringify(merchantData));

        console.log('✅ تم حفظ إعدادات الواي فاي');
    } catch (error) {
        console.error('خطأ في حفظ إعدادات الواي فاي:', error);
    }
}

// ============================================
// نظام مسح QR ودفع العميل غير المتصل (Scenario D)
// ============================================

let html5QRScanner = null;
let scannedMemberData = null;

/**
 * تحميل صفحة ماسح QR
 */
function loadQRScannerPage() {
    const page = document.getElementById('qrScannerPage');
    if (!page) {
        console.error('QR Scanner page element not found');
        return;
    }

    page.innerHTML = `
        <div class="qr-scanner-page">
            <h2>📱 مسح QR للدفع</h2>
            <p class="page-description">امسح QR كود العميل لخصم المبلغ من بطاقته المحفوظة</p>
            
            <!-- قسم مشاركة الواي فاي -->
            <div class="wifi-share-banner" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 2rem;">📶</span>
                    <div style="flex: 1;">
                        <p style="font-weight: 600; margin: 0;">العميل ليس لديه إنترنت؟</p>
                        <small>شارك الواي فاي الخاص بمتجرك ليتمكن من الدفع</small>
                    </div>
                    <button onclick="showWifiSharingModal()" class="btn" style="background: rgba(255,255,255,0.2); color: white; border: 2px solid white; padding: 8px 16px;">
                        📱 شارك الواي فاي
                    </button>
                </div>
            </div>
            
            <!-- منطقة المسح -->
            <div class="scanner-container" style="background: var(--bg-card, #fff); border-radius: 16px; padding: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                <div id="qr-reader" style="width: 100%; max-width: 350px; margin: 0 auto;"></div>
                
                <div id="scannerStatus" style="text-align: center; margin-top: 15px;">
                    <p style="color: var(--text-secondary, #666);">📷 اضغط لبدء المسح</p>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 15px;">
                    <button onclick="startQRScanner()" class="btn btn-primary" id="startScanBtn">
                        📷 بدء المسح
                    </button>
                    <button onclick="stopQRScanner()" class="btn btn-secondary" id="stopScanBtn" style="display: none;">
                        ⏹️ إيقاف
                    </button>
                </div>
                
                <!-- إدخال يدوي كبديل -->
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border-color, #eee);">
                    <p style="font-size: 0.9rem; color: var(--text-secondary, #666); margin-bottom: 10px;">أو أدخل كود العميل يدوياً:</p>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="manualQRInput" class="form-control" placeholder="الصق نص QR هنا أو أدخل كود العضو">
                        <button onclick="processManualQRInput()" class="btn btn-primary">✓</button>
                    </div>
                </div>
            </div>
            
            <!-- نتيجة المسح -->
            <div id="scanResult" style="display: none; margin-top: 20px;">
                <div class="scanned-member-card" style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); color: white; border-radius: 16px; padding: 20px;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                        <span style="font-size: 3rem;">👤</span>
                        <div>
                            <h3 id="scannedMemberName" style="margin: 0;">-</h3>
                            <p id="scannedMemberCode" style="margin: 5px 0 0 0; opacity: 0.9;">-</p>
                        </div>
                    </div>
                    
                    <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 15px;">
                        <div class="form-group" style="margin-bottom: 12px;">
                            <label style="display: block; margin-bottom: 5px; font-size: 0.9rem;">💰 المبلغ</label>
                            <input type="number" id="offlinePaymentAmount" class="form-control" step="0.01" min="1" placeholder="أدخل المبلغ" 
                                style="background: white; color: #333; font-size: 1.2rem; font-weight: 600; text-align: center;">
                        </div>
                        
                        <div id="offlineCommissionPreview" style="display: none; background: rgba(0,0,0,0.1); border-radius: 8px; padding: 10px; margin-bottom: 12px;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                                <span>نسبة العمولة:</span>
                                <span id="offlineCommissionRate">0%</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-weight: 600;">
                                <span>مبلغ العمولة:</span>
                                <span id="offlineCommissionAmount">0 ج.م</span>
                            </div>
                        </div>
                        
                        <button onclick="processOfflineCustomerPayment()" class="btn btn-block" 
                            style="background: white; color: #059669; font-weight: 600; padding: 12px;">
                            💳 خصم من بطاقة العميل
                        </button>
                    </div>
                </div>
                
                <button onclick="resetScanner()" class="btn btn-secondary btn-block" style="margin-top: 10px;">
                    🔄 مسح عميل آخر
                </button>
            </div>
        </div>
        
        <!-- Modal مشاركة الواي فاي -->
        <div id="wifiSharingModal" class="modal" style="display: none;">
            <div class="modal-content" style="max-width: 400px;">
                <button onclick="closeWifiSharingModal()" class="close-btn">&times;</button>
                <h3 style="text-align: center;">📶 شارك الواي فاي</h3>
                
                <div id="wifiQRDisplay" style="text-align: center; margin: 20px 0;">
                    <!-- سيتم إنشاء QR هنا -->
                </div>
                
                <p style="text-align: center; color: var(--text-secondary); font-size: 0.9rem;">
                    اجعل العميل يمسح هذا الكود بكاميرا هاتفه للاتصال بالواي فاي
                </p>
                
                <div style="background: var(--bg-secondary, #f5f5f5); border-radius: 8px; padding: 12px; margin-top: 15px;">
                    <p style="margin: 0; font-size: 0.85rem;"><strong>اسم الشبكة:</strong> <span id="displayWifiSSID">-</span></p>
                    <p style="margin: 5px 0 0 0; font-size: 0.85rem;"><strong>كلمة المرور:</strong> <span id="displayWifiPassword">-</span></p>
                </div>
            </div>
        </div>
    `;

    // إضافة listener لحساب العمولة
    setTimeout(() => {
        const amountInput = document.getElementById('offlinePaymentAmount');
        if (amountInput) {
            amountInput.addEventListener('input', calculateOfflineCommission);
        }
    }, 100);
}

/**
 * بدء ماسح QR بالكاميرا
 */
async function startQRScanner() {
    const scannerDiv = document.getElementById('qr-reader');
    const statusDiv = document.getElementById('scannerStatus');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');

    // التحقق من وجود مكتبة html5-qrcode
    if (typeof Html5Qrcode === 'undefined') {
        // تحميل المكتبة ديناميكياً
        statusDiv.innerHTML = '<p style="color: #f59e0b;">⏳ جاري تحميل ماسح QR...</p>';

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
        script.onload = () => {
            console.log('✅ html5-qrcode loaded');
            initializeScanner();
        };
        script.onerror = () => {
            statusDiv.innerHTML = '<p style="color: #ef4444;">❌ فشل تحميل ماسح QR. استخدم الإدخال اليدوي.</p>';
        };
        document.head.appendChild(script);
        return;
    }

    initializeScanner();

    function initializeScanner() {
        html5QRScanner = new Html5Qrcode("qr-reader");

        html5QRScanner.start(
            { facingMode: "environment" }, // الكاميرا الخلفية
            { fps: 10, qrbox: { width: 250, height: 250 } },
            onScanSuccess,
            onScanError
        ).then(() => {
            statusDiv.innerHTML = '<p style="color: #10B981;">📷 جاري المسح... وجّه الكاميرا نحو QR</p>';
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-block';
        }).catch(err => {
            console.error('Camera error:', err);
            statusDiv.innerHTML = '<p style="color: #ef4444;">❌ تعذر الوصول للكاميرا. استخدم الإدخال اليدوي.</p>';
        });
    }
}

/**
 * إيقاف ماسح QR
 */
function stopQRScanner() {
    if (html5QRScanner) {
        html5QRScanner.stop().then(() => {
            html5QRScanner.clear();
            html5QRScanner = null;

            document.getElementById('scannerStatus').innerHTML = '<p style="color: var(--text-secondary, #666);">📷 اضغط لبدء المسح</p>';
            document.getElementById('startScanBtn').style.display = 'inline-block';
            document.getElementById('stopScanBtn').style.display = 'none';
        });
    }
}

/**
 * معالجة نجاح المسح
 */
function onScanSuccess(decodedText, decodedResult) {
    console.log('QR Scanned:', decodedText);
    stopQRScanner();
    processQRData(decodedText);
}

/**
 * معالجة خطأ المسح (يُستدعى مع كل frame فاشل)
 */
function onScanError(errorMessage) {
    // لا نعرض شيء - طبيعي أثناء المسح
}

/**
 * معالجة الإدخال اليدوي
 */
function processManualQRInput() {
    const input = document.getElementById('manualQRInput');
    const qrData = input.value.trim();

    if (!qrData) {
        alert('الرجاء إدخال نص QR أو كود العضو');
        return;
    }

    processQRData(qrData);
}

/**
 * معالجة بيانات QR
 */
async function processQRData(qrData) {
    console.log('Processing QR data:', qrData);

    // التحقق من نظام الدفع
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        alert('❌ نظام الدفع غير جاهز، الرجاء تحديث الصفحة');
        return;
    }

    // محاولة فك QR المشفر أولاً
    if (qrData.startsWith('SAWYAN:OFFLINE:')) {
        const decrypted = window.SAWYAN.PaymentService.decryptOfflineQR(qrData);

        if (!decrypted.valid) {
            alert('❌ ' + decrypted.error);
            return;
        }

        // عرض بيانات العضو
        await displayScannedMember(decrypted.memberId, decrypted.memberCode);

    } else {
        // افتراض أنه كود عضو عادي
        await searchAndDisplayMember(qrData);
    }
}

/**
 * البحث عن عضو بالكود
 */
async function searchAndDisplayMember(memberCode) {
    try {
        const { data: member, error } = await window.SAWYAN.supabase
            .from('members')
            .select('id, member_code, full_name')
            .eq('member_code', memberCode)
            .single();

        if (error || !member) {
            alert('❌ لم يتم العثور على عضو بهذا الكود');
            return;
        }

        await displayScannedMember(member.id, member.member_code, member.full_name);

    } catch (error) {
        console.error('Search error:', error);
        alert('❌ حدث خطأ في البحث');
    }
}

/**
 * عرض بيانات العضو الممسوح
 */
async function displayScannedMember(memberId, memberCode, memberName = null) {
    // إذا لم يكن الاسم متوفراً، نجلبه من قاعدة البيانات
    if (!memberName) {
        const { data: member } = await window.SAWYAN.supabase
            .from('members')
            .select('full_name')
            .eq('id', memberId)
            .single();
        memberName = member?.full_name || 'عضو';
    }

    scannedMemberData = {
        id: memberId,
        code: memberCode,
        name: memberName
    };

    document.getElementById('scannedMemberName').textContent = memberName;
    document.getElementById('scannedMemberCode').textContent = 'كود: ' + memberCode;
    document.getElementById('scanResult').style.display = 'block';

    // إخفاء منطقة المسح
    document.querySelector('.scanner-container').style.display = 'none';
}

/**
 * حساب عمولة الدفع بدون اتصال
 */
function calculateOfflineCommission() {
    const amount = parseFloat(document.getElementById('offlinePaymentAmount').value) || 0;
    const preview = document.getElementById('offlineCommissionPreview');

    if (amount > 0) {
        const rate = merchantData.commission_percentage || 10;
        const commission = amount * (rate / 100);

        document.getElementById('offlineCommissionRate').textContent = rate + '%';
        document.getElementById('offlineCommissionAmount').textContent = commission.toFixed(2) + ' ج.م';
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

/**
 * معالجة دفع العميل غير المتصل (Scenario D)
 */
async function processOfflineCustomerPayment() {
    if (!scannedMemberData) {
        alert('❌ لم يتم تحديد عضو');
        return;
    }

    const amount = parseFloat(document.getElementById('offlinePaymentAmount').value);
    if (!amount || amount <= 0) {
        alert('الرجاء إدخال مبلغ صحيح');
        return;
    }

    const btn = document.querySelector('#scanResult button[onclick*="processOfflineCustomerPayment"]');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.innerHTML = '⏳ جاري معالجة الدفع...';
        btn.disabled = true;
    }

    try {
        // التحقق من نظام الدفع
        if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
            throw new Error('نظام الدفع غير جاهز');
        }

        const commissionPercentage = merchantData.commission_percentage || 10;

        // توليد QR للعضو (محاكاة - في الواقع سيكون من QR المسحوب)
        const qrData = window.SAWYAN.PaymentService.generateOfflineQR(
            scannedMemberData.id,
            scannedMemberData.code
        );

        console.log('💳 [Merchant] Processing offline customer payment...');

        // معالجة الدفع
        const paymentResult = await window.SAWYAN.PaymentService.processOfflineCustomerPayment({
            merchantId: currentMerchant.id,
            qrData: qrData,
            amount: amount,
            currency: 'EGP',
            commissionPercentage: commissionPercentage
        });

        if (!paymentResult.success) {
            throw new Error(paymentResult.error || 'فشل في معالجة الدفع');
        }

        console.log('✅ [Merchant] Offline payment successful:', paymentResult);

        // حفظ في قاعدة البيانات
        const transactionCode = 'TMO' + Date.now(); // TMO = Transaction Merchant Offline

        const { data: newTransaction, error } = await window.SAWYAN.supabase
            .from('transactions')
            .insert([{
                transaction_code: transactionCode,
                member_id: scannedMemberData.id,
                merchant_id: currentMerchant.id,
                total_amount: amount,
                commission_percentage: commissionPercentage,
                commission_amount: paymentResult.split.commissionAmount,
                company_share: paymentResult.split.platformShare,
                plan_share: paymentResult.split.memberShare,
                payment_method: 'in_app',
                payment_type: 'online',
                initiator: 'merchant',
                payment_provider: paymentResult.paymentProvider,
                payment_reference: paymentResult.transactionId,
                status: 'completed'
            }])
            .select()
            .single();

        if (error) {
            console.error('DB Error:', error);
        }

        // تحديث محفظة العضو
        try {
            const { data: wallet } = await window.SAWYAN.supabase
                .from('wallets')
                .select('id, balance, total_earned')
                .eq('member_id', scannedMemberData.id)
                .single();

            if (wallet) {
                await window.SAWYAN.supabase
                    .from('wallets')
                    .update({
                        balance: wallet.balance + paymentResult.split.memberShare,
                        total_earned: (wallet.total_earned || 0) + paymentResult.split.memberShare,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', wallet.id);

                await window.SAWYAN.supabase
                    .from('wallet_transactions')
                    .insert([{
                        wallet_id: wallet.id,
                        transaction_type: 'commission',
                        amount: paymentResult.split.memberShare,
                        description: 'عمولة من عملية دفع أوفلاين لدى ' + merchantData.business_name,
                        reference_id: newTransaction?.id,
                        status: 'completed'
                    }]);
            }
        } catch (walletError) {
            console.error('Wallet update error:', walletError);
        }

        alert(`✅ تم الدفع بنجاح!

💳 المبلغ: ${amount.toFixed(2)} ج.م
👤 العميل: ${scannedMemberData.name}
💰 العمولة: ${paymentResult.split.commissionAmount.toFixed(2)} ج.م

كود العملية: ${transactionCode}`);

        // إعادة تعيين
        resetScanner();
        loadStats();

    } catch (error) {
        console.error('❌ Payment error:', error);
        alert('❌ فشل في الدفع: ' + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText || '💳 خصم من بطاقة العميل';
            btn.disabled = false;
        }
    }
}

/**
 * إعادة تعيين الماسح
 */
function resetScanner() {
    scannedMemberData = null;
    document.getElementById('scanResult').style.display = 'none';
    document.getElementById('offlinePaymentAmount').value = '';
    document.getElementById('offlineCommissionPreview').style.display = 'none';
    document.getElementById('manualQRInput').value = '';
    document.querySelector('.scanner-container').style.display = 'block';
}

/**
 * عرض modal مشاركة الواي فاي
 */
function showWifiSharingModal() {
    const ssid = merchantData.wifi_ssid;
    const password = merchantData.wifi_password;

    if (!ssid || !password) {
        alert('⚠️ لم تقم بإعداد الواي فاي بعد.\n\nاذهب إلى الإعدادات > مشاركة الواي فاي لإعداد بيانات الشبكة.');
        return;
    }

    document.getElementById('displayWifiSSID').textContent = ssid;
    document.getElementById('displayWifiPassword').textContent = password;

    // إنشاء QR
    const wifiString = `WIFI:T:WPA;S:${ssid};P:${password};;`;
    const qrDisplay = document.getElementById('wifiQRDisplay');

    if (typeof QRCode !== 'undefined') {
        qrDisplay.innerHTML = '<div id="wifiModalQR"></div>';
        new QRCode(document.getElementById('wifiModalQR'), {
            text: wifiString,
            width: 200,
            height: 200,
            colorDark: '#000000',
            colorLight: '#ffffff'
        });
    } else {
        qrDisplay.innerHTML = `
            <div style="padding: 20px; background: #f5f5f5; border-radius: 8px;">
                <p style="font-size: 0.85rem; margin-bottom: 10px;">اسم الشبكة: <strong>${ssid}</strong></p>
                <p style="font-size: 0.85rem;">كلمة المرور: <strong>${password}</strong></p>
            </div>
        `;
    }

    document.getElementById('wifiSharingModal').style.display = 'flex';
}

/**
 * إغلاق modal مشاركة الواي فاي
 */
function closeWifiSharingModal() {
    document.getElementById('wifiSharingModal').style.display = 'none';
}

// تفعيل عند جاهزية نظام الدفع
window.addEventListener('sawyan:payment:ready', () => {
    console.log('🎉 Payment system ready in merchant dashboard');
});


// ============================================================================
// 🌳 Pool Distribution Helpers (Phase 2.3)
// ============================================================================

/**
 * إضافة العمولات لمحافظ المستفيدين بعد التوزيع
 * @param {number} poolTxId - ID من pool_transactions
 * @param {string} merchantName - اسم التاجر (للوصف)
 */
async function creditBeneficiariesWallets(poolTxId, merchantName) {
    try {
        // جلب كل الـ distributions اللي لسه ما اتضافتش للمحفظة
        const { data: distributions, error } = await window.SAWYAN.supabase
            .from('commission_distributions')
            .select(`
                id, beneficiary_id, amount, level, percentage,
                pool_transaction_id,
                pool_transactions!inner(member_id)
            `)
            .eq('pool_transaction_id', poolTxId)
            .order('level', { ascending: true });

        if (error) throw error;
        if (!distributions || distributions.length === 0) {
            console.log('No distributions to credit');
            return;
        }

        console.log(`💳 Crediting ${distributions.length} beneficiaries...`);

        for (const dist of distributions) {
            try {
                const buyerId = dist.pool_transactions.member_id;
                const isBuyer = dist.beneficiary_id === buyerId;
                const description = isBuyer
                    ? `عمولتك من عملية شرائك لدى ${merchantName}`
                    : `عمولة من ${merchantName} (عضو في فريقك - مستوى ${dist.level})`;

                // محاولة استخدام RPC function الآمنة
                const { data: rpcResult, error: rpcError } = await window.SAWYAN.supabase
                    .rpc('add_wallet_balance', {
                        p_member_id: dist.beneficiary_id,
                        p_amount: dist.amount,
                        p_description: description,
                        p_transaction_type: 'commission',
                        p_reference_id: dist.pool_transaction_id.toString()
                    });

                let walletUpdated = false;

                if (!rpcError && rpcResult && rpcResult.success) {
                    walletUpdated = true;
                    console.log(`✓ Wallet updated via RPC for beneficiary at level ${dist.level}`);
                } else {
                    // Fallback: تحديث مباشر
                    const { data: wallet } = await window.SAWYAN.supabase
                        .from('wallets')
                        .select('id, balance, total_earned')
                        .eq('member_id', dist.beneficiary_id)
                        .single();

                    if (wallet) {
                        await window.SAWYAN.supabase
                            .from('wallets')
                            .update({
                                balance: wallet.balance + dist.amount,
                                total_earned: (wallet.total_earned || 0) + dist.amount,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', wallet.id);

                        await window.SAWYAN.supabase
                            .from('wallet_transactions')
                            .insert([{
                                wallet_id: wallet.id,
                                transaction_type: 'commission',
                                amount: dist.amount,
                                description: description,
                                reference_id: dist.pool_transaction_id.toString(),
                                status: 'completed'
                            }]);

                        walletUpdated = true;
                        console.log(`✓ Wallet updated (fallback) for beneficiary at level ${dist.level}`);
                    }
                }

                // أرسل إشعار لكل مستفيد (ما عدا المشتري — اتبعتله إشعار تاني فوق)
                if (!isBuyer) {
                    try {
                        await window.SAWYAN.supabase
                            .from('notifications')
                            .insert([{
                                user_type: 'member',
                                user_id: dist.beneficiary_id,
                                title: '🌟 وصلتك عمولة من فريقك!',
                                message: `وصلتك عمولة ${dist.amount.toFixed(2)} ج.م من عملية شراء عضو في فريقك لدى ${merchantName}.`,
                                notification_type: 'team_commission'
                            }]);
                    } catch (e) {
                        console.log('Notification failed (non-critical)');
                    }
                }

            } catch (benefErr) {
                console.error(`Failed to credit beneficiary at level ${dist.level}:`, benefErr);
                // نكمّل للباقي حتى لو واحد فشل
            }
        }

        console.log(`✅ Distribution crediting complete for pool_tx #${poolTxId}`);
    } catch (err) {
        console.error('creditBeneficiariesWallets error:', err);
    }
}
