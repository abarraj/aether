// Hook to expose active organization, portfolio mode, and switching.
'use client';

import { useUser, type Organization } from '@/hooks/use-user';
import { useOrgSwitcher, type ViewMode } from '@/hooks/use-org-switcher';

export function useOrg(): {
  org: Organization | null;
  primaryOrg: Organization | null;
  childOrgs: Organization[];
  viewMode: ViewMode;
  isGroup: boolean;
  switchToOrg: (orgId: string) => void;
  switchToPortfolio: () => void;
  activeOrgIds: string[];
  isLoading: boolean;
} {
  const { org: primaryOrg, isLoading: isUserLoading } = useUser();
  const switcher = useOrgSwitcher(primaryOrg, isUserLoading);

  return {
    org: switcher.activeOrg ?? primaryOrg,
    primaryOrg,
    childOrgs: switcher.childOrgs,
    viewMode: switcher.viewMode,
    isGroup: switcher.isGroup,
    switchToOrg: switcher.switchToOrg,
    switchToPortfolio: switcher.switchToPortfolio,
    activeOrgIds: switcher.activeOrgIds,
    isLoading: isUserLoading || switcher.isLoading,
  };
}

