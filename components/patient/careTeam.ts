/** api.patients.getPatientCareTeam (the fields the patient pages use) */
export type CareTeamMember = {
  physiotherapist: { _id: string; firstName?: string; lastName?: string; email?: string; imageUrl?: string }
  profile: {
    specializations?: string[]
    bio?: string
    yearsOfExperience?: number
    languagesSpoken?: string[]
    location?: string
    offersOnlineSessions?: boolean
    offersInPersonSessions?: boolean
    averageRating?: number
    reviewCount?: number
    bookingSlug?: string
  } | null
  clinic: { _id: string; name?: string; address?: string; city?: string; contactPhone?: string; logoUrl?: string } | null
  relationship: { isPrimary?: boolean; startDate?: number; status?: string }
  recentAppointments: number
  lastAppointment?: number
}

export function physioName(member: CareTeamMember) {
  return [member.physiotherapist.firstName, member.physiotherapist.lastName].filter(Boolean).join(' ') || 'Your physiotherapist'
}

/** Opens Messages straight into a chat with this physiotherapist. */
export function messageHref(physiotherapistUserId: string) {
  return `/dashboard/patient/messages?with=${physiotherapistUserId}`
}
