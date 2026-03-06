'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Shield, RefreshCw } from 'lucide-react'

interface DoctorGuardProps {
    children: ReactNode
}

export default function DoctorGuard({ children }: DoctorGuardProps) {
    const currentUser = useQuery(api.users.getMyUser) as { role?: string } | null | undefined

    if (currentUser === undefined) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">Checking permissions...</p>
                </div>
            </div>
        )
    }

    if (currentUser === null || currentUser.role !== 'doctor') {
        return (
            <Card className="max-w-md mx-auto mt-8">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                        <Shield className="h-6 w-6 text-red-600" />
                    </div>
                    <CardTitle className="text-xl">Access Denied</CardTitle>
                    <CardDescription>
                        You must be a referring doctor to access this section.
                    </CardDescription>
                </CardHeader>
                <CardContent className="text-center space-y-4">
                    <Button onClick={() => (window.location.href = '/dashboard')} variant="outline" className="w-full">
                        Return to Dashboard
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return <>{children}</>
}
