// Integrations Hub: the front door to Aether's data ontology.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Database, Plug, Upload } from 'lucide-react';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type UploadSource = {
  id: string;
  file_name: string;
  row_count: number | null;
  created_at: string;
};

type IntegrationRow = {
  id: string;
  org_id: string;
  type: string;
  name: string;
  config: Record<string, unknown> | null;
  status: string | null;
  last_sync_at: string | null;
};

type ApiKeyPermission = 'read' | 'write' | 'admin';

type ApiKeyRow = {
  id: string;
  org_id: string;
  name: string;
  key_prefix: string;
  permissions: ApiKeyPermission[] | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
};

const AVAILABLE_INTEGRATIONS: {
  id: string;
  name: string;
  category: string;
  description: string;
  status: 'connect' | 'connected' | 'coming_soon';
}[] = [
  // Data import
  {
    id: 'csv',
    name: 'Spreadsheet upload',
    category: 'Data Import',
    description: 'Flat-file imports for historical or ad-hoc datasets.',
    status: 'connected',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    category: 'Data Import',
    description: 'Live models and operational trackers from your sheets.',
    status: 'connect',
  },
  {
    id: 'microsoft_excel',
    name: 'Microsoft Excel',
    category: 'Data Import',
    description: 'Sync curated Excel workbooks into Aether.',
    status: 'coming_soon',
  },
  // Finance
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    category: 'Finance',
    description: 'Sync revenue and expense ledgers from QuickBooks.',
    status: 'coming_soon',
  },
  {
    id: 'xero',
    name: 'Xero',
    category: 'Finance',
    description: 'Bring in financial statements from Xero.',
    status: 'coming_soon',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Finance',
    description: 'Pipe subscription and payment events into your KPIs.',
    status: 'coming_soon',
  },
  // HR & workforce
  {
    id: 'bamboohr',
    name: 'BambooHR',
    category: 'HR & Workforce',
    description: 'Headcount, roles, and HR events for your teams.',
    status: 'coming_soon',
  },
  {
    id: 'gusto',
    name: 'Gusto',
    category: 'HR & Workforce',
    description: 'Payroll and labor cost feeds for real margins.',
    status: 'coming_soon',
  },
  {
    id: 'deputy',
    name: 'Deputy',
    category: 'HR & Workforce',
    description: 'Scheduling and attendance reality from the frontline.',
    status: 'coming_soon',
  },
  // Communication
  {
    id: 'slack',
    name: 'Slack',
    category: 'Communication',
    description: 'Route critical signals into focused channels.',
    status: 'coming_soon',
  },
  {
    id: 'microsoft_teams',
    name: 'Microsoft Teams',
    category: 'Communication',
    description: 'Bring alerts into your enterprise chat fabric.',
    status: 'coming_soon',
  },
  {
    id: 'smtp',
    name: 'Email / SMTP',
    category: 'Communication',
    description: 'Wire Aether into your email delivery rails.',
    status: 'coming_soon',
  },
  // CRM & sales
  {
    id: 'salesforce',
    name: 'Salesforce',
    category: 'CRM & Sales',
    description: 'Pipeline and account signals for frontline revenue teams.',
    status: 'coming_soon',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    category: 'CRM & Sales',
    description: 'Marketing and sales funnels into one operational view.',
    status: 'coming_soon',
  },
  // POS & e-commerce
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'POS & E‑commerce',
    description: 'Storefront performance, orders, and product velocity.',
    status: 'coming_soon',
  },
  {
    id: 'square',
    name: 'Square',
    category: 'POS & E‑commerce',
    description: 'Point-of-sale truth from your locations.',
    status: 'coming_soon',
  },
  // Project management
  {
    id: 'asana',
    name: 'Asana',
    category: 'Project Management',
    description: 'Initiatives and workstreams tied back to outcomes.',
    status: 'coming_soon',
  },
  {
    id: 'monday',
    name: 'Monday.com',
    category: 'Project Management',
    description: 'Operational boards surfaced alongside KPIs.',
    status: 'coming_soon',
  },
  {
    id: 'jira',
    name: 'Jira',
    category: 'Project Management',
    description: 'Engineering execution aligned with business performance.',
    status: 'coming_soon',
  },
];

export default function IntegrationsSettingsPage() {
  const { org } = useUser();
  const supabase = createClient();

  const [csvSources, setCsvSources] = useState<UploadSource[]>([]);
  const [sheetIntegrations, setSheetIntegrations] = useState<IntegrationRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState<boolean>(false);
  const [sheetsUrl, setSheetsUrl] = useState<string>('');
  const [isConnectingSheets, setIsConnectingSheets] = useState<boolean>(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [isApiKeysLoading, setIsApiKeysLoading] = useState<boolean>(true);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState<boolean>(false);
  const [keyName, setKeyName] = useState<string>('');
  const [keyPermissions, setKeyPermissions] = useState<ApiKeyPermission[]>(['read']);
  const [keyExpiry, setKeyExpiry] = useState<'never' | '30d' | '90d' | '1y'>('never');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [hasAcknowledgedKey, setHasAcknowledgedKey] = useState<boolean>(false);
  const [isCreatingKey, setIsCreatingKey] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      if (!org) {
        setIsLoading(false);
        return;
      }

      const [uploadsResponse, integrationsResponse, apiKeysResponse] = await Promise.all([
        supabase
          .from('uploads')
          .select('id, file_name, row_count, created_at, status')
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })
          .limit(12)
          .returns<(UploadSource & { status: string })[]>(),
        supabase
          .from('integrations')
          .select('id, org_id, type, name, config, status, last_sync_at')
          .eq('org_id', org.id)
          .eq('type', 'google_sheets')
          .order('created_at', { ascending: false })
          .returns<IntegrationRow[]>(),
        supabase
          .from('api_keys')
          .select(
            'id, org_id, name, key_prefix, permissions, created_at, last_used_at, expires_at, is_active',
          )
          .eq('org_id', org.id)
          .order('created_at', { ascending: false })
          .returns<ApiKeyRow[]>(),
      ]);

      setCsvSources((uploadsResponse.data ?? []).filter((u) => u.status === 'ready'));
      setSheetIntegrations(integrationsResponse.data ?? []);
      setApiKeys(apiKeysResponse.data ?? []);
      setIsLoading(false);
      setIsApiKeysLoading(false);
    };

    void load();
  }, [org, supabase]);

  const hasActiveConnections = useMemo(
    () => csvSources.length > 0 || sheetIntegrations.length > 0,
    [csvSources.length, sheetIntegrations.length],
  );

  const handleTogglePermission = (permission: ApiKeyPermission) => {
    setKeyPermissions((previous) => {
      if (previous.includes(permission)) {
        const next = previous.filter((value) => value !== permission);
        return next.length === 0 ? ['read'] : next;
      }
      return [...previous, permission];
    });
  };

  const handleCreateKey = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org || !keyName.trim()) return;

    try {
      setIsCreatingKey(true);
      setHasAcknowledgedKey(false);
      setCreatedKey(null);

      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: keyName.trim(),
          permissions: keyPermissions,
          expiry: keyExpiry,
        }),
      });

      if (!response.ok) {
        setIsCreatingKey(false);
        return;
      }

      const json = (await response.json()) as { key: string; apiKey: ApiKeyRow };
      setApiKeys((previous) => [json.apiKey, ...previous]);
      setCreatedKey(json.key);
      setKeyName('');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = async (apiKey: ApiKeyRow) => {
    if (!apiKey.is_active) return;
    const confirmed = window.confirm(
      `Revoke API key "${apiKey.name}"? This cannot be used once revoked.`,
    );
    if (!confirmed) return;

    const response = await fetch('/api/api-keys/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: apiKey.id }),
    });

    if (!response.ok) return;

    setApiKeys((previous) =>
      previous.map((item) =>
        item.id === apiKey.id
          ? {
              ...item,
              is_active: false,
            }
          : item,
      ),
    );
  };

  const renderPermissionsBadges = (permissions: ApiKeyPermission[] | null) => {
    const values = permissions && permissions.length > 0 ? permissions : ['read'];
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((permission) => (
          <span
            key={permission}
            className="inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-slate-300"
          >
            {permission.charAt(0).toUpperCase() + permission.slice(1)}
          </span>
        ))}
      </div>
    );
  };

  const handleConnectSheets = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!org || !sheetsUrl.trim()) return;

    try {
      setIsConnectingSheets(true);

      const url = new URL(sheetsUrl.trim());
      const inferredName = url.pathname
        .split('/')
        .filter(Boolean)
        .slice(-1)[0]
        ?.replace(/[-_]+/g, ' ')
        .trim();

      const { data, error } = await supabase
        .from('integrations')
        .insert({
          org_id: org.id,
          type: 'google_sheets',
          name: inferredName || 'Google Sheets source',
          config: { url: sheetsUrl.trim() },
          status: 'active',
        })
        .select('id, org_id, type, name, config, status, last_sync_at')
        .maybeSingle<IntegrationRow>();

      if (error || !data) {
        // For now we fail silently in UI; in a follow-up we can add toasts.
        setIsConnectingSheets(false);
        return;
      }

      setSheetIntegrations((previous) => [data, ...previous]);
      setSheetsUrl('');
      setIsSheetsModalOpen(false);
    } finally {
      setIsConnectingSheets(false);
    }
  };

  const renderActiveConnectionCard = (props: {
    icon: React.ReactNode;
    name: string;
    subtitle: string;
    meta: string;
  }) => (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
          {props.icon}
        </div>
        <div>
          <div className="text-sm font-medium text-slate-100">{props.name}</div>
          <div className="text-xs text-slate-500">{props.subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span>Connected</span>
        </div>
        <div className="text-[11px] text-slate-500">{props.meta}</div>
        <button
          type="button"
          className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1 text-[11px] font-medium text-slate-200 hover:bg-zinc-900"
        >
          Manage
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="space-y-8">
        {/* Header */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <h1 className="text-2xl font-semibold tracking-tighter">Integrations</h1>
          <p className="mt-1 text-sm text-slate-400">
            Connect your tools to unify your operational intelligence.
          </p>
        </div>

        {/* Active connections */}
        <section className="space-y-4">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Connected
          </div>

          {isLoading ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-6 text-xs text-slate-500">
              Scanning your workspace for connected sources…
            </div>
          ) : !hasActiveConnections ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/70 px-6 py-8 text-xs text-slate-400">
              <div className="mb-1 text-sm font-medium text-slate-200">No integrations connected</div>
              <p>
                No connections yet. Upload a spreadsheet or connect a tool to start building your
                intelligence layer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {csvSources.map((upload) =>
                renderActiveConnectionCard({
                  icon: <Upload className="h-4 w-4" />,
                  name: upload.file_name,
                  subtitle: 'Spreadsheet upload',
                  meta: `${new Date(upload.created_at).toLocaleString()} • ${
                    upload.row_count ?? 0
                  } rows`,
                }),
              )}

              {sheetIntegrations.map((integration) =>
                renderActiveConnectionCard({
                  icon: <Database className="h-4 w-4" />,
                  name: integration.name,
                  subtitle: 'Google Sheets',
                  meta:
                    integration.last_sync_at !== null
                      ? `Last sync ${new Date(integration.last_sync_at).toLocaleString()}`
                      : 'Not synced yet',
                }),
              )}
            </div>
          )}
        </section>

        {/* Available integrations */}
        <section className="space-y-4">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Available
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {AVAILABLE_INTEGRATIONS.map((integration) => {
              const isSheets = integration.id === 'google_sheets';
              const isCsv = integration.id === 'csv';
              const isComingSoon = integration.status === 'coming_soon';

              const isInteractive = isSheets;

              const handleClick = () => {
                if (isSheets) {
                  toast.info(
                    'Google Sheets integration launching soon. For now, export your sheet as CSV and upload it.',
                  );
                  setIsSheetsModalOpen(true);
                }
              };

                  return (
                    <button
                  key={integration.id}
                  type={isInteractive ? 'button' : 'button'}
                  onClick={isInteractive ? handleClick : undefined}
                  className={`flex flex-col items-start gap-3 rounded-2xl border px-6 py-5 text-left text-sm transition-all ${
                    isComingSoon
                      ? 'border-zinc-800 bg-zinc-950/80 text-slate-500 opacity-60 cursor-default'
                      : 'border-zinc-800 bg-zinc-950 text-slate-200 hover:border-emerald-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-zinc-900 text-xs font-semibold text-slate-200">
                      {integration.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-100">
                        {integration.name}
                      </div>
                      <div className="mt-1 inline-flex items-center rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-slate-400">
                        {integration.category}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">{integration.description}</p>
                  <div className="mt-2">
                    {integration.status === 'connect' && (
                      <span className="inline-flex items-center gap-1 rounded-2xl bg-emerald-500 px-4 py-1.5 text-[11px] font-medium text-slate-950">
                        <Plug className="h-3 w-3" />
                        Connect
                      </span>
                    )}
                    {integration.status === 'connected' && isCsv && (
                      <span className="inline-flex items-center gap-1 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        Connected
                      </span>
                    )}
                    {integration.status === 'coming_soon' && (
                      <span className="inline-flex items-center rounded-2xl border border-zinc-700 bg-zinc-900 px-3 py-1 text-[11px] font-medium text-slate-400">
                        Coming soon
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* API Access */}
        <section className="space-y-3" id="api-access">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            API access
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-sm text-slate-200 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">Programmatic access</div>
              <p className="mt-1 text-xs text-slate-400">
                Push data to Aether programmatically via REST API and keep your ontology in lockstep
                with your source systems.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => {
                  const section = document.getElementById('api-keys-section');
                  if (section) {
                    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
              >
                Manage API keys
              </button>
              <button
                type="button"
                className="text-slate-400 underline-offset-4 hover:text-emerald-400 hover:underline"
              >
                View API docs
              </button>
            </div>
          </div>
        </section>

        {/* API keys management */}
        <section className="space-y-3" id="api-keys-section">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
              API keys
            </div>
            <button
              type="button"
              onClick={() => {
                setIsKeyModalOpen(true);
                setCreatedKey(null);
                setHasAcknowledgedKey(false);
                setKeyPermissions(['read']);
                setKeyExpiry('never');
              }}
              className="rounded-2xl bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
            >
              Create new key
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-xs">
            {isApiKeysLoading ? (
              <div className="py-6 text-center text-slate-500">Loading API keys…</div>
            ) : apiKeys.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                No API keys yet. Create a scoped key to push data into Aether programmatically.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_80px] gap-3 border-b border-zinc-800 pb-2 text-[11px] text-slate-500">
                  <div>Name</div>
                  <div>Key prefix</div>
                  <div>Permissions</div>
                  <div>Created</div>
                  <div>Last used</div>
                  <div>Status</div>
                </div>
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_80px] items-center gap-3 border-b border-zinc-900 pb-2 pt-2 last:border-0"
                  >
                    <div className="truncate text-slate-200">{key.name}</div>
                    <div className="font-mono text-[11px] text-slate-400">
                      {key.key_prefix}
                      <span className="text-slate-600">••••••••••••</span>
                    </div>
                    <div>{renderPermissionsBadges(key.permissions)}</div>
                    <div className="text-slate-500">
                      {new Date(key.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-slate-500">
                      {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : 'Never'}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[11px] ${
                          key.is_active ? 'text-emerald-400' : 'text-slate-500'
                        }`}
                      >
                        {key.is_active ? 'Active' : 'Revoked'}
                      </span>
                      {key.is_active && (
                        <button
                          type="button"
                          onClick={() => handleRevokeKey(key)}
                          className="text-[11px] text-slate-400 hover:text-rose-400"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Google Sheets modal */}
      {isSheetsModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
            <div className="mb-4">
              <div className="text-xs font-semibold uppercase tracking-[2px] text-emerald-400">
                Google Sheets
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">
                Connect a Google Sheet
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Share your Google Sheet with Aether, then paste the sheet URL. We&apos;ll treat it
                as a live data source for your operational models.
              </p>
            </div>

            <form onSubmit={handleConnectSheets} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="sheets-url" className="block text-xs font-medium text-slate-300">
                  Google Sheet URL
                </label>
                <input
                  id="sheets-url"
                  type="url"
                  value={sheetsUrl}
                  onChange={(event) => setSheetsUrl(event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setSheetsUrl('');
                    setIsSheetsModalOpen(false);
                  }}
                  className="text-slate-400 hover:text-slate-200"
                  disabled={isConnectingSheets}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConnectingSheets || !sheetsUrl.trim()}
                  className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] disabled:opacity-60"
                >
                  {isConnectingSheets ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* API key creation modal */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
            {!createdKey ? (
              <>
                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-[2px] text-emerald-400">
                    API keys
                  </div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">
                    Create new API key
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Generate a scoped key for programmatic access. You&apos;ll see the full token
                    once, then only the prefix is visible.
                  </p>
                </div>

                <form onSubmit={handleCreateKey} className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <label htmlFor="api-key-name" className="block text-xs font-medium text-slate-300">
                      Name
                    </label>
                    <input
                      id="api-key-name"
                      type="text"
                      value={keyName}
                      onChange={(event) => setKeyName(event.target.value)}
                      placeholder="Production, Staging, CI, ..."
                      className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-300">Permissions</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['read', 'write', 'admin'] as ApiKeyPermission[]).map((permission) => (
                        <label
                          key={permission}
                          className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] ${
                            keyPermissions.includes(permission)
                              ? 'border-emerald-500/60 bg-emerald-500/5 text-emerald-400'
                              : 'border-zinc-800 bg-zinc-950 text-slate-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={keyPermissions.includes(permission)}
                            onChange={() => handleTogglePermission(permission)}
                            className="h-3 w-3 rounded border-zinc-700 bg-zinc-900 text-emerald-500"
                          />
                          <span className="capitalize">{permission}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-300">Expiration</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'never', label: 'Never' },
                        { value: '30d', label: '30 days' },
                        { value: '90d', label: '90 days' },
                        { value: '1y', label: '1 year' },
                      ].map((option) => (
                        <label
                          key={option.value}
                          className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2 text-[11px] ${
                            keyExpiry === option.value
                              ? 'border-emerald-500/60 bg-emerald-500/5 text-emerald-400'
                              : 'border-zinc-800 bg-zinc-950 text-slate-300'
                          }`}
                        >
                          <input
                            type="radio"
                            name="api-key-expiry"
                            value={option.value}
                            checked={keyExpiry === option.value}
                            onChange={() =>
                              setKeyExpiry(option.value as 'never' | '30d' | '90d' | '1y')
                            }
                            className="h-3 w-3 border-zinc-700 bg-zinc-900 text-emerald-500"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!isCreatingKey) {
                          setIsKeyModalOpen(false);
                          setKeyName('');
                          setKeyPermissions(['read']);
                          setKeyExpiry('never');
                        }
                      }}
                      className="text-slate-400 hover:text-slate-200"
                      disabled={isCreatingKey}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingKey || !keyName.trim()}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] disabled:opacity-60"
                    >
                      {isCreatingKey ? 'Creating…' : 'Create key'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <div className="text-xs font-semibold uppercase tracking-[2px] text-emerald-400">
                    API key created
                  </div>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">
                    Copy your key now
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    This token is shown only once. Store it securely in your secrets manager.
                  </p>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-2xl border border-emerald-500/30 bg-zinc-900 px-4 py-3 font-mono text-sm text-emerald-400">
                      {createdKey}
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(createdKey);
                          setHasAcknowledgedKey(true);
                        } catch {
                          // ignore
                        }
                      }}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-slate-200 hover:bg-zinc-900"
                    >
                      Copy
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-400">
                    Copy this key now. You won&apos;t be able to see it again.
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!hasAcknowledgedKey) return;
                      setIsKeyModalOpen(false);
                      setCreatedKey(null);
                      setHasAcknowledgedKey(false);
                    }}
                    className={`rounded-2xl px-4 py-2 text-[11px] font-medium ${
                      hasAcknowledgedKey
                        ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-600 active:scale-[0.985]'
                        : 'bg-zinc-800 text-slate-500'
                    }`}
                    disabled={!hasAcknowledgedKey}
                  >
                    I&apos;ve copied my key
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}


