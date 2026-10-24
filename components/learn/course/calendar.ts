/**
 * "Add to calendar" for the live sessions: one .ics file with every session. Events point at the
 * course page, never at a meeting link, so a link the admin changes later still reaches people.
 */

type CalendarSession = { startsAt: number; endsAt: number; title: string | null }

function stamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function text(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Lines longer than 75 characters continue on the next line after a space (RFC 5545). */
function fold(line: string) {
  const parts: string[] = []
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73))
  return parts.join('\r\n ')
}

export function sessionsCalendar(sessions: CalendarSession[], cohortLabel: string, courseUrl: string) {
  const now = stamp(Date.now())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rehabify//Rehabify Learn//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  for (const s of sessions) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.startsAt}-${s.endsAt}@learn.rehabify`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(s.startsAt)}`,
      `DTEND:${stamp(s.endsAt)}`,
      `SUMMARY:${text(s.title ? `${s.title} · Rehabify Learn` : `${cohortLabel} live session`)}`,
      `DESCRIPTION:${text(`Join from your course page, where the link is always up to date: ${courseUrl}`)}`,
      `LOCATION:${text(courseUrl)}`,
      `URL:${courseUrl}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Rehabify Learn live session in 30 minutes',
      'END:VALARM',
      'END:VEVENT'
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Downloads the sessions as rehabify-learn.ics (calendar apps offer to add them). */
export function downloadSessionsCalendar(sessions: CalendarSession[], cohortLabel: string) {
  const courseUrl = `${window.location.origin}/learn/course`
  const blob = new Blob([sessionsCalendar(sessions, cohortLabel, courseUrl)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'rehabify-learn.ics'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
