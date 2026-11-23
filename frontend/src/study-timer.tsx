import React, { useEffect, useState } from 'react';

import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import type { RequestError } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { Loading } from './loading';
import { formatMinutes } from './study-logs-data';

type StudyTimerState = { startedAt: string; paused: boolean; elapsedSeconds: number };

const timerPath = '/api/study-timer';

// 1:05:09 (hours, minutes, seconds).
function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${Math.floor(whole / 3600)}:${pad(Math.floor(whole / 60) % 60)}:${pad(whole % 60)}`;
}

// Study timer (#360): start when studying begins, pause and resume, stop to save a study log of the
// time studied. The server keeps the timer, so a reload or another tab shows the same time; this only
// counts the seconds since the last answer so the display moves. `onStopped` hears that a study log
// was created, so the lists and reviews can read again.
export function StudyTimer({ onStopped }: { onStopped?: () => void }) {
  const query = useApiQuery<{ timer: StudyTimerState | null }>(apiKey(timerPath), timerPath, {
    staleTime: 0,
  });
  const timer = query.data?.timer;
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ kind: 'status' | 'alert'; text: string }>();

  const running = timer !== undefined && timer !== null && !timer.paused;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, query.dataUpdatedAt]);

  const invalidate = [apiKey(timerPath)];
  const act = (action: string) => ({ path: `${timerPath}/${action}` });
  const start = useApiMutation<unknown>(() => act('start'), { invalidate });
  const pause = useApiMutation<unknown>(() => act('pause'), { invalidate });
  const resume = useApiMutation<unknown>(() => act('resume'), { invalidate });
  const stop = useApiMutation<{ minutes: number }>(() => act('stop'), { invalidate });
  const discard = useApiMutation<unknown>(() => ({ path: timerPath, method: 'DELETE' }), {
    invalidate,
  });
  const busy = [start, pause, resume, stop, discard].some((mutation) => mutation.isPending);

  const run = async (work: () => Promise<unknown>, done?: (result: never) => string) => {
    setNotice(undefined);
    try {
      const result = await work();
      if (done) setNotice({ kind: 'status', text: done(result as never) });
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as RequestError).message });
      // Another tab may have changed the timer: show what the server has now.
      void query.refetch();
    }
  };

  const shown = timer
    ? timer.elapsedSeconds + (timer.paused ? 0 : Math.floor((now - query.dataUpdatedAt) / 1000))
    : 0;

  return (
    <section className="card" aria-label="Study timer">
      <h2>Study timer</h2>
      {query.isError && !timer ? (
        <p role="alert" className="error">
          Could not load the timer: {query.error?.message}
        </p>
      ) : query.data === undefined ? (
        <Loading label="Loading the timer" kind="text" />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {timer ? (
            <>
              <p role="timer" className="m-0 text-[26px] font-semibold tabular-nums">
                {clock(shown)}{' '}
                {timer.paused && (
                  <span className="status ml-2 text-[14px] font-normal">Paused</span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {timer.paused ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => resume.mutateAsync())}
                  >
                    Resume
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void run(() => pause.mutateAsync())}
                  >
                    Pause
                  </Button>
                )}
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () => {
                        const result = await stop.mutateAsync();
                        onStopped?.();
                        return result;
                      },
                      (result: { minutes: number }) =>
                        `Saved a study log of ${formatMinutes(result.minutes)}`,
                    )
                  }
                >
                  Stop and save
                </Button>
                <ConfirmDialog
                  title="Discard the timer?"
                  description="The time so far is thrown away and no study log is created."
                  confirmLabel="Discard"
                  onConfirm={() =>
                    run(
                      () => discard.mutateAsync(),
                      () => 'Discarded the timer',
                    )
                  }
                  trigger={
                    <Button type="button" variant="outline" disabled={busy}>
                      Discard timer
                    </Button>
                  }
                />
              </div>
            </>
          ) : (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(() => start.mutateAsync())}
            >
              Start the timer
            </Button>
          )}
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
