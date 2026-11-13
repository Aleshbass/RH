'use client'

/** Learn home: the community rooms and Rehabify Spaces, side by side. */

import Link from 'next/link'
import { useQuery } from 'convex/react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Headphones, MessageCircle } from '@/components/icons'
import { cn } from '@/lib/utils'
import { displayFont } from '../shared'
import { COMMUNITY_PATH, relativeTime, SPACES_PATH, spacePath, spacesApi } from './socialApi'
import { Avatar } from './ui'

const ROOMS = ['Student lounge', 'Ask a physio', 'Study group', 'Your course rooms']

/** Three avatars "talking": the rings breathe on a loop (no audio on the home page). */
function TalkingAvatars() {
  const reduce = useReducedMotion()
  const people = [
    { name: 'Host', delay: 0 },
    { name: 'Speaker', delay: 0.9 },
    { name: 'Speaker', delay: 1.8 },
  ]
  return (
    <div className="flex items-center gap-5">
      {people.map((p, i) => (
        <span key={i} className="relative flex h-14 w-14 items-center justify-center">
          {!reduce && (
            <motion.span
              className="absolute -inset-[5px] rounded-full border-[2.5px] border-rh-lime"
              animate={{ scale: [1, 1.12, 1.04, 1.14, 1], opacity: [0, 1, 0.7, 1, 0] }}
              transition={{ duration: 2.4, delay: p.delay, repeat: Infinity, repeatDelay: 0.3, ease: 'easeInOut' }}
            />
          )}
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white/70">
            <Headphones className="h-5 w-5" />
          </span>
        </span>
      ))}
    </div>
  )
}

export function LearnTogether() {
  const spaces = useQuery(spacesApi.list, {})
  const live = spaces?.live[0]
  const next = spaces?.upcoming[0]

  return (
    <section className="bg-white px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <h2 className={cn('text-[30px] leading-[1.1] tracking-tight text-rh-ink sm:text-[40px]', displayFont)}>Learn together</h2>
          <p className="mt-3 text-[16px] leading-relaxed text-rh-ink/60">Ask questions between lessons, and listen in when Rehabify physiotherapists go live.</p>
        </div>
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <Link href={COMMUNITY_PATH} className="group flex flex-col justify-between gap-10 rounded-[2rem] bg-rh-cream p-7 transition hover:-translate-y-0.5 sm:p-9">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-rh-ink">
                <MessageCircle className="h-5 w-5" />
              </span>
              <h3 className={cn('mt-6 text-[26px] leading-tight tracking-tight text-rh-ink', displayFont)}>Community</h3>
              <p className="mt-2 max-w-md text-[15px] leading-6 text-rh-ink/65">
                Physios and physio students helping each other: questions, revision and life after graduation.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {ROOMS.map((room) => (
                  <span key={room} className="rounded-full bg-white px-3.5 py-1.5 text-sm font-medium text-rh-ink/75">
                    {room}
                  </span>
                ))}
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-ink">
              Open the community <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>

          <Link
            href={live ? spacePath(live.id) : SPACES_PATH}
            className="group flex flex-col justify-between gap-10 rounded-[2rem] bg-rh-ink p-7 text-white transition hover:-translate-y-0.5 hover:bg-black sm:p-9"
          >
            <div>
              <TalkingAvatars />
              <h3 className={cn('mt-8 text-[26px] leading-tight tracking-tight', displayFont)}>Rehabify Spaces</h3>
              {live ? (
                <div className="mt-3">
                  <p className="flex items-center gap-2 text-sm font-semibold text-rh-lime">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rh-lime opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-rh-lime" />
                    </span>
                    Live now
                  </p>
                  <p className="mt-1 text-lg font-semibold leading-snug">{live.title}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/60">
                    <Avatar name={live.host.name} imageUrl={live.host.imageUrl} size={22} className="bg-white/10 text-white" /> {live.host.name}
                  </div>
                </div>
              ) : next ? (
                <div className="mt-3">
                  <p className="text-sm text-white/55">Next up · {relativeTime(next.scheduledFor ?? Date.now())}</p>
                  <p className="mt-1 text-lg font-semibold leading-snug">{next.title}</p>
                </div>
              ) : (
                <p className="mt-2 max-w-md text-[15px] leading-6 text-white/65">
                  Live audio rooms with Rehabify physiotherapists. Listen in, raise your hand and ask your question.
                </p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-rh-lime">
              {live ? 'Listen in' : 'See Spaces'} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
