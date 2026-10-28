'use client'

import Link from 'next/link'
import { ArrowLeft } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/clinic/ui'
import ClinicPlan from '@/components/clinic/ClinicPlan'

export default function ClinicPlanPage() {
  return (
    <PageShell
      title="Your plan"
      description="Your Rehabify plan, what you've used, Rehabify's invoices and your data export."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/clinic/billing">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Billing
          </Link>
        </Button>
      }
    >
      <ClinicPlan />
    </PageShell>
  )
}
