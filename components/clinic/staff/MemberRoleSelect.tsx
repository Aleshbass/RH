'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useClinicAccess } from '@/components/clinic/ClinicPreviewContext'
import { fieldClass, isPreviewId } from '@/components/clinic/patients/patient-record-shared'
import { FULL_ACCESS, roleLabel, teamError, type ClinicRole } from './team-shared'

/**
 * A team member's dashboard role. The owner picks it from a compact select;
 * everyone else just sees the name.
 */
export function MemberRoleSelect({
  memberId,
  memberName,
  roleId,
  roles,
  className,
}: {
  memberId: Id<'users'>
  memberName: string
  roleId: Id<'clinicRoles'> | null | undefined
  roles: ClinicRole[] | undefined
  className?: string
}) {
  const { isOwner, isStaff, isLoaded, requireFullAccess } = useClinicAccess()
  const setMemberRole = useMutation(api.clinicTools.setMemberClinicRole)
  const [saving, setSaving] = useState(false)

  const current = roleId && roles?.some((r) => r._id === roleId) ? String(roleId) : FULL_ACCESS
  const label = roleLabel(roleId, roles)

  // Team members and anyone still loading get a plain label
  if (!isOwner && (isStaff || !isLoaded)) {
    return (
      <p className={cn('truncate text-xs text-neutral-600 dark:text-neutral-400 sm:w-44', className)}>
        Role: <span className="font-medium text-neutral-900 dark:text-neutral-100">{label}</span>
      </p>
    )
  }

  const handleChange = async (value: string) => {
    if (value === current) return
    // Preview visitors (sample team) see the setup prompt instead
    if (!isOwner || isPreviewId(memberId)) {
      requireFullAccess('Change role')
      return
    }
    const nextRoleId = value === FULL_ACCESS ? null : (value as Id<'clinicRoles'>)
    if (nextRoleId && isPreviewId(nextRoleId)) return
    setSaving(true)
    try {
      await setMemberRole({ memberId, roleId: nextRoleId })
      toast.success(
        nextRoleId
          ? `${memberName} now has the ${roleLabel(nextRoleId, roles)} role`
          : `${memberName} now has full access`
      )
    } catch (err) {
      toast.error(teamError(err, 'Could not change the role'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Select value={current} onValueChange={(value) => void handleChange(value)} disabled={saving}>
      <SelectTrigger
        size="sm"
        aria-label={`Role for ${memberName}`}
        className={cn(fieldClass, 'h-8 w-full min-w-0 text-xs sm:w-44', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FULL_ACCESS}>Full access</SelectItem>
        {(roles ?? []).map((role) => (
          <SelectItem key={role._id} value={role._id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
