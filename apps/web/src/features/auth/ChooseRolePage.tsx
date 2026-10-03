import type { SelectableRole } from '@rt/contracts';
import { Binoculars, Star, type LucideIcon } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { useChooseRole } from './use-auth';

const OPTIONS: readonly { role: SelectableRole; title: string; body: string; icon: LucideIcon }[] =
  [
    {
      role: 'talent',
      title: t('chooseRole.talentTitle'),
      body: t('chooseRole.talentBody'),
      icon: Star,
    },
    {
      role: 'agent',
      title: t('chooseRole.agentTitle'),
      body: t('chooseRole.agentBody'),
      icon: Binoculars,
    },
  ];

export function ChooseRolePage() {
  const chooseRole = useChooseRole();
  const [role, setRole] = useState<SelectableRole | null>(null);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (role) chooseRole.mutate(role);
  };

  return (
    <Page
      title={t('chooseRole.title')}
      documentTitle={t('titles.chooseRole')}
      subtitle={t('chooseRole.body')}
    >
      <form className="stack" onSubmit={submit}>
        <FormMessage tone="error">
          {chooseRole.error ? errorMessage(chooseRole.error) : null}
        </FormMessage>
        <fieldset className="m-0 grid gap-3 border-0 p-0">
          <legend className="sr-only">{t('chooseRole.title')}</legend>
          {OPTIONS.map(({ role: value, title, body, icon: Icon }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-4 rounded-2xl border-2 border-border bg-card p-5 transition-colors hover:border-input has-checked:border-primary has-checked:bg-accent has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-spotlight text-spotlight-foreground">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span className="grid flex-1 gap-1">
                <span className="text-lg font-semibold">{title}</span>
                <span className="text-sm text-muted-foreground">{body}</span>
              </span>
              <input
                type="radio"
                name="role"
                value={value}
                checked={role === value}
                className="mt-1 size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-input bg-background transition-all checked:border-[6px] checked:border-primary focus-visible:outline-none"
                onChange={() => {
                  setRole(value);
                }}
              />
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={!role} loading={chooseRole.isPending}>
          {t('chooseRole.submit')}
        </Button>
      </form>
    </Page>
  );
}
