import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonListProps {
  count?: number;
  className?: string;
  itemHeight?: number;
  showAvatar?: boolean;
  showActions?: boolean;
}

/**
 * Skeleton for list items
 */
export function SkeletonList({
  count = 5,
  className,
  itemHeight = 80,
  showAvatar = false,
  showActions = false,
}: SkeletonListProps) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-4 p-4 border rounded-lg"
          style={{ minHeight: `${itemHeight}px` }}
        >
          {showAvatar && (
            <Skeleton variant="circular" width={40} height={40} />
          )}
          <div className="flex-1 space-y-2">
            <Skeleton height={20} width="40%" variant="text" />
            <Skeleton height={16} width="70%" variant="text" />
            <Skeleton height={16} width="50%" variant="text" />
          </div>
          {showActions && (
            <div className="flex gap-2">
              <Skeleton height={32} width={80} variant="rectangular" />
              <Skeleton height={32} width={80} variant="rectangular" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
