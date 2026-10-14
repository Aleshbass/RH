'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import { ChevronLeft, MessageSquare, Plus } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import RealtimeChat from '@/components/chat/RealtimeChat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/physio/ui';
import { cn } from '@/lib/utils';

type Conversation = {
  _id: Id<'conversations'>;
  otherParticipant: { _id: Id<'users'>; firstName?: string; lastName?: string };
  lastMessage?: { content: string };
  unreadCount: number;
};

type PatientLite = { _id: Id<'users'>; firstName?: string; lastName?: string; email?: string };

const fullName = (p?: { firstName?: string; lastName?: string }) =>
  [p?.firstName, p?.lastName].filter(Boolean).join(' ') || 'Unknown';
const initials = (p?: { firstName?: string; lastName?: string }) =>
  `${p?.firstName?.[0] ?? ''}${p?.lastName?.[0] ?? ''}`.toUpperCase() || '?';

export default function PhysiotherapistMessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversations = useQuery(api.chat.getMyConversations, {}) as Conversation[] | undefined;
  const patients = useQuery(api.patients.getMyPatients, { limit: 200 }) as PatientLite[] | undefined;

  // Who we're chatting with. Tracked directly so a brand-new conversation opens straight away.
  const [recipientId, setRecipientId] = useState<Id<'users'> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // ?with=<userId> opens that conversation (used by "Message" on a patient's page)
  useEffect(() => {
    const target = searchParams.get('with');
    if (target) setRecipientId(target as Id<'users'>);
  }, [searchParams]);

  const recipient = useMemo(() => {
    if (!recipientId) return undefined;
    return (
      conversations?.find((c) => c.otherParticipant._id === recipientId)?.otherParticipant ??
      patients?.find((p) => p._id === recipientId)
    );
  }, [recipientId, conversations, patients]);

  const pickerResults = useMemo(() => {
    const term = pickerSearch.trim().toLowerCase();
    return (patients ?? []).filter((p) => !term || `${fullName(p)} ${p.email ?? ''}`.toLowerCase().includes(term));
  }, [patients, pickerSearch]);

  const select = (id: Id<'users'>) => {
    setRecipientId(id);
    if (searchParams.get('with')) router.replace('/dashboard/physiotherapist/messages');
  };

  return (
    // Fills the screen under the top bar; on phones the list and the chat take turns
    <div className="mx-auto flex h-[calc(100dvh-9.5rem)] w-full max-w-6xl min-h-[28rem] overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-soft dark:border-white/[0.06] dark:bg-rh-ink-2 dark:shadow-none lg:h-[calc(100dvh-10rem)]">
      <aside
        className={cn(
          'flex w-full flex-col border-r border-neutral-200 dark:border-white/[0.07] md:w-80 md:shrink-0',
          recipientId ? 'hidden md:flex' : 'flex'
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 px-4 dark:border-white/[0.07]">
          <h1 className="text-base font-semibold text-neutral-900 dark:text-white">Messages</h1>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations === undefined ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-8 w-8" />}
              title="No conversations yet"
              description="Message a patient to share exercises, check in between sessions or answer questions."
            />
          ) : (
            <ul>
              {conversations.map((conversation) => {
                const person = conversation.otherParticipant;
                const active = person._id === recipientId;
                return (
                  <li key={conversation._id}>
                    <button
                      type="button"
                      onClick={() => select(person._id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        active ? 'bg-neutral-100 dark:bg-neutral-800' : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                      )}
                    >
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-neutral-100 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {initials(person)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm text-neutral-900 dark:text-white', conversation.unreadCount > 0 && 'font-semibold')}>
                          {fullName(person)}
                        </span>
                        {conversation.lastMessage && (
                          <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">{conversation.lastMessage.content}</span>
                        )}
                      </span>
                      {conversation.unreadCount > 0 && (
                        <span className="min-w-5 rounded-full bg-[#005b57] px-1.5 text-center text-[11px] font-medium leading-5 text-white dark:bg-[#2dd4bf] dark:text-neutral-950">
                          {conversation.unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      <section className={cn('min-w-0 flex-1 flex-col', recipientId ? 'flex' : 'hidden md:flex')}>
        {recipientId ? (
          <>
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-200 px-2 dark:border-white/[0.07] md:px-4">
              <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setRecipientId(null)} aria-label="Back to conversations">
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <p className="truncate text-sm font-semibold text-neutral-900 dark:text-white">{fullName(recipient)}</p>
            </div>
            <div className="min-h-0 flex-1">
              <RealtimeChat key={recipientId} recipientId={recipientId} embedded />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="Choose a conversation" description="Or start a new one with a patient." />
          </div>
        )}
      </section>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-neutral-200 p-4 dark:border-white/[0.07]">
            <DialogTitle>New message</DialogTitle>
          </DialogHeader>
          <div className="p-3">
            <Input
              autoFocus
              placeholder="Search your patients"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
              aria-label="Search your patients"
            />
          </div>
          <ul className="max-h-80 overflow-y-auto pb-2">
            {patients === undefined ? (
              <li className="px-4 py-3 text-sm text-neutral-500">Loading…</li>
            ) : pickerResults.length === 0 ? (
              <li className="px-4 py-3 text-sm text-neutral-500">No patients found.</li>
            ) : (
              pickerResults.map((patient) => (
                <li key={patient._id}>
                  <button
                    type="button"
                    onClick={() => {
                      select(patient._id);
                      setPickerOpen(false);
                      setPickerSearch('');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-neutral-100 text-xs dark:bg-neutral-800">{initials(patient)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-neutral-900 dark:text-white">{fullName(patient)}</span>
                      {patient.email && <span className="block truncate text-xs text-neutral-500">{patient.email}</span>}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
