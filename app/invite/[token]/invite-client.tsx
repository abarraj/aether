'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertTriangle, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useUser } from '@/hooks/use-user';

type InvitePreview = {
  org_name: string;
  role: string;
  email: string;
  expires_at: string | null;
  expired: boolean;
  accepted: boolean;
};

export function InviteClient({ token }: { token: string }) {
  const router = useRouter();
  const { user, isLoading: isUserLoading } = useUser();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      try {
        const res = await fetch('/api/invites/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? 'Invalid or expired invite.');
          return;
        }
        setPreview(data);
      } catch {
        if (!cancelled) setError('Failed to load invite details.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = async () => {
    setIsAccepting(true);
    setError(null);
    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to accept invite.');
        setIsAccepting(false);
        return;
      }
      setAccepted(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 1200);
    } catch {
      setError('Something went wrong. Please try again.');
      setIsAccepting(false);
    }
  };

  if (isLoading || isUserLoading) {
    return (
      <Shell>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
      </Shell>
    );
  }

  if (error && !preview) {
    return (
      <Shell>
        <Card>
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-400" />
          <h1 className="text-lg font-semibold text-slate-100">Invite unavailable</h1>
          <p className="mt-2 text-sm text-slate-400">{error}</p>
          <Button
            onClick={() => router.push('/login')}
            className="mt-6 w-full rounded-2xl bg-zinc-800 text-sm font-medium text-slate-200 hover:bg-zinc-700"
          >
            Go to login
          </Button>
        </Card>
      </Shell>
    );
  }

  if (accepted) {
    return (
      <Shell>
        <Card>
          <Check className="mx-auto mb-4 h-10 w-10 text-emerald-400" />
          <h1 className="text-lg font-semibold text-slate-100">You&apos;re in</h1>
          <p className="mt-2 text-sm text-slate-400">Redirecting to your workspace…</p>
        </Card>
      </Shell>
    );
  }

  const isExpired = preview?.expired;
  const isAlreadyAccepted = preview?.accepted;

  return (
    <Shell>
      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-10 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <div className="mb-8 flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-emerald-500" />
              <span className="text-xl font-semibold tracking-tight text-slate-100">Aether</span>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm text-slate-400">You&apos;ve been invited to join</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
              {preview?.org_name}
            </h1>
          </div>

          <div className="mt-6 space-y-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-5 py-4">
            <DetailRow label="Role" value={preview?.role ?? '—'} capitalize />
            <div className="h-px bg-zinc-800/60" />
            <DetailRow label="Invited as" value={preview?.email ?? '—'} />
            {preview?.expires_at && (
              <>
                <div className="h-px bg-zinc-800/60" />
                <DetailRow
                  label="Expires"
                  value={
                    isExpired
                      ? 'Expired'
                      : new Date(preview.expires_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                  }
                  warn={isExpired}
                />
              </>
            )}
          </div>

          {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

          <div className="mt-6">
            {isExpired ? (
              <div className="text-center">
                <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-amber-400" />
                <p className="text-sm text-amber-400">
                  This invite has expired. Ask the workspace admin for a new one.
                </p>
              </div>
            ) : isAlreadyAccepted ? (
              <div className="text-center">
                <Check className="mx-auto mb-2 h-5 w-5 text-slate-400" />
                <p className="text-sm text-slate-400">This invite has already been accepted.</p>
                <Button
                  onClick={() => router.push('/dashboard')}
                  className="mt-4 w-full rounded-2xl bg-zinc-800 text-sm font-medium text-slate-200 hover:bg-zinc-700"
                >
                  Go to dashboard
                </Button>
              </div>
            ) : !user ? (
              <>
                <Button
                  className="w-full rounded-2xl bg-emerald-500 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-600 active:scale-[0.985]"
                  onClick={() =>
                    router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)
                  }
                >
                  Sign in to accept
                </Button>
                <p className="mt-4 text-center text-xs text-slate-500">
                  Don&apos;t have an account?{' '}
                  <a
                    href={`/signup?next=${encodeURIComponent(`/invite/${token}`)}`}
                    className="text-slate-300 underline-offset-4 hover:text-emerald-400 hover:underline"
                  >
                    Sign up
                  </a>
                </p>
              </>
            ) : (
              <Button
                className="w-full rounded-2xl bg-emerald-500 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-600 active:scale-[0.985]"
                disabled={isAccepting}
                onClick={handleAccept}
              >
                {isAccepting ? 'Accepting…' : 'Accept invite'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] px-4 py-16 text-slate-200">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-10 text-center shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
      {children}
    </div>
  );
}

function DetailRow({
  label,
  value,
  capitalize,
  warn,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span
        className={[
          'font-medium',
          warn ? 'text-amber-400' : 'text-slate-200',
          capitalize ? 'capitalize' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  );
}
