import { Redirect } from 'expo-router';
import { HOME_OF } from '../features/auth/hrefs';
import { areaFor } from '../features/auth/route-for-session';
import { useSession } from '../features/auth/session-store';

/** The launch route. Sends each person to the first screen of their current stage. */
export default function Index() {
  const area = areaFor(
    useSession((state) => state.status),
    useSession((state) => state.me),
  );
  return area ? <Redirect href={HOME_OF[area]} /> : null;
}
