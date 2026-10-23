'use client';

import { useState } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { formatDistanceToNow } from 'date-fns';
import { Copy, Mail, X } from '@/components/icons';
import { toast } from 'sonner';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Panel, StatusBadge, softButtonClass } from '@/components/physio/ui';
import { programError } from '@/components/exercise-programs/errors';

type PendingInvitation = {
  _id: Id<'patientInvitations'>;
  code: string;
  patientEmail?: string;
  patientName?: string;
  status: 'pending' | 'accepted' | 'expired';
  createdAt: number;
  expiresAt: number;
};

/**
 * Invitations the patient hasn't accepted yet, with the link to copy, a resend and a cancel.
 * Patients only appear on the list once they accept, so this is where the physio follows up.
 */
export function PendingInvitations() {
  const invitations = useQuery(api.patientInvitations.getMyPatientInvitations, { status: 'pending' }) as
    | PendingInvitation[]
    | undefined;
  const revoke = useMutation(api.patientInvitations.revokePatientInvitation);
  const resend = useAction(api.actions.patients.invitePatient.resendPatientInvitation);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!invitations || invitations.length === 0) return null;

  const linkFor = (code: string) => `${window.location.origin}/patient-invite/${code}`;

  const copyLink = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code));
      toast.success('Invitation link copied');
    } catch {
      toast.error("Couldn't copy the link. Select and copy it instead: " + linkFor(code));
    }
  };

  const run = async (id: string, work: () => Promise<{ success: boolean; message?: string } | unknown>, done: string) => {
    setBusyId(id);
    try {
      const result = (await work()) as { success?: boolean; message?: string } | undefined;
      if (result && result.success === false) toast.error(result.message || 'Something went wrong');
      else toast.success(done);
    } catch (error) {
      toast.error(programError(error, 'Something went wrong. Please try again.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Panel title="Waiting to accept" description="Patients join your list once they accept their invitation.">
      <ul className="p-2">
        {invitations.map((inv) => {
          const expired = inv.expiresAt < Date.now();
          const busy = busyId === inv._id;
          return (
            <li key={inv._id} className="flex flex-wrap items-center gap-3 rounded-2xl px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-rh-night dark:text-white">
                  {inv.patientName || inv.patientEmail || 'Invited patient'}
                </p>
                <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {inv.patientName && inv.patientEmail ? `${inv.patientEmail} · ` : ''}
                  Invited {formatDistanceToNow(inv.createdAt, { addSuffix: true })}
                </p>
              </div>
              <StatusBadge tone={expired ? 'red' : 'neutral'}>{expired ? 'Link expired' : `Expires ${formatDistanceToNow(inv.expiresAt, { addSuffix: true })}`}</StatusBadge>
              <div className="flex items-center gap-1.5">
                {!expired && (
                  <Button size="sm" variant="ghost" className={softButtonClass} onClick={() => copyLink(inv.code)}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy link
                  </Button>
                )}
                {inv.patientEmail && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className={softButtonClass}
                    disabled={busy}
                    onClick={() => run(inv._id, () => resend({ invitationId: inv._id }), 'Invitation sent again')}
                  >
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                    {expired ? 'Renew & resend' : 'Resend'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl text-neutral-500 hover:text-rose-600"
                  disabled={busy}
                  aria-label="Cancel invitation"
                  onClick={() => {
                    if (!window.confirm('Cancel this invitation? Its link will stop working.')) return;
                    void run(inv._id, () => revoke({ invitationId: inv._id }), 'Invitation cancelled');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
