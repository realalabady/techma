import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // تحسين حجم الـ chunks
    chunkSizeWarningLimit: 600,
    // ضغط أفضل
    minify: "esbuild",
    // تحسين CSS
    cssCodeSplit: true,
    // Source maps للإنتاج (معطل للسرعة)
    sourcemap: false,
    // تقليل الحجم
    target: "es2020",
  },
  // تحسين التطوير
  server: {
    hmr: true,
  },
  // تحسين التبعيات
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "firebase/app", "zustand"],
  },
});
