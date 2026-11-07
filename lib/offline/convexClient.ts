'use client';

/**
 * Convex's React client, plus offline answers. For the queries in lib/offline/offlineQueries.ts:
 * - a live answer is kept (encrypted, on this phone) once the server has accepted the person's
 *   sign-in, and only under that person: the user id comes from their own auth token;
 * - while there is no live answer (offline, or still loading) the saved one is shown, so pages open
 *   instantly and work without internet. Live answers always win once they arrive.
 * Every other query behaves exactly as before. With offline mode off, nothing changes at all.
 */
import { ConvexReactClient, type Watch, type WatchQueryOptions } from 'convex/react';
import { getFunctionName, type ArgsAndOptions, type FunctionReference, type FunctionReturnType } from 'convex/server';
import type { Value } from 'convex/values';
import { offlineModeOn } from '@/lib/pwa';
import { offlineRuleFor } from './offlineQueries';
import { keepAnswer, onSavedAnswersChange, savedAnswer } from './savedAnswers';
import { kickSync } from './sync';
import { subscribeVault, vaultState } from './vault';

type AuthTokenFetcher = Parameters<ConvexReactClient['setAuth']>[0];

/** The Clerk user id in a Convex auth token (JWT "sub"). Not verified here: the server does that. */
function subjectOf(token: string | null | undefined): string | null {
  try {
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

type ActiveQuery = { name: string; keyArgs: Record<string, unknown>; read: () => unknown };

export class OfflineConvexClient extends ConvexReactClient {
  /** The person the server has accepted, or null (signed out, or not confirmed yet) */
  private signedInAs: string | null = null;
  /**
   * Sign-in as far as this client knows: "unknown" until Clerk has loaded, "pending" while the
   * server checks the token. Until it's settled, an answer the server gave without sign-in (e.g.
   * "no such user") isn't shown: it would send a signed-in person to /sign-in.
   */
  private authState: 'unknown' | 'pending' | 'signedIn' | 'signedOut' = 'unknown';
  private authListeners = new Set<() => void>();
  /** Allowlisted queries on screen right now */
  private active = new Set<ActiveQuery>();

  private setAuthState(next: typeof this.authState) {
    if (this.authState === next) return;
    this.authState = next;
    this.authListeners.forEach((listener) => listener());
  }

  constructor(...args: ConstructorParameters<typeof ConvexReactClient>) {
    super(...args);
    // Answers usually arrive before the vault opens (PIN just set, or the silent unlock after a
    // page load) and don't change again, so save what's on screen the moment it opens
    subscribeVault(() => this.keepAnswersOnScreen());
  }

  private keepAnswersOnScreen() {
    const userId = this.signedInAs;
    if (!userId || vaultState().status !== 'unlocked') return;
    for (const query of this.active) {
      try {
        const value = query.read();
        if (value !== undefined) keepAnswer(userId, query.name, query.keyArgs, value as Value);
      } catch {
        // A failed query has nothing to keep
      }
    }
  }

  override setAuth(fetchToken: AuthTokenFetcher, onChange?: (isAuthenticated: boolean) => void) {
    let tokenSubject: string | null = null;
    this.setAuthState('pending');
    super.setAuth(
      async (args) => {
        const token = await fetchToken(args);
        tokenSubject = subjectOf(token);
        return token;
      },
      (isAuthenticated) => {
        this.signedInAs = isAuthenticated ? tokenSubject : null;
        onChange?.(isAuthenticated);
        this.setAuthState(isAuthenticated ? 'signedIn' : 'signedOut');
        this.keepAnswersOnScreen();
        // Signed in again: send what was kept on this phone
        if (isAuthenticated) kickSync();
      }
    );
  }

  override clearAuth() {
    this.signedInAs = null;
    super.clearAuth();
    this.setAuthState('signedOut');
  }

  /** The person the server has accepted right now (changes kept offline are sent only as them). */
  signedInUser(): string | null {
    return this.signedInAs;
  }

  /**
   * Clerk loaded and nobody is signed in. Convex's provider only clears auth after a sign-in, so
   * without this a page opened signed out would wait instead of going to /sign-in.
   */
  noteSignedOut() {
    if (this.authState === 'unknown') this.setAuthState('signedOut');
  }

  override watchQuery<Query extends FunctionReference<'query'>>(
    query: Query,
    ...argsAndOptions: ArgsAndOptions<Query, WatchQueryOptions>
  ): Watch<FunctionReturnType<Query>> {
    const watch = super.watchQuery(query, ...argsAndOptions);
    const name = getFunctionName(query);
    const rule = offlineRuleFor(name);
    if (!rule || !offlineModeOn()) return watch;

    const args = (argsAndOptions[0] ?? {}) as Record<string, unknown>;
    const keyArgs = rule.key ? rule.key(args) : args;
    // Only an answer given to a signed-in person counts: signed-out answers are never saved, and
    // never hide a saved one (Clerk failing while Convex is reachable answers as "signed out")
    const liveForSignedIn = () => (this.signedInAs ? watch.localQueryResult() : undefined);

    return {
      ...watch,
      onUpdate: (callback) => {
        const active: ActiveQuery = { name, keyArgs, read: liveForSignedIn };
        this.active.add(active);
        const stopLive = watch.onUpdate(() => {
          try {
            const value = liveForSignedIn();
            if (value !== undefined && this.signedInAs) keepAnswer(this.signedInAs, name, keyArgs, value as Value);
          } catch {
            // The query failed: useQuery reports it as before
          }
          callback();
        });
        const stopSaved = onSavedAnswersChange(callback);
        this.authListeners.add(callback);
        return () => {
          this.active.delete(active);
          stopLive();
          stopSaved();
          this.authListeners.delete(callback);
        };
      },
      localQueryResult: () => {
        const live = liveForSignedIn();
        if (live !== undefined) return live;
        const saved = savedAnswer(name, keyArgs);
        if (saved !== undefined) return saved as FunctionReturnType<Query>;
        // Sign-in not settled yet (Clerk loading, or the token being checked): still loading.
        // Without this, the answer given before sign-in ("no such user") redirects to /sign-in.
        if (this.authState === 'unknown' || this.authState === 'pending') return undefined;
        // Signed out, nothing saved: the plain answer (signed-out pages still redirect to sign-in)
        return watch.localQueryResult();
      },
    };
  }
}
