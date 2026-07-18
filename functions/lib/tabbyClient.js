"use strict";
/**
 * Tabby API Client
 * خدمة التكامل مع تابي - Backend
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setApiKeys = setApiKeys;
exports.createCheckoutSession = createCheckoutSession;
exports.capturePayment = capturePayment;
exports.getPaymentStatus = getPaymentStatus;
exports.refundPayment = refundPayment;
// مفاتيح Tabby API
let publicKey = "";
let secretKey = "";
const TABBY_API_URL = "https://api.tabby.ai/api/v2";
/**
 * تعيين مفاتيح API
 */
function setApiKeys(pubKey, secKey) {
    publicKey = pubKey;
    secretKey = secKey;
}
async function createCheckoutSession(params) {
    var _a;
    if (!publicKey || !secretKey) {
        throw new Error("مفاتيح Tabby API غير معدة");
    }
    const requestBody = {
        payment: {
            amount: params.amount,
            currency: params.currency || "SAR",
            description: params.description || "",
            buyer: params.buyer,
            shipping_address: params.shipping_address,
            order: {
                reference_id: params.order_reference_id,
                items: params.items,
                tax_amount: params.tax_amount || "0",
                shipping_amount: params.shipping_amount || "0",
                discount_amount: params.discount_amount || "0",
            },
            buyer_history: params.buyer_history || {
                registered_since: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // قبل سنة
                loyalty_level: 5,
                order_count: 10,
                order_amount_total: "5000",
                is_phone_number_verified: true,
                is_email_verified: true,
            },
        },
        lang: "ar",
        merchant_code: params.merchant_code || "SA",
        merchant_urls: {
            success: params.success_url,
            cancel: params.cancel_url,
            failure: params.failure_url,
        },
    };
    const response = await fetch(`${TABBY_API_URL}/checkout`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secretKey}`,
        },
        body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Tabby API error:", errorData);
        throw new Error(((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.message) || `Tabby API error: ${response.status}`);
    }
    const result = await response.json();
    console.log("Tabby API response:", JSON.stringify(result, null, 2));
    return result;
}
/**
 * التقاط/تأكيد الدفع
 */
async function capturePayment(paymentId) {
    var _a;
    if (!secretKey) {
        throw new Error("مفتاح Tabby السري غير معد");
    }
    const response = await fetch(`${TABBY_API_URL}/payments/${paymentId}/captures`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secretKey}`,
        },
        body: JSON.stringify({}),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.message) || `Tabby capture error: ${response.status}`);
    }
    return response.json();
}
/**
 * الحصول على حالة الدفع
 */
async function getPaymentStatus(paymentId) {
    var _a;
    if (!secretKey) {
        throw new Error("مفتاح Tabby السري غير معد");
    }
    const response = await fetch(`${TABBY_API_URL}/payments/${paymentId}`, {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${secretKey}`,
        },
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.message) || `Tabby status error: ${response.status}`);
    }
    return response.json();
}
/**
 * استرجاع الدفع
 */
async function refundPayment(paymentId, amount) {
    var _a;
    if (!secretKey) {
        throw new Error("مفتاح Tabby السري غير معد");
    }
    const response = await fetch(`${TABBY_API_URL}/payments/${paymentId}/refunds`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${secretKey}`,
        },
        body: JSON.stringify({ amount }),
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(((_a = errorData.error) === null || _a === void 0 ? void 0 : _a.message) || `Tabby refund error: ${response.status}`);
    }
    return response.json();
}
//# sourceMappingURL=tabbyClient.js.map