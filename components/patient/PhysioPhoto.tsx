'use client'

import Image from 'next/image'
import { cn } from '@/lib/utils'
import { initials } from '@/components/patient/ui'

/** A physiotherapist's photo, or their initials on a soft tint when there isn't one. */
export function PhysioPhoto({
  name,
  imageUrl,
  size = 48,
  className,
}: {
  name: string
  imageUrl?: string | null
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-pt-violet-bg font-semibold text-pt-violet-fg', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
    >
      {imageUrl ? (
        // Profile photos come from Clerk and other hosts, so they aren't run through the optimiser
        <Image src={imageUrl} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized />
      ) : (
        initials(name)
      )}
    </span>
  )
}
