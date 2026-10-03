import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
} from '@expo-google-fonts/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HOME_OF } from '../features/auth/hrefs';
import { areaFor, type AppArea } from '../features/auth/route-for-session';
import { useSession } from '../features/auth/session-store';
import { useRestoreSession } from '../features/auth/use-auth';
import { OfflineScreen } from '../features/auth/OfflineScreen';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: 0 } },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
  });
  const { retry } = useRestoreSession();
  const status = useSession((state) => state.status);
  const me = useSession((state) => state.me);
  const ready = fontsLoaded && status !== 'restoring';

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {status === 'unreachable' ? (
          <OfflineScreen onRetry={retry} />
        ) : (
          <GuardedStack area={areaFor(status, me)} />
        )}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * Screens a person may not see are not mounted at all. When their stage changes
 * (signed in, email verified, role chosen) they are moved to that stage's first screen.
 */
function GuardedStack({ area }: { area: AppArea | null }) {
  const router = useRouter();

  useEffect(() => {
    if (area) router.replace(HOME_OF[area]);
  }, [area, router]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={area === 'auth'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'verifyEmail'}>
        <Stack.Screen name="verify-email" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'chooseRole'}>
        <Stack.Screen name="choose-role" />
      </Stack.Protected>
      <Stack.Protected guard={area === 'app'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
