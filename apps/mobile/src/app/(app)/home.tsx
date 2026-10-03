import { StyleSheet, View } from 'react-native';
import { useSession } from '../../features/auth/session-store';
import { useSignOut } from '../../features/auth/use-auth';
import { t } from '../../i18n';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { colors, space } from '../../shared/ui/theme';

/** Holds the place of the first real screen, which milestone 2 replaces with profile setup. */
export default function Home() {
  const me = useSession((state) => state.me);
  const signOut = useSignOut();
  const isAgent = me?.role === 'agent';

  return (
    <Screen
      footer={
        <Button
          variant="secondary"
          label={t('home.signOut')}
          onPress={() => {
            signOut.mutate();
          }}
          loading={signOut.isPending}
        />
      }
    >
      <View style={styles.intro}>
        <AppText variant="title">{isAgent ? t('home.titleAgent') : t('home.titleTalent')}</AppText>
        <AppText color={colors.slate}>
          {isAgent ? t('home.bodyAgent') : t('home.bodyTalent')}
        </AppText>
      </View>
      <AppText variant="small" color={colors.slate}>
        {t('home.signedInAs', { email: me?.email ?? '' })}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
});
