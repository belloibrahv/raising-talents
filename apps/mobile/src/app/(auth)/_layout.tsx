import { Stack } from 'expo-router';
import { colors, fonts } from '../../shared/ui/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitle: '',
        headerBackButtonDisplayMode: 'minimal',
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.paper },
        headerTitleStyle: { fontFamily: fonts.bodySemi },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
