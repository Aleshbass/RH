// Notification Types
export const NotificationTypes = {
  // Appointment notifications
  APPOINTMENT_REMINDER: "appointment_reminder",
  APPOINTMENT_CANCELLED: "appointment_cancelled",
  APPOINTMENT_RESCHEDULED: "appointment_rescheduled",
  APPOINTMENT_SCHEDULED: "appointment_scheduled",
  
  // Patient notifications
  NEW_PATIENT_ASSIGNMENT: "new_patient_assignment",
  SESSION_COMPLETED: "session_completed",
  PATIENT_PROGRESS_UPDATE: "patient_progress_update",
  TREATMENT_PLAN_UPDATED: "treatment_plan_updated",
  
  // Billing notifications
  INVOICE_GENERATED: "invoice_generated",
  PAYMENT_RECEIVED: "payment_received",
  BILLING_REMINDER: "billing_reminder",
  
  // Staff notifications
  STAFF_INVITATION: "staff_invitation",
  APPROVAL_REQUIRED: "approval_required",
  ACCOUNT_APPROVED: "account_approved",
  ACCOUNT_DECLINED: "account_declined",
  
  // System notifications
  SYSTEM_ALERT: "system_alert",
  SYSTEM_MAINTENANCE: "system_maintenance",
  
  // Communication notifications
  MESSAGE_RECEIVED: "message_received",
  VIDEO_CALL_SCHEDULED: "video_call_scheduled",
  VIDEO_CALL_STARTED: "video_call_started",
  VIDEO_CALL_REMINDER: "video_call_reminder",
  VIDEO_CALL_MISSED: "video_call_missed",
  VIDEO_CALL_CANCELLED: "video_call_cancelled",
  
  // Onboarding notifications
  INVITATION_CREATED: "invitation_created",
  INVITATION_REMINDER: "invitation_reminder",
  ONBOARDING_COMPLETE: "onboarding_complete",
  
  // Session notifications
  SESSION_NOTES_ADDED: "session_notes_added",
} as const;

export type NotificationType = typeof NotificationTypes[keyof typeof NotificationTypes];

// Notification Priorities
export const NotificationPriorities = {
  URGENT: "urgent",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type NotificationPriority = typeof NotificationPriorities[keyof typeof NotificationPriorities];

// Notification Statuses
export const NotificationStatuses = {
  PENDING: "pending",
  DELIVERED: "delivered",
  READ: "read",
  FAILED: "failed",
  RETRYING: "retrying",
} as const;

export type NotificationStatus = typeof NotificationStatuses[keyof typeof NotificationStatuses];

// Notification Payload
export interface NotificationPayload {
  title: string;
  body: string;
  data?: {
    entityId?: string;
    entityType?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  };
  link?: string;
}

// Notification Settings
export interface NotificationSettings {
  email: {
    enabled: boolean;
    types: NotificationType[];
    frequency: "immediate" | "daily" | "weekly";
  };
  push: {
    enabled: boolean;
    types: NotificationType[];
  };
  inApp: {
    enabled: boolean;
    types: NotificationType[];
    showBadge: boolean;
    playSound: boolean;
  };
  doNotDisturb: {
    enabled: boolean;
    startTime: string; // "HH:mm" format
    endTime: string;   // "HH:mm" format
  };
}

// Notification Stats
export interface NotificationStats {
  total: number;
  unread: number;
  todayCount: number;
  thisWeekCount: number;
  byType: Record<NotificationType, number>;
  byPriority: Record<NotificationPriority, number>;
} 