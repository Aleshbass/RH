import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'

/**
 * The signed-in user's Convex record, looked up on the server with their Clerk token.
 * Returns null when signed out or when Convex can't be reached.
 */
export async function getServerViewer(): Promise<{ _id: string; role?: string } | null> {
  const { userId, getToken } = await auth()
  if (!userId) return null
  const token = await getToken({ template: 'convex' }).catch(() => null)
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!token || !convexUrl) return null
  const client = new ConvexHttpClient(convexUrl)
  client.setAuth(token)
  const me = await client.query(api.users.getMyUser, {}).catch(() => null)
  return me ? { _id: me._id as string, role: me.role as string | undefined } : null
}

/** True when the caller is a signed-in user with one of the given roles. */
export async function viewerHasRole(roles: string[]): Promise<boolean> {
  const me = await getServerViewer()
  return Boolean(me?.role && roles.includes(me.role))
}
