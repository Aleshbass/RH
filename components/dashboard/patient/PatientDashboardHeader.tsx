'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useUser } from '@clerk/nextjs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

import { Settings, User } from '@/components/icons'
import { TreatmentPlanSyncIndicator, SyncStatusIndicator } from './TreatmentPlanSyncIndicator'

export function PatientDashboardHeader() {
  const { user } = useUser()
  const patientData = useQuery(api.users.getMyUser)

  if (!patientData) return null

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-8">
      <div className="flex items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={(patientData as { imageUrl?: string } | null | undefined)?.imageUrl || user?.imageUrl || undefined} />
          <AvatarFallback>
            <User className="h-6 w-6" />
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold">
            Welcome, {patientData.firstName}!
          </h1>
          <p className="text-gray-600">
            Here&apos;s your health overview
          </p>
          <SyncStatusIndicator className="mt-1" />
        </div>
      </div>
      <div className="flex items-center gap-2 sm:self-auto">
        <TreatmentPlanSyncIndicator />
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
} 