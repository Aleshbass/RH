import { NextRequest, NextResponse } from 'next/server'
import { StreamClient } from '@stream-io/node-sdk'

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    const apiKey = 'thgtj8s8svph'
    const apiSecret = 'qdnbwjuhtucy9bjgfhws6tvcsp4nhedmnh8qahe7dyxw8dfxr3p7xxqxedsejuyy'
    
    const client = new StreamClient(apiKey, apiSecret)
    
    // Generate token
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
