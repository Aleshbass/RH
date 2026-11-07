'use client'

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { Button } from '@/components/ui/button'
import { Panel, StatusBadge, secondaryButtonClass } from '@/components/clinic/ui'
import { cn } from '@/lib/utils'
import { clockRefs } from '@/components/clock/clockApi'
import { CLOCK_PAGE, useLagosToday } from './shared'

/** Clinic settings: where clock-in is switched on and set up. */
export function ClockSettingsPanel() {
  const today = useLagosToday()
  const board = useQuery(clockRefs.getClockBoard, { today })
  if (!board?.canManage) return null
  const on = board.settings.enabled
  return (
    <Panel
      title="Clock-in for your team"
      description="Clinicians clock in when they arrive and out when they leave. You see who’s in and their hours."
      actions={<StatusBadge tone={on ? 'green' : 'neutral'}>{on ? 'On' : 'Off'}</StatusBadge>}
    >
      <div className="px-5 pb-5 sm:px-6">
        <Button asChild className={cn(secondaryButtonClass, 'h-10')}>
          <Link href={CLOCK_PAGE}>{on ? 'Open clock-in' : 'Set up clock-in'}</Link>
        </Button>
      </div>
    </Panel>
  )
}
