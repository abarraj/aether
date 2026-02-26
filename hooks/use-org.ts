// Hook to return the current organization details from Supabase.
'use client';

import { useUser } from '@/hooks/use-user';

export function useOrg() {
  const { org, isLoading } = useUser();

  return {
    org,
    isLoading,
  };
}

