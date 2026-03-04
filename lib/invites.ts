import crypto from 'crypto';

export function generateTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export function buildInviteLink(rawToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) throw new Error('Missing NEXT_PUBLIC_APP_URL');
  return `${baseUrl}/invite/${rawToken}`;
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export { INVITABLE_ROLES as ALLOWED_INVITE_ROLES, type InvitableRole as InviteRole } from '@/lib/auth/permissions';
