import React from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  /** 0 / null = not rated. */
  value: number | null | undefined;
  /** Omit for a read-only display. Clicking the current value again clears it. */
  onChange?: (value: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

/** 1-5 star vendor rating - an interactive picker when `onChange` is given, otherwise a display. */
export const StarRating: React.FC<StarRatingProps> = ({ value, onChange, disabled, size = 'md' }) => {
  const current = value || 0;
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  const interactive = !!onChange && !disabled;

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={onChange ? 'radiogroup' : 'img'}
      aria-label={current ? `Rated ${current} out of 5` : 'Not rated'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= current;
        const star = <Star className={`${icon} ${filled ? 'fill-amber-400 text-amber-400' : 'text-gray-300 dark:text-gray-600'}`} />;
        if (!onChange) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === current}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            title={n === current ? 'Click again to clear the rating' : `${n} star${n === 1 ? '' : 's'}`}
            disabled={!interactive}
            onClick={() => onChange(n === current ? 0 : n)}
            className="p-0.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed dark:focus-visible:ring-violet-500"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
};
