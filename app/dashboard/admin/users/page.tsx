import { Suspense } from 'react'
import { UsersOrPatients } from '@/components/admin/patients/PatientDirectory'

export default function AdminUsersPage() {
  // ?role=patient shows the patient directory, any other role the accounts list. Both read the
  // URL with useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <UsersOrPatients />
    </Suspense>
  )
}
