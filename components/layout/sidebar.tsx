// Dashboard sidebar showing navigation, organization, and user profile.
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { LogOut, ChevronDown } from 'lucide-react';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
}

interface SidebarProps {
  navItems: NavItem[];
  orgName: string;
  userName: string;
  userRole: string;
  onSignOut: () => void;
  alertsCount?: number;
}

export function Sidebar({
  navItems,
  orgName,
  userName,
  userRole,
  onSignOut,
  alertsCount = 0,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <div className="w-72 border-r border-zinc-800 bg-[#0A0A0A] flex flex-col">
      <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-2xl flex items-center justify-center">
          <span className="text-white font-bold text-xl">A</span>
        </div>
        <div>
          <div className="font-semibold tracking-tight text-xl">Aether</div>
          <div className="text-xs text-emerald-400 flex items-center gap-1">
            <span className="truncate max-w-[136px]">{orgName}</span>
            <ChevronDown className="w-3 h-3" />
          </div>
        </div>
      </div>

      <div className="flex-1 p-3">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive =
              item.href === '/dashboard/data-model'
                ? pathname.startsWith('/dashboard/data-model')
                : item.href === '/dashboard/data'
                  ? pathname.startsWith('/dashboard/data') && !pathname.startsWith('/dashboard/data-model')
                  : pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
                {item.label === 'Alerts' && alertsCount > 0 && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    {alertsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="p-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 px-3 py-2 rounded-2xl hover:bg-zinc-900 cursor-pointer"
        >
          <div className="w-9 h-9 bg-zinc-700 rounded-full" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium truncate">{userName}</div>
            <div className="text-xs text-slate-500 truncate">{userRole}</div>
          </div>
          <LogOut className="w-4 h-4 text-slate-400" />
        </button>
      </div>
    </div>
  );
}

