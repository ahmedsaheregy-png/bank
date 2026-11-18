/**
 * ============================================
 * سويان - محول Stripe العالمي للمدفوعات
 * SAWYAN - Stripe Global Payment Provider (Cards, Apple Pay, SEPA, Connect)
 * ============================================
 * ملاحظة أمنية (D21): مفاتيح Stripe السرية (Secret Key & Webhook Secret) لا توضع في المتصفح مطلقاً؛
 * بل تعمل عبر Supabase Edge Function موثقة. هذا المحول يوفر واجهة التوجيه القياسية + توقيع Stripe-Signature.
 */

const _BaseStripeParent = (typeof window !== 'undefined' && window.SAWYAN && window.SAWYAN.IPaymentProvider)
    ? window.SAWYAN.IPaymentProvider
    : (typeof require !== 'undefined' ? require('../payment-provider').IPaymentProvider : Object);

class StripeProvider extends _BaseStripeParent {
    constructor(config = {}) {
        super(config);
        this.providerName = 'stripe';
        this.supportedCurrencies = ['USD', 'EUR', 'GBP', 'AED', 'SAR', 'EGP', 'TRY'];
        this.supportedCountries = ['US', 'DE', 'GB', 'AE', 'SA', 'EG', 'TR', '*'];
        this.supportsSplitPayment = true;
        this.supportsInstallments = true; // Klarna / Afterpay via Stripe

        this.edgeEndpoint = config.edgeEndpoint || '';
        this.publishableKey = config.publishableKey || '';
        this.webhookSecret = config.webhookSecret || ''; // يُمرر في بيئة الخادم / الاختبار فقط
    }

    async _invokeEdge(action, payload, idempotencyKey = null) {
        if (!this.edgeEndpoint) {
            throw new Error('STRIPE_EDGE_ENDPOINT_REQUIRED: Direct browser calls with secret keys are prohibited (D21).');
        }
        const idemKey = idempotencyKey || _BaseStripeParent.generateUUIDv7();
        const response = await fetch(`${this.edgeEndpoint}/${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': idemKey
            },
            body: JSON.stringify(payload)
        });
        return await response.json();
    }

    async onboardMerchant(merchantData) {
        if (!this.edgeEndpoint) {
            return {
                success: false,
                requiresEdgeBackend: true,
                error: 'يتطلب إنشاء حساب Stripe Connect عبر دالة الخادم المؤمنة.'
            };
        }
        return await this._invokeEdge('stripe-connect-onboard', {
            country: merchantData.countryCode,
            email: merchantData.email,
            businessName: merchantData.businessName
        });
    }

    async authorizePayment(amount, currency, token, metadata = {}) {
        return await this._invokeEdge('stripe-payment-intent', {
            amountMinor: Math.round(Number(amount) * 100),
            currency: String(currency).toLowerCase(),
            paymentMethodId: token,
            captureMethod: 'manual',
            metadata
        }, metadata.idempotencyKey);
    }

    async capturePayment(authorizationId, splitConfig = {}) {
        return await this._invokeEdge('stripe-payment-capture', {
            paymentIntentId: authorizationId,
            splitConfig
        }, splitConfig.idempotencyKey);
    }

    async directCharge(amount, currency, token, splitConfig = {}, metadata = {}) {
        return await this._invokeEdge('stripe-direct-charge', {
            amountMinor: Math.round(Number(amount) * 100),
            currency: String(currency).toLowerCase(),
            paymentMethodId: token,
            merchantConnectId: splitConfig.merchantProviderId || null,
            applicationFeeMinor: splitConfig.platformAmount ? Math.round(Number(splitConfig.platformAmount) * 100) : 0,
            metadata
        }, metadata.idempotencyKey);
    }

    async chargeStoredMethod(providerToken, amount, currency, splitConfig = {}) {
        return await this.directCharge(amount, currency, providerToken, splitConfig, { offSession: true });
    }

    async tokenizeCard() {
        return {
            success: false,
            requiresStripeElements: true,
            error: 'توكين البطاقات يتم حصراً عبر Stripe Elements / SetupIntent داخل واجهة آمنة (PCI-DSS).'
        };
    }

    async refundPayment(transactionId, amount = null) {
        return await this._invokeEdge('stripe-refund', {
            paymentIntentId: transactionId,
            amountMinor: amount !== null ? Math.round(Number(amount) * 100) : undefined
        });
    }

    async getTransactionDetails(transactionId) {
        return await this._invokeEdge('stripe-status', { paymentIntentId: transactionId });
    }

    /**
     * التحقق من ترويسة Stripe-Signature بصيغة: t=<unix>,v1=<hmac_sha256_hex>
     * يفرض نافذة ±300 ثانية ضد هجمات Replay (S05)
     */
    async verifyWebhook(rawPayload, stripeSignatureHeader, secretOverride = null) {
        const secret = secretOverride || this.webhookSecret;
        if (!secret || !stripeSignatureHeader || !rawPayload) {
            return { valid: false, reason: 'MISSING_SIGNATURE_OR_SECRET' };
        }

        const parts = String(stripeSignatureHeader).split(',').reduce((acc, item) => {
            const [k, v] = item.trim().split('=');
            if (k && v) acc[k] = v;
            return acc;
        }, {});

        if (!parts.t || !parts.v1) {
            return { valid: false, reason: 'MALFORMED_STRIPE_SIGNATURE' };
        }

        if (!_BaseStripeParent.isTimestampWithinTolerance(parts.t, 300)) {
            return { valid: false, reason: 'WEBHOOK_TIMESTAMP_EXPIRED_300S' };
        }

        const payloadString = typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload);
        const signedPayload = `${parts.t}.${payloadString}`;
        const expectedSig = await _BaseStripeParent.hmacSha256Hex(secret, signedPayload);
        const matched = _BaseStripeParent.timingSafeEqual(expectedSig, parts.v1);

        return {
            valid: matched,
            timestamp: Number(parts.t),
            reason: matched ? 'OK' : 'SIGNATURE_MISMATCH'
        };
    }

    supportsCurrency(currency) {
        return this.supportsCurrencyCode(currency);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StripeProvider };
}

if (typeof window !== 'undefined') {
    window.SAWYAN = window.SAWYAN || {};
    window.SAWYAN.StripeProvider = StripeProvider;
}
