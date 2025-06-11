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
import type * as actions_index from "../actions/index.js";
import type * as actions_notifications_cleanupDuplicates from "../actions/notifications/cleanupDuplicates.js";
import type * as actions_notifications_sendNotification from "../actions/notifications/sendNotification.js";
import type * as actions_patients_completeOnboarding from "../actions/patients/completeOnboarding.js";
import type * as actions_patients_invitePatient from "../actions/patients/invitePatient.js";
import type * as auth from "../auth.js";
import type * as clerk from "../clerk.js";
import type * as clinics from "../clinics.js";
import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as notifications from "../notifications.js";
import type * as patientInvitations from "../patientInvitations.js";
import type * as physiotherapists from "../physiotherapists.js";
import type * as queries from "../queries.js";
import type * as scheduled_notification_retry from "../scheduled/notification_retry.js";
import type * as users from "../users.js";

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
  "actions/index": typeof actions_index;
  "actions/notifications/cleanupDuplicates": typeof actions_notifications_cleanupDuplicates;
  "actions/notifications/sendNotification": typeof actions_notifications_sendNotification;
  "actions/patients/completeOnboarding": typeof actions_patients_completeOnboarding;
  "actions/patients/invitePatient": typeof actions_patients_invitePatient;
  auth: typeof auth;
  clerk: typeof clerk;
  clinics: typeof clinics;
  crons: typeof crons;
  files: typeof files;
  notifications: typeof notifications;
  patientInvitations: typeof patientInvitations;
  physiotherapists: typeof physiotherapists;
  queries: typeof queries;
  "scheduled/notification_retry": typeof scheduled_notification_retry;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
