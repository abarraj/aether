// Team management settings page.
'use client';

import React, { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
};

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

type InviteValues = z.infer<typeof inviteSchema>;

export default function TeamSettingsPage() {
  const { org, profile } = useUser();
  const supabase = createClient();

  const [members, setMembers] = useState<ProfileRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [inviteValues, setInviteValues] = useState<InviteValues>({
    email: '',
    role: 'member',
  });
  const [isInviting, setIsInviting] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      if (!org) {
        setIsLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, created_at')
        .eq('org_id', org.id)
        .order('created_at', { ascending: true })
        .returns<ProfileRow[]>();

      const { data: pendingInvites } = await supabase
        .from('invites')
        .select('id, email, role, status, created_at')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .returns<InviteRow[]>();

      setMembers(profiles ?? []);
      setInvites(pendingInvites ?? []);
      setIsLoading(false);
    };

    void load();
  }, [org, supabase]);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    if (!org) return;

    const parsed = inviteSchema.safeParse(inviteValues);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Please fix the invitation details.');
      return;
    }

    try {
      setIsInviting(true);
      const { error } = await supabase
        .from('invites')
        .insert({
          org_id: org.id,
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.role,
        });

      if (error) {
        toast.error('Unable to create invite.');
        setIsInviting(false);
        return;
      }

      try {
        void fetch('/api/audit/log', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'user.invite',
            targetType: 'user',
            targetId: parsed.data.email.toLowerCase(),
            description: `Invited ${parsed.data.email.toLowerCase()} as ${parsed.data.role}`,
            metadata: {
              role: parsed.data.role,
            },
          }),
        });
      } catch {
        // Ignore audit logging failures.
      }

      toast.success('Invite recorded. We’ll notify this member when access is ready.');
      setInviteValues({ email: '', role: 'member' });

      const { data: pendingInvites } = await supabase
        .from('invites')
        .select('id, email, role, status, created_at')
        .eq('org_id', org.id)
        .order('created_at', { ascending: false })
        .returns<InviteRow[]>();
      setInvites(pendingInvites ?? []);
    } catch {
      toast.error('Unexpected error sending invite.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleChangeRole = async (member: ProfileRow, nextRole: string) => {
    if (!org) return;
    if (profile?.id === member.id && profile.role === 'owner') {
      toast.error('You cannot downgrade your own owner role from here.');
      return;
    }

    const allowedRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!allowedRoles.includes(nextRole)) return;

    const { error } = await supabase
      .from('profiles')
      .update({ role: nextRole })
      .eq('id', member.id)
      .eq('org_id', org.id);

    if (error) {
      toast.error('Unable to update role.');
      return;
    }

    setMembers((previous) =>
      previous.map((item) =>
        item.id === member.id
          ? {
              ...item,
              role: nextRole,
            }
          : item,
      ),
    );
    toast.success('Role updated.');
  };

  const handleRemoveMember = async (member: ProfileRow) => {
    if (!org) return;
    if (profile?.id === member.id) {
      toast.error('You cannot remove your own account here.');
      return;
    }

    const confirmed = window.confirm(
      `Remove ${member.full_name ?? member.email ?? 'this member'} from your workspace?`,
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', member.id)
      .eq('org_id', org.id);

    if (error) {
      toast.error('Unable to remove member.');
      return;
    }

    try {
      void fetch('/api/audit/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'member.remove',
          targetType: 'user',
          targetId: member.id,
          description: `Removed member ${member.full_name ?? member.email ?? member.id}`,
        }),
      });
    } catch {
      // Ignore audit logging failures.
    }

    setMembers((previous) => previous.filter((item) => item.id !== member.id));
    toast.success('Member removed.');
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Team</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage who has access to your Aether workspace and what they can do.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-200">
              Members
            </h2>
            <p className="text-xs text-slate-500">
              Owners can update roles and remove members. Invites will appear below once created.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="min-w-full border-collapse text-left text-slate-200">
            <thead>
              <tr>
                <th className="border-b border-zinc-800 px-3 py-2 text-slate-400">Name</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-slate-400">Email</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-slate-400">Role</th>
                <th className="border-b border-zinc-800 px-3 py-2 text-slate-400">Joined</th>
                <th className="border-b border-zinc-800 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    Loading team…
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No members yet.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="border-b border-zinc-900 last:border-0">
                    <td className="px-3 py-2 text-slate-100">
                      {member.full_name ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {member.email ?? '—'}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={member.role}
                        onChange={(event) => handleChangeRole(member, event.target.value)}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/60"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member)}
                        className="text-xs text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h2 className="text-sm font-semibold tracking-tight text-slate-200">
          Invite member
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          We&apos;ll record the invite now and wire it into auth as we expand the beta.
        </p>

        <form onSubmit={handleInvite} className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
          <input
            type="email"
            value={inviteValues.email}
            onChange={(event) =>
              setInviteValues((previous) => ({ ...previous, email: event.target.value }))
            }
            placeholder="teammate@yourbrand.com"
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
          />
          <select
            value={inviteValues.role}
            onChange={(event) =>
              setInviteValues((previous) => ({
                ...previous,
                role: event.target.value as InviteValues['role'],
              }))
            }
            className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
          >
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={isInviting}
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 hover:bg-emerald-600 active:scale-[0.985] disabled:bg-zinc-700"
          >
            {isInviting ? 'Sending…' : 'Invite'}
          </button>
        </form>

        {invites.length > 0 && (
          <div className="mt-5 text-xs text-slate-500">
            <div className="mb-2 font-medium text-slate-300">Pending invites</div>
            <ul className="space-y-1">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between">
                  <span className="text-slate-300">
                    {invite.email} • {invite.role}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

