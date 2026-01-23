/**
 * Performance monitoring utilities
 * Provides lightweight performance tracking without external dependencies
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 100;

  /**
   * Measure execution time of a function
   */
  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    try {
      const result = fn();
      const end = performance.now();
      this.recordMetric(name, end - start);
      return result;
    } catch (error) {
      const end = performance.now();
      this.recordMetric(`${name} (error)`, end - start);
      throw error;
    }
  }

  /**
   * Measure execution time of an async function
   */
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const end = performance.now();
      this.recordMetric(name, end - start);
      return result;
    } catch (error) {
      const end = performance.now();
      this.recordMetric(`${name} (error)`, end - start);
      throw error;
    }
  }

  /**
   * Record a custom metric
   */
  recordMetric(name: string, value: number) {
    this.metrics.push({
      name,
      value,
      timestamp: Date.now(),
    });

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log slow operations in development
    if (import.meta.env.DEV && value > 1000) {
      console.warn(`[Performance] Slow operation detected: ${name} took ${value.toFixed(2)}ms`);
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.name === name);
  }

  /**
   * Get average time for a metric
   */
  getAverageTime(name: string): number {
    const namedMetrics = this.getMetricsByName(name);
    if (namedMetrics.length === 0) return 0;
    const sum = namedMetrics.reduce((acc, m) => acc + m.value, 0);
    return sum / namedMetrics.length;
  }

  /**
   * Clear all metrics
   */
  clear() {
    this.metrics = [];
  }

  /**
   * Report metrics to console (for debugging)
   */
  report() {
    if (this.metrics.length === 0) {
      console.log('[Performance] No metrics recorded');
      return;
    }

    const grouped = new Map<string, number[]>();
    this.metrics.forEach((m) => {
      if (!grouped.has(m.name)) {
        grouped.set(m.name, []);
      }
      grouped.get(m.name)!.push(m.value);
    });

    console.group('[Performance Report]');
    grouped.forEach((values, name) => {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      console.log(`${name}: avg ${avg.toFixed(2)}ms, min ${min.toFixed(2)}ms, max ${max.toFixed(2)}ms (${values.length} calls)`);
    });
    console.groupEnd();
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Measure React component render time
 */
export function measureRender<T>(componentName: string, renderFn: () => T): T {
  return performanceMonitor.measure(`render:${componentName}`, renderFn);
}

/**
 * Measure async operation (e.g., API call)
 */
export async function measureAsync<T>(
  operationName: string,
  fn: () => Promise<T>
): Promise<T> {
  return performanceMonitor.measureAsync(operationName, fn);
}

/**
 * Measure synchronous operation
 */
export function measure<T>(operationName: string, fn: () => T): T {
  return performanceMonitor.measure(operationName, fn);
}

/**
 * Record a custom performance metric
 */
export function recordMetric(name: string, value: number) {
  performanceMonitor.recordMetric(name, value);
}

/**
 * Get performance report
 */
export function getPerformanceReport() {
  return performanceMonitor.report();
}
