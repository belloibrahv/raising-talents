import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { z } from 'zod';
import { useSignIn } from '../../features/auth/use-auth';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Screen } from '../../shared/ui/Screen';
import { TextField } from '../../shared/ui/TextField';

const emailSchema = z.email();

export default function SignIn() {
  const router = useRouter();
  const signIn = useSignIn();
  const passwordRef = useRef<TextInput>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string>();

  const submit = () => {
    const normalised = email.trim().toLowerCase();
    if (!emailSchema.safeParse(normalised).success) {
      setEmailError(t('validation.emailInvalid'));
      return;
    }
    setEmailError(undefined);
    signIn.mutate({ email: normalised, password });
  };

  return (
    <Screen
      footer={
        <>
          <Button
            label={t('signIn.submit')}
            onPress={submit}
            loading={signIn.isPending}
            disabled={!password}
          />
          <Button
            variant="quiet"
            label={t('signIn.noAccount')}
            onPress={() => {
              router.replace('/sign-up');
            }}
          />
        </>
      }
    >
      <AppText variant="title">{t('signIn.title')}</AppText>
      {signIn.error ? <FormMessage tone="error" text={errorMessage(signIn.error)} /> : null}
      <TextField
        label={t('signIn.email')}
        value={email}
        onChangeText={setEmail}
        error={emailError}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('signIn.password')}
        value={password}
        onChangeText={setPassword}
        revealable
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
    </Screen>
  );
}
