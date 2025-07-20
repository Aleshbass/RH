 'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClipboardList, Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface Session {
  _id: string
  sessionDate: number
  patient?: {
    firstName: string
    lastName: string
  }
}

interface RecentSessionsProps {
  recentSessions: Session[] | undefined
  onViewAll: () => void
  onViewSession: (sessionId: string) => void
}

export function RecentSessions({ 
  recentSessions, 
  onViewAll, 
  onViewSession 
}: RecentSessionsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Recent Sessions</CardTitle>
          <Button size="sm" variant="ghost" onClick={onViewAll}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {recentSessions && recentSessions.length > 0 ? (
          recentSessions.map((session) => (
            <div key={session._id} className="flex items-center space-x-3">
              <div className="w-2 h-8 bg-blue-500 rounded-full"></div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {session.patient ? 
                    `${session.patient.firstName} ${session.patient.lastName}` : 
                    'Unknown Patient'
                  }
                </p>
                <p className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(session.sessionDate))} ago
                </p>
              </div>
              <Button 
                size="sm" 
                variant="ghost"
                onClick={() => onViewSession(session._id)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <div className="text-center py-4 text-gray-500">
            <ClipboardList className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No sessions logged yet</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}