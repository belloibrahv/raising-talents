import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { t } from '../../i18n';
import { AppText } from './AppText';
import { colors, fonts, MIN_TOUCH, radius, space } from './theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | undefined;
  /** Adds a show and hide control for passwords. */
  readonly revealable?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, error, revealable = false, secureTextEntry, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const describedBy = error ?? hint;

  return (
    <View style={styles.wrapper}>
      <AppText variant="label">{label}</AppText>
      <View
        style={[styles.field, focused && styles.focused, error !== undefined && styles.invalid]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={describedBy}
          placeholderTextColor={colors.slate}
          secureTextEntry={revealable ? !revealed : secureTextEntry}
          style={styles.input}
          onFocus={(event) => {
            setFocused(true);
            inputProps.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            inputProps.onBlur?.(event);
          }}
          {...inputProps}
        />
        {revealable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            hitSlop={8}
            onPress={() => {
              setRevealed((value) => !value);
            }}
            style={styles.reveal}
          >
            <AppText variant="label" color={colors.slate}>
              {revealed ? t('common.hide') : t('common.show')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {error !== undefined ? (
        <AppText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint !== undefined ? (
        <AppText variant="small" color={colors.slate}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { gap: space.xs + 2 },
  field: {
    minHeight: MIN_TOUCH + 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.haze,
    borderRadius: radius.field,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focused: { borderColor: colors.ink, backgroundColor: colors.paper },
  invalid: { borderColor: colors.danger },
  input: {
    flex: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
  reveal: { paddingHorizontal: space.lg, minHeight: MIN_TOUCH, justifyContent: 'center' },
});
