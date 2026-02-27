// Dashboard sidebar showing navigation, organization, and user profile.
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { LogOut, ChevronDown, LayoutGrid, Building2, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
  isGroup?: boolean;
  childOrgs?: { id: string; name: string; industry: string | null }[];
  viewMode?: 'portfolio' | 'single';
  activeOrgId?: string;
  onSwitchOrg?: (orgId: string) => void;
  onSwitchPortfolio?: () => void;
}

export function Sidebar({
  navItems,
  orgName,
  userName,
  userRole,
  onSignOut,
  alertsCount = 0,
  isGroup = false,
  childOrgs,
  viewMode = 'single',
  activeOrgId,
  onSwitchOrg,
  onSwitchPortfolio,
}: SidebarProps) {
  const pathname = usePathname();
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);

  return (
    <div className="w-72 border-r border-zinc-800 bg-[#0A0A0A] flex flex-col relative">
      <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded-2xl flex items-center justify-center">
          <span className="text-white font-bold text-xl">A</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold tracking-tight text-xl">Aether</div>
          <button
            type="button"
            onClick={() => isGroup && setOrgDropdownOpen(!orgDropdownOpen)}
            className={cn(
              'text-xs text-emerald-400 flex items-center gap-1 max-w-[180px]',
              isGroup ? 'cursor-pointer hover:text-emerald-300' : 'cursor-default',
            )}
          >
            <span className="truncate">{orgName}</span>
            {isGroup && (
              <ChevronDown
                className={cn(
                  'w-3 h-3 shrink-0 transition-transform',
                  orgDropdownOpen && 'rotate-180',
                )}
              />
            )}
          </button>
        </div>
      </div>

      {orgDropdownOpen && isGroup && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOrgDropdownOpen(false)} />
          <div className="absolute left-3 right-3 top-[76px] z-50 rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl py-2 max-h-[400px] overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                onSwitchPortfolio?.();
                setOrgDropdownOpen(false);
              }}
              className={cn(
                'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl mx-1 transition max-w-[calc(100%-8px)]',
                viewMode === 'portfolio'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-300 hover:bg-zinc-900',
              )}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              <div className="text-left min-w-0">
                <div className="text-sm font-medium truncate">All Businesses</div>
                <div className="text-[10px] text-slate-500">Portfolio view</div>
              </div>
              {viewMode === 'portfolio' && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              )}
            </button>

            <div className="border-t border-zinc-800 my-2 mx-3" />

            {childOrgs?.map((child) => (
              <button
                key={child.id}
                type="button"
                onClick={() => {
                  onSwitchOrg?.(child.id);
                  setOrgDropdownOpen(false);
                }}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl mx-1 transition max-w-[calc(100%-8px)]',
                  viewMode === 'single' && activeOrgId === child.id
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-slate-300 hover:bg-zinc-900',
                )}
              >
                <Building2 className="w-4 h-4 shrink-0 text-slate-500" />
                <div className="text-left min-w-0">
                  <div className="text-sm font-medium truncate">{child.name}</div>
                  {child.industry && (
                    <div className="text-[10px] text-slate-500 truncate">{child.industry}</div>
                  )}
                </div>
                {viewMode === 'single' && activeOrgId === child.id && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                )}
              </button>
            ))}

            <div className="border-t border-zinc-800 my-2 mx-3" />

            <button
              type="button"
              onClick={() => {
                setOrgDropdownOpen(false);
                toast("Coming soon — you'll be able to add businesses here.");
              }}
              className="flex items-center gap-3 w-full px-3 py-2.5 mx-1 text-slate-400 hover:text-emerald-400 transition rounded-xl max-w-[calc(100%-8px)]"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">Add a business</span>
            </button>
          </div>
        </>
      )}

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

