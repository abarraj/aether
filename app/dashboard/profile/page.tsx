// Profile settings page for editing user details and avatar.
'use client';

import React, { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

const profileSchema = z.object({
  fullName: z.string().min(1, 'Name is required.'),
});

type ProfileValues = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { profile } = useUser();
  const supabase = createClient();

  const [values, setValues] = useState<ProfileValues>({
    fullName: profile?.full_name ?? '',
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Please fix your details.');
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: parsed.data.fullName })
        .eq('id', profile.id);

      if (error) {
        toast.error('Unable to save profile.');
        setIsSaving(false);
        return;
      }

      toast.success('Profile updated.');
    } catch {
      toast.error('Unexpected error saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Avatar must be smaller than 2MB.');
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const fileExt = file.name.split('.').pop() ?? 'png';
      const filePath = `${profile.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        toast.error('Unable to upload avatar.');
        setIsUploadingAvatar(false);
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', profile.id);

      if (updateError) {
        toast.error('Unable to save avatar.');
        setIsUploadingAvatar(false);
        return;
      }

      toast.success('Avatar updated.');
    } catch {
      toast.error('Unexpected error uploading avatar.');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Profile</h1>
        <p className="mt-1 text-sm text-slate-400">
          Control how you appear across Aether.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)]">
        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]"
        >
          <div className="space-y-2">
            <label htmlFor="full-name" className="block text-sm font-medium text-slate-300">
              Full name
            </label>
            <input
              id="full-name"
              type="text"
              value={values.fullName}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, fullName: event.target.value }))
              }
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
              placeholder="Alex Kim"
            />
          </div>
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-2xl bg-emerald-500 px-6 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-700"
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        <div className="space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <h2 className="text-sm font-semibold tracking-tight text-slate-200">
            Avatar
          </h2>
          <p className="text-xs text-slate-500">
            This is how you&apos;ll appear in the sidebar and throughout your workspace.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-lg font-medium text-slate-200">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt="Avatar"
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                (profile?.full_name ?? 'Aether')
                  .split(' ')
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
              )}
            </div>
            <div className="space-y-2 text-xs">
              <label className="inline-flex cursor-pointer items-center rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2 font-medium text-slate-200 hover:bg-zinc-900">
                <span>{isUploadingAvatar ? 'Uploading…' : 'Upload avatar'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={isUploadingAvatar}
                />
              </label>
              <p className="text-slate-500">PNG or JPG, max 2MB.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

