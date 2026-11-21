'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Cake, Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Panel, primaryButtonClass, secondaryButtonClass } from '@/components/patient/ui'
import { careMomentsApi } from '@/lib/careMomentsApi'
import { MONTHS, dayInYear, daysInMonth } from '@/convex/helpers/careMoments'
import { zonedDateKey } from '@/convex/helpers/lagosTime'
import { programError } from '@/components/exercise-programs/errors'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const DISMISS_KEY = 'rh_birthday_prompt_hidden_until'
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - i)
const selectClass =
  'h-11 w-full rounded-xl border border-pt-line-strong bg-pt-surface px-3 text-sm text-pt-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/40'

function hiddenNow() {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now()
  } catch {
    return false
  }
}

/**
 * Asks for your birthday until you give it, and says happy birthday on the day. Patients are
 * celebrated by their care team; physios, clinic owners and clinic teams by Rehabify (and their
 * clinic). Renders nothing otherwise. Used on the patient, physio and clinic Homes.
 */
export function BirthdayCard({ firstName }: { firstName?: string | null }) {
  const birthday = useQuery(careMomentsApi.myBirthday, {})
  const save = useMutation(careMomentsApi.setMyBirthday)
  const [hidden, setHidden] = useState(true)
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState(birthday?.birthYear ? String(birthday.birthYear) : '')
  const [saving, setSaving] = useState(false)

  // localStorage is only read in the browser
  useEffect(() => setHidden(hiddenNow()), [])

  if (!birthday || birthday.optedOut) return null
  const team = birthday.audience === 'team'

  if (birthday.monthDay) {
    const today = zonedDateKey(Date.now())
    if (dayInYear(birthday.monthDay, Number(today.slice(0, 4))) !== today) return null
    return (
      <section className="flex items-center gap-4 rounded-3xl bg-rh-ink px-5 py-5 text-white dark:bg-rh-ink-2 sm:px-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rh-lime text-rh-ink">
          <Cake className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight">Happy birthday{firstName ? `, ${firstName}` : ''}!</p>
          <p className="text-sm text-white/80">
            {team
              ? `Thank you for all you do for your patients. Everyone at Rehabify${birthday.celebratedBy ? ` and ${birthday.celebratedBy}` : ''} is wishing you a wonderful year ahead.`
              : `${birthday.celebratedBy ? `Everyone at ${birthday.celebratedBy}` : 'Everyone at Rehabify'} is wishing you a strong, healthy year ahead.`}
          </p>
        </div>
      </section>
    )
  }

  if (hidden) return null

  const notNow = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_MS))
    } catch {
      // Private browsing: it just shows again next visit
    }
    setHidden(true)
  }

  const maxDay = month ? daysInMonth(Number(month), year ? Number(year) : undefined) : 31
  const submit = async () => {
    setSaving(true)
    try {
      await save({ day: Number(day), month: Number(month), ...(year ? { year: Number(year) } : {}) })
      playSound('success')
      toast.success('Thanks! We’ve saved your birthday.')
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save your birthday. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Cake className="h-4 w-4 text-pt-rose-fg" />
          When&apos;s your birthday?
        </span>
      }
      description={
        team
          ? `We’d love to celebrate with you${birthday.celebratedBy ? `, and so would ${birthday.celebratedBy}` : ''}. Patients never see it.`
          : `${birthday.celebratedBy ?? 'Your care team'} would love to celebrate with you. Only your care team sees it.`
      }
    >
      <div className="grid grid-cols-[1fr_1.5fr_1.2fr] gap-2">
        <select aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} className={selectClass}>
          <option value="">Day</option>
          {Array.from({ length: maxDay }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
        <select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={selectClass}>
          <option value="">Month</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Year (optional)" value={year} onChange={(e) => setYear(e.target.value)} className={selectClass}>
          <option value="">Year (optional)</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={submit} disabled={saving || !day || !month || Number(day) > maxDay} className={cn(primaryButtonClass, 'h-10 flex-1 sm:flex-none')}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
        <Button onClick={notNow} disabled={saving} className={cn(secondaryButtonClass, 'h-10 flex-1 sm:flex-none')}>
          Not now
        </Button>
      </div>
    </Panel>
  )
}
