import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
  showHeader?: boolean;
}

/**
 * Skeleton for table components
 */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
  showHeader = true,
}: SkeletonTableProps) {
  return (
    <div className={cn('w-full', className)} aria-hidden="true">
      {showHeader && (
        <div className="flex gap-4 pb-3 mb-3 border-b">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} height={20} width="100%" variant="text" />
          ))}
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="flex gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <Skeleton
                key={colIndex}
                height={20}
                width="100%"
                variant="text"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
