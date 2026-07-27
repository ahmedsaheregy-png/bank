/**
 * ============================================
 * سويان - محول HyperPay للدفع في السعودية والخليج
 * SAWYAN - HyperPay Payment Provider (GCC)
 * ============================================
 * 
 * HyperPay هو أشهر مزود دفع في السعودية والخليج
 * يدعم: Visa, Mastercard, Mada, Apple Pay
 * 
 * التوثيق: https://wordpresshyperpay.docs.oppwa.com/
 * ============================================
 */

class HyperPayProvider {
    constructor(config = {}) {
        this.config = config;
        this.providerName = 'hyperpay';
        this.supportedCurrencies = ['SAR', 'AED', 'BHD', 'KWD', 'OMR', 'QAR'];
        this.supportedCountries = ['SA', 'AE', 'BH', 'KW', 'OM', 'QA'];
        this.supportsSplitPayment = true;
        this.supportsInstallments = false;

        // HyperPay API endpoints
        this.baseUrl = config.sandbox
            ? 'https://eu-test.oppwa.com'
            : 'https://eu-prod.oppwa.com';

        // المفاتيح
        this.accessToken = config.accessToken || '';
        this.entityId = config.entityId || ''; // للبطاقات العادية
        this.madaEntityId = config.madaEntityId || ''; // لبطاقات مدى السعودية
    }

    /**
     * تحديد Entity ID المناسب
     * @private
     */
    _getEntityId(cardBrand) {
        // مدى تحتاج Entity ID خاص
        if (cardBrand && cardBrand.toLowerCase() === 'mada') {
            return this.madaEntityId || this.entityId;
        }
        return this.entityId;
    }

    /**
     * تسجيل تاجر
     */
    async onboardMerchant(merchantData) {
        console.log('📝 [HyperPay] تسجيل التاجر يتم عبر لوحة HyperPay');

        return {
            success: true,
            providerId: null,
            message: 'تسجيل التاجر في HyperPay يتطلب التواصل مع فريق HyperPay',
            requiresManualSetup: true
        };
    }

    /**
     * إنشاء Checkout (الخطوة 1)
     */
    async authorizePayment(amount, currency, token, metadata = {}) {
        console.log(`💳 [HyperPay] إنشاء Checkout: ${amount} ${currency}`);

        if (!this.accessToken || !this.entityId) {
            return { success: false, error: 'بيانات API غير مُعدة' };
        }

        try {
            const formData = new URLSearchParams();
            formData.append('entityId', this._getEntityId(metadata.cardBrand));
            formData.append('amount', amount.toFixed(2));
            formData.append('currency', currency);
            formData.append('paymentType', 'DB'); // Debit (خصم مباشر)
            formData.append('merchantTransactionId', `SAWYAN_${Date.now()}`);

            // بيانات العميل
            if (metadata.email) formData.append('customer.email', metadata.email);
            if (metadata.firstName) formData.append('customer.givenName', metadata.firstName);
            if (metadata.lastName) formData.append('customer.surname', metadata.lastName);
            if (metadata.phone) formData.append('customer.mobile', metadata.phone);

            // البطاقة المحفوظة
            if (token && token.startsWith('registrationId_')) {
                formData.append('registrationId', token.replace('registrationId_', ''));
            }

            const response = await fetch(`${this.baseUrl}/v1/checkouts`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            const data = await response.json();

            if (data.result?.code?.match(/^(000\.200)/)) {
                return {
                    success: true,
                    authorizationId: data.id,
                    checkoutId: data.id,
                    // Script للـ Widget
                    widgetUrl: `${this.baseUrl}/v1/paymentWidgets.js?checkoutId=${data.id}`,
                    message: 'تم إنشاء جلسة الدفع بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.result?.description || 'فشل إنشاء جلسة الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [HyperPay] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من نتيجة الدفع (الخطوة 2)
     */
    async capturePayment(checkoutId, splitConfig = {}) {
        console.log(`✅ [HyperPay] التحقق من الدفع: ${checkoutId}`);

        try {
            const response = await fetch(
                `${this.baseUrl}/v1/checkouts/${checkoutId}/payment?entityId=${this.entityId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            const data = await response.json();

            // رموز النجاح في HyperPay
            const successPattern = /^(000\.000\.|000\.100\.1|000\.[36])/;
            const pendingPattern = /^(000\.200)/;

            if (data.result?.code?.match(successPattern)) {
                return {
                    success: true,
                    transactionId: data.id,
                    amount: parseFloat(data.amount),
                    currency: data.currency,
                    cardBrand: data.paymentBrand,
                    cardLast4: data.card?.last4Digits,
                    splitDetails: splitConfig,
                    message: 'تم الدفع بنجاح'
                };
            } else if (data.result?.code?.match(pendingPattern)) {
                return {
                    success: false,
                    pending: true,
                    error: 'الدفع قيد المعالجة'
                };
            } else {
                return {
                    success: false,
                    error: data.result?.description || 'فشل الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [HyperPay] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * الدفع المباشر
     */
    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        const authResult = await this.authorizePayment(amount, currency, token, metadata);

        if (authResult.success) {
            authResult.splitDetails = splitConfig;
            authResult.requiresWidget = true;
        }

        return authResult;
    }

    /**
     * شحن بطاقة محفوظة (Registration)
     */
    async chargeStoredMethod(registrationId, amount, currency, splitConfig = {}) {
        console.log(`🔄 [HyperPay] شحن بطاقة محفوظة: ${amount} ${currency}`);

        try {
            const formData = new URLSearchParams();
            formData.append('entityId', this.entityId);
            formData.append('amount', amount.toFixed(2));
            formData.append('currency', currency);
            formData.append('paymentType', 'DB');
            formData.append('recurringType', 'REPEATED');
            formData.append('merchantTransactionId', `SAWYAN_${Date.now()}`);

            const response = await fetch(`${this.baseUrl}/v1/registrations/${registrationId}/payments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            const data = await response.json();

            const successPattern = /^(000\.000\.|000\.100\.1|000\.[36])/;

            if (data.result?.code?.match(successPattern)) {
                return {
                    success: true,
                    transactionId: data.id,
                    splitDetails: splitConfig,
                    message: 'تم الدفع بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.result?.description || 'فشل الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [HyperPay] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * توكين البطاقة (Registration)
     */
    async tokenizeCard(cardDetails) {
        console.log('🔐 [HyperPay] توكين بطاقة');

        try {
            const formData = new URLSearchParams();
            formData.append('entityId', this.entityId);
            formData.append('paymentBrand', cardDetails.brand || 'VISA');
            formData.append('card.number', cardDetails.number);
            formData.append('card.holder', cardDetails.holderName);
            formData.append('card.expiryMonth', cardDetails.expMonth);
            formData.append('card.expiryYear', cardDetails.expYear);
            formData.append('card.cvv', cardDetails.cvv);
            formData.append('createRegistration', 'true');

            const response = await fetch(`${this.baseUrl}/v1/registrations`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            const data = await response.json();

            const successPattern = /^(000\.000\.|000\.100\.1|000\.[36])/;

            if (data.result?.code?.match(successPattern)) {
                return {
                    success: true,
                    token: data.id, // Registration ID
                    cardBrand: data.paymentBrand,
                    lastFour: data.card?.last4Digits,
                    message: 'تم حفظ البطاقة بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.result?.description || 'فشل حفظ البطاقة'
                };
            }

        } catch (error) {
            console.error('❌ [HyperPay] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * استرداد المبلغ
     */
    async refundPayment(transactionId, amount = null) {
        console.log(`↩️ [HyperPay] استرداد: ${transactionId}`);

        try {
            const formData = new URLSearchParams();
            formData.append('entityId', this.entityId);
            formData.append('paymentType', 'RF'); // Refund
            if (amount) formData.append('amount', amount.toFixed(2));
            formData.append('currency', 'SAR'); // يجب تمريرها

            const response = await fetch(`${this.baseUrl}/v1/payments/${transactionId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: formData.toString()
            });

            const data = await response.json();

            const successPattern = /^(000\.000\.|000\.100\.1|000\.[36])/;

            if (data.result?.code?.match(successPattern)) {
                return {
                    success: true,
                    refundId: data.id,
                    refundedAmount: amount,
                    message: 'تم الاسترداد بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.result?.description || 'فشل الاسترداد'
                };
            }

        } catch (error) {
            console.error('❌ [HyperPay] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * تفاصيل المعاملة
     */
    async getTransactionDetails(transactionId) {
        console.log(`📋 [HyperPay] تفاصيل: ${transactionId}`);

        try {
            const response = await fetch(
                `${this.baseUrl}/v1/query/${transactionId}?entityId=${this.entityId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`
                    }
                }
            );

            const data = await response.json();

            return {
                success: true,
                transaction: {
                    id: data.id,
                    amount: parseFloat(data.amount),
                    currency: data.currency,
                    status: data.result?.code?.match(/^(000\.)/) ? 'completed' : 'failed',
                    cardBrand: data.paymentBrand
                }
            };

        } catch (error) {
            console.error('❌ [HyperPay] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من Webhook
     */
    verifyWebhook(payload, signature) {
        // HyperPay webhook verification
        // يتطلب مقارنة التوقيع
        return true; // يجب تنفيذ التحقق الفعلي
    }

    supportsCurrency(currency) {
        return this.supportedCurrencies.includes(currency);
    }

    supportsCountry(countryCode) {
        return this.supportedCountries.includes(countryCode);
    }
}

// تصدير
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HyperPayProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.HyperPayProvider = HyperPayProvider;
}
