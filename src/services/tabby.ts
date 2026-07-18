/**
 * Tabby Payment Service
 * خدمة التكامل مع تابي - اشتري الآن وادفع لاحقاً
 */

import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();

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
 * واجهة إنشاء جلسة الدفع
 */
interface CreateTabbyCheckoutRequest {
  amount: string;
  currency: string;
  description?: string;
  buyer: TabbyBuyer;
  shipping_address: TabbyShippingAddress;
  order_reference_id: string;
  items: TabbyItem[];
  success_url: string;
  cancel_url: string;
  failure_url: string;
}

/**
 * واجهة نتيجة إنشاء جلسة الدفع
 */
interface TabbyCheckoutResult {
  id?: string;
  configuration?: {
    available_products?: {
      installments?: {
        web_url?: string;
      }[];
      pay_later?: {
        web_url?: string;
      }[];
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
}

/**
 * إنشاء جلسة دفع تابي
 */
export async function createTabbyCheckout(
  request: CreateTabbyCheckoutRequest
): Promise<TabbyCheckoutResult> {
  const createCheckout = httpsCallable<CreateTabbyCheckoutRequest, TabbyCheckoutResult>(
    functions,
    "tabbyCreateCheckout"
  );

  const result = await createCheckout(request);
  return result.data;
}

/**
 * التقاط/تأكيد الدفع
 */
export async function captureTabbyPayment(
  paymentId: string,
  firestoreOrderId?: string,
  orderReferenceId?: string
): Promise<{
  id: string;
  status: string;
  amount: string;
  currency: string;
}> {
  const capture = httpsCallable(functions, "tabbyCapturePayment");
  const result = await capture({ paymentId, firestoreOrderId, orderReferenceId });
  return result.data as any;
}

/**
 * الحصول على حالة الدفع
 */
export async function getTabbyPaymentStatus(
  paymentId: string
): Promise<{
  id: string;
  status: string;
  order_reference_id: string;
  amount: string;
  currency: string;
}> {
  const getStatus = httpsCallable(functions, "tabbyGetPaymentStatus");
  const result = await getStatus({ paymentId });
  return result.data as any;
}

/**
 * حفظ إعدادات تابي (للأدمن)
 */
export async function saveTabbySettings(
  publicKey: string,
  secretKey: string
): Promise<{ success: boolean; message: string }> {
  const saveSettings = httpsCallable(functions, "tabbySaveSettings");
  const result = await saveSettings({ publicKey, secretKey });
  return result.data as any;
}

/**
 * اختبار الاتصال بتابي (للأدمن)
 */
export async function testTabbyConnection(
  publicKey: string,
  secretKey: string
): Promise<{ success: boolean; message: string }> {
  const testConnection = httpsCallable(functions, "tabbyTestConnection");
  const result = await testConnection({ publicKey, secretKey });
  return result.data as any;
}
