// Dashboard data page showing uploads and entry point for new CSV imports.
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, FileSpreadsheet, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/use-user';
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
  const [uploadToDelete, setUploadToDelete] = useState<UploadRow | null>(null);
  const [confirmFilename, setConfirmFilename] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!uploadToDelete) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) handleCloseDeleteModal();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [uploadToDelete, isDeleting]);

  useEffect(() => {
    const fetchUploads = async () => {
      if (!org) return;
      const supabase = createClient();
      setIsLoadingUploads(true);

      const { data, error } = await supabase
        .from('uploads')
        .select('id, file_name, file_path, data_type, row_count, status, created_at')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setUploads(data as UploadRow[]);
      }

      setIsLoadingUploads(false);
    };

    if (!isLoading && org) {
      void fetchUploads();
    }
  }, [isLoading, org]);

  const refreshUploads = async () => {
    if (!org) return;
    const supabase = createClient();
    setIsLoadingUploads(true);

    const { data, error } = await supabase
      .from('uploads')
      .select('id, file_name, file_path, data_type, row_count, status, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUploads(data as UploadRow[]);
    }

    setIsLoadingUploads(false);
  };

  const handleDeleteClick = (e: React.MouseEvent, upload: UploadRow) => {
    e.stopPropagation();
    setUploadToDelete(upload);
    setConfirmFilename('');
  };

  const handleCloseDeleteModal = () => {
    if (!isDeleting) {
      setUploadToDelete(null);
      setConfirmFilename('');
    }
  };

  const handleConfirmDelete = async () => {
    if (!org || !uploadToDelete) return;
    if (confirmFilename.trim() !== uploadToDelete.file_name) return;

    const supabase = createClient();
    const { id, file_name, file_path } = uploadToDelete;
    setIsDeleting(true);

    let storageFailed = false;
    try {
      await supabase.storage.from('uploads').remove([file_path]);
    } catch {
      storageFailed = true;
    }

    const { error: dataRowsError } = await supabase
      .from('data_rows')
      .delete()
      .eq('upload_id', id)
      .eq('org_id', org.id);
    if (dataRowsError) {
      setIsDeleting(false);
      toast.error('Failed to delete data rows. Please try again.');
      return;
    }

    const { error: entitiesError } = await supabase
      .from('entities')
      .delete()
      .eq('source_upload_id', id);
    if (entitiesError) {
      setIsDeleting(false);
      toast.error('Failed to delete linked entities. Please try again.');
      return;
    }

    const { error: uploadsError } = await supabase
      .from('uploads')
      .delete()
      .eq('id', id)
      .eq('org_id', org.id);
    if (uploadsError) {
      setIsDeleting(false);
      toast.error('Failed to remove data source. Please try again.');
      return;
    }

    try {
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'data.delete',
          targetType: 'upload',
          targetId: id,
          description: `Deleted data source: ${file_name}`,
        }),
      });
    } catch {
      // non-blocking
    }

    toast.success('Data source deleted');
    setUploadToDelete(null);
    setConfirmFilename('');
    setIsDeleting(false);
    await refreshUploads();
  };

  const renderStatusBadge = (status: UploadStatus) => {
    if (status === 'ready') {
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
          Ready
        </span>
      );
    }

    if (status === 'processing' || status === 'pending') {
      return (
        <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-300">
          <span className="mr-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          Processing
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-medium text-rose-300">
        Error
      </span>
    );
  };

  const hasUploads = uploads.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0A] text-slate-200">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tighter">Data Sources</h1>
          <p className="mt-1 text-sm text-slate-400">
            Connect your exports so Aether can compute revenue, labor, and utilization in real
            time.
          </p>
        </div>
        <Button
          type="button"
          className="rounded-2xl bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
          onClick={() => setIsDropzoneOpen(true)}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
      </div>

      {isLoadingUploads || isLoading ? (
        <div className="mt-12 flex items-center justify-center">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-6 py-4 text-xs text-slate-400">
            Loading your uploads…
          </div>
        </div>
      ) : !hasUploads ? (
        <div className="mt-16 flex justify-center">
          <div className="flex max-w-md flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950 px-10 py-12 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Database className="h-6 w-6 text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">No data sources yet</h2>
            <p className="mt-2 text-sm text-slate-400">
              Upload a CSV export from your POS, billing, or booking system. Aether will map and
              normalize it into a single operational model.
            </p>
            <Button
              type="button"
              className="mt-6 rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985]"
              onClick={() => setIsDropzoneOpen(true)}
            >
              Upload your first CSV
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-xs text-slate-400">
              {uploads.length} upload{uploads.length === 1 ? '' : 's'} connected
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950">
            <table className="min-w-full border-collapse text-left text-sm text-slate-200">
              <thead className="bg-zinc-950/80">
                <tr>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    File
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Data type
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Rows
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Status
                  </th>
                  <th className="border-b border-zinc-900 px-4 py-3 text-xs font-medium text-slate-400">
                    Uploaded
                  </th>
                  <th className="w-10 border-b border-zinc-900" aria-label="Delete" />
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr
                    key={upload.id}
                    className="group cursor-pointer border-b border-zinc-900 last:border-0 hover:bg-zinc-900/60"
                    onClick={() => router.push(`/dashboard/data/${upload.id}`)}
                  >
                    <td className="px-4 py-3 text-xs font-medium text-slate-100">
                      {upload.file_name}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {upload.data_type || 'custom'}
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
            className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl"
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
                This will permanently remove the file, all parsed data rows, and any KPI snapshots
                generated from this source. This action cannot be undone.
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
                disabled={isDeleting}
                autoComplete="off"
              />
              <div className="mt-6 flex w-full gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-zinc-700 px-5 py-2.5 text-sm text-slate-300 hover:bg-zinc-800"
                  onClick={handleCloseDeleteModal}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="rounded-2xl bg-rose-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-rose-600 disabled:pointer-events-none disabled:opacity-50"
                  onClick={handleConfirmDelete}
                  disabled={
                    isDeleting || confirmFilename.trim() !== uploadToDelete.file_name
                  }
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Permanently delete'
                  )}
                </Button>
              </div>
            </div>
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

