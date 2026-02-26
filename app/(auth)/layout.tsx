// Minimal auth layout centering content on a dark Aether background.

import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-slate-200 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

