/**
 * ============================================
 * سويان - محول Fawry للدفع في مصر
 * SAWYAN - Fawry Payment Provider (Egypt)
 * ============================================
 * 
 * Fawry هو نظام الدفع النقدي الأشهر في مصر
 * العميل يحصل على رقم مرجعي ويدفع في أي منفذ فوري
 * 
 * التوثيق: https://developer.fawrystaging.com/
 * ============================================
 */

class FawryProvider {
    constructor(config = {}) {
        this.config = config;
        this.providerName = 'fawry';
        this.supportedCurrencies = ['EGP'];
        this.supportedCountries = ['EG'];
        this.supportsSplitPayment = false; // Fawry لا يدعم Split مباشرة
        this.supportsInstallments = false;

        // Fawry API endpoints
        this.baseUrl = config.sandbox
            ? 'https://atfawry.fawrystaging.com'
            : 'https://www.atfawry.com';

        // المفاتيح
        this.merchantCode = config.merchantCode || '';
        this.securityKey = config.securityKey || '';
    }

    /**
     * حساب التوقيع (Signature)
     * @private
     */
    _calculateSignature(data) {
        // Fawry uses SHA256
        const stringToHash = data.join('');

        // في المتصفح نستخدم SubtleCrypto
        if (typeof window !== 'undefined') {
            return this._browserSHA256(stringToHash);
        }

        // في Node.js
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(stringToHash).digest('hex');
    }

    /**
     * SHA256 في المتصفح
     * @private
     */
    async _browserSHA256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * تسجيل تاجر في Fawry
     */
    async onboardMerchant(merchantData) {
        console.log('📝 [Fawry] تسجيل التاجر يتم عبر بوابة Fawry Business');

        return {
            success: true,
            providerId: null,
            message: 'تسجيل التاجر في Fawry يتطلب التواصل مع فريق Fawry Business',
            requiresManualSetup: true
        };
    }

    /**
     * إنشاء طلب دفع Fawry (رقم مرجعي)
     */
    async authorizePayment(amount, currency, token, metadata = {}) {
        console.log(`💵 [Fawry] إنشاء طلب دفع: ${amount} ${currency}`);

        if (!this.merchantCode || !this.securityKey) {
            return { success: false, error: 'بيانات التاجر غير مُعدة' };
        }

        try {
            const merchantRefNum = `SAWYAN_${Date.now()}`;
            const expiryDate = Date.now() + (24 * 60 * 60 * 1000); // 24 ساعة

            const chargeItem = {
                itemId: 'SAWYAN_PAYMENT',
                description: metadata.description || 'دفع عبر سويان',
                price: amount,
                quantity: 1
            };

            // حساب التوقيع
            const signatureData = [
                this.merchantCode,
                merchantRefNum,
                metadata.customerProfileId || '',
                metadata.paymentMethod || 'PAYATFAWRY',
                (amount * 100).toString(), // بالقروش
                this.securityKey
            ];

            const signature = await this._calculateSignature(signatureData);

            const requestBody = {
                merchantCode: this.merchantCode,
                merchantRefNum: merchantRefNum,
                customerProfileId: metadata.customerProfileId || null,
                customerMobile: metadata.phone || '',
                customerEmail: metadata.email || '',
                paymentMethod: 'PAYATFAWRY', // الدفع في منافذ فوري
                currencyCode: currency,
                amount: amount,
                paymentExpiry: expiryDate,
                chargeItems: [chargeItem],
                signature: signature,
                description: metadata.description || 'دفع عبر تطبيق سويان'
            };

            const response = await fetch(`${this.baseUrl}/fawrypay-api/api/payments/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.statusCode === 200) {
                return {
                    success: true,
                    authorizationId: merchantRefNum,
                    fawryRefNumber: data.referenceNumber,
                    expiryDate: new Date(expiryDate).toLocaleString('ar-EG'),
                    message: `تم إنشاء طلب الدفع. رقم فوري: ${data.referenceNumber}`,
                    paymentInstructions: `
                        💵 اذهب لأي منفذ فوري
                        📱 أو استخدم تطبيق MyFawry
                        🔢 أدخل الرقم المرجعي: ${data.referenceNumber}
                        💰 ادفع المبلغ: ${amount} ج.م
                        ⏰ صلاحية الدفع: 24 ساعة
                    `
                };
            } else {
                return {
                    success: false,
                    error: data.statusDescription || 'فشل إنشاء طلب الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [Fawry] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من حالة الدفع
     */
    async capturePayment(authorizationId, splitConfig = {}) {
        console.log(`🔍 [Fawry] التحقق من حالة: ${authorizationId}`);

        // Fawry دفع نقدي - لا يوجد capture
        // بدلاً من ذلك نتحقق من حالة الدفع
        return await this.getTransactionDetails(authorizationId);
    }

    /**
     * الدفع المباشر (إنشاء رقم مرجعي)
     */
    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        console.log(`⚡ [Fawry] دفع فوري: ${amount} ${currency}`);

        const result = await this.authorizePayment(amount, currency, token, metadata);

        if (result.success) {
            result.splitDetails = splitConfig;
            result.requiresOfflinePayment = true;
        }

        return result;
    }

    /**
     * Fawry لا يدعم شحن طريقة محفوظة
     */
    async chargeStoredMethod(providerToken, amount, currency, splitConfig = {}) {
        return {
            success: false,
            error: 'Fawry لا يدعم الدفع بطريقة محفوظة - الدفع نقدي فقط'
        };
    }

    /**
     * Fawry لا يدعم توكين البطاقات
     */
    async tokenizeCard(cardDetails) {
        return {
            success: false,
            error: 'Fawry هو نظام دفع نقدي - لا يدعم حفظ البطاقات'
        };
    }

    /**
     * استرداد المبلغ
     */
    async refundPayment(transactionId, amount = null) {
        console.log(`↩️ [Fawry] استرداد: ${transactionId}`);

        if (!this.merchantCode || !this.securityKey) {
            return { success: false, error: 'بيانات التاجر غير مُعدة' };
        }

        try {
            const signatureData = [
                this.merchantCode,
                transactionId,
                (amount ? amount * 100 : '').toString(),
                this.securityKey
            ];

            const signature = await this._calculateSignature(signatureData);

            const response = await fetch(`${this.baseUrl}/fawrypay-api/api/payments/refund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    merchantCode: this.merchantCode,
                    referenceNumber: transactionId,
                    refundAmount: amount,
                    signature: signature
                })
            });

            const data = await response.json();

            if (data.statusCode === 200) {
                return {
                    success: true,
                    refundId: data.referenceNumber,
                    refundedAmount: amount,
                    message: 'تم الاسترداد بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.statusDescription || 'فشل الاسترداد'
                };
            }

        } catch (error) {
            console.error('❌ [Fawry] خطأ في الاسترداد:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * تفاصيل المعاملة / التحقق من حالة الدفع
     */
    async getTransactionDetails(transactionId) {
        console.log(`📋 [Fawry] جلب تفاصيل: ${transactionId}`);

        if (!this.merchantCode || !this.securityKey) {
            return { success: false, error: 'بيانات التاجر غير مُعدة' };
        }

        try {
            const signatureData = [
                this.merchantCode,
                transactionId,
                this.securityKey
            ];

            const signature = await this._calculateSignature(signatureData);

            const response = await fetch(
                `${this.baseUrl}/fawrypay-api/api/payments/status/v2?` +
                `merchantCode=${this.merchantCode}&` +
                `merchantRefNumber=${transactionId}&` +
                `signature=${signature}`
            );

            const data = await response.json();

            // حالات Fawry
            const statusMap = {
                'PAID': 'completed',
                'UNPAID': 'pending',
                'EXPIRED': 'expired',
                'REFUNDED': 'refunded',
                'CANCELED': 'cancelled'
            };

            return {
                success: true,
                transaction: {
                    id: transactionId,
                    fawryRefNumber: data.referenceNumber,
                    amount: data.paymentAmount,
                    currency: 'EGP',
                    status: statusMap[data.paymentStatus] || 'unknown',
                    paymentStatus: data.paymentStatus,
                    paidAt: data.paymentTime,
                    expiryDate: data.expirationTime
                }
            };

        } catch (error) {
            console.error('❌ [Fawry] خطأ في جلب التفاصيل:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من Webhook
     */
    verifyWebhook(payload, signature) {
        if (!this.securityKey) {
            console.warn('⚠️ [Fawry] Security Key غير مُعد');
            return false;
        }

        // Fawry callback verification
        const signatureData = [
            payload.fawryRefNumber,
            payload.merchantRefNumber,
            payload.paymentAmount?.toString(),
            payload.orderAmount?.toString(),
            payload.orderStatus,
            payload.paymentMethod,
            this.securityKey
        ];

        const expectedSignature = this._calculateSignature(signatureData);
        return expectedSignature === signature;
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
    module.exports = { FawryProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.FawryProvider = FawryProvider;
}
