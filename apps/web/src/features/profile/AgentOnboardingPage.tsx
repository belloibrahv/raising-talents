import {
  AGENT_BIO_MAX,
  MAX_SPECIALIZATIONS,
  webAddressSchema,
  withHttps,
  type MyAgentProfile,
  type RosterStatus,
  type TaxonomyResponse,
} from '@rt/contracts';
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
import { TextArea } from '../../shared/ui/TextArea';
import { TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { AgentPhoto } from '../agents/AgentPhoto';
import { fieldErrorsFrom } from '../auth/form-errors';
import { categoryIcon } from './category-icons';
import { PlaceFields, startingPlace, type Place } from './PlaceFields';
import { useMyAgentProfile, useTaxonomy, useUpdateAgentProfile } from './queries';

export function AgentOnboardingPage() {
  const profile = useMyAgentProfile();
  const taxonomy = useTaxonomy();
  // Owned here so the saved confirmation survives the form reloading the new version.
  const update = useUpdateAgentProfile();
  // The form starts again from the server's copy only when that copy replaced what was being
  // edited. A new photo also changes the version, and must not wipe what is being typed.
  const [reloads, setReloads] = useState(0);
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
        <>
          {profile.data ? <AgentPhoto profile={profile.data} /> : null}
          <AgentForm
            key={reloads}
            profile={profile.data}
            taxonomy={taxonomy.data}
            update={update}
            onStale={() => {
              setReloads((count) => count + 1);
            }}
          />
        </>
      )}
    </Page>
  );
}

type Errors = Record<string, string>;

function AgentForm({
  profile,
  taxonomy,
  update,
  onStale,
}: {
  profile: MyAgentProfile | null;
  taxonomy: TaxonomyResponse;
  update: ReturnType<typeof useUpdateAgentProfile>;
  onStale: () => void;
}) {
  const [agencyName, setAgencyName] = useState(profile?.agencyName ?? '');
  const [jobTitle, setJobTitle] = useState(profile?.jobTitle ?? '');
  const [specializations, setSpecializations] = useState<readonly string[]>(
    profile?.specializations.map((ref) => ref.slug) ?? [],
  );
  const [place, setPlace] = useState<Place>(() =>
    startingPlace(profile?.city ?? null, taxonomy.countries),
  );
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [roster, setRoster] = useState<RosterStatus | 'unset'>(profile?.rosterStatus ?? 'unset');
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    if (agencyName.trim().length < 2) found['agencyName'] = t('validation.nameShort');
    if (jobTitle.trim().length < 2) found['jobTitle'] = t('validation.nameShort');
    if (specializations.length === 0) found['specializationSlugs'] = t('validation.chooseOne');
    if (!place.citySlug) found['citySlug'] = t('validation.chooseOne');
    if (website.trim() && !webAddressSchema(200).safeParse(website).success)
      found['website'] = t('validation.websiteInvalid');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update.mutate(
      {
        agencyName: agencyName.trim(),
        jobTitle: jobTitle.trim(),
        specializationSlugs: [...specializations],
        citySlug: place.citySlug,
        website: website.trim() ? withHttps(website) : null,
        bio: bio.trim(),
        rosterStatus: roster === 'unset' ? null : roster,
      },
      {
        onError: (error) => {
          setErrors(fieldErrorsFrom(error));
          // The hook has already fetched the newer copy: show it.
          if (isApiError(error, 'PRECONDITION_FAILED')) onStale();
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
        layout="tiles"
        legend={t('onboarding.agent.specializations')}
        hint={t('onboarding.agent.specializationsHint', { max: MAX_SPECIALIZATIONS })}
        max={MAX_SPECIALIZATIONS}
        value={specializations}
        onChange={setSpecializations}
        options={taxonomy.categories.map((entry) => ({
          value: entry.slug,
          label: entry.name,
          icon: categoryIcon(entry.slug),
        }))}
        error={errors['specializationSlugs']}
      />
      <PlaceFields
        countries={taxonomy.countries}
        value={place}
        onChange={setPlace}
        cityError={errors['citySlug']}
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
        placeholder="www.youragency.com"
      />
      <ChoiceGroup
        layout="chips"
        legend={t('onboarding.agent.roster')}
        hint={t('onboarding.agent.rosterHint')}
        value={roster}
        onChange={(value) => {
          setRoster(value as RosterStatus | 'unset');
        }}
        options={[
          { value: 'open', label: t('agents.roster.open') },
          { value: 'full', label: t('agents.roster.full') },
          { value: 'unset', label: t('onboarding.agent.rosterUnset') },
        ]}
      />
      <TextArea
        label={t('onboarding.agent.bio')}
        hint={t('onboarding.agent.bioHint')}
        value={bio}
        onChange={(event) => {
          setBio(event.target.value);
        }}
        error={errors['bio']}
        maxLength={AGENT_BIO_MAX}
        rows={6}
      />
      {saved ? (
        <>
          <FormMessage tone="success">{t('onboarding.agent.done')}</FormMessage>
          <Link className={buttonLink('primary')} to="/home">
            {t('nav.home')}
          </Link>
          {profile ? (
            <Link className={buttonLink('secondary')} to={`/agents/${profile.userId}`}>
              {t('onboarding.agent.viewPage')}
            </Link>
          ) : null}
        </>
      ) : (
        <Button
          type="submit"
          loading={update.isPending}
          className="sticky bottom-[calc(1rem+env(safe-area-inset-bottom))] z-10 shadow-lg shadow-primary/20"
        >
          {t('onboarding.agent.submit')}
        </Button>
      )}
    </form>
  );
}
