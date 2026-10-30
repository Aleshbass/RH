'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { CheckCheck, Clock, Link2Off, ShieldCheck } from '@/components/icons'
import { cardClass } from '@/components/patient/ui'
import { CheckDone, CheckFlow } from '@/components/outcomes/CheckFlow'
import { outcomeRefs } from '@/components/outcomes/refs'
import { cn } from '@/lib/utils'

// "How are you?" from the patient's physio: /o/<token>, sent by email, notification or WhatsApp.
// No account needed; the token is the key and works once (convex/outcomes.ts).

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-pt-canvas">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
        <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={103} height={28} priority className="h-7 w-auto dark:hidden" />
        <Image src="/logos/WhiteGreen MainRehabify.svg" alt="Rehabify" width={103} height={28} priority className="hidden h-7 w-auto dark:block" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-pt-surface px-3 py-1 text-xs font-medium text-pt-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> Private · no sign-in
        </span>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-2">{children}</main>
    </div>
  )
}

function Status({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className={cn(cardClass, 'mt-6 p-8 text-center')}>
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-pt-sunken text-pt-muted">{icon}</div>
      <h1 className="text-lg font-semibold text-pt-ink">{title}</h1>
      <p className="mt-1.5 text-sm text-pt-muted">{text}</p>
    </div>
  )
}

export default function OutcomeCheckPage() {
  const { token } = useParams<{ token: string }>()
  const check = useQuery(outcomeRefs.checkByToken, { token })
  const submit = useMutation(outcomeRefs.submitByToken)
  const [result, setResult] = useState<{ baseline: number | null; pain: number } | null>(null)

  if (check === undefined) {
    return (
      <Shell>
        <div className={cn(cardClass, 'mt-6 h-[420px] animate-pulse')} />
      </Shell>
    )
  }

  if (result && check.state !== 'not_found') {
    return (
      <Shell>
        <div className={cn(cardClass, 'mt-2 p-6 sm:p-8')}>
          <CheckDone firstName={check.firstName} result={result} physioName={check.physioName} />
        </div>
      </Shell>
    )
  }

  if (check.state === 'not_found') {
    return (
      <Shell>
        <Status icon={<Link2Off className="h-5 w-5" />} title="This link isn’t valid" text="Check you opened the whole link, or ask your physiotherapist for a new one." />
      </Shell>
    )
  }
  if (check.state === 'answered') {
    return (
      <Shell>
        <Status icon={<CheckCheck className="h-5 w-5" />} title="Already answered" text={`Thank you. ${check.physioName} has your answers.`} />
      </Shell>
    )
  }
  if (check.state === 'expired') {
    return (
      <Shell>
        <Status icon={<Clock className="h-5 w-5" />} title="This link has closed" text="No problem. You’ll get a new one next time." />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className={cn(cardClass, 'mt-2 p-6 sm:p-8')}>
        <p className="mb-5 text-[13px] font-medium text-pt-muted">
          {check.firstName ? `Hi ${check.firstName}. ` : ''}From {check.physioName}
        </p>
        <CheckFlow
          moment={check.moment}
          questions={check.questions}
          physioName={check.physioName}
          goalActivity={check.goalActivity}
          onSubmit={(answers) => submit({ token, answers })}
          onDone={setResult}
        />
      </div>
      <p className="mt-5 px-2 text-center text-xs leading-relaxed text-pt-faint">
        Your answers go to your physiotherapist and your Rehabify record, to track how you’re improving.
      </p>
    </Shell>
  )
}
