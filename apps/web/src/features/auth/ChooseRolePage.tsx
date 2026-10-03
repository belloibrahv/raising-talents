import type { SelectableRole } from '@rt/contracts';
import { useState, type SubmitEvent } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { useChooseRole } from './use-auth';

const OPTIONS: readonly { role: SelectableRole; title: string; body: string }[] = [
  { role: 'talent', title: t('chooseRole.talentTitle'), body: t('chooseRole.talentBody') },
  { role: 'agent', title: t('chooseRole.agentTitle'), body: t('chooseRole.agentBody') },
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
        <fieldset className="choices">
          <legend className="visually-hidden">{t('chooseRole.title')}</legend>
          {OPTIONS.map((option) => (
            <label key={option.role} className="choice">
              <input
                type="radio"
                name="role"
                value={option.role}
                checked={role === option.role}
                onChange={() => {
                  setRole(option.role);
                }}
              />
              <span>
                <span className="choice__title">{option.title}</span>
                <br />
                <span className="choice__body">{option.body}</span>
              </span>
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
