import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';

interface PageProps {
  readonly title: string;
  /** What the browser tab says. Defaults to the heading. */
  readonly documentTitle?: string;
  readonly subtitle?: ReactNode;
  /** Shown above the heading, such as the welcome screen's spotlight. */
  readonly hero?: ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
  /** Forms and reading stay narrow; lists and queues use more of a wide screen. */
  readonly width?: 'narrow' | 'wide';
  readonly children: ReactNode;
}

/**
 * One screen. Moves focus to its heading when it opens, so screen reader users hear
 * where they are after every navigation, and names the browser tab after it.
 */
export function Page({
  title,
  documentTitle,
  subtitle,
  hero,
  className,
  titleClassName,
  width = 'narrow',
  children,
}: PageProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  // Before paint, so the screen never shows with focus still on the previous one.
  useLayoutEffect(() => {
    const name = t('common.appName');
    document.title = documentTitle === name ? name : `${documentTitle ?? title} | ${name}`;
    heading.current?.focus();
  }, [title, documentTitle]);

  return (
    <main id="main" className={cn('flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-10 md:pb-16', className)}>
      <div
        className={cn(
          'mx-auto flex w-full flex-col gap-6',
          width === 'wide' ? 'max-w-5xl' : 'max-w-xl',
        )}
      >
        {hero}
        <header className="grid gap-2">
          <h1
            ref={heading}
            tabIndex={-1}
            className={cn('text-3xl font-bold text-balance sm:text-4xl', titleClassName)}
          >
            {title}
          </h1>
          {subtitle ? (
            <p className="text-base text-pretty text-muted-foreground">{subtitle}</p>
          ) : null}
        </header>
        {children}
      </div>
    </main>
  );
}
