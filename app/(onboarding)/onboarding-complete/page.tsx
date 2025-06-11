'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { Button } from '@/components/ui/button';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { useAction, useMutation } from 'convex/react';
import { formatOnboardingCompleteNotification } from '@/lib/notifications/notificationService';
import { motion } from 'framer-motion';

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { isLoaded, userId } = useAuth();
  const { data, completeOnboarding, resetOnboarding } = useOnboardingStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsApproval, setNeedsApproval] = useState<boolean>(false);
  const [notificationSent, setNotificationSent] = useState(false); // Add this state variable
  const syncUser = useAction(api.clerk.syncUser);
  const submitForReview = useMutation(api.accountApproval.submitForReview);
  const createNotification = useMutation(api.notifications.create);
  
  useEffect(() => {
    // If not authenticated or no role selected, redirect to appropriate page
    if (isLoaded) {
      if (!userId) {
        router.push('/sign-in');
        return;
      }
      
      if (!data.role) {
        router.push('/role-selection');
        return;
      }
    }
  }, [isLoaded, userId, data.role, router]);
  
  useEffect(() => {
    const syncUserData = async () => {
      if (isLoaded && userId && !notificationSent) { // Only proceed if notification hasn't been sent
        try {
          setIsSubmitting(true);
          
          // Get user data from onboarding store
          const email = data.patientData?.email || data.physiotherapistData?.email || data.clinicOwnerData?.email || '';
          const firstName = data.patientData?.firstName || data.physiotherapistData?.firstName || data.clinicOwnerData?.firstName || '';
          const lastName = data.patientData?.lastName || data.physiotherapistData?.lastName || data.clinicOwnerData?.lastName || '';
          const fullName = `${firstName} ${lastName}`.trim() || email;
  
          // Make sure Clerk user data is synced with Convex
          const convexUserId = await syncUser({
            clerkId: userId,
            email,
            firstName,
            lastName,
          });
          
          // Determine if this user role requires approval
          const requiresApproval = data.role === 'physiotherapist' || data.role === 'clinic_owner';
          setNeedsApproval(requiresApproval);
  
          // If role requires approval, submit for review
          if (requiresApproval && convexUserId) {
            await submitForReview({ userId: convexUserId });
          }
  
          // Create notification for onboarding complete
          if (convexUserId) {
            // Dashboard link based on role
            const dashboardLink = data.role === 'physiotherapist' 
              ? '/dashboard/physiotherapist'
              : data.role === 'clinic_owner'
              ? '/dashboard/clinic'
              : data.role === 'patient'
              ? '/dashboard/patient'
              : '/dashboard';
  
            // Format notification data
            const notificationData = formatOnboardingCompleteNotification(
              fullName,
              data.role || 'user',
              dashboardLink
            );
  
            // Create notification in database
            await createNotification({
              userId: convexUserId,
              type: 'onboarding_complete',
              title: notificationData.title,
              message: notificationData.message,
              data: notificationData.data,
              sendEmail: true
            });
            
            // Mark notification as sent
            setNotificationSent(true);
          }
          
          // Mark onboarding as complete in the store
          completeOnboarding();
          
          setIsSubmitting(false);
        } catch (err) {
          console.error('Error syncing user data:', err);
          setError('Failed to complete onboarding. Please try again.');
          setIsSubmitting(false);
        }
      }
    };
    
    syncUserData();
  }, [isLoaded, userId, syncUser, notificationSent, data.role, data.patientData?.email, data.patientData?.firstName, data.patientData?.lastName, data.physiotherapistData?.email, data.physiotherapistData?.firstName, data.physiotherapistData?.lastName, data.clinicOwnerData?.email, data.clinicOwnerData?.firstName, data.clinicOwnerData?.lastName, submitForReview, createNotification, completeOnboarding, router]);
  
  const handleGoToDashboard = () => {
    // Reset onboarding data now that it's complete
    resetOnboarding();
    
    // Redirect to the appropriate dashboard based on role
    switch (data.role) {
      case 'physiotherapist':
        router.push('/dashboard/physiotherapist');
        break;
      case 'clinic_owner':
        router.push('/dashboard/clinic');
        break;
      case 'patient':
        router.push('/dashboard/patient');
        break;
      default:
        router.push('/dashboard');
    }
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gradient-to-br from-emerald-50 to-teal-100">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md shadow-xl bg-white/80 backdrop-blur-md rounded-xl p-8 text-center"
      >
        {needsApproval ? (
          <ShieldAlert className="w-16 h-16 mx-auto text-amber-500 mb-4" />
        ) : (
          <CheckCircle2 className="w-16 h-16 mx-auto text-emerald-500 mb-4" />
        )}
        
        <h1 className="text-3xl font-pally-bold text-teal-800 mb-2">
          Onboarding Complete!
        </h1>
        
        <p className="text-lg text-teal-700 mb-6">
          {needsApproval ? (
            <>Thank you for completing your profile setup. Your account is now <span className="font-bold">pending approval</span> from our administrators. You&apos;ll receive an email notification when your account is approved.</>  
          ) : (
            <>Thank you for completing your profile setup. You&apos;re now ready to use Rehabify Health as a {data.role === 'physiotherapist' ? 'Physiotherapist' : data.role === 'clinic_owner' ? 'Clinic Owner' : data.role === 'patient' ? 'Patient' : 'User'}!</>
          )}
        </p>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <Button 
          onClick={handleGoToDashboard} 
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Finishing up...' : 'Go to Dashboard'}
        </Button>
      </motion.div>
    </div>
  );
}