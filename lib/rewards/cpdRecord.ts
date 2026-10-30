import type { CpdRecord } from '@/components/rewards/refs'

/**
 * The physio's yearly CPD record as a printable A4 PDF: who, the year, total time, and every
 * activity with its date and minutes. Text, not an image, so it stays sharp and searchable.
 * A record of learning on Rehabify, not accredited CPD credit (said on the page).
 */

const INK: [number, number, number] = [22, 24, 28]
const MUTED: [number, number, number] = [110, 114, 120]
const LIME: [number, number, number] = [0, 205, 15]

function day(ms: number) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' }).format(ms)
}

function duration(minutes: number) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`
}

export async function downloadCpdRecord(record: NonNullable<CpdRecord>) {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  pdf.setProperties({ title: `Rehabify CPD record ${record.year}`, author: 'Rehabify Health' })
  const left = 20
  const right = 190
  let y = 24

  pdf.setFillColor(...LIME)
  pdf.rect(left, y - 6, 4, 4, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.setTextColor(...INK)
  pdf.text('Rehabify', left + 6, y - 2.6)

  y += 14
  pdf.setFontSize(24)
  pdf.text(`CPD record ${record.year}`, left, y)
  y += 10
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  pdf.text(record.name, left, y)
  if (record.licence) {
    y += 6
    pdf.setTextColor(...MUTED)
    pdf.setFontSize(10)
    pdf.text(`Licence ${record.licence}`, left, y)
  }

  y += 12
  pdf.setTextColor(...INK)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(30)
  pdf.text(duration(record.minutes), left, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(...MUTED)
  pdf.text(`of learning logged on Rehabify · ${record.entries.length} ${record.entries.length === 1 ? 'activity' : 'activities'}`, left, y + 6)

  y += 18
  pdf.setDrawColor(220, 220, 215)
  pdf.line(left, y, right, y)
  y += 6
  pdf.setFontSize(9)
  pdf.text('DATE', left, y)
  pdf.text('ACTIVITY', left + 32, y)
  pdf.text('TIME', right, y, { align: 'right' })
  y += 3
  pdf.line(left, y, right, y)

  pdf.setFontSize(10)
  const rows = [...record.entries].sort((a, b) => a.at - b.at)
  for (const entry of rows) {
    const lines = pdf.splitTextToSize(entry.label, right - left - 32 - 24) as string[]
    const height = 5 * lines.length + 3
    if (y + height > 270) {
      pdf.addPage()
      y = 24
    }
    y += 6
    pdf.setTextColor(...MUTED)
    pdf.text(day(entry.at), left, y)
    pdf.setTextColor(...INK)
    pdf.text(lines, left + 32, y)
    pdf.text(duration(entry.minutes), right, y, { align: 'right' })
    y += 5 * (lines.length - 1) + 2
  }
  if (rows.length === 0) {
    y += 8
    pdf.setTextColor(...MUTED)
    pdf.text('No learning logged yet this year.', left, y)
  }

  pdf.setFontSize(8.5)
  pdf.setTextColor(...MUTED)
  const footer = pdf.splitTextToSize(
    `Issued ${day(Date.now())} by Rehabify Health from activity on physioaroundme.com. This is a record of learning completed on Rehabify (Case of the Week, Rehabify Learn sessions and masterclasses). It is not accredited CPD credit.`,
    right - left
  ) as string[]
  pdf.text(footer, left, 282)
  pdf.save(`Rehabify-CPD-${record.year}.pdf`)
}
