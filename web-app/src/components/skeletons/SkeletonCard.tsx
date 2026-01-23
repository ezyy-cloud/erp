import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
  showHeader?: boolean;
  showContent?: boolean;
  showFooter?: boolean;
  lines?: number;
}

/**
 * Skeleton for Card components
 */
export function SkeletonCard({
  className,
  showHeader = true,
  showContent = true,
  showFooter = false,
  lines = 3,
}: SkeletonCardProps) {
  return (
    <div
      className={cn(
        'border rounded-lg p-4 space-y-4 bg-card',
        className
      )}
      aria-hidden="true"
    >
      {showHeader && (
        <div className="space-y-2">
          <Skeleton height={24} width="60%" variant="text" />
          <Skeleton height={16} width="40%" variant="text" />
        </div>
      )}
      {showContent && (
        <div className="space-y-2">
          <Skeleton lines={lines} height={16} variant="text" />
        </div>
      )}
      {showFooter && (
        <div className="flex items-center justify-between pt-2">
          <Skeleton height={16} width="30%" variant="text" />
          <Skeleton height={32} width={80} variant="rectangular" />
        </div>
      )}
    </div>
  );
}
