import { MAX_SPECIALIZATIONS, type MyAgentProfile, type TaxonomyResponse } from '@rt/contracts';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { Button, buttonLink } from '../../shared/ui/Button';
import { ChoiceGroup } from '../../shared/ui/ChoiceGroup';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { fieldErrorsFrom } from '../auth/form-errors';
import { useMyAgentProfile, useTaxonomy, useUpdateAgentProfile } from './queries';

export function AgentOnboardingPage() {
  const profile = useMyAgentProfile();
  const taxonomy = useTaxonomy();
  // Owned here so the saved confirmation survives the form reloading the new version.
  const update = useUpdateAgentProfile();
  if (profile.isPending || taxonomy.isPending) return <PageSkeleton />;
  return (
    <Page
      title={t('onboarding.agent.title')}
      documentTitle={t('titles.agentOnboarding')}
      subtitle={t('onboarding.agent.body')}
    >
      {profile.isError || taxonomy.isError ? (
        <FormMessage tone="error">{errorMessage(profile.error ?? taxonomy.error)}</FormMessage>
      ) : (
        <AgentForm
          key={profile.data?.version ?? 0}
          profile={profile.data}
          taxonomy={taxonomy.data}
          update={update}
        />
      )}
    </Page>
  );
}

type Errors = Record<string, string>;

function AgentForm({
  profile,
  taxonomy,
  update,
}: {
  profile: MyAgentProfile | null;
  taxonomy: TaxonomyResponse;
  update: ReturnType<typeof useUpdateAgentProfile>;
}) {
  const [agencyName, setAgencyName] = useState(profile?.agencyName ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.jobTitle ?? '');
  const [specializations, setSpecializations] = useState<readonly string[]>(
    profile?.specializations.map((ref) => ref.slug) ?? [],
  );
  const [city, setCity] = useState(profile?.city?.slug ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    if (agencyName.trim().length < 2) found['agencyName'] = t('validation.nameShort');
    if (jobTitle.trim().length < 2) found['jobTitle'] = t('validation.nameShort');
    if (specializations.length === 0) found['specializationSlugs'] = t('validation.chooseOne');
    if (!city) found['citySlug'] = t('validation.chooseOne');
    if (website.trim() && !/^https:\/\/\S+\.\S+/.test(website.trim()))
      found['website'] = t('validation.websiteInvalid');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update.mutate(
      {
        agencyName: agencyName.trim(),
        jobTitle: jobTitle.trim(),
        specializationSlugs: [...specializations],
        citySlug: city,
        website: website.trim() || null,
      },
      {
        onError: (error) => {
          setErrors(fieldErrorsFrom(error));
        },
      },
    );
  };

  const saved = update.isSuccess && update.data.isComplete;
  return (
    <form ref={form} className="stack" onSubmit={submit} noValidate>
      <FormMessage tone="error">
        {update.error && !isApiError(update.error, 'VALIDATION_FAILED')
          ? isApiError(update.error, 'PRECONDITION_FAILED')
            ? t('onboarding.staleReloaded')
            : errorMessage(update.error)
          : null}
      </FormMessage>
      <TextField
        label={t('onboarding.agent.agencyName')}
        value={agencyName}
        onChange={(event) => {
          setAgencyName(event.target.value);
        }}
        error={errors['agencyName']}
        autoComplete="organization"
        maxLength={100}
        required
      />
      <TextField
        label={t('onboarding.agent.jobTitle')}
        hint={t('onboarding.agent.jobTitleHint')}
        value={jobTitle}
        onChange={(event) => {
          setJobTitle(event.target.value);
        }}
        error={errors['jobTitle']}
        autoComplete="organization-title"
        maxLength={60}
        required
      />
      <ChoiceGroup
        multiple
        layout="chips"
        legend={t('onboarding.agent.specializations')}
        hint={t('onboarding.agent.specializationsHint', { max: MAX_SPECIALIZATIONS })}
        max={MAX_SPECIALIZATIONS}
        value={specializations}
        onChange={setSpecializations}
        options={taxonomy.categories.map((entry) => ({ value: entry.slug, label: entry.name }))}
        error={errors['specializationSlugs']}
      />
      <Select
        label={t('onboarding.agent.city')}
        placeholder={t('onboarding.location.choose')}
        value={city}
        onChange={(event) => {
          setCity(event.target.value);
        }}
        options={taxonomy.cities.map((entry) => ({ value: entry.slug, label: entry.name }))}
        error={errors['citySlug']}
        required
      />
      <TextField
        label={t('onboarding.agent.website')}
        hint={t('onboarding.agent.websiteHint')}
        type="url"
        inputMode="url"
        value={website}
        onChange={(event) => {
          setWebsite(event.target.value);
        }}
        error={errors['website']}
        autoComplete="url"
        placeholder="https://"
      />
      {saved ? (
        <>
          <FormMessage tone="success">{t('onboarding.agent.done')}</FormMessage>
          <Link className={buttonLink('primary')} to="/home">
            {t('nav.home')}
          </Link>
        </>
      ) : (
        <Button type="submit" loading={update.isPending}>
          {t('onboarding.agent.submit')}
        </Button>
      )}
    </form>
  );
}
