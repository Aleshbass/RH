'use client'

import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  Shield,
  UserPlus,
  UserX,
  UserCog,
  Mail,
  Search,
  Download,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Building2
} from 'lucide-react'
import { format } from 'date-fns'

interface AuditLogEntry {
  _id: string
  action: string
  userId: string
  targetUserId?: string
  clinicId: string
  details: Record<string, unknown>
  timestamp: number
  user?: {
    firstName?: string
    lastName?: string
    email: string
    imageUrl?: string
  }
  targetUser?: {
    firstName?: string
    lastName?: string
    email: string
  }
}

export default function AuditLogPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  
  // Get audit logs for the clinic
  const auditLogs = useQuery(api.clinics.getClinicAuditLogs, {
    limit: 100,
    actionFilter: actionFilter === 'all' ? undefined : actionFilter,
    dateFilter: dateFilter === 'all' ? undefined : dateFilter,
  })

  // Filter logs based on search term
  const filteredLogs = auditLogs?.filter((log: AuditLogEntry) => {
    const searchLower = searchTerm.toLowerCase()
    const userName = `${log.user?.firstName || ''} ${log.user?.lastName || ''}`.trim()
    const targetUserName = `${log.targetUser?.firstName || ''} ${log.targetUser?.lastName || ''}`.trim()
    
    return (
      userName.toLowerCase().includes(searchLower) ||
      log.user?.email.toLowerCase().includes(searchLower) ||
      targetUserName.toLowerCase().includes(searchLower) ||
      log.targetUser?.email.toLowerCase().includes(searchLower) ||
      log.action.toLowerCase().includes(searchLower)
    )
  }) || []

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'staff_invite_sent':
        return <Mail className="h-4 w-4 text-blue-500" />
      case 'staff_invite_accepted':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'staff_invite_declined':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'staff_created_direct':
        return <UserPlus className="h-4 w-4 text-green-500" />
      case 'staff_role_updated':
        return <UserCog className="h-4 w-4 text-blue-500" />
      case 'staff_status_updated':
        return <Shield className="h-4 w-4 text-orange-500" />
      case 'staff_reassigned':
        return <Building2 className="h-4 w-4 text-purple-500" />
      case 'staff_terminated':
        return <UserX className="h-4 w-4 text-red-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'staff_invite_sent':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Invite Sent</Badge>
      case 'staff_invite_accepted':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Invite Accepted</Badge>
      case 'staff_invite_declined':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Invite Declined</Badge>
      case 'staff_created_direct':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Staff Created</Badge>
      case 'staff_role_updated':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Role Updated</Badge>
      case 'staff_status_updated':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Status Updated</Badge>
      case 'staff_reassigned':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Reassigned</Badge>
      case 'staff_terminated':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Terminated</Badge>
      default:
        return <Badge variant="secondary">{action.replace('_', ' ')}</Badge>
    }
  }

  const getActionDescription = (log: AuditLogEntry) => {
    const userName = `${log.user?.firstName || ''} ${log.user?.lastName || ''}`.trim() || log.user?.email
    const targetUserName = `${log.targetUser?.firstName || ''} ${log.targetUser?.lastName || ''}`.trim() || log.targetUser?.email

    switch (log.action) {
      case 'staff_invite_sent':
        return `${userName} sent an invitation to ${log.details?.staffEmail || targetUserName}`
      case 'staff_invite_accepted':
        return `${targetUserName} accepted the staff invitation`
      case 'staff_invite_declined':
        return `${targetUserName} declined the staff invitation`
      case 'staff_created_direct':
        return `${userName} directly created staff member ${log.details?.staffEmail}`
      case 'staff_role_updated':
        return `${userName} updated ${targetUserName}'s role from ${log.details?.oldRole} to ${log.details?.newRole}`
      case 'staff_status_updated':
        return `${userName} updated ${targetUserName}'s status from ${log.details?.oldStatus} to ${log.details?.newStatus}`
      case 'staff_reassigned':
        return `${userName} reassigned ${targetUserName} from ${log.details?.oldClinicName} to ${log.details?.newClinicName}`
      case 'staff_terminated':
        return `${userName} terminated ${targetUserName}`
      default:
        return `${userName} performed ${log.action.replace('_', ' ')}`
    }
  }

  const exportAuditLog = () => {
    const csvContent = [
      ['Timestamp', 'Action', 'User', 'Target User', 'Description', 'Details'],
      ...filteredLogs.map((log: AuditLogEntry) => [
        format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        log.action,
        `${log.user?.firstName || ''} ${log.user?.lastName || ''}`.trim() || log.user?.email,
        `${log.targetUser?.firstName || ''} ${log.targetUser?.lastName || ''}`.trim() || log.targetUser?.email || '',
        getActionDescription(log),
        JSON.stringify(log.details)
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clinic-audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (auditLogs === undefined) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="space-y-4">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Audit Log</h1>
            <p className="text-gray-600">Track all staff management activities in your clinic</p>
          </div>
          <Button onClick={exportAuditLog} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by user, email, or action..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="staff_invite_sent">Invitations Sent</SelectItem>
                  <SelectItem value="staff_invite_accepted">Invitations Accepted</SelectItem>
                  <SelectItem value="staff_invite_declined">Invitations Declined</SelectItem>
                  <SelectItem value="staff_created_direct">Staff Created</SelectItem>
                  <SelectItem value="staff_role_updated">Role Updates</SelectItem>
                  <SelectItem value="staff_status_updated">Status Updates</SelectItem>
                  <SelectItem value="staff_reassigned">Reassignments</SelectItem>
                  <SelectItem value="staff_terminated">Terminations</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="quarter">This Quarter</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Audit Log Entries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity Log ({filteredLogs.length} entries)
            </CardTitle>
            <CardDescription>
              Chronological record of all staff management activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No audit log entries found matching your criteria</p>
                </div>
              ) : (
                filteredLogs.map((log: AuditLogEntry) => (
                  <div key={log._id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex-shrink-0 mt-1">
                      {getActionIcon(log.action)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getActionBadge(log.action)}
                        <span className="text-sm text-gray-500">
                          {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm')}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-900 mb-2">
                        {getActionDescription(log)}
                      </p>
                      
                      {/* Additional Details */}
                      {log.details && Object.keys(log.details).length > 0 && (
                        <div className="bg-gray-50 p-2 rounded text-xs text-gray-600">
                          <strong>Details:</strong>
                          <ul className="mt-1 space-y-1">
                            {Object.entries(log.details).map(([key, value]) => (
                              <li key={key}>
                                <span className="font-medium">{key.replace(/([A-Z])/g, ' $1').toLowerCase()}:</span> {String(value)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={log.user?.imageUrl} />
                        <AvatarFallback>
                          {`${log.user?.firstName?.[0] || ''}${log.user?.lastName?.[0] || ''}` || log.user?.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
