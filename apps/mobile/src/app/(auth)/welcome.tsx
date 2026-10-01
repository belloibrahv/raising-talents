import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { t } from '../../i18n';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { Spotlight } from '../../shared/ui/Spotlight';
import { colors, space } from '../../shared/ui/theme';

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen
      backdrop={<Spotlight />}
      footer={
        <>
          <Button
            label={t('welcome.createAccount')}
            onPress={() => {
              router.push('/sign-up');
            }}
          />
          <Button
            variant="quiet"
            label={t('welcome.signIn')}
            onPress={() => {
              router.push('/sign-in');
            }}
          />
        </>
      }
    >
      <AppText variant="heading">Raising Talents</AppText>
      <View style={styles.lead}>
        <AppText variant="display">{t('welcome.headline')}</AppText>
        <AppText color={colors.slate}>{t('welcome.body')}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { flex: 1, justifyContent: 'flex-end', gap: space.lg },
});
