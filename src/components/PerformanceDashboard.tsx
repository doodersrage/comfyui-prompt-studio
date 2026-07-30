import { useEffect, useState } from 'react';

const PerformanceDashboard = () => {
  const [metrics, setMetrics] = useState({
    loadTime: 0,
    memoryUsage: 0,
    bundleSize: 0,
  });

  useEffect(() => {
    // Collect performance metrics
    if (typeof window !== 'undefined') {
      const timing = performance.timing;
      const loadTime = timing.loadEventEnd - timing.navigationStart;

      setMetrics({
        loadTime,
        memoryUsage: Math.round(performance.memory?.usedJSHeapSize || 0 / 1048576),
        bundleSize: 0, // Will be calculated from build artifacts
      });
    }
  }, []);

  return (
    <div className="performance-dashboard">
      <div className="metric-card">
        <h3>Page Load Time</h3>
        <p>{metrics.loadTime}ms</p>
      </div>
      <div className="metric-card">
        <h3>Memory Usage</h3>
        <p>{metrics.memoryUsage}MB</p>
      </div>
    </div>
  );
};

export default PerformanceDashboard;
