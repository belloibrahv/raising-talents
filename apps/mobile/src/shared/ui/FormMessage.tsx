import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, space } from './theme';

interface FormMessageProps {
  readonly tone: 'error' | 'success';
  readonly text: string;
}

/** A message about the whole form. Screen readers announce it as soon as it appears. */
export function FormMessage({ tone, text }: FormMessageProps) {
  const error = tone === 'error';
  return (
    <View
      accessibilityRole={error ? 'alert' : 'text'}
      accessibilityLiveRegion="assertive"
      style={[
        styles.box,
        { backgroundColor: error ? colors.dangerSurface : colors.successSurface },
      ]}
    >
      <AppText variant="small" color={error ? colors.danger : colors.success}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.field, paddingHorizontal: space.lg, paddingVertical: space.md },
});
