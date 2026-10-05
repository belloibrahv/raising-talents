import type { MyTalentProfile } from '@rt/contracts';
import { Check, Copy, Globe, Lock, Share2 } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { useUpdateTalentProfile } from '../profile/queries';

/** The handle is for people reading the link; the code is what finds the talent (ADR-042). */
export const sharedLinkFor = (handle: string, code: string): string =>
  `${window.location.origin}/t/${handle}/${code}`;

/**
 * Off by default: a public link shows the profile to anyone on the internet, so the talent
 * turns it on themselves and can turn it off again at any time (ADR-042).
 */
export function ShareCard({ profile }: { readonly profile: MyTalentProfile }) {
  const update = useUpdateTalentProfile();
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const link = profile.shareCode ? sharedLinkFor(profile.handle, profile.shareCode) : '';
  const canShare = typeof navigator.share === 'function';

  const toggle = (publicLink: boolean) => {
    setCopied(null);
    update.mutate({ publicLink });
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs sm:p-6"
      aria-labelledby="share-heading"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-spotlight text-spotlight-foreground">
          {profile.publicLink && link ? (
            <Globe aria-hidden="true" className="size-5" />
          ) : (
            <Lock aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="grid flex-1 gap-1">
          <h2 id="share-heading" className="text-lg font-semibold">
            {t('share.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {profile.publicLink ? t('share.onBody') : t('share.offBody')}
          </p>
        </div>
      </div>
      <FormMessage tone="error">{update.error ? errorMessage(update.error) : null}</FormMessage>
      {profile.publicLink ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="share-link">
              {t('share.linkLabel')}
            </label>
            <input
              id="share-link"
              readOnly
              value={link}
              className="h-11 min-w-0 flex-1 rounded-full border bg-muted px-4 font-mono text-sm"
              onFocus={(event) => {
                event.target.select();
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-11"
                onClick={() => {
                  // Some browsers refuse without a secure context or permission: say so.
                  navigator.clipboard.writeText(link).then(
                    () => {
                      setCopied('yes');
                    },
                    () => {
                      setCopied('failed');
                    },
                  );
                }}
              >
                {copied === 'yes' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied === 'yes' ? t('share.copied') : t('share.copy')}
              </Button>
              {canShare ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-11"
                  onClick={() => {
                    void navigator
                      .share({ title: profile.displayName ?? '', text: t('share.text'), url: link })
                      .catch(() => undefined);
                  }}
                >
                  <Share2 aria-hidden="true" />
                  {t('share.share')}
                </Button>
              ) : null}
            </div>
          </div>
          <span className="sr-only" role="status">
            {copied === 'yes' ? t('share.copied') : ''}
          </span>
          <FormMessage tone="error">
            {copied === 'failed' ? t('share.copyFailed') : null}
          </FormMessage>
          <div>
            <Button
              variant="text"
              size="sm"
              loading={update.isPending}
              onClick={() => {
                toggle(false);
              }}
            >
              {t('share.turnOff')}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button
            loading={update.isPending}
            onClick={() => {
              toggle(true);
            }}
          >
            <Globe aria-hidden="true" />
            {t('share.turnOn')}
          </Button>
        </div>
      )}
    </section>
  );
}
