import React from "react";
import { Link } from "react-router-dom";
import { Shield, Truck, Headphones, Award, Users, Globe } from "lucide-react";
import { useStore } from "../../store/useStore";
import "./About.css";

const About: React.FC = () => {
  const { storeInfo } = useStore();
  const storeName = storeInfo.storeName || "متجرنا";
  return (
    <div className="about-page">
      {/* Hero Section */}
      <section className="about-hero">
        <div className="container">
          <h1>من نحن</h1>
          <p>
            {storeName} - وجهتك الأولى للتسوق الإلكتروني
          </p>
        </div>
      </section>

      {/* Story Section */}
      <section className="about-story">
        <div className="container">
          <div className="story-content">
            <h2>قصتنا</h2>
            <p>
              تأسس {storeName} بهدف توفير أحدث المنتجات بأفضل الأسعار وأعلى
              جودة. نسعى دائماً لتقديم تجربة تسوق مميزة لعملائنا من خلال توفير
              منتجات أصلية ومضمونة مع خدمة عملاء استثنائية.
            </p>
            <p>
              نعمل مع أفضل الموردين والعلامات التجارية العالمية لنضمن حصولك على
              أحدث التقنيات بأسعار تنافسية. من الهواتف الذكية إلى الأجهزة
              المنزلية، نوفر كل ما تحتاجه تحت سقف واحد.
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="about-features">
        <div className="container">
          <h2>لماذا تختارنا؟</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <Shield size={32} />
              </div>
              <h3>منتجات أصلية</h3>
              <p>جميع منتجاتنا أصلية ومضمونة مع كفالة رسمية</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Truck size={32} />
              </div>
              <h3>توصيل سريع</h3>
              <p>نوفر خدمة توصيل سريعة لجميع مناطق المملكة</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Headphones size={32} />
              </div>
              <h3>دعم فني 24/7</h3>
              <p>فريق دعم فني متخصص متاح على مدار الساعة</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Award size={32} />
              </div>
              <h3>أفضل الأسعار</h3>
              <p>أسعار تنافسية مع عروض وخصومات مستمرة</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Users size={32} />
              </div>
              <h3>آلاف العملاء</h3>
              <p>ثقة أكثر من 10,000 عميل في جميع أنحاء المملكة</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Globe size={32} />
              </div>
              <h3>ماركات عالمية</h3>
              <p>نوفر أشهر العلامات التجارية العالمية</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="about-cta">
        <div className="container">
          <h2>ابدأ التسوق الآن</h2>
          <p>اكتشف مجموعتنا الواسعة من المنتجات الإلكترونية</p>
          <div className="cta-buttons">
            <Link to="/products" className="btn btn-primary btn-lg">
              تصفح المنتجات
            </Link>
            <Link to="/contact" className="btn btn-outline btn-lg">
              تواصل معنا
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
