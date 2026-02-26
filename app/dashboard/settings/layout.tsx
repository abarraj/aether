// Settings section layout with sub-navigation for Aether's dashboard.

'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  CreditCard,
  Database,
  Plug,
  ScrollText,
  Settings,
  Shield,
  Users,
} from 'lucide-react';

type SettingsLayoutProps = {
  children: ReactNode;
};

const settingsNavItems = [
  { label: 'General', href: '/dashboard/settings', icon: Settings },
  { label: 'Team & Roles', href: '/dashboard/settings/team', icon: Users },
  { label: 'Billing', href: '/dashboard/settings/billing', icon: CreditCard },
  { label: 'Integrations', href: '/dashboard/settings/integrations', icon: Plug },
  { label: 'Notifications', href: '/dashboard/settings/notifications', icon: Bell },
  { label: 'Data Management', href: '/dashboard/settings/data-management', icon: Database },
  { label: 'Audit Log', href: '/dashboard/settings/audit-log', icon: ScrollText },
  { label: 'Security', href: '/dashboard/settings/security', icon: Shield },
];

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard/settings' && pathname.startsWith(`${href}/`));

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A]">
      {/* Mobile: horizontal scrollable tab bar */}
      <div className="border-b border-zinc-800 bg-zinc-950 px-3 py-3 lg:hidden">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          Settings
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {settingsNavItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-2xl border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
                    : 'border-zinc-800 bg-zinc-950 text-slate-400 hover:bg-zinc-900 hover:text-slate-100'
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop: left vertical sub-navigation */}
        <aside className="hidden w-64 flex-col border-r border-zinc-800 bg-zinc-950 lg:flex">
          <div className="px-6 pt-6 pb-4">
            <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
              Settings
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
            {settingsNavItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-2xl border px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                      : 'border-transparent text-slate-300 hover:border-zinc-700 hover:bg-zinc-900 hover:text-slate-100'
                  }`}
                >
                  <item.icon
                    className={`h-4 w-4 ${
                      active ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-100'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Right content area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

