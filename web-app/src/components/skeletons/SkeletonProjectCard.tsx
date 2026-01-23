import { Skeleton } from '../ui/skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProjectCardProps {
  className?: string;
}

/**
 * Skeleton for project card
 * Matches the layout of ProjectListItem component
 */
export function SkeletonProjectCard({ className }: SkeletonProjectCardProps) {
  return (
    <div
      className={cn(
        'h-full flex flex-col border rounded-lg p-6',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <Skeleton height={24} width="70%" variant="text" />
        <Skeleton height={28} width={100} variant="rectangular" />
      </div>
      
      <div className="flex-1 space-y-2 mb-4">
        <Skeleton height={16} width="100%" variant="text" />
        <Skeleton height={16} width="100%" variant="text" />
        <Skeleton height={16} width="60%" variant="text" />
      </div>
      
      <div className="mt-auto">
        <Skeleton height={14} width="40%" variant="text" />
      </div>
    </div>
  );
}
