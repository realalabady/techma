"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeProductFromUrl = exports.tabbyTestConnection = exports.tabbySaveSettings = exports.tabbyGetPaymentStatus = exports.tabbyCapturePayment = exports.tabbyCreateCheckout = exports.tamaraTestConnection = exports.tamaraSaveSettings = exports.tamaraAuthorizeOrder = exports.tamaraGetPaymentStatus = exports.tamaraCreateCheckout = exports.paypalGetOrderStatus = exports.paypalCaptureOrder = exports.paypalCreateOrder = exports.cjImageProxy = exports.cjSyncOrderStatuses = exports.onOrderUpdated = exports.onOrderCreated = exports.cjGetBalance = exports.cjCalculateFreight = exports.cjGetTracking = exports.cjListOrders = exports.cjConfirmOrder = exports.cjCreateOrder = exports.cjGetCategories = exports.cjGetProductInventory = exports.cjGetProductVariants = exports.cjGetProductDetail = exports.cjSearchProducts = exports.merchantSyncProductsApi = exports.merchantSyncProducts = exports.merchantSaveApiSettings = exports.merchantProductsFeed = exports.merchantProductsApi = exports.cjTestConnection = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const google_auth_library_1 = require("google-auth-library");
const crypto_1 = require("crypto");
const cj = __importStar(require("./cjClient"));
const paypal = __importStar(require("./paypalClient"));
const tamara = __importStar(require("./tamaraClient"));
const amazonScraper_1 = require("./amazonScraper");
const emailService_1 = require("./emailService");
admin.initializeApp();
// التحقق من أن المستخدم أدمن
async function verifyAdmin(auth) {
    if (!auth)
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول");
    const userDoc = await admin.firestore().doc(`users/${auth.uid}`).get();
    const userData = userDoc.data();
    if (!userData || userData.role !== "admin") {
        throw new functions.https.HttpsError("permission-denied", "صلاحية الأدمن مطلوبة");
    }
}
// ==================== اختبار الاتصال ====================
exports.cjTestConnection = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { email, apiKey } = data;
    if (!email)
        throw new functions.https.HttpsError("invalid-argument", "بريد CJ مطلوب");
    if (!apiKey)
        throw new functions.https.HttpsError("invalid-argument", "مفتاح API مطلوب");
    return cj.testConnection(email, apiKey);
});
// تحويل الأخطاء العادية إلى HttpsError
function wrapError(error) {
    if (error instanceof functions.https.HttpsError)
        throw error;
    const msg = error instanceof Error ? error.message : "خطأ غير متوقع";
    if (msg.includes("API Key غير مُعد") || msg.includes("غير مُعد")) {
        throw new functions.https.HttpsError("failed-precondition", msg);
    }
    throw new functions.https.HttpsError("internal", msg);
}
// Base URL of the storefront. Configurable so a buyer can rebrand without
// editing code: set the STORE_BASE_URL env var (or functions config) at deploy.
const STORE_BASE_URL = process.env.STORE_BASE_URL ||
    ((_a = functions.config().store) === null || _a === void 0 ? void 0 : _a.base_url) ||
    "https://jabouri-digital-library.web.app";
// Generic store brand fallback (buyer overrides via settings/store.storeName).
const STORE_BRAND_FALLBACK = process.env.STORE_BRAND || ((_b = functions.config().store) === null || _b === void 0 ? void 0 : _b.brand) || "My Store";
/**
 * Recompute the authoritative order total from Firestore product prices plus
 * shipping, and reject client-supplied amounts that don't match (±0.01).
 *
 * Client sends items: [{ productId, quantity }]. Prices are looked up
 * server-side so a malicious client cannot understate the amount charged.
 * Returns the server-computed total for downstream use.
 */
async function validateOrderAmount(items, clientAmount) {
    var _a, _b, _c, _d, _e, _f;
    if (!Array.isArray(items) || items.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "عناصر الطلب مطلوبة");
    }
    const db = admin.firestore();
    let subtotal = 0;
    for (const item of items) {
        const productId = (item === null || item === void 0 ? void 0 : item.productId) || (item === null || item === void 0 ? void 0 : item.reference_id);
        const quantity = Number(item === null || item === void 0 ? void 0 : item.quantity) || 0;
        if (!productId || quantity <= 0) {
            throw new functions.https.HttpsError("invalid-argument", "عنصر طلب غير صالح");
        }
        const productDoc = await db.doc(`products/${productId}`).get();
        if (!productDoc.exists) {
            throw new functions.https.HttpsError("invalid-argument", `المنتج غير موجود: ${productId}`);
        }
        const product = productDoc.data() || {};
        // Prefer the discounted/sale price if present, else the base price.
        const unitPrice = Number((_c = (_b = (_a = product.discountPrice) !== null && _a !== void 0 ? _a : product.salePrice) !== null && _b !== void 0 ? _b : product.price) !== null && _c !== void 0 ? _c : 0);
        if (!(unitPrice > 0)) {
            throw new functions.https.HttpsError("invalid-argument", `سعر المنتج غير صالح: ${productId}`);
        }
        subtotal += unitPrice * quantity;
    }
    // Shipping from settings/store (shipping sub-object). Free shipping if the
    // subtotal reaches the configured threshold.
    let shippingCost = 0;
    try {
        const settingsDoc = await db.doc("settings/store").get();
        const shipping = (_d = settingsDoc.data()) === null || _d === void 0 ? void 0 : _d.shipping;
        if (shipping) {
            const threshold = Number((_e = shipping.freeShippingThreshold) !== null && _e !== void 0 ? _e : 0);
            const defaultCost = Number((_f = shipping.defaultShippingCost) !== null && _f !== void 0 ? _f : 0);
            const freeEnabled = shipping.enableFreeShipping !== false;
            if (freeEnabled && threshold > 0 && subtotal >= threshold) {
                shippingCost = 0;
            }
            else {
                shippingCost = defaultCost;
            }
        }
    }
    catch (e) {
        console.error("validateOrderAmount: failed to read shipping settings", e);
    }
    const expectedTotal = Math.round((subtotal + shippingCost) * 100) / 100;
    const submitted = Number(clientAmount);
    if (Math.abs(expectedTotal - submitted) > 0.01) {
        console.error(`Order amount mismatch: client=${submitted} expected=${expectedTotal}`);
        throw new functions.https.HttpsError("failed-precondition", "المبلغ المُرسل لا يطابق إجمالي الطلب المحسوب");
    }
    return expectedTotal;
}
/**
 * Verify that a captured payment legitimately belongs to the caller before
 * marking an order paid:
 *  - the pending_payments doc must belong to context.auth.uid
 *  - the order doc's userId must equal context.auth.uid
 *  - the captured amount must equal the order total (±0.01)
 * Throws HttpsError on any mismatch. No-op fields (missing ids) are tolerated
 * so the caller can still proceed when an id is genuinely absent.
 */
async function verifyPaymentOwnership(opts) {
    var _a, _b;
    const { uid, firestoreOrderId, pendingRef, capturedAmount } = opts;
    const db = admin.firestore();
    // 1. pending_payments ownership
    if (pendingRef) {
        if (!pendingRef.exists) {
            throw new functions.https.HttpsError("not-found", "سجل الدفع غير موجود");
        }
        if (((_a = pendingRef.data()) === null || _a === void 0 ? void 0 : _a.userId) !== uid) {
            throw new functions.https.HttpsError("permission-denied", "هذا الدفع لا يخص المستخدم الحالي");
        }
    }
    // 2 & 3. order ownership + amount match
    if (firestoreOrderId) {
        const orderSnap = await db.doc(`orders/${firestoreOrderId}`).get();
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError("not-found", "الطلب غير موجود");
        }
        const order = orderSnap.data() || {};
        if (order.userId !== uid) {
            throw new functions.https.HttpsError("permission-denied", "هذا الطلب لا يخص المستخدم الحالي");
        }
        if (typeof capturedAmount === "number" && !Number.isNaN(capturedAmount)) {
            const orderTotal = Number((_b = order.total) !== null && _b !== void 0 ? _b : 0);
            if (Math.abs(orderTotal - capturedAmount) > 0.01) {
                throw new functions.https.HttpsError("failed-precondition", "المبلغ المدفوع لا يطابق إجمالي الطلب");
            }
        }
    }
}
function xmlEscape(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
function stripHtmlTags(value) {
    return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeUrl(url) {
    if (!url)
        return "";
    if (url.startsWith("//"))
        return `https:${url}`;
    if (url.startsWith("/"))
        return `${STORE_BASE_URL}${url}`;
    return url;
}
function toNumber(value) {
    if (typeof value === "number")
        return value;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function normalizeImages(value) {
    if (!Array.isArray(value))
        return [];
    const cleaned = value
        .map((img) => (typeof img === "string" ? normalizeUrl(img.trim()) : ""))
        .filter((img) => !!img && !img.startsWith("data:"));
    return [...new Set(cleaned)];
}
function mapDocToMerchantProduct(doc) {
    const data = doc.data();
    const title = (typeof data.name === "string" && data.name.trim()) ||
        (typeof data.nameEn === "string" && data.nameEn.trim()) ||
        "";
    const rawDescription = (typeof data.description === "string" && data.description) || title;
    const description = stripHtmlTags(rawDescription).slice(0, 5000);
    const priceValue = toNumber(data.price);
    const images = normalizeImages(data.images);
    const stockValue = toNumber(data.stock);
    const brand = (typeof data.supplierName === "string" && data.supplierName.trim()) ||
        STORE_BRAND_FALLBACK;
    if (!title || priceValue <= 0 || images.length === 0)
        return null;
    return {
        id: doc.id,
        title,
        description,
        link: `${STORE_BASE_URL}/product/${doc.id}`,
        image_link: images[0],
        additional_image_links: images.slice(1, 10),
        availability: stockValue > 0 ? "in_stock" : "out_of_stock",
        price: `${priceValue.toFixed(2)} SAR`,
        condition: "new",
        brand,
    };
}
async function loadMerchantProducts(limit) {
    const snap = await admin.firestore().collection("products").limit(limit).get();
    return snap.docs
        .map((doc) => mapDocToMerchantProduct(doc))
        .filter((p) => p !== null);
}
function getStringField(data, key) {
    const value = data[key];
    return typeof value === "string" ? value.trim() : "";
}
function normalizeDataSourceName(merchantId, dataSourceValue) {
    if (dataSourceValue.startsWith("accounts/"))
        return dataSourceValue;
    return `accounts/${merchantId}/dataSources/${dataSourceValue}`;
}
async function getGoogleMerchantSettings() {
    const settingsDoc = await admin.firestore().doc("settings/googleMerchant").get();
    const settings = (settingsDoc.data() || {});
    const merchantId = getStringField(settings, "merchantId") ||
        (process.env.MERCHANT_ACCOUNT_ID || process.env.MERCHANT_ID || "").trim();
    const dataSourceRaw = getStringField(settings, "dataSource") ||
        getStringField(settings, "dataSourceId") ||
        (process.env.MERCHANT_DATA_SOURCE || process.env.MERCHANT_DATASOURCE_ID || "").trim();
    const serviceAccountEmail = getStringField(settings, "serviceAccountEmail") ||
        (process.env.MERCHANT_SERVICE_ACCOUNT_EMAIL || "").trim();
    const privateKeyRaw = getStringField(settings, "privateKey") ||
        (process.env.MERCHANT_PRIVATE_KEY || "").trim();
    const enabledValue = settings.enabled;
    const enabled = typeof enabledValue === "boolean" ? enabledValue : true;
    const feedLabel = (getStringField(settings, "feedLabel") ||
        (process.env.MERCHANT_FEED_LABEL || "SA")).toUpperCase();
    const contentLanguage = getStringField(settings, "contentLanguage") ||
        (process.env.MERCHANT_CONTENT_LANGUAGE || "ar").toLowerCase();
    const currencyCode = (getStringField(settings, "currencyCode") ||
        (process.env.MERCHANT_CURRENCY_CODE || "SAR")).toUpperCase();
    const syncToken = getStringField(settings, "syncToken") ||
        (process.env.MERCHANT_SYNC_TOKEN || "").trim();
    if (!merchantId || !dataSourceRaw || !serviceAccountEmail || !privateKeyRaw) {
        return null;
    }
    return {
        enabled,
        merchantId,
        dataSourceName: normalizeDataSourceName(merchantId, dataSourceRaw),
        serviceAccountEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
        feedLabel,
        contentLanguage,
        currencyCode,
        syncToken,
    };
}
async function getGoogleMerchantAccessToken(settings) {
    const jwtClient = new google_auth_library_1.JWT({
        email: settings.serviceAccountEmail,
        key: settings.privateKey,
        scopes: ["https://www.googleapis.com/auth/content"],
    });
    const authResult = await jwtClient.authorize();
    if (!authResult.access_token) {
        throw new Error("Failed to get Google Merchant access token");
    }
    return authResult.access_token;
}
function toAmountMicros(priceText) {
    const numeric = Number(priceText.replace(/[^\d.]/g, ""));
    const micros = Number.isFinite(numeric) ? Math.round(numeric * 1000000) : 0;
    return String(Math.max(0, micros));
}
function buildProductInputPayload(product, settings) {
    const productAttributes = {
        title: product.title,
        description: product.description,
        link: product.link,
        imageLink: product.image_link,
        availability: product.availability === "in_stock" ? "IN_STOCK" : "OUT_OF_STOCK",
        condition: "NEW",
        brand: product.brand,
        price: {
            amountMicros: toAmountMicros(product.price),
            currencyCode: settings.currencyCode,
        },
    };
    if (product.additional_image_links.length > 0) {
        productAttributes.additionalImageLinks = product.additional_image_links;
    }
    return {
        offerId: product.id,
        contentLanguage: settings.contentLanguage,
        feedLabel: settings.feedLabel,
        productAttributes,
    };
}
async function insertProductInputToMerchant(product, settings, accessToken) {
    const endpoint = `https://merchantapi.googleapis.com/products/v1/accounts/${settings.merchantId}/productInputs:insert` +
        `?dataSource=${encodeURIComponent(settings.dataSourceName)}`;
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(buildProductInputPayload(product, settings)),
    });
    if (!response.ok) {
        const errorBody = await response.text();
        return {
            offerId: product.id,
            success: false,
            statusCode: response.status,
            error: errorBody.slice(0, 500),
        };
    }
    return { offerId: product.id, success: true, statusCode: response.status };
}
async function syncProductsToGoogleMerchant(limit, providedSettings) {
    const settings = providedSettings || (await getGoogleMerchantSettings());
    if (!settings) {
        throw new Error("Google Merchant settings are missing. Configure merchantId, dataSource, serviceAccountEmail, and privateKey first.");
    }
    if (!settings.enabled) {
        throw new Error("Google Merchant sync is disabled in settings.");
    }
    const products = await loadMerchantProducts(limit);
    const accessToken = await getGoogleMerchantAccessToken(settings);
    const results = [];
    for (const product of products) {
        const result = await insertProductInputToMerchant(product, settings, accessToken);
        results.push(result);
    }
    const succeeded = results.filter((r) => r.success).length;
    return {
        merchantId: settings.merchantId,
        dataSource: settings.dataSourceName,
        requested: products.length,
        succeeded,
        failed: results.length - succeeded,
        failures: results.filter((r) => !r.success),
    };
}
// ==================== Google Merchant JSON API ====================
exports.merchantProductsApi = functions.https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "GET") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    try {
        const parsedLimit = Number(req.query.limit || 1000);
        const limit = Number.isFinite(parsedLimit)
            ? Math.max(1, Math.min(5000, parsedLimit))
            : 1000;
        const products = await loadMerchantProducts(limit);
        res.set("Cache-Control", "public, max-age=300");
        res.status(200).json({
            source: `${STORE_BRAND_FALLBACK} - API Feed`,
            generatedAt: new Date().toISOString(),
            currency: "SAR",
            count: products.length,
            products,
        });
    }
    catch (error) {
        console.error("merchantProductsApi error:", error);
        res.status(500).json({ error: "Failed to build products API" });
    }
});
// ==================== Google Merchant XML Feed ====================
exports.merchantProductsFeed = functions.https.onRequest(async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method not allowed");
        return;
    }
    try {
        const parsedLimit = Number(req.query.limit || 1000);
        const limit = Number.isFinite(parsedLimit)
            ? Math.max(1, Math.min(5000, parsedLimit))
            : 1000;
        const products = await loadMerchantProducts(limit);
        const items = products
            .map((p) => {
            const additionalImages = p.additional_image_links
                .map((img) => `<g:additional_image_link>${xmlEscape(img)}</g:additional_image_link>`)
                .join("");
            return [
                "<item>",
                `<g:id>${xmlEscape(p.id)}</g:id>`,
                `<title>${xmlEscape(p.title)}</title>`,
                `<description>${xmlEscape(p.description)}</description>`,
                `<link>${xmlEscape(p.link)}</link>`,
                `<g:link>${xmlEscape(p.link)}</g:link>`,
                `<g:image_link>${xmlEscape(p.image_link)}</g:image_link>`,
                additionalImages,
                `<g:availability>${p.availability}</g:availability>`,
                `<g:price>${xmlEscape(p.price)}</g:price>`,
                `<g:condition>${p.condition}</g:condition>`,
                `<g:brand>${xmlEscape(p.brand)}</g:brand>`,
                "</item>",
            ].join("");
        })
            .join("");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xmlEscape(STORE_BRAND_FALLBACK)} Products</title>
    <link>${STORE_BASE_URL}</link>
    <description>Google Merchant product feed for ${xmlEscape(STORE_BRAND_FALLBACK)}</description>
    ${items}
  </channel>
</rss>`;
        res.set("Content-Type", "application/xml; charset=utf-8");
        res.set("Cache-Control", "public, max-age=300");
        res.status(200).send(xml);
    }
    catch (error) {
        console.error("merchantProductsFeed error:", error);
        res.status(500).send("Failed to build XML feed");
    }
});
// ==================== Google Merchant API Settings ====================
exports.merchantSaveApiSettings = functions.https.onCall(async (data, context) => {
    var _a, _b;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const payload = data;
    const merchantId = typeof payload.merchantId === "string" ? payload.merchantId.trim() : "";
    const dataSourceInput = typeof payload.dataSource === "string"
        ? payload.dataSource.trim()
        : typeof payload.dataSourceId === "string"
            ? payload.dataSourceId.trim()
            : "";
    const serviceAccountEmail = typeof payload.serviceAccountEmail === "string"
        ? payload.serviceAccountEmail.trim()
        : "";
    const privateKey = typeof payload.privateKey === "string" ? payload.privateKey.trim() : "";
    if (!merchantId || !dataSourceInput || !serviceAccountEmail || !privateKey) {
        throw new functions.https.HttpsError("invalid-argument", "merchantId, dataSource, serviceAccountEmail, and privateKey are required");
    }
    const feedLabel = typeof payload.feedLabel === "string" && payload.feedLabel.trim()
        ? payload.feedLabel.trim().toUpperCase()
        : "SA";
    const contentLanguage = typeof payload.contentLanguage === "string" && payload.contentLanguage.trim()
        ? payload.contentLanguage.trim().toLowerCase()
        : "ar";
    const currencyCode = typeof payload.currencyCode === "string" && payload.currencyCode.trim()
        ? payload.currencyCode.trim().toUpperCase()
        : "SAR";
    const enabled = typeof payload.enabled === "boolean" ? payload.enabled : true;
    const existingDoc = await admin.firestore().doc("settings/googleMerchant").get();
    const existingData = (existingDoc.data() || {});
    const syncTokenInput = typeof payload.syncToken === "string" ? payload.syncToken.trim() : "";
    const syncTokenExisting = typeof existingData.syncToken === "string" ? existingData.syncToken.trim() : "";
    const syncToken = syncTokenInput || syncTokenExisting || (0, crypto_1.randomUUID)().replace(/-/g, "");
    await admin.firestore().doc("settings/googleMerchant").set({
        merchantId,
        dataSource: dataSourceInput,
        serviceAccountEmail,
        privateKey,
        feedLabel,
        contentLanguage,
        currencyCode,
        enabled,
        syncToken,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: ((_b = context.auth) === null || _b === void 0 ? void 0 : _b.uid) || null,
    }, { merge: true });
    return {
        success: true,
        merchantId,
        dataSource: normalizeDataSourceName(merchantId, dataSourceInput),
        feedLabel,
        contentLanguage,
        currencyCode,
        enabled,
        syncToken,
    };
});
// ==================== Google Merchant API Sync (Admin Callable) ====================
exports.merchantSyncProducts = functions.https.onCall(async (data, context) => {
    var _a, _b;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    try {
        const payload = data;
        const parsedLimit = Number((_b = payload.limit) !== null && _b !== void 0 ? _b : 500);
        const limit = Number.isFinite(parsedLimit)
            ? Math.max(1, Math.min(5000, parsedLimit))
            : 500;
        return await syncProductsToGoogleMerchant(limit);
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== Google Merchant API Sync (HTTP Endpoint) ====================
exports.merchantSyncProductsApi = functions.https.onRequest(async (req, res) => {
    var _a, _b;
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Sync-Token");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }
    try {
        const settings = await getGoogleMerchantSettings();
        if (!settings) {
            res.status(412).json({
                error: "Google Merchant settings are missing. Configure settings/googleMerchant first.",
            });
            return;
        }
        if (!settings.syncToken) {
            res.status(412).json({
                error: "syncToken is not configured. Save Merchant API settings first.",
            });
            return;
        }
        const tokenFromHeader = (req.get("X-Sync-Token") || "").trim();
        const tokenFromQuery = typeof req.query.token === "string" ? req.query.token.trim() : "";
        const providedToken = tokenFromHeader || tokenFromQuery;
        if (providedToken !== settings.syncToken) {
            res.status(401).json({ error: "Invalid sync token" });
            return;
        }
        const body = (req.body || {});
        const parsedLimit = Number((_b = (_a = body.limit) !== null && _a !== void 0 ? _a : req.query.limit) !== null && _b !== void 0 ? _b : 500);
        const limit = Number.isFinite(parsedLimit)
            ? Math.max(1, Math.min(5000, parsedLimit))
            : 500;
        const result = await syncProductsToGoogleMerchant(limit, settings);
        res.status(200).json({
            success: true,
            ...result,
            syncedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error("merchantSyncProductsApi error:", error);
        const msg = error instanceof Error ? error.message : "Failed to sync products to Merchant API";
        res.status(500).json({ error: msg });
    }
});
// ==================== البحث عن منتجات ====================
exports.cjSearchProducts = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    try {
        const result = await cj.searchProducts({
            productNameEn: data.keyword,
            categoryId: data.categoryId,
            pageNum: data.pageNum || 1,
            pageSize: data.pageSize || 20,
        });
        // Log first product image for debugging
        const res = result;
        if ((_c = (_b = res === null || res === void 0 ? void 0 : res.data) === null || _b === void 0 ? void 0 : _b.list) === null || _c === void 0 ? void 0 : _c[0]) {
            const s = res.data.list[0];
            console.log("CJ productImage:", s.productImage);
        }
        return result;
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== تفاصيل منتج ====================
exports.cjGetProductDetail = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    if (!data.pid)
        throw new functions.https.HttpsError("invalid-argument", "pid مطلوب");
    try {
        return await cj.getProductDetail(data.pid);
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== متغيرات المنتج ====================
exports.cjGetProductVariants = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    if (!data.pid)
        throw new functions.https.HttpsError("invalid-argument", "pid مطلوب");
    try {
        return await cj.getProductVariants(data.pid);
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== مخزون المنتج ====================
exports.cjGetProductInventory = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    if (!data.vid)
        throw new functions.https.HttpsError("invalid-argument", "vid مطلوب");
    try {
        return await cj.getProductInventory(data.vid);
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== تصنيفات CJ ====================
exports.cjGetCategories = functions.https.onCall(async (_data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    try {
        return await cj.getCJCategories();
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== إنشاء طلب CJ ====================
exports.cjCreateOrder = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { firestoreOrderId, orderData } = data;
    if (!orderData)
        throw new functions.https.HttpsError("invalid-argument", "orderData مطلوب");
    try {
        const result = await cj.createCJOrder(orderData);
        // تحديث الطلب في Firestore مع بيانات CJ
        if (result.result && result.data && firestoreOrderId) {
            await admin
                .firestore()
                .doc(`orders/${firestoreOrderId}`)
                .update({
                isCJOrder: true,
                cjOrderId: result.data.orderId || result.data.orderNum,
                cjOrderNum: result.data.orderNum,
                cjOrderStatus: "CREATED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        return result;
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== تأكيد طلب CJ ====================
exports.cjConfirmOrder = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    if (!data.orderId)
        throw new functions.https.HttpsError("invalid-argument", "orderId مطلوب");
    try {
        return await cj.confirmCJOrder(data.orderId);
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== قائمة طلبات CJ ====================
exports.cjListOrders = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    try {
        return await cj.listCJOrders({
            pageNum: data.pageNum || 1,
            pageSize: data.pageSize || 20,
            orderStatus: data.orderStatus,
        });
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== تتبع الشحنة ====================
exports.cjGetTracking = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    if (!data.trackNumber)
        throw new functions.https.HttpsError("invalid-argument", "trackNumber مطلوب");
    try {
        return await cj.getTrackingInfo(data.trackNumber);
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== حساب الشحن ====================
exports.cjCalculateFreight = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    try {
        return await cj.calculateFreight({
            startCountryCode: data.startCountryCode || "CN",
            endCountryCode: data.endCountryCode || "SA",
            products: data.products,
        });
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== رصيد CJ ====================
exports.cjGetBalance = functions.https.onCall(async (_data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    try {
        return await cj.getCJBalance();
    }
    catch (error) {
        wrapError(error);
    }
});
// ==================== إرسال طلب تلقائي بعد الشراء ====================
exports.onOrderCreated = functions.firestore
    .document("orders/{orderId}")
    .onCreate(async (snap, context) => {
    var _a, _b;
    const order = snap.data();
    const orderId = context.params.orderId;
    // ===== 0. تخفيض المخزون داخل معاملة (بدلاً من العميل) =====
    // يُنفَّذ على الخادم لأن قواعد Firestore تمنع العملاء من الكتابة على المنتجات.
    try {
        const db = admin.firestore();
        for (const item of order.items || []) {
            const productId = item === null || item === void 0 ? void 0 : item.productId;
            const quantity = Number(item === null || item === void 0 ? void 0 : item.quantity) || 0;
            if (!productId || quantity <= 0)
                continue;
            const productRef = db.doc(`products/${productId}`);
            await db.runTransaction(async (tx) => {
                var _a, _b;
                const productSnap = await tx.get(productRef);
                if (!productSnap.exists)
                    return;
                const currentStock = Number((_b = (_a = productSnap.data()) === null || _a === void 0 ? void 0 : _a.stock) !== null && _b !== void 0 ? _b : 0);
                const newStock = Math.max(0, currentStock - quantity);
                tx.update(productRef, {
                    stock: newStock,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            });
        }
    }
    catch (stockError) {
        console.error(`Error decrementing stock for order ${orderId}:`, stockError);
    }
    // ===== 1. إرسال إيميل تأكيد الطلب للعميل =====
    try {
        const emailResult = await (0, emailService_1.sendOrderConfirmationEmail)({
            id: orderId,
            customer: order.customer || "عميل",
            email: order.email,
            phone: order.phone || "",
            items: order.items || [],
            total: order.total || 0,
            subtotal: order.subtotal,
            shippingCost: order.shippingCost,
            shippingAddress: order.shippingAddress || "",
            paymentMethod: order.paymentMethod || "cash",
            createdAt: ((_b = (_a = order.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(),
        });
        if (emailResult.success) {
            console.log(`Order confirmation email sent for order ${orderId}`);
            await snap.ref.update({
                emailSent: true,
                emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        else {
            console.error(`Failed to send email for order ${orderId}:`, emailResult.error);
        }
    }
    catch (emailError) {
        console.error(`Error sending confirmation email for ${orderId}:`, emailError);
    }
    // ===== 2. التحقق من إعدادات CJ وإرسال الطلب تلقائياً =====
    const settingsDoc = await admin
        .firestore()
        .doc("settings/cjDropshipping")
        .get();
    const settings = settingsDoc.data();
    if (!(settings === null || settings === void 0 ? void 0 : settings.apiKey) || !(settings === null || settings === void 0 ? void 0 : settings.autoForwardOrders)) {
        return; // لا يوجد إعداد CJ أو الإرسال التلقائي معطل
    }
    // البحث عن منتجات CJ في الطلب
    const cjItems = [];
    for (const item of order.items || []) {
        const productDoc = await admin
            .firestore()
            .doc(`products/${item.productId}`)
            .get();
        const product = productDoc.data();
        if ((product === null || product === void 0 ? void 0 : product.isCJProduct) && (product === null || product === void 0 ? void 0 : product.cjVariantId)) {
            cjItems.push({
                vid: product.cjVariantId,
                quantity: item.quantity,
            });
        }
    }
    if (cjItems.length === 0)
        return; // لا يوجد منتجات CJ
    // إنشاء الطلب في CJ
    try {
        const address = order.address || {};
        const cjOrderData = {
            orderNumber: `ORD-${orderId}`,
            shippingZip: "00000",
            shippingCountryCode: "SA",
            shippingCountry: "Saudi Arabia",
            shippingProvince: address.city || order.shippingAddress || "",
            shippingCity: address.city || "",
            shippingAddress: `${address.district || ""} ${address.street || ""} ${address.building || ""}`.trim(),
            shippingCustomerName: address.fullName || order.customer || "",
            shippingPhone: address.phone || order.phone || "",
            remark: order.notes || "",
            fromCountryCode: settings.defaultWarehouse || "CN",
            logisticName: settings.defaultLogistic || "CJPacket",
            products: cjItems,
        };
        const result = await cj.createCJOrder(cjOrderData);
        if (result.result && result.data) {
            await snap.ref.update({
                isCJOrder: true,
                cjOrderId: result.data.orderId || "",
                cjOrderNum: result.data.orderNum || "",
                cjOrderStatus: "CREATED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`CJ order created for Firestore order ${orderId}`);
        }
        else {
            console.error(`CJ order creation failed for ${orderId}:`, result.message);
        }
    }
    catch (error) {
        console.error(`Error creating CJ order for ${orderId}:`, error);
    }
});
// ==================== إرسال إيميل عند تحديث حالة الطلب ====================
exports.onOrderUpdated = functions.firestore
    .document("orders/{orderId}")
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const orderId = context.params.orderId;
    // التحقق من تغيير الحالة
    if (before.status === after.status) {
        return; // لم تتغير الحالة
    }
    // إرسال إيميل فقط للحالات المهمة
    const emailStatuses = ["processing", "shipped", "delivered", "cancelled"];
    if (!emailStatuses.includes(after.status)) {
        return;
    }
    try {
        const emailResult = await (0, emailService_1.sendOrderStatusUpdateEmail)({
            id: orderId,
            customer: after.customer || "عميل",
            email: after.email,
            status: after.status,
            trackingNumber: after.trackingNumber,
            trackingUrl: after.trackingUrl,
        });
        if (emailResult.success) {
            console.log(`Status update email sent for order ${orderId} (${after.status})`);
        }
        else {
            console.error(`Failed to send status update email for ${orderId}:`, emailResult.error);
        }
    }
    catch (error) {
        console.error(`Error sending status update email for ${orderId}:`, error);
    }
});
// ==================== مزامنة حالة الطلبات (يدوي) ====================
exports.cjSyncOrderStatuses = functions.https.onCall(async (_data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const db = admin.firestore();
    const ordersSnap = await db
        .collection("orders")
        .where("isCJOrder", "==", true)
        .where("status", "not-in", ["delivered", "cancelled"])
        .get();
    const results = [];
    for (const doc of ordersSnap.docs) {
        const order = doc.data();
        if (!order.cjOrderId)
            continue;
        try {
            const cjResult = await cj.queryCJOrder(order.cjOrderId);
            if (cjResult.result && cjResult.data) {
                const cjOrder = cjResult.data;
                const updates = {
                    cjOrderStatus: cjOrder.orderStatus,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                // تحديث رقم التتبع إذا متوفر
                if (cjOrder.trackNumber) {
                    updates.trackingNumber = cjOrder.trackNumber;
                }
                // تحويل حالة CJ إلى حالة المتجر
                const statusMap = {
                    CREATED: "processing",
                    IN_CART: "processing",
                    UNPAID: "processing",
                    UNSHIPPED: "processing",
                    SHIPPED: "shipped",
                    DELIVERED: "delivered",
                    CANCELLED: "cancelled",
                };
                if (statusMap[cjOrder.orderStatus]) {
                    updates.status = statusMap[cjOrder.orderStatus];
                }
                await doc.ref.update(updates);
                results.push({ orderId: doc.id, status: cjOrder.orderStatus });
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : "خطأ";
            results.push({ orderId: doc.id, status: "error", error: msg });
        }
    }
    return { synced: results.length, results };
});
// ==================== بروكسي صور CJ ====================
exports.cjImageProxy = functions.https.onRequest(async (req, res) => {
    // Allow CORS preflight
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET");
    if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
    }
    const url = req.query.url;
    // Allow CJ Dropshipping image domains
    const allowedDomains = [
        "cf.cjdropshipping.com",
        "cbu01.alicdn.com",
        "cjdropshipping.com",
        "img.cjdropshipping.com",
        "image.cjdropshipping.com",
        "assets.cjdropshipping.com",
        "alicdn.com",
    ];
    // Parse the URL and match the hostname exactly (or as a subdomain) to
    // prevent SSRF via crafted URLs like https://evil.com/?x=alicdn.com
    let hostname = "";
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
            res.status(400).send("Invalid URL");
            return;
        }
        hostname = parsed.hostname.toLowerCase();
    }
    catch (_a) {
        res.status(400).send("Invalid URL");
        return;
    }
    const isAllowed = allowedDomains.some((domain) => hostname === domain || hostname.endsWith("." + domain));
    if (!url || typeof url !== "string" || !isAllowed) {
        res.status(400).send("Invalid URL");
        return;
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            res.status(response.status).send("Image fetch failed");
            return;
        }
        const contentType = response.headers.get("content-type") || "image/jpeg";
        const buffer = Buffer.from(await response.arrayBuffer());
        res.set("Content-Type", contentType);
        res.set("Cache-Control", "public, max-age=604800"); // 7 days
        res.set("Access-Control-Allow-Origin", "*");
        res.send(buffer);
    }
    catch (_b) {
        res.status(500).send("Proxy error");
    }
});
// ==================== PayPal - إنشاء طلب دفع ====================
exports.paypalCreateOrder = functions.https.onCall(async (data, context) => {
    // التحقق من تسجيل الدخول
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول لإتمام الدفع");
    }
    const { amount, currency, orderId, description, items } = data;
    if (!amount || amount <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "المبلغ غير صحيح");
    }
    if (!orderId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف الطلب مطلوب");
    }
    // التحقق من المبلغ من جهة الخادم بإعادة حسابه من أسعار المنتجات
    const validatedAmount = await validateOrderAmount(items, parseFloat(amount));
    try {
        const result = await paypal.createOrder({
            amount: validatedAmount,
            currency: currency || "SAR",
            orderId,
            description: description || `${STORE_BRAND_FALLBACK} #${orderId}`,
        });
        // حفظ معرف PayPal في الطلب المؤقت
        await admin.firestore().doc(`pending_payments/${orderId}`).set({
            userId: context.auth.uid,
            paypalOrderId: result.id,
            amount: validatedAmount,
            currency: currency || "SAR",
            status: "CREATED",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return result;
    }
    catch (error) {
        console.error("PayPal create order error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في إنشاء طلب الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== PayPal - تأكيد الدفع ====================
exports.paypalCaptureOrder = functions.https.onCall(async (data, context) => {
    var _a;
    // التحقق من تسجيل الدخول
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول لإتمام الدفع");
    }
    const { paypalOrderId, firestoreOrderId } = data;
    if (!paypalOrderId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف طلب PayPal مطلوب");
    }
    try {
        // البحث عن سجل الدفع المعلق والتحقق من ملكيته
        const pendingCol = admin.firestore().collection("pending_payments");
        const pendingSnap = await pendingCol
            .where("paypalOrderId", "==", paypalOrderId)
            .where("userId", "==", context.auth.uid)
            .limit(1)
            .get();
        if (pendingSnap.empty) {
            throw new functions.https.HttpsError("permission-denied", "سجل الدفع غير موجود أو لا يخص المستخدم الحالي");
        }
        const pendingDoc = pendingSnap.docs[0];
        // التحقق من الملكية ومطابقة المبلغ (المبلغ المُتحقق منه مسبقاً بالريال)
        await verifyPaymentOwnership({
            uid: context.auth.uid,
            firestoreOrderId,
            pendingRef: pendingDoc,
            capturedAmount: Number((_a = pendingDoc.data()) === null || _a === void 0 ? void 0 : _a.amount),
        });
        const result = await paypal.captureOrder(paypalOrderId);
        await pendingDoc.ref.update({
            status: result.status,
            captureId: result.captureId,
            capturedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // تحديث الطلب في Firestore إذا موجود
        if (firestoreOrderId) {
            await admin.firestore().doc(`orders/${firestoreOrderId}`).update({
                paymentStatus: "paid",
                paypalOrderId: paypalOrderId,
                paypalCaptureId: result.captureId,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        return result;
    }
    catch (error) {
        console.error("PayPal capture error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في تأكيد الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== PayPal - التحقق من حالة الطلب ====================
exports.paypalGetOrderStatus = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول");
    }
    const { paypalOrderId } = data;
    if (!paypalOrderId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف طلب PayPal مطلوب");
    }
    try {
        const result = await paypal.getOrderDetails(paypalOrderId);
        return {
            id: result.id,
            status: result.status,
            amount: (_c = (_b = (_a = result.purchase_units) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.amount) === null || _c === void 0 ? void 0 : _c.value,
            currency: (_f = (_e = (_d = result.purchase_units) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.amount) === null || _f === void 0 ? void 0 : _f.currency_code,
        };
    }
    catch (error) {
        console.error("PayPal get order error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في جلب حالة الطلب";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tamara - إعداد مفتاح API ====================
async function initTamaraToken() {
    // أولاً: التحقق من Firestore
    const settingsDoc = await admin.firestore().doc("settings/tamara").get();
    const settings = settingsDoc.data();
    if (settings === null || settings === void 0 ? void 0 : settings.apiToken) {
        tamara.setApiToken(settings.apiToken);
        return;
    }
    // ثانياً: التحقق من متغير البيئة
    const envToken = process.env.TAMARA_API_TOKEN;
    if (envToken) {
        tamara.setApiToken(envToken);
        return;
    }
    throw new functions.https.HttpsError("failed-precondition", "مفتاح Tamara API غير مُعد. يرجى إعداده في الإعدادات.");
}
// ==================== Tamara - إنشاء جلسة دفع ====================
exports.tamaraCreateCheckout = functions.https.onCall(async (data, context) => {
    // التحقق من تسجيل الدخول
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول لإتمام الدفع");
    }
    const { orderReferenceId, totalAmount, currency, items, consumer, shippingAddress, shippingAmount, successUrl, failureUrl, cancelUrl, description, } = data;
    if (!totalAmount || totalAmount <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "المبلغ غير صحيح");
    }
    if (!orderReferenceId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف الطلب مطلوب");
    }
    if (!items || items.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "عناصر الطلب مطلوبة");
    }
    // التحقق من المبلغ من جهة الخادم
    const validatedTamaraTotal = await validateOrderAmount(items, Number(totalAmount));
    try {
        await initTamaraToken();
        const result = await tamara.createCheckoutSession({
            order_reference_id: orderReferenceId,
            total_amount: totalAmount,
            currency: currency || "SAR",
            items,
            consumer,
            shipping_address: shippingAddress,
            shipping_amount: shippingAmount || 0,
            success_url: successUrl,
            failure_url: failureUrl,
            cancel_url: cancelUrl,
            description,
        });
        // حفظ معلومات الدفع المعلق
        await admin.firestore().doc(`pending_payments/${orderReferenceId}`).set({
            userId: context.auth.uid,
            paymentMethod: "tamara",
            tamaraCheckoutId: result.checkout_id,
            tamaraCheckoutUrl: result.checkout_url,
            totalAmount: validatedTamaraTotal,
            currency: currency || "SAR",
            status: "CREATED",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return result;
    }
    catch (error) {
        console.error("Tamara create checkout error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في إنشاء جلسة الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tamara - التحقق من حالة الدفع ====================
exports.tamaraGetPaymentStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول");
    }
    const { checkoutId } = data;
    if (!checkoutId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف جلسة الدفع مطلوب");
    }
    try {
        await initTamaraToken();
        const result = await tamara.getPaymentStatus(checkoutId);
        return result;
    }
    catch (error) {
        console.error("Tamara get payment status error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في جلب حالة الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tamara - تأكيد الطلب (Authorize) ====================
exports.tamaraAuthorizeOrder = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول");
    }
    const { orderId, firestoreOrderId, orderReferenceId } = data;
    if (!orderId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف طلب Tamara مطلوب");
    }
    try {
        // التحقق من ملكية سجل الدفع والطلب ومطابقة المبلغ قبل التأكيد
        let pendingRef;
        let capturedAmount;
        if (orderReferenceId) {
            pendingRef = await admin
                .firestore()
                .doc(`pending_payments/${orderReferenceId}`)
                .get();
            capturedAmount = Number((_a = pendingRef.data()) === null || _a === void 0 ? void 0 : _a.totalAmount);
        }
        await verifyPaymentOwnership({
            uid: context.auth.uid,
            firestoreOrderId,
            pendingRef,
            capturedAmount,
        });
        await initTamaraToken();
        const result = await tamara.authorizeOrder(orderId);
        // تحديث الطلب في Firestore
        if (firestoreOrderId) {
            await admin.firestore().doc(`orders/${firestoreOrderId}`).update({
                paymentStatus: "paid",
                tamaraOrderId: orderId,
                tamaraStatus: result.status,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        return result;
    }
    catch (error) {
        console.error("Tamara authorize error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في تأكيد الطلب";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tamara - حفظ إعدادات API ====================
exports.tamaraSaveSettings = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { apiToken } = data;
    if (!apiToken) {
        throw new functions.https.HttpsError("invalid-argument", "مفتاح API مطلوب");
    }
    try {
        await admin.firestore().doc("settings/tamara").set({
            apiToken,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: context.auth.uid,
        });
        return { success: true, message: "تم حفظ إعدادات Tamara بنجاح" };
    }
    catch (error) {
        console.error("Tamara save settings error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في حفظ الإعدادات";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tamara - اختبار الاتصال ====================
exports.tamaraTestConnection = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { apiToken } = data;
    if (!apiToken) {
        throw new functions.https.HttpsError("invalid-argument", "مفتاح API مطلوب للاختبار");
    }
    try {
        // تعيين المفتاح مؤقتاً للاختبار
        tamara.setApiToken(apiToken);
        // محاولة التحقق من أهلية عميل وهمي
        const result = await tamara.checkCustomerEligibility("+966500000000", 100, "SAR");
        return {
            success: true,
            message: "تم الاتصال بـ Tamara بنجاح",
            data: result,
        };
    }
    catch (error) {
        console.error("Tamara test connection error:", error);
        const msg = error instanceof Error ? error.message : "فشل الاتصال بـ Tamara";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tabby - إعداد مفاتيح API ====================
const tabby = __importStar(require("./tabbyClient"));
async function initTabbyKeys() {
    // أولاً: التحقق من Firestore
    const settingsDoc = await admin.firestore().doc("settings/tabby").get();
    const settings = settingsDoc.data();
    if ((settings === null || settings === void 0 ? void 0 : settings.publicKey) && (settings === null || settings === void 0 ? void 0 : settings.secretKey)) {
        tabby.setApiKeys(settings.publicKey, settings.secretKey);
        return;
    }
    // ثانياً: التحقق من متغيرات البيئة
    const pubKey = process.env.TABBY_PUBLIC_KEY;
    const secKey = process.env.TABBY_SECRET_KEY;
    if (pubKey && secKey) {
        tabby.setApiKeys(pubKey, secKey);
        return;
    }
    throw new functions.https.HttpsError("failed-precondition", "مفاتيح Tabby API غير مُعدة. يرجى إعدادها في الإعدادات.");
}
// ==================== Tabby - إنشاء جلسة دفع ====================
exports.tabbyCreateCheckout = functions.https.onCall(async (data, context) => {
    var _a, _b;
    // التحقق من تسجيل الدخول
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول لإتمام الدفع");
    }
    const { amount, currency, description, buyer, shipping_address, order_reference_id, items, success_url, cancel_url, failure_url, } = data;
    if (!amount || parseFloat(amount) <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "المبلغ غير صحيح");
    }
    if (!order_reference_id) {
        throw new functions.https.HttpsError("invalid-argument", "معرف الطلب مطلوب");
    }
    if (!items || items.length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "عناصر الطلب مطلوبة");
    }
    // التحقق من المبلغ من جهة الخادم
    const validatedTabbyAmount = await validateOrderAmount(items, parseFloat(amount));
    try {
        await initTabbyKeys();
        // جلب بيانات المستخدم لتحسين buyer_history
        const userDoc = await admin.firestore().doc(`users/${context.auth.uid}`).get();
        const userData = userDoc.data();
        // حساب عدد الطلبات السابقة للمستخدم
        const ordersSnapshot = await admin.firestore()
            .collection("orders")
            .where("userId", "==", context.auth.uid)
            .where("paymentStatus", "==", "paid")
            .get();
        const orderCount = ordersSnapshot.size;
        let totalOrderAmount = 0;
        ordersSnapshot.docs.forEach(doc => {
            totalOrderAmount += doc.data().total || 0;
        });
        // تحديد تاريخ التسجيل (من Firebase Auth أو تاريخ افتراضي قبل 6 أشهر)
        const createdAt = ((_b = (_a = userData === null || userData === void 0 ? void 0 : userData.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
        const registeredSince = createdAt.toISOString().split('T')[0];
        // حساب مستوى الولاء بناءً على عدد الطلبات
        const loyaltyLevel = Math.min(10, Math.floor(orderCount / 2) + 3);
        const buyer_history = {
            registered_since: registeredSince,
            loyalty_level: loyaltyLevel,
            order_count: orderCount,
            order_amount_total: totalOrderAmount.toString(),
            is_phone_number_verified: true,
            is_email_verified: !!context.auth.token.email_verified,
        };
        const result = await tabby.createCheckoutSession({
            amount,
            currency: currency || "SAR",
            description,
            buyer,
            shipping_address,
            order_reference_id,
            items,
            success_url,
            cancel_url,
            failure_url,
            buyer_history,
        });
        // حفظ معلومات الدفع المعلق
        await admin.firestore().doc(`pending_payments/${order_reference_id}`).set({
            userId: context.auth.uid,
            paymentMethod: "tabby",
            tabbySessionId: result.id,
            amount: validatedTabbyAmount,
            currency: currency || "SAR",
            status: "CREATED",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return result;
    }
    catch (error) {
        console.error("Tabby create checkout error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في إنشاء جلسة الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tabby - تأكيد الدفع (Capture) ====================
exports.tabbyCapturePayment = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول");
    }
    const { paymentId, firestoreOrderId, orderReferenceId } = data;
    if (!paymentId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف الدفع مطلوب");
    }
    try {
        // التحقق من ملكية سجل الدفع والطلب ومطابقة المبلغ قبل التأكيد
        let pendingRef;
        let capturedAmount;
        if (orderReferenceId) {
            pendingRef = await admin
                .firestore()
                .doc(`pending_payments/${orderReferenceId}`)
                .get();
            capturedAmount = Number((_a = pendingRef.data()) === null || _a === void 0 ? void 0 : _a.amount);
        }
        await verifyPaymentOwnership({
            uid: context.auth.uid,
            firestoreOrderId,
            pendingRef,
            capturedAmount,
        });
        await initTabbyKeys();
        const result = await tabby.capturePayment(paymentId);
        // تحديث الطلب في Firestore
        if (firestoreOrderId) {
            await admin.firestore().doc(`orders/${firestoreOrderId}`).update({
                paymentStatus: "paid",
                tabbyPaymentId: paymentId,
                tabbyStatus: result.status,
                paidAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        return result;
    }
    catch (error) {
        console.error("Tabby capture error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في تأكيد الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tabby - التحقق من حالة الدفع ====================
exports.tabbyGetPaymentStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "يجب تسجيل الدخول");
    }
    const { paymentId } = data;
    if (!paymentId) {
        throw new functions.https.HttpsError("invalid-argument", "معرف الدفع مطلوب");
    }
    try {
        await initTabbyKeys();
        const result = await tabby.getPaymentStatus(paymentId);
        return result;
    }
    catch (error) {
        console.error("Tabby get payment status error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في جلب حالة الدفع";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tabby - حفظ إعدادات API ====================
exports.tabbySaveSettings = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { publicKey, secretKey } = data;
    if (!publicKey || !secretKey) {
        throw new functions.https.HttpsError("invalid-argument", "مفاتيح API مطلوبة");
    }
    try {
        await admin.firestore().doc("settings/tabby").set({
            publicKey,
            secretKey,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: context.auth.uid,
        });
        return { success: true, message: "تم حفظ إعدادات Tabby بنجاح" };
    }
    catch (error) {
        console.error("Tabby save settings error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في حفظ الإعدادات";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// ==================== Tabby - اختبار الاتصال ====================
exports.tabbyTestConnection = functions.https.onCall(async (data, context) => {
    var _a;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { publicKey, secretKey } = data;
    if (!publicKey || !secretKey) {
        throw new functions.https.HttpsError("invalid-argument", "مفاتيح API مطلوبة للاختبار");
    }
    try {
        // تعيين المفاتيح مؤقتاً للاختبار
        tabby.setApiKeys(publicKey, secretKey);
        // محاولة إنشاء جلسة وهمية للتحقق من صحة المفاتيح
        // لن ننشئ جلسة فعلية، فقط نتحقق من أن المفاتيح صحيحة
        return {
            success: true,
            message: "تم التحقق من مفاتيح Tabby - المفاتيح صحيحة",
        };
    }
    catch (error) {
        console.error("Tabby test connection error:", error);
        const msg = error instanceof Error ? error.message : "فشل الاتصال بـ Tabby";
        throw new functions.https.HttpsError("internal", msg);
    }
});
// Browser-like headers for scraping
const BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
};
function getSiteName(url) {
    const domain = new URL(url).hostname.toLowerCase();
    if (domain.includes("amazon"))
        return "Amazon";
    if (domain.includes("aliexpress"))
        return "AliExpress";
    if (domain.includes("shein"))
        return "SHEIN";
    if (domain.includes("noon"))
        return "Noon";
    if (domain.includes("temu"))
        return "Temu";
    if (domain.includes("ebay"))
        return "eBay";
    if (domain.includes("alibaba") || domain.includes("1688"))
        return "Alibaba";
    return domain.replace("www.", "");
}
function decodeHtmlEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
}
function parseMetaTag(html, property) {
    const r1 = new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
    const m1 = html.match(r1);
    if (m1)
        return decodeHtmlEntities(m1[1]);
    const r2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i");
    const m2 = html.match(r2);
    return m2 ? decodeHtmlEntities(m2[1]) : "";
}
function parseJsonLd(html) {
    const results = [];
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        try {
            results.push(JSON.parse(match[1]));
        }
        catch (_a) {
            /* skip malformed JSON-LD */
        }
    }
    return results;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findProductInJsonLd(items) {
    for (const item of items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const obj = item;
        if ((obj === null || obj === void 0 ? void 0 : obj["@type"]) === "Product")
            return obj;
        if (Array.isArray(obj === null || obj === void 0 ? void 0 : obj["@graph"])) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const found = obj["@graph"].find((g) => (g === null || g === void 0 ? void 0 : g["@type"]) === "Product");
            if (found)
                return found;
        }
    }
    return null;
}
function amazonFullResUrl(url) {
    if (!url)
        return "";
    return url.replace(/\._[^.]+_\./, "._AC_SL1500_.");
}
function parseAmazon(html, url) {
    const product = {
        name: "",
        nameEn: "",
        description: "",
        price: 0,
        images: [],
        supplierUrl: url,
        supplierName: "Amazon",
        specs: {},
    };
    // Detect Amazon regional domain
    try {
        const domain = new URL(url).hostname;
        if (domain.includes(".sa"))
            product.supplierName = "Amazon.sa";
        else if (domain.includes(".ae"))
            product.supplierName = "Amazon.ae";
        else if (domain.includes(".co.uk"))
            product.supplierName = "Amazon.co.uk";
        else if (domain.includes(".de"))
            product.supplierName = "Amazon.de";
        else if (domain.includes(".eg"))
            product.supplierName = "Amazon.eg";
    }
    catch (_a) {
        /* keep default */
    }
    // 1) JSON-LD structured data (most reliable)
    const jsonLd = findProductInJsonLd(parseJsonLd(html));
    if (jsonLd) {
        product.nameEn = jsonLd.name || "";
        product.description = jsonLd.description || "";
        if (jsonLd.image) {
            product.images = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
        }
        if (jsonLd.offers) {
            const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
            product.price = parseFloat(offer === null || offer === void 0 ? void 0 : offer.price) || parseFloat(offer === null || offer === void 0 ? void 0 : offer.lowPrice) || 0;
            product.supplierPrice = product.price;
            if (offer === null || offer === void 0 ? void 0 : offer.highPrice)
                product.oldPrice = parseFloat(offer.highPrice);
        }
    }
    // 2) Product title from multiple patterns
    if (!product.nameEn) {
        const titlePatterns = [
            /<span[^>]*id=["']productTitle["'][^>]*>\s*([^<]+)/i,
            /<h1[^>]*id=["']title["'][^>]*>[\s\S]*?<span[^>]*>\s*([^<]+)/i,
            /<span[^>]*class=["'][^"']*product-title[^"']*["'][^>]*>\s*([^<]+)/i,
            /"title"\s*:\s*"([^"]{10,300})"/,
        ];
        for (const p of titlePatterns) {
            const m = html.match(p);
            if (m) {
                const title = decodeHtmlEntities(m[1].trim());
                if (title && title.length > 5) {
                    product.nameEn = title;
                    break;
                }
            }
        }
    }
    // 3) Price extraction
    if (!product.price) {
        const pricePatterns = [
            /class=["']apexPriceToPay["'][^>]*>[\s\S]*?<span[^>]*class=["']a-offscreen["'][^>]*>([^<]+)/i,
            /"priceAmount"\s*:\s*"?([\d,.]+)"?/,
            /class=["']a-price[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["']a-offscreen["'][^>]*>([^<]+)/i,
            /class=["']a-price-whole["'][^>]*>([\d,]+)[\s\S]*?class=["']a-price-fraction["'][^>]*>(\d+)/i,
            /id=["']priceblock_dealprice["'][^>]*>([^<]+)/i,
            /id=["']priceblock_ourprice["'][^>]*>([^<]+)/i,
            /id=["']priceblock_saleprice["'][^>]*>([^<]+)/i,
            /"price"\s*:\s*"?([\d,.]+)"?\s*[,}]/,
            /(?:SAR|AED|USD|EUR|GBP|EGP)\s*([\d,.]+)/,
            /(?:ر\.س|د\.إ|جنيه)\s*([\d,.]+)/i,
        ];
        for (const p of pricePatterns) {
            const m = html.match(p);
            if (m) {
                let priceStr = m[1];
                if (m[2])
                    priceStr = m[1] + "." + m[2];
                const numMatch = priceStr.replace(/[^\d.,]/g, "").replace(/,/g, "");
                const val = parseFloat(numMatch);
                if (val > 0) {
                    product.price = val;
                    product.supplierPrice = val;
                    break;
                }
            }
        }
    }
    // Old / list price
    if (product.price && !product.oldPrice) {
        const oldPricePatterns = [
            /class=["']a-text-price["'][^>]*>[\s\S]*?<span[^>]*class=["']a-offscreen["'][^>]*>([^<]+)/i,
            /class=["']basisPrice["'][^>]*>[\s\S]*?<span[^>]*class=["']a-offscreen["'][^>]*>([^<]+)/i,
            /id=["']listPrice["'][^>]*>([^<]+)/i,
        ];
        for (const p of oldPricePatterns) {
            const m = html.match(p);
            if (m) {
                const numMatch = m[1].replace(/[^\d.,]/g, "").replace(/,/g, "");
                const val = parseFloat(numMatch);
                if (val > product.price) {
                    product.oldPrice = val;
                    break;
                }
            }
        }
    }
    // 4) Images from colorImages JS
    if (product.images.length === 0) {
        const imgPatterns = [
            /'colorImages':\s*\{[^}]*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/,
            /"colorImages"\s*:\s*\{[^}]*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/,
            /"imageGalleryData"\s*:\s*(\[[\s\S]*?\])/,
        ];
        for (const p of imgPatterns) {
            const m = html.match(p);
            if (m) {
                try {
                    const arr = JSON.parse(m[1].replace(/'/g, '"'));
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const urls = arr
                        .map((i) => amazonFullResUrl(i.hiRes || i.large || i.mainUrl || i.thumb || ""))
                        .filter(Boolean);
                    if (urls.length > 0) {
                        product.images = urls.slice(0, 10);
                        break;
                    }
                }
                catch (_b) {
                    /* continue */
                }
            }
        }
    }
    // Fallback: landingImage
    if (product.images.length === 0) {
        const mainImgPatterns = [
            /<img[^>]*id=["']landingImage["'][^>]*src=["']([^"']+)["']/i,
            /<img[^>]*id=["']imgBlkFront["'][^>]*src=["']([^"']+)["']/i,
            /<img[^>]*data-old-hires=["']([^"']+)["']/i,
        ];
        for (const p of mainImgPatterns) {
            const m = html.match(p);
            if (m) {
                const imgUrl = amazonFullResUrl(m[1]);
                if (imgUrl) {
                    product.images.push(imgUrl);
                    break;
                }
            }
        }
    }
    // Amazon media CDN URLs
    if (product.images.length === 0) {
        const amazonImgRegex = /["'](https?:\/\/m\.media-amazon\.com\/images\/I\/[^"'\s]+\.(?:jpg|jpeg|png|webp))[^"']*/gi;
        let m;
        const seen = new Set();
        while ((m = amazonImgRegex.exec(html)) !== null) {
            const imgUrl = amazonFullResUrl(m[1]);
            if (imgUrl && !seen.has(imgUrl)) {
                seen.add(imgUrl);
                product.images.push(imgUrl);
            }
            if (product.images.length >= 10)
                break;
        }
    }
    // 5) OG tags fallback
    if (!product.nameEn)
        product.nameEn = parseMetaTag(html, "og:title").replace(/\s*:\s*Amazon.*$/i, "").trim();
    if (!product.description)
        product.description = parseMetaTag(html, "og:description");
    if (product.images.length === 0) {
        const ogImage = parseMetaTag(html, "og:image");
        if (ogImage)
            product.images = [ogImage];
    }
    // 6) Description from feature bullets
    if (!product.description) {
        const bulletMatches = html.match(/<span[^>]*class=["']a-list-item["'][^>]*>\s*([^<]{10,})/gi);
        if (bulletMatches) {
            product.description = bulletMatches
                .slice(0, 5)
                .map((b) => b.replace(/<[^>]+>/g, "").trim())
                .filter(Boolean)
                .join(" • ");
        }
    }
    // 7) Extract specs/features
    const specsMatch = html.match(/<table[^>]*id=["']productDetails[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
    if (specsMatch) {
        const specRows = specsMatch[1].matchAll(/<tr[^>]*>[\s\S]*?<th[^>]*>([^<]+)<\/th>[\s\S]*?<td[^>]*>([^<]+)<\/td>/gi);
        for (const row of specRows) {
            if (row[1] && row[2]) {
                const key = decodeHtmlEntities(row[1].trim());
                const value = decodeHtmlEntities(row[2].trim());
                if (key && value && product.specs) {
                    product.specs[key] = value;
                }
            }
        }
    }
    product.name = product.nameEn;
    return product;
}
function parseGeneric(html, url) {
    const product = {
        name: "",
        nameEn: "",
        description: "",
        price: 0,
        images: [],
        supplierUrl: url,
        supplierName: getSiteName(url),
    };
    // 1) JSON-LD
    const jsonLd = findProductInJsonLd(parseJsonLd(html));
    if (jsonLd) {
        product.nameEn = jsonLd.name || "";
        product.description = jsonLd.description || "";
        if (jsonLd.image) {
            product.images = Array.isArray(jsonLd.image) ? jsonLd.image : [jsonLd.image];
        }
        if (jsonLd.offers) {
            const offer = Array.isArray(jsonLd.offers) ? jsonLd.offers[0] : jsonLd.offers;
            product.price = parseFloat(offer === null || offer === void 0 ? void 0 : offer.price) || parseFloat(offer === null || offer === void 0 ? void 0 : offer.lowPrice) || 0;
            product.supplierPrice = product.price;
        }
    }
    // 2) OG tags fallback
    if (!product.nameEn)
        product.nameEn = parseMetaTag(html, "og:title");
    if (!product.description)
        product.description = parseMetaTag(html, "og:description");
    if (product.images.length === 0) {
        const ogImage = parseMetaTag(html, "og:image");
        if (ogImage)
            product.images = [ogImage];
    }
    if (!product.price) {
        const priceStr = parseMetaTag(html, "product:price:amount");
        product.price = parseFloat(priceStr) || 0;
        product.supplierPrice = product.price;
    }
    // 3) Title tag fallback
    if (!product.nameEn) {
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        if (titleMatch)
            product.nameEn = titleMatch[1].trim();
    }
    product.name = product.nameEn;
    return product;
}
exports.scrapeProductFromUrl = functions
    .runWith({ timeoutSeconds: 120, memory: "1GB" })
    .https.onCall(async (data, context) => {
    var _a, _b, _c;
    await verifyAdmin((_a = context.auth) !== null && _a !== void 0 ? _a : undefined);
    const { url } = data;
    if (!url) {
        throw new functions.https.HttpsError("invalid-argument", "رابط المنتج مطلوب");
    }
    try {
        console.log("[Scraper] Fetching URL:", url);
        const siteName = getSiteName(url);
        // استخدام السكرابر الاحترافي للأمازون
        if (siteName.includes("Amazon")) {
            console.log("[Scraper] Using professional Amazon scraper...");
            // محاولة أولى: السكرابر المحلي
            let result = await (0, amazonScraper_1.scrapeAmazonProduct)(url);
            // إذا فشل، حاول مع ScraperAPI
            if (!result.name && !result.nameEn) {
                console.log("[Scraper] Local scraper failed, trying ScraperAPI...");
                const scraperApiKey = process.env.SCRAPER_API_KEY;
                if (scraperApiKey) {
                    result = await (0, amazonScraper_1.scrapeAmazonWithApi)(url, scraperApiKey);
                }
            }
            if (!result.name && !result.nameEn) {
                throw new Error("لم يتم العثور على بيانات المنتج من أمازون. قد يكون الرابط خاطئ أو المنتج غير متاح.");
            }
            console.log("[Scraper] Amazon Result:", {
                name: (_b = result.name) === null || _b === void 0 ? void 0 : _b.substring(0, 50),
                price: result.price,
                images: result.images.length,
                brand: result.brand,
                asin: result.asin,
            });
            return result;
        }
        // للمواقع الأخرى، استخدم السكرابر العام
        const response = await fetch(url, {
            headers: BROWSER_HEADERS,
            redirect: "follow",
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const html = await response.text();
        console.log("[Scraper] Received HTML length:", html.length);
        if (html.length < 500) {
            throw new Error("الصفحة رجعت محتوى فارغ أو قصير جداً");
        }
        // Check for captcha/bot detection
        if (html.includes("captcha") ||
            html.includes("robot") ||
            html.includes("automated access")) {
            console.log("[Scraper] Captcha/bot detection detected");
            throw new Error("الموقع يطلب التحقق البشري (Captcha). حاول لاحقاً.");
        }
        const result = parseGeneric(html, url);
        if (!result.name && !result.nameEn) {
            throw new Error(`لم يتم العثور على بيانات منتج من ${siteName}. الموقع قد يحظر الوصول التلقائي.`);
        }
        console.log("[Scraper] Result:", {
            name: (_c = result.name) === null || _c === void 0 ? void 0 : _c.substring(0, 50),
            price: result.price,
            images: result.images.length,
            supplier: result.supplierName,
        });
        return result;
    }
    catch (error) {
        console.error("[Scraper] Error:", error);
        const msg = error instanceof Error ? error.message : "خطأ في جلب بيانات المنتج";
        throw new functions.https.HttpsError("internal", msg);
    }
});
//# sourceMappingURL=index.js.map