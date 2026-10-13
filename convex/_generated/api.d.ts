/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountApproval from "../accountApproval.js";
import type * as actions_accounts_approveAccount from "../actions/accounts/approveAccount.js";
import type * as actions_accounts_declineAccount from "../actions/accounts/declineAccount.js";
import type * as actions_accounts_index from "../actions/accounts/index.js";
import type * as actions_clinics_index from "../actions/clinics/index.js";
import type * as actions_clinics_inviteClinicStaff from "../actions/clinics/inviteClinicStaff.js";
import type * as actions_clinics_staffInvitationActions from "../actions/clinics/staffInvitationActions.js";
import type * as actions_emails_index from "../actions/emails/index.js";
import type * as actions_emails_sendAppointmentCanceledPatientEmail from "../actions/emails/sendAppointmentCanceledPatientEmail.js";
import type * as actions_emails_sendAppointmentCanceledProviderEmail from "../actions/emails/sendAppointmentCanceledProviderEmail.js";
import type * as actions_emails_sendAppointmentConfirmedProviderEmail from "../actions/emails/sendAppointmentConfirmedProviderEmail.js";
import type * as actions_emails_sendAppointmentReminderEmail from "../actions/emails/sendAppointmentReminderEmail.js";
import type * as actions_emails_sendAppointmentRequestedEmail from "../actions/emails/sendAppointmentRequestedEmail.js";
import type * as actions_emails_sendAppointmentRescheduledPatientEmail from "../actions/emails/sendAppointmentRescheduledPatientEmail.js";
import type * as actions_emails_sendAppointmentRescheduledProviderEmail from "../actions/emails/sendAppointmentRescheduledProviderEmail.js";
import type * as actions_emails_sendAppointmentScheduledEmail from "../actions/emails/sendAppointmentScheduledEmail.js";
import type * as actions_emails_sendApprovalEmail from "../actions/emails/sendApprovalEmail.js";
import type * as actions_emails_sendClinicPatientInviteEmail from "../actions/emails/sendClinicPatientInviteEmail.js";
import type * as actions_emails_sendClinicStaffInvitationEmail from "../actions/emails/sendClinicStaffInvitationEmail.js";
import type * as actions_emails_sendClinicStaffInviteOwnerAcceptedEmail from "../actions/emails/sendClinicStaffInviteOwnerAcceptedEmail.js";
import type * as actions_emails_sendClinicStaffInviteOwnerDeclinedEmail from "../actions/emails/sendClinicStaffInviteOwnerDeclinedEmail.js";
import type * as actions_emails_sendDeclineEmail from "../actions/emails/sendDeclineEmail.js";
import type * as actions_emails_sendGoogleMeetLinkEmail from "../actions/emails/sendGoogleMeetLinkEmail.js";
import type * as actions_emails_sendInvitationEmail from "../actions/emails/sendInvitationEmail.js";
import type * as actions_emails_sendOnboardingNotificationEmail from "../actions/emails/sendOnboardingNotificationEmail.js";
import type * as actions_emails_sendPartnerApplicationEmails from "../actions/emails/sendPartnerApplicationEmails.js";
import type * as actions_emails_sendPartnershipInquiryEmail from "../actions/emails/sendPartnershipInquiryEmail.js";
import type * as actions_emails_sendPatientOnboardedProviderEmail from "../actions/emails/sendPatientOnboardedProviderEmail.js";
import type * as actions_emails_sendPatientOnboardingCompleteEmail from "../actions/emails/sendPatientOnboardingCompleteEmail.js";
import type * as actions_emails_sendPaymentReceiptEmail from "../actions/emails/sendPaymentReceiptEmail.js";
import type * as actions_emails_sendReferralCreatedEmails from "../actions/emails/sendReferralCreatedEmails.js";
import type * as actions_emails_sendVerificationBadgeEmail from "../actions/emails/sendVerificationBadgeEmail.js";
import type * as actions_emails_sendVideoCallInvitation from "../actions/emails/sendVideoCallInvitation.js";
import type * as actions_index from "../actions/index.js";
import type * as actions_notifications_cleanupDuplicates from "../actions/notifications/cleanupDuplicates.js";
import type * as actions_notifications_index from "../actions/notifications/index.js";
import type * as actions_notifications_sendNotification from "../actions/notifications/sendNotification.js";
import type * as actions_onboarding from "../actions/onboarding.js";
import type * as actions_partners_dispatchWebhook from "../actions/partners/dispatchWebhook.js";
import type * as actions_patients_alternateInvites from "../actions/patients/alternateInvites.js";
import type * as actions_patients_completeOnboarding from "../actions/patients/completeOnboarding.js";
import type * as actions_patients_index from "../actions/patients/index.js";
import type * as actions_patients_invitePatient from "../actions/patients/invitePatient.js";
import type * as actions_patients_simpleCompleteOnboarding from "../actions/patients/simpleCompleteOnboarding.js";
import type * as admin from "../admin.js";
import type * as adminPartnerships from "../adminPartnerships.js";
import type * as adminReferrals from "../adminReferrals.js";
import type * as admin_marketplaceBookings from "../admin/marketplaceBookings.js";
import type * as admin_marketplaceEarnings from "../admin/marketplaceEarnings.js";
import type * as admin_fix from "../admin_fix.js";
import type * as admin_purge from "../admin_purge.js";
import type * as analytics from "../analytics.js";
import type * as analytics_service from "../analytics/service.js";
import type * as appointments from "../appointments.js";
import type * as appointments_withCalendar from "../appointments/withCalendar.js";
import type * as assessments from "../assessments.js";
import type * as auth from "../auth.js";
import type * as awadoc from "../awadoc.js";
import type * as billing from "../billing.js";
import type * as calendar_access from "../calendar/access.js";
import type * as calendar_async from "../calendar/async.js";
import type * as calendar_availability from "../calendar/availability.js";
import type * as calendar_availabilityTypes from "../calendar/availabilityTypes.js";
import type * as calendar_mutations from "../calendar/mutations.js";
import type * as calendar_nodeActions from "../calendar/nodeActions.js";
import type * as calendar_oauth from "../calendar/oauth.js";
import type * as calendar_service from "../calendar/service.js";
import type * as calendar_sync from "../calendar/sync.js";
import type * as calendar_types from "../calendar/types.js";
import type * as calendar_webhook from "../calendar/webhook.js";
import type * as chat from "../chat.js";
import type * as clerk from "../clerk.js";
import type * as clinicBilling from "../clinicBilling.js";
import type * as clinicFeeSettings from "../clinicFeeSettings.js";
import type * as clinicFees from "../clinicFees.js";
import type * as clinicTools from "../clinicTools.js";
import type * as clinics from "../clinics.js";
import type * as commercialTerms from "../commercialTerms.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as debugAppointments from "../debugAppointments.js";
import type * as debugTokens from "../debugTokens.js";
import type * as doctors from "../doctors.js";
import type * as emailAudit from "../emailAudit.js";
import type * as exerciseCompletions from "../exerciseCompletions.js";
import type * as exerciseTemplates from "../exerciseTemplates.js";
import type * as exercises from "../exercises.js";
import type * as files from "../files.js";
import type * as health from "../health.js";
import type * as helpers_appUrl from "../helpers/appUrl.js";
import type * as helpers_escapeHtml from "../helpers/escapeHtml.js";
import type * as helpers_marketplacePricing from "../helpers/marketplacePricing.js";
import type * as helpers_partnerAccess from "../helpers/partnerAccess.js";
import type * as helpers_partnerAttribution from "../helpers/partnerAttribution.js";
import type * as helpers_partnerEvents from "../helpers/partnerEvents.js";
import type * as helpers_partnerLedger from "../helpers/partnerLedger.js";
import type * as helpers_partnerReferralCore from "../helpers/partnerReferralCore.js";
import type * as helpers_partnerShared from "../helpers/partnerShared.js";
import type * as helpers_paystackSignature from "../helpers/paystackSignature.js";
import type * as helpers_serverSecret from "../helpers/serverSecret.js";
import type * as helpers_triggerRetryProcessing from "../helpers/triggerRetryProcessing.js";
import type * as http from "../http.js";
import type * as imagekit from "../imagekit.js";
import type * as joyGateway from "../joyGateway.js";
import type * as joyIntegration from "../joyIntegration.js";
import type * as joyOperations from "../joyOperations.js";
import type * as joyProviderBootstrap from "../joyProviderBootstrap.js";
import type * as joyTestProviderSeed from "../joyTestProviderSeed.js";
import type * as location from "../location.js";
import type * as locationTracking from "../locationTracking.js";
import type * as marketplace_booking from "../marketplace/booking.js";
import type * as marketplace_debug from "../marketplace/debug.js";
import type * as marketplace_matching from "../marketplace/matching.js";
import type * as marketplace_migrations from "../marketplace/migrations.js";
import type * as marketplace_quickEnable from "../marketplace/quickEnable.js";
import type * as marketplace_reports from "../marketplace/reports.js";
import type * as marketplace_retention from "../marketplace/retention.js";
import type * as marketplace_reviews from "../marketplace/reviews.js";
import type * as marketplace_search from "../marketplace/search.js";
import type * as marketplace_settings from "../marketplace/settings.js";
import type * as marketplace_verification from "../marketplace/verification.js";
import type * as mediloan from "../mediloan.js";
import type * as messages from "../messages.js";
import type * as monthlySettlements from "../monthlySettlements.js";
import type * as notesTemplates from "../notesTemplates.js";
import type * as notifications from "../notifications.js";
import type * as notifications_core from "../notifications/core.js";
import type * as notifications_email from "../notifications/email.js";
import type * as notifications_production from "../notifications/production.js";
import type * as notifications_retry from "../notifications/retry.js";
import type * as notifications_service from "../notifications/service.js";
import type * as partnerApi from "../partnerApi.js";
import type * as partnerBankAccounts from "../partnerBankAccounts.js";
import type * as partnerGateway from "../partnerGateway.js";
import type * as partnerLinks from "../partnerLinks.js";
import type * as partnerMigrations from "../partnerMigrations.js";
import type * as partnerWebhooks from "../partnerWebhooks.js";
import type * as partners from "../partners.js";
import type * as patientInvitations from "../patientInvitations.js";
import type * as patients from "../patients.js";
import type * as payments from "../payments.js";
import type * as payouts from "../payouts.js";
import type * as paystack from "../paystack.js";
import type * as paystackDoctor from "../paystackDoctor.js";
import type * as physioRegistry from "../physioRegistry.js";
import type * as physiotherapistProfiles from "../physiotherapistProfiles.js";
import type * as physiotherapists from "../physiotherapists.js";
import type * as platformSettings from "../platformSettings.js";
import type * as public_ from "../public.js";
import type * as queries from "../queries.js";
import type * as recurringAppointments from "../recurringAppointments.js";
import type * as reminderSystem from "../reminderSystem.js";
import type * as reminders from "../reminders.js";
import type * as resourceManagement from "../resourceManagement.js";
import type * as resourceNotifications from "../resourceNotifications.js";
import type * as resourceSchema from "../resourceSchema.js";
import type * as scheduledTasks from "../scheduledTasks.js";
import type * as scheduled_appointment_reminders from "../scheduled/appointment_reminders.js";
import type * as scheduled_invitation_reminders from "../scheduled/invitation_reminders.js";
import type * as scheduled_notification_retry from "../scheduled/notification_retry.js";
import type * as schema_calendar from "../schema/calendar.js";
import type * as schema_health from "../schema/health.js";
import type * as sessionLogs from "../sessionLogs.js";
import type * as settings from "../settings.js";
import type * as settings_service from "../settings/service.js";
import type * as stream from "../stream.js";
import type * as stream_mutations from "../stream_mutations.js";
import type * as stream_queries from "../stream_queries.js";
import type * as test_reminders from "../test_reminders.js";
import type * as testing_testReminders from "../testing/testReminders.js";
import type * as therapistDashboard from "../therapistDashboard.js";
import type * as treatmentPlanSync from "../treatmentPlanSync.js";
import type * as treatmentPlans from "../treatmentPlans.js";
import type * as users from "../users.js";
import type * as videoCalls from "../videoCalls.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accountApproval: typeof accountApproval;
  "actions/accounts/approveAccount": typeof actions_accounts_approveAccount;
  "actions/accounts/declineAccount": typeof actions_accounts_declineAccount;
  "actions/accounts/index": typeof actions_accounts_index;
  "actions/clinics/index": typeof actions_clinics_index;
  "actions/clinics/inviteClinicStaff": typeof actions_clinics_inviteClinicStaff;
  "actions/clinics/staffInvitationActions": typeof actions_clinics_staffInvitationActions;
  "actions/emails/index": typeof actions_emails_index;
  "actions/emails/sendAppointmentCanceledPatientEmail": typeof actions_emails_sendAppointmentCanceledPatientEmail;
  "actions/emails/sendAppointmentCanceledProviderEmail": typeof actions_emails_sendAppointmentCanceledProviderEmail;
  "actions/emails/sendAppointmentConfirmedProviderEmail": typeof actions_emails_sendAppointmentConfirmedProviderEmail;
  "actions/emails/sendAppointmentReminderEmail": typeof actions_emails_sendAppointmentReminderEmail;
  "actions/emails/sendAppointmentRequestedEmail": typeof actions_emails_sendAppointmentRequestedEmail;
  "actions/emails/sendAppointmentRescheduledPatientEmail": typeof actions_emails_sendAppointmentRescheduledPatientEmail;
  "actions/emails/sendAppointmentRescheduledProviderEmail": typeof actions_emails_sendAppointmentRescheduledProviderEmail;
  "actions/emails/sendAppointmentScheduledEmail": typeof actions_emails_sendAppointmentScheduledEmail;
  "actions/emails/sendApprovalEmail": typeof actions_emails_sendApprovalEmail;
  "actions/emails/sendClinicPatientInviteEmail": typeof actions_emails_sendClinicPatientInviteEmail;
  "actions/emails/sendClinicStaffInvitationEmail": typeof actions_emails_sendClinicStaffInvitationEmail;
  "actions/emails/sendClinicStaffInviteOwnerAcceptedEmail": typeof actions_emails_sendClinicStaffInviteOwnerAcceptedEmail;
  "actions/emails/sendClinicStaffInviteOwnerDeclinedEmail": typeof actions_emails_sendClinicStaffInviteOwnerDeclinedEmail;
  "actions/emails/sendDeclineEmail": typeof actions_emails_sendDeclineEmail;
  "actions/emails/sendGoogleMeetLinkEmail": typeof actions_emails_sendGoogleMeetLinkEmail;
  "actions/emails/sendInvitationEmail": typeof actions_emails_sendInvitationEmail;
  "actions/emails/sendOnboardingNotificationEmail": typeof actions_emails_sendOnboardingNotificationEmail;
  "actions/emails/sendPartnerApplicationEmails": typeof actions_emails_sendPartnerApplicationEmails;
  "actions/emails/sendPartnershipInquiryEmail": typeof actions_emails_sendPartnershipInquiryEmail;
  "actions/emails/sendPatientOnboardedProviderEmail": typeof actions_emails_sendPatientOnboardedProviderEmail;
  "actions/emails/sendPatientOnboardingCompleteEmail": typeof actions_emails_sendPatientOnboardingCompleteEmail;
  "actions/emails/sendPaymentReceiptEmail": typeof actions_emails_sendPaymentReceiptEmail;
  "actions/emails/sendReferralCreatedEmails": typeof actions_emails_sendReferralCreatedEmails;
  "actions/emails/sendVerificationBadgeEmail": typeof actions_emails_sendVerificationBadgeEmail;
  "actions/emails/sendVideoCallInvitation": typeof actions_emails_sendVideoCallInvitation;
  "actions/index": typeof actions_index;
  "actions/notifications/cleanupDuplicates": typeof actions_notifications_cleanupDuplicates;
  "actions/notifications/index": typeof actions_notifications_index;
  "actions/notifications/sendNotification": typeof actions_notifications_sendNotification;
  "actions/onboarding": typeof actions_onboarding;
  "actions/partners/dispatchWebhook": typeof actions_partners_dispatchWebhook;
  "actions/patients/alternateInvites": typeof actions_patients_alternateInvites;
  "actions/patients/completeOnboarding": typeof actions_patients_completeOnboarding;
  "actions/patients/index": typeof actions_patients_index;
  "actions/patients/invitePatient": typeof actions_patients_invitePatient;
  "actions/patients/simpleCompleteOnboarding": typeof actions_patients_simpleCompleteOnboarding;
  admin: typeof admin;
  adminPartnerships: typeof adminPartnerships;
  adminReferrals: typeof adminReferrals;
  "admin/marketplaceBookings": typeof admin_marketplaceBookings;
  "admin/marketplaceEarnings": typeof admin_marketplaceEarnings;
  admin_fix: typeof admin_fix;
  admin_purge: typeof admin_purge;
  analytics: typeof analytics;
  "analytics/service": typeof analytics_service;
  appointments: typeof appointments;
  "appointments/withCalendar": typeof appointments_withCalendar;
  assessments: typeof assessments;
  auth: typeof auth;
  awadoc: typeof awadoc;
  billing: typeof billing;
  "calendar/access": typeof calendar_access;
  "calendar/async": typeof calendar_async;
  "calendar/availability": typeof calendar_availability;
  "calendar/availabilityTypes": typeof calendar_availabilityTypes;
  "calendar/mutations": typeof calendar_mutations;
  "calendar/nodeActions": typeof calendar_nodeActions;
  "calendar/oauth": typeof calendar_oauth;
  "calendar/service": typeof calendar_service;
  "calendar/sync": typeof calendar_sync;
  "calendar/types": typeof calendar_types;
  "calendar/webhook": typeof calendar_webhook;
  chat: typeof chat;
  clerk: typeof clerk;
  clinicBilling: typeof clinicBilling;
  clinicFeeSettings: typeof clinicFeeSettings;
  clinicFees: typeof clinicFees;
  clinicTools: typeof clinicTools;
  clinics: typeof clinics;
  commercialTerms: typeof commercialTerms;
  crons: typeof crons;
  debug: typeof debug;
  debugAppointments: typeof debugAppointments;
  debugTokens: typeof debugTokens;
  doctors: typeof doctors;
  emailAudit: typeof emailAudit;
  exerciseCompletions: typeof exerciseCompletions;
  exerciseTemplates: typeof exerciseTemplates;
  exercises: typeof exercises;
  files: typeof files;
  health: typeof health;
  "helpers/appUrl": typeof helpers_appUrl;
  "helpers/escapeHtml": typeof helpers_escapeHtml;
  "helpers/marketplacePricing": typeof helpers_marketplacePricing;
  "helpers/partnerAccess": typeof helpers_partnerAccess;
  "helpers/partnerAttribution": typeof helpers_partnerAttribution;
  "helpers/partnerEvents": typeof helpers_partnerEvents;
  "helpers/partnerLedger": typeof helpers_partnerLedger;
  "helpers/partnerReferralCore": typeof helpers_partnerReferralCore;
  "helpers/partnerShared": typeof helpers_partnerShared;
  "helpers/paystackSignature": typeof helpers_paystackSignature;
  "helpers/serverSecret": typeof helpers_serverSecret;
  "helpers/triggerRetryProcessing": typeof helpers_triggerRetryProcessing;
  http: typeof http;
  imagekit: typeof imagekit;
  joyGateway: typeof joyGateway;
  joyIntegration: typeof joyIntegration;
  joyOperations: typeof joyOperations;
  joyProviderBootstrap: typeof joyProviderBootstrap;
  joyTestProviderSeed: typeof joyTestProviderSeed;
  location: typeof location;
  locationTracking: typeof locationTracking;
  "marketplace/booking": typeof marketplace_booking;
  "marketplace/debug": typeof marketplace_debug;
  "marketplace/matching": typeof marketplace_matching;
  "marketplace/migrations": typeof marketplace_migrations;
  "marketplace/quickEnable": typeof marketplace_quickEnable;
  "marketplace/reports": typeof marketplace_reports;
  "marketplace/retention": typeof marketplace_retention;
  "marketplace/reviews": typeof marketplace_reviews;
  "marketplace/search": typeof marketplace_search;
  "marketplace/settings": typeof marketplace_settings;
  "marketplace/verification": typeof marketplace_verification;
  mediloan: typeof mediloan;
  messages: typeof messages;
  monthlySettlements: typeof monthlySettlements;
  notesTemplates: typeof notesTemplates;
  notifications: typeof notifications;
  "notifications/core": typeof notifications_core;
  "notifications/email": typeof notifications_email;
  "notifications/production": typeof notifications_production;
  "notifications/retry": typeof notifications_retry;
  "notifications/service": typeof notifications_service;
  partnerApi: typeof partnerApi;
  partnerBankAccounts: typeof partnerBankAccounts;
  partnerGateway: typeof partnerGateway;
  partnerLinks: typeof partnerLinks;
  partnerMigrations: typeof partnerMigrations;
  partnerWebhooks: typeof partnerWebhooks;
  partners: typeof partners;
  patientInvitations: typeof patientInvitations;
  patients: typeof patients;
  payments: typeof payments;
  payouts: typeof payouts;
  paystack: typeof paystack;
  paystackDoctor: typeof paystackDoctor;
  physioRegistry: typeof physioRegistry;
  physiotherapistProfiles: typeof physiotherapistProfiles;
  physiotherapists: typeof physiotherapists;
  platformSettings: typeof platformSettings;
  public: typeof public_;
  queries: typeof queries;
  recurringAppointments: typeof recurringAppointments;
  reminderSystem: typeof reminderSystem;
  reminders: typeof reminders;
  resourceManagement: typeof resourceManagement;
  resourceNotifications: typeof resourceNotifications;
  resourceSchema: typeof resourceSchema;
  scheduledTasks: typeof scheduledTasks;
  "scheduled/appointment_reminders": typeof scheduled_appointment_reminders;
  "scheduled/invitation_reminders": typeof scheduled_invitation_reminders;
  "scheduled/notification_retry": typeof scheduled_notification_retry;
  "schema/calendar": typeof schema_calendar;
  "schema/health": typeof schema_health;
  sessionLogs: typeof sessionLogs;
  settings: typeof settings;
  "settings/service": typeof settings_service;
  stream: typeof stream;
  stream_mutations: typeof stream_mutations;
  stream_queries: typeof stream_queries;
  test_reminders: typeof test_reminders;
  "testing/testReminders": typeof testing_testReminders;
  therapistDashboard: typeof therapistDashboard;
  treatmentPlanSync: typeof treatmentPlanSync;
  treatmentPlans: typeof treatmentPlans;
  users: typeof users;
  videoCalls: typeof videoCalls;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
