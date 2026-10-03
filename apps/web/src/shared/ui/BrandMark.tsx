import { cn } from '@/lib/utils';

/** The app icon as a mark: a performer under a spotlight. Decorative; the name sits beside it. */
export function BrandMark({ className }: { readonly className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn('size-8 shrink-0 rounded-[22%]', className)}
    >
      <rect width="512" height="512" rx="112" fill="#1C1A3D" />
      <circle cx="256" cy="200" r="72" fill="#FFC93C" />
      <path
        d="M136 408c18-70 66-112 120-112s102 42 120 112"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="40"
        strokeLinecap="round"
      />
    </svg>
  );
}
