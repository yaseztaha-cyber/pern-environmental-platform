interface SkeletonProps {
  className?: string;
  lines?: number;
  variant?: 'text' | 'rect' | 'circle';
}

export function Skeleton({ className = '', lines = 1, variant = 'text' }: SkeletonProps) {
  const base = 'animate-pulse bg-[var(--surface)] rounded';
  if (variant === 'circle') return <div className={`${base} w-10 h-10 rounded-full ${className}`} />;
  if (variant === 'rect') return <div className={`${base} h-40 w-full ${className}`} />;
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`${base} h-3 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid md:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton variant="circle" className="w-10 h-10" />
            <Skeleton lines={2} className="flex-1" />
          </div>
          <Skeleton lines={3} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`flex-1 ${j === 0 ? 'w-1/4' : ''}`} lines={1} />
          ))}
        </div>
      ))}
    </div>
  );
}
