import pino from 'pino'

// Log levels for different environments
const LOG_LEVELS = {
  development: 'debug',
  production: 'info',
  test: 'warn'
} as const

// Create logger instance with appropriate configuration
const logger = pino({
  level: LOG_LEVELS[process.env.NODE_ENV as keyof typeof LOG_LEVELS] || 'info',
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      environment: process.env.NODE_ENV,
      service: 'rehabify-health'
    })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  })
})

// Structured logging interface
interface LogContext {
  userId?: string
  sessionId?: string
  requestId?: string
  action?: string
  resource?: string
  duration?: number
  error?: Error | string
  metadata?: Record<string, unknown>
  // Payment-related fields
  type?: string
  emailId?: string
  bankCode?: string
  accountName?: string
  subaccountCode?: string
  reference?: string
  event?: string
  data?: unknown
  tags?: Record<string, unknown>
  component?: string
  // Allow any additional custom properties
  [key: string]: unknown
}

// Enhanced logger with context
export class Logger {
  private static instance: Logger
  private logger = logger

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  private formatMessage(message: string, context?: LogContext): Record<string, unknown> {
    const baseLog = {
      message,
      timestamp: new Date().toISOString(),
      service: 'rehabify-health'
    }

    if (!context) return baseLog

    return {
      ...baseLog,
      ...(context.userId && { userId: context.userId }),
      ...(context.sessionId && { sessionId: context.sessionId }),
      ...(context.requestId && { requestId: context.requestId }),
      ...(context.action && { action: context.action }),
      ...(context.resource && { resource: context.resource }),
      ...(context.duration && { duration: context.duration }),
      ...(context.metadata && { metadata: context.metadata }),
      ...(context.error && {
        error: context.error instanceof Error
          ? { name: context.error.name, message: context.error.message, stack: context.error.stack }
          : context.error
      })
    }
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatMessage(message, context))
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.formatMessage(message, context))
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatMessage(message, context))
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(this.formatMessage(message, context))
  }

  // Specialized logging methods for common use cases
  userAction(action: string, userId: string, metadata?: Record<string, unknown>): void {
    this.info(`User action: ${action}`, {
      userId,
      action,
      metadata
    })
  }

  apiRequest(method: string, path: string, userId?: string, duration?: number): void {
    this.info(`API ${method} ${path}`, {
      userId,
      action: 'api_request',
      resource: path,
      duration,
      metadata: { method }
    })
  }

  databaseQuery(query: string, duration: number, userId?: string): void {
    this.debug('Database query executed', {
      userId,
      action: 'db_query',
      duration,
      metadata: { query: query.substring(0, 100) + (query.length > 100 ? '...' : '') }
    })
  }

  cacheOperation(operation: string, key: string, hit: boolean, duration?: number): void {
    this.debug(`Cache ${operation}: ${key}`, {
      action: 'cache_operation',
      resource: key,
      duration,
      metadata: { operation, hit }
    })
  }

  securityEvent(event: string, userId?: string, metadata?: Record<string, unknown>): void {
    this.warn(`Security event: ${event}`, {
      userId,
      action: 'security_event',
      metadata
    })
  }

  performanceMetric(metric: string, value: number, userId?: string): void {
    this.info(`Performance metric: ${metric}`, {
      userId,
      action: 'performance_metric',
      metadata: { metric, value }
    })
  }

  businessEvent(event: string, userId?: string, metadata?: Record<string, unknown>): void {
    this.info(`Business event: ${event}`, {
      userId,
      action: 'business_event',
      metadata
    })
  }
}

// Export singleton instance
export const log = Logger.getInstance()

// Export types for use in other modules
export type { LogContext }
