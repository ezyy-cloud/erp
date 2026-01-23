import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonUserCardProps {
  className?: string;
  showActions?: boolean;
}

/**
 * Skeleton for user card/list item
 * Matches the layout of UserListItem component
 */
export function SkeletonUserCard({
  className,
  showActions = true,
}: SkeletonUserCardProps) {
  return (
    <div
      className={cn('p-3 sm:p-4 border rounded-lg space-y-3', className)}
      aria-hidden="true"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton height={20} width="40%" variant="text" />
              <Skeleton height={16} width="60%" variant="text" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Skeleton height={24} width={80} variant="rectangular" />
              <Skeleton height={24} width={70} variant="rectangular" />
            </div>
          </div>
        </div>
        {showActions && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex gap-2">
              <Skeleton height={32} width={60} variant="rectangular" />
              <Skeleton height={32} width={60} variant="rectangular" />
            </div>
            <Skeleton height={32} width={120} variant="rectangular" />
            <Skeleton height={32} width={100} variant="rectangular" />
          </div>
        )}
      </div>
    </div>
  );
}
