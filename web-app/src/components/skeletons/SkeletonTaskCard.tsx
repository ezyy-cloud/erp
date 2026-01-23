import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonTaskCardProps {
  className?: string;
}

/**
 * Skeleton for task card/list item
 * Matches the layout of TaskListItem component
 */
export function SkeletonTaskCard({ className }: SkeletonTaskCardProps) {
  return (
    <div
      className={cn(
        'border rounded-lg border-l-4 p-4 space-y-4',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <Skeleton height={24} width="60%" variant="text" />
          <Skeleton height={16} width="40%" variant="text" />
        </div>
        <Skeleton height={28} width={100} variant="rectangular" />
      </div>
      
      <div className="space-y-2">
        <Skeleton height={16} width="100%" variant="text" />
        <Skeleton height={16} width="80%" variant="text" />
      </div>
      
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <Skeleton height={16} width={120} variant="text" />
          <Skeleton height={28} width={100} variant="rectangular" />
        </div>
        <Skeleton height={28} width={80} variant="rectangular" />
      </div>
    </div>
  );
}
