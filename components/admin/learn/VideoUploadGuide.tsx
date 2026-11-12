'use client'

/**
 * "Upload guide" on Admin › Learn › Courses: how to add a protected lesson video, step by step,
 * for admins and Learn instructors (owner 2026-11-12: the course uploader works from the UK and
 * needs it on hand). Pipeline: convex/learnVideo.ts, scripts/learn-video/README.md.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { HelpCircle } from '@/components/icons'
import { softButtonClass } from '@/components/admin/ui'
import { AdminDrawer } from '@/components/admin/learn/drawer'

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Open the course',
    body: 'Pick the course in the list (or click New course), then click Add a lesson.',
  },
  {
    title: 'Upload the video',
    body: 'Choose Upload a video and pick the file. MP4 or MOV, up to 8 GB. 1080p and 4K files are fine: learners get 480p and 720p.',
  },
  {
    title: 'Wait for the upload bar',
    body: 'Keep the page open until the bar reaches 100%, then click Add lesson. A big file on a slow connection can take a while.',
  },
  {
    title: 'Let it encode',
    body: 'The lesson shows "Encoding and encrypting…" and turns ready by itself, usually within a few minutes (longer for long videos). You can close the page meanwhile.',
  },
  {
    title: 'Check it plays',
    body: "Click the lesson's picture to preview it, or play it from a learner account enrolled in the course. The learner's name and email move across the video.",
  },
  {
    title: 'Publish',
    body: 'When every lesson is ready, an admin publishes the course. Learn instructors send it for review instead.',
  },
]

const TROUBLE: { title: string; body: string }[] = [
  { title: '"This video couldn\'t be encoded"', body: 'Edit the lesson and upload the file again. If it keeps failing, export it as MP4 (H.264) and try once more.' },
  { title: 'The upload stops or fails', body: 'Check the internet connection and upload again. Nothing half-finished is kept.' },
  { title: '"Protected video isn\'t set up yet"', body: 'A server setting is missing. Tell the tech team; uploads work again once it is set.' },
]

export function VideoUploadGuideButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="ghost" className={softButtonClass} onClick={() => setOpen(true)}>
        <HelpCircle className="mr-2 h-4 w-4" /> Upload guide
      </Button>
      <AdminDrawer
        open={open}
        onOpenChange={setOpen}
        title="Adding a protected video"
        description="How to upload a lesson video. Videos are encrypted, can't be downloaded, and every view carries the learner's name and email."
      >
        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rh-ink text-xs font-semibold text-white dark:bg-rh-lime dark:text-rh-ink">
                {i + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-rh-ink dark:text-white">{step.title}</p>
                <p className="mt-0.5 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-7 border-t border-black/[0.06] pt-5 dark:border-white/10">
          <p className="text-sm font-semibold text-rh-ink dark:text-white">If something goes wrong</p>
          <ul className="mt-3 space-y-3">
            {TROUBLE.map((item) => (
              <li key={item.title} className="text-sm leading-6">
                <span className="font-medium text-rh-ink dark:text-white">{item.title}: </span>
                <span className="text-neutral-600 dark:text-neutral-300">{item.body}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-7 rounded-2xl bg-rh-canvas p-4 text-sm leading-6 text-neutral-600 dark:bg-white/[0.04] dark:text-neutral-300">
          <p>
            <span className="font-medium text-rh-ink dark:text-white">Good to know: </span>
            Learn instructors see only their own uploads, and an admin sets who can watch and the price. YouTube links still work for free, public
            material.
          </p>
        </div>
      </AdminDrawer>
    </>
  )
}
