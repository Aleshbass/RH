import { log } from './logger'
import { trackCustomMetric } from './webVitals'

// Bundle performance monitoring utilities
export class BundlePerformanceMonitor {
  private static instance: BundlePerformanceMonitor
  private loadTimes: Map<string, number> = new Map()
  private chunkSizes: Map<string, number> = new Map()

  static getInstance(): BundlePerformanceMonitor {
    if (!BundlePerformanceMonitor.instance) {
      BundlePerformanceMonitor.instance = new BundlePerformanceMonitor()
    }
    return BundlePerformanceMonitor.instance
  }

  // Track chunk loading performance
  trackChunkLoad(chunkName: string, loadTime: number, size?: number): void {
    this.loadTimes.set(chunkName, loadTime)
    if (size) {
      this.chunkSizes.set(chunkName, size)
    }

    log.performanceMetric(`chunk-load-${chunkName}`, loadTime)
    trackCustomMetric(`chunk_load_time_${chunkName}`, loadTime)

    // Alert on slow chunk loading
    if (loadTime > 3000) {
      log.warn(`Slow chunk loading detected: ${chunkName}`, {
        action: 'slow_chunk_load',
        metadata: { chunkName, loadTime, size }
      })
    }
  }

  // Track route-based code splitting performance
  trackRouteLoad(route: string, loadTime: number): void {
    log.performanceMetric(`route-load-${route.replace(/\//g, '-')}`, loadTime)
    trackCustomMetric(`route_load_time`, loadTime)

    log.info(`Route loaded: ${route}`, {
      action: 'route_load',
      resource: route,
      duration: loadTime
    })
  }

  // Track lazy component loading
  trackLazyComponentLoad(componentName: string, loadTime: number): void {
    log.performanceMetric(`lazy-component-${componentName}`, loadTime)
    trackCustomMetric(`lazy_component_load_time`, loadTime)

    log.debug(`Lazy component loaded: ${componentName}`, {
      action: 'lazy_component_load',
      resource: componentName,
      duration: loadTime
    })
  }

  // Get performance summary
  getPerformanceSummary() {
    const summary = {
      totalChunks: this.loadTimes.size,
      averageLoadTime: this.calculateAverageLoadTime(),
      slowestChunk: this.getSlowestChunk(),
      totalBundleSize: this.calculateTotalSize(),
      recommendations: this.generateRecommendations()
    }

    log.info('Bundle performance summary generated', {
      action: 'bundle_performance_summary',
      metadata: summary
    })

    return summary
  }

  private calculateAverageLoadTime(): number {
    if (this.loadTimes.size === 0) return 0
    const total = Array.from(this.loadTimes.values()).reduce((sum, time) => sum + time, 0)
    return total / this.loadTimes.size
  }

  private getSlowestChunk(): { name: string; time: number } | null {
    if (this.loadTimes.size === 0) return null
    
    let slowest = { name: '', time: 0 }
    for (const [name, time] of this.loadTimes.entries()) {
      if (time > slowest.time) {
        slowest = { name, time }
      }
    }
    return slowest
  }

  private calculateTotalSize(): number {
    return Array.from(this.chunkSizes.values()).reduce((sum, size) => sum + size, 0)
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = []
    const averageTime = this.calculateAverageLoadTime()

    if (averageTime > 2000) {
      recommendations.push('Consider further code splitting for large chunks')
    }

    if (this.chunkSizes.size > 0) {
      const largeChunks = Array.from(this.chunkSizes.entries())
        .filter(([, size]) => size > 500000) // 500KB
        .map(([name]) => name)

      if (largeChunks.length > 0) {
        recommendations.push(`Large chunks detected: ${largeChunks.join(', ')}`)
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Bundle performance is optimal')
    }

    return recommendations
  }
}

// Initialize bundle performance monitoring
export const bundleMonitor = BundlePerformanceMonitor.getInstance()

// Performance observer for resource timing
export const initBundlePerformanceMonitoring = () => {
  if (typeof window === 'undefined' || !window.PerformanceObserver) return

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'resource' && entry.name.includes('_next/static/chunks/')) {
          const chunkName = entry.name.split('/').pop()?.split('.')[0] || 'unknown'
          const loadTime = (entry as PerformanceResourceTiming).responseEnd - entry.startTime
          const size = (entry as PerformanceResourceTiming).transferSize || 0

          bundleMonitor.trackChunkLoad(chunkName, loadTime, size)
        }
      }
    })

    observer.observe({ entryTypes: ['resource'] })

    log.info('Bundle performance monitoring initialized')
  } catch (error) {
    log.error('Failed to initialize bundle performance monitoring', { error: error as Error })
  }
}

// Navigation performance tracking
export const trackNavigationPerformance = () => {
  if (typeof window === 'undefined') return

  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        const navEntry = entry as PerformanceNavigationTiming
        
        bundleMonitor.trackRouteLoad(
          window.location.pathname,
          navEntry.loadEventEnd - navEntry.startTime
        )
      }
    }
  })

  try {
    observer.observe({ entryTypes: ['navigation'] })
  } catch (error) {
    log.error('Failed to track navigation performance', { error: error as Error })
  }
}
