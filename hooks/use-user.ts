// Hook to load and cache the current Supabase user, profile, and organization.
'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';

import { createClient } from '@/lib/supabase/client';

export interface Profile {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string;
  avatar_url: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  timezone: string;
  currency: string;
  logo_url: string | null;
  plan: string;
}

interface UserState {
  user: User | null;
  profile: Profile | null;
  org: Organization | null;
  loaded: boolean;
}

const EMPTY_STATE: UserState = {
  user: null,
  profile: null,
  org: null,
  loaded: false,
};

let cachedState: UserState | null = null;
let inFlightPromise: Promise<UserState> | null = null;
let authListenerSubscribed = false;

/** Clear the module-level cache so the next useUser() call refetches. */
export function clearUserCache(): void {
  cachedState = null;
  inFlightPromise = null;
}

// Subscribe once to auth state changes so we can invalidate the cache
// when the user signs out or a different user signs in.
function ensureAuthListener(): void {
  if (authListenerSubscribed) return;
  authListenerSubscribed = true;

  const supabase = createClient();
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      clearUserCache();
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      // A different user may have signed in — invalidate so we refetch.
      const currentUserId = cachedState?.user?.id;
      supabase.auth.getUser().then(({ data }) => {
        if (data.user?.id !== currentUserId) {
          clearUserCache();
        }
      });
    }
  });
}

async function loadUserState(): Promise<UserState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const anonymousState: UserState = { ...EMPTY_STATE, loaded: true };
    cachedState = anonymousState;
    return anonymousState;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, full_name, email, role, avatar_url')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  let org: Organization | null = null;

  if (profile?.org_id) {
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name, slug, industry, timezone, currency, logo_url, plan')
      .eq('id', profile.org_id)
      .maybeSingle<Organization>();

    org = organization ?? null;
  }

  const nextState: UserState = {
    user,
    profile: profile ?? null,
    org,
    loaded: true,
  };

  cachedState = nextState;
  return nextState;
}

export function useUser(): {
  user: User | null;
  profile: Profile | null;
  org: Organization | null;
  isLoading: boolean;
} {
  const [state, setState] = useState<UserState>(
    () => cachedState ?? { ...EMPTY_STATE },
  );

  useEffect(() => {
    ensureAuthListener();

    let cancelled = false;

    if (cachedState && cachedState.loaded) {
      // Cache may have been populated by another component — sync local state.
      setState(cachedState);
      return;
    }

    if (!inFlightPromise) {
      inFlightPromise = loadUserState().finally(() => {
        inFlightPromise = null;
      });
    }

    inFlightPromise
      .then((loadedState) => {
        if (!cancelled) {
          setState(loadedState);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ ...EMPTY_STATE, loaded: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    user: state.user,
    profile: state.profile,
    org: state.org,
    isLoading: !state.loaded,
  };
}
