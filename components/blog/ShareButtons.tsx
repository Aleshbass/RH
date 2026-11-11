'use client'

import { useState } from 'react'
import { Check, Link as LinkIcon, Linkedin, Twitter, WhatsApp } from '@/components/icons'

/** Share links (no third-party scripts): WhatsApp first, it's how most readers share. */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const text = encodeURIComponent(title)
  const link = encodeURIComponent(url)
  const items = [
    { label: 'Share on WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`, Icon: WhatsApp },
    { label: 'Share on X', href: `https://x.com/intent/post?text=${text}&url=${link}`, Icon: Twitter },
    { label: 'Share on LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${link}`, Icon: Linkedin },
  ]
  const button = 'flex h-10 w-10 items-center justify-center rounded-full bg-white text-rh-ink transition-colors hover:bg-rh-lime'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: nothing to do
    }
  }

  return (
    <div className="flex items-center gap-2">
      {items.map(({ label, href, Icon }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} className={button}>
          <Icon className="h-4 w-4" />
        </a>
      ))}
      <button type="button" onClick={copy} aria-label={copied ? 'Link copied' : 'Copy link'} title="Copy link" className={button}>
        {copied ? <Check className="h-4 w-4" /> : <LinkIcon className="h-4 w-4" />}
      </button>
    </div>
  )
}
