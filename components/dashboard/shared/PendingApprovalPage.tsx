'use client'

import { Clock, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface PendingApprovalPageProps {
  userRole: string
  approvalStatus: 'pending_review' | 'declined'
  declineReason?: string
}

export default function PendingApprovalPage({ 
  userRole, 
  approvalStatus, 
  declineReason 
}: PendingApprovalPageProps) {
  const router = useRouter()
  
  const isPending = approvalStatus === 'pending_review'
  const isDeclined = approvalStatus === 'declined'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {isPending && (
              <div className="h-16 w-16 bg-yellow-100 rounded-full flex items-center justify-center">
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
            )}
            {isDeclined && (
              <div className="h-16 w-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
            )}
          </div>
          
          <CardTitle className="text-xl">
            {isPending && 'Account Under Review'}
            {isDeclined && 'Account Declined'}
          </CardTitle>
          
          <CardDescription>
            {isPending && `Your ${userRole} account is being reviewed by our team.`}
            {isDeclined && `Your ${userRole} account application was declined.`}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <Badge variant={isPending ? "secondary" : "destructive"}>
              {isPending && 'Pending Review'}
              {isDeclined && 'Declined'}
            </Badge>
          </div>
          
          {isPending && (
            <div className="text-center text-sm text-gray-600">
              <p>We&apos;re reviewing your credentials and documentation.</p>
              <p className="mt-2">We&apos;ll notify you once your account is approved.</p>
              <p className="mt-2 font-medium">This typically takes 1-2 business days.</p>
            </div>
          )}
          
          {isDeclined && declineReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">Reason for Decline:</h4>
              <p className="text-sm text-red-700">{declineReason}</p>
            </div>
          )}
          
          {isDeclined && (
            <div className="text-center text-sm text-gray-600">
              <p>You can contact our support team if you believe this was an error.</p>
              <p className="mt-2">Email: support@rehabify.com</p>
            </div>
          )}
          
          <div className="flex flex-col gap-2 pt-4">
            <Button 
              onClick={() => router.push('/')} 
              variant="outline"
              className="w-full"
            >
              Return to Home
            </Button>
            
            {isDeclined && (
              <Button 
                onClick={() => router.push('/onboarding/role-selection')} 
                className="w-full"
              >
                Apply Again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}