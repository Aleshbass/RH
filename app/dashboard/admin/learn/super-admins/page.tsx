'use client'

/**
 * Admin › Learn › Super admins (owner 19 Nov 2026: "let admin see all the super admins"): everyone
 * with every Learn admin power, add by email, remove, and invites waiting for a sign-up. The same
 * list is on Admin › Blog & Learn access. Group leaders are chosen from it on Learn › Groups.
 */
import { AdminPage, PageHeader } from '@/components/admin/ui'
import { LearnSuperAdmins } from '@/components/admin/learn/LearnSuperAdmins'

export default function AdminLearnSuperAdminsPage() {
  return (
    <AdminPage>
      <PageHeader
        title="Learn super admins"
        description="People who can run Rehabify Learn: courses, groups, the community, Spaces and simulations. Add or remove them here, then make any of them a group's leader on Learn › Groups."
      />
      <LearnSuperAdmins />
    </AdminPage>
  )
}
