// Domain constants for hostname-aware routing.
// Root domain serves the marketing / landing page.
// App subdomain serves the authenticated application.

export const ROOT_DOMAINS = ['aethercoo.ai', 'www.aethercoo.ai'] as const;

export const APP_DOMAIN = 'app.aethercoo.ai';

/** Fully-qualified app origin (used for cross-domain links on the landing page). */
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? `https://${APP_DOMAIN}`;

/** Fully-qualified root origin (used for cross-domain links in the app). */
export const ROOT_URL =
  process.env.NEXT_PUBLIC_ROOT_URL ?? 'https://aethercoo.ai';

/** Returns true when running on localhost / preview deployments. */
export function isDevHost(host: string): boolean {
  return (
    host.startsWith('localhost') ||
    host.includes('vercel.app') ||
    host.startsWith('127.0.0.1')
  );
}

/** Returns true when the host matches the root marketing domain. */
export function isRootDomain(host: string): boolean {
  // Strip port for localhost comparisons
  const bare = host.split(':')[0] ?? host;
  return (ROOT_DOMAINS as readonly string[]).includes(bare);
}

/** Returns true when the host matches the app subdomain. */
export function isAppDomain(host: string): boolean {
  const bare = host.split(':')[0] ?? host;
  return bare === APP_DOMAIN;
}
