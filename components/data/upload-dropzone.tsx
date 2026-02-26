// Full-screen upload modal: drop spreadsheet → AI detection → confirm → import.
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, UploadCloud, Sparkles, Calendar, DollarSign, Users, MapPin, Dumbbell } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ColumnMapper } from '@/components/data/column-mapper';
import { parseCsv } from '@/lib/csv-parser';
import type { DataType } from '@/components/data/column-mapper';
import type { OntologyConfig } from '@/components/data/column-mapper';
import type { OntologyDetection } from '@/lib/ai/ontology-detector';

interface UploadDropzoneProps {
  open: boolean;
  onClose: () => void;
  onUploaded?: () => void;
}

const CSV_TSV_EXT = ['.csv', '.tsv'];
const ALL_EXT = ['.csv', '.tsv', '.xlsx'];

function isCsvOrTsv(name: string): boolean {
  const lower = name.toLowerCase();
  return CSV_TSV_EXT.some((ext) => lower.endsWith(ext));
}

type Step = 'drop' | 'analyzing' | 'confirm' | 'customize' | 'importing' | 'done';

export function UploadDropzone({ open, onClose, onUploaded }: UploadDropzoneProps) {
  const router = useRouter();
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState(false);
  const [step, setStep] = useState<Step>('drop');
  const [detection, setDetection] = useState<OntologyDetection | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const doneRedirectRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setParsed(null);
    setProgress(0);
    setIsUploading(false);
    setStep('drop');
    setDetection(null);
    setDetectionError(null);
    setDragActive(false);
    if (doneRedirectRef.current) {
      clearTimeout(doneRedirectRef.current);
      doneRedirectRef.current = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isUploading) return;
    resetState();
    onClose();
  }, [isUploading, resetState, onClose]);

  useEffect(() => {
    if (!open) return;
    if (!file || !isCsvOrTsv(file.name)) return;
    let cancelled = false;
    file.text().then((text) => {
      if (cancelled) return;
      const { headers, rows } = parseCsv(text);
      if (headers.length > 0) setParsed({ headers, rows });
      else setParsed(null);
    }).catch(() => {
      if (!cancelled) setParsed(null);
    });
    return () => { cancelled = true; };
  }, [open, file]);

  useEffect(() => {
    if (!open || !parsed || step !== 'drop' || parsed.headers.length === 0) return;
    setStep('analyzing');
    setDetectionError(null);
    const rowsForDetect = parsed.rows.slice(0, 300).map((r) => r as Record<string, unknown>);
    fetch('/api/upload/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headers: parsed.headers, rows: rowsForDetect }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Detection failed');
        return res.json();
      })
      .then((data: { detection: OntologyDetection }) => {
        if (data.detection && data.detection.confidence > 0.3 && data.detection.entityTypes?.length > 0) {
          setDetection(data.detection);
          setStep('confirm');
        } else {
          setDetection(null);
          setStep('customize');
        }
      })
      .catch(() => {
        setDetectionError('Could not analyze automatically.');
        setStep('customize');
      });
  }, [open, parsed, step]);

  const handleFile = (selectedFile: File | null) => {
    if (!selectedFile) return;

    const lowerName = selectedFile.name.toLowerCase();
    const isAllowed = ALL_EXT.some((ext) => lowerName.endsWith(ext));

    if (!isAllowed) {
      toast.error('Please upload a spreadsheet (CSV, TSV, or Excel).');
      return;
    }

    setFile(selectedFile);
    if (!isCsvOrTsv(selectedFile.name)) setParsed(null);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    handleFile(droppedFile);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dragActive) setDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleBrowseClick = () => {
    inputRef.current?.click();
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] ?? null;
    handleFile(selectedFile);
  };

  const runUpload = useCallback(
    async (dataType: DataType, ontology: OntologyConfig | null | undefined) => {
      if (!file) return;

      setIsUploading(true);
      setProgress(10);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('data_type', dataType);
      if (ontology?.entityTypeId && ontology?.nameColumn) {
        formData.append('ontology', JSON.stringify(ontology));
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      setProgress(90);

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(result?.error ?? 'Upload failed.');
        setIsUploading(false);
        setStep('confirm');
        return;
      }

      const result = (await response.json()) as {
        ontology?: { entitiesCreated: number; relationshipsCreated: number };
      };
      setProgress(100);
      setStep('done');
      onUploaded?.();
      if (result.ontology && (result.ontology.entitiesCreated > 0 || result.ontology.relationshipsCreated > 0)) {
        toast.success('Your data is connected. We mapped your team and locations.');
      } else {
        toast.success('Your data is being processed.');
      }
      doneRedirectRef.current = setTimeout(() => {
        handleClose();
        router.push('/dashboard');
      }, 3000);
    },
    [file, onUploaded, handleClose],
  );

  const handleImport = useCallback(
    (payload: {
      dataType: DataType;
      mapping: Record<string, unknown>;
      ontology?: OntologyConfig | null;
    }) => {
      void runUpload(payload.dataType, payload.ontology ?? null);
    },
    [runUpload],
  );

  const handleUploadSimple = useCallback(() => {
    void runUpload('Custom', null);
  }, [runUpload]);

  if (!open) return null;

  const fileSizeLabel =
    file != null ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : undefined;
  const showMapper = step === 'customize' && file && isCsvOrTsv(file.name) && parsed && parsed.headers.length > 0;

  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-auto">
        <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-10 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
            <span className="text-2xl font-bold text-emerald-400 inline-block animate-scale-in">✓</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-100">All set! Your data is being processed.</h2>
          <Button
            type="button"
            className="mt-6 w-full rounded-2xl bg-emerald-500 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-600"
            onClick={() => { if (doneRedirectRef.current) clearTimeout(doneRedirectRef.current); handleClose(); router.push('/dashboard'); }}
          >
            Go to Dashboard
          </Button>
          <p className="mt-3 text-xs text-slate-500">Redirecting in 3 seconds…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-auto">
      <div className={`w-full rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] ${showMapper ? 'max-w-4xl' : 'max-w-xl'}`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {step === 'confirm' ? 'Confirm import' : step === 'analyzing' ? 'Analyzing…' : 'Add data'}
            </h2>
            <p className="text-xs text-slate-500">
              {step === 'analyzing' ? 'We’ll detect your columns and categories.' : 'Spreadsheet up to 10MB.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-full border border-zinc-800 bg-zinc-950 p-1.5 text-slate-400 hover:bg-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!file ? (
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-colors border-zinc-800 bg-zinc-950 hover:border-emerald-500/40 hover:bg-zinc-900"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={handleBrowseClick}
          >
            <UploadCloud className="mb-3 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-medium text-slate-100">Drop your spreadsheet here, or click to choose a file</p>
            <p className="mt-1 text-xs text-slate-500">Excel (.xlsx) and CSV files supported</p>
            <p className="mt-2 text-[11px] text-slate-500">Max 10MB</p>
          </div>
        ) : step === 'analyzing' ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-16">
            <Sparkles className="h-10 w-10 text-emerald-400 animate-pulse mb-4" />
            <p className="text-sm text-slate-300">Analyzing your data...</p>
            <p className="mt-1 text-xs text-slate-500">Aether is figuring out what&apos;s in this spreadsheet</p>
          </div>
        ) : step === 'confirm' && detection && file ? (
          <div className="space-y-6">
            <p className="text-sm text-slate-300">Here&apos;s what we found in <span className="font-medium text-slate-100">{file.name}</span>:</p>
            <div className="grid grid-cols-2 gap-3">
              {detection.metrics?.dateColumn && (
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-slate-200">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span>Date range detected</span>
                </div>
              )}
              {(detection.metrics?.revenueColumns?.length ?? 0) > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-slate-200">
                  <DollarSign className="h-4 w-4 text-slate-500" />
                  <span>Revenue data found</span>
                </div>
              )}
              {(detection.metrics?.costColumns?.length ?? 0) > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-slate-200">
                  <Users className="h-4 w-4 text-slate-500" />
                  <span>Staff cost data found</span>
                </div>
              )}
              {(detection.metrics?.attendanceColumns?.length ?? 0) > 0 && (
                <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-slate-200">
                  <Dumbbell className="h-4 w-4 text-slate-500" />
                  <span>Attendance tracked</span>
                </div>
              )}
              {detection.entityTypes?.slice(0, 4).map((et) => (
                <div key={et.slug} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-slate-200">
                  {et.slug.includes('location') || et.slug.includes('studio') ? (
                    <MapPin className="h-4 w-4 text-slate-500" />
                  ) : (
                    <Dumbbell className="h-4 w-4 text-slate-500" />
                  )}
                  <span>{et.name} detected</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <Button
                type="button"
                disabled={isUploading}
                className="w-full rounded-2xl bg-emerald-500 py-3 text-sm font-medium text-slate-950 hover:bg-emerald-600"
                onClick={() => { setStep('importing'); void runUpload('Custom', null); }}
              >
                {isUploading ? 'Importing…' : 'Looks good — import this'}
              </Button>
              <button
                type="button"
                onClick={() => setStep('customize')}
                className="text-xs text-slate-400 hover:text-slate-200 underline"
              >
                Something wrong? Customize manually
              </button>
            </div>
          </div>
        ) : showMapper ? (
          <div className="space-y-4">
            {detectionError && (
              <p className="text-xs text-amber-400">{detectionError}</p>
            )}
            <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs text-slate-300">
              <span className="truncate">{file.name}</span>
              {fileSizeLabel && <span className="text-slate-500">{fileSizeLabel}</span>}
            </div>
            <ColumnMapper
              headers={parsed!.headers}
              rows={parsed!.rows}
              onImport={handleImport}
            />
          </div>
        ) : (
          <>
            <div className="rounded-3xl border-2 border-dashed border-zinc-800 bg-zinc-950 px-6 py-10">
              <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-left text-xs text-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{file.name}</span>
                  {fileSizeLabel && <span className="text-slate-500">{fileSizeLabel}</span>}
                </div>
                {isCsvOrTsv(file.name) && !parsed && (
                  <p className="mt-2 text-slate-500">Parsing…</p>
                )}
                {(parsed?.headers.length === 0 || (!isCsvOrTsv(file.name) && file)) && (
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="text-xs font-medium text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
                disabled={isUploading}
              >
                Cancel
              </button>
              <Button
                type="button"
                disabled={isUploading || (isCsvOrTsv(file.name) && !parsed)}
                className="rounded-2xl bg-emerald-500 px-5 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600"
                onClick={handleUploadSimple}
              >
                {isUploading ? 'Uploading…' : 'Upload file'}
              </Button>
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx"
          className="hidden"
          onChange={handleInputChange}
        />
      </div>
    </div>
  );
}

