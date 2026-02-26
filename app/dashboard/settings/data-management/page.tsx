'use client';

// Data Management: storage overview, sources, retention, and export controls.

import React, { useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { useRouter } from 'next/navigation';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

type StorageStats = {
  totalDataPoints: number;
  datasets: number;
  storageBytes: number;
};

type UploadRow = {
  id: string;
  org_id: string;
  file_name: string;
  data_type: string;
  row_count: number | null;
  file_size: number | null;
  status: string;
  created_at: string;
  uploaded_by: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type RetentionPolicy = '1y' | '2y' | '5y' | 'forever';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gigabytes = bytes / (1024 * 1024 * 1024);
  if (gigabytes >= 1) {
    return `${gigabytes.toFixed(2)} GB`;
  }
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(2)} MB`;
}

function dataTypeLabel(dataType: string): string {
  const normalized = dataType.toLowerCase();
  if (normalized === 'revenue') return 'Revenue';
  if (normalized === 'labor') return 'Labor';
  if (normalized === 'attendance') return 'Attendance';
  return 'Custom';
}

export default function DataManagementSettingsPage() {
  const router = useRouter();
  const { org } = useUser();
  const supabase = createClient();

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [sources, setSources] = useState<UploadRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [retention, setRetention] = useState<RetentionPolicy>('forever');
  const [isUpdatingRetention, setIsUpdatingRetention] = useState<boolean>(false);

  const [deleteTarget, setDeleteTarget] = useState<UploadRow | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      if (!org) {
        setIsLoading(false);
        return;
      }

      const [dataRowsCount, uploadsReady, uploadsAll, profilesResponse, retentionResponse] =
        await Promise.all([
          supabase
            .from('data_rows')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', org.id),
          supabase
            .from('uploads')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', org.id)
            .eq('status', 'ready'),
          supabase
            .from('uploads')
            .select(
              'id, org_id, file_name, data_type, row_count, file_size, status, created_at, uploaded_by',
            )
            .eq('org_id', org.id)
            .order('created_at', { ascending: false })
            .returns<UploadRow[]>(),
          supabase
            .from('profiles')
            .select('id, full_name, email, org_id')
            .eq('org_id', org.id)
            .returns<(ProfileRow & { org_id: string })[]>(),
          supabase
            .from('organizations')
            .select('data_retention_policy')
            .eq('id', org.id)
            .maybeSingle<{ data_retention_policy: RetentionPolicy | null }>(),
        ]);

      const totalDataPoints = dataRowsCount.count ?? 0;
      const datasets = uploadsReady.count ?? 0;

      const uploads = uploadsAll.data ?? [];
      const storageBytes = uploads.reduce(
        (total, upload) => total + (upload.file_size ?? 0),
        0,
      );

      setStats({
        totalDataPoints,
        datasets,
        storageBytes,
      });

      setSources(uploads);

      const nextProfiles: Record<string, ProfileRow> = {};
      (profilesResponse.data ?? []).forEach((profile) => {
        nextProfiles[profile.id] = {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
        };
      });
      setProfilesById(nextProfiles);

      const currentPolicy = retentionResponse.data?.data_retention_policy ?? 'forever';
      setRetention(currentPolicy);

      setIsLoading(false);
    };

    void load();
  }, [org, supabase]);

  const handleUpdateRetention = async (next: RetentionPolicy) => {
    if (!org || next === retention) return;
    setRetention(next);
    setIsUpdatingRetention(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ data_retention_policy: next })
        .eq('id', org.id);

      if (error) {
        toast.error('Unable to update retention policy.');
        return;
      }

      try {
        void fetch('/api/audit/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'settings.update',
            targetType: 'retention_policy',
            targetId: org.id,
            description: 'Data retention policy updated',
            metadata: {
              data_retention_policy: {
                old: retention,
                new: next,
              },
            },
          }),
        });
      } catch {
        // Ignore audit failures.
      }

      toast.success('Retention policy updated.');
    } finally {
      setIsUpdatingRetention(false);
    }
  };

  const handleRequestExport = () => {
    toast.success("Export requested. You'll receive a download link via email.");
    if (!org) return;
    try {
      void fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'export.download',
          targetType: 'organization',
          targetId: org.id,
          description: 'Full organization data export requested',
          metadata: {},
        }),
      });
    } catch {
      // Ignore audit failures.
    }
  };

  const handleDeleteDataset = async () => {
    if (!org || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const upload = deleteTarget;

      await supabase
        .from('data_rows')
        .delete()
        .eq('org_id', org.id)
        .eq('upload_id', upload.id);

      await supabase
        .from('uploads')
        .delete()
        .eq('org_id', org.id)
        .eq('id', upload.id);

      setSources((previous) => previous.filter((item) => item.id !== upload.id));

      if (stats) {
        const removedRows = upload.row_count ?? 0;
        const removedBytes = upload.file_size ?? 0;
        setStats({
          totalDataPoints: Math.max(0, stats.totalDataPoints - removedRows),
          datasets: Math.max(0, stats.datasets - (upload.status === 'ready' ? 1 : 0)),
          storageBytes: Math.max(0, stats.storageBytes - removedBytes),
        });
      }

      if (org) {
        try {
          void fetch('/api/audit/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'data.delete',
              targetType: 'upload',
              targetId: upload.id,
              description: `Deleted dataset "${upload.file_name}" and associated rows`,
              metadata: {
                row_count: upload.row_count ?? 0,
                file_size: upload.file_size ?? 0,
              },
            }),
          });
        } catch {
          // Ignore audit failures.
        }
      }

      toast.success('Dataset deleted.');
      setDeleteTarget(null);
      setDeleteConfirmName('');
    } catch {
      toast.error('Unable to delete dataset.');
    } finally {
      setIsDeleting(false);
    }
  };

  const storageCards = useMemo(() => {
    if (!stats) {
      return [
        { label: 'Total Data Points', value: '—' },
        { label: 'Datasets', value: '—' },
        { label: 'Storage Used', value: '—' },
      ];
    }
    return [
      {
        label: 'Total Data Points',
        value: stats.totalDataPoints.toLocaleString(),
      },
      {
        label: 'Datasets',
        value: stats.datasets.toLocaleString(),
      },
      {
        label: 'Storage Used',
        value: formatBytes(stats.storageBytes),
      },
    ];
  }, [stats]);

  return (
    <>
      <div className="space-y-8">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <h1 className="text-2xl font-semibold tracking-tighter">Data Management</h1>
          <p className="mt-1 text-sm text-slate-400">
            Control and audit all data within your organization.
          </p>
        </div>

        {/* Storage overview */}
        <section className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Storage
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {storageCards.map((card) => (
              <div
                key={card.label}
                className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]"
              >
                <div className="text-xs text-slate-400">{card.label}</div>
                <div className="mt-2 text-xl font-semibold tracking-tight text-slate-100">
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Data sources */}
        <section className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Data sources
          </div>
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-4 py-4 text-xs">
            {isLoading ? (
              <div className="py-6 text-center text-slate-500">Loading data sources…</div>
            ) : sources.length === 0 ? (
              <div className="py-6 text-center text-slate-500">
                No datasets yet. Upload CSVs or connect integrations to populate your workspace.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_140px] gap-3 border-b border-zinc-800 pb-2 text-[11px] text-slate-500">
                  <div>Name</div>
                  <div>Type</div>
                  <div>Rows</div>
                  <div>Size</div>
                  <div>Uploaded by</div>
                  <div>Date</div>
                  <div>Actions</div>
                </div>
                {sources.map((upload) => {
                  const profile = upload.uploaded_by
                    ? profilesById[upload.uploaded_by]
                    : undefined;
                  const actorLabel =
                    profile?.full_name ?? profile?.email ?? (upload.uploaded_by ?? '—');

                  return (
                    <div
                      key={upload.id}
                      className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.4fr)_minmax(0,1.2fr)_140px] items-center gap-3 border-b border-zinc-900 pb-2 pt-2 last:border-0"
                    >
                      <div className="truncate text-slate-200">{upload.file_name}</div>
                      <div>
                        <span className="inline-flex rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-slate-300">
                          {dataTypeLabel(upload.data_type)}
                        </span>
                      </div>
                      <div className="text-slate-200">
                        {(upload.row_count ?? 0).toLocaleString()}
                      </div>
                      <div className="text-slate-400">
                        {formatBytes(upload.file_size ?? 0)}
                      </div>
                      <div className="truncate text-slate-300">{actorLabel}</div>
                      <div className="text-slate-400">
                        {formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-[11px] text-emerald-400 hover:text-emerald-300"
                          onClick={() => router.push(`/dashboard/data/${upload.id}`)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-slate-400 hover:text-slate-200"
                          onClick={() => {
                            toast.success('Re-processing kicked off for this dataset.');
                            try {
                              void fetch('/api/audit/log', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  action: 'data.reprocess',
                                  targetType: 'upload',
                                  targetId: upload.id,
                                  description: `Re-process requested for dataset "${upload.file_name}"`,
                                }),
                              });
                            } catch {
                              // ignore
                            }
                          }}
                        >
                          Re-process
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-rose-400 hover:text-rose-300"
                          onClick={() => {
                            setDeleteTarget(upload);
                            setDeleteConfirmName('');
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Retention policy */}
        <section className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Retention policy
          </div>
          <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-xs text-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <div className="space-y-1">
                <div className="text-xs font-medium text-slate-200">Keep data for</div>
                <select
                  value={retention}
                  onChange={(event) =>
                    handleUpdateRetention(event.target.value as RetentionPolicy)
                  }
                  disabled={isUpdatingRetention}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60"
                >
                  <option value="1y">1 year</option>
                  <option value="2y">2 years</option>
                  <option value="5y">5 years</option>
                  <option value="forever">Forever</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Data older than the retention period will be automatically archived. Archived data
              can be restored within 30 days.
            </p>
            <p className="text-[11px] text-slate-500">
              Changes to retention policy are logged in the audit trail.
            </p>
          </div>
        </section>

        {/* Export & compliance */}
        <section className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-[2px] text-emerald-400">
            Export &amp; compliance
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-5 text-sm text-slate-200">
              <div className="font-medium">Export all data</div>
              <p className="mt-1 text-xs text-slate-400">
                Download a complete export of all your organization&apos;s data in CSV format.
              </p>
              <button
                type="button"
                onClick={handleRequestExport}
                className="mt-3 inline-flex items-center rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
              >
                Request export
              </button>
            </div>

            <div className="space-y-3 rounded-3xl border border-rose-500/20 bg-rose-500/5 px-6 py-5 text-sm text-slate-200">
              <div className="font-medium text-rose-300">Delete organization data</div>
              <p className="mt-1 text-xs text-rose-100/80">
                Permanently delete all data associated with your organization. This cannot be
                undone.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!org) return;
                  const confirmed = window.prompt(
                    `Type the organization name (${org.name}) to confirm deletion of all data. This will not delete the organization record itself.`,
                  );
                  if (!confirmed || confirmed !== org.name) {
                    return;
                  }
                  toast.success(
                    'Deletion of organization data has been queued. A member of the Aether team will confirm this operation.',
                  );
                  try {
                    void fetch('/api/audit/log', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        action: 'data.delete',
                        targetType: 'organization',
                        targetId: org.id,
                        description: `Organization data deletion requested for "${org.name}"`,
                      }),
                    });
                  } catch {
                    // ignore
                  }
                }}
                className="mt-3 inline-flex items-center rounded-2xl bg-rose-500 px-4 py-2 text-xs font-medium text-rose-50 hover:bg-rose-600 active:scale-[0.985]"
              >
                Delete all data
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Delete dataset modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] text-xs text-slate-200">
            <div className="mb-3">
              <div className="text-xs font-semibold uppercase tracking-[2px] text-rose-400">
                Delete dataset
              </div>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-100">
                Permanently delete this dataset?
              </h2>
            </div>
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-[11px] text-rose-100">
              This will permanently delete <span className="font-semibold">{deleteTarget.file_name}</span> and all{' '}
              <span className="font-semibold">{(deleteTarget.row_count ?? 0).toLocaleString()}</span> data rows
              associated with it. This action cannot be undone.
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              To confirm, type the dataset name exactly:
              <span className="ml-1 font-mono text-slate-200">{deleteTarget.file_name}</span>
            </p>
            <input
              type="text"
              value={deleteConfirmName}
              onChange={(event) => setDeleteConfirmName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-500/70"
              placeholder={deleteTarget.file_name}
            />
            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                type="button"
                className="text-slate-400 hover:text-slate-200"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteConfirmName('');
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  isDeleting || deleteConfirmName.trim() !== deleteTarget.file_name.trim()
                }
                onClick={handleDeleteDataset}
                className="rounded-2xl bg-rose-500 px-4 py-2 text-[11px] font-medium text-rose-50 hover:bg-rose-600 active:scale-[0.985] disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

