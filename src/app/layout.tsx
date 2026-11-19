import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "@fontsource-variable/onest";
import "./globals.css";
import { SAT_THEME_BOOT } from "@/lib/sat-theme";

export const metadata: Metadata = {
  title: "Digital Passport TODAY Scholars",
  description:
    "Digital Passport ученика TODAY Scholars: GPA, SAT/IELTS, спринты, менторство и отчёты для родителей.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* светлая тема SAT ставится до первой отрисовки — без вспышки тёмного фона */}
        <script dangerouslySetInnerHTML={{ __html: SAT_THEME_BOOT }} />
      </head>
      <body className="min-h-full font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
