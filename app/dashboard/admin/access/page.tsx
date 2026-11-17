'use client'

/**
 * Admin › Admin access (owner 2026-11-17): give each admin everything, or tick the pages they can
 * open. The console hides the rest and Convex refuses them too (convex/adminAccess.ts). Only admins
 * with everything see this page, and nobody can change their own access.
 */

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Check, Loader2, ShieldCheck } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { AdminPage, PageHeader, Panel, StatusBadge, checkboxClass, primaryButtonClass, softButtonClass } from '@/components/admin/ui'
import { tickableAdminSections } from '@/components/admin/shell/adminNav'
import { playSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'

type AdminRow = {
  userId: string
  name: string
  email: string | null
  imageUrl: string | null
  isMe: boolean
  full: boolean
  pages: string[]
  updatedAt: number | null
  updatedBy: string | null
}

// By name: the generated api type is at TypeScript's depth limit (TS2589)
const listRef = makeFunctionReference<'query', Record<string, never>, AdminRow[]>('adminAccess:list')
const setRef = makeFunctionReference<'mutation', { userId: string; full: boolean; pages: string[] }, null>('adminAccess:setAccess')

const errorText = (err: unknown) => {
  const data = (err as { data?: unknown })?.data
  return typeof data === 'string' ? data : 'Something went wrong. Please try again.'
}

export default function AdminAccessPage() {
  const admins = useQuery(listRef, {})
  const save = useMutation(setRef)
  const sections = useMemo(() => tickableAdminSections(), [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [full, setFull] = useState(true)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const selected = admins?.find((a) => a.userId === selectedId) ?? null

  // Open the first admin you can change
  useEffect(() => {
    if (!admins || selectedId) return
    const first = admins.find((a) => !a.isMe) ?? admins[0]
    if (first) setSelectedId(first.userId)
  }, [admins, selectedId])

  // Load the selected admin's access into the editor
  useEffect(() => {
    if (!selected) return
    setFull(selected.full)
    setTicked(new Set(selected.pages))
  }, [selected])

  const total = sections.reduce((n, s) => n + s.items.length, 0)
  const dirty = selected ? selected.full !== full || (!full && (selected.pages.length !== ticked.size || selected.pages.some((p) => !ticked.has(p)))) : false

  const toggle = (href: string) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(href)) next.delete(href)
      else next.add(href)
      return next
    })
  const toggleSection = (hrefs: string[], on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev)
      for (const h of hrefs) {
        if (on) next.add(h)
        else next.delete(h)
      }
      return next
    })

  const onSave = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await save({ userId: selected.userId, full, pages: [...ticked] })
      playSound('success')
      toast.success(full ? `${selected.name} can open everything.` : `${selected.name} can open ${ticked.size} page${ticked.size === 1 ? '' : 's'}.`)
    } catch (err) {
      toast.error(errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminPage>
      <PageHeader
        title="Admin access"
        description="Give each admin everything, or tick the pages they can open. They won't see the rest, and the server refuses it too."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Panel title="Admins" description="Changing roles, team access and this page needs everything.">
          <ul className="space-y-1 p-3 pt-1">
            {admins === undefined &&
              [0, 1, 2].map((i) => <li key={i} className="h-14 animate-pulse rounded-2xl bg-rh-canvas dark:bg-white/[0.04]" />)}
            {admins?.map((admin) => {
              const active = admin.userId === selectedId
              return (
                <li key={admin.userId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(admin.userId)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors',
                      active ? 'bg-rh-ink text-white dark:bg-rh-lime dark:text-rh-ink' : 'hover:bg-rh-canvas dark:hover:bg-white/[0.04]'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold',
                        active ? 'bg-white/15 dark:bg-rh-ink/10' : 'bg-rh-canvas text-rh-ink dark:bg-white/[0.06] dark:text-white'
                      )}
                    >
                      {admin.name
                        .split(' ')
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {admin.name}
                        {admin.isMe && <span className="font-normal opacity-70"> (you)</span>}
                      </span>
                      <span className={cn('block truncate text-xs', active ? 'opacity-75' : 'text-neutral-500')}>
                        {admin.full ? 'Everything' : `${admin.pages.length} of ${total} pages`}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </Panel>

        {selected && (
          <Panel
            title={selected.name}
            description={
              selected.isMe
                ? "This is you. Another admin with everything can change your access."
                : selected.updatedAt
                  ? `Last changed ${format(selected.updatedAt, 'd MMM yyyy')}${selected.updatedBy ? ` by ${selected.updatedBy}` : ''}`
                  : selected.email ?? undefined
            }
            actions={selected.full ? <StatusBadge tone="green">Everything</StatusBadge> : <StatusBadge tone="amber">{selected.pages.length} pages</StatusBadge>}
          >
            <div className="space-y-5 p-5 pt-3">
              <label className="flex items-start justify-between gap-4 rounded-2xl bg-rh-canvas p-4 dark:bg-white/[0.04]">
                <span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-rh-ink dark:text-white">
                    <ShieldCheck className="h-4 w-4" /> Everything
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    Every page, now and as we add more, plus roles, team access and this page.
                  </span>
                </span>
                <Switch checked={full} onCheckedChange={setFull} disabled={selected.isMe || saving} aria-label="Everything" />
              </label>

              {!full && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-neutral-500">
                      <span className="font-semibold text-rh-ink dark:text-white">{ticked.size}</span> of {total} pages ticked. My page is always on.
                    </span>
                    <span className="flex gap-2">
                      <Button type="button" size="sm" className={cn(softButtonClass, 'h-8 px-3 text-xs')} onClick={() => setTicked(new Set(sections.flatMap((s) => s.items.map((i) => i.href))))}>
                        Tick all
                      </Button>
                      <Button type="button" size="sm" className={cn(softButtonClass, 'h-8 px-3 text-xs')} onClick={() => setTicked(new Set())}>
                        Clear
                      </Button>
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {sections.map((section) => {
                      const hrefs = section.items.map((i) => i.href)
                      const on = hrefs.filter((h) => ticked.has(h)).length
                      const Icon = section.icon
                      return (
                        <fieldset key={section.id} className="rounded-2xl border border-black/[0.06] p-3 dark:border-white/[0.08]">
                          <legend className="sr-only">{section.label}</legend>
                          <label className="flex cursor-pointer items-center gap-2.5 px-1 pb-2 text-sm font-semibold text-rh-ink dark:text-white">
                            <input
                              type="checkbox"
                              className={checkboxClass}
                              checked={on === hrefs.length}
                              ref={(el) => {
                                if (el) el.indeterminate = on > 0 && on < hrefs.length
                              }}
                              onChange={(e) => toggleSection(hrefs, e.target.checked)}
                              disabled={selected.isMe || saving}
                            />
                            <Icon className="h-3.5 w-3.5 text-neutral-500" />
                            {section.label}
                            <span className="ml-auto text-xs font-normal text-neutral-500">
                              {on}/{hrefs.length}
                            </span>
                          </label>
                          <div className="space-y-0.5">
                            {section.items.map((item) => (
                              <label
                                key={item.href}
                                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 text-sm text-rh-ink transition-colors hover:bg-rh-canvas dark:text-neutral-200 dark:hover:bg-white/[0.04]"
                              >
                                <input
                                  type="checkbox"
                                  className={checkboxClass}
                                  checked={ticked.has(item.href)}
                                  onChange={() => toggle(item.href)}
                                  disabled={selected.isMe || saving}
                                />
                                {item.title}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      )
                    })}
                  </div>
                </div>
              )}

              {!selected.isMe && (
                <div className="flex items-center justify-end gap-2 border-t border-black/[0.05] pt-4 dark:border-white/[0.06]">
                  {dirty && (
                    <Button
                      type="button"
                      className={softButtonClass}
                      onClick={() => {
                        setFull(selected.full)
                        setTicked(new Set(selected.pages))
                      }}
                      disabled={saving}
                    >
                      Undo
                    </Button>
                  )}
                  <Button type="button" className={primaryButtonClass} onClick={onSave} disabled={!dirty || saving || (!full && ticked.size === 0)}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save access
                  </Button>
                </div>
              )}
            </div>
          </Panel>
        )}
      </div>
    </AdminPage>
  )
}
