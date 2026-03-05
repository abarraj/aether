// Client-side permission hook. Reads role from useUser() and checks
// against the canonical permission matrix.
'use client';

import { useUser } from '@/hooks/use-user';
import { hasPermission, type Permission, type Role } from '@/lib/auth/permissions';

/**
 * Check whether the current user has a specific permission.
 * Returns `false` while the user is still loading.
 */
export function usePermission(permission: Permission): boolean {
  const { profile } = useUser();
  if (!profile?.role) return false;
  return hasPermission(profile.role as Role, permission);
}

/**
 * Return the current user's role (or null if not loaded).
 */
export function useRole(): Role | null {
  const { profile } = useUser();
  if (!profile?.role) return null;
  return profile.role as Role;
}
