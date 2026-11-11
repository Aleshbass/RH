'use client'

import { useEffect, useState } from 'react'
import type { OutlineItem } from '@/lib/blog/content'

/** "On this page": the post's sections, with the one being read highlighted. */
export function TableOfContents({ items }: { items: OutlineItem[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const nodes = items.map((item) => document.getElementById(item.id)).filter((n): n is HTMLElement => Boolean(n))
    if (nodes.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActive(visible[0].target.id)
      },
      { rootMargin: '-96px 0px -65% 0px' }
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [items])

  if (items.length < 2) return null
  return (
    <nav aria-label="On this page">
      <p className="text-[13px] font-bold uppercase tracking-wide text-rh-ink/50">On this page</p>
      <ol className="mt-3 space-y-1 border-l border-rh-ink/10">
        {items
          .filter((item) => item.level <= 3)
          .map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`-ml-px block border-l-2 py-1 text-[14px] leading-snug transition-colors ${item.level === 3 ? 'pl-6' : 'pl-3'} ${
                  active === item.id ? 'border-rh-lime font-semibold text-rh-ink' : 'border-transparent text-rh-ink/60 hover:text-rh-ink'
                }`}
              >
                {item.text}
              </a>
            </li>
          ))}
      </ol>
    </nav>
  )
}
