import { Award } from '@/components/icons'
import type { TierKey } from '@/lib/rewards/rules'
import { cn } from '@/lib/utils'

/**
 * A physio's tier next to their name. Ink and Rehabify green only, stepping up in weight:
 * Bronze outlined, Silver soft, Gold ink, Platinum green. No metallic colours.
 */
const STYLE: Record<TierKey, string> = {
  bronze: 'border border-pt-line-strong text-pt-muted',
  silver: 'bg-pt-sunken text-pt-ink',
  gold: 'bg-pt-primary text-pt-on-primary',
  platinum: 'bg-pt-accent text-[#06210a]',
}

export function TierBadge({ tier, name, className }: { tier: TierKey; name: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4', STYLE[tier], className)}>
      <Award className="h-3 w-3" />
      {name}
    </span>
  )
}
