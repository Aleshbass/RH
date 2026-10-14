'use client'

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, AlertCircle, ArrowRight, ShieldCheck, CreditCard, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PhysioGuideVideoModal } from '@/components/dashboard/shared/PhysioGuideVideoModal';

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
  const [showVideoGuide, setShowVideoGuide] = useState(true)

  const isPending = approvalStatus === 'pending_review'
  const isDeclined = approvalStatus === 'declined'

  return (
    <>
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden border border-gray-100"
      >
        <div className="p-8 text-center">
          {/* Icon Section */}
          <div
            className={cn(
              "mx-auto mb-6 h-20 w-20 rounded-full flex items-center justify-center",
              isPending ? "bg-yellow-50" : "bg-red-50"
            )}
          >
            {isPending && <Clock className="h-10 w-10 text-yellow-600" />}
            {isDeclined && <AlertCircle className="h-10 w-10 text-red-600" />}
          </div>

          {/* Title & Description */}
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            {isPending ? 'Account Under Review' : 'Application Declined'}
          </h2>

          <p className="text-gray-600 mb-8 leading-relaxed">
            {isPending ? (
              <>
                Your {userRole} account is currently <span className="font-semibold text-yellow-700">pending review</span>.
                Our team is verifying your credentials. This typically takes 1-2 business days.
              </>
            ) : (
              <>
                We regret to inform you that your {userRole} application was <span className="font-semibold text-red-700">declined</span>.
              </>
            )}
          </p>

          {/* Declined Reason Box */}
          {isDeclined && declineReason && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-8 text-left">
              <h4 className="text-sm font-semibold text-red-800 mb-1">Reason for decline:</h4>
              <p className="text-sm text-red-700">{declineReason}</p>
            </div>
          )}

          {/* While You Wait Section (Only for Pending) */}
          {isPending && (
            <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
                While you wait
              </h3>

              <a href="/payout-policy" target="_blank" className="flex items-center p-3 bg-white rounded-lg border border-gray-100 hover:border-teal-200 transition-colors group">
                <div className="h-8 w-8 bg-blue-50 rounded-lg flex items-center justify-center mr-3 group-hover:bg-blue-100 transition-colors">
                  <CreditCard className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Payouts & Payment Policy</p>
                  <p className="text-xs text-gray-500">Learn how you get paid</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-teal-600 transition-colors" />
              </a>

              <a href="/privacy-policy" target="_blank" className="flex items-center p-3 bg-white rounded-lg border border-gray-100 hover:border-teal-200 transition-colors group">
                <div className="h-8 w-8 bg-purple-50 rounded-lg flex items-center justify-center mr-3 group-hover:bg-purple-100 transition-colors">
                  <ShieldCheck className="h-4 w-4 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">Privacy Policy</p>
                  <p className="text-xs text-gray-500">How we protect your data</p>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-teal-600 transition-colors" />
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={() => router.push('/')}
              variant="outline"
              className="w-full h-12 border-gray-200 hover:bg-gray-50 text-gray-700"
            >
              Return to Home
            </Button>

            {isDeclined && (
              <Button
                onClick={() => router.push('/role-selection')}
                className="w-full h-12 bg-teal-600 hover:bg-teal-700 text-white"
              >
                Apply Again
              </Button>
            )}
          </div>

          {/* Contact Support (Declined only) */}
          {isDeclined && (
            <p className="mt-6 text-xs text-gray-400">
              Believe this is an error? <a href="mailto:support@rehabify.ng" className="text-teal-600 hover:underline">Contact Support</a>
            </p>
          )}
        </div>
      </motion.div>
    </div>

    {/* Platform guide video — shown to physios waiting for approval */}
    {isPending && userRole === 'physiotherapist' && showVideoGuide && (
      <PhysioGuideVideoModal
        title="Your Rehabify platform guide"
        subtitle="While you wait for approval, get familiar with everything Rehabify has to offer."
        onClose={() => setShowVideoGuide(false)}
      />
    )}
    </>
  )
}