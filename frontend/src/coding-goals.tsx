import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { useBusy } from './busy';
import {
  columnLabel,
  type GoalField,
  goalFieldLabels,
  goalFields,
  type GoalItem,
  type GoalListRow,
  type GoalMapping,
  type GoalPlan,
  type InspectedSheet,
  maxGoalFileBytes,
  type Site,
  siteLabels,
  suggestedListName,
  tierLabel,
} from './coding';
import { CodingGoalList, ProgressBar } from './coding-goal-list';
import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { Input } from './components/ui/input';
import { NativeSelect } from './components/ui/native-select';
import { FileField } from './file-field';
import { type RequestError, requestForm, requestJson } from './lib/api';
import { apiKey, useApiQuery } from './lib/query';
import { ButtonSpinner } from './loading';

export type Notice = { kind: 'status' | 'alert'; text: string } | undefined;
const header = { 'x-requested-with': 'study-log' };
const shownSkipped = 20;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Goal lists (#425): attach an .xlsx file, check which column holds what, see what the import would
// do, then import. Importing the same list again updates it.
export function CodingGoals({
  onChange,
  notify,
  onOpenProblem,
}: {
  onChange?: () => void;
  // Shows a solved problem's attempts in the problem log.
  onOpenProblem: (item: GoalItem) => void;
  // Messages go to the one status line at the top of the Coding screen.
  notify: (notice: Notice) => void;
}) {
  const client = useQueryClient();
  const { busy, action, nameNext, begin, end } = useBusy();
  const setNotice = notify;
  const [file, setFile] = useState<File>();
  const [sheets, setSheets] = useState<InspectedSheet[]>([]);
  const [sheetName, setSheetName] = useState('');
  const [mapping, setMapping] = useState<GoalMapping>({});
  const [name, setName] = useState('');
  const [site, setSite] = useState<Site>('baekjoon');
  const [targetDate, setTargetDate] = useState('');
  const [plan, setPlan] = useState<GoalPlan>();
  const [openList, setOpenList] = useState<number>();

  const lists = useApiQuery<{ lists: GoalListRow[] }>(
    apiKey('/api/coding', 'goals'),
    '/api/coding/goals',
    { staleTime: 0 },
  );
  const sheet = sheets.find((candidate) => candidate.name === sheetName);

  const run = async (label: string, work: () => Promise<void>) => {
    nameNext(label);
    if (!begin()) return;
    setNotice(undefined);
    try {
      await work();
    } catch (failure) {
      setNotice({ kind: 'alert', text: (failure as RequestError).message });
    } finally {
      end();
    }
  };

  const form = (extra: Record<string, string>) => {
    const data = new FormData();
    data.append('file', file as File);
    data.append('sheet', sheetName);
    data.append('name', name);
    data.append('site', site);
    data.append('targetDate', targetDate);
    data.append('mapping', JSON.stringify(mapping));
    for (const [key, value] of Object.entries(extra)) data.append(key, value);
    return data;
  };

  const choose = (picked: InspectedSheet, from: File, count: number) => {
    setSheetName(picked.name);
    setMapping(picked.mapping);
    setName(suggestedListName(from.name, picked.name, count));
    setPlan(undefined);
  };

  const pickFile = async (picked: File | undefined) => {
    setPlan(undefined);
    setSheets([]);
    setFile(undefined);
    if (!picked) return;
    if (picked.size > maxGoalFileBytes)
      return setNotice({ kind: 'alert', text: 'The file must be at most 2 MB' });
    await run('inspect', async () => {
      const data = new FormData();
      data.append('file', picked);
      const read = await requestForm<{ sheets: InspectedSheet[] }>(
        '/api/coding/goals/inspect',
        data,
        { headers: header },
      );
      setFile(picked);
      setSheets(read.sheets);
      // The first sheet whose header names a problem column is the likely list.
      const likely =
        read.sheets.find((s) => s.mapping.key !== undefined || s.mapping.url !== undefined) ??
        read.sheets[0];
      if (likely) choose(likely, picked, read.sheets.length);
    });
  };

  const preview = () =>
    run('preview', async () => {
      const result = await requestForm<{ plan: GoalPlan }>(
        '/api/coding/goals/import',
        form({ dryRun: '1' }),
        { headers: header },
      );
      setPlan(result.plan);
    });

  const importList = () =>
    run('import', async () => {
      const result = await requestForm<{ plan: GoalPlan }>('/api/coding/goals/import', form({}), {
        headers: header,
      });
      const done = result.plan;
      setNotice({
        kind: 'status',
        text:
          `Imported ${name}: ${done.willAdd} added, ${done.willUpdate} updated, ${done.unchanged} unchanged` +
          (done.attemptsToAdd > 0 ? `, ${plural(done.attemptsToAdd, 'attempt')} recorded` : ''),
      });
      setFile(undefined);
      setSheets([]);
      setPlan(undefined);
      await client.invalidateQueries({ queryKey: apiKey('/api/coding') });
      onChange?.();
    });

  const remove = (list: GoalListRow) =>
    run('delete', async () => {
      await requestJson(`/api/coding/goals/${list.id}`, { method: 'DELETE' });
      setNotice({ kind: 'status', text: `Deleted the goal list ${list.name}` });
      await client.invalidateQueries({ queryKey: apiKey('/api/coding') });
    });

  const setColumn = (field: GoalField, value: string) => {
    setPlan(undefined);
    setMapping((current) => {
      const next = { ...current };
      if (value === '') delete next[field];
      else next[field] = Number(value);
      return next;
    });
  };

  const needsKey = mapping.key === undefined && mapping.url === undefined;

  return (
    <section className="card coding-goals" aria-label="Goal lists">
      <h2>Goal lists</h2>
      <p className="status">
        Attach an Excel file (.xlsx, at most 2 MB) of the problems you plan to solve. Importing the
        same list again updates it.
      </p>
      <FileField
        label="Excel file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        file={file}
        disabled={busy}
        onFile={(picked) => void pickFile(picked)}
      />
      {file && sheet && (
        <div className="log-form coding-goal-map">
          {sheets.length > 1 && (
            <label>
              Sheet
              <NativeSelect
                disabled={busy}
                value={sheetName}
                onChange={(event) => {
                  const picked = sheets.find((s) => s.name === event.target.value);
                  if (picked) choose(picked, file, sheets.length);
                }}
              >
                {sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name} ({plural(s.rowCount, 'row')})
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <label>
            List name
            <Input
              maxLength={100}
              disabled={busy}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setPlan(undefined);
              }}
            />
          </label>
          <label>
            Problems are from
            <NativeSelect
              disabled={busy}
              value={site}
              onChange={(event) => {
                setSite(event.target.value as Site);
                setPlan(undefined);
              }}
            >
              {(Object.keys(siteLabels) as Site[]).map((value) => (
                <option key={value} value={value}>
                  {siteLabels[value]}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label>
            Target date for the whole list (optional)
            <Input
              type="date"
              disabled={busy}
              value={targetDate}
              onChange={(event) => {
                setTargetDate(event.target.value);
                setPlan(undefined);
              }}
            />
          </label>
          <fieldset className="wide coding-columns">
            <legend>Which column holds what</legend>
            {goalFields.map((field) => (
              <label key={field}>
                {goalFieldLabels[field]}
                <NativeSelect
                  disabled={busy}
                  value={mapping[field] === undefined ? '' : String(mapping[field])}
                  onChange={(event) => setColumn(field, event.target.value)}
                >
                  <option value="">Not used</option>
                  {sheet.headers.map((text, index) => (
                    <option key={index} value={index}>
                      {columnLabel(index, text)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
          </fieldset>
          <p className="wide status">
            On the first import, rows marked O or △ with a solved date are also added as attempts
            (solved and partly solved). A later import never adds attempts.
          </p>
          {sheet.tooLong && (
            <p className="wide error" role="alert">
              This sheet has more than 2,000 rows. Choose another sheet.
            </p>
          )}
          {needsKey && (
            <p className="wide error" role="alert">
              Choose the column with the problem number or the link.
            </p>
          )}
          <div className="wide actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy || needsKey || sheet.tooLong || !name.trim()}
              onClick={() => void preview()}
            >
              <ButtonSpinner when={action === 'preview'} />
              Preview the import
            </Button>
            <Button
              type="button"
              disabled={busy || !plan || plan.total === 0}
              onClick={() => void importList()}
            >
              <ButtonSpinner when={action === 'import'} />
              Import
            </Button>
          </div>
        </div>
      )}

      {plan && (
        <div className="coding-plan" aria-label="Import preview">
          <p>
            <strong>
              {plan.listExists ? `Updates the list ${name}` : `Creates the list ${name}`}
            </strong>
            : {plural(plan.total, 'problem')} ({plan.willAdd} new, {plan.willUpdate} changed,{' '}
            {plan.unchanged} unchanged). {plan.alreadyLogged} already in your problem log.
            {plan.notInFile > 0 &&
              ` ${plural(plan.notInFile, 'problem')} in the list but not in the file stay.`}
            {plan.attemptsToAdd > 0 &&
              ` ${plural(plan.attemptsToAdd, 'attempt')} will be added from the done marks.`}
          </p>
          {plan.sample.length > 0 && (
            <ul className="log-list">
              {plan.sample.map((item) => (
                <li key={`${item.site}:${item.problemKey}`}>
                  {siteLabels[item.site]} {item.problemKey}: {item.title}
                  {item.level !== null && ` (${tierLabel(item.level)})`}
                  {item.topic && `, ${item.topic}`}
                </li>
              ))}
            </ul>
          )}
          {plan.skipped.length > 0 && (
            <div role="group" aria-label="Rows that will be skipped">
              <p className="error">{plural(plan.skipped.length, 'row')} will be skipped:</p>
              <ul className="log-list">
                {plan.skipped.slice(0, shownSkipped).map((row) => (
                  <li key={row.row}>
                    Row {row.row}: {row.reason}
                  </li>
                ))}
              </ul>
              {plan.skipped.length > shownSkipped && (
                <p className="status">and {plan.skipped.length - shownSkipped} more</p>
              )}
            </div>
          )}
        </div>
      )}

      {lists.error ? (
        <p role="alert" className="error">
          Could not load the goal lists: {lists.error.message}
        </p>
      ) : (
        lists.data &&
        lists.data.lists.length > 0 && (
          <ul className="log-list coding-goal-lists" aria-label="Your goal lists">
            {lists.data.lists.map((list) => (
              <li key={list.id}>
                <div className="log-head">
                  <span>{list.name}</span>
                  <span className="log-date">
                    {plural(list.total, 'problem')}, {list.alreadyLogged} in your log
                    {list.targetDate && `, target ${list.targetDate}`}
                  </span>
                </div>
                <ProgressBar label={list.name} progress={list} />
                {list.next.length > 0 && (
                  <p className="log-memo">
                    Next: {list.next.map((item) => `${item.title} (${item.problemKey})`).join(', ')}
                  </p>
                )}
                <div className="log-actions">
                  <Button
                    type="button"
                    variant="outline"
                    aria-expanded={openList === list.id}
                    aria-label={`${list.name} problems`}
                    onClick={() => setOpenList(openList === list.id ? undefined : list.id)}
                  >
                    {openList === list.id ? 'Hide problems' : 'Problems'}
                  </Button>
                  <ConfirmDialog
                    title="Delete this goal list?"
                    description="The list is removed. Your problems and attempts stay."
                    onConfirm={() => remove(list)}
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        aria-label={`${list.name} delete`}
                      >
                        Delete
                      </Button>
                    }
                  />
                </div>
                {openList === list.id && (
                  <CodingGoalList id={list.id} name={list.name} onOpenProblem={onOpenProblem} />
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
