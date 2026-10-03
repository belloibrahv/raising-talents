import { REPORT_NOTE_MAX, type ReportCategory } from '@rt/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { ChoiceGroup } from '../../shared/ui/ChoiceGroup';
import { FormMessage } from '../../shared/ui/FormMessage';
import { TextArea } from '../../shared/ui/TextArea';

export const REPORT_CATEGORIES: readonly ReportCategory[] = [
  'fake_or_impersonation',
  'inappropriate_content',
  'scam_or_harassment',
  'underage',
  'other',
];

/** A quiet link that opens a short form. The reported person never learns who sent it. */
export function ReportProfile({ handle }: { readonly handle: string }) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [missingCategory, setMissingCategory] = useState(false);
  const report = useMutation({
    mutationFn: (input: { category: ReportCategory; note: string }) =>
      api.call('reports.create', {
        body: {
          subject: { kind: 'talent', handle },
          category: input.category,
          ...(input.note.trim() ? { note: input.note.trim() } : {}),
        },
      }),
  });

  if (report.isSuccess) {
    return <FormMessage tone="success">{t('report.thanks')}</FormMessage>;
  }
  if (!open) {
    return (
      <Button
        variant="text"
        className="button--small"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('report.open')}
      </Button>
    );
  }
  return (
    <form
      className="card stack"
      aria-labelledby="report-heading"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!category) {
          setMissingCategory(true);
          return;
        }
        report.mutate({ category, note });
      }}
    >
      <h2 id="report-heading" className="field__label">
        {t('report.title')}
      </h2>
      <p className="field__hint">{t('report.body')}</p>
      <ChoiceGroup
        legend={t('report.category')}
        value={category}
        error={missingCategory ? t('report.chooseCategory') : undefined}
        onChange={(value) => {
          setCategory(value as ReportCategory);
          setMissingCategory(false);
        }}
        options={REPORT_CATEGORIES.map((value) => ({ value, label: t(`report.${value}`) }))}
      />
      <TextArea
        label={t('report.note')}
        hint={t('report.noteHint')}
        value={note}
        maxLength={REPORT_NOTE_MAX}
        rows={3}
        onChange={(event) => {
          setNote(event.target.value);
        }}
      />
      <FormMessage tone="error">{report.error ? errorMessage(report.error) : null}</FormMessage>
      <div className="row">
        <Button type="submit" className="button--small" loading={report.isPending}>
          {t('report.send')}
        </Button>
        <Button
          variant="text"
          className="button--small"
          onClick={() => {
            setOpen(false);
          }}
        >
          {t('report.cancel')}
        </Button>
      </div>
    </form>
  );
}
