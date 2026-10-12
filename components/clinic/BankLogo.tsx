'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

const FILLER_WORDS = new Set(['of', 'and', 'the', 'for', 'plc', 'ltd', 'limited', '&'])

function bankInitials(name: string) {
  const words = name
    .replace(/[^A-Za-z0-9\s&]/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !FILLER_WORDS.has(word.toLowerCase()))
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join('') || '?'
  )
}

const sizes = {
  sm: 'h-5 w-5 text-[9px]',
  md: 'h-9 w-9 text-xs',
} as const

/**
 * A bank's logo from nigerianbanks.xyz (keyed by Paystack's bank slug), or a neutral
 * initials badge when there is no slug or the image fails to load.
 */
export function BankLogo({
  name,
  slug,
  size = 'md',
  className,
}: {
  name: string
  slug?: string | null
  size?: keyof typeof sizes
  className?: string
}) {
  const src = slug ? `https://nigerianbanks.xyz/logo/${encodeURIComponent(slug)}.png` : null
  // Remember which image failed, so a different bank gets its own attempt
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  if (src && failedSrc !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={cn(
          'shrink-0 rounded-full border border-neutral-200 bg-white object-contain dark:border-neutral-700',
          sizes[size],
          className
        )}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-neutral-100 font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
        sizes[size],
        className
      )}
    >
      {bankInitials(name)}
    </span>
  )
}
