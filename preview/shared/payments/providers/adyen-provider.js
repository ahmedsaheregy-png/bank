/**
 * ============================================
 * سويان - محول Adyen العالمي للمدفوعات
 * SAWYAN - Adyen Payment Provider (Europe, UK, MENA, Global MarketPay / Balance Platform)
 * ============================================
 * ملاحظة أمنية (D21): لا يتم تخزين مفتاح Adyen أو HMAC Key داخل المتصفح نهائياً.
 */

const _BaseAdyenParent = (typeof window !== 'undefined' && window.SAWYAN && window.SAWYAN.IPaymentProvider)
    ? window.SAWYAN.IPaymentProvider
    : (typeof require !== 'undefined' ? require('../payment-provider').IPaymentProvider : Object);

class AdyenProvider extends _BaseAdyenParent {
    constructor(config = {}) {
        super(config);
        this.providerName = 'adyen';
        this.supportedCurrencies = ['EUR', 'USD', 'GBP', 'AED', 'SAR', 'TRY'];
        this.supportedCountries = ['DE', 'GB', 'US', 'SA', 'AE', 'TR', '*'];
        this.supportsSplitPayment = true; // Adyen Balance Platform Split Instructions
        this.supportsInstallments = true;

        this.edgeEndpoint = config.edgeEndpoint || '';
        this.merchantAccount = config.merchantAccount || '';
        this.hmacKey = config.hmacKey || ''; // للخادم / الاختبارات فقط
    }

    async _invokeEdge(action, payload, idempotencyKey = null) {
        if (!this.edgeEndpoint) {
            throw new Error('ADYEN_EDGE_ENDPOINT_REQUIRED: Direct browser calls with secret keys are prohibited (D21).');
        }
        const response = await fetch(`${this.edgeEndpoint}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey || _BaseAdyenParent.generateUUIDv7()
            },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    async onboardMerchant(merchantData) {
        return await this._invokeEdge('adyen-account-holder', {
            legalEntityName: merchantData.businessName,
            countryCode: merchantData.countryCode,
            email: merchantData.email
        });
    }

    async authorizePayment(amount, currency, token, metadata = {}) {
        return await this._invokeEdge('adyen-authorize', {
            merchantAccount: this.merchantAccount,
            amount: { currency, value: Math.round(Number(amount) * 100) },
            paymentMethod: token,
            reference: metadata.reference || _BaseAdyenParent.generateUUIDv7()
        }, metadata.idempotencyKey);
    }

    async capturePayment(authorizationId, splitConfig = {}) {
        return await this._invokeEdge('adyen-capture', {
            pspReference: authorizationId,
            splits: splitConfig
        }, splitConfig.idempotencyKey);
    }

    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        return await this._invokeEdge('adyen-payments', {
            merchantAccount: this.merchantAccount,
            amount: { currency, value: Math.round(Number(amount) * 100) },
            paymentMethod: token,
            splits: splitConfig,
            reference: metadata.reference || _BaseAdyenParent.generateUUIDv7()
        }, metadata.idempotencyKey);
    }

    async chargeStoredMethod(providerToken, amount, currency, splitConfig = {}) {
        return await this.directCharge(amount, currency, { storedPaymentMethodId: providerToken }, splitConfig, { recurring: true });
    }

    async tokenizeCard() {
        return {
            success: false,
            requiresAdyenDropIn: true,
            error: 'توكين البطاقات في Adyen يتم حصراً عبر Adyen Web Drop-in المشفر.'
        };
    }

    async refundPayment(transactionId, amount = null) {
        return await this._invokeEdge('adyen-refund', {
            pspReference: transactionId,
            amountMinor: amount !== null ? Math.round(Number(amount) * 100) : undefined
        });
    }

    async getTransactionDetails(transactionId) {
        return await this._invokeEdge('adyen-details', { pspReference: transactionId });
    }

    /**
     * التحقق من توقيع Adyen Webhook مع نافذة ±300 ثانية
     */
    async verifyWebhook(notificationItem, timestampHeader = null, hmacOverride = null) {
        const key = hmacOverride || this.hmacKey;
        if (!key || !notificationItem || !notificationItem.additionalData) {
            return { valid: false, reason: 'MISSING_HMAC_OR_ADDITIONAL_DATA' };
        }

        if (timestampHeader && !_BaseAdyenParent.isTimestampWithinTolerance(timestampHeader, 300)) {
            return { valid: false, reason: 'WEBHOOK_TIMESTAMP_EXPIRED_300S' };
        }

        const hmacSig = notificationItem.additionalData.hmacSignature || '';
        const signingParts = [
            notificationItem.pspReference || '',
            notificationItem.originalReference || '',
            notificationItem.merchantAccountCode || '',
            notificationItem.merchantReference || '',
            notificationItem.amount && notificationItem.amount.value !== undefined ? String(notificationItem.amount.value) : '',
            (notificationItem.amount && notificationItem.amount.currency) || '',
            notificationItem.eventCode || '',
            String(notificationItem.success)
        ].join(':');

        const expectedBase64 = await _BaseAdyenParent.hmacSha256Base64(key, signingParts);
        const matched = _BaseAdyenParent.timingSafeEqual(expectedBase64, hmacSig);

        return {
            valid: matched,
            reason: matched ? 'OK' : 'SIGNATURE_MISMATCH'
        };
    }

    supportsCurrency(currency) {
        return this.supportsCurrencyCode(currency);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AdyenProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.AdyenProvider = AdyenProvider;
}
