import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from './theme';

interface ScreenProps {
  readonly children: ReactNode;
  /** Pinned to the bottom, within thumb reach, and lifted above the keyboard. */
  readonly footer?: ReactNode;
  /** Drawn behind the content, for the welcome spotlight. */
  readonly backdrop?: ReactNode;
}

export function Screen({ children, footer, backdrop }: ScreenProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {backdrop}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper, overflow: 'hidden' },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingTop: space.xxl,
    paddingBottom: space.xl,
    gap: space.xl,
  },
  footer: {
    paddingHorizontal: space.xl,
    paddingBottom: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
  },
});
