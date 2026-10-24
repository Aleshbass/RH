'use client'

/**
 * Confirms delivery of new messages while the person has Rehabify open, so the sender's single
 * tick becomes two. Renders nothing; mounted once in the dashboard layout.
 */

import { Component, useEffect, type ReactNode } from 'react'
import { useConvexAuth } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useMutationUntyped, useQueryUntyped } from '@/lib/convexUntyped'

// The generated api types sit at TypeScript's depth limit: read the chat functions untyped
const chatApi = (api as unknown as { chat: Record<string, unknown> }).chat

/** Ticks are a nicety: if the receipt query fails (e.g. during a deploy), never take the dashboard down. */
class Quiet extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Receipts() {
  const { isAuthenticated } = useConvexAuth()
  const waiting = useQueryUntyped(chatApi.firstUndeliveredMessage, isAuthenticated ? {} : 'skip') as string | null | undefined
  const markDelivered = useMutationUntyped(chatApi.markDelivered)

  useEffect(() => {
    if (!waiting) return
    void markDelivered({}).catch(() => undefined)
  }, [waiting, markDelivered])

  return null
}

export function DeliveryReceipts() {
  return (
    <Quiet>
      <Receipts />
    </Quiet>
  )
}
