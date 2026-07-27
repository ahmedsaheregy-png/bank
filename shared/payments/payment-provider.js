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
        return this.supportedCountries.includes(countryCode);
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
