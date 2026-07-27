/**
 * ============================================
 * سويان - تهيئة نظام الدفع
 * SAWYAN - Payment System Initialization
 * ============================================
 * 
 * هذا الملف يُحمّل ويُهيئ نظام الدفع بالكامل.
 * يجب تضمينه بعد ملفات المزودين وخدمة الدفع.
 * 
 * ============================================
 */

(function () {
    'use strict';

    // الانتظار حتى يتم تحميل جميع المكونات
    function initPaymentSystem() {
        // التحقق من تحميل المكونات
        if (!window.SAWYAN ||
            !window.SAWYAN.PaymentService ||
            !window.SAWYAN.MockPaymentProvider) {
            console.log('⏳ انتظار تحميل مكونات الدفع...');
            setTimeout(initPaymentSystem, 100);
            return;
        }

        console.log('🚀 تهيئة نظام الدفع...');

        // إنشاء وتسجيل المزود الوهمي
        const mockProvider = new window.SAWYAN.MockPaymentProvider({
            sandbox: true
        });

        window.SAWYAN.PaymentService.registerProvider('mock', mockProvider);
        window.SAWYAN.PaymentService.setDefaultProvider('mock');

        console.log('✅ تم تهيئة نظام الدفع بنجاح');
        console.log('📋 المزودين المتاحين:',
            window.SAWYAN.PaymentService.getAvailableProviders()
        );

        // إطلاق حدث جاهزية النظام
        window.dispatchEvent(new CustomEvent('sawyan:payment:ready', {
            detail: {
                providers: window.SAWYAN.PaymentService.getAvailableProviders()
            }
        }));
    }

    // بدء التهيئة عند تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPaymentSystem);
    } else {
        initPaymentSystem();
    }

})();

/**
 * ============================================
 * دوال مساعدة للاستخدام في الواجهات
 * ============================================
 */

/**
 * معالجة الدفع داخل التطبيق (التدفق 3)
 * @param {Object} params - معاملات الدفع
 */
async function processInAppPayment(params) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }

    return await window.SAWYAN.PaymentService.processMemberPayment(params);
}

/**
 * معالجة دفع العميل غير المتصل (التدفق 4)
 * @param {Object} params - معاملات الدفع
 */
async function processOfflinePayment(params) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }

    return await window.SAWYAN.PaymentService.processOfflineCustomerPayment(params);
}

/**
 * توليد QR للدفع بدون اتصال
 * @param {string} memberId - معرف العضو
 * @param {string} memberCode - كود العضو
 */
function generateOfflinePaymentQR(memberId, memberCode) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }

    return window.SAWYAN.PaymentService.generateOfflineQR(memberId, memberCode);
}

/**
 * التحقق من صحة QR الدفع
 * @param {string} qrData - بيانات QR
 */
function validateOfflinePaymentQR(qrData) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }

    return window.SAWYAN.PaymentService.decryptOfflineQR(qrData);
}

/**
 * توليد QR للواي فاي
 * @param {string} ssid - اسم الشبكة
 * @param {string} password - كلمة المرور
 * @param {string} encryption - نوع التشفير
 */
function generateWifiQRCode(ssid, password, encryption = 'WPA') {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }

    return window.SAWYAN.PaymentService.generateWifiQR(ssid, password, encryption);
}

/**
 * حساب تقسيم العمولة
 * @param {number} amount - المبلغ
 * @param {number} commissionPercentage - نسبة العمولة
 */
function calculateCommissionSplit(amount, commissionPercentage) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }

    return window.SAWYAN.PaymentService.calculateSplit(amount, commissionPercentage);
}

// تصدير الدوال للاستخدام العام
if (typeof window !== 'undefined') {
    window.processInAppPayment = processInAppPayment;
    window.processOfflinePayment = processOfflinePayment;
    window.generateOfflinePaymentQR = generateOfflinePaymentQR;
    window.validateOfflinePaymentQR = validateOfflinePaymentQR;
    window.generateWifiQRCode = generateWifiQRCode;
    window.calculateCommissionSplit = calculateCommissionSplit;
}
