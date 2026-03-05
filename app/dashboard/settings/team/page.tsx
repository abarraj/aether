'use client';

import React, { useEffect, useState, useCallback, type FormEvent } from 'react';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, RotateCw, Trash2 } from 'lucide-react';

import { useUser } from '@/hooks/use-user';
import { createClient } from '@/lib/supabase/client';
import { ROLES, INVITABLE_ROLES, hasPermission, type Role } from '@/lib/auth/permissions';

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
  expires_at: string | null;
};

const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address.'),
  role: z.enum(['admin', 'editor', 'viewer']),
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
    role: 'viewer',
  });
  const [isInviting, setIsInviting] = useState<boolean>(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);

  const userRole = (profile?.role ?? 'viewer') as Role;
  const canManageTeam = hasPermission(userRole, 'manage_team');
  const canChangeRoles = hasPermission(userRole, 'change_roles');

  const loadInvites = useCallback(async () => {
    if (!org) return;
    const { data: pendingInvites } = await supabase
      .from('invites')
      .select('id, email, role, status, created_at, expires_at')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .returns<InviteRow[]>();
    setInvites(pendingInvites ?? []);
  }, [org, supabase]);

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

      setMembers(profiles ?? []);
      await loadInvites();
      setIsLoading(false);
    };

    void load();
  }, [org, supabase, loadInvites]);

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
      setLastInviteLink(null);

      const res = await fetch('/api/invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: parsed.data.email.toLowerCase(),
          role: parsed.data.role,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Unable to create invite.');
        return;
      }

      try {
        void fetch('/api/audit/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'user.invite',
            targetType: 'user',
            targetId: parsed.data.email.toLowerCase(),
            description: `Invited ${parsed.data.email.toLowerCase()} as ${parsed.data.role}`,
            metadata: { role: parsed.data.role },
          }),
        });
      } catch {
        // Audit logging failure should not block invite.
      }

      setLastInviteLink(data.inviteLink);
      toast.success('Invite created. Copy the link below to share.');
      setInviteValues({ email: '', role: 'viewer' });
      await loadInvites();
    } catch {
      toast.error('Unexpected error sending invite.');
    } finally {
      setIsInviting(false);
    }
  };

  const handleResend = async (email: string) => {
    try {
      const res = await fetch('/api/invites/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Unable to resend invite.');
        return;
      }
      setLastInviteLink(data.inviteLink);
      toast.success('New invite link generated.');
      await loadInvites();
    } catch {
      toast.error('Failed to resend invite.');
    }
  };

  const handleRevoke = async (inviteId: string) => {
    const confirmed = window.confirm('Revoke this invite? The link will stop working immediately.');
    if (!confirmed) return;

    try {
      const res = await fetch('/api/invites/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Unable to revoke invite.');
        return;
      }
      toast.success('Invite revoked.');
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch {
      toast.error('Failed to revoke invite.');
    }
  };

  const handleCopyLink = async () => {
    if (!lastInviteLink) return;
    try {
      await navigator.clipboard.writeText(lastInviteLink);
      toast.success('Invite link copied to clipboard.');
    } catch {
      toast.error('Failed to copy link.');
    }
  };

  const handleChangeRole = async (member: ProfileRow, nextRole: string) => {
    if (!org) return;
    if (!canChangeRoles) {
      toast.error('Only owners can change roles.');
      return;
    }
    if (!(ROLES as readonly string[]).includes(nextRole)) return;

    // Prevent self-demotion if it would orphan the org (last owner).
    if (profile?.id === member.id && member.role === 'owner' && nextRole !== 'owner') {
      const ownerCount = members.filter((m) => m.role === 'owner').length;
      if (ownerCount <= 1) {
        toast.error('Cannot demote the last owner. Promote another member first.');
        return;
      }
    }

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
      previous.map((item) => (item.id === member.id ? { ...item, role: nextRole } : item)),
    );
    toast.success('Role updated.');
  };

  const handleRemoveMember = async (member: ProfileRow) => {
    if (!org) return;
    if (!canManageTeam) {
      toast.error('You do not have permission to remove members.');
      return;
    }
    if (profile?.id === member.id) {
      toast.error('You cannot remove your own account here.');
      return;
    }
    if (member.role === 'owner') {
      toast.error('Cannot remove an owner. Demote them first.');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'member.remove',
          targetType: 'user',
          targetId: member.id,
          description: `Removed member ${member.full_name ?? member.email ?? member.id}`,
        }),
      });
    } catch {
      // Audit logging failure should not block removal.
    }

    setMembers((previous) => previous.filter((item) => item.id !== member.id));
    toast.success('Member removed.');
  };

  const pendingInvites = invites.filter((i) => i.status === 'pending');

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <h1 className="text-2xl font-semibold tracking-tighter">Team</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage who has access to your Aether workspace and what they can do.
        </p>
      </div>

      {/* Members table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-slate-200">Members</h2>
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
                    <td className="px-3 py-2 text-slate-100">{member.full_name ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-400">{member.email ?? '—'}</td>
                    <td className="px-3 py-2">
                      {canChangeRoles ? (
                        <select
                          value={member.role}
                          onChange={(event) => handleChangeRole(member, event.target.value)}
                          className="rounded-xl border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/60"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r.charAt(0).toUpperCase() + r.slice(1)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="capitalize text-slate-300">{member.role}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(member.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canManageTeam && profile?.id !== member.id && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(member)}
                          className="text-xs text-slate-400 underline-offset-4 hover:text-slate-200 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite member */}
      {canManageTeam && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 px-8 py-6 shadow-[0_0_0_1px_rgba(24,24,27,0.9)]">
          <h2 className="text-sm font-semibold tracking-tight text-slate-200">Invite member</h2>
          <p className="mt-1 text-xs text-slate-500">
            Send a secure invite link. The recipient must sign in and accept.
          </p>

          <form
            onSubmit={handleInvite}
            className="mt-4 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
          >
            <input
              type="email"
              value={inviteValues.email}
              onChange={(event) =>
                setInviteValues((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="teammate@yourbrand.com"
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
            />
            <select
              value={inviteValues.role}
              onChange={(event) =>
                setInviteValues((prev) => ({
                  ...prev,
                  role: event.target.value as InviteValues['role'],
                }))
              }
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:border-emerald-500/70"
            >
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
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

          {lastInviteLink && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <input
                readOnly
                value={lastInviteLink}
                className="flex-1 truncate bg-transparent text-xs text-emerald-300 outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-500/20"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
          )}

          {pendingInvites.length > 0 && (
            <div className="mt-5 text-xs text-slate-500">
              <div className="mb-2 font-medium text-slate-300">Pending invites</div>
              <ul className="space-y-2">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <span className="text-slate-300">{invite.email}</span>
                      <span className="ml-2 capitalize text-slate-500">{invite.role}</span>
                      {invite.expires_at && (
                        <span className="ml-2 text-[11px] text-slate-600">
                          expires {new Date(invite.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleResend(invite.email)}
                        title="Resend (rotate token)"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-zinc-800 hover:text-slate-200"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(invite.id)}
                        title="Revoke invite"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-zinc-800 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
