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
   org_type: string;
   parent_org_id: string | null;
}

interface UserState {
  user: User | null;
  profile: Profile | null;
  org: Organization | null;
  loaded: boolean;
}

let cachedState: UserState | null = null;
let inFlightPromise: Promise<UserState> | null = null;

async function loadUserState(): Promise<UserState> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const anonymousState: UserState = {
      user: null,
      profile: null,
      org: null,
      loaded: true,
    };
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
      .select('id, name, slug, industry, timezone, currency, logo_url, plan, org_type, parent_org_id')
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
    () =>
      cachedState ?? {
        user: null,
        profile: null,
        org: null,
        loaded: false,
      },
  );

  useEffect(() => {
    let cancelled = false;

    if (cachedState && cachedState.loaded) {
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
          setState({
            user: null,
            profile: null,
            org: null,
            loaded: true,
          });
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

