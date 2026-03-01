'use client';

// Dashboard layout shell with sidebar and topbar wired to Supabase auth.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BarChart3,
  FileSpreadsheet,
  Network,
  MessageSquare,
  Bell,
  Settings,
  Menu,
  X,
} from 'lucide-react';

import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { useOrg } from '@/hooks/use-org';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeTable } from '@/hooks/use-realtime';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, org: userOrg, isLoading } = useUser();
  const {
    org,
    primaryOrg,
    childOrgs,
    viewMode,
    isGroup,
    switchToOrg,
    switchToPortfolio,
    activeOrgIds,
    isLoading: isOrgLoading,
  } = useOrg();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [alertsCount, setAlertsCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const supabase = createClient();
  const alertsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
    { icon: BarChart3, label: 'Performance', href: '/dashboard/performance' },
    { icon: FileSpreadsheet, label: 'Connected Data', href: '/dashboard/data' },
    { icon: Network, label: 'Your Business', href: '/dashboard/data-model' },
    { icon: MessageSquare, label: 'AI Assistant', href: '/dashboard/ai-assistant' },
    { icon: Bell, label: 'Alerts', href: '/dashboard/alerts' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
  ];

  const effectiveOrg = org ?? primaryOrg;

  const loadAlerts = useCallback(async () => {
    if (!effectiveOrg) return;
    const supabaseClient = createClient();
    const { count } = await supabaseClient
      .from('alerts')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', effectiveOrg.id)
      .eq('is_read', false)
      .eq('is_dismissed', false);
    setAlertsCount(count ?? 0);
  }, [effectiveOrg]);

  useEffect(() => {
    if (!isLoading && effectiveOrg) {
      void loadAlerts();
    }
  }, [isLoading, effectiveOrg, loadAlerts]);

  useRealtimeTable(
    'alerts',
    effectiveOrg ? { column: 'org_id', value: effectiveOrg.id } : undefined,
    () => {
      if (alertsDebounceRef.current) {
        clearTimeout(alertsDebounceRef.current);
      }
      alertsDebounceRef.current = setTimeout(() => {
        void loadAlerts();
      }, 2000);
    },
  );

  useEffect(() => {
    if (!isLoading && user && (!profile?.org_id || !userOrg)) {
      router.push('/onboarding');
    }
  }, [isLoading, user, profile, userOrg, router]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setIsSigningOut(false);
    }
  };

  const displayUserName =
    profile?.full_name?.trim() ||
    profile?.email ||
    user?.email ||
    'Member';

  const displayUserRole = profile?.role || 'Member';
  const displayOrgName =
    isGroup && viewMode === 'portfolio'
      ? `${primaryOrg?.name ?? 'Portfolio'} (All)`
      : org?.name || primaryOrg?.name || 'Your workspace';

  const pageLabels: Record<string, string> = {
    '/dashboard': 'Dashboard',
    '/dashboard/performance': 'Performance',
    '/dashboard/data': 'Connected Data',
    '/dashboard/data-model': 'Your Business',
    '/dashboard/ai-assistant': 'AI Assistant',
    '/dashboard/alerts': 'Alerts',
    '/dashboard/settings': 'Settings',
  };

  const topbarLabel = (() => {
    if (pageLabels[pathname]) return pageLabels[pathname];
    const sorted = Object.entries(pageLabels).sort(
      ([a], [b]) => b.length - a.length,
    );
    return (
      sorted.find(([path]) => pathname.startsWith(`${path}/`))?.[1] ?? 'Aether'
    );
  })();

  if (isLoading || isOrgLoading || !user || !profile || !primaryOrg) {
    return (
      <div className="flex h-screen bg-[#0A0A0A] overflow-hidden">
        <div className="w-72 border-r border-zinc-800 bg-[#0A0A0A] flex flex-col animate-pulse">
          <div className="p-6 border-b border-zinc-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-800 rounded-2xl" />
            <div className="space-y-2">
              <div className="h-4 w-24 rounded-full bg-zinc-800" />
              <div className="h-3 w-40 rounded-full bg-zinc-900" />
            </div>
          </div>
          <div className="flex-1 p-3 space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-9 rounded-2xl bg-zinc-900" />
            ))}
          </div>
          <div className="p-4 border-t border-zinc-800">
            <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-zinc-900">
              <div className="w-9 h-9 bg-zinc-800 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-3 w-20 rounded-full bg-zinc-800" />
                <div className="h-2 w-16 rounded-full bg-zinc-900" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="h-16 border-b border-zinc-800 bg-[#0A0A0A]/90 backdrop-blur-md flex items-center px-8">
            <div className="h-4 w-28 rounded-full bg-zinc-900" />
            <div className="ml-auto flex items-center gap-3">
              <div className="h-6 w-24 rounded-full bg-zinc-900" />
              <div className="h-9 w-9 rounded-full bg-zinc-900" />
              <div className="h-8 w-32 rounded-2xl bg-zinc-900" />
            </div>
          </div>

          <main className="flex-1 overflow-auto p-8">
            <div className="space-y-6">
              <div className="h-8 w-64 rounded-full bg-zinc-900" />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 rounded-3xl border border-zinc-800 bg-zinc-950"
                  />
                ))}
              </div>
              <div className="h-96 rounded-3xl border border-zinc-800 bg-zinc-950" />
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] overflow-hidden">
      <button
        type="button"
        className="fixed top-4 left-4 z-50 rounded-xl border border-zinc-800 bg-zinc-900 p-2 lg:hidden"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? (
          <X className="h-5 w-5 text-slate-300" />
        ) : (
          <Menu className="h-5 w-5 text-slate-300" />
        )}
      </button>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 transition-transform duration-300 lg:relative lg:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar
          navItems={navItems}
          orgName={displayOrgName}
          userName={displayUserName}
          userRole={displayUserRole}
          onSignOut={handleSignOut}
          onNavigate={() => setMobileMenuOpen(false)}
          alertsCount={alertsCount}
          isGroup={isGroup}
          childOrgs={childOrgs}
          viewMode={viewMode}
          activeOrgId={org?.id}
          onSwitchOrg={switchToOrg}
          onSwitchPortfolio={switchToPortfolio}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="relative z-50 pl-14 lg:pl-0">
          <Topbar
            plan={effectiveOrg?.plan ?? 'starter'}
            userName={displayUserName}
            onSignOut={handleSignOut}
            alertsCount={alertsCount}
            title={topbarLabel}
          />
        </div>
        <main className="relative z-0 flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
