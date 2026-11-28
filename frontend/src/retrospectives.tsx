import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';

import { useBusy } from './busy';
import { addDays } from './components/period-nav/periods';
import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { DeleteConfirm } from './delete-confirm';
import { type RequestError, requestJson } from './lib/api';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { ButtonSpinner, Loading } from './loading';
import {
  kindLabels,
  periodTitle,
  type Retrospective,
  type RetrospectiveKind,
  retrospectiveLimit,
  type RetrospectivePeriod,
  shiftPeriod,
} from './retrospective';
import { formatMinutes } from './study-logs-data';
import { StudyPattern } from './study-pattern';

const periodPath = '/api/retrospectives/period';
const recentPath = '/api/retrospectives';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// Weekly and monthly retrospectives (#19): one per period, written next to a summary of that
// period's study, plus the latest ones to open again.
export function Retrospectives({ today }: { today: string }) {
  const [kind, setKind] = useState<RetrospectiveKind>('weekly');
  // Any date inside the shown period.
  const [date, setDate] = useState(today);
  // Unsaved text, tagged with its period (kind and first day) so another period never shows it
  // and coming back to this one does.
  const [draft, setDraft] = useState<{ key: string; text: string }>();
  const [confirming, setConfirming] = useState(false);
  // Bumped after each change so the study pattern reads again.
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<Notice>(undefined);
  const { busy, action, nameNext, begin, end } = useBusy();
  // Along the delete flow, as on the other screens (#65): the confirm button, the delete button
  // after a cancel, the heading once it is gone. Focused once the controls are enabled again.
  const [wantFocus, setWantFocus] = useState<string>();
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  const client = useQueryClient();
  // One cached answer per kind and date, so a slow answer for another period is never shown as this one's.
  const periodQuery = useApiQuery<RetrospectivePeriod>(
    apiKey(periodPath, kind, date),
    `${periodPath}?kind=${kind}&date=${date}`,
  );
  // The recent list failing to load is shown as an error with a retry, never as an empty list.
  const recentQuery = useApiQuery<{ retrospectives: Retrospective[] }>(
    apiKey(recentPath),
    `${recentPath}?limit=20`,
  );
  const period = periodQuery.data;
  const error = periodQuery.error?.message;
  const recent = recentQuery.data?.retrospectives;
  const recentError = recentQuery.error?.message;
  const save = useApiMutation<
    { retrospective: Retrospective },
    { kind: RetrospectiveKind; from: string; body: string }
  >(({ kind: saved, from, body }) => ({
    path: `/api/retrospectives/${saved}/${from}`,
    method: 'PUT',
    body: { body },
  }));
  const del = useApiMutation<unknown, { kind: RetrospectiveKind; from: string }>(
    ({ kind: removed, from }) => ({
      path: `/api/retrospectives/${removed}/${from}`,
      method: 'DELETE',
    }),
  );
  const draftKey = period && `${period.kind}:${period.from}`;
  const text = draft && draft.key === draftKey ? draft.text : (period?.retrospective?.body ?? '');
  const thisPeriod = period && today >= period.from && today <= period.to;

  // The date to open in the other kind: a week's Wednesday, so the month is the one most of the
  // week falls in; for a month, today when it is this month, otherwise its 1st.
  const switchDate = (shown: RetrospectivePeriod) =>
    shown.kind === 'weekly'
      ? addDays(shown.from, 3)
      : today >= shown.from && today <= shown.to
        ? today
        : shown.from;

  const go = (nextKind: RetrospectiveKind, nextDate: string) => {
    setKind(nextKind);
    setDate(nextDate);
    setConfirming(false);
    setNotice(undefined);
  };

  const change = async (request: () => Promise<void>) => {
    if (!period || !begin()) return;
    try {
      await request();
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
    } finally {
      setConfirming(false);
      // The period and the recent list are read again before the controls come back.
      await Promise.all([
        client.invalidateQueries({ queryKey: apiKey(periodPath) }),
        client.invalidateQueries({ queryKey: apiKey(recentPath) }),
      ]);
      setReload((count) => count + 1);
      end();
    }
  };

  const submit = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!period) return;
    nameNext('save');
    void change(async () => {
      const data = await save.mutateAsync({ kind: period.kind, from: period.from, body: text });
      // Show the saved text at once, not the old one until the reload comes back.
      client.setQueryData(apiKey(periodPath, kind, date), {
        ...period,
        retrospective: data.retrospective,
      });
      setDraft(undefined);
      setNotice({ kind: 'status', text: 'Saved' });
    });
  };

  // A draft from Claude (#362) fills the editor and saves nothing. The call can take minutes, so it
  // waits longer than the usual 30 seconds (the server gives up at 4).
  const [replacing, setReplacing] = useState(false);
  const draftWithClaude = async () => {
    if (!period || !draftKey) return;
    nameNext('draft');
    if (!begin()) return;
    setNotice(undefined);
    try {
      const result = await requestJson<{ draft: string }>(
        `/api/retrospectives/${period.kind}/${period.from}/draft`,
        { method: 'POST', body: {}, timeoutMs: 270_000 },
      );
      setDraft({ key: draftKey, text: result.draft });
      setNotice({ kind: 'status', text: 'Draft ready. Edit it, then save' });
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
    } finally {
      end();
    }
  };
  const askDraft = () => (text.trim() ? setReplacing(true) : void draftWithClaude());

  const remove = () =>
    period &&
    change(async () => {
      try {
        await del.mutateAsync({ kind: period.kind, from: period.from });
      } catch (failure) {
        setWantFocus((failure as RequestError).status === 404 ? 'retro-heading' : 'retro-delete');
        throw failure;
      }
      setWantFocus('retro-heading');
      client.setQueryData(apiKey(periodPath, kind, date), { ...period, retrospective: null });
      setDraft(undefined);
      setNotice({ kind: 'status', text: 'Deleted' });
    });

  return (
    <div className="retrospectives">
      <section className="card" aria-label="Write a retrospective">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Retrospective kind">
            {(['weekly', 'monthly'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                variant={value === kind ? 'default' : 'outline'}
                aria-pressed={value === kind}
                disabled={busy}
                onClick={() => go(value, period ? switchDate(period) : date)}
              >
                {kindLabels[value]}
              </Button>
            ))}
          </div>
          <div className="actions">
            <Button
              type="button"
              variant="outline"
              aria-label={kind === 'weekly' ? 'Previous week' : 'Previous month'}
              disabled={busy || !period}
              onClick={() => period && go(kind, shiftPeriod(kind, period.from, -1))}
            >
              Previous
            </Button>
            {period && !thisPeriod && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => go(kind, today)}
              >
                {kind === 'weekly' ? 'This week' : 'This month'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              aria-label={kind === 'weekly' ? 'Next week' : 'Next month'}
              disabled={busy || !period}
              onClick={() => period && go(kind, shiftPeriod(kind, period.from, 1))}
            >
              Next
            </Button>
          </div>
        </div>
        {/* A failed reload keeps the period already shown (and any typing) under the error. */}
        {error && (
          <p role="alert" className="error">
            Could not load the retrospective: {error}
          </p>
        )}
        {!period ? (
          !error && <Loading label="Loading the retrospective" kind="text" />
        ) : (
          <>
            <h2 id="retro-heading" tabIndex={-1}>
              {periodTitle(period.kind, period.from, period.to)} {kindLabels[period.kind]}{' '}
              retrospective
            </h2>
            <dl className="retro-summary" aria-label="Study in this period">
              <div>
                <dt>Study time</dt>
                <dd>{formatMinutes(period.summary.totalMinutes)}</dd>
              </div>
              <div>
                <dt>Study days</dt>
                <dd>{period.summary.studyDays}</dd>
              </div>
              <div>
                <dt>Study logs</dt>
                <dd>{period.summary.logs}</dd>
              </div>
              <div>
                <dt>Goals achieved</dt>
                <dd>
                  {period.summary.goalsChecked
                    ? `${period.summary.goalsAchieved} / ${period.summary.goalsChecked}`
                    : '—'}
                </dd>
              </div>
            </dl>
            <form className="log-form" onSubmit={submit}>
              <label className="wide">
                Retrospective
                <textarea
                  rows={8}
                  required
                  maxLength={retrospectiveLimit}
                  disabled={busy}
                  value={text}
                  onChange={(event) => {
                    setNotice(undefined);
                    if (draftKey) setDraft({ key: draftKey, text: event.target.value });
                  }}
                />
              </label>
              <div className="actions wide">
                <Button type="submit" disabled={busy}>
                  <ButtonSpinner when={action === 'save'} />
                  {period.retrospective ? 'Save changes' : 'Save'}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={askDraft}>
                  <ButtonSpinner when={action === 'draft'} />
                  Draft with Claude
                </Button>
                {period.retrospective && (
                  <>
                    <Button
                      type="button"
                      id="retro-delete"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirming(true)}
                    >
                      Delete
                    </Button>
                    <DeleteConfirm
                      open={confirming}
                      title="Delete this retrospective?"
                      description={`${period.from} to ${period.to}`}
                      onConfirm={() => {
                        nameNext('delete');
                        return remove();
                      }}
                      onCancel={() => {
                        setConfirming(false);
                        setWantFocus('retro-delete');
                      }}
                    />
                  </>
                )}
              </div>
            </form>
            {period.retrospective && (
              <p className="status">Last saved {period.retrospective.updatedAt}</p>
            )}
            <StudyPattern from={period.from} to={period.to} reloadKey={reload} />
          </>
        )}
        <ConfirmDialog
          open={replacing}
          onOpenChange={setReplacing}
          title="Replace the text with a draft?"
          description="What is in the editor now is replaced by a draft from Claude. Nothing is saved until you press save."
          confirmLabel="Replace"
          destructive={false}
          onConfirm={() => draftWithClaude()}
        />
        {/* Always mounted so screen readers announce each new message. */}
        <p role="status" className="status">
          {notice?.kind === 'status' ? notice.text : ''}
        </p>
        {notice?.kind === 'alert' && (
          <p role="alert" className="error">
            {notice.text}
          </p>
        )}
      </section>

      <section className="card" aria-label="Past retrospectives">
        <h2>Past retrospectives</h2>
        {recentError !== undefined && (
          <div role="alert" className="error">
            <p>Could not load the past retrospectives: {recentError}</p>
            <button type="button" onClick={() => void recentQuery.refetch()}>
              Retry loading the past retrospectives
            </button>
          </div>
        )}
        {recent === undefined ? (
          recentError === undefined && <Loading label="Loading the retrospectives" />
        ) : recent.length === 0 ? (
          <p className="status">No retrospectives yet</p>
        ) : (
          <ul className="log-list">
            {recent.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="book-title"
                  disabled={busy}
                  aria-current={
                    item.kind === kind && item.from === period?.from ? 'true' : undefined
                  }
                  onClick={() => go(item.kind, item.from)}
                >
                  {kindLabels[item.kind]} · {periodTitle(item.kind, item.from, item.to)}
                </button>
                <p className="log-memo retro-preview">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
