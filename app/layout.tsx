import type { Metadata } from 'next';
import './globals.css';
import OfflineRegistration from './offline-registration';

export const metadata: Metadata = {
  title: 'HIAS-CSAdeepseek · 2026 秋季预选课助手',
  description:
    '仅面向国科大杭州高等研究院 2026 级研一新生的秋季预选课辅助工具，支持课程筛选、培养方案核对、课表模拟、考试压力分析与冲突检测。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'HIAS-CSAdeepseek',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'HIAS-CSAdeepseek · 2026 秋季预选课助手',
    description:
      '仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、按周排课与冲突检测。',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'HIAS-CSAdeepseek 2026 秋季预选课助手',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HIAS-CSAdeepseek · 2026 秋季预选课助手',
    description:
      '仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、按周排课与冲突检测。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <OfflineRegistration />
      </body>
    </html>
  );
}
