import { REPORT_NOTE_MAX, type CreateReport, type ReportCategory } from '@rt/contracts';
import { useMutation } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
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

/** A talent's public profile. */
export function ReportProfile({ handle }: { readonly handle: string }) {
  return <ReportForm subject={{ kind: 'talent', handle }} about="profile" />;
}

/** The other person in a conversation (ADR-039). */
export function ReportConversation({ conversationId }: { readonly conversationId: string }) {
  return <ReportForm subject={{ kind: 'conversation', conversationId }} about="conversation" />;
}

/** A quiet link that opens a short form. The reported person never learns who sent it. */
function ReportForm({
  subject,
  about,
}: {
  readonly subject: CreateReport['subject'];
  readonly about: 'profile' | 'conversation';
}) {
  const copy =
    about === 'profile'
      ? { open: t('report.open'), title: t('report.title'), thanks: t('report.thanks') }
      : {
          open: t('report.conversationOpen'),
          title: t('report.conversationTitle'),
          thanks: t('report.conversationThanks'),
        };
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');
  const [missingCategory, setMissingCategory] = useState(false);
  const report = useMutation({
    mutationFn: (input: { category: ReportCategory; note: string }) =>
      api.call('reports.create', {
        body: {
          subject,
          category: input.category,
          ...(input.note.trim() ? { note: input.note.trim() } : {}),
        },
      }),
  });

  if (report.isSuccess) {
    return <FormMessage tone="success">{copy.thanks}</FormMessage>;
  }
  if (!open) {
    return (
      <Button
        variant="quiet"
        size="sm"
        className="self-start text-muted-foreground"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Flag aria-hidden="true" />
        {copy.open}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-5 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
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
      <h2 id="report-heading" className="text-base font-semibold">
        {copy.title}
      </h2>
      <p className="text-sm text-muted-foreground">
        {about === 'profile' ? t('report.body') : t('report.conversationBody')}
      </p>
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
        <Button type="submit" size="sm" loading={report.isPending}>
          {t('report.send')}
        </Button>
        <Button
          variant="text"
          size="sm"
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
