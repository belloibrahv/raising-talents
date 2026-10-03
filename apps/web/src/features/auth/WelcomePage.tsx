import { Camera, Clapperboard, Medal, Mic, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { BrandMark } from '../../shared/ui/BrandMark';
import { Page } from '../../shared/ui/Page';

const DISCIPLINES = [
  { key: 'athletes', icon: Medal },
  { key: 'musicians', icon: Mic },
  { key: 'models', icon: Camera },
  { key: 'actors', icon: Clapperboard },
  { key: 'creators', icon: Sparkles },
] as const;

/** The stage: ink, a spotlight, and the two ways in. */
export function WelcomePage() {
  return (
    <div className="min-h-dvh bg-stage text-stage-foreground [background-image:radial-gradient(ellipse_70%_45%_at_50%_0%,rgb(255_201_60/0.28),transparent_70%)]">
      <Page
        title={t('welcome.headline')}
        documentTitle={t('common.appName')}
        subtitle={t('welcome.body')}
        className="flex min-h-dvh flex-col justify-center pb-10 [&_header_p]:text-lg [&_header_p]:text-stage-foreground/80"
        titleClassName="text-4xl leading-[1.05] sm:text-5xl"
        hero={
          <div className="flex items-center gap-3 font-display text-lg font-bold">
            <BrandMark className="size-12 ring-2 ring-spotlight/60" />
            {t('common.appName')}
          </div>
        }
      >
        <ul
          className="flex list-none flex-wrap gap-2 p-0"
          aria-label={t('welcome.disciplinesLabel')}
        >
          {DISCIPLINES.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full border border-stage-foreground/25 px-3 py-1.5 text-sm font-medium"
            >
              <Icon aria-hidden="true" className="size-4 text-spotlight" />
              {t(`welcome.disciplines.${key}`)}
            </li>
          ))}
        </ul>
        <nav className="mt-4 grid gap-3" aria-label={t('titles.welcome')}>
          <Link
            className={cn(buttonVariants({ variant: 'spotlight', size: 'lg' }), 'no-underline')}
            to="/sign-up"
          >
            {t('welcome.createAccount')}
          </Link>
          <Link
            className={cn(
              buttonVariants({ variant: 'outline', size: 'lg' }),
              'border-stage-foreground/60 bg-transparent text-stage-foreground no-underline hover:bg-stage-foreground/10',
            )}
            to="/sign-in"
          >
            {t('welcome.signIn')}
          </Link>
        </nav>
      </Page>
    </div>
  );
}
