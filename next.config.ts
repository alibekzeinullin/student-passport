import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Старый адрес на Vercel → новый домен (ссылки, уже разосланные родителям, продолжают работать)
  async redirects() {
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
