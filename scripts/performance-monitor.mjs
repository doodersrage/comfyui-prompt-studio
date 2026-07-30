/**
 * Performance monitoring script for ComfyUI Prompt Studio
 * This script helps monitor and optimize application performance
 */

// Performance monitoring utilities
export class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
  }

  // Measure function execution time
  measure(name, fn) {
    const start = performance.now();
    const result = fn();
    const end = performance.now();
    
    this.metrics.set(name, {
      duration: end - start,
      timestamp: Date.now()
    });
    
    console.log(`${name}: ${Math.round((end - start) * 100) / 100}ms`);
    return result;
  }

  // Get performance metrics
  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  // Reset metrics
  reset() {
    this.metrics.clear();
  }

  // Log summary
  logSummary() {
    console.log('\n=== Performance Summary ===');
    for (const [name, metric] of this.metrics) {
      console.log(`${name}: ${Math.round(metric.duration * 100) / 100}ms`);
    }
    console.log('==========================\n');
  }
}

// Usage example
export const performanceMonitor = new PerformanceMonitor();

// Export for use in other modules
export default performanceMonitor;