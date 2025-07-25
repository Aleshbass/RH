'use client'

import { useEffect } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useAuth } from '@clerk/nextjs'

export default function AutoOnboardClinicOwner() {
  const { isLoaded } = useAuth()
  const user = useQuery(api.users.getMyUser)
  const markOnboarded = useMutation(api.users.markClinicOwnerOnboarded)

  useEffect(() => {
    if (!isLoaded || !user) return
    
    // Only auto-onboard clinic owners who aren't onboarded yet
    if (user.role === 'clinic_owner' && !user.onboarded) {
      markOnboarded()
        .then((result) => {
          console.log('Auto-onboarded clinic owner:', result)
        })
        .catch((error) => {
          console.log('Could not auto-onboard clinic owner:', error.message)
          // This is expected if they don't have a clinic yet
        })
    }
  }, [isLoaded, user, markOnboarded])

  // This component doesn't render anything
  return null
}
