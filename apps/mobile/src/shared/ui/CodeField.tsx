import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from './AppText';
import { colors, fonts, radius, space } from './theme';

interface CodeFieldProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly length: number;
  readonly label: string;
  readonly invalid?: boolean;
  readonly onComplete?: (value: string) => void;
}

/**
 * One real text input drawn as separate boxes. Keeping a single input means
 * paste, the keyboard's code suggestion and screen readers all work normally.
 */
export function CodeField({
  value,
  onChange,
  length,
  label,
  invalid = false,
  onComplete,
}: CodeFieldProps) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const boxes = Array.from({ length }, (_, index) => value[index] ?? '');

  return (
    <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.row}>
      {boxes.map((digit, index) => {
        const active = focused && index === Math.min(value.length, length - 1);
        return (
          <View
            key={index}
            style={[styles.box, active && styles.active, invalid && styles.invalid]}
          >
            <AppText style={styles.digit}>{digit}</AppText>
          </View>
        );
      })}
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, length);
          onChange(digits);
          if (digits.length === length) onComplete?.(digits);
        }}
        onFocus={() => {
          setFocused(true);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        caretHidden
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    maxHeight: 64,
    borderRadius: radius.field,
    backgroundColor: colors.haze,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: { borderColor: colors.ink, backgroundColor: colors.paper },
  invalid: { borderColor: colors.danger },
  digit: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: colors.ink },
  hiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.02,
    color: 'transparent',
  },
});
