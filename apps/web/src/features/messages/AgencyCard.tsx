import type { Counterpart } from '@rt/contracts';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  ExternalLink,
  MapPin,
  ShieldAlert,
} from 'lucide-react';
import { t } from '../../i18n';

const monthYear = new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' });

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * What a talent needs to judge an agency before answering: is it verified, what does it
 * work in, and where can they check it for themselves.
 */
export function AgencyCard({ agent }: { readonly agent: Counterpart & { kind: 'agent' } }) {
  return (
    <section
      className="grid gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs"
      aria-labelledby="agency-heading"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-stage text-stage-foreground">
          <Building2 aria-hidden="true" className="size-6" />
        </span>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 id="agency-heading" className="text-lg font-semibold">
            {t('agency.about', { agency: agent.agencyName })}
          </h2>
          {agent.verified ? (
            <p className="m-0 inline-flex w-fit items-center gap-1 rounded-full bg-success-surface px-2.5 py-0.5 text-sm font-semibold text-success">
              <BadgeCheck aria-hidden="true" className="size-4" />
              {agent.verifiedAt
                ? t('agency.verifiedSince', { date: monthYear.format(new Date(agent.verifiedAt)) })
                : t('agency.verified')}
            </p>
          ) : (
            <p className="m-0 inline-flex w-fit items-center gap-1 rounded-full bg-destructive-surface px-2.5 py-0.5 text-sm font-semibold text-destructive">
              <ShieldAlert aria-hidden="true" className="size-4" />
              {t('agency.notVerified')}
            </p>
          )}
        </div>
      </div>
      <dl className="m-0 grid gap-3 text-sm sm:grid-cols-2 [&_dd]:m-0 [&_dt]:text-muted-foreground">
        {agent.jobTitle ? (
          <div>
            <dt>{t('agency.contact')}</dt>
            <dd className="font-medium">{agent.jobTitle}</dd>
          </div>
        ) : null}
        {agent.city ? (
          <div>
            <dt>{t('agency.based')}</dt>
            <dd className="inline-flex items-center gap-1 font-medium">
              <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
              {agent.city}
            </dd>
          </div>
        ) : null}
        {agent.specializations.length > 0 ? (
          <div className="sm:col-span-2">
            <dt>{t('agency.worksIn')}</dt>
            <dd>
              <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
                {agent.specializations.map((name) => (
                  <li key={name} className="rounded-full bg-secondary px-2.5 py-0.5 font-medium">
                    {name}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        {agent.website ? (
          <div>
            <dt>{t('agency.website')}</dt>
            <dd>
              <a
                href={agent.website}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1 font-medium"
              >
                {hostOf(agent.website)}
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{t('agency.opensNewTab')}</span>
              </a>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{t('agency.memberSince')}</dt>
          <dd className="inline-flex items-center gap-1 font-medium">
            <CalendarDays aria-hidden="true" className="size-4 text-muted-foreground" />
            {monthYear.format(new Date(agent.memberSince))}
          </dd>
        </div>
      </dl>
      <p className="m-0 rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t('agency.tip')}</p>
    </section>
  );
}
