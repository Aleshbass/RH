import { redirect } from 'next/navigation'

// Role management now lives on the Users & roles page.
export default function AdminRolesPage() {
  redirect('/dashboard/admin/users')
}
