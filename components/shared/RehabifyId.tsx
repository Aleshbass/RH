'use client'

import { useState, type MouseEvent } from 'react'
import { Check, Copy } from '@/components/icons'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const tones = {
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  onDark: 'bg-white/15 text-white',
} as const

const hoverTones = {
  neutral: 'hover:bg-neutral-200 dark:hover:bg-neutral-700',
  onDark: 'hover:bg-white/25',
} as const

const pillClass = 'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium leading-4'

/**
 * A person's or clinic's permanent Rehabify ID (RH-P-100001, RH-C-…, RH-CL-…) as a small pill
 * that copies itself on click. Renders nothing when the ID hasn't been assigned yet.
 * Pass copyable={false} inside links or buttons, where a nested button isn't allowed.
 */
export function RehabifyId({
  value,
  tone = 'neutral',
  copyable = true,
  className,
}: {
  value?: string | null
  tone?: keyof typeof tones
  copyable?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  if (!copyable) return <span className={cn(pillClass, tones[tone], className)}>{value}</span>

  const copy = async (event: MouseEvent) => {
    // Pills often sit inside clickable rows; copying shouldn't open the row
    event.stopPropagation()
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Couldn’t copy the ID.')
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy ID"
      aria-label={`Copy ID ${value}`}
      className={cn(pillClass, 'transition-colors', tones[tone], hoverTones[tone], className)}
    >
      {value}
      {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3 opacity-60" aria-hidden />}
    </button>
  )
}
