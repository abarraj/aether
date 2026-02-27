// Signup page for Aether with full name, password, magic link, and Google OAuth.
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Chrome } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [isPasswordSignupLoading, setIsPasswordSignupLoading] = useState<boolean>(false);
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState<boolean>(false);
  const [isOAuthLoading, setIsOAuthLoading] = useState<boolean>(false);

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback';

  type ProfileOrg = {
    org_id: string | null;
  };

  const handlePasswordSignup = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fullName.trim() || !email || !password) {
      toast.error('Please enter your name, email, and password.');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    try {
      setIsPasswordSignupLoading(true);

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
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
            action: 'user.signup',
            targetType: 'user',
            targetId: user.id,
            description: `${fullName || user.email || 'User'} created an account`,
            metadata: {
              method: 'password',
            },
          }),
        });
      } catch {
        // Audit logging failure should not block signup.
      }

      toast.success('Account created. Let’s set up your workspace.');
      router.push(hasOrg ? '/dashboard' : '/onboarding');
    } catch {
      toast.error('Something went wrong creating your account.');
    } finally {
      setIsPasswordSignupLoading(false);
    }
  };

  const handleMagicLinkSignup = async () => {
    if (!fullName.trim() || !email) {
      toast.error('Please enter your name and email.');
      return;
    }

    try {
      setIsMagicLinkLoading(true);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            full_name: fullName.trim(),
          },
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
      setIsMagicLinkLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
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
      toast.error('Something went wrong with Google sign up.');
      setIsOAuthLoading(false);
    }
  };

  const isAnyLoading = isPasswordSignupLoading || isMagicLinkLoading || isOAuthLoading;

  return (
    <div className="bg-[#0A0A0A] text-slate-200">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 px-8 py-10 shadow-[0_0_0_1px_rgba(24,24,27,0.9)] transition-transform duration-200 ease-out hover:scale-[1.005]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500" />
            <span className="text-xl font-semibold tracking-tight">Aether</span>
          </div>
          <p className="text-sm text-slate-400">Create your AI COO workspace.</p>
        </div>

        <form onSubmit={handlePasswordSignup} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="full-name" className="block text-sm font-medium text-slate-300">
              Full name
            </label>
            <input
              id="full-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFullName(event.target.value)}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="Alex Kim"
            />
          </div>

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
                autoComplete="new-password"
                value={password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
                placeholder="Minimum 8 characters"
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
          </div>

          <Button
            type="submit"
            className="w-full rounded-2xl bg-emerald-500 text-sm font-medium text-slate-950 transition-all hover:bg-emerald-600 active:scale-[0.985]"
            disabled={isAnyLoading}
          >
            {isPasswordSignupLoading ? 'Creating account…' : 'Create account'}
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
            onClick={handleMagicLinkSignup}
          >
            <Mail className="h-4 w-4" />
            {isMagicLinkLoading ? 'Sending magic link…' : 'Sign up with magic link'}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl border-zinc-800 bg-zinc-950 text-sm font-medium text-slate-200 hover:bg-zinc-900"
            disabled={isAnyLoading}
            onClick={handleGoogleSignUp}
          >
            <Chrome className="h-4 w-4" />
            {isOAuthLoading ? 'Redirecting…' : 'Continue with Google'}
          </Button>
        </div>

        <div className="mt-6 flex items-center justify-between text-xs text-slate-500">
          <span>Already have an account?</span>
          <button
            type="button"
            className="text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
            onClick={() => router.push('/login')}
          >
            Sign in
          </button>
        </div>
      </div>

      <div className="mt-6 text-center text-xs text-slate-500">
        <span className="mr-1">Looking to access an existing workspace?</span>
        <Link
          href="/login"
          className="text-slate-300 underline-offset-4 hover:text-emerald-400 hover:underline"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}

