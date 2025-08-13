
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useEffect } from 'react'
import { log } from '@/lib/monitoring/logger'
import { ErrorTracker } from '@/lib/monitoring/sentry'

interface SystemHealthData {
  overall: {
    status: 'healthy' | 'degraded' | 'error';
    uptime: number;
    lastChecked: number;
    error?: string;
  };
  services: {
    database: {
      status: 'healthy' | 'degraded' | 'error';
      responseTime: number;
      connections: number;
      metrics: {
        totalUsers?: number;
        activeUsersToday?: number;
        totalAppointments?: number;
        appointmentsToday?: number;
        totalPatients?: number;
        totalClinics?: number;
      };
    };
    api: {
      status: 'healthy' | 'degraded' | 'error';
      responseTime: number;
      uptime: number;
      errorRate: number;
      metrics: {
        requestsPerMinute?: number;
        averageResponseTime?: number;
        errorCount?: number;
      };
    };
    notifications: {
      status: 'healthy' | 'degraded' | 'error';
      responseTime: number;
      deliveryRate: number;
      metrics: {
        emailsSentToday?: number;
        smsDelivered?: number;
        pushNotifications?: number;
      };
    };
  };
  timestamp: number;
}

export function useSystemHealth() {
  const result = useQuery(api.analytics.getSystemHealth);
  
  // Log system health checks for monitoring
  useEffect(() => {
    if (result) {
      log.info('System health check completed', {
        action: 'system_health_check',
        metadata: {
          overallStatus: result.overall.status,
          uptime: result.overall.uptime,
          services: {
            database: result.services.database.status,
            api: result.services.api.status,
            notifications: result.services.notifications.status
          }
        }
      })

      // Track system health issues
      if (result.overall.status === 'error') {
        ErrorTracker.captureMessage(
          `System health check failed: ${result.overall.error || 'Unknown error'}`,
          'error',
          {
            action: 'system_health_error',
            extra: {
              services: result.services,
              timestamp: result.timestamp
            }
          }
        )
      }
    }
  }, [result])
  
  if (!result) {
    return { 
      data: null as SystemHealthData | null,
      isLoading: true,
      error: null
    };
  }

  // Helper functions for health status analysis
  const getOverallHealthScore = () => {
    if (!result) return 0;
    const services = [result.services.database, result.services.api, result.services.notifications];
    const healthyCount = services.filter(service => service.status === 'healthy').length;
    return (healthyCount / services.length) * 100;
  };

  const getCriticalIssues = () => {
    if (!result) return [];
    const issues = [];
    
    if (result.services.database.status === 'error') {
      issues.push('Database connectivity issues detected');
    }
    if (result.services.api.status === 'error') {
      issues.push('API service experiencing errors');
    }
    if (result.services.notifications.status === 'error') {
      issues.push('Notification service is down');
    }
    if (result.services.api.errorRate > 0.05) {
      issues.push('High API error rate detected');
    }
    if (result.services.notifications.deliveryRate < 95) {
      issues.push('Low notification delivery rate');
    }
    
    return issues;
  };

  const getPerformanceMetrics = () => {
    if (!result) return null;
    return {
      averageResponseTime: (
        result.services.database.responseTime +
        result.services.api.responseTime +
        result.services.notifications.responseTime
      ) / 3,
      totalUsers: result.services.database.metrics.totalUsers || 0,
      activeUsers: result.services.database.metrics.activeUsersToday || 0,
      apiUptime: result.services.api.uptime,
      errorRate: result.services.api.errorRate
    };
  };

  return {
    data: result,
    isLoading: false,
    error: result.overall.status === 'error' ? result.overall.error : null,
    healthScore: getOverallHealthScore(),
    criticalIssues: getCriticalIssues(),
    performanceMetrics: getPerformanceMetrics(),
    isHealthy: result.overall.status === 'healthy',
    isDegraded: result.overall.status === 'degraded',
    hasErrors: result.overall.status === 'error'
  };
}