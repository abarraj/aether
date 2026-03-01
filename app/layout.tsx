import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'Aether — Revenue Intelligence for Modern Business',
  description:
    "Upload your data. See where you're leaving money on the table. Know exactly what to do about it.",
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Aether — Revenue Intelligence',
    description:
      "AI-powered operations intelligence that shows you where you're losing money and what to do about it.",
    type: 'website',
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