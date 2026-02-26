// Dashboard data page showing uploads and entry point for new CSV imports.
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, FileSpreadsheet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/hooks/use-user';
import { UploadDropzone } from '@/components/data/upload-dropzone';

type UploadStatus = 'pending' | 'processing' | 'ready' | 'error';

interface UploadRow {
  id: string;
  file_name: string;
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

  useEffect(() => {
    const fetchUploads = async () => {
      if (!org) return;
      const supabase = createClient();
      setIsLoadingUploads(true);

      const { data, error } = await supabase
        .from('uploads')
        .select('id, file_name, data_type, row_count, status, created_at')
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
      .select('id, file_name, data_type, row_count, status, created_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setUploads(data as UploadRow[]);
    }

    setIsLoadingUploads(false);
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
                </tr>
              </thead>
              <tbody>
                {uploads.map((upload) => (
                  <tr
                    key={upload.id}
                    className="cursor-pointer border-b border-zinc-900 last:border-0 hover:bg-zinc-900/60"
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
                  </tr>
                ))}
              </tbody>
            </table>
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

