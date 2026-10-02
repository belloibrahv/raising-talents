import { useEffect, useRef, type ReactNode } from 'react';
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
  children,
}: PageProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const name = t('common.appName');
    document.title = documentTitle === name ? name : `${documentTitle ?? title} | ${name}`;
    heading.current?.focus();
  }, [title, documentTitle]);

  return (
    <main id="main" className={['page', className].filter(Boolean).join(' ')}>
      <div className="page__inner">
        {hero}
        <header className="page__header">
          <h1 ref={heading} tabIndex={-1} className={titleClassName}>
            {title}
          </h1>
          {subtitle ? <p className="page__subtitle">{subtitle}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}
