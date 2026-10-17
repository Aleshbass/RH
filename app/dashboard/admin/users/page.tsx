import { Suspense } from 'react'
import { UserManagement } from '@/components/dashboard/admin/UserManagement'

export default function AdminUsersPage() {
  // UserManagement reads ?role= with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <UserManagement />
    </Suspense>
  )
}
