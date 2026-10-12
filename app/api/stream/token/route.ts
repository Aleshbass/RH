import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { StreamClient } from '@stream-io/node-sdk'

// Issues a Stream token only for the signed-in caller's own Clerk ID. The
// credentials come from the environment; nothing secret lives in source.
// Prefer the Convex action api.stream.getStreamToken for new code.
export async function POST() {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
  }

  const apiKey = process.env.STREAM_API_KEY
  const apiSecret = process.env.STREAM_SECRET
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Video calls are not configured' }, { status: 503 })
  }

  try {
    const client = new StreamClient(apiKey, apiSecret)
    const token = client.generateUserToken({
      user_id: userId,
      validity_in_seconds: 24 * 60 * 60, // 24 hours
    })
    return NextResponse.json({ token })
  } catch (error) {
    console.error('Error generating Stream token:', error)
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 })
  }
}
