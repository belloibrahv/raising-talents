import { VERIFICATION_CODE_LENGTH } from '@rt/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSession } from '../features/auth/session-store';
import { useCountdown } from '../features/auth/use-countdown';
import { useResendCode, useSignOut, useVerifyEmail } from '../features/auth/use-auth';
import { t } from '../i18n';
import { errorMessage } from '../i18n/error-message';
import { ApiError } from '../shared/api/api-error';
import { AppText } from '../shared/ui/AppText';
import { Button } from '../shared/ui/Button';
import { CodeField } from '../shared/ui/CodeField';
import { FormMessage } from '../shared/ui/FormMessage';
import { Screen } from '../shared/ui/Screen';
import { colors, space } from '../shared/ui/theme';

/** Matches the server's resend cooldown. The first code was sent at sign-up. */
const RESEND_COOLDOWN_SECONDS = 60;

export default function VerifyEmail() {
  const email = useSession((state) => state.me?.email ?? '');
  const verify = useVerifyEmail();
  const resend = useResendCode();
  const signOut = useSignOut();
  const [code, setCode] = useState('');
  const [secondsLeft, restartCountdown] = useCountdown(RESEND_COOLDOWN_SECONDS);

  const submit = (value: string) => {
    if (value.length !== VERIFICATION_CODE_LENGTH || verify.isPending) return;
    verify.mutate(value, {
      onError: () => {
        setCode('');
      },
    });
  };

  const requestNewCode = () => {
    verify.reset();
    resend.mutate(undefined, {
      onSuccess: () => {
        restartCountdown(RESEND_COOLDOWN_SECONDS);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.problem.retryAfterSeconds) {
          restartCountdown(error.problem.retryAfterSeconds);
        }
      },
    });
  };

  const message = verify.error
    ? { tone: 'error' as const, text: errorMessage(verify.error) }
    : resend.error
      ? { tone: 'error' as const, text: errorMessage(resend.error) }
      : resend.isSuccess
        ? { tone: 'success' as const, text: t('verifyEmail.resent') }
        : undefined;

  return (
    <Screen
      footer={
        <>
          <Button
            label={t('verifyEmail.submit')}
            onPress={() => {
              submit(code);
            }}
            loading={verify.isPending}
            disabled={code.length !== VERIFICATION_CODE_LENGTH}
          />
          <Button
            variant="quiet"
            label={t('verifyEmail.wrongEmail')}
            onPress={() => {
              signOut.mutate();
            }}
          />
        </>
      }
    >
      <View style={styles.intro}>
        <AppText variant="title">{t('verifyEmail.title')}</AppText>
        <AppText color={colors.slate}>{t('verifyEmail.body', { email })}</AppText>
      </View>
      {message ? <FormMessage tone={message.tone} text={message.text} /> : null}
      <CodeField
        label={t('verifyEmail.codeLabel')}
        length={VERIFICATION_CODE_LENGTH}
        value={code}
        onChange={(value) => {
          if (verify.error) verify.reset();
          setCode(value);
        }}
        onComplete={submit}
        invalid={verify.isError}
      />
      <View style={styles.resend}>
        <Button
          variant="quiet"
          label={
            secondsLeft > 0
              ? t('verifyEmail.resendIn', { seconds: secondsLeft })
              : t('verifyEmail.resend')
          }
          onPress={requestNewCode}
          disabled={secondsLeft > 0}
          loading={resend.isPending}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  resend: { alignItems: 'flex-start' },
});
