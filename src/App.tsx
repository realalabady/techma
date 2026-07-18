import React, { useEffect, useState, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import {
  getUserById,
  createOrUpdateUser,
  subscribeToProducts,
  subscribeToCategories,
  subscribeToSettings,
} from "./services/firestore";
import { useStore } from "./store/useStore";

// Layouts (loaded immediately - small components)
import Header from "./components/Header/Header";
import Footer from "./components/Footer/Footer";
import { ToastProvider } from "./components/Toast/Toast";

// Lazy loaded components
const DashboardLayout = lazy(() => import("./components/DashboardLayout/DashboardLayout"));

// Store Pages - Lazy Loaded
const Home = lazy(() => import("./pages/Home/Home"));
const Cart = lazy(() => import("./pages/Cart/Cart"));
const Checkout = lazy(() => import("./pages/Checkout/Checkout"));
const Login = lazy(() => import("./pages/Login/Login"));
const Register = lazy(() => import("./pages/Register/Register"));
const ProductsPage = lazy(() => import("./pages/Products/Products"));
const ProductDetail = lazy(() => import("./pages/ProductDetail/ProductDetail"));
const Account = lazy(() => import("./pages/Account/Account"));
const Contact = lazy(() => import("./pages/Contact/Contact"));
const About = lazy(() => import("./pages/About/About"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword/ForgotPassword"));
const NotFound = lazy(() => import("./pages/NotFound/NotFound"));
const Privacy = lazy(() => import("./pages/Legal/Privacy"));
const Shipping = lazy(() => import("./pages/Legal/Shipping"));
const Returns = lazy(() => import("./pages/Legal/Returns"));
const FAQ = lazy(() => import("./pages/Legal/FAQ"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation/OrderConfirmation"));

// Dashboard Pages - Lazy Loaded
const DashboardHome = lazy(() => import("./pages/Dashboard/DashboardHome"));
const Products = lazy(() => import("./pages/Dashboard/Products"));
const Categories = lazy(() => import("./pages/Dashboard/Categories"));
const Orders = lazy(() => import("./pages/Dashboard/Orders"));
const Customers = lazy(() => import("./pages/Dashboard/Customers"));
const Analytics = lazy(() => import("./pages/Dashboard/Analytics"));
const Settings = lazy(() => import("./pages/Dashboard/Settings"));
const Messages = lazy(() => import("./pages/Dashboard/Messages"));
const CJProducts = lazy(() => import("./pages/Dashboard/CJProducts"));
const CJOrders = lazy(() => import("./pages/Dashboard/CJOrders"));
const CJSettings = lazy(() => import("./pages/Dashboard/CJSettings"));

// Styles
import "./styles/globals.css";

// Loading Spinner Component
const PageLoader: React.FC = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "50vh",
      fontSize: "16px",
      color: "var(--gray)",
    }}
  >
    <div
      style={{
        width: "40px",
        height: "40px",
        border: "3px solid #f3f3f3",
        borderTop: "3px solid var(--primary)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  </div>
);

// Store Layout Component
const StoreLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <Header />
    <main style={{ minHeight: "60vh" }}>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </main>
    <Footer />
  </>
);

const App: React.FC = () => {
  const { setUser, setProducts, setCategories, setStoreInfo } = useStore();
  const [loading, setLoading] = useState(true);

  // الاشتراك المركزي في المنتجات والتصنيفات وإعدادات المتجر
  useEffect(() => {
    const unsubProducts = subscribeToProducts((products) =>
      setProducts(products),
    );
    const unsubCategories = subscribeToCategories((categories) =>
      setCategories(categories),
    );
    const unsubSettings = subscribeToSettings((settings) => {
      if (settings?.store) {
        // Store settings are now scoped per store (settings/store__<id>), so the
        // saved store name is already store-specific and wins. VITE_STORE_NAME
        // only fills in as a fallback when this store hasn't saved a name yet.
        const store = { ...settings.store };
        if (!store.storeName && import.meta.env.VITE_STORE_NAME) {
          store.storeName = import.meta.env.VITE_STORE_NAME;
        }
        setStoreInfo(store);
      }
    });
    return () => {
      unsubProducts();
      unsubCategories();
      unsubSettings();
    };
  }, [setProducts, setCategories, setStoreInfo]);

  // الحفاظ على جلسة المستخدم عند تحديث الصفحة
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // جلب بيانات المستخدم من Firestore
        let userData = await getUserById(firebaseUser.uid);

        if (!userData) {
          // إنشاء مستخدم جديد إذا لم يكن موجود
          userData = {
            id: firebaseUser.uid,
            email: firebaseUser.email || "",
            name: firebaseUser.displayName || "مستخدم",
            role: "customer",
            addresses: [],
            createdAt: new Date(),
          };
          await createOrUpdateUser(userData);
        }

        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser]);

  // شاشة التحميل
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "18px",
          color: "var(--gray)",
        }}
      >
        جاري التحميل...
      </div>
    );
  }

  return (
    <ToastProvider>
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Dashboard Routes */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardHome />} />
          <Route path="products" element={<Products />} />
          <Route path="categories" element={<Categories />} />
          <Route path="orders" element={<Orders />} />
          <Route path="customers" element={<Customers />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
          <Route path="messages" element={<Messages />} />
          <Route path="cj-products" element={<CJProducts />} />
          <Route path="cj-orders" element={<CJOrders />} />
          <Route path="cj-settings" element={<CJSettings />} />
        </Route>

        {/* Store Routes */}
        <Route
          path="/"
          element={
            <StoreLayout>
              <Home />
            </StoreLayout>
          }
        />
        <Route
          path="/cart"
          element={
            <StoreLayout>
              <Cart />
            </StoreLayout>
          }
        />
        <Route path="/checkout" element={<Checkout />} />
        <Route
          path="/order-confirmation/:orderId"
          element={
            <StoreLayout>
              <OrderConfirmation />
            </StoreLayout>
          }
        />
        <Route
          path="/products"
          element={
            <StoreLayout>
              <ProductsPage />
            </StoreLayout>
          }
        />
        <Route
          path="/product/:id"
          element={
            <StoreLayout>
              <ProductDetail />
            </StoreLayout>
          }
        />
        <Route path="/account" element={<Account />} />
        <Route path="/wishlist" element={<Account initialTab="wishlist" />} />
        <Route
          path="/contact"
          element={
            <StoreLayout>
              <Contact />
            </StoreLayout>
          }
        />
        <Route
          path="/about"
          element={
            <StoreLayout>
              <About />
            </StoreLayout>
          }
        />

        {/* Legal Pages */}
        <Route
          path="/privacy"
          element={
            <StoreLayout>
              <Privacy />
            </StoreLayout>
          }
        />
        <Route
          path="/shipping"
          element={
            <StoreLayout>
              <Shipping />
            </StoreLayout>
          }
        />
        <Route
          path="/returns"
          element={
            <StoreLayout>
              <Returns />
            </StoreLayout>
          }
        />
        <Route
          path="/faq"
          element={
            <StoreLayout>
              <FAQ />
            </StoreLayout>
          }
        />

        {/* 404 */}
        <Route
          path="*"
          element={
            <StoreLayout>
              <NotFound />
            </StoreLayout>
          }
        />
        </Routes>
      </Suspense>
    </Router>
    </ToastProvider>
  );
};

export default App;
