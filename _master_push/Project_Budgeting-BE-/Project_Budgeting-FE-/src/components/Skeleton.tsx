import React from 'react';

interface SkeletonProps {
  variant?: 'text' | 'card' | 'row' | 'circle';
  count?: number;
  className?: string;
}

const VARIANT_STYLES: Record<NonNullable<SkeletonProps['variant']>, string> = {
  text: 'h-4 w-full rounded',
  card: 'h-24 w-full rounded-xl',
  row: 'h-12 w-full rounded-lg',
  circle: 'h-10 w-10 rounded-full',
};

export const Skeleton: React.FC<SkeletonProps> = ({ variant = 'text', count = 1, className = '' }) => (
  <div className="animate-pulse space-y-2" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className={`bg-gray-100 dark:bg-gray-800 ${VARIANT_STYLES[variant]} ${className}`} />
    ))}
  </div>
);
