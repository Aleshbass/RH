'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'

// Staff accounts have their own dashboards; the patient pages would only show them an empty record
const STAFF_ROLES = new Set(['physiotherapist', 'clinic_owner', 'clinic_staff', 'doctor', 'admin', 'partner'])

export default function PatientDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const user = useQuery(api.users.getMyUser) as { role?: string } | null | undefined
  const isStaff = Boolean(user?.role && STAFF_ROLES.has(user.role))

  useEffect(() => {
    if (isStaff) router.replace('/dashboard')
  }, [isStaff, router])

  if (isStaff) return null

  return (
    <>
      {children}
    </>
  )
}
