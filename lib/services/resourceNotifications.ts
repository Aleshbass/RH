import { api } from '@/convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';

interface ResourceMaintenanceAlert {
  resourceId: string;
  resourceName: string;
  maintenanceType: 'scheduled' | 'urgent' | 'overdue';
  scheduledDate: number;
  description?: string;
  clinicId: string;
  physiotherapistId?: string;
}

interface ResourceAvailabilityAlert {
  resourceId: string;
  resourceName: string;
  conflictType: 'booking_conflict' | 'maintenance_conflict' | 'unavailable';
  affectedAppointments: string[];
  suggestedActions: string[];
  clinicId: string;
}

export class ResourceNotificationService {
  private convex: any;
  // Use untyped client to avoid deep TS generic instantiation issues
  private get client(): any {
    return this.convex as any;
  }
  // Use untyped API reference to avoid deep generics on api.*
  private get api(): any {
    return api as any;
  }

  constructor() {
    this.convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!) as any;
  }

  /**
   * Send maintenance alert notification
   */
  async sendMaintenanceAlert(alert: ResourceMaintenanceAlert): Promise<void> {
    try {
      // Create notification in database
      await this.client.mutation(this.api.notifications.create, {
        userId: alert.physiotherapistId || alert.clinicId,
        type: 'resource_maintenance',
        title: this.getMaintenanceAlertTitle(alert),
        message: this.getMaintenanceAlertMessage(alert),
        data: {
          resourceId: alert.resourceId,
          resourceName: alert.resourceName,
          maintenanceType: alert.maintenanceType,
          scheduledDate: alert.scheduledDate,
          clinicId: alert.clinicId,
        },
        priority: alert.maintenanceType === 'urgent' ? 'high' : 'medium',
        channels: ['in_app', 'email'],
      });

      // Send email notification for urgent maintenance
      if (alert.maintenanceType === 'urgent' || alert.maintenanceType === 'overdue') {
        await this.sendMaintenanceEmail(alert);
      }

      // Send push notification
      await this.sendPushNotification({
        title: this.getMaintenanceAlertTitle(alert),
        body: this.getMaintenanceAlertMessage(alert),
        data: {
          type: 'resource_maintenance',
          resourceId: alert.resourceId,
          clinicId: alert.clinicId,
        },
      });

    } catch (error) {
      console.error('Failed to send maintenance alert:', error);
      throw error;
    }
  }

  /**
   * Send resource availability conflict alert
   */
  async sendAvailabilityAlert(alert: ResourceAvailabilityAlert): Promise<void> {
    try {
      // Create notification in database
      await this.client.mutation(this.api.notifications.create, {
        userId: alert.clinicId,
        type: 'resource_conflict',
        title: this.getAvailabilityAlertTitle(alert),
        message: this.getAvailabilityAlertMessage(alert),
        data: {
          resourceId: alert.resourceId,
          resourceName: alert.resourceName,
          conflictType: alert.conflictType,
          affectedAppointments: alert.affectedAppointments,
          suggestedActions: alert.suggestedActions,
          clinicId: alert.clinicId,
        },
        priority: 'high',
        channels: ['in_app', 'email'],
      });

      // Send immediate email for conflicts
      await this.sendConflictEmail(alert);

    } catch (error) {
      console.error('Failed to send availability alert:', error);
      throw error;
    }
  }

  /**
   * Schedule maintenance reminders
   */
  async scheduleMaintenanceReminders(
    resourceId: string,
    maintenanceDate: number,
    clinicId: string
  ): Promise<void> {
    const reminderTimes = [
      { days: 7, type: 'weekly' },
      { days: 1, type: 'daily' },
      { hours: 2, type: 'immediate' },
    ];

    for (const reminder of reminderTimes) {
      const reminderTime = reminder.days 
        ? maintenanceDate - (reminder.days * 24 * 60 * 60 * 1000)
        : maintenanceDate - (reminder.hours! * 60 * 60 * 1000);

      if (reminderTime > Date.now()) {
        await this.client.mutation(this.api.scheduledTasks.create, {
          type: 'maintenance_reminder',
          scheduledTime: reminderTime,
          data: {
            resourceId,
            maintenanceDate,
            clinicId,
            reminderType: reminder.type,
          },
        });
      }
    }
  }

  /**
   * Check for upcoming maintenance and send alerts
   */
  async checkUpcomingMaintenance(clinicId: string): Promise<void> {
    try {
      const resources = await this.client.query(this.api.resourceManagement.getResources, {
        clinicId,
      });

      const now = Date.now();
      const oneWeekFromNow = now + (7 * 24 * 60 * 60 * 1000);

      for (const resource of resources as any[]) {
        const nextMaintenanceTime = this.getNextMaintenanceTime(resource);
        if (!nextMaintenanceTime) continue;

        // Check for upcoming maintenance (within 1 week)
        if (nextMaintenanceTime > now && nextMaintenanceTime <= oneWeekFromNow) {
          await this.sendMaintenanceAlert({
            resourceId: (resource as any)._id,
            resourceName: (resource as any).name,
            maintenanceType: 'scheduled',
            scheduledDate: nextMaintenanceTime,
            description: (resource as any).maintenanceSchedule?.description,
            clinicId,
          });
        } else if (nextMaintenanceTime < now) {
          // Overdue maintenance
          await this.sendMaintenanceAlert({
            resourceId: (resource as any)._id,
            resourceName: (resource as any).name,
            maintenanceType: 'overdue',
            scheduledDate: nextMaintenanceTime,
            description: (resource as any).maintenanceSchedule?.description,
            clinicId,
          });
        }
      }
    } catch (error) {
      console.error('Failed to check upcoming maintenance:', error);
    }
  }

  /**
   * Check for resource conflicts with appointments
   */
  async checkResourceConflicts(clinicId: string): Promise<void> {
    try {
      // Delegate conflict detection to Convex via a scheduled task.
      // This avoids relying on a non-existent public query and handles auth/server logic internally.
      await this.client.mutation(this.api.scheduledTasks.create, {
        type: 'resource_conflict_check',
        scheduledTime: Date.now() + 1000, // run shortly
        data: { clinicId },
      });
    } catch (error) {
      console.error('Failed to schedule resource conflict check:', error);
    }
  }

  // Compute the next maintenance time from the resource's maintenanceSchedule
  private getNextMaintenanceTime(resource: any): number | null {
    const sched = resource?.maintenanceSchedule;
    if (!sched) return null;

    if (sched.nextMaintenance) {
      const t = new Date(sched.nextMaintenance).getTime();
      return Number.isNaN(t) ? null : t;
    }

    if (sched.lastMaintenance && sched.frequency) {
      const last = new Date(sched.lastMaintenance).getTime();
      if (Number.isNaN(last)) return null;
      const daysByFreq: Record<string, number> = {
        daily: 1,
        weekly: 7,
        monthly: 30,
        quarterly: 90,
        annually: 365,
      };
      const days = daysByFreq[sched.frequency] ?? 30;
      return last + days * 24 * 60 * 60 * 1000;
    }

    return null;
  }

  // Return a maintenance window around the next maintenance time (2 hours by default)
  private getMaintenanceWindow(resource: any): { start: number; end: number } | null {
    const t = this.getNextMaintenanceTime(resource);
    if (!t) return null;
    const durationMs = 2 * 60 * 60 * 1000; // 2 hours
    return { start: t - durationMs / 2, end: t + durationMs / 2 };
  }

  private getMaintenanceAlertTitle(alert: ResourceMaintenanceAlert): string {
    switch (alert.maintenanceType) {
      case 'scheduled':
        return `Upcoming Maintenance: ${alert.resourceName}`;
      case 'urgent':
        return `Urgent Maintenance Required: ${alert.resourceName}`;
      case 'overdue':
        return `Overdue Maintenance: ${alert.resourceName}`;
      default:
        return `Maintenance Alert: ${alert.resourceName}`;
    }
  }

  private getMaintenanceAlertMessage(alert: ResourceMaintenanceAlert): string {
    const dateStr = new Date(alert.scheduledDate).toLocaleDateString();
    
    switch (alert.maintenanceType) {
      case 'scheduled':
        return `Scheduled maintenance for ${alert.resourceName} is coming up on ${dateStr}. Please ensure the resource is available for maintenance.`;
      case 'urgent':
        return `${alert.resourceName} requires urgent maintenance. Please address this immediately to prevent service disruption.`;
      case 'overdue':
        return `Maintenance for ${alert.resourceName} was scheduled for ${dateStr} and is now overdue. Please complete maintenance as soon as possible.`;
      default:
        return `Maintenance alert for ${alert.resourceName}.`;
    }
  }

  private getAvailabilityAlertTitle(alert: ResourceAvailabilityAlert): string {
    switch (alert.conflictType) {
      case 'booking_conflict':
        return `Booking Conflict: ${alert.resourceName}`;
      case 'maintenance_conflict':
        return `Maintenance Conflict: ${alert.resourceName}`;
      case 'unavailable':
        return `Resource Unavailable: ${alert.resourceName}`;
      default:
        return `Resource Alert: ${alert.resourceName}`;
    }
  }

  private getAvailabilityAlertMessage(alert: ResourceAvailabilityAlert): string {
    const appointmentCount = alert.affectedAppointments.length;
    const appointmentText = appointmentCount === 1 ? 'appointment' : 'appointments';
    
    switch (alert.conflictType) {
      case 'booking_conflict':
        return `${alert.resourceName} has conflicting bookings affecting ${appointmentCount} ${appointmentText}. Please resolve the conflicts.`;
      case 'maintenance_conflict':
        return `${alert.resourceName} has scheduled maintenance that conflicts with ${appointmentCount} ${appointmentText}. Please reschedule or find alternatives.`;
      case 'unavailable':
        return `${alert.resourceName} is unavailable for ${appointmentCount} scheduled ${appointmentText}. Please take action to resolve this issue.`;
      default:
        return `${alert.resourceName} has availability issues affecting ${appointmentCount} ${appointmentText}.`;
    }
  }

  private async sendMaintenanceEmail(alert: ResourceMaintenanceAlert): Promise<void> {
    try {
      await fetch('/api/emails/maintenance-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: alert.clinicId,
          resourceName: alert.resourceName,
          maintenanceType: alert.maintenanceType,
          scheduledDate: alert.scheduledDate,
          description: alert.description,
        }),
      });
    } catch (error) {
      console.error('Failed to send maintenance email:', error);
    }
  }

  private async sendConflictEmail(alert: ResourceAvailabilityAlert): Promise<void> {
    try {
      await fetch('/api/emails/resource-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: alert.clinicId,
          resourceName: alert.resourceName,
          conflictType: alert.conflictType,
          affectedAppointments: alert.affectedAppointments,
          suggestedActions: alert.suggestedActions,
        }),
      });
    } catch (error) {
      console.error('Failed to send conflict email:', error);
    }
  }

  private async sendPushNotification(notification: {
    title: string;
    body: string;
    data: any;
  }): Promise<void> {
    try {
      // Implementation would depend on your push notification service
      // This is a placeholder for the actual push notification logic
      console.log('Push notification sent:', notification);
    } catch (error) {
      console.error('Failed to send push notification:', error);
    }
  }
}

// Export singleton instance
export const resourceNotificationService = new ResourceNotificationService();
