import { Text, type TextProps } from 'react-native';
import { colors, type } from './theme';

export type TextVariant = keyof typeof type;

interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  readonly color?: string;
}

export function AppText({ variant = 'body', color = colors.ink, style, ...props }: AppTextProps) {
  const isHeading = variant === 'display' || variant === 'title' || variant === 'heading';
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={isHeading ? 1.4 : 1.8}
      style={[type[variant], { color }, style]}
      {...props}
    />
  );
}
