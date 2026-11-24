import { useState } from 'react';

import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { Loading } from './loading';

type SyncStatus = {
  configured: boolean;
  connected: boolean;
  calendarName: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  events: number;
};
type SyncResult = { created: number; updated: number; removed: number };

const path = '/api/calendar-sync';

// What the page said when Google sent the browser back from sign-in (see the callback route).
const returned: Record<string, { kind: 'status' | 'alert'; text: string }> = {
  connected: { kind: 'status', text: 'Connected. Your schedule and reviews are syncing' },
  declined: { kind: 'alert', text: 'Google sign-in was cancelled, so nothing was connected' },
  failed: { kind: 'alert', text: 'Connecting to Google did not work. Try again' },
};

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { hour12: false });

// Google Calendar sync (#366): one way, from this app to a "Study log" calendar. Schedule days and
// review due dates become all-day events that move or disappear when the app changes them; nothing is
// read back from Google. `go` opens Google's sign-in page (the browser leaves the app for it).
export function CalendarSync({
  go = (url: string) => window.location.assign(url),
  search = window.location.search,
}: {
  go?: (url: string) => void;
  search?: string;
}) {
  const query = useApiQuery<SyncStatus>(apiKey(path, 'status'), `${path}/status`, { staleTime: 0 });
  const status = query.data;
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; text: string } | undefined>(
    () => returned[new URLSearchParams(search).get('calendar') ?? ''],
  );
  const invalidate = [apiKey(path, 'status')];
  const connect = useApiMutation<{ url: string }>(() => ({ path: `${path}/connect` }));
  const sync = useApiMutation<SyncResult>(() => ({ path: `${path}/sync` }), { invalidate });
  const disconnect = useApiMutation<unknown>(() => ({ path, method: 'DELETE' }), { invalidate });
  const busy = [connect, sync, disconnect].some((mutation) => mutation.isPending);

  const run = async (work: () => Promise<unknown>, done?: (result: never) => string) => {
    setNotice(undefined);
    try {
      const result = await work();
      if (done) setNotice({ kind: 'status', text: done(result as never) });
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as RequestError).message });
      void query.refetch();
    }
  };

  return (
    <section className="card" aria-label="Google Calendar">
      <h2>Google Calendar</h2>
      <p className="status">
        Copies your schedule days and review due dates to a separate “Study log” calendar as all-day
        events. They move or disappear when you change them here. Changes made in Google Calendar
        are not read back.
      </p>
      {query.isError && !status ? (
        <p role="alert" className="error">
          Could not load the sync status: {query.error?.message}
        </p>
      ) : status === undefined ? (
        <Loading label="Loading the sync status" kind="text" />
      ) : !status.configured && !status.connected ? (
        <p className="status">Not set up on the server yet.</p>
      ) : status.connected ? (
        <>
          <p>
            Connected to the “{status.calendarName}” calendar. {status.events} event
            {status.events === 1 ? '' : 's'} on it.{' '}
            {status.lastSyncedAt ? `Last synced ${when(status.lastSyncedAt)}.` : 'Not synced yet.'}
          </p>
          {status.lastError && (
            <p role="alert" className="error">
              The last sync failed: {status.lastError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(
                  () => sync.mutateAsync(),
                  (result: SyncResult) =>
                    `Synced: ${result.created} added, ${result.updated} moved, ${result.removed} removed`,
                )
              }
            >
              Sync now
            </Button>
            <ConfirmDialog
              title="Disconnect Google Calendar?"
              description="The app stops syncing and Google access is revoked. The “Study log” calendar and its events stay in Google; delete them there if you want them gone."
              confirmLabel="Disconnect"
              onConfirm={() =>
                run(
                  () => disconnect.mutateAsync(),
                  () => 'Disconnected',
                )
              }
              trigger={
                <Button type="button" variant="outline" disabled={busy}>
                  Disconnect
                </Button>
              }
            />
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { url } = await connect.mutateAsync();
                go(url);
              })
            }
          >
            Connect Google Calendar
          </Button>
        </div>
      )}
      <p role="status" className="status">
        {notice?.kind === 'status' ? notice.text : ''}
      </p>
      {notice?.kind === 'alert' && (
        <p role="alert" className="error">
          {notice.text}
        </p>
      )}
    </section>
  );
}
