'use client'

import { useState, type FormEvent } from 'react'
import { useMutation } from 'convex/react'
import { toast } from 'sonner'
import { Loader2, MoreHorizontal, Plus } from '@/components/icons'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/clinic/drawerDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'
import {
  CLINIC_AREAS,
  CLINIC_AREA_LABELS,
  useClinicAccess,
  type ClinicArea,
} from '@/components/clinic/ClinicAccessContext'
import { Panel, primaryButtonClass } from '@/components/clinic/ui'
import { fieldClass, isMissingId, labelClass } from '@/components/clinic/patients/patient-record-shared'
import {
  ROLE_TEMPLATES,
  checkboxClass,
  pluralPeople,
  roleSummary,
  teamError,
  type ClinicRole,
} from './team-shared'
import { playSound } from '@/lib/sounds'

interface RoleDraft {
  roleId?: Id<'clinicRoles'>
  name: string
  permissions: ClinicArea[]
}

const EMPTY_DRAFT: RoleDraft = { name: '', permissions: [] }

const chipClass =
  'inline-flex items-center gap-1 rounded-md border border-pt-line bg-pt-surface px-2.5 py-1 text-xs font-medium text-pt-ink transition-colors hover:bg-pt-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-rh-lime dark:focus-visible:ring-rh-lime'

/**
 * Dashboard roles: named sets of pages the owner can give team members.
 * Only the owner can change them; team members see the list read-only.
 */
export default function RolesPanel({ roles }: { roles: ClinicRole[] | undefined }) {
  const { isOwner, requireFullAccess } = useClinicAccess()
  const saveRole = useMutation(api.clinicTools.saveClinicRole)
  const deleteRole = useMutation(api.clinicTools.deleteClinicRole)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [draft, setDraft] = useState<RoleDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [deleteFor, setDeleteFor] = useState<ClinicRole | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Owners manage roles (even before approval). Team members only read.
  const canManage = isOwner

  const openEditor = (next: RoleDraft, actionName: string) => {
    if (!isOwner || (next.roleId && isMissingId(next.roleId))) {
      requireFullAccess(actionName)
      return
    }
    setDraft(next)
    setDialogOpen(true)
  }

  const handleSave = async (value: RoleDraft) => {
    setSaving(true)
    try {
      await saveRole({ roleId: value.roleId, name: value.name, permissions: value.permissions })
      playSound('success')
      toast.success(value.roleId ? 'Role updated' : `${value.name.trim()} role created`)
      setDialogOpen(false)
    } catch (err) {
      toast.error(teamError(err, 'Could not save the role'))
    } finally {
      setSaving(false)
    }
  }

  const askDelete = (role: ClinicRole) => {
    if (!isOwner || isMissingId(role._id)) {
      requireFullAccess('Delete role')
      return
    }
    setDeleteFor(role)
  }

  const handleDelete = async () => {
    if (!deleteFor) return
    setDeleting(true)
    try {
      await deleteRole({ roleId: deleteFor._id })
      playSound('reject')
      toast.success(`${deleteFor.name} role deleted`)
      setDeleteFor(null)
    } catch (err) {
      toast.error(teamError(err, 'Could not delete the role'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div id="staff-roles">
      <Panel
        title="Roles"
        description="Choose which pages each person can open. Home is always visible."
        actions={
          canManage ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => openEditor(EMPTY_DRAFT, 'Create role')}
            >
              <Plus className="mr-1 h-4 w-4" />
              New role
            </Button>
          ) : undefined
        }
      >
        {roles === undefined ? (
          <div className="space-y-2 px-5 py-4 sm:px-6">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
          </div>
        ) : roles.length === 0 ? (
          <div className="px-5 py-5 sm:px-6">
            <p className="text-sm text-pt-ink">
              No roles yet. Clinicians can open Appointments and Patients; give them a role to add clinic pages
              such as Referrals, Billing, Team or Reports.
            </p>
            {canManage && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-pt-muted">Start from</span>
                {ROLE_TEMPLATES.map((template) => (
                  <button
                    key={template.name}
                    type="button"
                    className={chipClass}
                    onClick={() =>
                      openEditor({ name: template.name, permissions: [...template.permissions] }, 'Create role')
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {template.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-pt-line">
            {roles.map((role) => (
              <li key={role._id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-pt-ink">{role.name}</p>
                  <p className="text-xs text-pt-muted">{roleSummary(role.permissions)}</p>
                </div>
                <p className="shrink-0 text-xs tabular-nums text-pt-muted">
                  {role.memberCount > 0 ? pluralPeople(role.memberCount) : 'No one yet'}
                </p>
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0">
                        <MoreHorizontal className="h-4 w-4 text-pt-muted" />
                        <span className="sr-only">Actions for {role.name}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() =>
                          openEditor(
                            { roleId: role._id, name: role.name, permissions: [...role.permissions] },
                            'Edit role'
                          )
                        }
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-pt-rose-fg focus:text-pt-rose-fg"
                        onClick={() => askDelete(role)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Create / edit */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && !saving && setDialogOpen(false)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg space-y-5 border-pt-line bg-pt-surface p-4 sm:p-6">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-base font-semibold text-pt-ink">
              {draft.roleId ? 'Edit role' : 'New role'}
            </DialogTitle>
            <DialogDescription className="text-sm text-pt-muted">
              People with this role only see the pages you tick.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so it starts from the chosen role each time */}
          <RoleForm
            initial={draft}
            saving={saving}
            onCancel={() => setDialogOpen(false)}
            onSubmit={(value) => void handleSave(value)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteFor} onOpenChange={(open) => !open && !deleting && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the {deleteFor?.name} role?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFor && deleteFor.memberCount > 0
                ? `${pluralPeople(deleteFor.memberCount)} with this role will go back to the default (clinicians: Appointments and Patients) until you give them another role.`
                : 'No one has this role. Pending invitations that use it will give the default clinician access (Appointments and Patients) instead.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-pt-rose-bg text-pt-rose-fg hover:brightness-95"
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function RoleForm({
  initial,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: RoleDraft
  saving: boolean
  onCancel: () => void
  onSubmit: (value: RoleDraft) => void
}) {
  const [name, setName] = useState(initial.name)
  const [permissions, setPermissions] = useState<ClinicArea[]>(initial.permissions)

  const toggle = (area: ClinicArea, checked: boolean) =>
    setPermissions((prev) => (checked ? [...prev.filter((a) => a !== area), area] : prev.filter((a) => a !== area)))

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Give the role a name, e.g. Clinician')
      return
    }
    onSubmit({ roleId: initial.roleId, name: name.trim(), permissions })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="clinic-role-name" className={labelClass}>
          Role name
        </Label>
        <Input
          id="clinic-role-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. Clinician"
          autoComplete="off"
          disabled={saving}
          className={cn(fieldClass, 'h-9')}
        />
      </div>

      <div role="group" aria-labelledby="clinic-role-pages" className="space-y-2">
        <p id="clinic-role-pages" className={labelClass}>
          Pages they can open
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CLINIC_AREAS.map((area) => (
            <label
              key={area}
              className="flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md border border-pt-line px-3 py-2 text-sm text-pt-ink transition-colors hover:bg-pt-hover"
            >
              <Checkbox
                checked={permissions.includes(area)}
                onCheckedChange={(checked) => toggle(area, checked === true)}
                disabled={saving}
                className={checkboxClass}
              />
              <span className="truncate">{CLINIC_AREA_LABELS[area]}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-pt-muted">
          Leave all unticked to give full access. Home is always visible.
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" className={cn(primaryButtonClass, 'h-9 px-4')} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {initial.roleId ? 'Save role' : 'Create role'}
        </Button>
      </div>
    </form>
  )
}
