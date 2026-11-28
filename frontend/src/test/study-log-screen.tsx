import React, { useState } from 'react';

import { StudyHistory } from '../study-history';
import { StudyLogs } from '../study-logs';

// The Study log page and the History page side by side, wired the way the routes wire them
// (study-log-pages.tsx): Edit on a recent log opens the form with it, and saving or cancelling the
// edit ends it. For tests that follow a log from the form to the list and back.
export function StudyLogScreen({ today, onChange }: { today: string; onChange?: () => void }) {
  const [editId, setEditId] = useState<number | undefined>(undefined);
  return (
    <>
      <StudyLogs
        today={today}
        onChange={onChange}
        editId={editId}
        onEditEnd={() => setEditId(undefined)}
      />
      <StudyHistory today={today} onChange={onChange} onEdit={setEditId} />
    </>
  );
}
