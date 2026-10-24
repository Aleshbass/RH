import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { ConvexHttpClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { api } from '@/convex/_generated/api';
import { SUPPORT_EMAIL } from '@/lib/contact';

export const dynamic = 'force-dynamic';

/**
 * Self-service account deletion (patient and physio settings). Convex erases the personal data
 * as the signed-in user (users.deleteMyAccount refuses while visits are upcoming), then the
 * Clerk sign-in is deleted. Clerk's user.deleted webhook finds nothing left to erase.
 */
export async function POST() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  const token = await getToken({ template: 'convex' }).catch(() => null);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!token || !convexUrl) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 });
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  try {
    await convex.mutation(api.users.deleteMyAccount, { confirm: 'DELETE' });
  } catch (error) {
    const message =
      error instanceof ConvexError && typeof error.data === 'string'
        ? error.data
        : `We couldn't delete your account. Please try again or email ${SUPPORT_EMAIL}.`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch {
    // The data is already erased; the old sign-in now opens a fresh, empty account
    return NextResponse.json({ success: true, signInRemoved: false });
  }

  return NextResponse.json({ success: true, signInRemoved: true });
}
