import type { SelectableRole } from '@rt/contracts';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useChooseRole } from '../features/auth/use-auth';
import { t } from '../i18n';
import { errorMessage } from '../i18n/error-message';
import { AppText } from '../shared/ui/AppText';
import { Button } from '../shared/ui/Button';
import { FormMessage } from '../shared/ui/FormMessage';
import { RoleOption } from '../shared/ui/RoleOption';
import { Screen } from '../shared/ui/Screen';
import { colors, space } from '../shared/ui/theme';

export default function ChooseRole() {
  const chooseRole = useChooseRole();
  const [role, setRole] = useState<SelectableRole | null>(null);

  return (
    <Screen
      footer={
        <Button
          label={t('chooseRole.submit')}
          onPress={() => {
            if (role) chooseRole.mutate(role);
          }}
          disabled={role === null}
          loading={chooseRole.isPending}
        />
      }
    >
      <View style={styles.intro}>
        <AppText variant="title">{t('chooseRole.title')}</AppText>
        <AppText color={colors.slate}>{t('chooseRole.body')}</AppText>
      </View>
      {chooseRole.error ? <FormMessage tone="error" text={errorMessage(chooseRole.error)} /> : null}
      <View accessibilityRole="radiogroup" style={styles.options}>
        <RoleOption
          title={t('chooseRole.talentTitle')}
          body={t('chooseRole.talentBody')}
          selected={role === 'talent'}
          onPress={() => {
            setRole('talent');
          }}
        />
        <RoleOption
          title={t('chooseRole.agentTitle')}
          body={t('chooseRole.agentBody')}
          selected={role === 'agent'}
          onPress={() => {
            setRole('agent');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  options: { gap: space.md },
});
