import { cn } from '@/lib/utils';

/**
 * Base Skeleton Component
 * 
 * Provides a shimmer effect for loading states.
 * Respects prefers-reduced-motion for accessibility.
 */
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Width of the skeleton
   * Can be a number (pixels), percentage string, or CSS value
   */
  width?: string | number;
  /**
   * Height of the skeleton
   * Can be a number (pixels), percentage string, or CSS value
   */
  height?: string | number;
  /**
   * Shape of the skeleton
   */
  variant?: 'rectangular' | 'circular' | 'text';
  /**
   * Number of lines for text variant
   */
  lines?: number;
  /**
   * Custom className
   */
  className?: string;
}

export function Skeleton({
  width,
  height,
  variant = 'rectangular',
  lines = 1,
  className,
  style,
  ...props
}: SkeletonProps) {
  const baseStyles: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    ...style,
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'skeleton-shimmer rounded',
              i === lines - 1 ? 'w-3/4' : 'w-full'
            )}
            style={{
              height: height ?? '1rem',
              ...(i === 0 && baseStyles),
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  const shapeClass =
    variant === 'circular'
      ? 'rounded-full'
      : variant === 'text'
      ? 'rounded'
      : 'rounded';

  return (
    <div
      className={cn('skeleton-shimmer', shapeClass, className)}
      style={baseStyles}
      aria-hidden="true"
      {...props}
    />
  );
}
