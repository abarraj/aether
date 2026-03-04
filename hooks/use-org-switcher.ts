'use client';

import { useCallback, useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Organization } from '@/hooks/use-user';

export type ViewMode = 'portfolio' | 'single';

interface OrgSwitcherState {
  activeOrg: Organization | null;
  childOrgs: Organization[];
  viewMode: ViewMode;
  isGroup: boolean;
  isLoading: boolean;
  switchToOrg: (orgId: string) => void;
  switchToPortfolio: () => void;
  activeOrgIds: string[];
}

const STORAGE_KEY = 'aether_active_org';
const VIEW_MODE_KEY = 'aether_view_mode';

export function useOrgSwitcher(org: Organization | null, isUserLoading: boolean): OrgSwitcherState {
  const [childOrgs, setChildOrgs] = useState<Organization[]>([]);
  const [activeOrg, setActiveOrg] = useState<Organization | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('portfolio');
  const [isLoading, setIsLoading] = useState(true);

  // Multi-org (group/child) columns don't exist in the schema yet.
  // For now every org is treated as standalone. When org_type and
  // parent_org_id columns are added, flip this to:
  //   const isGroup = org?.org_type === 'group';
  const isGroup = false;

  useEffect(() => {
    if (!org || isUserLoading) return;

    // Until the multi-org schema is created, every org is standalone.
    setActiveOrg(org);
    setViewMode('single');
    setChildOrgs([]);
    setIsLoading(false);
  }, [org?.id, isUserLoading]);

  const switchToOrg = useCallback(
    (orgId: string) => {
      const found = childOrgs.find((c) => c.id === orgId);
      if (found) {
        setActiveOrg(found);
        setViewMode('single');
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, orgId);
          localStorage.setItem(VIEW_MODE_KEY, 'single');
        }
      }
    },
    [childOrgs],
  );

  const switchToPortfolio = useCallback(() => {
    if (org) {
      setActiveOrg(org);
      setViewMode('portfolio');
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(VIEW_MODE_KEY, 'portfolio');
      }
    }
  }, [org]);

  const activeOrgIds: string[] = (() => {
    if (!isGroup) return activeOrg ? [activeOrg.id] : [];
    if (viewMode === 'portfolio') return childOrgs.map((c) => c.id);
    return activeOrg ? [activeOrg.id] : [];
  })();

  return {
    activeOrg,
    childOrgs,
    viewMode,
    isGroup,
    isLoading,
    switchToOrg,
    switchToPortfolio,
    activeOrgIds,
  };
}

