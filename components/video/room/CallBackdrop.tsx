'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * The call screens are designed light-only. Arriving from a dashboard in dark mode leaves `dark`
 * on <html>, and the dashboards' dark fallbacks then turn the white call controls black; so dark
 * mode is set aside while a call screen is open and restored when it closes.
 */
function useLightOnly() {
  useEffect(() => {
    const root = document.documentElement
    if (!root.classList.contains('dark')) return
    root.classList.remove('dark')
    return () => root.classList.add('dark')
  }, [])
}

/** Full-height light canvas every call screen sits on, with a faint Rehabify watermark. */
export function CallBackdrop({ children, className }: { children: React.ReactNode; className?: string }) {
  useLightOnly()
  return (
    <div className={cn('rh-call relative isolate flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f5f6f5] font-sans text-neutral-900 antialiased', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_50%_0%,#ffffff_0%,#f5f6f5_60%,#edf0ee_100%)]"
      />
      <Image
        aria-hidden
        src="/logos/MainRehabify.svg"
        alt=""
        width={512}
        height={140}
        priority
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 w-[min(78vw,920px)] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.045]"
      />
      {children}
    </div>
  )
}

/** Small Rehabify wordmark for headers. */
export function CallBrandMark({ className }: { className?: string }) {
  return (
    <Image src="/logos/MainRehabify.svg" alt="Rehabify Health" width={100} height={28} className={cn('h-6 w-auto', className)} />
  )
}

/** Centered status card (loading, errors, call ended) in the call room's visual language. */
export function CallStatusScreen({
  icon,
  title,
  description,
  children,
}: {
  icon?: React.ReactNode
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <CallBackdrop>
      <header className="flex items-center px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <CallBrandMark />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-sm rounded-[28px] bg-white/85 p-8 text-center shadow-[0_20px_60px_-20px_rgba(0,0,0,0.18)] ring-1 ring-black/5 backdrop-blur-xl">
          {icon && <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">{icon}</div>}
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {description && <div className="mt-2 text-[15px] leading-relaxed text-neutral-500">{description}</div>}
          {children && <div className="mt-6 flex flex-col gap-2">{children}</div>}
        </div>
      </main>
    </CallBackdrop>
  )
}
