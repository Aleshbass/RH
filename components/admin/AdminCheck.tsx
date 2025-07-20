'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, RefreshCw } from 'lucide-react'

interface AdminCheckProps {
  children: ReactNode
}

export function AdminCheck({ children }: AdminCheckProps) {
  const currentUser = useQuery(api.users.getMyUser) as { role?: string } | null | undefined

  // Still loading user data
  if (currentUser === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Verifying user permissions...</p>
        </div>
      </div>
    )
  }

  // Not an admin
  if (currentUser === null || currentUser.role !== 'admin') {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <Shield className="h-6 w-6 text-red-600" />
          </div>
          <CardTitle className="text-xl">Access Denied</CardTitle>
          <CardDescription>
            You do not have the required administrator privileges to access this page.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-gray-600">
            If you believe this is an error, please contact support. If you were recently granted admin access, please sign out and sign back in.
          </p>
          <Button
            onClick={() => window.location.href = '/dashboard'}
            variant="outline"
            className="w-full"
          >
            Return to Dashboard
          </Button>
        </CardContent>
      </Card>
    )
  }

  // User is an admin, show the content
  return <>{children}</>
} 