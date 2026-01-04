/**
 * ============================================
 * سويان - محول iyzico للدفع في تركيا
 * SAWYAN - iyzico Payment Provider (Turkey)
 * ============================================
 * 
 * iyzico هو أشهر مزود دفع في تركيا
 * يدعم: Visa, Mastercard, Troy, التقسيط
 * 
 * التوثيق: https://dev.iyzipay.com/
 * ============================================
 */

class IyzicoProvider {
    constructor(config = {}) {
        this.config = config;
        this.providerName = 'iyzico';
        this.supportedCurrencies = ['TRY', 'USD', 'EUR'];
        this.supportedCountries = ['TR'];
        this.supportsSplitPayment = true;
        this.supportsInstallments = true; // ميزة مهمة جداً في تركيا

        // iyzico API endpoints
        this.baseUrl = config.sandbox
            ? 'https://sandbox-api.iyzipay.com'
            : 'https://api.iyzipay.com';

        // المفاتيح
        this.apiKey = config.apiKey || '';
        this.secretKey = config.secretKey || '';
    }

    /**
     * حساب Authorization Header
     * @private
     */
    _getAuthorizationHeader(requestBody, uri) {
        const randomKey = this._generateRandomString(8);
        const payload = randomKey + uri + JSON.stringify(requestBody);

        // HMAC SHA256
        if (typeof window !== 'undefined') {
            return this._browserHMAC(payload, randomKey);
        }

        const crypto = require('crypto');
        const hash = crypto.createHmac('sha256', this.secretKey)
            .update(payload)
            .digest('base64');

        return `IYZWS ${this.apiKey}:${hash}`;
    }

    /**
     * توليد نص عشوائي
     * @private
     */
    _generateRandomString(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * HMAC في المتصفح
     * @private
     */
    async _browserHMAC(message, randomKey) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(this.secretKey);
        const msgData = encoder.encode(message);

        const key = await crypto.subtle.importKey(
            'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', key, msgData);
        const base64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

        return `IYZWS ${this.apiKey}:${base64}`;
    }

    /**
     * تسجيل تاجر جديد (Sub-Merchant)
     */
    async onboardMerchant(merchantData) {
        console.log('📝 [iyzico] تسجيل تاجر:', merchantData.businessName);

        if (!this.apiKey) {
            return { success: false, error: 'مفتاح API غير مُعد' };
        }

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                subMerchantExternalId: merchantData.merchantId,
                subMerchantType: merchantData.type || 'PERSONAL', // PERSONAL, PRIVATE_COMPANY, LIMITED_OR_JOINT_STOCK_COMPANY
                address: merchantData.address || '',
                taxOffice: merchantData.taxOffice || '',
                legalCompanyTitle: merchantData.businessName,
                email: merchantData.email,
                gsmNumber: merchantData.phone,
                name: merchantData.ownerName,
                iban: merchantData.iban, // مطلوب للتحويل
                identityNumber: merchantData.identityNumber, // TC Kimlik No
                currency: 'TRY'
            };

            const response = await fetch(`${this.baseUrl}/onboarding/submerchant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/onboarding/submerchant')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.status === 'success') {
                return {
                    success: true,
                    providerId: data.subMerchantKey,
                    message: 'تم تسجيل التاجر بنجاح في iyzico'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'فشل التسجيل'
                };
            }

        } catch (error) {
            console.error('❌ [iyzico] خطأ في التسجيل:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * إنشاء Checkout Form (الطريقة الموصى بها)
     */
    async authorizePayment(amount, currency, token, metadata = {}) {
        console.log(`💳 [iyzico] إنشاء Checkout Form: ${amount} ${currency}`);

        if (!this.apiKey) {
            return { success: false, error: 'مفتاح API غير مُعد' };
        }

        try {
            const conversationId = `SAWYAN_${Date.now()}`;
            const basketId = `BASKET_${Date.now()}`;

            const requestBody = {
                locale: 'tr',
                conversationId: conversationId,
                price: amount.toString(),
                paidPrice: amount.toString(),
                currency: currency,
                basketId: basketId,
                paymentGroup: 'PRODUCT',
                callbackUrl: metadata.callbackUrl || 'https://sawyan.app/payment/callback',
                enabledInstallments: [1, 2, 3, 6, 9, 12], // خيارات التقسيط
                buyer: {
                    id: metadata.memberId || 'GUEST',
                    name: metadata.firstName || 'Müşteri',
                    surname: metadata.lastName || 'Sawyan',
                    gsmNumber: metadata.phone || '+905000000000',
                    email: metadata.email || 'customer@sawyan.app',
                    identityNumber: metadata.identityNumber || '11111111111',
                    registrationAddress: metadata.address || 'Istanbul',
                    ip: metadata.ip || '127.0.0.1',
                    city: metadata.city || 'Istanbul',
                    country: 'Turkey'
                },
                shippingAddress: {
                    contactName: metadata.firstName || 'Müşteri',
                    city: 'Istanbul',
                    country: 'Turkey',
                    address: 'Istanbul'
                },
                billingAddress: {
                    contactName: metadata.firstName || 'Müşteri',
                    city: 'Istanbul',
                    country: 'Turkey',
                    address: 'Istanbul'
                },
                basketItems: [{
                    id: 'SAWYAN_ITEM',
                    name: metadata.description || 'Sawyan Ödeme',
                    category1: 'Hizmet',
                    itemType: 'VIRTUAL',
                    price: amount.toString()
                }]
            };

            const response = await fetch(`${this.baseUrl}/payment/iyzipos/checkoutform/initialize/auth/ecom`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/payment/iyzipos/checkoutform/initialize/auth/ecom')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.status === 'success') {
                return {
                    success: true,
                    authorizationId: data.token,
                    checkoutFormContent: data.checkoutFormContent, // HTML للعرض
                    tokenExpireTime: data.tokenExpireTime,
                    message: 'تم إنشاء نموذج الدفع بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'فشل إنشاء نموذج الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من نتيجة الدفع
     */
    async capturePayment(token, splitConfig = {}) {
        console.log(`✅ [iyzico] التحقق من الدفع: ${token}`);

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                token: token
            };

            const response = await fetch(`${this.baseUrl}/payment/iyzipos/checkoutform/auth/ecom/detail`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/payment/iyzipos/checkoutform/auth/ecom/detail')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.paymentStatus === 'SUCCESS') {
                return {
                    success: true,
                    transactionId: data.paymentId,
                    amount: parseFloat(data.paidPrice),
                    installment: data.installment,
                    splitDetails: splitConfig,
                    message: 'تم الدفع بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'فشل الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
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
            authResult.requiresCheckoutForm = true;
        }

        return authResult;
    }

    /**
     * شحن بطاقة محفوظة
     */
    async chargeStoredMethod(cardToken, amount, currency, splitConfig = {}) {
        console.log(`🔄 [iyzico] شحن بطاقة محفوظة: ${amount} ${currency}`);

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                price: amount.toString(),
                paidPrice: amount.toString(),
                currency: currency,
                installment: 1,
                paymentCard: {
                    cardToken: cardToken,
                    cardUserKey: splitConfig.cardUserKey
                },
                buyer: splitConfig.buyer || {},
                basketItems: [{
                    id: 'SAWYAN',
                    name: 'Sawyan Payment',
                    category1: 'Service',
                    itemType: 'VIRTUAL',
                    price: amount.toString()
                }]
            };

            const response = await fetch(`${this.baseUrl}/payment/auth`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/payment/auth')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.status === 'success') {
                return {
                    success: true,
                    transactionId: data.paymentId,
                    message: 'تم الدفع بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'فشل الدفع'
                };
            }

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * توكين البطاقة
     */
    async tokenizeCard(cardDetails) {
        console.log('🔐 [iyzico] توكين بطاقة');

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                externalId: cardDetails.userId,
                email: cardDetails.email,
                card: {
                    cardAlias: cardDetails.alias || 'My Card',
                    cardHolderName: cardDetails.holderName,
                    cardNumber: cardDetails.number,
                    expireMonth: cardDetails.expMonth,
                    expireYear: cardDetails.expYear
                }
            };

            const response = await fetch(`${this.baseUrl}/cardstorage/card`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/cardstorage/card')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.status === 'success') {
                return {
                    success: true,
                    token: data.cardToken,
                    cardUserKey: data.cardUserKey,
                    cardBrand: data.cardAssociation,
                    lastFour: data.lastFourDigits,
                    message: 'تم حفظ البطاقة بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'فشل حفظ البطاقة'
                };
            }

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * استرداد المبلغ
     */
    async refundPayment(transactionId, amount = null) {
        console.log(`↩️ [iyzico] استرداد: ${transactionId}`);

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                paymentTransactionId: transactionId,
                price: amount?.toString()
            };

            const response = await fetch(`${this.baseUrl}/payment/refund`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/payment/refund')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.status === 'success') {
                return {
                    success: true,
                    refundId: data.paymentId,
                    refundedAmount: parseFloat(data.price),
                    message: 'تم الاسترداد بنجاح'
                };
            } else {
                return {
                    success: false,
                    error: data.errorMessage || 'فشل الاسترداد'
                };
            }

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * الحصول على خيارات التقسيط
     */
    async getInstallmentOptions(amount, currency) {
        console.log(`📅 [iyzico] خيارات التقسيط: ${amount} ${currency}`);

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                price: amount.toString()
            };

            const response = await fetch(`${this.baseUrl}/payment/iyzipos/installment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/payment/iyzipos/installment')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (data.status === 'success') {
                const options = [];
                data.installmentDetails?.forEach(bank => {
                    bank.installmentPrices?.forEach(inst => {
                        options.push({
                            bankName: bank.bankName,
                            cardType: bank.cardFamilyName,
                            months: inst.installmentNumber,
                            monthlyAmount: parseFloat(inst.installmentPrice),
                            totalAmount: parseFloat(inst.totalPrice),
                            interestRate: bank.commercialInstallment ? 'مع فائدة' : 'بدون فائدة'
                        });
                    });
                });
                return options;
            }

            return [];

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
            return [];
        }
    }

    /**
     * تفاصيل المعاملة
     */
    async getTransactionDetails(paymentId) {
        console.log(`📋 [iyzico] تفاصيل: ${paymentId}`);

        try {
            const requestBody = {
                locale: 'tr',
                conversationId: `SAWYAN_${Date.now()}`,
                paymentId: paymentId
            };

            const response = await fetch(`${this.baseUrl}/payment/detail`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': await this._getAuthorizationHeader(requestBody, '/payment/detail')
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            return {
                success: data.status === 'success',
                transaction: {
                    id: data.paymentId,
                    amount: parseFloat(data.paidPrice),
                    currency: data.currency,
                    status: data.paymentStatus,
                    installment: data.installment
                }
            };

        } catch (error) {
            console.error('❌ [iyzico] خطأ:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * التحقق من Webhook
     */
    verifyWebhook(payload, signature) {
        // iyzico webhook verification
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
    module.exports = { IyzicoProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.IyzicoProvider = IyzicoProvider;
}
