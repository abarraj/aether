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

  const isGroup = org?.org_type === 'group';

  useEffect(() => {
    if (!org || isUserLoading) return;

    if (!isGroup) {
      setActiveOrg(org);
      setViewMode('single');
      setChildOrgs([]);
      setIsLoading(false);
      return;
    }

    const fetchChildren = async () => {
      setIsLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('organizations')
        .select(
          'id, name, slug, industry, timezone, currency, logo_url, plan, org_type, parent_org_id',
        )
        .eq('parent_org_id', org.id)
        .order('name');

      const children = (data ?? []) as Organization[];
      setChildOrgs(children);

      const savedOrgId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const savedMode = (typeof window !== 'undefined'
        ? localStorage.getItem(VIEW_MODE_KEY)
        : null) as ViewMode | null;

      if (savedMode === 'single' && savedOrgId) {
        const found = children.find((c) => c.id === savedOrgId);
        if (found) {
          setActiveOrg(found);
          setViewMode('single');
        } else {
          setActiveOrg(org);
          setViewMode('portfolio');
        }
      } else {
        setActiveOrg(org);
        setViewMode('portfolio');
      }

      setIsLoading(false);
    };

    void fetchChildren();
  }, [org?.id, isUserLoading, isGroup]);

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

