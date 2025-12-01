import { getCachedPatientData } from '@/actions/get-cached-patient-data'
import { PatientDashboard } from '@/components/dashboard/patient/PatientDashboard'

export default async function PatientDashboardPage() {
  // Fetch cached data on the server
  const { user, appointments, stats } = await getCachedPatientData()

  return (
    <PatientDashboard
      initialUser={user}
      initialAppointments={appointments}
      initialStats={stats}
    />
  )
} 