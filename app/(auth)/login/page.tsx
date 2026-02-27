// Login page for Aether with password, magic link, and Google OAuth.
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Chrome, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showForgotPassword, setShowForgotPassword] = useState<boolean>(false);
  const [resetEmail, setResetEmail] = useState<string>('');
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState<boolean>(false);
  const [isMagicLoading, setIsMagicLoading] = useState<boolean>(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<boolean>(false);

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback';

  type ProfileOrg = {
    org_id: string | null;
  };

  const handlePasswordSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email || !password) {
      toast.error('Please enter your email and password.');
      return;
    }

    try {
      setIsPasswordLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle<ProfileOrg>();

      const hasOrg = Boolean(profile?.org_id);

      try {
        void fetch('/api/audit/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'user.login',
            targetType: 'user',
            targetId: user.id,
            description: `${user.email ?? 'User'} logged in`,
            metadata: {
              method: 'password',
            },
          }),
        });
      } catch {
        // Audit logging failure should not block login.
      }

      toast.success('Welcome back.');
      router.push(hasOrg ? '/dashboard' : '/onboarding');
    } catch {
      toast.error('Something went wrong signing in.');
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const handleMagicLink = async () => {
    if (!email) {
      toast.error('Please enter your email.');
      return;
    }

    try {
      setIsMagicLoading(true);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success('Magic link sent. Check your inbox.');
    } catch {
      toast.error('Something went wrong sending the magic link.');
    } finally {
      setIsMagicLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsOAuthLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (error) {
        toast.error(error.message);
      }
    } catch {
      toast.error('Something went wrong with Google sign in.');
      setIsOAuthLoading(false);
    }
  };

  const isAnyLoading = isPasswordLoading || isMagicLoading || isOAuthLoading;

  return (
    <div className="bg-[#0A0A0A] text-slate-200">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 px-8 py-10 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] transition-transform duration-200 ease-out hover:scale-[1.005]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500" />
            <span className="text-xl font-semibold tracking-tight">Aether</span>
          </div>
          <p className="text-sm text-slate-400">Sign in to your AI COO workspace.</p>
        </div>

        <form onSubmit={handlePasswordSignIn} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-slate-300">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="you@multiunitbrand.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium text-slate-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
                placeholder="Your password"
              />
              <Lock className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-500" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-500 focus:ring-emerald-500/50 focus:ring-offset-0"
              />
              <span className="text-sm text-slate-400">Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setResetEmail(email);
                setShowForgotPassword(true);
              }}
              className="text-xs text-slate-400 transition hover:text-emerald-400"
            >
              Forgot password?
            </button>
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl bg-emerald-500 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-600 active:scale-[0.985]"
            disabled={isAnyLoading}
          >
            {isPasswordLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-zinc-800" />
          <span>or</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl border-zinc-800 bg-zinc-950 text-sm font-medium text-slate-200 hover:bg-zinc-900"
            disabled={isAnyLoading}
            onClick={handleMagicLink}
          >
            <Mail className="h-4 w-4" />
            {isMagicLoading ? 'Sending magic link…' : 'Send magic link'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl border-zinc-800 bg-zinc-950 text-sm font-medium text-slate-200 hover:bg-zinc-900"
            disabled={isAnyLoading}
            onClick={handleGoogleSignIn}
          >
            <Chrome className="h-4 w-4" />
            {isOAuthLoading ? 'Redirecting…' : 'Continue with Google'}
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <span>Enterprise, multi-location, and franchise ready.</span>
          <button
            type="button"
            className="text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
            onClick={() => router.push('/signup')}
          >
            Create account
          </button>
        </div>
      </div>

      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => {
              setShowForgotPassword(false);
              setResetSent(false);
              setResetEmail('');
            }}
            aria-hidden
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
            {!resetSent ? (
              <>
                <h3 className="text-lg font-semibold text-slate-100">Reset your password</h3>
                <p className="mb-4 text-sm text-slate-400">
                  Enter your email and we&apos;ll send you a reset link.
                </p>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResetEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="mb-4 w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                />
                <Button
                  type="button"
                  className="mb-2 w-full rounded-2xl bg-emerald-500 text-sm font-medium text-slate-950 hover:bg-emerald-600"
                  disabled={resetLoading}
                  onClick={async () => {
                    if (!resetEmail.trim()) {
                      toast.error('Please enter your email.');
                      return;
                    }
                    setResetLoading(true);
                    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
                      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : '/login',
                    });
                    setResetLoading(false);
                    if (error) {
                      toast.error(error.message);
                      return;
                    }
                    setResetSent(true);
                  }}
                >
                  {resetLoading ? 'Sending…' : 'Send reset link'}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetEmail('');
                  }}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Back to login
                </button>
              </>
            ) : (
              <>
                <div className="mb-4 flex justify-center">
                  <CheckCircle className="h-10 w-10 text-emerald-400" />
                </div>
                <h3 className="text-center text-lg font-semibold text-slate-100">Check your email</h3>
                <p className="mb-4 text-center text-sm text-slate-400">
                  We sent a reset link to {resetEmail}. It may take a minute.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-2xl border-zinc-700 text-sm font-medium text-slate-200 hover:bg-zinc-900"
                  onClick={() => {
                    setShowForgotPassword(false);
                    setResetSent(false);
                    setResetEmail('');
                  }}
                >
                  Back to login
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 text-center text-xs text-slate-500">
        <span className="mr-1">New to Aether?</span>
        <Link
          href="/signup"
          className="text-slate-300 underline-offset-4 hover:text-emerald-400 hover:underline"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}

