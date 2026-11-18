/**
 * ============================================
 * سويان - محول PayPal & Wise للتحويلات الدولية وسحب الأعضاء
 * SAWYAN - PayPal & Wise Global Cross-Border Payout/Checkout Provider
 * ============================================
 */

const _BasePPWParent = (typeof window !== 'undefined' && window.SAWYAN && window.SAWYAN.IPaymentProvider)
    ? window.SAWYAN.IPaymentProvider
    : (typeof require !== 'undefined' ? require('../payment-provider').IPaymentProvider : Object);

class PayPalWiseProvider extends _BasePPWParent {
    constructor(config = {}) {
        super(config);
        this.providerName = 'paypal_wise';
        this.supportedCurrencies = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'TRY', 'EGP'];
        this.supportedCountries = ['*'];
        this.supportsSplitPayment = false;
        this.supportsInstallments = false;

        this.edgeEndpoint = config.edgeEndpoint || '';
        this.webhookSecret = config.webhookSecret || '';
    }

    async _invokeEdge(action, payload, idempotencyKey = null) {
        if (!this.edgeEndpoint) {
            throw new Error('PAYPAL_WISE_EDGE_ENDPOINT_REQUIRED: Direct browser calls with secret keys are prohibited (D21).');
        }
        const response = await fetch(`${this.edgeEndpoint}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': idempotencyKey || _BasePPWParent.generateUUIDv7()
            },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    async onboardMerchant(merchantData) {
        return await this._invokeEdge('wise-paypal-recipient', {
            email: merchantData.email,
            countryCode: merchantData.countryCode,
            businessName: merchantData.businessName
        });
    }

    async authorizePayment(amount, currency, token, metadata = {}) {
        return await this._invokeEdge('paypal-order-create', {
            amount,
            currency,
            intent: 'AUTHORIZE',
            payerToken: token,
            metadata
        }, metadata.idempotencyKey);
    }

    async capturePayment(authorizationId, splitConfig = {}) {
        return await this._invokeEdge('paypal-order-capture', {
            orderId: authorizationId,
            splitConfig
        }, splitConfig.idempotencyKey);
    }

    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        return await this._invokeEdge('paypal-direct-capture', {
            amount,
            currency,
            payerToken: token,
            metadata
        }, metadata.idempotencyKey);
    }

    async chargeStoredMethod() {
        return {
            success: false,
            error: 'PayPal/Wise لا يدعم الخصم التلقائي في نقطة البيع بدون تفويض متصفح.'
        };
    }

    async tokenizeCard() {
        return {
            success: false,
            error: 'التوكين للبطاقات غير مفعل على محول PayPal/Wise.'
        };
    }

    async refundPayment(transactionId, amount = null) {
        return await this._invokeEdge('paypal-refund', { captureId: transactionId, amount });
    }

    async getTransactionDetails(transactionId) {
        return await this._invokeEdge('wise-paypal-status', { referenceId: transactionId });
    }

    /**
     * التحقق من توقيع Webhook لـ PayPal / Wise مع قيد Replay ±300 ثانية
     */
    async verifyWebhook(rawPayload, signatureHex, timestampSec, secretOverride = null) {
        const secret = secretOverride || this.webhookSecret;
        if (!secret || !signatureHex || !_BasePPWParent.isTimestampWithinTolerance(timestampSec, 300)) {
            return { valid: false, reason: 'INVALID_OR_EXPIRED_WEBHOOK' };
        }
        const payloadStr = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
        const expected = await _BasePPWParent.hmacSha256Hex(secret, `${timestampSec}.${payloadStr}`);
        const matched = _BasePPWParent.timingSafeEqual(expected, signatureHex);
        return { valid: matched, timestamp: Number(timestampSec), reason: matched ? 'OK' : 'SIGNATURE_MISMATCH' };
    }

    supportsCurrency(currency) {
        return this.supportsCurrencyCode(currency);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PayPalWiseProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.PayPalWiseProvider = PayPalWiseProvider;
}
