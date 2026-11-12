'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useQuery } from 'convex/react'
import { Rotate3d } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import { ExercisePreviewDialog } from '@/components/exercise-programs/ExercisePreviewDialog'
import { LibraryPicker } from '@/components/exercise-programs/LibraryPicker'
import type { LibraryData, LibraryEntry } from '@/components/exercise-programs/types'
import { RehabifyLoader } from '@/components/brand/RehabifyLoader'

// The 3D exercise library for organisations that license it (and Rehabify staff).

export default function LicensedLibraryPage() {
  const library = useQuery(api.exerciseLibrary.listLibrary) as LibraryData | null | undefined
  const [preview, setPreview] = useState<LibraryEntry | null>(null)

  return (
    <div className="min-h-screen bg-rh-canvas dark:bg-rh-night">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Image src="/logos/MainRehabify.svg" alt="Rehabify" width={103} height={28} priority className="h-7 w-auto dark:hidden" />
        <Image src="/logos/WhiteGreen MainRehabify.svg" alt="Rehabify" width={103} height={28} priority className="hidden h-7 w-auto dark:block" />
        {library && <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-rh-teal shadow-sm dark:bg-white/[0.06] dark:text-rh-aqua">{library.label}</span>}
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rh-teal dark:text-rh-aqua">Rehabify exercise library</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight text-rh-night dark:text-white sm:text-[28px]">
            <Rotate3d className="h-6 w-6" /> Exercises in 3D
          </h1>
          <p className="mt-1 text-sm text-neutral-500">Clinically reviewed demonstrations you can turn, slow down and follow along with.</p>
        </div>
        <section className="rounded-3xl bg-white p-5 shadow-soft dark:bg-rh-ink-2">
          {library === undefined ? (
            <div className="flex justify-center py-16"><RehabifyLoader size={56} /></div>
          ) : !library ? (
            <div className="py-12 text-center">
              <p className="font-semibold text-rh-night dark:text-white">This library is for licensed organisations</p>
              <p className="mt-1 text-sm text-neutral-500">Sign in with your organisation&apos;s account, or contact Rehabify to license the library.</p>
            </div>
          ) : (
            <LibraryPicker items={library.items} onPreview={setPreview} />
          )}
        </section>
      </main>
      <ExercisePreviewDialog entry={preview} onOpenChange={(o) => !o && setPreview(null)} />
    </div>
  )
}
