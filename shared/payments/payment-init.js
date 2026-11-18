/**
 * ============================================
 * سويان - تهيئة نظام الدفع العالمي والإقليمي (V3.0)
 * SAWYAN - Payment System Initialization
 * ============================================
 */

(function () {
    'use strict';

    function initPaymentSystem() {
        if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
            setTimeout(initPaymentSystem, 100);
            return;
        }

        const svc = window.SAWYAN.PaymentService;
        const isParallelDemo = Boolean(window.SAWYAN.isParallelDemo);
        const edgeBase = (window.SAWYAN.config && window.SAWYAN.config.url)
            ? `${window.SAWYAN.config.url}/functions/v1`
            : '';

        // تسجيل المحولات الإقليمية والعالمية إن كانت محمّلة
        const providerRegistry = [
            ['stripe', 'StripeProvider', { edgeEndpoint: edgeBase, sandbox: isParallelDemo }],
            ['adyen', 'AdyenProvider', { edgeEndpoint: edgeBase, sandbox: isParallelDemo }],
            ['paypal_wise', 'PayPalWiseProvider', { edgeEndpoint: edgeBase, sandbox: isParallelDemo }],
            ['iyzico', 'IyzicoProvider', { sandbox: isParallelDemo }],
            ['hyperpay', 'HyperPayProvider', { sandbox: isParallelDemo }],
            ['paymob', 'PaymobProvider', { sandbox: isParallelDemo }],
            ['fawry', 'FawryProvider', { sandbox: isParallelDemo }]
        ];

        for (const [key, clsName, cfg] of providerRegistry) {
            if (typeof window.SAWYAN[clsName] === 'function') {
                svc.registerProvider(key, new window.SAWYAN[clsName](cfg));
            }
        }

        // المزود الوهمي يتاح في البيئة الموازية / التجريبية فقط أو كخيار اختبار صريح
        if (typeof window.SAWYAN.MockPaymentProvider === 'function') {
            svc.registerProvider('mock', new window.SAWYAN.MockPaymentProvider({ sandbox: true }));
            if (isParallelDemo || svc.providers.size === 1) {
                svc.setDefaultProvider('mock');
            } else if (svc.providers.has('stripe')) {
                svc.setDefaultProvider('stripe');
            }
        }

        window.dispatchEvent(new CustomEvent('sawyan:payment:ready', {
            detail: {
                environment: isParallelDemo ? 'demo' : 'production',
                providers: svc.getAvailableProviders()
            }
        }));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPaymentSystem);
    } else {
        initPaymentSystem();
    }
})();

async function processInAppPayment(params) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }
    return await window.SAWYAN.PaymentService.processMemberPayment(params);
}

async function processOfflinePayment(params) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }
    return await window.SAWYAN.PaymentService.processOfflineCustomerPayment(params);
}

function generateOfflinePaymentQR(memberId, memberCode) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }
    return window.SAWYAN.PaymentService.generateOfflineQR(memberId, memberCode);
}

function validateOfflinePaymentQR(qrData) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }
    return window.SAWYAN.PaymentService.decryptOfflineQR(qrData);
}

function generateWifiQRCode(ssid, password, encryption = 'WPA') {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }
    return window.SAWYAN.PaymentService.generateWifiQR(ssid, password, encryption);
}

function calculateCommissionSplit(amount, commissionPercentage) {
    if (!window.SAWYAN || !window.SAWYAN.PaymentService) {
        throw new Error('نظام الدفع غير جاهز');
    }
    return window.SAWYAN.PaymentService.calculateSplit(amount, commissionPercentage);
}

if (typeof window !== 'undefined') {
    window.processInAppPayment = processInAppPayment;
    window.processOfflinePayment = processOfflinePayment;
    window.generateOfflinePaymentQR = generateOfflinePaymentQR;
    window.validateOfflinePaymentQR = validateOfflinePaymentQR;
    window.generateWifiQRCode = generateWifiQRCode;
    window.calculateCommissionSplit = calculateCommissionSplit;
}
