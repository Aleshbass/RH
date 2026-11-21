'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Loader2 } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { primaryButtonClass } from '@/components/physio/ui'
import { careMomentsApi } from '@/lib/careMomentsApi'
import { MONTHS, daysInMonth } from '@/convex/helpers/careMoments'
import { programError } from '@/components/exercise-programs/errors'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - i)
const selectClass =
  'h-11 w-full rounded-xl border border-pt-line-strong bg-pt-surface px-3 text-sm text-pt-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-pt-accent/40'

/**
 * The signed-in person's own birthday, to set or change (physio and clinic Settings). Rehabify, and
 * their clinic, wish them on the day (convex/careMoments.ts). The Home card asks for it once.
 */
export function MyBirthdayFields() {
  const birthday = useQuery(careMomentsApi.myBirthday, {})
  const save = useMutation(careMomentsApi.setMyBirthday)
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')
  const [saving, setSaving] = useState(false)

  // Fill in what we hold once it loads
  useEffect(() => {
    if (!birthday?.monthDay) return
    setMonth(String(Number(birthday.monthDay.slice(0, 2))))
    setDay(String(Number(birthday.monthDay.slice(3))))
    setYear(birthday.birthYear ? String(birthday.birthYear) : '')
  }, [birthday?.monthDay, birthday?.birthYear])

  if (birthday === undefined) return <Skeleton className="h-11 rounded-xl" />
  if (birthday === null) return null

  const maxDay = month ? daysInMonth(Number(month), year ? Number(year) : undefined) : 31
  const submit = async () => {
    setSaving(true)
    try {
      await save({ day: Number(day), month: Number(month), ...(year ? { year: Number(year) } : {}) })
      playSound('success')
      toast.success('Birthday saved')
    } catch (error) {
      playSound('error')
      toast.error(programError(error, 'Couldn’t save your birthday. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1.5fr_1.2fr] gap-2 sm:max-w-md">
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
      <Button onClick={submit} disabled={saving || !day || !month || Number(day) > maxDay} className={cn(primaryButtonClass, 'h-10')}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save birthday
      </Button>
    </div>
  )
}
