/**
 * ============================================
 * سويان - واجهة مزود الدفع المجردة
 * SAWYAN - Payment Provider Interface
 * ============================================
 * 
 * هذه الواجهة تُعرّف العمليات الأساسية التي يجب على كل مزود دفع تنفيذها.
 * يمكن إضافة أي مزود (Paymob, iyzico, HyperPay, etc.) عن طريق تنفيذ هذه الواجهة.
 * 
 * ============================================
 */

/**
 * الفئة الأساسية لمزودي الدفع
 * كل مزود جديد يجب أن يرث منها وينفذ جميع الدوال
 */
class IPaymentProvider {
    /**
     * @param {Object} config - إعدادات المزود
     * @param {string} config.apiKey - مفتاح API
     * @param {string} config.secretKey - المفتاح السري
     * @param {boolean} config.sandbox - وضع الاختبار
     */
    constructor(config = {}) {
        this.config = config;
        this.providerName = 'abstract';
        this.supportedCurrencies = [];
        this.supportedCountries = [];
        this.supportsSplitPayment = false;
        this.supportsInstallments = false;
    }

    /**
     * تسجيل تاجر جديد في مزود الدفع
     * @param {Object} merchantData - بيانات التاجر
     * @param {string} merchantData.businessName - اسم النشاط التجاري
     * @param {string} merchantData.email - البريد الإلكتروني
     * @param {string} merchantData.countryCode - رمز الدولة
     * @param {Object} merchantData.kycData - بيانات KYC
     * @returns {Promise<Object>} - {success, providerId, error}
     */
    async onboardMerchant(merchantData) {
        throw new Error('يجب تنفيذ onboardMerchant في المزود الفرعي');
    }

    /**
     * تفويض الدفع (حجز المبلغ على البطاقة)
     * @param {number} amount - المبلغ
     * @param {string} currency - العملة
     * @param {string} token - توكن البطاقة أو طريقة الدفع
     * @param {Object} metadata - بيانات إضافية
     * @returns {Promise<Object>} - {success, authorizationId, error}
     */
    async authorizePayment(amount, currency, token, metadata = {}) {
        throw new Error('يجب تنفيذ authorizePayment في المزود الفرعي');
    }

    /**
     * تنفيذ الدفع (سحب المبلغ) مع تقسيم الأرباح
     * @param {string} authorizationId - معرف التفويض
     * @param {Object} splitConfig - تكوين التقسيم
     * @param {number} splitConfig.merchantAmount - حصة التاجر
     * @param {number} splitConfig.platformAmount - حصة المنصة
     * @param {string} splitConfig.merchantProviderId - معرف التاجر لدى المزود
     * @returns {Promise<Object>} - {success, transactionId, error}
     */
    async capturePayment(authorizationId, splitConfig = {}) {
        throw new Error('يجب تنفيذ capturePayment في المزود الفرعي');
    }

    /**
     * الدفع المباشر (تفويض + تنفيذ في خطوة واحدة)
     * @param {number} amount - المبلغ
     * @param {string} currency - العملة
     * @param {string} token - توكن البطاقة
     * @param {Object} splitConfig - تكوين التقسيم
     * @param {Object} metadata - بيانات إضافية
     * @returns {Promise<Object>} - {success, transactionId, error}
     */
    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        throw new Error('يجب تنفيذ directCharge في المزود الفرعي');
    }

    /**
     * شحن طريقة دفع محفوظة (للعميل غير المتصل)
     * @param {string} providerToken - توكن طريقة الدفع المحفوظة
     * @param {number} amount - المبلغ
     * @param {string} currency - العملة
     * @param {Object} splitConfig - تكوين التقسيم
     * @returns {Promise<Object>} - {success, transactionId, error}
     */
    async chargeStoredMethod(providerToken, amount, currency, splitConfig = {}) {
        throw new Error('يجب تنفيذ chargeStoredMethod في المزود الفرعي');
    }

    /**
     * توكين البطاقة لحفظها للاستخدام المستقبلي
     * @param {Object} cardDetails - بيانات البطاقة
     * @param {string} cardDetails.number - رقم البطاقة
     * @param {string} cardDetails.expMonth - شهر الانتهاء
     * @param {string} cardDetails.expYear - سنة الانتهاء
     * @param {string} cardDetails.cvv - رمز الأمان
     * @param {string} cardDetails.holderName - اسم حامل البطاقة
     * @returns {Promise<Object>} - {success, token, cardBrand, lastFour, error}
     */
    async tokenizeCard(cardDetails) {
        throw new Error('يجب تنفيذ tokenizeCard في المزود الفرعي');
    }

    /**
     * استرداد المبلغ (كلي أو جزئي)
     * @param {string} transactionId - معرف المعاملة
     * @param {number} amount - المبلغ (اختياري - للاسترداد الجزئي)
     * @returns {Promise<Object>} - {success, refundId, error}
     */
    async refundPayment(transactionId, amount = null) {
        throw new Error('يجب تنفيذ refundPayment في المزود الفرعي');
    }

    /**
     * الحصول على تفاصيل معاملة
     * @param {string} transactionId - معرف المعاملة
     * @returns {Promise<Object>} - تفاصيل المعاملة
     */
    async getTransactionDetails(transactionId) {
        throw new Error('يجب تنفيذ getTransactionDetails في المزود الفرعي');
    }

    /**
     * التحقق من صحة Webhook
     * @param {Object} payload - بيانات الـ Webhook
     * @param {string} signature - التوقيع
     * @returns {boolean} - صحة التوقيع
     */
    verifyWebhook(payload, signature) {
        throw new Error('يجب تنفيذ verifyWebhook في المزود الفرعي');
    }

    /**
     * الحصول على خيارات التقسيط المتاحة
     * @param {number} amount - المبلغ
     * @param {string} currency - العملة
     * @returns {Promise<Array>} - قائمة خيارات التقسيط
     */
    async getInstallmentOptions(amount, currency) {
        if (!this.supportsInstallments) {
            return [];
        }
        throw new Error('يجب تنفيذ getInstallmentOptions في المزود الفرعي');
    }

    /**
     * التحقق من دعم العملة
     * @param {string} currency - رمز العملة
     * @returns {boolean}
     */
    supportsCurrency(currency) {
        return this.supportedCurrencies.includes(currency);
    }

    /**
     * التحقق من دعم الدولة
     * @param {string} countryCode - رمز الدولة
     * @returns {boolean}
     */
    supportsCountry(countryCode) {
        return this.supportedCountries.includes('*') || this.supportedCountries.includes(countryCode);
    }

    /**
     * التحقق من دعم العملة
     * @param {string} currency - رمز العملة
     * @returns {boolean}
     */
    supportsCurrencyCode(currency) {
        return this.supportedCurrencies.includes('*') || this.supportedCurrencies.includes(currency);
    }

    /**
     * التحقق من نافذة الطابع الزمني (±300 ثانية) لمنع هجمات Replay (S05)
     * @param {number} timestampSec - Unix timestamp بالثواني
     * @param {number} toleranceSec - الهامش المسموح (افتراضي 300 ثانية)
     * @returns {boolean}
     */
    static isTimestampWithinTolerance(timestampSec, toleranceSec = 300) {
        const ts = Number(timestampSec);
        if (!Number.isFinite(ts) || ts <= 0) return false;
        const nowSec = Math.floor(Date.now() / 1000);
        return Math.abs(nowSec - ts) <= toleranceSec;
    }

    /**
     * مقارنة ثابتة الزمن (Constant-time comparison) للتواقيع التشفيرية
     */
    static timingSafeEqual(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
            return false;
        }
        let diff = 0;
        for (let i = 0; i < a.length; i++) {
            diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return diff === 0;
    }

    /**
     * حساب توقيع HMAC-SHA256 بصيغة Hex (يدعم الخادم والمتصفح)
     * @param {string} secret - يجب ألا يُمرر سر حي داخل المتصفح؛ للاستخدام في Edge Functions أو الاختبارات
     * @param {string} message - النص الموقّع
     * @returns {Promise<string>}
     */
    static async hmacSha256Hex(secret, message) {
        if (!secret) throw new Error('WEBHOOK_SECRET_NOT_CONFIGURED');
        if (typeof window === 'undefined' && typeof require !== 'undefined') {
            const crypto = require('crypto');
            return crypto.createHmac('sha256', secret).update(message, 'utf8').digest('hex');
        }
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
        return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * حساب توقيع HMAC-SHA256 بصيغة Base64 (لـ Adyen وغيره)
     */
    static async hmacSha256Base64(secret, message) {
        if (!secret) throw new Error('WEBHOOK_SECRET_NOT_CONFIGURED');
        if (typeof window === 'undefined' && typeof require !== 'undefined') {
            const crypto = require('crypto');
            return crypto.createHmac('sha256', secret).update(message, 'utf8').digest('base64');
        }
        const hex = await IPaymentProvider.hmacSha256Hex(secret, message);
        const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(h => parseInt(h, 16)));
        return btoa(String.fromCharCode(...bytes));
    }

    /**
     * توليد مفتاح عدم التكرار UUIDv7 مرتب زمنياً (S05 Idempotency-Key)
     */
    static generateUUIDv7() {
        const ts = Date.now();
        const hexTs = ts.toString(16).padStart(12, '0');
        let rndHex = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const arr = new Uint8Array(10);
            crypto.getRandomValues(arr);
            rndHex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
            for (let i = 0; i < 20; i++) {
                rndHex += Math.floor(Math.random() * 16).toString(16);
            }
        }
        const verAndA = '7' + rndHex.slice(0, 3);
        const variantNibble = ((parseInt(rndHex.slice(3, 4), 16) & 0x3) | 0x8).toString(16);
        const clockSeq = variantNibble + rndHex.slice(4, 7);
        const node = rndHex.slice(7, 19);
        return `${hexTs.slice(0, 8)}-${hexTs.slice(8, 12)}-${verAndA}-${clockSeq}-${node}`;
    }
}

// تصدير الفئة
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IPaymentProvider };
}

// للاستخدام في المتصفح
if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.IPaymentProvider = IPaymentProvider;
}
