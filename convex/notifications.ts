// Re-export all functions from the modular notification files
export * from "./notifications/core";
export * from "./notifications/retry";
export * from "./notifications/service";

// For backward compatibility, export the main functions directly
export { 
  createNotificationWithDeduplication as create,
  getByUserId,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification
} from "./notifications/core";

export { 
  sendNotificationWithFallback,
  testNotification,
  scheduleCleanup 
} from "./notifications/service";

export { 
  processRetryQueuesWithRateLimit,
  getRetryQueueStats,
  cleanupRetryQueues 
} from "./notifications/retry"; 