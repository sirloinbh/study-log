import { useState } from 'react';

import { NativeSelect } from './components/ui/native-select';
import type { WrongExercise } from './exercise';
import { apiKey, useApiQuery } from './lib/query';
import { Loading } from './loading';
import type { Textbook } from './textbook';

// Exercises still counted as wrong (#357): the latest attempt was wrong or used a hint. A clean
// correct attempt takes one off the list. Across textbooks, or narrowed to one.
export function WrongExercises() {
  // 0 is every textbook.
  const [textbookId, setTextbookId] = useState(0);
  const books = useApiQuery<{ textbooks: Textbook[] }>(apiKey('/api/textbooks'), '/api/textbooks');
  const url = `/api/exercises/wrong${textbookId ? `?textbookId=${textbookId}` : ''}`;
  const query = useApiQuery<{ exercises: WrongExercise[] }>(apiKey(url), url, { staleTime: 0 });

  const textbooks = books.data?.textbooks ?? [];
  // A textbook deleted elsewhere falls back to all of them.
  const scope = textbooks.some((book) => book.id === textbookId) ? textbookId : 0;
  const exercises = query.data?.exercises;
  const error = query.error?.message;

  return (
    <div className="wrong-exercises">
      <div className="log-form exercise-picker">
        <label className="wide">
          Textbook
          <NativeSelect
            value={scope}
            onChange={(event) => setTextbookId(Number(event.target.value))}
          >
            <option value={0}>All textbooks</option>
            {textbooks.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </NativeSelect>
        </label>
      </div>
      {error && (
        <p role="alert" className="error">
          Could not load the wrong problems: {error}
        </p>
      )}
      {exercises === undefined ? (
        !error && <Loading label="Loading the wrong problems" />
      ) : exercises.length === 0 ? (
        <p className="status">
          No wrong problems. A problem appears here after a wrong or hinted try
        </p>
      ) : (
        <ul className="log-list exercise-list">
          {exercises.map((exercise) => {
            const number = exercise.number.trim()
              ? `Problem ${exercise.number.trim()}`
              : 'Unnumbered problem';
            return (
              <li key={exercise.id}>
                <div className="log-head">
                  <span className="log-date">
                    {exercise.textbookTitle} &gt; {exercise.contentTitle} · {number}
                  </span>
                </div>
                <p className="exercise-body">{exercise.body}</p>
                <p className="status">
                  Last try {exercise.lastAttemptDate}:{' '}
                  {exercise.lastResult === 'correct' ? 'correct' : 'wrong'}
                  {exercise.hintUsed ? ' with a hint' : ''}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
