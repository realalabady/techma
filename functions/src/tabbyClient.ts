/**
 * Tabby API Client
 * خدمة التكامل مع تابي - Backend
 */

// مفاتيح Tabby API
let publicKey = "";
let secretKey = "";

const TABBY_API_URL = "https://api.tabby.ai/api/v2";

/**
 * تعيين مفاتيح API
 */
export function setApiKeys(pubKey: string, secKey: string): void {
  publicKey = pubKey;
  secretKey = secKey;
}

/**
 * واجهة عنصر السلة
 */
interface TabbyItem {
  title: string;
  quantity: number;
  unit_price: string;
  reference_id: string;
  image_url?: string;
  category?: string;
}

/**
 * واجهة بيانات المشتري
 */
interface TabbyBuyer {
  phone: string;
  email: string;
  name: string;
}

/**
 * واجهة عنوان الشحن
 */
interface TabbyShippingAddress {
  city: string;
  address: string;
  zip?: string;
}

/**
 * واجهة بيانات الجلسة
 */
interface TabbyCheckoutRequest {
  payment: {
    amount: string;
    currency: string;
    description?: string;
    buyer: TabbyBuyer;
    shipping_address: TabbyShippingAddress;
    order: {
      reference_id: string;
      items: TabbyItem[];
      tax_amount?: string;
      shipping_amount?: string;
      discount_amount?: string;
    };
    buyer_history: {
      registered_since: string;
      loyalty_level: number;
    };
  };
  lang: string;
  merchant_code: string;
  merchant_urls: {
    success: string;
    cancel: string;
    failure: string;
  };
}

/**
 * إنشاء جلسة دفع
 */
/**
 * واجهة تاريخ المشتري
 */
interface TabbyBuyerHistory {
  registered_since: string; // تاريخ التسجيل بصيغة YYYY-MM-DD
  loyalty_level: number; // مستوى الولاء 0-10
  order_count?: number; // عدد الطلبات السابقة
  order_amount_total?: string; // إجمالي المبالغ السابقة
  is_social_networks_connected?: boolean;
  is_phone_number_verified?: boolean;
  is_email_verified?: boolean;
}

export async function createCheckoutSession(params: {
  amount: string;
  currency: string;
  description?: string;
  buyer: TabbyBuyer;
  shipping_address: TabbyShippingAddress;
  order_reference_id: string;
  items: TabbyItem[];
  tax_amount?: string;
  shipping_amount?: string;
  discount_amount?: string;
  success_url: string;
  cancel_url: string;
  failure_url: string;
  merchant_code?: string;
  buyer_history?: TabbyBuyerHistory;
}): Promise<{
  id?: string;
  configuration?: {
    available_products?: {
      installments?: Array<{
        web_url?: string;
      }>;
      pay_later?: Array<{
        web_url?: string;
      }>;
    };
  };
  payment?: {
    id?: string;
    status?: string;
  };
  status?: string;
  rejection_reason?: string;
  web_url?: string;
  checkout_url?: string;
}> {
  if (!publicKey || !secretKey) {
    throw new Error("مفاتيح Tabby API غير معدة");
  }

  const requestBody: TabbyCheckoutRequest = {
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
    throw new Error(
      errorData.error?.message || `Tabby API error: ${response.status}`
    );
  }

  const result = await response.json();
  console.log("Tabby API response:", JSON.stringify(result, null, 2));
  return result;
}

/**
 * التقاط/تأكيد الدفع
 */
export async function capturePayment(paymentId: string): Promise<{
  id: string;
  status: string;
  amount: string;
  currency: string;
}> {
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
    throw new Error(
      errorData.error?.message || `Tabby capture error: ${response.status}`
    );
  }

  return response.json();
}

/**
 * الحصول على حالة الدفع
 */
export async function getPaymentStatus(paymentId: string): Promise<{
  id: string;
  status: string;
  order: {
    reference_id: string;
  };
  amount: string;
  currency: string;
}> {
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
    throw new Error(
      errorData.error?.message || `Tabby status error: ${response.status}`
    );
  }

  return response.json();
}

/**
 * استرجاع الدفع
 */
export async function refundPayment(
  paymentId: string,
  amount: string
): Promise<{
  id: string;
  status: string;
  amount: string;
}> {
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
    throw new Error(
      errorData.error?.message || `Tabby refund error: ${response.status}`
    );
  }

  return response.json();
}
