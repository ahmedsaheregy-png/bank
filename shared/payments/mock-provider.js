/**
 * ============================================
 * سويان - المزود الوهمي للاختبار
 * SAWYAN - Mock Payment Provider
 * ============================================
 * 
 * مزود وهمي للاختبار والتطوير.
 * يحاكي جميع عمليات الدفع بدون اتصال فعلي بأي بوابة.
 * 
 * ============================================
 */

/**
 * المزود الوهمي للاختبار
 */
class MockPaymentProvider {
    constructor(config = {}) {
        this.config = config;
        this.providerName = 'mock';
        this.supportedCurrencies = ['EGP', 'SAR', 'TRY', 'AED', 'USD'];
        this.supportedCountries = ['EG', 'SA', 'TR', 'AE', 'US'];
        this.supportsSplitPayment = true;
        this.supportsInstallments = true;

        // محاكاة قاعدة بيانات المعاملات
        this.transactions = new Map();
        this.tokens = new Map();
    }

    /**
     * توليد معرف فريد
     */
    _generateId(prefix = 'mock') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * محاكاة تأخير الشبكة
     */
    async _simulateDelay(ms = 500) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * تسجيل تاجر جديد
     */
    async onboardMerchant(merchantData) {
        await this._simulateDelay(300);

        console.log('🔧 [Mock] تسجيل تاجر:', merchantData.businessName);

        return {
            success: true,
            providerId: this._generateId('merchant'),
            message: 'تم تسجيل التاجر بنجاح (وهمي)'
        };
    }

    /**
     * تفويض الدفع
     */
    async authorizePayment(amount, currency, token, metadata = {}) {
        await this._simulateDelay(500);

        console.log(`💳 [Mock] تفويض دفع: ${amount} ${currency}`);

        // محاكاة فشل عشوائي (5% احتمال)
        if (Math.random() < 0.05) {
            return {
                success: false,
                error: 'رفض البطاقة - رصيد غير كافٍ (محاكاة)'
            };
        }

        const authId = this._generateId('auth');
        this.transactions.set(authId, {
            type: 'authorization',
            amount,
            currency,
            token,
            status: 'authorized',
            createdAt: new Date()
        });

        return {
            success: true,
            authorizationId: authId,
            message: 'تم تفويض الدفع بنجاح (وهمي)'
        };
    }

    /**
     * تنفيذ الدفع
     */
    async capturePayment(authorizationId, splitConfig = {}) {
        await this._simulateDelay(400);

        console.log(`✅ [Mock] تنفيذ دفع: ${authorizationId}`);

        const auth = this.transactions.get(authorizationId);
        if (!auth) {
            return {
                success: false,
                error: 'معرف التفويض غير موجود'
            };
        }

        const transactionId = this._generateId('txn');
        this.transactions.set(transactionId, {
            ...auth,
            type: 'capture',
            status: 'captured',
            splitConfig,
            capturedAt: new Date()
        });

        return {
            success: true,
            transactionId,
            splitDetails: {
                merchantAmount: splitConfig.merchantAmount || auth.amount,
                platformAmount: splitConfig.platformAmount || 0
            },
            message: 'تم تنفيذ الدفع بنجاح (وهمي)'
        };
    }

    /**
     * الدفع المباشر
     */
    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        await this._simulateDelay(600);

        console.log(`⚡ [Mock] دفع مباشر: ${amount} ${currency}`);

        // محاكاة فشل عشوائي
        if (Math.random() < 0.05) {
            return {
                success: false,
                error: 'فشل في معالجة الدفع (محاكاة)'
            };
        }

        const transactionId = this._generateId('txn');
        this.transactions.set(transactionId, {
            type: 'direct_charge',
            amount,
            currency,
            token,
            splitConfig,
            status: 'completed',
            createdAt: new Date()
        });

        return {
            success: true,
            transactionId,
            splitDetails: {
                merchantAmount: splitConfig.merchantAmount || amount * 0.9,
                platformAmount: splitConfig.platformAmount || amount * 0.1
            },
            message: 'تم الدفع بنجاح (وهمي)'
        };
    }

    /**
     * شحن طريقة دفع محفوظة
     */
    async chargeStoredMethod(providerToken, amount, currency, splitConfig = {}) {
        await this._simulateDelay(500);

        console.log(`🔄 [Mock] شحن طريقة محفوظة: ${amount} ${currency}`);

        const tokenData = this.tokens.get(providerToken);
        if (!tokenData) {
            return {
                success: false,
                error: 'توكن غير صالح أو منتهي الصلاحية'
            };
        }

        return await this.directCharge(amount, currency, providerToken, splitConfig, {
            storedMethod: true
        });
    }

    /**
     * توكين البطاقة
     */
    async tokenizeCard(cardDetails) {
        await this._simulateDelay(400);

        console.log(`🔐 [Mock] توكين بطاقة: ****${cardDetails.number.slice(-4)}`);

        // التحقق من صحة البيانات الأساسية
        if (!cardDetails.number || cardDetails.number.length < 13) {
            return {
                success: false,
                error: 'رقم البطاقة غير صالح'
            };
        }

        const token = this._generateId('tok');
        const lastFour = cardDetails.number.slice(-4);

        // تحديد نوع البطاقة
        let cardBrand = 'unknown';
        const firstDigit = cardDetails.number[0];
        const firstTwo = cardDetails.number.slice(0, 2);

        if (firstDigit === '4') cardBrand = 'visa';
        else if (['51', '52', '53', '54', '55'].includes(firstTwo)) cardBrand = 'mastercard';
        else if (['34', '37'].includes(firstTwo)) cardBrand = 'amex';
        else if (firstDigit === '9') cardBrand = 'troy'; // تركيا

        this.tokens.set(token, {
            lastFour,
            cardBrand,
            holderName: cardDetails.holderName,
            expMonth: cardDetails.expMonth,
            expYear: cardDetails.expYear,
            createdAt: new Date()
        });

        return {
            success: true,
            token,
            cardBrand,
            lastFour,
            message: 'تم حفظ البطاقة بنجاح (وهمي)'
        };
    }

    /**
     * استرداد المبلغ
     */
    async refundPayment(transactionId, amount = null) {
        await this._simulateDelay(400);

        console.log(`↩️ [Mock] استرداد: ${transactionId}`);

        const txn = this.transactions.get(transactionId);
        if (!txn) {
            return {
                success: false,
                error: 'المعاملة غير موجودة'
            };
        }

        const refundAmount = amount || txn.amount;
        const refundId = this._generateId('ref');

        this.transactions.set(refundId, {
            type: 'refund',
            originalTransactionId: transactionId,
            amount: refundAmount,
            status: 'refunded',
            createdAt: new Date()
        });

        return {
            success: true,
            refundId,
            refundedAmount: refundAmount,
            message: 'تم الاسترداد بنجاح (وهمي)'
        };
    }

    /**
     * تفاصيل المعاملة
     */
    async getTransactionDetails(transactionId) {
        await this._simulateDelay(200);

        const txn = this.transactions.get(transactionId);
        if (!txn) {
            return {
                success: false,
                error: 'المعاملة غير موجودة'
            };
        }

        return {
            success: true,
            transaction: {
                id: transactionId,
                ...txn
            }
        };
    }

    /**
     * التحقق من Webhook
     */
    verifyWebhook(payload, signature) {
        // في الوضع الوهمي، نقبل أي توقيع
        console.log('🔍 [Mock] التحقق من Webhook');
        return true;
    }

    /**
     * خيارات التقسيط
     */
    async getInstallmentOptions(amount, currency) {
        await this._simulateDelay(200);

        console.log(`📅 [Mock] خيارات التقسيط: ${amount} ${currency}`);

        // خيارات تقسيط وهمية
        return [
            { months: 3, monthlyAmount: (amount / 3).toFixed(2), interestRate: 0 },
            { months: 6, monthlyAmount: (amount / 6 * 1.05).toFixed(2), interestRate: 5 },
            { months: 9, monthlyAmount: (amount / 9 * 1.08).toFixed(2), interestRate: 8 },
            { months: 12, monthlyAmount: (amount / 12 * 1.12).toFixed(2), interestRate: 12 }
        ];
    }

    /**
     * التحقق من دعم العملة
     */
    supportsCurrency(currency) {
        return this.supportedCurrencies.includes(currency);
    }

    /**
     * التحقق من دعم الدولة
     */
    supportsCountry(countryCode) {
        return this.supportedCountries.includes(countryCode);
    }
}

// تصدير الفئة
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MockPaymentProvider };
}

// للاستخدام في المتصفح
if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.MockPaymentProvider = MockPaymentProvider;
}
