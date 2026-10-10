import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app icon as a mark: a person and a spark on the brand gradient. Decorative; the name
 * sits beside it. Keep in step with public/favicon.svg, which the icons are rendered from.
 */
export function BrandMark({ className }: { readonly className?: string }) {
  const gradient = useId();
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn('size-8 shrink-0 rounded-[22%]', className)}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset=".55" stopColor="#DB2777" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill={`url(#${gradient})`} />
      <circle cx="240" cy="212" r="68" fill="#FFFFFF" />
      <path
        d="M124 412c18-70 64-110 116-110s98 40 116 110"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="40"
        strokeLinecap="round"
      />
      <path
        d="M392 74c7 34 20 47 54 54-34 7-47 20-54 54-7-34-20-47-54-54 34-7 47-20 54-54z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
