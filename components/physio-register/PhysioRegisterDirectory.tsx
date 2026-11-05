'use client';

/**
 * The Physio Register (/physio-register): anyone can search registered physiotherapists and open a
 * profile to verify them (licence, regulator, colleague verifications). Physios can list
 * themselves (the multi-step form at /physio-register/register) or join Rehabify's care network.
 */

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import { ArrowRight, Loader2, Search, ShieldCheck, UserPlus, WhatsApp } from '@/components/icons';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhysioProfileCard, { type PhysioProfileCardData } from '@/components/physio-register/PhysioProfileCard';
import { displayFont, pillGhostOnDark, pillLime } from '@/components/learn/shared';
import { signUpHrefFor } from '@/lib/auth/signupIntent';
import { cn } from '@/lib/utils';

type SortBy = 'ranking' | 'newest' | 'experience' | 'name';

// Plain references: the generated `api` type is at TypeScript's depth limit (TS2589)
const registryRef = makeFunctionReference<
  'query',
  { searchQuery?: string; sortBy?: SortBy; limit?: number },
  { results: PhysioProfileCardData[]; total: number }
>('physioRegistry:listPublicRegistry');
const statsRef = makeFunctionReference<'query', Record<string, never>, { totalRegistered: number; totalVerifiedByRehabify: number }>(
  'physioRegistry:getRegistryStats'
);

const JOIN_REGISTER = '/physio-register/register';
const JOY_WHATSAPP = `https://wa.me/2348122615453?text=${encodeURIComponent('Hi Joy! 👋🏾 I need help getting matched with a verified physiotherapist for my recovery.')}`;

const SORTS: { value: SortBy; label: string }[] = [
  { value: 'ranking', label: 'Top ranked' },
  { value: 'newest', label: 'Newest' },
  { value: 'experience', label: 'Most experienced' },
  { value: 'name', label: 'Name (A–Z)' },
];

export default function PhysioRegisterDirectory() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('ranking');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(value.trim()), 300);
  };

  const data = useQuery(registryRef, { searchQuery: debouncedQuery || undefined, sortBy, limit: 60 });
  const stats = useQuery(statsRef, {});
  const isLoading = data === undefined;
  const physios = data?.results ?? [];
  const searching = searchQuery.trim() !== debouncedQuery;

  return (
    <div className="min-h-screen bg-rh-cream">
      {/* Hero: search first, then the two ways in for physios */}
      <section className="px-4 pb-8 pt-24 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-rh-ink px-6 py-12 text-white sm:px-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-lime">The Physio Register</p>
            <h1 className={cn('mt-3 text-[34px] leading-[1.1] tracking-tight sm:text-[52px]', displayFont)}>
              Find and verify a physiotherapist
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/70 sm:text-lg">
              Every profile shows the physio’s licence, their regulator and what colleagues and patients say about them.
            </p>

            <div className="relative mx-auto mt-8 max-w-xl">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-rh-ink/40" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Name, specialty, city or licence number"
                aria-label="Search the register"
                className="h-14 w-full rounded-full bg-white pl-12 pr-12 text-[15px] text-rh-ink outline-none ring-rh-lime placeholder:text-rh-ink/40 focus-visible:ring-2"
              />
              {searching && <Loader2 className="absolute right-5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-rh-ink/50" />}
            </div>

            {stats && stats.totalRegistered > 0 && (
              <p className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-white/60">
                <span>
                  <strong className="font-semibold text-white">{stats.totalRegistered.toLocaleString()}</strong> registered
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-rh-lime" />
                  <strong className="font-semibold text-white">{stats.totalVerifiedByRehabify.toLocaleString()}</strong> verified by Rehabify
                </span>
              </p>
            )}

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={JOIN_REGISTER} className={cn(pillLime, 'w-full sm:w-auto')}>
                <UserPlus className="h-4 w-4" /> Join the Physio Register
              </Link>
              <Link href={signUpHrefFor('physiotherapist')} className={cn(pillGhostOnDark, 'w-full sm:w-auto')}>
                Join Rehabify <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        {/* Patients looking for care go to Joy */}
        <a
          href={JOY_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col gap-1 rounded-[1.5rem] bg-white px-5 py-4 shadow-soft transition hover:shadow-lift sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="text-[15px] font-semibold text-rh-ink">Looking for a physio for yourself or family?</span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-rh-ink/70 group-hover:text-rh-ink">
            <WhatsApp className="h-4 w-4 text-[#25D366]" /> Chat with Joy to book a session <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </a>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-rh-ink/60">
            {isLoading
              ? 'Loading the register…'
              : debouncedQuery
                ? `${data.total.toLocaleString()} result${data.total === 1 ? '' : 's'} for “${debouncedQuery}”`
                : `${data.total.toLocaleString()} physiotherapist${data.total === 1 ? '' : 's'}`}
          </p>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
            <SelectTrigger className="h-10 w-44 rounded-full border-rh-ink/10 bg-white text-sm" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((sort) => (
                <SelectItem key={sort.value} value={sort.value}>
                  {sort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-[1.75rem] bg-rh-ink/[0.06]" />
            ))}
          </div>
        ) : physios.length > 0 ? (
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {physios.map((physio) => (
              <PhysioProfileCard key={physio.id} data={physio} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-[2rem] bg-white px-6 py-16 text-center shadow-soft">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rh-ink/[0.05]">
              <Search className="h-5 w-5 text-rh-ink/40" />
            </span>
            <h2 className={cn('mt-4 text-2xl tracking-tight text-rh-ink', displayFont)}>
              {debouncedQuery ? 'No one matches that yet' : 'The register is opening'}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-rh-ink/60">
              {debouncedQuery ? 'Try a name, a city, a specialty or a licence number.' : 'Be one of the first physiotherapists on the register.'}
            </p>
          </div>
        )}

        {/* For physiotherapists */}
        <section className="mt-14 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col rounded-[2rem] bg-white p-7 shadow-soft sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-ink/50">For physiotherapists</p>
            <h2 className={cn('mt-2 text-2xl leading-snug tracking-tight text-rh-ink', displayFont)}>Get listed on the Physio Register</h2>
            <p className="mt-2 text-[15px] text-rh-ink/60">
              A free public profile patients and colleagues can check: your licence, specialties and where you practise.
            </p>
            <Link href={JOIN_REGISTER} className="mt-6 inline-flex items-center gap-2 self-start rounded-full bg-rh-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-black">
              <UserPlus className="h-4 w-4" /> Join the Physio Register
            </Link>
          </div>
          <div className="flex flex-col rounded-[2rem] bg-rh-ink p-7 text-white sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rh-lime">Rehabify care network</p>
            <h2 className={cn('mt-2 text-2xl leading-snug tracking-tight', displayFont)}>See more patients with Rehabify</h2>
            <p className="mt-2 text-[15px] text-white/70">
              Get matched with patients near you or online, run your practice in one place, and get paid every Friday.
            </p>
            <Link href={signUpHrefFor('physiotherapist')} className={cn(pillLime, 'mt-6 self-start')}>
              Join Rehabify <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
