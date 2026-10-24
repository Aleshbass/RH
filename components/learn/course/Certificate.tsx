'use client'

/**
 * The certificate on screen, exactly as it prints: the preview is the same SVG that becomes
 * the PDF and the PNG (lib/learn/certificate.ts).
 */

import { useEffect, useState } from 'react'
import { Check, Copy, Download, ImageIcon, Linkedin, Loader2 } from '@/components/icons'
import { certificateSvg, downloadCertificatePdf, downloadCertificatePng, loadCertificateAssets, svgUrl, type CertificateData } from '@/lib/learn/certificate'
import { learnUrl } from '@/lib/site-hosts'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

/** Full verify link for a certificate number (on the Learn host once it has one). */
export function verifyLink(code: string) {
  const url = learnUrl(`/verify/${code}`)
  return url.startsWith('http') ? url : `${window.location.origin}${url}`
}

export function useCertificate(data: Omit<CertificateData, 'verifyUrl'> | null) {
  const [svg, setSvg] = useState<string | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const key = data ? JSON.stringify(data) : ''

  useEffect(() => {
    if (!data) return
    let cancelled = false
    let url: string | null = null
    loadCertificateAssets()
      .then(({ assets, measure }) => {
        if (cancelled) return
        const next = certificateSvg({ ...data, verifyUrl: verifyLink(data.code).replace(/^https?:\/\//, '') }, assets, measure)
        url = svgUrl(next)
        setSvg(next)
        setSrc(url)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { svg, src, failed }
}

export function CertificatePreview({ src, failed, className }: { src: string | null; failed?: boolean; className?: string }) {
  return (
    <div className={cn('relative aspect-[297/210] w-full overflow-hidden rounded-xl bg-white shadow-[0_18px_40px_-24px_rgba(11,19,18,0.45)] ring-1 ring-rh-ink/[0.06]', className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local blob: SVG, nothing for next/image to optimise
        <img src={src} alt="Your certificate" className="absolute inset-0 h-full w-full animate-in fade-in duration-500" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-rh-ink/45">
          {failed ? "Couldn't draw the certificate. Check your connection." : <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      )}
    </div>
  )
}

function ActionButton({ onClick, icon: Icon, children, primary = false, busy = false }: { onClick: () => void; icon: typeof Download; children: React.ReactNode; primary?: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60',
        primary ? 'bg-rh-ink text-white hover:bg-black' : 'bg-white text-rh-ink ring-1 ring-inset ring-rh-ink/10 hover:ring-rh-ink/25'
      )}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
}

/** LinkedIn's "Add licence or certification" form, pre-filled. */
function linkedInUrl(data: Omit<CertificateData, 'verifyUrl'>) {
  const issued = new Date(data.issuedAt)
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: data.programTitle,
    organizationName: 'Rehabify',
    issueYear: String(issued.getFullYear()),
    issueMonth: String(issued.getMonth() + 1),
    certUrl: verifyLink(data.code),
    certId: data.code,
  })
  return `https://www.linkedin.com/profile/add?${params}`
}

export function CertificateActions({ svg, data }: { svg: string | null; data: Omit<CertificateData, 'verifyUrl'> }) {
  const [busy, setBusy] = useState<'pdf' | 'png' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'pdf' | 'png') => {
    if (!svg) return
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'pdf') await downloadCertificatePdf(svg, data.code)
      else await downloadCertificatePng(svg, data.code)
      playSound('success')
    } catch {
      setError("The download didn't work. Please try again.")
      playSound('error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <ActionButton primary icon={Download} busy={busy === 'pdf'} onClick={() => void run('pdf')}>
          PDF
        </ActionButton>
        <ActionButton icon={ImageIcon} busy={busy === 'png'} onClick={() => void run('png')}>
          Image
        </ActionButton>
        <a
          href={linkedInUrl(data)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-rh-ink ring-1 ring-inset ring-rh-ink/10 transition hover:ring-rh-ink/25"
        >
          <Linkedin className="h-4 w-4" /> Add to LinkedIn
        </a>
        <ActionButton
          icon={copied ? Check : Copy}
          onClick={() => {
            void navigator.clipboard?.writeText(verifyLink(data.code)).then(() => {
              setCopied(true)
              playSound('send')
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </ActionButton>
      </div>
      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      <p className="mt-3 text-xs leading-5 text-rh-ink/50">
        Anyone can check it at {verifyLink(data.code).replace(/^https?:\/\//, '')}. PDF for printing (A4), image for WhatsApp and social posts.
      </p>
    </div>
  )
}
