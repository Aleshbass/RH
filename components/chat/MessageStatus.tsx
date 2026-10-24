'use client'

import React from 'react'
import { CheckCheck, Check } from '@/components/icons'
import { cn } from '@/lib/utils'

interface MessageStatusProps {
  isDelivered?: boolean
  isReadByReceiver?: boolean
  timestamp: number
  isOwnMessage: boolean
  /** Bubble colours: the clinician dashboards' green bubble or the patient portal's ink one. */
  variant?: 'default' | 'patient'
  className?: string
}

/**
 * Time and WhatsApp-style ticks on a message:
 * one grey tick = sent, two grey ticks = delivered to their device, two blue ticks = read.
 */
const MessageStatus: React.FC<MessageStatusProps> = ({
  isDelivered = true, // messages from before delivery receipts existed count as delivered
  isReadByReceiver = false,
  timestamp,
  isOwnMessage,
  variant = 'default',
  className,
}) => {
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (!isOwnMessage) {
    return <span className={cn('text-[11px] text-muted-foreground', className)}>{time}</span>
  }

  const patient = variant === 'patient'
  const muted = patient ? 'text-pt-on-primary/60' : 'text-rh-ink/55'
  // Blue that stays readable on the green bubble and on the patient portal's ink (or, in dark mode, light) bubble
  const read = patient ? 'text-sky-400 dark:text-sky-700' : 'text-blue-700'
  const label = isReadByReceiver ? 'Read' : isDelivered ? 'Delivered' : 'Sent'

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className={cn('text-[11px]', muted)}>{time}</span>
      <span role="img" aria-label={label} title={label} className="inline-flex">
        {isReadByReceiver ? (
          <CheckCheck className={cn('h-3.5 w-3.5', read)} />
        ) : isDelivered ? (
          <CheckCheck className={cn('h-3.5 w-3.5', muted)} />
        ) : (
          <Check className={cn('h-3.5 w-3.5', muted)} />
        )}
      </span>
    </span>
  )
}

export default MessageStatus
