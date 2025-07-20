import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export interface SystemHealth {
  components: {
    database: {
      status: 'healthy' | 'degraded' | 'down';
      metrics: {
        latency: number;
        errorRate: number;
        throughput: number;
      };
    };
    api: {
      status: 'healthy' | 'degraded' | 'down';
      metrics: {
        requestRate: number;
        errorRate: number;
        responseTime: number;
      };
    };
    notifications: {
      status: 'healthy' | 'degraded' | 'down';
      metrics: {
        deliveryRate: number;
        failureRate: number;
        queueSize: number;
      };
    };
  };
  timestamp: number;
}

export function useSystemHealth() {
  const result = useQuery(api.analytics.service.getSystemHealth);
  
  if (!result) {
    return { data: null as SystemHealth | null };
  }

  return {
    data: result as SystemHealth
  };
} 