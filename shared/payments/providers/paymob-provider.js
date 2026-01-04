/**
 * ============================================
 * سويان - محول Paymob للدفع في مصر
 * SAWYAN - Paymob Payment Provider (Egypt)
 * ============================================
 * 
 * Paymob هو أشهر مزود دفع في مصر
 * يدعم: Visa, Mastercard, Meeza, Mobile Wallets
 * 
 * التوثيق: https://docs.paymob.com/
 * ============================================
 */

class PaymobProvider {
    constructor(config = {}) {
        this.config = config;
        this.providerName = 'paymob';
        this.supportedCurrencies = ['EGP'];
        this.supportedCountries = ['EG'];
        this.supportsSplitPayment = true;
        this.supportsInstallments = false;

        // Paymob API endpoints
        this.baseUrl = 'https://accept.paymob.com/api';

        // المفاتيح (يجب تخزينها بشكل آمن في الإنتاج)
        this.apiKey = config.apiKey || '';
        this.integrationId = config.integrationId || ''; // للبطاقات
        this.walletIntegrationId = config.walletIntegrationId || ''; // للمحافظ
        this.iframeId = config.iframeId || '';
        this.hmacSecret = config.hmacSecret || '';
    }

    /**
     * الحصول على Auth Token
     * @private
     */
    async _getAuthToken() {
        const response = await fetch(`${this.baseUrl}/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: this.apiKey })
        });

        const data = await response.json();
        return data.token;
    }

    /**
     * تسجيل الطلب في Paymob
     * @private
     */
    async _registerOrder(authToken, amount, currency, merchantOrderId) {
        const response = await fetch(`${this.baseUrl}/ecommerce/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: authToken,
                delivery_needed: false,
                amount_cents: Math.round(amount * 100), // Paymob يستخدم القروش
                currency: currency,
                merchant_order_id: merchantOrderId,
                items: []
            })
        });

        const data = await response.json();
        return data;
    }

    /**
     * الحصول على Payment Key
     * @private
     */
    async _getPaymentKey(authToken, orderId, amount, currency, billingData, integrationId) {
        const response = await fetch(`${this.baseUrl}/acceptance/payment_keys`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                auth_token: authToken,
                amount_cents: Math.round(amount * 100),
                expiration: 3600, // ساعة واحدة
                order_id: orderId,
                billing_data: billingData,
                currency: currency,
                integration_id: integrationId,
                lock_order_when_paid: true
            })
        });

        const data = await response.json();
        return data.token;
    }

    /**
     * تسجيل تاجر جديد في Paymob
     * ملاحظة: Paymob يتطلب تسجيل يدوي عبر لوحة التحكم
     */
    async onboardMerchant(merchantData) {
        console.log('📝 [Paymob] تسجيل التاجر يتم يدوياً عبر لوحة Paymob');

        return {
            success: true,
            providerId: null,
            message: 'تسجيل التاجر في Paymob يتطلب إجراء يدوي. يرجى التواصل مع دعم Paymob.',
            requiresManualSetup: true
        };
    }

    /**
     * تفويض الدفع (إنشاء Payment Key)
     */
    async authorizePayment(amount, currency, token, metadata = {}) {
        console.log(`💳 [Paymob] تفويض دفع: ${amount} ${currency}`);

        if (!this.apiKey) {
            return { success: false, error: 'مفتاح API غير مُعد' };
        }

        try {
            // 1. الحصول على Auth Token
            const authToken = await this._getAuthToken();

            // 2. تسجيل الطلب
            const merchantOrderId = `SAWYAN_${Date.now()}`;
            const order = await this._registerOrder(authToken, amount, currency, merchantOrderId);

            // 3. بيانات الفوترة
            const billingData = {
                apartment: 'NA',
                email: metadata.email || 'customer@sawyan.app',
                floor: 'NA',
                first_name: metadata.firstName || 'Customer',
                last_name: metadata.lastName || 'Sawyan',
                street: 'NA',
                building: 'NA',
                phone_number: metadata.phone || '+201000000000',
                shipping_method: 'NA',
                postal_code: 'NA',
                city: metadata.city || 'Cairo',
                country: 'EG',
                state: 'NA'
            };

            // 4. الحصول على Payment Key
            const paymentKey = await this._getPaymentKey(
                authToken,
                order.id,
                amount,
                currency,
                billingData,
                this.integrationId
            );

            return {
                success: true,
                authorizationId: order.id.toString(),
                paymentKey: paymentKey,
                iframeUrl: `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentKey}`,
                message: 'تم إنشاء جلسة الدفع بنجاح'
            };

        } catch (error) {
            console.error('❌ [Paymob] خطأ في التفويض:', error);
            return {
                success: false,
                error: error.message || 'فشل في إنشاء جلسة الدفع'
            };
        }
    }

    /**
     * تنفيذ الدفع (Capture)
     * ملاحظة: Paymob يقوم بـ capture تلقائي للعمليات العادية
     */
    async capturePayment(authorizationId, splitConfig = {}) {
        console.log(`✅ [Paymob] تنفيذ دفع: ${authorizationId}`);

        // Paymob يقوم بـ capture تلقائي
        // هذه الدالة للتوافق مع الواجهة فقط
        return {
            success: true,
            transactionId: authorizationId,
            splitDetails: splitConfig,
            message: 'تم تنفيذ الدفع (Paymob auto-capture)'
        };
    }

    /**
     * الدفع المباشر
     */
    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        console.log(`⚡ [Paymob] دفع مباشر: ${amount} ${currency}`);

        const authResult = await this.authorizePayment(amount, currency, token, metadata);

        if (!authResult.success) {
            return authResult;
        }

        // في Paymob، الدفع يتم عبر iframe
        // نُرجع رابط الـ iframe للعرض في الواجهة
        return {
            success: true,
            transactionId: authResult.authorizationId,
            paymentKey: authResult.paymentKey,
            iframeUrl: authResult.iframeUrl,
            requiresRedirect: true,
            splitDetails: splitConfig,
            message: 'تم إنشاء جلسة الدفع - يجب توجيه العميل للدفع'
        };
    }

    /**
     * شحن طريقة دفع محفوظة (Token)
     */
    async chargeStoredMethod(providerToken, amount, currency, splitConfig = {}) {
        console.log(`🔄 [Paymob] شحن توكن محفوظ: ${amount} ${currency}`);

        if (!this.apiKey) {
            return { success: false, error: 'مفتاح API غير مُعد' };
        }

        try {
            const authToken = await this._getAuthToken();
            const merchantOrderId = `SAWYAN_TOKEN_${Date.now()}`;
            const order = await this._registerOrder(authToken, amount, currency, merchantOrderId);

            // الدفع بالتوكن المحفوظ
            const response = await fetch(`${this.baseUrl}/acceptance/payments/pay`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: {
                        identifier: providerToken,
                        subtype: 'TOKEN'
                    },
                    payment_token: await this._getPaymentKey(
                        authToken, order.id, amount, currency,
                        { /* billing data */ },
                        this.integrationId
                    )
                })
            });

            const data = await response.json();

            if (data.pending === false && data.success === true) {
                return {
                    success: true,
                    transactionId: data.id.toString(),
                    splitDetails: splitConfig,
                    message: 'تم الدفع بالتوكن بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.txn_response_code || 'فشل الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [Paymob] خطأ في شحن التوكن:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * توكين البطاقة
     * ملاحظة: يتم عبر iframe Paymob مع تفعيل خيار save_card
     */
    async tokenizeCard(cardDetails) {
        console.log('🔐 [Paymob] توكين البطاقة يتم عبر Paymob iframe');

        return {
            success: true,
            requiresIframe: true,
            message: 'توكين البطاقة يتم عبر Paymob iframe مع تفعيل خيار save_card',
            instructions: 'أضف save_card=true في Payment Key request'
        };
    }

    /**
     * استرداد المبلغ
     */
    async refundPayment(transactionId, amount = null) {
        console.log(`↩️ [Paymob] استرداد: ${transactionId}`);

        if (!this.apiKey) {
            return { success: false, error: 'مفتاح API غير مُعد' };
        }

        try {
            const authToken = await this._getAuthToken();

            const response = await fetch(`${this.baseUrl}/acceptance/void_refund/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auth_token: authToken,
                    transaction_id: transactionId,
                    amount_cents: amount ? Math.round(amount * 100) : null // null = استرداد كامل
                })
            });

            const data = await response.json();

            if (data.success) {
                return {
                    success: true,
                    refundId: data.id?.toString(),
                    refundedAmount: amount,
                    message: 'تم الاسترداد بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.message || 'فشل الاسترداد'
                };
            }

        } catch (error) {
            console.error('❌ [Paymob] خطأ في الاسترداد:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * تفاصيل المعاملة
     */
    async getTransactionDetails(transactionId) {
        console.log(`📋 [Paymob] جلب تفاصيل: ${transactionId}`);

        if (!this.apiKey) {
            return { success: false, error: 'مفتاح API غير مُعد' };
        }

        try {
            const authToken = await this._getAuthToken();

            const response = await fetch(
                `${this.baseUrl}/acceptance/transactions/${transactionId}`,
                {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                }
            );

            const data = await response.json();

            return {
                success: true,
                transaction: {
                    id: data.id,
                    amount: data.amount_cents / 100,
                    currency: data.currency,
                    status: data.success ? 'completed' : 'failed',
                    createdAt: data.created_at
                }
            };

        } catch (error) {
            console.error('❌ [Paymob] خطأ في جلب التفاصيل:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من Webhook (HMAC)
     */
    verifyWebhook(payload, signature) {
        if (!this.hmacSecret) {
            console.warn('⚠️ [Paymob] HMAC Secret غير مُعد');
            return false;
        }

        // Paymob HMAC verification
        const crypto = require('crypto');
        const concatenatedString = [
            payload.amount_cents,
            payload.created_at,
            payload.currency,
            payload.error_occured,
            payload.has_parent_transaction,
            payload.id,
            payload.integration_id,
            payload.is_3d_secure,
            payload.is_auth,
            payload.is_capture,
            payload.is_refunded,
            payload.is_standalone_payment,
            payload.is_voided,
            payload.order,
            payload.owner,
            payload.pending,
            payload.source_data?.pan,
            payload.source_data?.sub_type,
            payload.source_data?.type,
            payload.success
        ].join('');

        const expectedHmac = crypto
            .createHmac('sha512', this.hmacSecret)
            .update(concatenatedString)
            .digest('hex');

        return expectedHmac === signature;
    }

    /**
     * دعم العملة
     */
    supportsCurrency(currency) {
        return this.supportedCurrencies.includes(currency);
    }

    /**
     * دعم الدولة
     */
    supportsCountry(countryCode) {
        return this.supportedCountries.includes(countryCode);
    }
}

// تصدير
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PaymobProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.PaymobProvider = PaymobProvider;
}
