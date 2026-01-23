import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonFormProps {
  fields?: number;
  className?: string;
  showTitle?: boolean;
  showActions?: boolean;
}

/**
 * Skeleton for form components
 */
export function SkeletonForm({
  fields = 4,
  className,
  showTitle = true,
  showActions = true,
}: SkeletonFormProps) {
  return (
    <div className={cn('space-y-6 p-6 border rounded-lg', className)} aria-hidden="true">
      {showTitle && (
        <div className="space-y-2 pb-4 border-b">
          <Skeleton height={24} width="40%" variant="text" />
          <Skeleton height={16} width="60%" variant="text" />
        </div>
      )}
      
      <div className="space-y-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton height={16} width="20%" variant="text" />
            <Skeleton height={40} width="100%" variant="rectangular" />
          </div>
        ))}
      </div>

      {showActions && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t">
          <Skeleton height={40} width={100} variant="rectangular" />
          <Skeleton height={40} width={100} variant="rectangular" />
        </div>
      )}
    </div>
  );
}
