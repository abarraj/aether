import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Aether — Your AI Chief Operating Officer',
  description:
    'Aether connects every operational data source — revenue, labor, utilization — and turns it into a single, always-on brain for your business.',
  metadataBase: new URL('https://aethercoo.ai'),
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Aether — Your AI Chief Operating Officer',
    description:
      'AI-powered operations intelligence for multi-location operators. Connect your data, see where you\'re leaving money, and know exactly what to do about it.',
    type: 'website',
    url: 'https://aethercoo.ai',
    siteName: 'Aether',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aether — Your AI Chief Operating Officer',
    description:
      'AI-powered operations intelligence for multi-location operators.',
  },
  alternates: {
    canonical: 'https://aethercoo.ai',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0A0A0A] text-slate-200 antialiased font-sans">
        {children}
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
