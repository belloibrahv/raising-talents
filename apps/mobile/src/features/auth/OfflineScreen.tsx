import { StyleSheet, View } from 'react-native';
import { t } from '../../i18n';
import { AppText } from '../../shared/ui/AppText';
import { Button } from '../../shared/ui/Button';
import { Screen } from '../../shared/ui/Screen';
import { colors, space } from '../../shared/ui/theme';

/** Shown when a saved session could not be checked because there is no connection. */
export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen footer={<Button label={t('common.tryAgain')} onPress={onRetry} />}>
      <View style={styles.body}>
        <AppText variant="title">{t('restore.offlineTitle')}</AppText>
        <AppText color={colors.slate}>{t('restore.offlineBody')}</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: space.sm },
});
