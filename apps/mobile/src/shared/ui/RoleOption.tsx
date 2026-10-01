import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, radius, space } from './theme';

interface RoleOptionProps {
  readonly title: string;
  readonly body: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}

/** One answer in a single-choice question. Selection is shown by weight, not colour alone. */
export function RoleOption({ title, body, selected, onPress }: RoleOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}. ${body}`}
      onPress={onPress}
      style={[styles.option, selected && styles.selected]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.dot} /> : null}
      </View>
      <View style={styles.text}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="small" color={colors.slate}>
          {body}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.choice,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  selected: { borderColor: colors.ink, borderWidth: 2.5, padding: space.lg - 1 },
  radio: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.slate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.ink },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink },
  text: { flex: 1, gap: space.xs },
});
