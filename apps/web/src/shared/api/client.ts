import { API_URL } from '../config';
import { deviceId } from '../device-id';
import { SessionStore } from '../session/session-store';
import { createApi } from './api';
import { WebHttpClient } from './web-http-client';

/** One client, one store and one typed API for the whole app. */
export const http = new WebHttpClient({
  baseUrl: API_URL,
  deviceId: () => deviceId(),
  onSessionEnded: () => {
    session.signedOut({ announce: true });
  },
});

export const session: SessionStore = new SessionStore('rt.session', (signedIn) => {
  // Another tab signed in or out. Re-read the session from the cookie rather than trusting the message.
  if (signedIn) {
    void http.restore().then((me) => {
      if (me) session.signedIn(me);
    });
  } else {
    http.forgetSession();
    session.signedOut();
  }
});

export const api = createApi(http);
