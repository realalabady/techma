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
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrderStatusUpdateEmail = exports.sendOrderConfirmationEmail = void 0;
const nodemailer = __importStar(require("nodemailer"));
const admin = __importStar(require("firebase-admin"));
const getStoreBranding = async () => {
    try {
        const storeDoc = await admin
            .firestore()
            .collection("settings")
            .doc("store")
            .get();
        const data = storeDoc.data() || {};
        const store = data.store || data;
        return {
            storeName: store.storeName || "متجرنا",
            supportEmail: store.storeEmail || "",
            supportPhone: store.storePhone || "",
        };
    }
    catch (_a) {
        return { storeName: "متجرنا", supportEmail: "", supportPhone: "" };
    }
};
// Get email settings from Firestore
const getEmailSettings = async () => {
    const settingsDoc = await admin
        .firestore()
        .collection("settings")
        .doc("email")
        .get();
    if (!settingsDoc.exists) {
        console.log("Email settings document does not exist - skipping email");
        return null;
    }
    const data = settingsDoc.data();
    // Check if required fields are configured
    if (!data.smtpHost || !data.smtpUser || !data.smtpPassword || !data.fromEmail) {
        console.log("Email settings incomplete - skipping email");
        return null;
    }
    return data;
};
// Format price
const formatPrice = (price) => {
    return new Intl.NumberFormat("ar-SA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(price);
};
// Order confirmation email template
const getOrderConfirmationTemplate = (order, branding) => {
    const storeName = branding.storeName;
    const supportLine = [branding.supportEmail, branding.supportPhone]
        .filter(Boolean)
        .join(" | ") || "";
    const itemsHtml = order.items
        .map((item) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 8px; margin-left: 10px;">` : ""}
          <span style="font-weight: 600;">${item.name}</span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left;">${formatPrice(item.price)} ر.س</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: left; font-weight: 600;">${formatPrice(item.price * item.quantity)} ر.س</td>
      </tr>
    `)
        .join("");
    const paymentMethodText = order.paymentMethod === "cash"
        ? "الدفع عند الاستلام"
        : order.paymentMethod === "bank"
            ? "تحويل بنكي"
            : order.paymentMethod === "tabby"
                ? "تابي - تقسيط"
                : order.paymentMethod === "tamara"
                    ? "تمارا - تقسيط"
                    : "بطاقة ائتمان";
    return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>تأكيد الطلب - ${storeName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; direction: rtl;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${storeName}</h1>
    </div>

    <!-- Success Message -->
    <div style="padding: 30px; text-align: center; background: #dcfce7;">
      <div style="width: 60px; height: 60px; background: #22c55e; border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 30px;">✓</span>
      </div>
      <h2 style="color: #166534; margin: 0 0 10px 0; font-size: 22px;">تم استلام طلبك بنجاح!</h2>
      <p style="color: #15803d; margin: 0; font-size: 14px;">شكراً لك على الشراء من ${storeName}</p>
    </div>

    <!-- Order Info -->
    <div style="padding: 25px;">
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
          <div>
            <span style="color: #64748b; font-size: 13px;">رقم الطلب</span>
            <p style="margin: 5px 0 0 0; font-weight: 700; color: #2563eb; font-size: 16px;">#${order.id.slice(-8).toUpperCase()}</p>
          </div>
          <div style="text-align: left;">
            <span style="color: #64748b; font-size: 13px;">تاريخ الطلب</span>
            <p style="margin: 5px 0 0 0; font-weight: 600; color: #334155; font-size: 14px;">${new Date(order.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" })}</p>
          </div>
        </div>
      </div>

      <!-- Customer Info -->
      <div style="margin-bottom: 25px;">
        <h3 style="color: #334155; font-size: 16px; margin: 0 0 15px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">معلومات العميل</h3>
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; width: 100px;">الاسم:</td>
            <td style="padding: 8px 0; color: #334155; font-weight: 600;">${order.customer}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">الجوال:</td>
            <td style="padding: 8px 0; color: #334155; font-weight: 600;">${order.phone}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">البريد:</td>
            <td style="padding: 8px 0; color: #334155; font-weight: 600;">${order.email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;">العنوان:</td>
            <td style="padding: 8px 0; color: #334155; font-weight: 600;">${order.shippingAddress}</td>
          </tr>
        </table>
      </div>

      <!-- Order Items -->
      <div style="margin-bottom: 25px;">
        <h3 style="color: #334155; font-size: 16px; margin: 0 0 15px 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">تفاصيل الطلب</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background: #f1f5f9;">
              <th style="padding: 12px; text-align: right; color: #64748b; font-weight: 600;">المنتج</th>
              <th style="padding: 12px; text-align: center; color: #64748b; font-weight: 600;">الكمية</th>
              <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600;">السعر</th>
              <th style="padding: 12px; text-align: left; color: #64748b; font-weight: 600;">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <!-- Order Summary -->
      <div style="background: #f8fafc; border-radius: 12px; padding: 20px;">
        <h3 style="color: #334155; font-size: 16px; margin: 0 0 15px 0;">ملخص الطلب</h3>
        <table style="width: 100%; font-size: 14px;">
          ${order.subtotal
        ? `
          <tr>
            <td style="padding: 8px 0; color: #64748b;">المجموع الفرعي:</td>
            <td style="padding: 8px 0; color: #334155; text-align: left;">${formatPrice(order.subtotal)} ر.س</td>
          </tr>
          `
        : ""}
          <tr>
            <td style="padding: 8px 0; color: #64748b;">الشحن:</td>
            <td style="padding: 8px 0; color: #334155; text-align: left;">${order.shippingCost === 0 ? "مجاني" : `${formatPrice(order.shippingCost || 0)} ر.س`}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b;">طريقة الدفع:</td>
            <td style="padding: 8px 0; color: #334155; text-align: left;">${paymentMethodText}</td>
          </tr>
          <tr style="border-top: 2px solid #e2e8f0;">
            <td style="padding: 15px 0 0 0; color: #334155; font-weight: 700; font-size: 16px;">الإجمالي:</td>
            <td style="padding: 15px 0 0 0; color: #2563eb; text-align: left; font-weight: 700; font-size: 20px;">${formatPrice(order.total)} ر.س</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #1e293b; padding: 25px; text-align: center;">
      <p style="color: rgba(255,255,255,0.9); margin: 0 0 10px 0; font-size: 14px;">للاستفسارات تواصل معنا</p>
      ${supportLine ? `<p style="color: #60a5fa; margin: 0 0 15px 0; font-size: 14px;">${supportLine}</p>` : ""}
      <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 12px;">© ${new Date().getFullYear()} ${storeName} - جميع الحقوق محفوظة</p>
    </div>

  </div>
</body>
</html>
  `;
};
// Send order confirmation email
const sendOrderConfirmationEmail = async (order) => {
    try {
        const settings = await getEmailSettings();
        // If email settings not configured, skip gracefully
        if (!settings) {
            console.log("Email settings not configured - order confirmation email skipped");
            return { success: true, skipped: true };
        }
        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });
        const branding = await getStoreBranding();
        const htmlContent = getOrderConfirmationTemplate(order, branding);
        const mailOptions = {
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to: order.email,
            subject: `تأكيد طلبك #${order.id.slice(-8).toUpperCase()} - ${branding.storeName}`,
            html: htmlContent,
        };
        await transporter.sendMail(mailOptions);
        console.log(`Order confirmation email sent to ${order.email}`);
        return { success: true };
    }
    catch (error) {
        console.error("Error sending order confirmation email:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
};
exports.sendOrderConfirmationEmail = sendOrderConfirmationEmail;
// Order status update email template
const sendOrderStatusUpdateEmail = async (order) => {
    const statusLabels = {
        processing: {
            label: "قيد التجهيز",
            color: "#3b82f6",
            message: "نحن نعمل على تجهيز طلبك الآن",
        },
        shipped: {
            label: "تم الشحن",
            color: "#8b5cf6",
            message: "طلبك في الطريق إليك!",
        },
        delivered: {
            label: "تم التسليم",
            color: "#22c55e",
            message: "تم توصيل طلبك بنجاح",
        },
        cancelled: {
            label: "ملغي",
            color: "#ef4444",
            message: "تم إلغاء طلبك",
        },
    };
    const statusInfo = statusLabels[order.status];
    if (!statusInfo) {
        return { success: false, error: "Invalid status" };
    }
    try {
        const settings = await getEmailSettings();
        // If email settings not configured, skip gracefully
        if (!settings) {
            console.log("Email settings not configured - status update email skipped");
            return { success: true, skipped: true };
        }
        const branding = await getStoreBranding();
        const storeName = branding.storeName;
        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465,
            auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
            },
        });
        const trackingHtml = order.trackingNumber
            ? `
      <div style="background: #ede9fe; border-radius: 12px; padding: 20px; margin-top: 20px; text-align: center;">
        <p style="color: #7c3aed; margin: 0 0 10px 0; font-size: 14px;">رقم التتبع</p>
        <p style="color: #5b21b6; margin: 0; font-size: 20px; font-weight: 700;">${order.trackingNumber}</p>
        ${order.trackingUrl ? `<a href="${order.trackingUrl}" style="display: inline-block; margin-top: 15px; background: #8b5cf6; color: white; padding: 10px 25px; border-radius: 8px; text-decoration: none; font-weight: 600;">تتبع الشحنة</a>` : ""}
      </div>
    `
            : "";
        const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; direction: rtl;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    
    <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px;">${storeName}</h1>
    </div>

    <div style="padding: 30px; text-align: center;">
      <div style="width: 80px; height: 80px; background: ${statusInfo.color}; border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <span style="color: white; font-size: 36px;">${order.status === "delivered" ? "✓" : order.status === "shipped" ? "🚚" : order.status === "processing" ? "📦" : "✕"}</span>
      </div>
      <h2 style="color: ${statusInfo.color}; margin: 0 0 10px 0; font-size: 24px;">${statusInfo.label}</h2>
      <p style="color: #64748b; margin: 0; font-size: 16px;">${statusInfo.message}</p>

      <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-top: 25px;">
        <p style="color: #64748b; margin: 0 0 5px 0; font-size: 13px;">رقم الطلب</p>
        <p style="color: #2563eb; margin: 0; font-size: 18px; font-weight: 700;">#${order.id.slice(-8).toUpperCase()}</p>
      </div>

      ${trackingHtml}

      <p style="color: #64748b; margin: 30px 0 0 0; font-size: 14px;">مرحباً ${order.customer}،</p>
      <p style="color: #334155; margin: 10px 0 0 0; font-size: 14px;">${statusInfo.message}</p>
    </div>

    <div style="background: #1e293b; padding: 25px; text-align: center;">
      <p style="color: rgba(255,255,255,0.5); margin: 0; font-size: 12px;">© ${new Date().getFullYear()} ${storeName}</p>
    </div>

  </div>
</body>
</html>
    `;
        await transporter.sendMail({
            from: `"${settings.fromName}" <${settings.fromEmail}>`,
            to: order.email,
            subject: `تحديث طلبك #${order.id.slice(-8).toUpperCase()} - ${statusInfo.label}`,
            html: htmlContent,
        });
        return { success: true };
    }
    catch (error) {
        console.error("Error sending status update email:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
};
exports.sendOrderStatusUpdateEmail = sendOrderStatusUpdateEmail;
//# sourceMappingURL=emailService.js.map