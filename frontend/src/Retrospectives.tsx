import React, { useEffect, useState } from 'react';
import { useBusy } from './busy';
import { requestJson, type RequestError } from './api';
import {
  kindLabels,
  periodTitle,
  retrospectiveLimit,
  shiftDays,
  shiftPeriod,
  type Retrospective,
  type RetrospectiveKind,
  type RetrospectivePeriod,
} from './retrospective';
import { formatMinutes } from './study-logs';
import { StudyPattern } from './StudyPattern';

type Notice = { kind: 'status' | 'alert'; text: string } | undefined;

// Weekly and monthly retrospectives (#19): one per period, written next to a summary of that
// period's study, plus the latest ones to open again.
export function Retrospectives({ today }: { today: string }) {
  const [kind, setKind] = useState<RetrospectiveKind>('weekly');
  // Any date inside the shown period.
  const [date, setDate] = useState(today);
  // Kept per kind and date, so a slow answer for another period is never shown as this one's.
  const [periods, setPeriods] = useState<Record<string, RetrospectivePeriod>>({});
  const [loadError, setLoadError] = useState<{ key: string; message: string }>();
  // Unsaved text, tagged with its period (kind and first day) so another period never shows it
  // and coming back to this one does.
  const [draft, setDraft] = useState<{ key: string; text: string }>();
  const [confirming, setConfirming] = useState(false);
  const [recent, setRecent] = useState<Retrospective[]>();
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState<Notice>(undefined);
  const { busy, begin, end } = useBusy();
  // Along the delete flow, as on the other screens (#65): the confirm button, the delete button
  // after a cancel, the heading once it is gone. Focused once the controls are enabled again.
  const [wantFocus, setWantFocus] = useState<string>();
  useEffect(() => {
    if (!wantFocus || busy) return;
    setWantFocus(undefined);
    document.getElementById(wantFocus)?.focus?.();
  }, [wantFocus, busy]);

  const key = `${kind}:${date}`;

  useEffect(() => {
    let current = true;
    requestJson<RetrospectivePeriod>(`/api/retrospectives/period?kind=${kind}&date=${date}`)
      .then((data) => {
        if (!current) return;
        setPeriods((all) => ({ ...all, [`${kind}:${date}`]: data }));
        setLoadError((failed) => (failed?.key === `${kind}:${date}` ? undefined : failed));
      })
      .catch(
        (failure: RequestError) =>
          current && setLoadError({ key: `${kind}:${date}`, message: failure.message }),
      );
    return () => {
      current = false;
    };
  }, [kind, date, reload]);

  useEffect(() => {
    let current = true;
    requestJson<{ retrospectives: Retrospective[] }>('/api/retrospectives?limit=20')
      .then((data) => current && setRecent(data.retrospectives))
      .catch(() => current && setRecent([]));
    return () => {
      current = false;
    };
  }, [reload]);

  const period = periods[key];
  const error = loadError?.key === key ? loadError.message : undefined;
  const draftKey = period && `${period.kind}:${period.from}`;
  const text = draft && draft.key === draftKey ? draft.text : (period?.retrospective?.body ?? '');
  const thisPeriod = period && today >= period.from && today <= period.to;

  // The date to open in the other kind: a week's Wednesday, so the month is the one most of the
  // week falls in; for a month, today when it is this month, otherwise its 1st.
  const switchDate = (shown: RetrospectivePeriod) =>
    shown.kind === 'weekly'
      ? shiftDays(shown.from, 3)
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
      setReload((count) => count + 1);
      end();
    }
  };

  const save = (event: { preventDefault(): void }) => {
    event.preventDefault();
    if (!period) return;
    void change(async () => {
      const data = await requestJson<{ retrospective: Retrospective }>(
        `/api/retrospectives/${period.kind}/${period.from}`,
        { method: 'PUT', body: { body: text } },
      );
      // Show the saved text at once, not the old one until the reload comes back.
      setPeriods((all) => ({ ...all, [key]: { ...period, retrospective: data.retrospective } }));
      setDraft(undefined);
      setNotice({ kind: 'status', text: '저장했습니다' });
    });
  };

  const remove = () =>
    period &&
    change(async () => {
      try {
        await requestJson(`/api/retrospectives/${period.kind}/${period.from}`, {
          method: 'DELETE',
        });
      } catch (failure) {
        setWantFocus((failure as RequestError).status === 404 ? 'retro-heading' : 'retro-delete');
        throw failure;
      }
      setWantFocus('retro-heading');
      setPeriods((all) => ({ ...all, [key]: { ...period, retrospective: null } }));
      setDraft(undefined);
      setNotice({ kind: 'status', text: '삭제했습니다' });
    });

  return (
    <div className="retrospectives">
      <section className="card" aria-label="회고 작성">
        <div className="calendar-head">
          <div className="period-filter" role="group" aria-label="회고 종류">
            {(['weekly', 'monthly'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={value === kind ? 'primary' : 'secondary'}
                aria-pressed={value === kind}
                disabled={busy}
                onClick={() => go(value, period ? switchDate(period) : date)}
              >
                {kindLabels[value]}
              </button>
            ))}
          </div>
          <div className="actions">
            <button
              type="button"
              className="secondary"
              aria-label={kind === 'weekly' ? '이전 주' : '이전 달'}
              disabled={busy || !period}
              onClick={() => period && go(kind, shiftPeriod(kind, period.from, -1))}
            >
              이전
            </button>
            {period && !thisPeriod && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => go(kind, today)}
              >
                {kind === 'weekly' ? '이번 주' : '이번 달'}
              </button>
            )}
            <button
              type="button"
              className="secondary"
              aria-label={kind === 'weekly' ? '다음 주' : '다음 달'}
              disabled={busy || !period}
              onClick={() => period && go(kind, shiftPeriod(kind, period.from, 1))}
            >
              다음
            </button>
          </div>
        </div>
        {/* A failed reload keeps the period already shown (and any typing) under the error. */}
        {error && (
          <p role="alert" className="error">
            회고를 불러오지 못했습니다: {error}
          </p>
        )}
        {!period ? (
          !error && (
            <p role="status" className="status">
              불러오는 중…
            </p>
          )
        ) : (
          <>
            <h2 id="retro-heading" tabIndex={-1}>
              {periodTitle(period.kind, period.from, period.to)} {kindLabels[period.kind]} 회고
            </h2>
            <dl className="retro-summary" aria-label="이 기간의 학습">
              <div>
                <dt>학습 시간</dt>
                <dd>{formatMinutes(period.summary.totalMinutes)}</dd>
              </div>
              <div>
                <dt>공부한 날</dt>
                <dd>{period.summary.studyDays}일</dd>
              </div>
              <div>
                <dt>학습 기록</dt>
                <dd>{period.summary.logs}개</dd>
              </div>
              <div>
                <dt>목표 달성</dt>
                <dd>
                  {period.summary.goalsChecked
                    ? `${period.summary.goalsAchieved} / ${period.summary.goalsChecked}`
                    : '—'}
                </dd>
              </div>
            </dl>
            <form className="log-form" onSubmit={save}>
              <label className="wide">
                회고
                <textarea
                  rows={8}
                  required
                  maxLength={retrospectiveLimit}
                  placeholder="잘한 점, 아쉬운 점, 다음에 해 볼 것"
                  disabled={busy}
                  value={text}
                  onChange={(event) => {
                    setNotice(undefined);
                    if (draftKey) setDraft({ key: draftKey, text: event.target.value });
                  }}
                />
              </label>
              <div className="actions wide">
                <button type="submit" className="primary" disabled={busy}>
                  {period.retrospective ? '수정 저장' : '저장'}
                </button>
                {period.retrospective &&
                  (confirming ? (
                    <>
                      <button
                        type="button"
                        id="retro-delete-confirm"
                        className="danger"
                        disabled={busy}
                        onClick={() => void remove()}
                      >
                        삭제 확인
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        onClick={() => {
                          setConfirming(false);
                          setWantFocus('retro-delete');
                        }}
                      >
                        취소
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      id="retro-delete"
                      className="secondary"
                      disabled={busy}
                      onClick={() => {
                        setConfirming(true);
                        setWantFocus('retro-delete-confirm');
                      }}
                    >
                      삭제
                    </button>
                  ))}
              </div>
            </form>
            {period.retrospective && (
              <p className="status">마지막 저장 {period.retrospective.updatedAt}</p>
            )}
            <StudyPattern from={period.from} to={period.to} reloadKey={reload} />
          </>
        )}
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

      <section className="card" aria-label="지난 회고">
        <h2>지난 회고</h2>
        {recent === undefined ? (
          <p className="status">불러오는 중…</p>
        ) : recent.length === 0 ? (
          <p className="status">아직 쓴 회고가 없습니다</p>
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
