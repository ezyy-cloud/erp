import { Skeleton } from '../ui/skeleton';
import { SkeletonCard } from './SkeletonCard';
import { cn } from '@/lib/utils';

interface SkeletonDashboardProps {
  className?: string;
  showStats?: boolean;
  showCharts?: boolean;
  showRecentActivity?: boolean;
}

/**
 * Skeleton for dashboard layouts
 */
export function SkeletonDashboard({
  className,
  showStats = true,
  showCharts = false,
  showRecentActivity = true,
}: SkeletonDashboardProps) {
  return (
    <div className={cn('space-y-6', className)} aria-hidden="true">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton height={32} width="30%" variant="text" />
        <Skeleton height={16} width="50%" variant="text" />
      </div>

      {/* Stats Grid */}
      {showStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard
              key={i}
              showHeader={true}
              showContent={true}
              showFooter={false}
              lines={2}
            />
          ))}
        </div>
      )}

      {/* Charts Section */}
      {showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard showHeader={true} showContent={true} lines={8} />
          <SkeletonCard showHeader={true} showContent={true} lines={8} />
        </div>
      )}

      {/* Recent Activity */}
      {showRecentActivity && (
        <div className="space-y-4">
          <Skeleton height={24} width="25%" variant="text" />
          <SkeletonCard showHeader={false} showContent={true} lines={5} />
        </div>
      )}
    </div>
  );
}
