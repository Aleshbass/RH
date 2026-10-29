'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, MessageSquare } from '@/components/icons'
import type { Id } from '@/convex/_generated/dataModel'
import RealtimeChat from '@/components/chat/RealtimeChat'
import { EmptyState, LoadingBlocks, PageContainer, Panel } from '@/components/patient/ui'

export default function FamilyMessagesPage() {
  return (
    <Suspense fallback={<LoadingBlocks rows={2} />}>
      <FamilyMessages />
    </Suspense>
  )
}

/**
 * A caregiver's conversation with the physio or clinic of someone they look after (when their
 * access includes messages; the server checks, see chat.assertCanMessage).
 */
function FamilyMessages() {
  const searchParams = useSearchParams()
  const withId = searchParams.get('with') as Id<'users'> | null
  const person = searchParams.get('person')
  const back = person ? `/dashboard/family?person=${person}` : '/dashboard/family'

  return (
    <PageContainer>
      <Link href={back} className="inline-flex items-center text-sm font-medium text-pt-muted transition-colors hover:text-pt-ink">
        <ChevronLeft className="mr-0.5 h-4 w-4" />
        Back
      </Link>
      {withId ? (
        <div className="h-[calc(100dvh-11rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-pt-line bg-pt-surface shadow-pt dark:shadow-none">
          <RealtimeChat recipientId={withId} embedded className="h-full" />
        </div>
      ) : (
        <Panel>
          <EmptyState icon={MessageSquare} title="Choose who to message" description="Open the person you care for and tap Message next to their physio." />
        </Panel>
      )}
    </PageContainer>
  )
}
