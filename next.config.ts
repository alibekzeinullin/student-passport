import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Старый адрес на Vercel → новый домен (ссылки, уже разосланные родителям, продолжают работать)
  // ВРЕМЕННО ВЫКЛЮЧЕНО: ждём, пока новый домен появится у всех провайдеров (до 3.11.2026)
  async redirects() {
    if (process.env.ENABLE_DOMAIN_REDIRECT !== "1") return [];
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "student-passport-seven.vercel.app" }],
        destination: "https://todayscholars.app/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
