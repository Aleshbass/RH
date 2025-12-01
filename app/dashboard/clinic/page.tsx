import { getCachedClinicData } from '@/actions/get-cached-clinic-data'
import ClinicDashboardClient from './clinic-dashboard-client'

export default async function ClinicDashboardPage() {
  // Fetch cached data on the server
  const data = await getCachedClinicData()

  return <ClinicDashboardClient initialData={data} />
}
