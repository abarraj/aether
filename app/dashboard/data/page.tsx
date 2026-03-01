// Dashboard data page showing uploads and entry point for new CSV imports.
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, FileSpreadsheet, Link2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/use-user';
import { useRealtimeTable } from '@/hooks/use-realtime';
import { UploadDropzone } from '@/components/data/upload-dropzone';

type UploadStatus = 'pending' | 'processing' | 'ready' | 'error';

interface UploadRow {
  id: string;
  file_name: string;
  file_path: string;
  data_type: string;
  row_count: number | null;
  status: UploadStatus;
  created_at: string;
}

export default function DataPage() {
  const router = useRouter();
  const { org, isLoading } = useUser();

  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [isLoadingUploads, setIsLoadingUploads] = useState<boolean>(false);
  const [isDropzoneOpen, setIsDropzoneOpen] = useState<boolean>(false);
  const [addDataModalOpen, setAddDataModalOpen] = useState<boolean>(false);
  const [googleSheetsOpen, setGoogleSheetsOpen] = useState<boolean>(false);
  const [uploadToDelete, setUploadToDelete] = useState<UploadRow | null>(null);
  const [confirmFilename, setConfirmFilename] = useState('');

  useEffect(() => {
    if (!uploadToDelete) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCloseDeleteModal();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [uploadToDelete]);

  const loadUploads = useCallback(async () => {
    if (!org) return;
    const supabase = createClient();
    setIsLoadingUploads(true);
    const { data, error } = await supabase
      .from('uploads')
      .select('id, file_name, file_path, data_type, row_count, status, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });
    if (!error && data) setUploads(data as UploadRow[]);
    setIsLoadingUploads(false);
  }, [org]);

  useEffect(() => {
    if (!isLoading && org) void loadUploads();
  }, [isLoading, org, loadUploads]);

  useRealtimeTable(
    'uploads',
    org ? { column: 'org_id', value: org.id } : undefined,
    () => {
      void loadUploads();
    },
  );

  const refreshUploads = useCallback(async () => {
    await loadUploads();
  }, [loadUploads]);

  const handleDeleteClick = (e: React.MouseEvent, upload: UploadRow) => {
    e.stopPropagation();
    setUploadToDelete(upload);
    setConfirmFilename('');
  };

  const handleCloseDeleteModal = () => {
    setUploadToDelete(null);
    setConfirmFilename('');
  };

  const handleConfirmDelete = async () => {
    if (!org || !uploadToDelete) return;
    if (confirmFilename.trim() !== uploadToDelete.file_name) return;

    const supabase = createClient();
    const { id, file_name, file_path } = uploadToDelete;

    // Immediately close modal and update UI
    setUploadToDelete(null);
    setConfirmFilename('');
    setUploads((prev) => prev.filter((u) => u.id !== id));
    toast.success(`${file_name} removed.`);

    // Run cleanup in background (user doesn't wait)
    (async () => {
      try {
        await supabase.storage.from('uploads').remove([file_path]).catch(() => {});

        const { data: entitiesToDelete } = await supabase
          .from('entities')
          .select('id')
          .eq('source_upload_id', id);
        const entityIds = (entitiesToDelete ?? []).map((e) => e.id);

        if (entityIds.length > 0) {
          await supabase
            .from('entity_relationships')
            .delete()
            .eq('org_id', org.id)
            .in('from_entity_id', entityIds);
          await supabase
            .from('entity_relationships')
            .delete()
            .eq('org_id', org.id)
            .in('to_entity_id', entityIds);
        }

        await supabase
          .from('data_rows')
          .delete()
          .eq('upload_id', id)
          .eq('org_id', org.id);
        await supabase.from('entities').delete().eq('source_upload_id', id);
        await supabase.from('kpi_snapshots').delete().eq('org_id', org.id);
        try {
          await supabase.from('performance_gaps').delete().eq('upload_id', id);
        } catch {
          // performance_gaps table may not exist
        }

        const { data: usedRelTypeIds } = await supabase
          .from('entity_relationships')
          .select('relationship_type_id')
          .eq('org_id', org.id);
        const usedRelSet = new Set(
          (usedRelTypeIds ?? []).map((r) => r.relationship_type_id),
        );
        const { data: allRelTypes } = await supabase
          .from('relationship_types')
          .select('id')
          .eq('org_id', org.id);
        for (const rt of allRelTypes ?? []) {
          if (!usedRelSet.has(rt.id)) {
            await supabase
              .from('relationship_types')
              .delete()
              .eq('id', rt.id)
              .eq('org_id', org.id);
          }
        }

        const { data: usedEtIds } = await supabase
          .from('entities')
          .select('entity_type_id')
          .eq('org_id', org.id);
        const usedEtSet = new Set((usedEtIds ?? []).map((e) => e.entity_type_id));
        const { data: allEts } = await supabase
          .from('entity_types')
          .select('id')
          .eq('org_id', org.id);
        for (const et of allEts ?? []) {
          if (!usedEtSet.has(et.id)) {
            await supabase
              .from('entity_types')
              .delete()
              .eq('id', et.id)
              .eq('org_id', org.id);
          }
        }

        await supabase.from('uploads').delete().eq('id', id).eq('org_id', org.id);
      } catch (err) {
        console.error('Background delete cleanup error:', err);
      }
    })();
  };

  const renderStatusBadge = (status: UploadStatus) => {
    if (status === 'ready') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400 border-emerald-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Connected
        </span>
      );
    }

    if (status === 'processing') {
      return (
        <span className="inline-flex items-center rounded-full border bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-400 border-amber-500/30">
          <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Processing
        </span>
      );
    }

    if (status === 'pending') {
      return (
        <span className="inline-flex items-center rounded-full border bg-zinc-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 border-zinc-700">
          Pending
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full border bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-400 border-rose-500/30">
        Error
      </span>
    );
  };

  const hasUploads = uploads.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-slate-200">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter">Connected Data</h1>
          <p className="mt-1 text-sm text-slate-400">
            Your spreadsheets and data connections.
          </p>
        </div>
        <Button
          type="button"
          className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] shadow-[0_0_20px_rgba(16,185,129,0.15)]"
          onClick={() => setAddDataModalOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Data
        </Button>
      </div>

      {isLoadingUploads || isLoading ? (
        <div className="mt-12 flex items-center justify-center">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-4 text-xs text-slate-400">
            Loading your uploads…
          </div>
        </div>
      ) : !hasUploads ? (
        <div className="mt-16 flex justify-center">
          <div className="flex max-w-2xl flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-950 px-10 py-12 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
            <h2 className="text-lg font-semibold tracking-tight">No data connected yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Connect your first spreadsheet and Aether will automatically detect your revenue,
              costs, staff, and more.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-lg">
              <button
                type="button"
                onClick={() => setIsDropzoneOpen(true)}
                className="flex flex-col items-start rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-left transition-all hover:border-emerald-500/30 hover:bg-zinc-900 cursor-pointer"
              >
                <FileSpreadsheet className="h-8 w-8 text-emerald-400 mb-3" />
                <span className="font-medium text-slate-100">Upload a spreadsheet</span>
                <span className="mt-1 text-sm text-slate-400">Drag in an Excel or CSV file from your computer</span>
              </button>
              <button
                type="button"
                onClick={() => setGoogleSheetsOpen(true)}
                className="flex flex-col items-start rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-left transition-all hover:border-emerald-500/30 hover:bg-zinc-900 cursor-pointer"
              >
                <Link2 className="h-8 w-8 text-emerald-400 mb-3" />
                <span className="font-medium text-slate-100">Connect Google Sheets</span>
                <span className="mt-1 text-sm text-slate-400">Paste a link to a Google Sheet and we&apos;ll keep it in sync</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {uploads.length} file{uploads.length === 1 ? '' : 's'} connected
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
            <table className="min-w-full border-collapse text-left text-sm text-slate-200">
              <thead className="bg-zinc-950/80">
                <tr>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400 w-10">
                    Type
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Name
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Records
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Status
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Added
                  </th>
                  <th className="w-10 border-b border-zinc-900" aria-label="Delete" />
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr
                    key={upload.id}
                    className="group cursor-pointer border-b border-zinc-900 last:border-0 hover:bg-zinc-900/50 transition-colors"
                    onClick={() => router.push(`/dashboard/data/${upload.id}`)}
                  >
                    <td className="px-4 py-3 text-slate-400">
                      <FileSpreadsheet className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-100">{upload.file_name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {upload.row_count ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">{renderStatusBadge(upload.status)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(upload.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className="inline-flex opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => handleDeleteClick(e, upload)}
                      >
                        <button
                          type="button"
                          className="rounded p-1 text-slate-500 hover:text-rose-400"
                          aria-label={`Delete ${upload.file_name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={handleCloseDeleteModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div
            className="max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10">
                <Trash2 className="h-6 w-6 text-rose-400" />
              </div>
              <h2 id="delete-modal-title" className="text-lg font-semibold text-slate-100">
                Delete {uploadToDelete.file_name}?
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-slate-400">
                This will permanently remove the file, all parsed data, and your numbers generated
                from this source. This action cannot be undone.
              </p>
              <label className="mt-4 w-full text-left text-xs text-slate-500">
                Type <span className="font-mono text-slate-400">{uploadToDelete.file_name}</span> to
                confirm
              </label>
              <input
                type="text"
                value={confirmFilename}
                onChange={(e) => setConfirmFilename(e.target.value)}
                placeholder={uploadToDelete.file_name}
                className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                autoComplete="off"
              />
              <div className="mt-6 flex w-full gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-zinc-700 px-5 py-2.5 text-sm text-slate-300 hover:bg-zinc-800"
                  onClick={handleCloseDeleteModal}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-rose-600 disabled:pointer-events-none disabled:opacity-50"
                  onClick={handleConfirmDelete}
                  disabled={confirmFilename.trim() !== uploadToDelete.file_name}
                >
                  Permanently delete
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Data modal: two cards */}
      {addDataModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setAddDataModalOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-lg w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => {
                  setAddDataModalOpen(false);
                  setIsDropzoneOpen(true);
                }}
                className="flex flex-col items-start rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-left transition-all hover:border-emerald-500/30 hover:bg-zinc-900 cursor-pointer"
              >
                <FileSpreadsheet className="h-8 w-8 text-emerald-400 mb-3" />
                <span className="font-medium text-slate-100">Upload a spreadsheet</span>
                <span className="mt-1 text-sm text-slate-400">Drag in an Excel or CSV file from your computer</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddDataModalOpen(false);
                  setGoogleSheetsOpen(true);
                }}
                className="flex flex-col items-start rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-left transition-all hover:border-emerald-500/30 hover:bg-zinc-900 cursor-pointer"
              >
                <Link2 className="h-8 w-8 text-emerald-400 mb-3" />
                <span className="font-medium text-slate-100">Connect Google Sheets</span>
                <span className="mt-1 text-sm text-slate-400">Paste a link to a Google Sheet and we&apos;ll keep it in sync</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets connection placeholder */}
      {googleSheetsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setGoogleSheetsOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-w-md w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-100">Connect Google Sheets</h3>
            <p className="mt-1 text-sm text-slate-400">Google Sheets sync is coming soon. For now, export your sheet as CSV and upload it.</p>
            <Button
              type="button"
              className="mt-4 rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600"
              onClick={() => {
                setGoogleSheetsOpen(false);
                setIsDropzoneOpen(true);
              }}
            >
              Upload a spreadsheet instead
            </Button>
            <button
              type="button"
              className="mt-3 ml-3 text-sm text-slate-400 hover:text-slate-200"
              onClick={() => setGoogleSheetsOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <UploadDropzone
        open={isDropzoneOpen}
        onClose={() => setIsDropzoneOpen(false)}
        onUploaded={refreshUploads}
      />
    </div>
  );
}

