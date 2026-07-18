import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "../config/firebase";
import type { Product, Category } from "../types";

// Store scoping: every storefront deployment sets VITE_STORE_ID so its
// products (and settings) are isolated from sibling stores that share the same
// Firebase project. Products stay in the single "products" collection but each
// carries a storeId; queries filter by it. When VITE_STORE_ID is empty we fall
// back to legacy behavior (no filtering, no stamping) so single-store
// deployments keep working unchanged.
export const STORE_ID = (import.meta.env.VITE_STORE_ID || "").trim();

// ==================== Products ====================

export const productsCollection = collection(db, "products");

// Products for the current store. With a store id we filter by it and sort in
// memory (avoids needing a composite Firestore index); without one we keep the
// original ordered query over the whole collection.
const currentStoreProductsQuery = () =>
  STORE_ID
    ? query(productsCollection, where("storeId", "==", STORE_ID))
    : query(productsCollection, orderBy("createdAt", "desc"));

const mapProductDocs = (
  docs: { id: string; data: () => Record<string, any> }[],
): Product[] => {
  const products = docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as Product[];
  // Newest first (server-side orderBy is dropped when filtering by storeId).
  return STORE_ID
    ? products.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    : products;
};

export const getProducts = async (): Promise<Product[]> => {
  const snapshot = await getDocs(currentStoreProductsQuery());
  return mapProductDocs(snapshot.docs);
};

export const addProduct = async (
  product: Omit<Product, "id">,
): Promise<string> => {
  const docRef = await addDoc(productsCollection, {
    ...product,
    // Tag the product with the current store so it only shows in this store.
    ...(STORE_ID ? { storeId: STORE_ID } : {}),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
};

export const updateProduct = async (
  id: string,
  product: Partial<Product>,
): Promise<void> => {
  const docRef = doc(db, "products", id);
  await updateDoc(docRef, {
    ...product,
    updatedAt: Timestamp.now(),
  });
};

export const deleteProduct = async (id: string): Promise<void> => {
  const docRef = doc(db, "products", id);
  await deleteDoc(docRef);
};

export const decrementStock = async (
  productId: string,
  quantity: number,
): Promise<void> => {
  const docRef = doc(db, "products", productId);
  await updateDoc(docRef, {
    stock: increment(-quantity),
    updatedAt: Timestamp.now(),
  });
};

export const subscribeToProducts = (
  callback: (products: Product[]) => void,
) => {
  return onSnapshot(currentStoreProductsQuery(), (snapshot) => {
    callback(mapProductDocs(snapshot.docs));
  });
};

// ==================== Categories ====================

export const categoriesCollection = collection(db, "categories");

export const getCategories = async (): Promise<Category[]> => {
  const snapshot = await getDocs(
    query(categoriesCollection, orderBy("order", "asc")),
  );
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as Category[];
};

export const addCategory = async (
  category: Omit<Category, "id">,
): Promise<string> => {
  const docRef = await addDoc(categoriesCollection, {
    ...category,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
};

export const updateCategory = async (
  id: string,
  category: Partial<Category>,
): Promise<void> => {
  const docRef = doc(db, "categories", id);
  await updateDoc(docRef, {
    ...category,
    updatedAt: Timestamp.now(),
  });
};

export const deleteCategory = async (id: string): Promise<void> => {
  const docRef = doc(db, "categories", id);
  await deleteDoc(docRef);
};

export const subscribeToCategories = (
  callback: (categories: Category[]) => void,
) => {
  return onSnapshot(
    query(categoriesCollection, orderBy("order", "asc")),
    (snapshot) => {
      const categories = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Category[];
      callback(categories);
    },
  );
};

// ==================== Orders ====================

export const ordersCollection = collection(db, "orders");

export interface FirestoreOrder {
  id: string;
  userId?: string;
  customer: string;
  email: string;
  phone: string;
  items: {
    productId: string;
    name: string;
    quantity: number;
    price: number;
    image?: string;
  }[];
  total: number;
  subtotal?: number;
  shippingCost?: number;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled";
  paymentMethod: string;
  paymentStatus?: "pending" | "paid";
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paidAt?: Date;
  shippingAddress: string;
  address?: {
    fullName: string;
    phone: string;
    city: string;
    district: string;
    street: string;
    building?: string;
    nationalAddress?: string;
  };
  notes?: string;
  // حقول CJ Dropshipping
  isCJOrder?: boolean;
  cjOrderId?: string;
  cjOrderNum?: string;
  cjOrderStatus?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  cjLogisticName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const getOrders = async (): Promise<FirestoreOrder[]> => {
  const snapshot = await getDocs(
    query(ordersCollection, orderBy("createdAt", "desc")),
  );
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate() || new Date(),
  })) as FirestoreOrder[];
};

export const addOrder = async (
  order: Omit<FirestoreOrder, "id">,
): Promise<string> => {
  const docRef = await addDoc(ordersCollection, {
    ...order,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return docRef.id;
};

export const updateOrderStatus = async (
  id: string,
  status: FirestoreOrder["status"],
): Promise<void> => {
  const docRef = doc(db, "orders", id);
  await updateDoc(docRef, {
    status,
    updatedAt: Timestamp.now(),
  });
};

export const updateOrderData = async (
  id: string,
  data: Partial<FirestoreOrder>,
): Promise<void> => {
  const docRef = doc(db, "orders", id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
};

export const subscribeToOrders = (
  callback: (orders: FirestoreOrder[]) => void,
) => {
  return onSnapshot(
    query(ordersCollection, orderBy("createdAt", "desc")),
    (snapshot) => {
      const orders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as FirestoreOrder[];
      callback(orders);
    },
  );
};

export const deleteOrder = async (id: string): Promise<void> => {
  const docRef = doc(db, "orders", id);
  await deleteDoc(docRef);
};

// Aliases for consistent naming
export const addProductToFirestore = addProduct;
export const updateProductInFirestore = updateProduct;
export const deleteProductFromFirestore = deleteProduct;
export const addCategoryToFirestore = addCategory;
export const updateCategoryInFirestore = updateCategory;
export const deleteCategoryFromFirestore = deleteCategory;
export const updateOrderStatusInFirestore = updateOrderStatus;

// Export Order type alias
export type Order = FirestoreOrder;

// ==================== Users ====================

import type { User } from "../types";

export const usersCollection = collection(db, "users");

export const getUser = async (userId: string): Promise<User | null> => {
  const docRef = doc(db, "users", userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: docSnap.data().createdAt?.toDate() || new Date(),
    } as User;
  }
  return null;
};

export const getUserById = async (userId: string): Promise<User | null> => {
  const docRef = doc(db, "users", userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return {
      id: docSnap.id,
      ...docSnap.data(),
      createdAt: docSnap.data().createdAt?.toDate() || new Date(),
    } as User;
  }
  return null;
};

export const createOrUpdateUser = async (user: User): Promise<void> => {
  const docRef = doc(db, "users", user.id);
  await setDoc(
    docRef,
    {
      email: user.email,
      name: user.name,
      phone: user.phone || "",
      role: user.role,
      addresses: user.addresses || [],
      createdAt: Timestamp.now(),
    },
    { merge: true },
  );
};

export const updateUserRole = async (
  userId: string,
  role: "customer" | "admin",
): Promise<void> => {
  const docRef = doc(db, "users", userId);
  await updateDoc(docRef, { role });
};

export const getAllUsers = async (): Promise<User[]> => {
  const snapshot = await getDocs(
    query(usersCollection, orderBy("createdAt", "desc")),
  );
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as User[];
};

export const subscribeToUsers = (callback: (users: User[]) => void) => {
  return onSnapshot(
    query(usersCollection, orderBy("createdAt", "desc")),
    (snapshot) => {
      const users = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as User[];
      callback(users);
    },
  );
};

// ==================== User Orders ====================

export const getUserOrders = async (
  userId: string,
): Promise<FirestoreOrder[]> => {
  try {
    // محاولة الاستعلام مع الترتيب (يحتاج فهرس مركب)
    const q = query(
      ordersCollection,
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
      updatedAt: doc.data().updatedAt?.toDate() || new Date(),
    })) as FirestoreOrder[];
  } catch (error: any) {
    // إذا فشل بسبب عدم وجود الفهرس، نستخدم استعلام بدون ترتيب
    console.warn("getUserOrders: Falling back to unordered query", error.message);
    if (error.code === "failed-precondition" || error.message?.includes("index")) {
      const q = query(
        ordersCollection,
        where("userId", "==", userId),
      );
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as FirestoreOrder[];
      // ترتيب يدوياً
      return orders.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    throw error;
  }
};

export const subscribeToUserOrders = (
  userId: string,
  callback: (orders: FirestoreOrder[]) => void,
  onError?: (error: Error) => void,
) => {
  const q = query(
    ordersCollection,
    where("userId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const orders = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as FirestoreOrder[];
      callback(orders);
    },
    (error) => {
      console.error("subscribeToUserOrders error:", error);
      if (onError) {
        onError(error);
      }
    }
  );
};

// ==================== Settings ====================

// Per-store scoping (STORE_ID defined near the top of this file): each
// storefront deployment sets VITE_STORE_ID so its settings live in a dedicated
// document (settings/store__<id>) and don't clobber sibling stores that share
// the same Firebase project. When no VITE_STORE_ID is set we fall back to the
// legacy shared "store" document, keeping single-store deployments working.
export const STORE_SETTINGS_DOC_ID = STORE_ID ? `store__${STORE_ID}` : "store";

export interface StoreSettings {
  store?: {
    storeName: string;
    storeEmail: string;
    storePhone: string;
    storeAddress: string;
    currency: string;
    language: string;
  };
  shipping?: {
    freeShippingThreshold: number;
    defaultShippingCost: number;
    enableFreeShipping: boolean;
    estimatedDays: string;
  };
  notifications?: {
    orderNotifications: boolean;
    lowStockAlert: boolean;
    customerMessages: boolean;
    marketingEmails: boolean;
    lowStockThreshold: number;
  };
  payment?: {
    methods: { id: string; name: string; enabled: boolean }[];
  };
  updatedAt?: Date;
}

export const getSettings = async (): Promise<StoreSettings | null> => {
  const docRef = doc(db, "settings", STORE_SETTINGS_DOC_ID);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as StoreSettings;
  }
  return null;
};

export const updateSettings = async (
  settings: Partial<StoreSettings>,
): Promise<void> => {
  const docRef = doc(db, "settings", STORE_SETTINGS_DOC_ID);
  await setDoc(
    docRef,
    {
      ...settings,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
};

export const subscribeToSettings = (
  callback: (settings: StoreSettings | null) => void,
) => {
  const docRef = doc(db, "settings", STORE_SETTINGS_DOC_ID);
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as StoreSettings);
    } else {
      callback(null);
    }
  });
};

// ==================== Email (SMTP) Settings ====================
// Stored in a separate, admin-only `settings/email` document so SMTP
// credentials are NEVER exposed to public visitors.

export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
}

export const getEmailSettings = async (): Promise<EmailSettings | null> => {
  const docRef = doc(db, "settings", "email");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as EmailSettings;
  }
  return null;
};

export const updateEmailSettings = async (
  settings: Partial<EmailSettings>,
): Promise<void> => {
  const docRef = doc(db, "settings", "email");
  await setDoc(
    docRef,
    {
      ...settings,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
};

// ==================== Contact Messages ====================

export interface ContactMessage {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  read: boolean;
  createdAt: Date;
}

export const addContactMessage = async (
  message: Omit<ContactMessage, "id" | "read" | "createdAt">,
): Promise<string> => {
  const docRef = await addDoc(collection(db, "contactMessages"), {
    ...message,
    read: false,
    createdAt: Timestamp.now(),
  });
  return docRef.id;
};

export const subscribeToContactMessages = (
  callback: (messages: ContactMessage[]) => void,
) => {
  return onSnapshot(
    query(collection(db, "contactMessages"), orderBy("createdAt", "desc")),
    (snapshot) => {
      const messages = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate() || new Date(),
      })) as ContactMessage[];
      callback(messages);
    },
  );
};

export const markMessageRead = async (id: string): Promise<void> => {
  const docRef = doc(db, "contactMessages", id);
  await updateDoc(docRef, { read: true });
};

export const deleteContactMessage = async (id: string): Promise<void> => {
  const docRef = doc(db, "contactMessages", id);
  await deleteDoc(docRef);
};

// ==================== CJ Dropshipping Settings ====================

import type { CJSettings } from "../types";

export const getCJSettings = async (): Promise<CJSettings | null> => {
  const docRef = doc(db, "settings", "cjDropshipping");
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return docSnap.data() as CJSettings;
  }
  return null;
};

export const updateCJSettings = async (
  settings: Partial<CJSettings>,
): Promise<void> => {
  const docRef = doc(db, "settings", "cjDropshipping");
  await setDoc(
    docRef,
    {
      ...settings,
      updatedAt: Timestamp.now(),
    },
    { merge: true },
  );
};

export const subscribeToCJSettings = (
  callback: (settings: CJSettings | null) => void,
) => {
  const docRef = doc(db, "settings", "cjDropshipping");
  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as CJSettings);
    } else {
      callback(null);
    }
  });
};

// تحديث طلب مع بيانات CJ
export const updateOrderCJData = async (
  orderId: string,
  cjData: {
    isCJOrder?: boolean;
    cjOrderId?: string;
    cjOrderNum?: string;
    cjOrderStatus?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    cjLogisticName?: string;
  },
): Promise<void> => {
  const docRef = doc(db, "orders", orderId);
  await updateDoc(docRef, {
    ...cjData,
    updatedAt: Timestamp.now(),
  });
};
