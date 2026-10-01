import { PASSWORD_MIN_LENGTH } from '@rt/contracts';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View, type TextInput } from 'react-native';
import { z } from 'zod';
import { formatDateOfBirthInput, toIsoDate } from '../../features/auth/date-of-birth';
import { fieldErrorsFrom } from '../../features/auth/form-errors';
import { useSignUp } from '../../features/auth/use-auth';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { LAUNCH_COUNTRY_CODE, LEGAL_URLS } from '../../shared/config';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Checkbox';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Screen } from '../../shared/ui/Screen';
import { TextField } from '../../shared/ui/TextField';
import { colors } from '../../shared/ui/theme';

type Field = 'email' | 'password' | 'dateOfBirth' | 'acceptedTerms';

const emailSchema = z.email();

export default function SignUp() {
  const router = useRouter();
  const signUp = useSignUp();
  const passwordRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const submit = () => {
    const normalisedEmail = email.trim().toLowerCase();
    const isoDate = toIsoDate(dateOfBirth);
    const found: Partial<Record<Field, string>> = {};
    if (!emailSchema.safeParse(normalisedEmail).success) found.email = t('validation.emailInvalid');
    if (password.length < PASSWORD_MIN_LENGTH) found.password = t('validation.passwordShort');
    if (!isoDate) found.dateOfBirth = t('validation.dateInvalid');
    if (!acceptedTerms) found.acceptedTerms = t('validation.termsRequired');
    setErrors(found);
    if (Object.keys(found).length > 0 || !isoDate) return;

    signUp.mutate(
      {
        email: normalisedEmail,
        password,
        dateOfBirth: isoDate,
        countryCode: LAUNCH_COUNTRY_CODE,
        acceptedTerms: true,
      },
      {
        onError: (error) => {
          const fromServer = fieldErrorsFrom(error);
          if (isApiError(error, 'UNDER_MINIMUM_AGE')) fromServer.dateOfBirth = errorMessage(error);
          if (isApiError(error, 'WEAK_PASSWORD')) fromServer.password = errorMessage(error);
          setErrors(fromServer);
        },
      },
    );
  };

  // Errors shown against a field are not repeated in the banner.
  const bannerError =
    signUp.error &&
    !isApiError(signUp.error, 'UNDER_MINIMUM_AGE') &&
    !isApiError(signUp.error, 'WEAK_PASSWORD')
      ? errorMessage(signUp.error)
      : undefined;

  return (
    <Screen
      footer={
        <>
          <Button label={t('signUp.submit')} onPress={submit} loading={signUp.isPending} />
          <Button
            variant="quiet"
            label={t('signUp.haveAccount')}
            onPress={() => {
              router.replace('/sign-in');
            }}
          />
        </>
      }
    >
      <View style={styles.intro}>
        <AppText variant="title">{t('signUp.title')}</AppText>
        <AppText color={colors.slate}>{t('signUp.subtitle')}</AppText>
      </View>
      {bannerError ? <FormMessage tone="error" text={bannerError} /> : null}
      <TextField
        label={t('signUp.email')}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('signUp.password')}
        hint={t('signUp.passwordHint')}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        revealable
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => dobRef.current?.focus()}
      />
      <TextField
        ref={dobRef}
        label={t('signUp.dateOfBirth')}
        hint={t('signUp.dateOfBirthHint')}
        placeholder={t('signUp.dateOfBirthPlaceholder')}
        value={dateOfBirth}
        onChangeText={(text) => {
          setDateOfBirth(formatDateOfBirthInput(text));
        }}
        error={errors.dateOfBirth}
        keyboardType="number-pad"
        autoComplete="birthdate-full"
        maxLength={10}
      />
      <View style={styles.terms}>
        <Checkbox
          checked={acceptedTerms}
          onChange={setAcceptedTerms}
          label={t('signUp.terms')}
          error={errors.acceptedTerms}
        />
        <View style={styles.links}>
          <Button
            variant="quiet"
            label={t('signUp.readTerms')}
            onPress={() => {
              void Linking.openURL(LEGAL_URLS.terms);
            }}
          />
          <Button
            variant="quiet"
            label={t('signUp.readGuidelines')}
            onPress={() => {
              void Linking.openURL(LEGAL_URLS.guidelines);
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: 6 },
  terms: { gap: 0 },
  links: { alignItems: 'flex-start' },
});
