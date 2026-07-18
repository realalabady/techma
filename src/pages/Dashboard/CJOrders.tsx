import React, { useState, useEffect, useCallback } from "react";
import {
  ShoppingCart,
  RefreshCw,
  Loader,
  Package,
  Truck,
  DollarSign,
  MapPin,
  X,
  Check,
  ExternalLink,
} from "lucide-react";
import {
  getCJBalance,
  getCJTracking,
  syncCJOrderStatuses,
} from "../../services/cjDropshipping";
import {
  subscribeToOrders,
  type FirestoreOrder,
} from "../../services/firestore";
import "./CJOrders.css";

const CJ_STATUS_MAP: Record<string, string> = {
  CREATED: "تم الإنشاء",
  IN_CART: "في السلة",
  UNPAID: "غير مدفوع",
  UNSHIPPED: "قيد التجهيز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

const CJOrders: React.FC = () => {
  const [orders, setOrders] = useState<FirestoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  // Tracking modal
  const [trackingModal, setTrackingModal] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingData, setTrackingData] = useState<any>(null);

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // الاشتراك في طلبات CJ من Firestore
  useEffect(() => {
    const unsubscribe = subscribeToOrders((allOrders) => {
      const cjOrders = allOrders.filter((o) => o.isCJOrder);
      setOrders(cjOrders);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // جلب رصيد CJ
  const fetchBalance = useCallback(async () => {
    try {
      const result: any = await getCJBalance();
      if (result.result && result.data !== undefined) {
        setBalance(
          typeof result.data === "object"
            ? result.data.amount?.toFixed(2) ||
                result.data.balance?.toFixed(2) ||
                JSON.stringify(result.data)
            : String(result.data),
        );
      }
    } catch {
      // رصيد غير متاح
    }
  }, []);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // مزامنة حالات الطلبات مع CJ
  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await syncCJOrderStatuses();
      showToast(`تم مزامنة ${result.synced} طلب بنجاح`);
      fetchBalance();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "خطأ في المزامنة";
      showToast(msg, "error");
    } finally {
      setSyncing(false);
    }
  };

  // عرض تتبع الشحنة
  const handleTracking = async (trackNumber: string) => {
    setTrackingModal(true);
    setTrackingLoading(true);
    try {
      const result: any = await getCJTracking(trackNumber);
      if (result.result && result.data) {
        setTrackingData(result.data);
      }
    } catch {
      showToast("فشل جلب بيانات التتبع", "error");
      setTrackingModal(false);
    } finally {
      setTrackingLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusClass = status.toLowerCase().replace("_", "");
    return (
      <span className={`cj-status-badge ${statusClass}`}>
        {CJ_STATUS_MAP[status] || status}
      </span>
    );
  };

  const getLocalStatusBadge = (status: string) => {
    const labels: Record<string, string> = {
      pending: "قيد الانتظار",
      processing: "قيد المعالجة",
      shipped: "تم الشحن",
      delivered: "تم التسليم",
      cancelled: "ملغي",
    };
    return (
      <span className={`cj-status-badge ${status}`}>
        {labels[status] || status}
      </span>
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date instanceof Date ? date : new Date(date));
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: "SAR",
    }).format(price);
  };

  // إحصائيات
  const stats = {
    total: orders.length,
    shipped: orders.filter((o) => o.status === "shipped").length,
    processing: orders.filter(
      (o) => o.status === "pending" || o.status === "processing",
    ).length,
    delivered: orders.filter((o) => o.status === "delivered").length,
  };

  return (
    <div className="cj-orders-page">
      {/* Header */}
      <div className="page-header">
        <h2>
          <ShoppingCart size={24} />
          طلبات CJ Dropshipping
        </h2>
        <div className="header-actions">
          <button className="btn-sync" onClick={handleSync} disabled={syncing}>
            {syncing ? (
              <>
                <Loader size={16} className="spinner" />
                جاري المزامنة...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                مزامنة الحالات
              </>
            )}
          </button>
        </div>
      </div>

      {/* بطاقة الرصيد */}
      {balance !== null && (
        <div className="balance-card">
          <div className="balance-info">
            <h3>رصيد CJ Dropshipping</h3>
            <div className="balance-amount">${balance}</div>
          </div>
          <DollarSign size={48} className="balance-icon" />
        </div>
      )}

      {/* الإحصائيات */}
      <div className="cj-stats-row">
        <div className="cj-stat-card">
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">إجمالي الطلبات</div>
        </div>
        <div className="cj-stat-card">
          <div className="stat-value">{stats.processing}</div>
          <div className="stat-label">قيد المعالجة</div>
        </div>
        <div className="cj-stat-card">
          <div className="stat-value">{stats.shipped}</div>
          <div className="stat-label">تم الشحن</div>
        </div>
        <div className="cj-stat-card">
          <div className="stat-value">{stats.delivered}</div>
          <div className="stat-label">تم التسليم</div>
        </div>
      </div>

      {/* الجدول */}
      {loading ? (
        <div className="cj-loading">
          <Loader size={40} className="spinner" />
        </div>
      ) : orders.length === 0 ? (
        <div className="cj-empty-state">
          <Package size={64} />
          <h3>لا توجد طلبات CJ</h3>
          <p>عندما يشتري العملاء منتجات CJ، ستظهر الطلبات هنا</p>
        </div>
      ) : (
        <div className="cj-orders-table-wrapper">
          <table className="cj-orders-table">
            <thead>
              <tr>
                <th>رقم الطلب</th>
                <th>العميل</th>
                <th>المبلغ</th>
                <th>حالة المتجر</th>
                <th>حالة CJ</th>
                <th>رقم CJ</th>
                <th>التتبع</th>
                <th>التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span className="cj-badge">CJ</span>
                    {order.id.substring(0, 8)}...
                  </td>
                  <td>{order.customer}</td>
                  <td>{formatPrice(order.total)}</td>
                  <td>{getLocalStatusBadge(order.status)}</td>
                  <td>
                    {order.cjOrderStatus
                      ? getStatusBadge(order.cjOrderStatus)
                      : "-"}
                  </td>
                  <td>
                    {order.cjOrderNum ? (
                      <span style={{ fontSize: "12px", color: "var(--gray)" }}>
                        {order.cjOrderNum}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {order.trackingNumber ? (
                      <button
                        className="tracking-btn"
                        onClick={() => handleTracking(order.trackingNumber!)}
                      >
                        <Truck size={14} />
                        تتبع
                      </button>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--gray)" }}>
                        -
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: "12px", color: "var(--gray)" }}>
                    {formatDate(order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* نافذة التتبع */}
      {trackingModal && (
        <div
          className="cj-modal-overlay"
          onClick={() => setTrackingModal(false)}
        >
          <div
            className="cj-modal tracking-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>
                <MapPin size={20} />
                تتبع الشحنة
              </h3>
              <button
                className="close-btn"
                onClick={() => setTrackingModal(false)}
              >
                <X size={24} />
              </button>
            </div>

            {trackingLoading ? (
              <div className="cj-loading">
                <Loader size={32} className="spinner" />
              </div>
            ) : trackingData ? (
              <div className="tracking-timeline">
                {(trackingData.trackInfoList || trackingData.details || []).map(
                  (step: any, index: number) => (
                    <div key={index} className="tracking-step">
                      <div className="step-dot">
                        {index === 0 ? (
                          <Check size={12} />
                        ) : (
                          <Package size={12} />
                        )}
                      </div>
                      <div className="step-info">
                        <div className="step-desc">
                          {step.trackingContent ||
                            step.description ||
                            step.info}
                        </div>
                        <div className="step-date">
                          {step.trackingTime || step.date || ""}
                        </div>
                      </div>
                    </div>
                  ),
                )}
                {trackingData.trackingUrl && (
                  <a
                    href={trackingData.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tracking-link"
                    style={{ marginTop: "16px" }}
                  >
                    <ExternalLink size={14} />
                    فتح صفحة التتبع الكاملة
                  </a>
                )}
              </div>
            ) : (
              <div className="cj-empty-state">
                <p>لا توجد بيانات تتبع متاحة حالياً</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`cj-toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
};

export default CJOrders;
