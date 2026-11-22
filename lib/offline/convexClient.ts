'use client';

/**
 * Convex's React client, plus offline answers. For the queries in lib/offline/offlineQueries.ts:
 * - a live answer is kept (encrypted, on this phone) once the server has accepted the person's
 *   sign-in, and only under that person: the user id comes from their own auth token;
 * - while there is no live answer (offline, or still loading) the saved one is shown, so pages open
 *   instantly and work without internet. Live answers always win once they arrive.
 * Every other query behaves exactly as before. With offline mode off, nothing changes at all.
 *
 * For everyone (offline mode or not), saves and actions never wait forever: without a connection
 * they're refused on the phone at once (lib/offline/connection.ts), before anything is sent.
 */
import { ConvexReactClient, type MutationOptions, type Watch, type WatchQueryOptions } from 'convex/react';
import {
  getFunctionName,
  makeFunctionReference,
  type ArgsAndOptions,
  type FunctionArgs,
  type FunctionReference,
  type FunctionReturnType,
  type OptionalRestArgs,
} from 'convex/server';
import type { Value } from 'convex/values';
import { offlineModeOn } from '@/lib/pwa';
import { OfflineSaveError, phoneOffline } from './connection';
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

/**
 * How long a save waits for the connection to come back (the phone says it's online, but the
 * line to the server is down) before it's refused. Longer before the first connection, which can
 * take a while on a slow network.
 */
const RECONNECT_WAIT_MS = 8_000;
const FIRST_CONNECT_WAIT_MS = 20_000;

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

  /**
   * Resolves once the line to the server is up. Refuses at once when the phone has no network,
   * or after a short wait when the line doesn't come back. Nothing has been sent when it refuses.
   */
  private async whenConnected(): Promise<void> {
    if (phoneOffline()) throw new OfflineSaveError();
    if (this.connectionState().isWebSocketConnected) return;
    const deadline = Date.now() + (this.connectionState().hasEverConnected ? RECONNECT_WAIT_MS : FIRST_CONNECT_WAIT_MS);
    while (!this.connectionState().isWebSocketConnected) {
      if (phoneOffline() || Date.now() >= deadline) throw new OfflineSaveError();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  override async mutation<Mutation extends FunctionReference<'mutation'>>(
    mutation: Mutation,
    ...argsAndOptions: ArgsAndOptions<Mutation, MutationOptions<FunctionArgs<Mutation>>>
  ): Promise<FunctionReturnType<Mutation>> {
    await this.whenConnected();
    return super.mutation(mutation, ...argsAndOptions);
  }

  override async action<Action extends FunctionReference<'action'>>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>> {
    await this.whenConnected();
    return super.action(action, ...args);
  }

  /**
   * One answer straight from the server (never a saved one), for keeping data offline ahead of
   * time (lib/offline/caseload.ts). Refuses after `timeoutMs` without an answer.
   */
  async liveQuery(name: string, args: Record<string, Value>, timeoutMs = 20_000): Promise<unknown> {
    if (phoneOffline()) throw new OfflineSaveError();
    const watch = super.watchQuery(makeFunctionReference<'query', Record<string, Value>, unknown>(name), args);
    const now = watch.localQueryResult();
    if (now !== undefined) return now;
    return new Promise((resolve, reject) => {
      let stop: () => void = () => undefined;
      const timer = setTimeout(() => {
        stop();
        reject(new Error('No answer from the server in time'));
      }, timeoutMs);
      stop = watch.onUpdate(() => {
        try {
          const value = watch.localQueryResult();
          if (value === undefined) return;
          clearTimeout(timer);
          stop();
          resolve(value);
        } catch (error) {
          clearTimeout(timer);
          stop();
          reject(error);
        }
      });
    });
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
