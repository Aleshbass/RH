import type { Metadata } from 'next'
import Link from 'next/link'
import { COOKIE_CATEGORIES, CONSENT_MAX_AGE_DAYS, PLAY_TO_LOAD_NOTE } from '@/lib/consent'
import { SUPPORT_EMAIL } from '@/lib/contact'
import { pageMetadata } from '@/lib/seo/utils'
import { CookieChoice } from './CookieChoice'

export const metadata: Metadata = pageMetadata({
  title: 'Cookie Policy',
  description: 'The cookies Rehabify uses, why we use them, and how to change your choice at any time.',
  path: '/cookie-policy',
})

const LAST_UPDATED = '26 October 2026'
const h2Class = 'text-[28px] font-bold leading-tight tracking-tight text-rh-ink sm:text-[34px]'

export default function CookiePolicyPage() {
  return (
    <div className="bg-rh-canvas px-4 pb-24 pt-[132px] text-rh-ink sm:px-6 sm:pt-40 lg:pt-48">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl">Cookie policy</h1>
        <p className="mt-3 text-sm text-rh-ink/55">Last updated {LAST_UPDATED}</p>
        <p className="mt-6 max-w-2xl text-lg font-medium leading-relaxed text-rh-ink/75">
          Cookies are small files a website saves in your browser. This page explains the ones Rehabify uses, why we use them,
          and how to change your choice.
        </p>

        <div className="mt-10">
          <CookieChoice />
        </div>

        {COOKIE_CATEGORIES.map((category) => (
          <section key={category.id} className="mt-14">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className={h2Class}>{category.title}</h2>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rh-ink/70">
                {category.required ? 'Always on' : 'Only with your consent'}
              </span>
            </div>
            <p className="mt-3 max-w-2xl text-base leading-7 text-rh-ink/70">{category.description}</p>
            <ul className="mt-6 divide-y divide-rh-ink/[0.07] overflow-hidden rounded-[1.75rem] bg-white">
              {category.items.map((item) => (
                <li key={item.name} className="grid gap-1 px-6 py-5 sm:grid-cols-[1fr_1.4fr_auto] sm:gap-6">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-sm text-rh-ink/55">{item.provider}</p>
                  </div>
                  <p className="text-[15px] leading-6 text-rh-ink/70">{item.purpose}</p>
                  <p className="text-sm text-rh-ink/55 sm:text-right">{item.duration === '—' ? 'No cookie' : item.duration}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="mt-14">
          <h2 className={h2Class}>Videos</h2>
          <p className="mt-3 max-w-2xl text-base leading-7 text-rh-ink/70">
            {PLAY_TO_LOAD_NOTE} YouTube videos play in YouTube&apos;s privacy-enhanced mode.
          </p>
        </section>

        <section className="mt-14">
          <h2 className={h2Class}>How we respect your choice</h2>
          <ul className="mt-5 space-y-3 text-base leading-7 text-rh-ink/70">
            <li>Nothing optional runs until you choose. Declining is as easy as accepting.</li>
            <li>
              If your browser sends a Global Privacy Control signal, we treat it as a &ldquo;no&rdquo; to optional cookies
              without asking.
            </li>
            <li>
              We keep your choice for {CONSENT_MAX_AGE_DAYS / 365 === 1 ? 'a year' : `${CONSENT_MAX_AGE_DAYS} days`}, and ask again
              sooner if we add anything new.
            </li>
            <li>
              We record each choice (what you chose and when, never your IP address) so we can show we asked. When you&apos;re
              signed in, your choice is the same on every device.
            </li>
            <li>You can change your mind at any time from &ldquo;Cookie settings&rdquo; at the bottom of every page.</li>
          </ul>
        </section>

        <section className="mt-14 rounded-[2rem] bg-white p-7 sm:p-9">
          <h2 className="text-2xl font-bold tracking-tight">Questions</h2>
          <p className="mt-2 text-base leading-7 text-rh-ink/70">
            Write to{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-rh-ink underline underline-offset-4 hover:no-underline">
              {SUPPORT_EMAIL}
            </a>
            . How we handle personal data in general is in our{' '}
            <Link href="/privacy-policy" className="font-semibold text-rh-ink underline underline-offset-4 hover:no-underline">
              privacy policy
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
