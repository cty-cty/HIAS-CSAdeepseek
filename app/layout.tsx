import type { Metadata } from 'next';
import './globals.css';
import OfflineRegistration from './offline-registration';

export const metadata: Metadata = {
  title: 'HIAS-CSA · 2026 秋季预选课助手',
  description:
    '仅面向国科大杭州高等研究院 2026 级研一新生的秋季预选课辅助工具，支持课程筛选、选课方案体检、学位课属性、培养方案核对、课表模拟与冲突检测。',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/favicon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'HIAS-CSA',
    statusBarStyle: 'default',
  },
  openGraph: {
    title: 'HIAS-CSA · 2026 秋季预选课助手',
    description:
      '仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、选课须知、按周排课与冲突检测。',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HIAS-CSA · 2026 秋季预选课助手',
    description:
      '仅面向国科大杭州高等研究院 2026 级研一新生，提供秋季课程筛选、培养方案核对、选课须知、按周排课与冲突检测。',
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
