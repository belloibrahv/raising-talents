import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, MIN_TOUCH, space } from './theme';

interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly error?: string | undefined;
}

export function Checkbox({ checked, onChange, label, error }: CheckboxProps) {
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        onPress={() => {
          onChange(!checked);
        }}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            checked && styles.checked,
            error !== undefined && !checked && styles.invalid,
          ]}
        >
          {checked ? <View style={styles.tick} /> : null}
        </View>
        <AppText variant="small" style={styles.label}>
          {label}
        </AppText>
      </Pressable>
      {error !== undefined ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { backgroundColor: colors.ink },
  invalid: { borderColor: colors.danger },
  tick: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.paper },
  label: { flex: 1 },
});
