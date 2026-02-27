// Security settings: authentication, access controls, and security policies.

'use client';

import React from 'react';
import { Lock, Mail, Shield, ShieldCheck } from 'lucide-react';

import { useUser } from '@/hooks/use-user';

type PlanKey = 'starter' | 'growth' | 'enterprise';

const ROLE_PERMISSIONS = [
  {
    label: 'View dashboard',
    owner: true,
    admin: true,
    member: true,
    viewer: true,
  },
  {
    label: 'Upload data',
    owner: true,
    admin: true,
    member: true,
    viewer: false,
  },
  {
    label: 'Use AI assistant',
    owner: true,
    admin: true,
    member: true,
    viewer: false,
  },
  {
    label: 'Manage team',
    owner: true,
    admin: true,
    member: false,
    viewer: false,
  },
  {
    label: 'Manage billing',
    owner: true,
    admin: false,
    member: false,
    viewer: false,
  },
  {
    label: 'Manage integrations',
    owner: true,
    admin: true,
    member: false,
    viewer: false,
  },
  {
    label: 'View audit log',
    owner: true,
    admin: true,
    member: false,
    viewer: false,
  },
  {
    label: 'Delete data',
    owner: true,
    admin: true,
    member: false,
    viewer: false,
  },
  {
    label: 'Manage settings',
    owner: true,
    admin: false,
    member: false,
    viewer: false,
  },
];

function PermissionCell({ enabled }: { enabled: boolean }) {
  return (
    <div className="flex items-center justify-center">
      {enabled ? (
        <span className="text-emerald-400">✓</span>
      ) : (
        <span className="text-zinc-600">✗</span>
      )}
    </div>
  );
}

export default function SecuritySettingsPage() {
  const { org } = useUser();

  const plan: PlanKey =
    org?.plan && ['starter', 'growth', 'enterprise'].includes(org.plan)
      ? (org.plan as PlanKey)
      : 'starter';

  const isEnterprise = plan === 'enterprise';

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Security</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage authentication, access controls, and security policies for your workspace.
        </p>
      </div>

      {/* Authentication */}
      <section className="space-y-4">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          Authentication
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Sign-in methods */}
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-sm text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">Sign-in methods</div>
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-400">
                Supabase Auth
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Aether currently supports password-based, magic link, and Google OAuth sign-in.
            </p>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-200">Email &amp; Password</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                  Enabled
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-200">Magic Link</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                  Enabled
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-slate-200">Google OAuth</span>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                  Enabled
                </span>
              </div>
            </div>
          </div>

          {/* SSO */}
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-sm text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400" />
                <span className="font-medium">Single Sign-On (SSO)</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-400">
                <ShieldCheck className="h-3 w-3" />
                Enterprise
              </span>
            </div>
            {isEnterprise ? (
              <>
                <p className="text-xs text-slate-400">
                  Configure SAML 2.0 SSO with your identity provider. Once enabled, members will
                  authenticate via your IdP instead of passwords.
                </p>
                <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-[11px] text-slate-400">SAML entity ID</div>
                    <input
                      type="text"
                      placeholder="urn:your-company:aether"
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                      disabled
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="text-[11px] text-slate-400">SSO URL</div>
                    <input
                      type="text"
                      placeholder="https://your-idp.example.com/sso/saml"
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                      disabled
                    />
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Full SSO configuration will be wired with your Aether implementation team.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-slate-400">
                  Available on the Enterprise plan. Configure SAML 2.0 SSO with your identity
                  provider (Okta, Azure AD, OneLogin) for centralized access control.
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-zinc-900"
                >
                  Preview Enterprise capabilities
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Access controls */}
      <section className="space-y-4">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          Access controls
        </div>

        {/* Role permissions */}
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-sm text-slate-200">Role permissions</div>
            <span className="text-[11px] text-slate-500">
              Four built-in roles, tuned for operational teams.
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-[11px]">
              <thead>
                <tr>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-500">Permission</th>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-400 text-center">
                    Owner
                  </th>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-400 text-center">
                    Admin
                  </th>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-400 text-center">
                    Member
                  </th>
                  <th className="border-b border-zinc-800 px-3 py-2 text-slate-400 text-center">
                    Viewer
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLE_PERMISSIONS.map((row) => (
                  <tr key={row.label} className="bg-zinc-950">
                    <td className="border-b border-zinc-900 px-3 py-2 text-slate-200">
                      {row.label}
                    </td>
                    <td className="border-b border-zinc-900 px-3 py-2">
                      <PermissionCell enabled={row.owner} />
                    </td>
                    <td className="border-b border-zinc-900 px-3 py-2">
                      <PermissionCell enabled={row.admin} />
                    </td>
                    <td className="border-b border-zinc-900 px-3 py-2">
                      <PermissionCell enabled={row.member} />
                    </td>
                    <td className="border-b border-zinc-900 px-3 py-2">
                      <PermissionCell enabled={row.viewer} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Custom roles and finer-grained permissions are available on the Enterprise plan. When
            you&apos;re ready, we&apos;ll mirror your internal access model one-to-one.
          </p>
        </div>

        {/* Session management */}
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-200">Session management</div>
              <p className="mt-1 text-xs text-slate-400">
                View active sessions on your account. Revocation and geo-awareness are being wired
                in with Supabase Auth.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <div>
                <div className="text-xs text-slate-200">Current device</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Signed in from this browser. Location and IP details will appear here as session
                  telemetry is enabled.
                </div>
              </div>
              <div className="text-right text-[11px] text-slate-500">
                <div>Last active: now</div>
                <div className="mt-1">IP: —</div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <div className="text-[11px] text-slate-400">Session timeout</div>
              <select
                defaultValue="8h"
                className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[11px] text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
              >
                <option value="1h">1 hour</option>
                <option value="4h">4 hours</option>
                <option value="8h">8 hours</option>
                <option value="24h">24 hours</option>
                <option value="1w">1 week</option>
              </select>
            </div>
            <div className="text-[11px] text-slate-500">
              Changes to session lifetime will apply to new sign-ins once configured with your Aether
              team.
            </div>
          </div>
        </div>
      </section>

      {/* Security policies */}
      <section className="space-y-4">
        <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
          Security policies
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Password policy */}
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-sm font-medium text-slate-200">Password policy</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-400">
                <Lock className="h-3 w-3" />
                Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Current defaults: minimum 8 characters, recommended use of mixed case, numbers, and
              symbols.
            </p>
            {!isEnterprise && (
              <p className="mt-2 text-[11px] text-slate-500">
                Stronger, org-enforced password rules (length, complexity, rotation) are available
                on the Enterprise plan.
              </p>
            )}
          </div>

          {/* 2FA */}
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-sm font-medium text-slate-200">
                  Two-factor authentication (2FA)
                </span>
              </div>
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-400">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Add a second factor (TOTP, security keys, or push) to protect access to Aether.
            </p>
            <button
              type="button"
              disabled
              className="mt-3 inline-flex items-center rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-[11px] font-medium text-slate-400"
            >
              Enable 2FA
            </button>
          </div>

          {/* IP allowlist */}
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-sm font-medium text-slate-200">IP allowlist</span>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-slate-400">
                <Shield className="h-3 w-3" />
                Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Restrict access to specific IP addresses or ranges to keep Aether on your corporate
              network surface area.
            </p>
            {!isEnterprise && (
              <p className="mt-2 text-[11px] text-slate-500">
                When you are ready for full perimeter control, your implementation team will help
                you configure IP ranges and enforcement.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}


