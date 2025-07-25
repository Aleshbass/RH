/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as accountApproval from "../accountApproval.js";
import type * as actions_accounts_approveAccount from "../actions/accounts/approveAccount.js";
import type * as actions_accounts_declineAccount from "../actions/accounts/declineAccount.js";
import type * as actions_accounts_index from "../actions/accounts/index.js";
import type * as actions_emails_index from "../actions/emails/index.js";
import type * as actions_emails_sendApprovalEmail from "../actions/emails/sendApprovalEmail.js";
import type * as actions_emails_sendDeclineEmail from "../actions/emails/sendDeclineEmail.js";
import type * as actions_emails_sendInvitationEmail from "../actions/emails/sendInvitationEmail.js";
import type * as actions_emails_sendOnboardingNotificationEmail from "../actions/emails/sendOnboardingNotificationEmail.js";
import type * as actions_index from "../actions/index.js";
import type * as actions_notifications_cleanupDuplicates from "../actions/notifications/cleanupDuplicates.js";
import type * as actions_notifications_index from "../actions/notifications/index.js";
import type * as actions_notifications_sendNotification from "../actions/notifications/sendNotification.js";
import type * as actions_onboarding from "../actions/onboarding.js";
import type * as actions_patients_completeOnboarding from "../actions/patients/completeOnboarding.js";
import type * as actions_patients_index from "../actions/patients/index.js";
import type * as actions_patients_invitePatient from "../actions/patients/invitePatient.js";
import type * as admin from "../admin.js";
import type * as analytics_service from "../analytics/service.js";
import type * as appointments from "../appointments.js";
import type * as auth from "../auth.js";
import type * as billing from "../billing.js";
import type * as chat from "../chat.js";
import type * as clerk from "../clerk.js";
import type * as clinics from "../clinics.js";
import type * as crons from "../crons.js";
import type * as debug from "../debug.js";
import type * as files from "../files.js";
import type * as helpers_triggerRetryProcessing from "../helpers/triggerRetryProcessing.js";
import type * as notesTemplates from "../notesTemplates.js";
import type * as notifications_core from "../notifications/core.js";
import type * as notifications_email from "../notifications/email.js";
import type * as notifications_production from "../notifications/production.js";
import type * as notifications_retry from "../notifications/retry.js";
import type * as notifications_service from "../notifications/service.js";
import type * as notifications from "../notifications.js";
import type * as patientInvitations from "../patientInvitations.js";
import type * as patients from "../patients.js";
import type * as physiotherapists from "../physiotherapists.js";
import type * as queries from "../queries.js";
import type * as reports from "../reports.js";
import type * as scheduled_notification_retry from "../scheduled/notification_retry.js";
import type * as sessionLogs from "../sessionLogs.js";
import type * as settings_service from "../settings/service.js";
import type * as settings from "../settings.js";
import type * as treatmentPlans from "../treatmentPlans.js";
import type * as users from "../users.js";
import type * as videoCalls from "../videoCalls.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  accountApproval: typeof accountApproval;
  "actions/accounts/approveAccount": typeof actions_accounts_approveAccount;
  "actions/accounts/declineAccount": typeof actions_accounts_declineAccount;
  "actions/accounts/index": typeof actions_accounts_index;
  "actions/emails/index": typeof actions_emails_index;
  "actions/emails/sendApprovalEmail": typeof actions_emails_sendApprovalEmail;
  "actions/emails/sendDeclineEmail": typeof actions_emails_sendDeclineEmail;
  "actions/emails/sendInvitationEmail": typeof actions_emails_sendInvitationEmail;
  "actions/emails/sendOnboardingNotificationEmail": typeof actions_emails_sendOnboardingNotificationEmail;
  "actions/index": typeof actions_index;
  "actions/notifications/cleanupDuplicates": typeof actions_notifications_cleanupDuplicates;
  "actions/notifications/index": typeof actions_notifications_index;
  "actions/notifications/sendNotification": typeof actions_notifications_sendNotification;
  "actions/onboarding": typeof actions_onboarding;
  "actions/patients/completeOnboarding": typeof actions_patients_completeOnboarding;
  "actions/patients/index": typeof actions_patients_index;
  "actions/patients/invitePatient": typeof actions_patients_invitePatient;
  admin: typeof admin;
  "analytics/service": typeof analytics_service;
  appointments: typeof appointments;
  auth: typeof auth;
  billing: typeof billing;
  chat: typeof chat;
  clerk: typeof clerk;
  clinics: typeof clinics;
  crons: typeof crons;
  debug: typeof debug;
  files: typeof files;
  "helpers/triggerRetryProcessing": typeof helpers_triggerRetryProcessing;
  notesTemplates: typeof notesTemplates;
  "notifications/core": typeof notifications_core;
  "notifications/email": typeof notifications_email;
  "notifications/production": typeof notifications_production;
  "notifications/retry": typeof notifications_retry;
  "notifications/service": typeof notifications_service;
  notifications: typeof notifications;
  patientInvitations: typeof patientInvitations;
  patients: typeof patients;
  physiotherapists: typeof physiotherapists;
  queries: typeof queries;
  reports: typeof reports;
  "scheduled/notification_retry": typeof scheduled_notification_retry;
  sessionLogs: typeof sessionLogs;
  "settings/service": typeof settings_service;
  settings: typeof settings;
  treatmentPlans: typeof treatmentPlans;
  users: typeof users;
  videoCalls: typeof videoCalls;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
