import { cn } from '@/lib/utils';
import { t } from '../../i18n';

const bar = 'animate-pulse rounded-lg bg-muted motion-reduce:animate-none';

/**
 * The shape of a screen while its data or code loads, so the page does not jump and the
 * header stays put. Screen readers hear "Loading" once; the shapes are hidden from them.
 */
export function PageSkeleton({ variant = 'cards' }: { readonly variant?: 'cards' | 'profile' }) {
  return (
    <main id="main" className="flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-10 md:pb-16" aria-busy="true">
      <div role="status" className="sr-only">
        {t('common.loading')}
      </div>
      <div aria-hidden="true" className="mx-auto flex w-full max-w-xl flex-col gap-6">
        {variant === 'profile' ? (
          <>
            <div className={cn(bar, 'h-28 rounded-3xl sm:h-36')} />
            <div className={cn(bar, '-mt-16 ml-6 size-28 rounded-full ring-4 ring-background')} />
          </>
        ) : null}
        <div className="grid gap-3">
          <div className={cn(bar, 'h-9 w-2/3')} />
          <div className={cn(bar, 'h-5 w-full')} />
          <div className={cn(bar, 'h-5 w-4/5')} />
        </div>
        {[0, 1, 2].map((key) => (
          <div key={key} className="flex items-center gap-4 rounded-2xl border p-5">
            <div className={cn(bar, 'size-12 shrink-0 rounded-xl')} />
            <div className="grid flex-1 gap-2">
              <div className={cn(bar, 'h-5 w-1/2')} />
              <div className={cn(bar, 'h-4 w-5/6')} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
