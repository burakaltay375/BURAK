import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Panter Özel Güvenlik ve Koruma Hizmetleri",
    template: "%s | Panter Özel Güvenlik",
  },
  description:
    "Kurumsal tesisler, yöneticiler, etkinlikler ve kritik operasyonlar için profesyonel özel güvenlik ve koruma hizmetleri.",
  keywords: [
    "özel güvenlik",
    "kurumsal güvenlik",
    "yakın koruma",
    "güvenlik danışmanlığı",
    "tesis güvenliği",
    "etkinlik güvenliği",
  ],
  openGraph: {
    title: "Panter Özel Güvenlik ve Koruma Hizmetleri",
    description: "Güven, disiplin ve operasyonel mükemmellik odaklı profesyonel özel güvenlik hizmetleri.",
    type: "website",
    locale: "tr_TR",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SecurityService",
    name: "Panter Özel Güvenlik ve Koruma Hizmetleri",
    description:
      "Kurumsal tesisler, yöneticiler, etkinlikler ve kritik operasyonlar için profesyonel özel güvenlik ve koruma hizmetleri.",
    areaServed: "Türkiye",
    serviceType: [
      "Kurumsal Tesis Güvenliği",
      "Yakın Koruma",
      "Güvenlik Danışmanlığı",
      "Uzaktan İzleme",
      "Etkinlik Güvenliği",
    ],
  };

  return (
    <html lang="tr" className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
