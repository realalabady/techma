import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  ShoppingCart,
  User,
  Menu,
  X,
  Heart,
  Phone,
  ChevronDown,
} from "lucide-react";
import { useStore } from "../../store/useStore";
import "./Header.css";

const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesRef = useRef<HTMLLIElement>(null);
  const {
    cart,
    user,
    searchQuery,
    setSearchQuery,
    categories,
    storeInfo,
  } = useStore();
  const navigate = useNavigate();

  const cartCount = cart.reduce((count, item) => count + item.quantity, 0);
  const storeName = storeInfo.storeName || "متجري";

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery)}`);
      setSearchOpen(false);
    }
  };

  // إغلاق قائمة التصنيفات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        categoriesRef.current &&
        !categoriesRef.current.contains(event.target as Node)
      ) {
        setCategoriesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="header">
      {/* Top Bar */}
      <div className="header-top">
        <div className="container">
          <div className="header-top-content">
            {storeInfo.storePhone ? (
              <div className="header-contact">
                <Phone size={14} aria-hidden="true" />
                <span>{storeInfo.storePhone}</span>
              </div>
            ) : (
              <div className="header-contact" />
            )}
            <div className="header-promo">
              🎉 شحن مجاني للطلبات فوق 200 ريال
            </div>
            <div className="header-links">
              {user ? (
                <Link to={user.role === "admin" ? "/dashboard" : "/account"}>
                  حسابي
                </Link>
              ) : (
                <>
                  <Link to="/login">تسجيل الدخول</Link>
                  <span>|</span>
                  <Link to="/register">حساب جديد</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="header-main">
        <div className="container">
          <div className="header-main-content">
            {/* Mobile Menu Toggle */}
            <button
              className="mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <X size={24} aria-hidden="true" />
              ) : (
                <Menu size={24} aria-hidden="true" />
              )}
            </button>

            {/* Logo */}
            <Link to="/" className="logo" aria-label={storeName}>
              <span className="logo-text">{storeName}</span>
            </Link>

            {/* Search Bar */}
            <form
              className="search-bar"
              onSubmit={handleSearch}
              role="search"
            >
              <input
                type="search"
                name="search"
                aria-label="ابحث عن منتجات"
                autoComplete="off"
                placeholder="ابحث عن منتجات…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" aria-label="بحث">
                <Search size={20} aria-hidden="true" />
              </button>
            </form>

            {/* Header Actions */}
            <div className="header-actions">
              <button
                className="search-toggle"
                onClick={() => setSearchOpen(!searchOpen)}
                aria-label="فتح البحث"
                aria-expanded={searchOpen}
              >
                <Search size={22} aria-hidden="true" />
              </button>

              <Link to="/wishlist" className="action-btn" aria-label="المفضلة">
                <Heart size={22} aria-hidden="true" />
              </Link>

              <Link
                to="/cart"
                className="action-btn cart-btn"
                aria-label={`السلة (${cartCount})`}
              >
                <ShoppingCart size={22} aria-hidden="true" />
                {cartCount > 0 && (
                  <span className="cart-count">{cartCount}</span>
                )}
              </Link>

              <Link
                to={user ? "/account" : "/login"}
                className="action-btn"
                aria-label={user ? "حسابي" : "تسجيل الدخول"}
              >
                <User size={22} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Search */}
      {searchOpen && (
        <div className="mobile-search">
          <form onSubmit={handleSearch} role="search">
            <input
              type="search"
              name="search"
              aria-label="ابحث عن منتجات"
              autoComplete="off"
              placeholder="ابحث عن منتجات…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" aria-label="بحث">
              <Search size={20} aria-hidden="true" />
            </button>
          </form>
        </div>
      )}

      {/* Navigation */}
      <nav className={`nav ${mobileMenuOpen ? "nav-open" : ""}`}>
        <div className="container">
          <ul className="nav-menu">
            <li className="nav-item">
              <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                الرئيسية
              </Link>
            </li>
            <li
              className={`nav-item has-dropdown ${categoriesOpen ? "open" : ""}`}
              ref={categoriesRef}
            >
              <button
                type="button"
                className="nav-link nav-dropdown-toggle"
                aria-expanded={categoriesOpen}
                aria-haspopup="true"
                onClick={() => setCategoriesOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCategoriesOpen(false);
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setCategoriesOpen((o) => !o);
                  }
                }}
              >
                التصنيفات <ChevronDown size={16} aria-hidden="true" />
              </button>
              <div className="dropdown-menu">
                {categories.length > 0 ? (
                  categories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/products?category=${cat.id}`}
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setCategoriesOpen(false);
                      }}
                    >
                      {cat.name}
                    </Link>
                  ))
                ) : (
                  <span style={{ padding: "10px", color: "var(--gray)" }}>
                    لا توجد تصنيفات
                  </span>
                )}
              </div>
            </li>
            <li className="nav-item">
              <Link to="/products?featured=true" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                العروض
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/products?new=true" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                وصل حديثاً
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/contact" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
                اتصل بنا
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </header>
  );
};

export default Header;
