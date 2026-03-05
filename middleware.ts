import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import {
  isDevHost,
  isRootDomain,
  APP_URL,
  ROOT_URL,
} from '@/lib/constants/domains';

// ── Routes that are valid on the root (marketing) domain ────────────
const ROOT_ALLOWED_PREFIXES = ['/', '/api/waitlist'];

function isRootAllowed(path: string): boolean {
  if (path === '/') return true;
  return ROOT_ALLOWED_PREFIXES.some(
    (prefix) => prefix !== '/' && path.startsWith(prefix),
  );
}

// ── Routes that should redirect from app subdomain back to root ─────
const APP_REDIRECT_TO_ROOT = ['/'];

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const path = request.nextUrl.pathname;

  // ── Hostname gating (skip on dev / preview deploys) ─────────────
  if (!isDevHost(host)) {
    // Root domain: only serve landing + waitlist API
    if (isRootDomain(host) && !isRootAllowed(path)) {
      return NextResponse.redirect(`${APP_URL}${path}${request.nextUrl.search}`);
    }

    // App subdomain: redirect bare "/" back to marketing site
    if (!isRootDomain(host) && APP_REDIRECT_TO_ROOT.includes(path)) {
      return NextResponse.redirect(ROOT_URL);
    }
  }

  // ── Existing auth middleware (unchanged) ────────────────────────
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any) {
          cookiesToSet.forEach(({ name, value }: any) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: any) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && path.startsWith('/dashboard')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && (path === '/login' || path === '/signup')) {
    const nextParam = request.nextUrl.searchParams.get('next');
    if (nextParam?.startsWith('/')) {
      const url = request.nextUrl.clone();
      url.pathname = nextParam;
      url.search = '';
      return NextResponse.redirect(url);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const url = request.nextUrl.clone();
    if (profile?.org_id) {
      url.pathname = '/dashboard';
    } else {
      url.pathname = '/onboarding';
    }
    return NextResponse.redirect(url);
  }

  if (user && path === '/onboarding') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (profile?.org_id) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/',
    '/dashboard/:path*',
    '/login',
    '/signup',
    '/onboarding',
    '/invite/:path*',
  ],
};
