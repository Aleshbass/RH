"use node";

/**
 * Actions entry point
 * This file re-exports all actions from their respective folders
 * to provide a cleaner import experience
 */

// Patient-related actions
export { createPatientInvitationWithNotification } from './patients/invitePatient';
export { completePatientOnboardingWithNotification } from './patients/completeOnboarding';

// Account-related actions
export { approveAccount } from './accounts/approveAccount';
export { declineAccount } from './accounts/declineAccount';

// Notification actions
export { sendNotificationWithFallback, sendFormattedNotification } from './notifications/sendNotification';
