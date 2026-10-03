import {
  BIO_MAX,
  BIO_MIN_FOR_COMPLETE,
  DISPLAY_NAME_MAX,
  MAX_SKILLS,
  MAX_SUBCATEGORIES,
  type Gender,
  type MyTalentProfile,
  type TaxonomyResponse,
  type UpdateTalentProfileRequest,
} from '@rt/contracts';
import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { Button, buttonLink } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Checkbox';
import { ChoiceGroup } from '../../shared/ui/ChoiceGroup';
import { FormMessage } from '../../shared/ui/FormMessage';
import { FullScreenStatus } from '../../shared/ui/FullScreenStatus';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { TextArea } from '../../shared/ui/TextArea';
import { TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { fieldErrorsFrom } from '../auth/form-errors';
import { AvatarStep } from './AvatarStep';
import { useMyTalentProfile, useTaxonomy, useUpdateTalentProfile } from './queries';
import {
  firstOpenStep,
  isTalentStep,
  nextStep,
  previousStep,
  TALENT_STEPS,
  type TalentStep,
} from './steps';
import { Progress } from '@/components/ui/progress';

type Errors = Record<string, string>;

/** Routes /onboarding/talent to the step to resume, and renders /onboarding/talent/:step. */
export function TalentOnboardingPage() {
  const { step } = useParams();
  const profile = useMyTalentProfile();
  const taxonomy = useTaxonomy();

  if (profile.isPending || taxonomy.isPending) return <FullScreenStatus />;
  if (profile.isError || taxonomy.isError) {
    return (
      <Page title={t('titles.talentOnboarding')}>
        <FormMessage tone="error">{errorMessage(profile.error ?? taxonomy.error)}</FormMessage>
      </Page>
    );
  }
  if (!isTalentStep(step)) {
    return <Navigate to={`/onboarding/talent/${firstOpenStep(profile.data) ?? 'about'}`} replace />;
  }
  // Each later step needs a profile; the first save creates it.
  if (!profile.data && step !== 'about') return <Navigate to="/onboarding/talent/about" replace />;
  return <StepScreen step={step} profile={profile.data} taxonomy={taxonomy.data} />;
}

interface StepProps {
  readonly step: TalentStep;
  readonly profile: MyTalentProfile | null;
  readonly taxonomy: TaxonomyResponse;
}

const STEP_TITLE: Record<TalentStep, string> = {
  about: t('onboarding.about.title'),
  discipline: t('onboarding.discipline.title'),
  location: t('onboarding.location.title'),
  story: t('onboarding.story.title'),
  photo: t('onboarding.photo.title'),
};

const STEP_BODY: Record<TalentStep, string> = {
  about: t('onboarding.about.body'),
  discipline: t('onboarding.discipline.body'),
  location: t('onboarding.location.body'),
  story: t('onboarding.story.body'),
  photo: t('onboarding.photo.body'),
};

type ProfileUpdate = ReturnType<typeof useUpdateTalentProfile>;

function StepScreen({ step, profile, taxonomy }: StepProps) {
  const navigate = useNavigate();
  // Owned here, not by the step form: the form is recreated when the saved profile changes,
  // and the outcome of the save (such as "changed on another device") must survive that.
  const update = useUpdateTalentProfile();
  const { reset } = update;
  useEffect(() => {
    reset();
  }, [step, reset]);
  const position = TALENT_STEPS.indexOf(step) + 1;
  const back = previousStep(step);
  const goNext = () => {
    const next = nextStep(step);
    void navigate(next ? `/onboarding/talent/${next}` : '/home');
  };

  return (
    <Page
      title={STEP_TITLE[step]}
      documentTitle={`${STEP_TITLE[step]}, ${t('onboarding.stepOf', { current: position, total: TALENT_STEPS.length })}`}
      subtitle={STEP_BODY[step]}
      hero={
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-muted-foreground">
            {t('onboarding.stepOf', { current: position, total: TALENT_STEPS.length })}
          </p>
          <Progress
            aria-label={t('titles.talentOnboarding')}
            value={position}
            max={TALENT_STEPS.length}
          />
        </div>
      }
    >
      {/* key: a fresh form when the saved profile changes underneath it (another device). */}
      {step === 'about' ? (
        <AboutStep key={profile?.version ?? 0} profile={profile} update={update} onSaved={goNext} />
      ) : null}
      {step === 'discipline' && profile ? (
        <DisciplineStep
          key={profile.version}
          profile={profile}
          taxonomy={taxonomy}
          update={update}
          onSaved={goNext}
        />
      ) : null}
      {step === 'location' && profile ? (
        <LocationStep
          key={profile.version}
          profile={profile}
          taxonomy={taxonomy}
          update={update}
          onSaved={goNext}
        />
      ) : null}
      {step === 'story' && profile ? (
        <StoryStep key={profile.version} profile={profile} update={update} onSaved={goNext} />
      ) : null}
      {step === 'photo' && profile ? <AvatarStep profile={profile} /> : null}
      {back ? (
        <Link className={buttonLink('text')} to={`/onboarding/talent/${back}`}>
          {t('onboarding.back')}
        </Link>
      ) : null}
    </Page>
  );
}

/** Saves a patch and moves on; shows field problems from the API against their fields. */
function useStepSave(update: ProfileUpdate, onSaved: () => void) {
  const [errors, setErrors] = useState<Errors>({});
  const save = (patch: UpdateTalentProfileRequest, found: Errors = {}) => {
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update.mutate(patch, {
      onSuccess: onSaved,
      onError: (error) => {
        const fields: Errors = fieldErrorsFrom(error);
        if (isApiError(error, 'HANDLE_TAKEN') || isApiError(error, 'HANDLE_INVALID')) {
          fields['handle'] = errorMessage(error);
        }
        setErrors(fields);
      },
    });
  };
  const fieldCodes = ['HANDLE_TAKEN', 'HANDLE_INVALID', 'VALIDATION_FAILED'] as const;
  const formError =
    update.error && !fieldCodes.some((code) => isApiError(update.error, code))
      ? isApiError(update.error, 'PRECONDITION_FAILED')
        ? t('onboarding.staleReloaded')
        : errorMessage(update.error)
      : null;
  return { save, errors, pending: update.isPending, formError };
}

function AboutStep({
  profile,
  update,
  onSaved,
}: {
  profile: MyTalentProfile | null;
  update: ProfileUpdate;
  onSaved: () => void;
}) {
  const { save, errors, pending, formError } = useStepSave(update, onSaved);
  const form = useFocusFirstError(errors);
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [handle, setHandle] = useState(profile?.handle ?? '');
  const [gender, setGender] = useState<Gender | ''>(profile?.gender ?? '');
  const [genderSearchable, setGenderSearchable] = useState(profile?.genderSearchable ?? false);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    if (displayName.trim().length < 2) found['displayName'] = t('validation.nameShort');
    const patch: UpdateTalentProfileRequest = {
      displayName: displayName.trim(),
      gender: gender || null,
      genderSearchable: gender ? genderSearchable : false,
      // The API suggests a username on the first save; only send one the person typed.
      ...(handle.trim() && handle.trim() !== profile?.handle ? { handle: handle.trim() } : {}),
    };
    save(patch, found);
  };

  return (
    <form ref={form} className="stack" onSubmit={submit} noValidate>
      <FormMessage tone="error">{formError}</FormMessage>
      <TextField
        label={t('onboarding.about.displayName')}
        hint={t('onboarding.about.displayNameHint')}
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
        }}
        error={errors['displayName']}
        autoComplete="name"
        maxLength={DISPLAY_NAME_MAX}
        required
      />
      {profile ? (
        <TextField
          label={t('onboarding.about.handle')}
          hint={t('onboarding.about.handleHint')}
          value={handle}
          onChange={(event) => {
            setHandle(event.target.value.toLowerCase());
          }}
          error={errors['handle']}
          autoCapitalize="none"
          autoComplete="username"
          spellCheck={false}
        />
      ) : null}
      <ChoiceGroup
        legend={t('onboarding.about.gender')}
        layout="chips"
        value={gender || 'none'}
        onChange={(value) => {
          setGender(value === 'none' ? '' : (value as Gender));
        }}
        options={[
          { value: 'none', label: t('onboarding.about.genderNone') },
          { value: 'female', label: t('onboarding.about.genderFemale') },
          { value: 'male', label: t('onboarding.about.genderMale') },
          { value: 'non_binary', label: t('onboarding.about.genderNonBinary') },
        ]}
      />
      {gender ? (
        <div className="flex flex-col gap-1.5">
          <Checkbox
            label={t('onboarding.about.genderSearchable')}
            checked={genderSearchable}
            onChange={(event) => {
              setGenderSearchable(event.target.checked);
            }}
          />
          <p className="text-sm text-muted-foreground">
            {t('onboarding.about.genderSearchableHint')}
          </p>
        </div>
      ) : null}
      <Button type="submit" loading={pending}>
        {t('onboarding.save')}
      </Button>
    </form>
  );
}

function DisciplineStep({
  profile,
  taxonomy,
  update,
  onSaved,
}: {
  profile: MyTalentProfile;
  taxonomy: TaxonomyResponse;
  update: ProfileUpdate;
  onSaved: () => void;
}) {
  const { save, errors, pending, formError } = useStepSave(update, onSaved);
  const form = useFocusFirstError(errors);
  const [category, setCategory] = useState<string | null>(profile.category?.slug ?? null);
  const [subcategories, setSubcategories] = useState<readonly string[]>(
    profile.subcategories.map((ref) => ref.slug),
  );
  const [skills, setSkills] = useState<readonly string[]>(profile.skills.map((ref) => ref.slug));
  const chosen = taxonomy.categories.find((entry) => entry.slug === category);
  const skillOptions = taxonomy.skills.filter(
    (skill) => skill.categorySlug === null || skill.categorySlug === category,
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    if (!category) found['category'] = t('validation.chooseOne');
    else if (subcategories.length === 0) found['subcategories'] = t('validation.chooseOne');
    save(
      {
        ...(category ? { categorySlug: category } : {}),
        subcategorySlugs: [...subcategories],
        skillSlugs: skills.filter((slug) => skillOptions.some((skill) => skill.slug === slug)),
      },
      found,
    );
  };

  return (
    <form ref={form} className="stack" onSubmit={submit} noValidate>
      <FormMessage tone="error">{formError}</FormMessage>
      <ChoiceGroup
        legend={t('onboarding.discipline.category')}
        value={category}
        onChange={(value) => {
          if (value !== category) setSubcategories([]);
          setCategory(value);
        }}
        options={taxonomy.categories.map((entry) => ({ value: entry.slug, label: entry.name }))}
        error={errors['category']}
      />
      {chosen ? (
        <ChoiceGroup
          multiple
          layout="chips"
          legend={t('onboarding.discipline.subcategories')}
          hint={t('onboarding.discipline.subcategoriesHint', { max: MAX_SUBCATEGORIES })}
          max={MAX_SUBCATEGORIES}
          value={subcategories}
          onChange={setSubcategories}
          options={chosen.subcategories.map((entry) => ({ value: entry.slug, label: entry.name }))}
          error={errors['subcategories']}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t('onboarding.discipline.pickCategoryFirst')}
        </p>
      )}
      {chosen && skillOptions.length > 0 ? (
        <ChoiceGroup
          multiple
          layout="chips"
          legend={t('onboarding.discipline.skills')}
          hint={t('onboarding.discipline.skillsHint', { max: MAX_SKILLS })}
          max={MAX_SKILLS}
          value={skills}
          onChange={setSkills}
          options={skillOptions.map((entry) => ({ value: entry.slug, label: entry.name }))}
        />
      ) : null}
      <Button type="submit" loading={pending}>
        {t('onboarding.save')}
      </Button>
    </form>
  );
}

function LocationStep({
  profile,
  taxonomy,
  update,
  onSaved,
}: {
  profile: MyTalentProfile;
  taxonomy: TaxonomyResponse;
  update: ProfileUpdate;
  onSaved: () => void;
}) {
  const { save, errors, pending, formError } = useStepSave(update, onSaved);
  const form = useFocusFirstError(errors);
  const [city, setCity] = useState(profile.city?.slug ?? '');

  return (
    <form
      ref={form}
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        save({ citySlug: city }, city ? {} : { city: t('validation.chooseOne') });
      }}
    >
      <FormMessage tone="error">{formError}</FormMessage>
      <Select
        label={t('onboarding.location.city')}
        placeholder={t('onboarding.location.choose')}
        value={city}
        onChange={(event) => {
          setCity(event.target.value);
        }}
        options={taxonomy.cities.map((entry) => ({ value: entry.slug, label: entry.name }))}
        error={errors['city']}
        autoComplete="address-level2"
        required
      />
      <Button type="submit" loading={pending}>
        {t('onboarding.save')}
      </Button>
    </form>
  );
}

function StoryStep({
  profile,
  update,
  onSaved,
}: {
  profile: MyTalentProfile;
  update: ProfileUpdate;
  onSaved: () => void;
}) {
  const { save, errors, pending, formError } = useStepSave(update, onSaved);
  const form = useFocusFirstError(errors);
  const [bio, setBio] = useState(profile.bio);

  return (
    <form
      ref={form}
      className="stack"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = bio.trim();
        save(
          { bio: trimmed },
          trimmed.length < BIO_MIN_FOR_COMPLETE
            ? { bio: t('onboarding.story.tooShort', { min: BIO_MIN_FOR_COMPLETE }) }
            : {},
        );
      }}
    >
      <FormMessage tone="error">{formError}</FormMessage>
      <TextArea
        label={t('onboarding.story.bio')}
        hint={t('onboarding.story.bioHint', { min: BIO_MIN_FOR_COMPLETE })}
        value={bio}
        maxLength={BIO_MAX}
        onChange={(event) => {
          setBio(event.target.value);
        }}
        error={errors['bio']}
        required
      />
      <Button type="submit" loading={pending}>
        {t('onboarding.save')}
      </Button>
    </form>
  );
}
