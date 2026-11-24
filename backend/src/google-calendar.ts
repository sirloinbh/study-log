// A small Google OAuth and Calendar REST client on plain `fetch` (#366, no package). The client
// takes `fetch`, so tests hand in a stand-in. Error messages never hold a token or Google's raw
// answer, only what went wrong.
export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type CalendarEvent = { summary: string; date: string; description: string };

export class GoogleError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'missing' | 'other' = 'other',
  ) {
    super(message);
  }
}

export type GoogleCalendarClient = {
  authUrl: (config: GoogleConfig, state: string) => string;
  // The refresh token a sign-in code stands for.
  exchangeCode: (config: GoogleConfig, code: string) => Promise<string>;
  accessToken: (config: GoogleConfig, refreshToken: string) => Promise<string>;
  revoke: (refreshToken: string) => Promise<void>;
  createCalendar: (access: string, name: string) => Promise<string>;
  insertEvent: (access: string, calendarId: string, event: CalendarEvent) => Promise<string>;
  // 'missing' resolves to false: the event is gone in Google.
  updateEvent: (
    access: string,
    calendarId: string,
    eventId: string,
    event: CalendarEvent,
  ) => Promise<boolean>;
  // An event that is already gone counts as deleted.
  deleteEvent: (access: string, calendarId: string, eventId: string) => Promise<void>;
};

// Only the calendars this app creates, and their events (not the person's other calendars).
export const calendarScope = 'https://www.googleapis.com/auth/calendar.app.created';
const calendarApi = 'https://www.googleapis.com/calendar/v3';
const timeoutMs = 15_000;

const nextDay = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

const eventBody = (event: CalendarEvent) => ({
  summary: event.summary,
  description: event.description,
  start: { date: event.date },
  end: { date: nextDay(event.date) },
  transparency: 'transparent',
  reminders: { useDefault: false },
});

export function googleCalendarClient(fetchImpl: typeof fetch = fetch): GoogleCalendarClient {
  async function call(url: string, init: RequestInit & { headers?: Record<string, string> }) {
    try {
      return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new GoogleError('Could not reach Google. Try again in a moment');
    }
  }
  const json = async (response: Response) => {
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new GoogleError('Google sent an answer this app cannot read');
    }
  };
  const token = async (params: Record<string, string>) => {
    const response = await call('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const body = await json(response);
    if (!response.ok) {
      // invalid_grant: the access was taken back in the Google account, so connecting again is needed.
      if (body.error === 'invalid_grant' || response.status === 400 || response.status === 401)
        throw new GoogleError('Google refused the saved sign-in. Connect again', 'auth');
      throw new GoogleError(`Google did not answer the request (status ${response.status})`);
    }
    return body;
  };
  const api = async (access: string, method: string, path: string, body?: object) => {
    const response = await call(`${calendarApi}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${access}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401)
      throw new GoogleError('Google refused the sign-in. Connect again', 'auth');
    return response;
  };
  const failed = (response: Response) =>
    new GoogleError(
      response.status === 404
        ? 'The Study log calendar was not found in Google. Disconnect and connect again'
        : `Google did not answer the request (status ${response.status})`,
      response.status === 404 ? 'missing' : 'other',
    );

  return {
    authUrl: (config, state) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: calendarScope,
        access_type: 'offline',
        prompt: 'consent',
        state,
      }).toString()}`,
    exchangeCode: async (config, code) => {
      const body = await token({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      });
      if (typeof body.refresh_token !== 'string' || !body.refresh_token)
        throw new GoogleError('Google did not give long-term access. Try connecting again');
      return body.refresh_token;
    },
    accessToken: async (config, refreshToken) => {
      const body = await token({
        refresh_token: refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'refresh_token',
      });
      if (typeof body.access_token !== 'string' || !body.access_token)
        throw new GoogleError('Google sent an answer this app cannot read');
      return body.access_token;
    },
    revoke: async (refreshToken) => {
      // Best effort: the connection is removed here either way.
      await call('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      }).catch(() => undefined);
    },
    createCalendar: async (access, name) => {
      const response = await api(access, 'POST', '/calendars', {
        summary: name,
        timeZone: 'Asia/Seoul',
      });
      if (!response.ok) throw failed(response);
      const id = (await json(response)).id;
      if (typeof id !== 'string' || !id)
        throw new GoogleError('Google sent an answer this app cannot read');
      return id;
    },
    insertEvent: async (access, calendarId, event) => {
      const response = await api(
        access,
        'POST',
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        eventBody(event),
      );
      if (!response.ok) throw failed(response);
      const id = (await json(response)).id;
      if (typeof id !== 'string' || !id)
        throw new GoogleError('Google sent an answer this app cannot read');
      return id;
    },
    updateEvent: async (access, calendarId, eventId, event) => {
      const response = await api(
        access,
        'PUT',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        eventBody(event),
      );
      // Deleted by hand in Google (the event, not the calendar): the caller creates it again.
      if (response.status === 404 || response.status === 410) return false;
      if (!response.ok) throw failed(response);
      return true;
    },
    deleteEvent: async (access, calendarId, eventId) => {
      const response = await api(
        access,
        'DELETE',
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      );
      if (response.ok || response.status === 404 || response.status === 410) return;
      throw failed(response);
    },
  };
}
